import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext(null);

export const useSocketContext = () => {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocketContext must be used within SocketProvider');
  return ctx;
};

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
const COLOR_PALETTE = ['#6366f1', '#ef4444', '#f97316', '#22c55e', '#06b6d4', '#facc15', '#a855f7', '#ec4899', '#0ea5e9'];

const hashToIndex = (value) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % COLOR_PALETTE.length;
};

const pickColor = (id = '', name = '') => {
  const key = String(id ?? '') + '-' + String(name ?? '');
  return COLOR_PALETTE[hashToIndex(key)];
};

const setMembership = (setter, userId, present) => {
  setter((prev) => {
    const next = new Set(prev);
    if (present) next.add(userId);
    else next.delete(userId);
    return next;
  });
};

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState('connecting');
  const [currentUser, setCurrentUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [room, setRoom] = useState('general');
  const [speakingUsers, setSpeakingUsers] = useState(new Set());
  const [videoUsers, setVideoUsers] = useState(new Set());
  const [deafenedUsers, setDeafenedUsers] = useState(new Set());
  const reconnectTimeoutRef = useRef(null);
  const participantsRef = useRef(new Map());
  const pendingJoinRef = useRef(null);
  const selfIdRef = useRef(null);

  const mutateParticipants = useCallback((fn) => {
    fn(participantsRef.current);
    setUsers(Array.from(participantsRef.current.values()));
  }, []);

  const addOrUpdateParticipant = useCallback((payload) => {
    if (!payload || !payload.id) return null;
    let next = null;
    mutateParticipants((map) => {
      const existing = map.get(payload.id) || { id: payload.id };
      const base = {
        id: payload.id,
        username: payload.username ?? existing.username ?? 'Guest',
        color: payload.color ?? existing.color ?? pickColor(payload.id, payload.username ?? existing.username ?? 'Guest'),
        isMuted: payload.isMuted ?? existing.isMuted ?? false,
        videoEnabled: payload.videoEnabled ?? existing.videoEnabled ?? false,
      };
      next = { ...base, ...payload };
      map.set(payload.id, next);
    });
    if (selfIdRef.current === payload.id) setCurrentUser((prev) => ({ ...(prev || {}), ...next }));
    return next;
  }, [mutateParticipants]);

  const removeParticipant = useCallback((userId) => {
    if (!userId) return;
    mutateParticipants((map) => {
      map.delete(userId);
    });
    setMembership(setSpeakingUsers, userId, false);
    setMembership(setVideoUsers, userId, false);
    setMembership(setDeafenedUsers, userId, false);
    if (selfIdRef.current === userId) setCurrentUser(null);
  }, [mutateParticipants]);

  const resetState = useCallback(() => {
    participantsRef.current.clear();
    setUsers([]);
    setCurrentUser(null);
    setSpeakingUsers(new Set());
    setVideoUsers(new Set());
    setDeafenedUsers(new Set());
    setRoom('general');
  }, []);

  const broadcastSignal = useCallback((type, payload = {}) => {
    if (!socket) return;
    const selfId = selfIdRef.current;
    participantsRef.current.forEach((participant, peerId) => {
      if (peerId === selfId) return;
      socket.emit('signal', { target: peerId, type, ...payload });
    });
  }, [socket]);

  const join = useCallback(async ({ username, room: joinRoom = 'general' }) => {
    if (!socket || !isConnected) throw new Error('Not connected to server');
    const trimmedName = (username || '').trim() || 'Guest';
    const roomId = (joinRoom || '').trim() || 'general';
    pendingJoinRef.current = { name: trimmedName, roomId };
    setRoom(roomId);
    console.log('[signaling] join', { roomId, name: trimmedName });
    socket.emit('room:join', { roomId, name: trimmedName });
    const selfId = socket.id || selfIdRef.current;
    if (selfId) {
      selfIdRef.current = selfId;
      const me = addOrUpdateParticipant({ id: selfId, username: trimmedName, isMuted: false, videoEnabled: false });
      setCurrentUser(me);
    }
  }, [socket, isConnected, addOrUpdateParticipant]);

  const leave = useCallback(() => {
    pendingJoinRef.current = null;
    if (socket) socket.emit('room:leave');
    resetState();
  }, [socket, resetState]);

  const emitMicStatus = useCallback((isMuted) => {
    const selfId = selfIdRef.current;
    if (!socket || !selfId) return;
    addOrUpdateParticipant({ id: selfId, isMuted: Boolean(isMuted) });
    broadcastSignal('status', { subtype: 'mic', value: Boolean(isMuted) });
  }, [socket, broadcastSignal, addOrUpdateParticipant]);

  const emitSpeakingStatus = useCallback((isSpeaking) => {
    const selfId = selfIdRef.current;
    if (!socket || !selfId) return;
    setMembership(setSpeakingUsers, selfId, Boolean(isSpeaking));
    broadcastSignal('status', { subtype: 'speaking', value: Boolean(isSpeaking) });
  }, [socket, broadcastSignal]);

  const emitVideoStatus = useCallback((enabled) => {
    const selfId = selfIdRef.current;
    if (!socket || !selfId) return;
    addOrUpdateParticipant({ id: selfId, videoEnabled: Boolean(enabled) });
    setMembership(setVideoUsers, selfId, Boolean(enabled));
    broadcastSignal('status', { subtype: 'video', value: Boolean(enabled) });
  }, [socket, broadcastSignal, addOrUpdateParticipant]);

  const emitDeafenStatus = useCallback((isDeafened) => {
    const selfId = selfIdRef.current;
    if (!socket || !selfId) return;
    setMembership(setDeafenedUsers, selfId, Boolean(isDeafened));
    broadcastSignal('status', { subtype: 'deafen', value: Boolean(isDeafened) });
  }, [socket, broadcastSignal]);

  const sendMessage = useCallback((message) => {
    if (!socket) return;
    socket.emit('chat:send', { text: message });
  }, [socket]);

  const typing = useCallback(() => socket && socket.emit('typing'), [socket]);
  const stopTyping = useCallback(() => socket && socket.emit('stop-typing'), [socket]);

  useEffect(() => {
    const s = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      timeout: 20000,
      forceNew: true,
    });

    const handleConnect = () => {
      selfIdRef.current = s.id;
      setIsConnected(true);
      setConnectionState('connected');
      console.log('[socket] connected', s.id);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      const pending = pendingJoinRef.current;
      if (pending) {
        console.log('[socket] rejoin after reconnect', pending);
        s.emit('room:join', { roomId: pending.roomId, name: pending.name });
      }
    };

    const handleDisconnect = (reason) => {
      setIsConnected(false);
      setConnectionState('disconnected');
      console.log('[socket] disconnected', reason);
      if (reason === 'io server disconnect') {
        reconnectTimeoutRef.current = setTimeout(() => {
          setConnectionState('connecting');
          s.connect();
        }, 3000);
      }
    };

    const handleConnectError = (err) => {
      console.warn('[socket] connect_error', err?.message);
      setIsConnected(false);
      setConnectionState('failed');
    };

    const handleReconnectAttempt = () => setConnectionState('connecting');
    const handleReconnectSuccess = () => setConnectionState('connected');
    const handleReconnectFailed = () => setConnectionState('failed');

    s.on('connect', handleConnect);
    s.on('disconnect', handleDisconnect);
    s.on('connect_error', handleConnectError);
    s.io.on('reconnect_attempt', handleReconnectAttempt);
    s.io.on('reconnect', handleReconnectSuccess);
    s.io.on('reconnect_failed', handleReconnectFailed);
    setSocket(s);

    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      s.off('connect', handleConnect);
      s.off('disconnect', handleDisconnect);
      s.off('connect_error', handleConnectError);
      s.io.off('reconnect_attempt', handleReconnectAttempt);
      s.io.off('reconnect', handleReconnectSuccess);
      s.io.off('reconnect_failed', handleReconnectFailed);
      s.close();
    };
  }, []);

  useEffect(() => {
    if (!socket) return;

    const handleWelcome = (payload) => {
      console.log('[signaling] welcome', payload);
      const { you, peers = [], roomId } = payload || {};
      if (roomId) setRoom(roomId);
      participantsRef.current = new Map();
      setSpeakingUsers(new Set());
      setVideoUsers(new Set());
      setDeafenedUsers(new Set());
      if (you?.id) {
        selfIdRef.current = you.id;
        const me = {
          id: you.id,
          username: you.name || 'You',
          color: pickColor(you.id, you.name || 'You'),
          isMuted: false,
          videoEnabled: false,
        };
        participantsRef.current.set(you.id, me);
        setCurrentUser(me);
      }
      peers.forEach((peer) => {
        if (!peer?.id) return;
        const fallbackName = peer.name || ('Guest ' + (peer.id ? peer.id.slice(-4) : ''));
        const participant = {
          id: peer.id,
          username: fallbackName,
          color: pickColor(peer.id, fallbackName),
          isMuted: false,
          videoEnabled: false,
        };
        participantsRef.current.set(peer.id, participant);
      });
      setUsers(Array.from(participantsRef.current.values()));
    };

    const handlePeerJoined = (peer) => {
      if (!peer?.id) return;
      console.log('[signaling] peer-joined', peer);
      const fallbackName = peer.name || ('Guest ' + (peer.id ? peer.id.slice(-4) : ''));
      addOrUpdateParticipant({
        id: peer.id,
        username: fallbackName,
        videoEnabled: false,
        isMuted: false,
      });
    };

    const handlePeerLeft = (payload) => {
      const peerId = typeof payload === 'string' ? payload : payload?.id;
      if (!peerId) return;
      console.log('[signaling] peer-left', peerId);
      removeParticipant(peerId);
    };

    const handleRoomInfo = (info) => {
      if (info?.roomId) setRoom(info.roomId);
    };

    const handleSignalStatus = (message) => {
      if (!message || message.type !== 'status') return;
      const sender = message.sender;
      if (!sender) return;
      const subtype = message.subtype;
      const value = Boolean(message.value);
      if (subtype === 'mic') {
        addOrUpdateParticipant({ id: sender, isMuted: value });
      } else if (subtype === 'video') {
        addOrUpdateParticipant({ id: sender, videoEnabled: value });
        setMembership(setVideoUsers, sender, value);
      } else if (subtype === 'speaking') {
        setMembership(setSpeakingUsers, sender, value);
      } else if (subtype === 'deafen') {
        setMembership(setDeafenedUsers, sender, value);
      }
    };

    socket.on('welcome', handleWelcome);
    socket.on('peer-joined', handlePeerJoined);
    socket.on('peer-left', handlePeerLeft);
    socket.on('room-info', handleRoomInfo);
    socket.on('signal', handleSignalStatus);

    return () => {
      socket.off('welcome', handleWelcome);
      socket.off('peer-joined', handlePeerJoined);
      socket.off('peer-left', handlePeerLeft);
      socket.off('room-info', handleRoomInfo);
      socket.off('signal', handleSignalStatus);
    };
  }, [socket, addOrUpdateParticipant, removeParticipant]);

  const value = useMemo(() => ({
    socket,
    isConnected,
    connectionState,
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
  }), [
    socket,
    isConnected,
    connectionState,
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
  ]);

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
};
