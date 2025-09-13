import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext(null);

export const useSocketContext = () => {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocketContext must be used within SocketProvider');
  return ctx;
};

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [room, setRoom] = useState('general');
  const [speakingUsers, setSpeakingUsers] = useState(new Set());
  const [videoUsers, setVideoUsers] = useState(new Set());
  const [deafenedUsers, setDeafenedUsers] = useState(new Set());
  const reconnectTimeoutRef = useRef(null);

  // Setup socket connection once
  useEffect(() => {
    const s = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      timeout: 20000,
      forceNew: true
    });

    s.on('connect', () => {
      setIsConnected(true);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    });

    s.on('disconnect', (reason) => {
      setIsConnected(false);
      if (reason === 'io server disconnect') {
        reconnectTimeoutRef.current = setTimeout(() => {
          s.connect();
        }, 3000);
      }
    });

    s.on('connect_error', () => setIsConnected(false));

    setSocket(s);
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      s.close();
    };
  }, []);

  // Event bindings for users and statuses
  useEffect(() => {
    if (!socket) return;

    const onUserJoined = (data) => {
      setCurrentUser(data.user);
      setUsers(data.users);
    };
    const onUserConnected = (user) => setUsers((prev) => [...prev, user]);
    const onUserDisconnected = (userId) => {
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      setSpeakingUsers((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    };
    const onMicStatus = (data) => {
      setUsers((prev) => prev.map((u) => (u.id === data.userId ? { ...u, isMuted: data.isMuted } : u)));
    };
    const onSpeakingStatus = (data) => {
      setSpeakingUsers((prev) => {
        const next = new Set(prev);
        if (data.isSpeaking) next.add(data.userId);
        else next.delete(data.userId);
        return next;
      });
    };

    const onVideoStatus = (data) => {
      setVideoUsers((prev) => {
        const next = new Set(prev);
        if (data.enabled) next.add(data.userId);
        else next.delete(data.userId);
        return next;
      });
      // reflect on users array too
      setUsers((prev) => prev.map((u) => (u.id === data.userId ? { ...u, videoEnabled: data.enabled } : u)));
    };

    const onDeafenStatus = (data) => {
      setDeafenedUsers((prev) => {
        const next = new Set(prev);
        if (data.isDeafened) next.add(data.userId);
        else next.delete(data.userId);
        return next;
      });
    };

    socket.on('user-joined', onUserJoined);
    socket.on('user-connected', onUserConnected);
    socket.on('user-disconnected', onUserDisconnected);
    socket.on('user-mic-status', onMicStatus);
    socket.on('user-speaking-status', onSpeakingStatus);
    socket.on('user-video-status', onVideoStatus);
    socket.on('user-deafen-status', onDeafenStatus);

    return () => {
      socket.off('user-joined', onUserJoined);
      socket.off('user-connected', onUserConnected);
      socket.off('user-disconnected', onUserDisconnected);
      socket.off('user-mic-status', onMicStatus);
      socket.off('user-speaking-status', onSpeakingStatus);
      socket.off('user-video-status', onVideoStatus);
      socket.off('user-deafen-status', onDeafenStatus);
    };
  }, [socket]);

  // Public actions
  const join = useCallback(
    async ({ username, room: joinRoom = 'general' }) => {
      if (!socket || !isConnected) throw new Error('Not connected to server');
      setRoom(joinRoom);
      socket.emit('join', { username, room: joinRoom });
    },
    [socket, isConnected]
  );

  const leave = useCallback(() => {
    if (socket) socket.disconnect();
    setCurrentUser(null);
    setUsers([]);
    setSpeakingUsers(new Set());
  }, [socket]);

  const emitMicStatus = useCallback(
    (isMuted) => socket && socket.emit('mic-status', isMuted),
    [socket]
  );

  const emitSpeakingStatus = useCallback(
    (isSpeaking) => socket && socket.emit('speaking-status', isSpeaking),
    [socket]
  );

  const sendMessage = useCallback(
    (message) => socket && socket.emit('chat-message', { message }),
    [socket]
  );

  const typing = useCallback(() => socket && socket.emit('typing'), [socket]);
  const stopTyping = useCallback(() => socket && socket.emit('stop-typing'), [socket]);

  const emitVideoStatus = useCallback((enabled) => socket && socket.emit('video-status', enabled), [socket]);
  const emitDeafenStatus = useCallback((isDeafened) => socket && socket.emit('deafen-status', isDeafened), [socket]);

  const value = useMemo(
    () => ({
      socket,
      isConnected,
      join,
      leave,
      emitMicStatus,
      emitSpeakingStatus,
      sendMessage,
      typing,
      stopTyping,
      currentUser,
      users,
      room,
      speakingUsers,
      videoUsers,
      deafenedUsers,
      emitVideoStatus,
      emitDeafenStatus,
    }),
    [socket, isConnected, join, leave, emitMicStatus, emitSpeakingStatus, sendMessage, typing, stopTyping, currentUser, users, room, speakingUsers, videoUsers, deafenedUsers, emitVideoStatus, emitDeafenStatus]
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
};
