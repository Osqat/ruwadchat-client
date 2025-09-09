import { useState, useEffect, useRef, useCallback } from 'react';

const usePeerConnection = (socket, localStream) => {
  const [peers, setPeers] = useState(new Map());
  const [remoteStreams, setRemoteStreams] = useState(new Map());
  const peersRef = useRef(new Map());
  const remoteStreamsRef = useRef(new Map());

  // ICE servers configuration
  const iceServers = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };

  const createPeerConnection = useCallback((userId) => {
    const peerConnection = new RTCPeerConnection(iceServers);

    // Add local stream to peer connection
    if (localStream) {
      localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
      });
    }

    // Handle remote stream
    peerConnection.ontrack = (event) => {
      const [remoteStream] = event.streams;
      remoteStreamsRef.current.set(userId, remoteStream);
      setRemoteStreams(new Map(remoteStreamsRef.current));
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('ice-candidate', {
          target: userId,
          candidate: event.candidate
        });
      }
    };

    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
      console.log(`Peer connection state with ${userId}:`, peerConnection.connectionState);
      
      if (peerConnection.connectionState === 'disconnected' || 
          peerConnection.connectionState === 'failed') {
        cleanupPeer(userId);
      }
    };

    peersRef.current.set(userId, peerConnection);
    setPeers(new Map(peersRef.current));

    return peerConnection;
  }, [socket, localStream]);

  const cleanupPeer = useCallback((userId) => {
    const peerConnection = peersRef.current.get(userId);
    if (peerConnection) {
      peerConnection.close();
      peersRef.current.delete(userId);
      setPeers(new Map(peersRef.current));
    }

    if (remoteStreamsRef.current.has(userId)) {
      remoteStreamsRef.current.delete(userId);
      setRemoteStreams(new Map(remoteStreamsRef.current));
    }
  }, []);

  const createOffer = useCallback(async (userId) => {
    try {
      const peerConnection = createPeerConnection(userId);
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      
      socket.emit('offer', {
        target: userId,
        offer: offer
      });
    } catch (error) {
      console.error('Error creating offer:', error);
    }
  }, [createPeerConnection, socket]);

  const handleOffer = useCallback(async (data) => {
    try {
      const peerConnection = createPeerConnection(data.sender);
      await peerConnection.setRemoteDescription(data.offer);
      
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      
      socket.emit('answer', {
        target: data.sender,
        answer: answer
      });
    } catch (error) {
      console.error('Error handling offer:', error);
    }
  }, [createPeerConnection, socket]);

  const handleAnswer = useCallback(async (data) => {
    try {
      const peerConnection = peersRef.current.get(data.sender);
      if (peerConnection) {
        await peerConnection.setRemoteDescription(data.answer);
      }
    } catch (error) {
      console.error('Error handling answer:', error);
    }
  }, []);

  const handleIceCandidate = useCallback(async (data) => {
    try {
      const peerConnection = peersRef.current.get(data.sender);
      if (peerConnection) {
        await peerConnection.addIceCandidate(data.candidate);
      }
    } catch (error) {
      console.error('Error handling ICE candidate:', error);
    }
  }, []);

  const cleanupAllPeers = useCallback(() => {
    peersRef.current.forEach((peerConnection) => {
      peerConnection.close();
    });
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

  return {
    peers,
    remoteStreams,
    createOffer,
    cleanupPeer,
    cleanupAllPeers
  };
};

export default usePeerConnection;
