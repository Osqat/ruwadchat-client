import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useSocketContext } from './SocketProvider.jsx';
import { useMediaContext } from './MediaProvider.jsx';

const PeerContext = createContext(null);

export const usePeerContext = () => {
  const ctx = useContext(PeerContext);
  if (!ctx) throw new Error('usePeerContext must be used within PeerProvider');
  return ctx;
};

const parseTurnConfig = () => {
  const urlsValue = import.meta.env.VITE_TURN_URLS || '';
  const urls = urlsValue
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  const username = import.meta.env.VITE_TURN_USERNAME || '';
  const credential = import.meta.env.VITE_TURN_CREDENTIAL || '';
  const servers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];
  if (urls.length > 0) {
    servers.push({
      urls,
      username: username || undefined,
      credential: credential || undefined,
    });
  }
  return { iceServers: servers };
};

export const PeerProvider = ({ children }) => {
  const { socket, currentUser } = useSocketContext();
  const { localStream } = useMediaContext();

  const [peers, setPeers] = useState(new Map());
  const [remoteStreams, setRemoteStreams] = useState(new Map());

  const peersRef = useRef(new Map());
  const remoteStreamsRef = useRef(new Map());
  const videoSendersRef = useRef(new Map());
  const makingOfferRef = useRef(new Map());
  const politeRef = useRef(new Map());
  const iceQueueRef = useRef(new Map());

  const iceServers = useMemo(() => parseTurnConfig(), []);

  const commitPeerMap = useCallback(() => {
    setPeers(new Map(peersRef.current));
  }, []);

  const commitRemoteStreams = useCallback(() => {
    setRemoteStreams(new Map(remoteStreamsRef.current));
  }, []);

  const determinePolite = useCallback((userId) => {
    if (!userId) return false;
    const referenceId = currentUser?.id || socket?.id || '';
    if (!referenceId) return false;
    const isPolite = referenceId.localeCompare(userId) < 0;
    politeRef.current.set(userId, isPolite);
    return isPolite;
  }, [currentUser, socket]);

  const cleanupPeer = useCallback((userId, reason = 'cleanup') => {
    const pc = peersRef.current.get(userId);
    if (pc) {
      console.log('[rtc] closing peer', { userId, reason });
      try { pc.ontrack = null; } catch (err) { }
      try { pc.onicecandidate = null; } catch (err) { }
      try { pc.onconnectionstatechange = null; } catch (err) { }
      try { pc.close(); } catch (err) { }
      peersRef.current.delete(userId);
      commitPeerMap();
    }
    if (remoteStreamsRef.current.has(userId)) {
      remoteStreamsRef.current.delete(userId);
      commitRemoteStreams();
    }
    videoSendersRef.current.delete(userId);
    makingOfferRef.current.delete(userId);
    politeRef.current.delete(userId);
    iceQueueRef.current.delete(userId);
  }, [commitPeerMap, commitRemoteStreams]);

  const cleanupAllPeers = useCallback(() => {
    Array.from(peersRef.current.keys()).forEach((userId) => cleanupPeer(userId, 'cleanup-all'));
  }, [cleanupPeer]);

  const flushQueuedIce = useCallback(async (userId, pc) => {
    const pending = iceQueueRef.current.get(userId);
    if (!pending || pending.length === 0) return;
    while (pending.length > 0) {
      const candidate = pending.shift();
      try {
        await pc.addIceCandidate(candidate);
        console.log('[signaling] applied queued ice candidate', { from: userId });
      } catch (err) {
        console.error('[rtc] failed to apply queued ice', { from: userId, message: err?.message });
      }
    }
    iceQueueRef.current.delete(userId);
  }, []);

  const sendSignal = useCallback((targetId, payload) => {
    if (!socket || !targetId) return;
    socket.emit('signal', { target: targetId, ...payload });
  }, [socket]);

  const ensurePeerConnection = useCallback((userId) => {
    let pc = peersRef.current.get(userId);
    if (pc) return pc;
    console.log('[rtc] create RTCPeerConnection', { userId });
    pc = new RTCPeerConnection(iceServers);

    if (localStream) {
      localStream.getTracks().forEach((track) => {
        try {
          pc.addTrack(track, localStream);
        } catch (err) {
          console.error('[rtc] addTrack error', { userId, kind: track.kind, message: err?.message });
        }
      });
    }

    pc.onnegotiationneeded = () => {
      console.log('[rtc] negotiationneeded', { userId });
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('[signaling] send ice', { to: userId });
        sendSignal(userId, { type: 'ice-candidate', candidate: event.candidate });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('[rtc] connection state', { userId, state: pc.connectionState });
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        cleanupPeer(userId, pc.connectionState);
      }
      if (pc.connectionState === 'disconnected') {
        console.warn('[rtc] peer disconnected', { userId });
      }
    };

    pc.ontrack = (event) => {
      const [stream] = event.streams;
      console.log('[rtc] ontrack', { userId, kind: event.track?.kind });
      if (stream) {
        remoteStreamsRef.current.set(userId, stream);
        commitRemoteStreams();
      }
    };

    peersRef.current.set(userId, pc);
    commitPeerMap();
    if (!politeRef.current.has(userId)) determinePolite(userId);
    return pc;
  }, [cleanupPeer, commitPeerMap, commitRemoteStreams, determinePolite, iceServers, localStream, sendSignal]);

  useEffect(() => {
    if (!localStream) return;
    peersRef.current.forEach((pc, userId) => {
      const existing = new Set(
        pc
          .getSenders()
          .filter((sender) => sender.track)
          .map((sender) => sender.track.id),
      );
      localStream.getTracks().forEach((track) => {
        if (existing.has(track.id)) return;
        try {
          pc.addTrack(track, localStream);
          console.log('[rtc] sync local track to peer', { userId, kind: track.kind });
        } catch (err) {
          console.error('[rtc] sync track failed', { userId, message: err?.message });
        }
      });
    });
  }, [localStream]);

  const startOfferForPeer = useCallback(async (userId) => {
    if (!userId || !socket) return;
    const pc = ensurePeerConnection(userId);
    determinePolite(userId);
    if (makingOfferRef.current.get(userId)) return;
    makingOfferRef.current.set(userId, true);
    try {
      console.log('[signaling] create offer', { to: userId });
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      console.log('[signaling] send offer', { to: userId, sdpType: offer.type });
      sendSignal(userId, { type: 'offer', description: { type: offer.type, sdp: offer.sdp } });
    } catch (err) {
      console.error('[rtc] failed to create offer', { to: userId, message: err?.message });
    } finally {
      makingOfferRef.current.set(userId, false);
    }
  }, [ensurePeerConnection, determinePolite, sendSignal, socket]);

  const handleOffer = useCallback(async (message) => {
    const sender = message?.sender;
    const description = message?.description;
    if (!sender || !description) return;
    const pc = ensurePeerConnection(sender);
    const polite = politeRef.current.get(sender) ?? determinePolite(sender);
    const offer = new RTCSessionDescription(description);
    const readyForOffer = pc.signalingState === 'stable';
    const offerCollision = !readyForOffer;

    if (offerCollision && !polite) {
      console.warn('[signaling] ignored offer due to glare', { from: sender });
      return;
    }

    try {
      if (offerCollision && polite) {
        console.log('[signaling] rolling back before applying offer', { from: sender });
        try {
          await pc.setLocalDescription({ type: 'rollback' });
        } catch (err) {
          console.warn('[rtc] rollback not supported', { from: sender, message: err?.message });
        }
      }
      await pc.setRemoteDescription(offer);
      console.log('[signaling] received offer', { from: sender, sdpType: offer.type });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      console.log('[signaling] send answer', { to: sender, sdpType: answer.type });
      sendSignal(sender, { type: 'answer', description: { type: answer.type, sdp: answer.sdp } });
      await flushQueuedIce(sender, pc);
    } catch (err) {
      console.error('[rtc] error handling offer', { from: sender, message: err?.message });
    }
  }, [determinePolite, ensurePeerConnection, flushQueuedIce, sendSignal]);

  const handleAnswer = useCallback(async (message) => {
    const sender = message?.sender;
    const description = message?.description;
    if (!sender || !description) return;
    const pc = peersRef.current.get(sender);
    if (!pc) {
      console.warn('[rtc] missing peer for answer', { from: sender });
      return;
    }
    try {
      const answer = new RTCSessionDescription(description);
      await pc.setRemoteDescription(answer);
      console.log('[signaling] received answer', { from: sender, sdpType: answer.type });
      await flushQueuedIce(sender, pc);
    } catch (err) {
      console.error('[rtc] error handling answer', { from: sender, message: err?.message });
    }
  }, [flushQueuedIce]);

  const handleIceCandidate = useCallback(async (message) => {
    const sender = message?.sender;
    const candidate = message?.candidate;
    if (!sender) return;
    const pc = ensurePeerConnection(sender);
    if (!candidate) {
      try {
        await pc.addIceCandidate(null);
      } catch (err) {
        console.error('[rtc] error adding null candidate', { from: sender, message: err?.message });
      }
      return;
    }
    if (pc.remoteDescription) {
      try {
        await pc.addIceCandidate(candidate);
        console.log('[signaling] received ice', { from: sender });
      } catch (err) {
        console.error('[rtc] addIceCandidate error', { from: sender, message: err?.message });
      }
    } else {
      const queue = iceQueueRef.current.get(sender) || [];
      queue.push(candidate);
      iceQueueRef.current.set(sender, queue);
      console.log('[signaling] queued ice candidate', { from: sender });
    }
  }, [ensurePeerConnection]);

  const enableLocalVideoForPeers = useCallback(async (videoTrack) => {
    if (!videoTrack) return;
    peersRef.current.forEach((pc, userId) => {
      const sender = pc.getSenders().find((item) => item.track && item.track.kind === 'video');
      if (sender) {
        sender.replaceTrack(videoTrack).catch(() => {});
      } else if (localStream) {
        try {
          const newSender = pc.addTrack(videoTrack, localStream);
          const existing = videoSendersRef.current.get(userId) || [];
          videoSendersRef.current.set(userId, existing.concat(newSender));
        } catch (err) {
          console.error('[rtc] add video track failed', { userId, message: err?.message });
        }
      }
    });
  }, [localStream]);

  const disableLocalVideoForPeers = useCallback(() => {
    peersRef.current.forEach((pc, userId) => {
      const senders = pc.getSenders().filter((item) => item.track && item.track.kind === 'video');
      senders.forEach((sender) => {
        try { sender.replaceTrack(null); } catch (err) { }
        try { pc.removeTrack(sender); } catch (err) { }
      });
      videoSendersRef.current.set(userId, []);
    });
  }, []);

  const renegotiateWithAll = useCallback(async () => {
    const targets = Array.from(peersRef.current.keys());
    await Promise.all(targets.map((userId) => startOfferForPeer(userId)));
  }, [startOfferForPeer]);

  useEffect(() => {
    if (!socket) return;

    const handleWelcome = (payload) => {
      const peersList = (payload && payload.peers) || [];
      console.log('[signaling] welcome peers', { count: peersList.length });
      peersList.forEach((peer) => {
        if (!peer || !peer.id) return;
        startOfferForPeer(peer.id);
      });
    };

    const handlePeerJoined = (peer) => {
      console.log('[signaling] peer-joined event', peer);
      // new peer will initiate offers from its welcome event
    };

    const handlePeerLeft = (payload) => {
      const peerId = typeof payload === 'string' ? payload : payload && payload.id;
      if (!peerId) return;
      cleanupPeer(peerId, 'peer-left');
    };

    const handleSignalMessage = (message) => {
      if (!message || !message.type) return;
      if (message.type === 'offer') {
        handleOffer(message);
      } else if (message.type === 'answer') {
        handleAnswer(message);
      } else if (message.type === 'ice-candidate') {
        handleIceCandidate(message);
      }
    };

    socket.on('welcome', handleWelcome);
    socket.on('peer-joined', handlePeerJoined);
    socket.on('peer-left', handlePeerLeft);
    socket.on('signal', handleSignalMessage);

    return () => {
      socket.off('welcome', handleWelcome);
      socket.off('peer-joined', handlePeerJoined);
      socket.off('peer-left', handlePeerLeft);
      socket.off('signal', handleSignalMessage);
    };
  }, [socket, startOfferForPeer, cleanupPeer, handleOffer, handleAnswer, handleIceCandidate]);

  useEffect(() => () => cleanupAllPeers(), [cleanupAllPeers]);

  const value = useMemo(() => ({
    peers,
    remoteStreams,
    createOffer: startOfferForPeer,
    cleanupPeer,
    cleanupAllPeers,
    enableLocalVideoForPeers,
    disableLocalVideoForPeers,
    renegotiateWithAll,
  }), [peers, remoteStreams, startOfferForPeer, cleanupPeer, cleanupAllPeers, enableLocalVideoForPeers, disableLocalVideoForPeers, renegotiateWithAll]);

  return <PeerContext.Provider value={value}>{children}</PeerContext.Provider>;
};
