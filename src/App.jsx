import React from 'react';
import JoinScreen from './components/JoinScreen';
import StageGrid from './components/StageGrid.jsx';
import MeetControls from './components/MeetControls.jsx';
import { SocketProvider, useSocketContext } from './context/SocketProvider.jsx';
import { MediaProvider, useMediaContext } from './context/MediaProvider.jsx';
import { PeerProvider, usePeerContext } from './context/PeerProvider.jsx';

const AppInner = () => {
  const [hasJoined, setHasJoined] = React.useState(false);
  const [error, setError] = React.useState(null);

  const { isConnected, join, leave, currentUser, users, emitMicStatus, emitSpeakingStatus, speakingUsers, emitVideoStatus } = useSocketContext();
  const { initializeAudio, isMuted, isSpeaking, isDeafened, toggleMute, toggleDeafen, isCameraOn, toggleCamera, disableCamera, isScreenSharing, toggleScreenShare, createAudioElement, attachRemoteStream, removeAudioElement, localStream, audioElements } = useMediaContext();
  const { remoteStreams, cleanupAllPeers, enableLocalVideoForPeers, disableLocalVideoForPeers, renegotiateWithAll } = usePeerContext();
  const previousRemoteIdsRef = React.useRef(new Set());

  const [isChatOpen, setIsChatOpen] = React.useState(false);
  const [isParticipantsOpen, setIsParticipantsOpen] = React.useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);
  const [canShareScreen, setCanShareScreen] = React.useState(() => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) return false;
    return typeof navigator.mediaDevices.getDisplayMedia === 'function';
  });

  React.useEffect(() => {
    if (typeof navigator === 'undefined') return;
    const supported = Boolean(navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === 'function');
    setCanShareScreen(supported);
  }, []);

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
    remoteStreams.forEach((_, userId) => removeAudioElement(userId));
    previousRemoteIdsRef.current = new Set();
    setHasJoined(false);
  }, [leave, cleanupAllPeers, remoteStreams, removeAudioElement]);

  React.useEffect(() => {
    const currentIds = new Set(remoteStreams.keys());
    remoteStreams.forEach((stream, userId) => {
      if (!audioElements.has(userId)) {
        createAudioElement(userId, stream);
      }
      attachRemoteStream(userId, stream);
    });
    previousRemoteIdsRef.current.forEach((userId) => {
      if (!currentIds.has(userId)) {
        removeAudioElement(userId);
      }
    });
    previousRemoteIdsRef.current = currentIds;
  }, [remoteStreams, audioElements, createAudioElement, attachRemoteStream, removeAudioElement]);

  // chat removed

  const handleToggleMute = React.useCallback(() => {
    toggleMute();
    emitMicStatus(!isMuted);
  }, [toggleMute, emitMicStatus, isMuted]);

  const handleToggleDeafen = React.useCallback(() => {
    toggleDeafen();
  }, [toggleDeafen]);

  const handleToggleChat = React.useCallback(() => {
    setIsChatOpen((prev) => !prev);
  }, []);

  const handleToggleParticipants = React.useCallback(() => {
    setIsParticipantsOpen((prev) => !prev);
  }, []);

  const handleToggleSettings = React.useCallback(() => {
    setIsSettingsOpen((prev) => !prev);
  }, []);

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
          <MeetControls
            isMuted={isMuted}
            isCameraOn={isCameraOn}
            isScreenSharing={isScreenSharing}
            isDeafened={isDeafened}
            isChatOpen={isChatOpen}
            isParticipantsOpen={isParticipantsOpen}
            isSettingsOpen={isSettingsOpen}
            canShareScreen={canShareScreen}
            onToggleMute={handleToggleMute}
            onToggleCamera={handleToggleCamera}
            onToggleShare={handleToggleScreenShare}
            onToggleDeafen={handleToggleDeafen}
            onToggleChat={handleToggleChat}
            onToggleParticipants={handleToggleParticipants}
            onToggleSettings={handleToggleSettings}
            onLeave={handleLeave}
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











