import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useSocketContext } from './SocketProvider.jsx';
import { useMediaContext } from './MediaProvider.jsx';

const PeerContext = createContext(null);

export const usePeerContext = () => {
  const ctx = useContext(PeerContext);
  if (!ctx) throw new Error('usePeerContext must be used within PeerProvider');
  return ctx;
};

export const PeerProvider = ({ children }) => {
  const { socket } = useSocketContext();
  const { localStream } = useMediaContext();

  const [peers, setPeers] = useState(new Map());
  const [remoteStreams, setRemoteStreams] = useState(new Map());
  const peersRef = useRef(new Map());
  const remoteStreamsRef = useRef(new Map());
  const videoSendersRef = useRef(new Map()); // userId -> RTCRtpSender[] for video

  const turnUrls = (import.meta.env.VITE_TURN_URLS || '').split(',').map(s => s.trim()).filter(Boolean);
  const turnUsername = import.meta.env.VITE_TURN_USERNAME || '';
  const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL || '';
  const iceServers = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      ...(
        turnUrls.length
          ? [{ urls: turnUrls, username: turnUsername || undefined, credential: turnCredential || undefined }]
          : []
      ),
    ],
  };

  const cleanupPeer = useCallback((userId) => {
    const pc = peersRef.current.get(userId);
    if (pc) {
      pc.close();
      peersRef.current.delete(userId);
      setPeers(new Map(peersRef.current));
    }
    if (remoteStreamsRef.current.has(userId)) {
      remoteStreamsRef.current.delete(userId);
      setRemoteStreams(new Map(remoteStreamsRef.current));
    }
  }, []);

  const createPeerConnection = useCallback(
    (userId) => {
      const pc = new RTCPeerConnection(iceServers);
      // Pre-create transceivers to keep m-lines stable (reduces renegotiation issues)
      try {
        pc.addTransceiver('audio', { direction: 'sendrecv' });
        pc.addTransceiver('video', { direction: 'sendrecv' });
      } catch {}
      if (localStream) localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));
      pc.ontrack = (evt) => {
        const [remote] = evt.streams;
        remoteStreamsRef.current.set(userId, remote);
        setRemoteStreams(new Map(remoteStreamsRef.current));
      };
      pc.onicecandidate = (evt) => {
        if (evt.candidate && socket) {
          socket.emit('ice-candidate', { target: userId, candidate: evt.candidate });
        }
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') cleanupPeer(userId);
      };
      peersRef.current.set(userId, pc);
      setPeers(new Map(peersRef.current));
      return pc;
    },
    [localStream, socket, cleanupPeer]
  );

  const createOffer = useCallback(
    async (userId) => {
      try {
        const existing = peersRef.current.get(userId);
        const pc = existing || createPeerConnection(userId);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket?.emit('offer', { target: userId, offer });
      } catch (e) {
        console.error('Error creating offer:', e);
      }
    },
    [createPeerConnection, socket]
  );

  const handleOffer = useCallback(
    async (data) => {
      try {
        const existing = peersRef.current.get(data.sender);
        const pc = existing || createPeerConnection(data.sender);
        await pc.setRemoteDescription(data.offer);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket?.emit('answer', { target: data.sender, answer });
      } catch (e) {
        console.error('Error handling offer:', e);
      }
    },
    [createPeerConnection, socket]
  );

  const handleAnswer = useCallback(async (data) => {
    const pc = peersRef.current.get(data.sender);
    if (pc) await pc.setRemoteDescription(data.answer);
  }, []);

  const handleIceCandidate = useCallback(async (data) => {
    const pc = peersRef.current.get(data.sender);
    if (pc) await pc.addIceCandidate(data.candidate);
  }, []);

  const cleanupAllPeers = useCallback(() => {
    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();
    remoteStreamsRef.current.clear();
    videoSendersRef.current.clear();
    setPeers(new Map());
    setRemoteStreams(new Map());
  }, []);

  // Enable video by adding track to every peer and renegotiating
  const enableLocalVideoForPeers = useCallback(async (videoTrack) => {
    if (!videoTrack) return;
    peersRef.current.forEach((pc, userId) => {
      // try to reuse an existing video sender
      let sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
      if (sender) {
        sender.replaceTrack(videoTrack).catch(() => {});
      } else {
        sender = pc.addTrack(videoTrack, localStream);
      }
      const arr = videoSendersRef.current.get(userId) || [];
      if (!arr.includes(sender)) videoSendersRef.current.set(userId, [...arr, sender]);
    });
  }, [localStream]);

  // Disable video: remove video senders from every peer
  const disableLocalVideoForPeers = useCallback(() => {
    peersRef.current.forEach((pc, userId) => {
      const senders = pc.getSenders().filter((s) => s.track && s.track.kind === 'video');
      senders.forEach((s) => {
        try { s.replaceTrack(null); } catch {}
      });
      videoSendersRef.current.set(userId, senders);
    });
  }, []);

  // Renegotiate with all peers
  const renegotiateWithAll = useCallback(async () => {
    await Promise.all(Array.from(peersRef.current.keys()).map((uid) => (async () => {
      try {
        const pc = peersRef.current.get(uid);
        if (!pc) return;
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket?.emit('offer', { target: uid, offer });
      } catch (e) {
        console.error('Renegotiate error:', e);
      }
    })()));
  }, [socket]);

  useEffect(() => {
    if (!socket) return;
    socket.on('offer', handleOffer);
    socket.on('answer', handleAnswer);
    socket.on('ice-candidate', handleIceCandidate);
    return () => {
      socket.off('offer', handleOffer);
      socket.off('answer', handleAnswer);
      socket.off('ice-candidate', handleIceCandidate);
    };
  }, [socket, handleOffer, handleAnswer, handleIceCandidate]);

  const value = useMemo(
    () => ({
      peers,
      remoteStreams,
      createOffer,
      cleanupPeer,
      cleanupAllPeers,
      enableLocalVideoForPeers,
      disableLocalVideoForPeers,
      renegotiateWithAll,
    }),
    [peers, remoteStreams, createOffer, cleanupPeer, cleanupAllPeers, enableLocalVideoForPeers, disableLocalVideoForPeers, renegotiateWithAll]
  );

  return <PeerContext.Provider value={value}>{children}</PeerContext.Provider>;
};
