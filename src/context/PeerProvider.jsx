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

  const iceServers = { iceServers: [ { urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' } ] };

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
        const pc = createPeerConnection(userId);
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
        const pc = createPeerConnection(data.sender);
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
    setPeers(new Map());
    setRemoteStreams(new Map());
  }, []);

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
    () => ({ peers, remoteStreams, createOffer, cleanupPeer, cleanupAllPeers }),
    [peers, remoteStreams, createOffer, cleanupPeer, cleanupAllPeers]
  );

  return <PeerContext.Provider value={value}>{children}</PeerContext.Provider>;
};

