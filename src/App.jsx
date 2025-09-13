import { useCallback, useEffect, useMemo, useState } from 'react';
import JoinScreen from './components/JoinScreen';
import ChatPanel from './components/ChatPanel';
import UserSidebar from './components/UserSidebar';
import { SocketProvider, useSocketContext } from './context/SocketProvider.jsx';
import { MediaProvider, useMediaContext } from './context/MediaProvider.jsx';
import { PeerProvider, usePeerContext } from './context/PeerProvider.jsx';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

const AppInner = () => {
  const [hasJoined, setHasJoined] = useState(false);
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState(null);

  const { socket, isConnected, join, leave, currentUser, users, room, emitMicStatus, emitSpeakingStatus, speakingUsers } = useSocketContext();
  const { initializeAudio, isMuted, isSpeaking, toggleMute, createAudioElement, removeAudioElement } = useMediaContext();
  const { remoteStreams, createOffer, cleanupPeer, cleanupAllPeers } = usePeerContext();

  const loadChatHistory = useCallback(async () => {
    try {
      const response = await fetch(`${SERVER_URL}/api/messages?room=${encodeURIComponent(room)}`);
      if (response.ok) {
        const history = await response.json();
        setMessages(Array.isArray(history) ? history : []);
      }
    } catch {
      setMessages([]);
    }
  }, [room]);

  const handleJoin = useCallback(
    async ({ username, room: chosenRoom }) => {
      try {
        setError(null);
        await initializeAudio();
        await join({ username, room: chosenRoom });
        setHasJoined(true);
        await loadChatHistory();
      } catch (e) {
        setError('Failed to access microphone or connect to server. Check permissions and try again.');
        throw e;
      }
    },
    [initializeAudio, join, loadChatHistory]
  );

  const handleLeave = useCallback(() => {
    leave();
    cleanupAllPeers();
    setHasJoined(false);
    setMessages([]);
  }, [leave, cleanupAllPeers]);

  // when new user connects, create a WebRTC offer
  useEffect(() => {
    if (!socket) return;
    const onUserConnected = (user) => createOffer(user.id);
    socket.on('user-connected', onUserConnected);
    return () => socket.off('user-connected', onUserConnected);
  }, [socket, createOffer]);

  // Handle remote streams to audio elements
  useEffect(() => {
    remoteStreams.forEach((stream, userId) => createAudioElement(userId, stream));
  }, [remoteStreams, createAudioElement]);

  // Remove audio and peer on user-disconnected
  useEffect(() => {
    if (!socket) return;
    const onUserDisconnected = (userId) => {
      cleanupPeer(userId);
      removeAudioElement(userId);
    };
    socket.on('user-disconnected', onUserDisconnected);
    return () => socket.off('user-disconnected', onUserDisconnected);
  }, [socket, cleanupPeer, removeAudioElement]);

  // Chat messages from server
  useEffect(() => {
    if (!socket) return;
    const onMessage = (message) => {
      if (message?.username && message?.message) setMessages((prev) => [...prev, message]);
    };
    socket.on('chat-message', onMessage);
    return () => socket.off('chat-message', onMessage);
  }, [socket]);

  // Mic toggle
  const handleToggleMute = useCallback(() => {
    toggleMute();
    emitMicStatus(!isMuted);
  }, [toggleMute, emitMicStatus, isMuted]);

  // Speaking status propagation
  useEffect(() => {
    if (!hasJoined) return;
    emitSpeakingStatus(isSpeaking);
  }, [isSpeaking, emitSpeakingStatus, hasJoined]);

  // UI connection badge
  const ConnectionStatus = useMemo(() => () => {
    if (!hasJoined) return null;
    return (
      <div className={`fixed top-4 right-4 px-3 py-1 rounded text-sm ${isConnected ? 'bg-discord-green' : 'bg-discord-red'} text-white`}>
        {isConnected ? 'Connected' : 'Disconnected'}
      </div>
    );
  }, [hasJoined, isConnected]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-discord-darker">
        <div className="bg-discord-dark p-8 rounded-lg shadow-xl w-full max-w-md text-center">
          <div className="text-discord-red text-4xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-white mb-4">Connection Error</h2>
          <p className="text-discord-light mb-6">{error}</p>
          <button onClick={() => { setError(null); window.location.reload(); }} className="btn-primary">Try Again</button>
        </div>
      </div>
    );
  }

  if (!hasJoined) return <JoinScreen onJoin={handleJoin} />;

  return (
    <div className="h-screen flex bg-discord-darker">
      <ConnectionStatus />
      <UserSidebar
        users={users}
        currentUser={currentUser}
        isMuted={isMuted}
        onToggleMute={handleToggleMute}
        onLeave={handleLeave}
        speakingUsers={speakingUsers}
      />
      <div className="flex-1 hidden md:flex items-center justify-center text-discord-light">
        <div className="text-center p-6 max-w-md">
          <h2 className="text-2xl font-semibold text-white mb-2">Voice Room</h2>
          <p className="mb-4">You’re connected to <span className="font-mono">{room}</span>. Speak to light up your avatar. Use the right panel for text chat.</p>
          <p className="text-sm">On mobile, the chat appears below.</p>
        </div>
      </div>
      <div className="w-full md:w-[420px] border-l border-gray-700">
        <ChatPanel socket={socket} messages={messages} currentUser={currentUser} room={room} onReloadHistory={loadChatHistory} />
      </div>
    </div>
  );
};

function App() {
  return (
    <SocketProvider>
      <MediaProvider>
        <PeerProvider>
          <AppInner />
        </PeerProvider>
      </MediaProvider>
    </SocketProvider>
  );
}

export default App;
