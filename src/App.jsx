import { useState, useEffect, useCallback } from 'react';
import JoinScreen from './components/JoinScreen';
import ChatPanel from './components/ChatPanel';
import UserSidebar from './components/UserSidebar';
import useSocket from './hooks/useSocket';
import useAudio from './hooks/useAudio';
import usePeerConnection from './hooks/usePeerConnection';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

function App() {
  const [hasJoined, setHasJoined] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [speakingUsers, setSpeakingUsers] = useState(new Set());
  const [error, setError] = useState(null);

  const { socket, isConnected } = useSocket(SERVER_URL);
  const { 
    localStream, 
    isMuted, 
    isSpeaking, 
    initializeAudio, 
    toggleMute, 
    createAudioElement, 
    removeAudioElement,
    cleanup: cleanupAudio 
  } = useAudio();
  
  const { 
    remoteStreams, 
    createOffer, 
    cleanupPeer, 
    cleanupAllPeers 
  } = usePeerConnection(socket, localStream);

  // Load chat history
  const loadChatHistory = useCallback(async () => {
    try {
      const response = await fetch(`${SERVER_URL}/api/messages`);
      if (response.ok) {
        const history = await response.json();
        // Ensure history is an array before setting state
        if (Array.isArray(history)) {
          setMessages(history);
        } else {
          setMessages([]);
        }
      }
    } catch (error) {
      console.error('Error loading chat history:', error);
      setMessages([]); // Set to empty array on error
    }
  }, []);

  // Handle joining the chat
  const handleJoin = useCallback(async (username) => {
    try {
      setError(null);
      
      // Initialize audio first
      await initializeAudio();
      
      if (socket && isConnected) {
        socket.emit('join', { username });
      } else {
        throw new Error('Not connected to server');
      }
    } catch (error) {
      console.error('Error joining:', error);
      setError('Failed to access microphone or connect to server. Please check your permissions and try again.');
      throw error;
    }
  }, [socket, isConnected, initializeAudio]);

  // Handle leaving the chat
  const handleLeave = useCallback(() => {
    if (socket) {
      socket.disconnect();
    }
    cleanupAllPeers();
    cleanupAudio();
    setHasJoined(false);
    setCurrentUser(null);
    setUsers([]);
    setMessages([]);
    setSpeakingUsers(new Set());
  }, [socket, cleanupAllPeers, cleanupAudio]);

  // Socket event handlers
  useEffect(() => {
    if (!socket) return;

    // Handle successful join
    socket.on('user-joined', (data) => {
      setCurrentUser(data.user);
      setUsers(data.users);
      setHasJoined(true);
      loadChatHistory();
    });

    // Handle new user connection
    socket.on('user-connected', (user) => {
      setUsers(prev => [...prev, user]);
      // Create WebRTC offer for new user
      createOffer(user.id);
    });

    // Handle user disconnection
    socket.on('user-disconnected', (userId) => {
      setUsers(prev => prev.filter(user => user.id !== userId));
      setSpeakingUsers(prev => {
        const newSet = new Set(prev);
        newSet.delete(userId);
        return newSet;
      });
      cleanupPeer(userId);
      removeAudioElement(userId);
    });

    // Handle chat messages
    socket.on('chat-message', (message) => {
      // Ensure message is valid before adding
      if (message && message.username && message.message) {
        setMessages(prev => [...prev, message]);
      }
    });

    // Handle mic status updates
    socket.on('user-mic-status', (data) => {
      setUsers(prev => prev.map(user => 
        user.id === data.userId 
          ? { ...user, isMuted: data.isMuted }
          : user
      ));
    });

    // Handle speaking status updates
    socket.on('user-speaking-status', (data) => {
      setSpeakingUsers(prev => {
        const newSet = new Set(prev);
        if (data.isSpeaking) {
          newSet.add(data.userId);
        } else {
          newSet.delete(data.userId);
        }
        return newSet;
      });
    });

    return () => {
      socket.off('user-joined');
      socket.off('user-connected');
      socket.off('user-disconnected');
      socket.off('chat-message');
      socket.off('user-mic-status');
      socket.off('user-speaking-status');
    };
  }, [socket, createOffer, cleanupPeer, removeAudioElement, loadChatHistory]);

  // Handle mic toggle
  const handleToggleMute = useCallback(() => {
    toggleMute();
    if (socket) {
      socket.emit('mic-status', !isMuted);
    }
  }, [toggleMute, socket, isMuted]);

  // Handle speaking status
  useEffect(() => {
    if (socket && hasJoined) {
      socket.emit('speaking-status', isSpeaking);
      
      setSpeakingUsers(prev => {
        const newSet = new Set(prev);
        if (isSpeaking && currentUser) {
          newSet.add(currentUser.id);
        } else if (currentUser) {
          newSet.delete(currentUser.id);
        }
        return newSet;
      });
    }
  }, [isSpeaking, socket, hasJoined, currentUser]);

  // Handle remote streams
  useEffect(() => {
    remoteStreams.forEach((stream, userId) => {
      createAudioElement(userId, stream);
    });
  }, [remoteStreams, createAudioElement]);

  // Connection status indicator
  const ConnectionStatus = () => {
    if (!hasJoined) return null;
    
    return (
      <div className={`fixed top-4 right-4 px-3 py-1 rounded text-sm ${
        isConnected 
          ? 'bg-discord-green text-white' 
          : 'bg-discord-red text-white'
      }`}>
        {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
      </div>
    );
  };

  // Error display
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-discord-darker">
        <div className="bg-discord-dark p-8 rounded-lg shadow-xl w-full max-w-md text-center">
          <div className="text-discord-red text-4xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-white mb-4">Connection Error</h2>
          <p className="text-discord-light mb-6">{error}</p>
          <button
            onClick={() => {
              setError(null);
              window.location.reload();
            }}
            className="btn-primary"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!hasJoined) {
    return <JoinScreen onJoin={handleJoin} />;
  }

  return (
    <div className="h-screen flex bg-discord-darker">
      <ConnectionStatus />
      
      {/* User Sidebar */}
      <UserSidebar
        users={users}
        currentUser={currentUser}
        isMuted={isMuted}
        onToggleMute={handleToggleMute}
        onLeave={handleLeave}
        speakingUsers={speakingUsers}
      />
      
      {/* Chat Panel */}
      <div className="flex-1">
        <ChatPanel
          socket={socket}
          messages={messages}
          currentUser={currentUser}
        />
      </div>
    </div>
  );
}

export default App;