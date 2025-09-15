import React from 'react';
import JoinScreen from './components/JoinScreen';
import StageGrid from './components/StageGrid.jsx';
import MobileControls from './components/MobileControls.jsx';
import MeetControls from './components/MeetControls.jsx';
import { SocketProvider, useSocketContext } from './context/SocketProvider.jsx';
import { MediaProvider, useMediaContext } from './context/MediaProvider.jsx';
import { PeerProvider, usePeerContext } from './context/PeerProvider.jsx';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

const AppInner = () => {
  const [hasJoined, setHasJoined] = React.useState(false);
  const [error, setError] = React.useState(null);

  const { socket, isConnected, join, leave, currentUser, users, room, emitMicStatus, emitSpeakingStatus, speakingUsers, emitVideoStatus } = useSocketContext();
  const { initializeAudio, isMuted, isSpeaking, toggleMute, isCameraOn, toggleCamera, disableCamera, isScreenSharing, toggleScreenShare, createAudioElement, attachRemoteStream, removeAudioElement, localStream } = useMediaContext();
  const { remoteStreams, createOffer, cleanupPeer, cleanupAllPeers, enableLocalVideoForPeers, disableLocalVideoForPeers, renegotiateWithAll } = usePeerContext();

  const handleJoin = React.useCallback(async ({ username, room: chosenRoom }) => {
    try {
      setError(null);
      await initializeAudio();
      await join({ username, room: chosenRoom });
      setHasJoined(true);
    } catch (e) {
      setError('Failed to access microphone or connect to server. Check permissions and try again.');
      throw e;
    }
  }, [initializeAudio, join]);

  const handleLeave = React.useCallback(() => {
    leave();
    cleanupAllPeers();
    setHasJoined(false);
  }, [leave, cleanupAllPeers]);

  React.useEffect(() => {
    if (!socket) return;
    const onUserConnected = (user) => createOffer(user.id);
    socket.on('user-connected', onUserConnected);
    return () => socket.off('user-connected', onUserConnected);
  }, [socket, createOffer]);

  React.useEffect(() => {
    remoteStreams.forEach((stream, userId) => {
      createAudioElement(userId, stream);
      attachRemoteStream(userId, stream);
    });
  }, [remoteStreams, createAudioElement, attachRemoteStream]);

  React.useEffect(() => {
    if (!socket) return;
    const onUserDisconnected = (userId) => {
      cleanupPeer(userId);
      removeAudioElement(userId);
    };
    socket.on('user-disconnected', onUserDisconnected);
    return () => socket.off('user-disconnected', onUserDisconnected);
  }, [socket, cleanupPeer, removeAudioElement]);

  // chat removed

  const handleToggleMute = React.useCallback(() => {
    toggleMute();
    emitMicStatus(!isMuted);
  }, [toggleMute, emitMicStatus, isMuted]);


  const handleToggleCamera = React.useCallback(async () => {
    if (isCameraOn) {
      try { await disableCamera(); } catch {}
      disableLocalVideoForPeers();
      await renegotiateWithAll();
      emitVideoStatus(false);
    } else {
      const track = await toggleCamera();
      if (track) {
        await enableLocalVideoForPeers(track);
        await renegotiateWithAll();
        emitVideoStatus(true);
      }
    }
  }, [isCameraOn, toggleCamera, disableCamera, enableLocalVideoForPeers, disableLocalVideoForPeers, renegotiateWithAll, emitVideoStatus]);

  const handleToggleScreenShare = React.useCallback(async () => {
    if (isScreenSharing) {
      try { await toggleScreenShare(); } catch {}
      disableLocalVideoForPeers();
      await renegotiateWithAll();
      emitVideoStatus(false);
    } else {
      const track = await toggleScreenShare();
      if (track) {
        await enableLocalVideoForPeers(track);
        await renegotiateWithAll();
        emitVideoStatus(true);
      }
    }
  }, [isScreenSharing, toggleScreenShare, enableLocalVideoForPeers, disableLocalVideoForPeers, renegotiateWithAll, emitVideoStatus]);

  React.useEffect(() => {
    if (!hasJoined) return;
    emitSpeakingStatus(isSpeaking);
  }, [isSpeaking, emitSpeakingStatus, hasJoined]);

  const ConnectionStatus = React.useMemo(() => () => {
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
    <div className="h-screen flex bg-surface flex-col">
      <ConnectionStatus />
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="text-white font-semibold tracking-tight">Not Google Meet</div>
        <div className="text-muted text-xs">Voice channel</div>
      </div>
      <div className="flex-1 relative flex">
        <div className="flex-1 overflow-hidden">
          <StageGrid
            users={users}
            currentUser={currentUser}
            remoteStreams={remoteStreams}
            localStream={localStream}
            speakingUsers={speakingUsers}
            localSpeaking={isSpeaking}
          />
          <div className="hidden md:block">
            <MeetControls
              isMuted={isMuted}
              onToggleMute={handleToggleMute}
              onLeave={handleLeave}
              isSharing={isScreenSharing}
              onToggleShare={handleToggleScreenShare}
            />
          </div>
          <MobileControls
            isMuted={isMuted}
            onToggleMute={handleToggleMute}
            isCameraOn={isCameraOn}
            onToggleCamera={handleToggleCamera}
            isScreenSharing={isScreenSharing}
          />
        </div>
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











