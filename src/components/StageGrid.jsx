import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMediaContext } from '../context/MediaProvider.jsx';

// StageGrid: interactive participants area (video/avatars),
// responsive tile sizing, speaking ring, and click interactions.
export default function StageGrid({
  users = [],
  currentUser,
  remoteStreams = new Map(),
  localStream,
  speakingUsers = new Set(),
  localSpeaking = false,
}) {
  const { setRemoteGain } = useMediaContext();
  const [fullscreenUserId, setFullscreenUserId] = useState(null);
  // Precompute a lookup of userId -> media stream
  const streamByUserId = useMemo(() => {
    const m = new Map(remoteStreams);
    if (currentUser?.id && localStream) {
      m.set(currentUser.id, localStream);
    }
    return m;
  }, [remoteStreams, localStream, currentUser]);

  // Dynamic classes for tile depending on count
  const count = users.length;
  const gridClass = 'grid gap-3 auto-grid p-3';

  const tileSizeClass = useMemo(() => {
    if (count <= 2) return 'h-64';
    if (count <= 4) return 'h-56';
    if (count <= 6) return 'h-48';
    if (count <= 9) return 'h-44';
    return 'h-40';
  }, [count]);

  const isSpeakingUser = (userId) => {
    if (!userId) return false;
    if (currentUser?.id === userId && localSpeaking) return true;
    return speakingUsers.has(userId);
  };

  return (
    <div className={gridClass}>
      {users.map((u) => {
        const stream = streamByUserId.get(u.id);
        const isSpeaking = isSpeakingUser(u.id);
        const hasVideo = !!stream && stream.getVideoTracks && stream.getVideoTracks().length > 0;
        const isCurrent = currentUser?.id === u.id;
        return (
          <StageTile
            key={u.id}
            user={u}
            stream={stream}
            hasVideo={hasVideo}
            isSpeaking={isSpeaking}
            sizeClass={tileSizeClass}
            isCurrent={isCurrent}
            onVolume={(v) => !isCurrent && setRemoteGain(u.id, v)}
            onClick={() => hasVideo && setFullscreenUserId(u.id)}
          />
        );
      })}
      <FullscreenOverlay
        users={users}
        currentUser={currentUser}
        fullscreenUserId={fullscreenUserId}
        setFullscreenUserId={setFullscreenUserId}
        remoteStreams={remoteStreams}
        localStream={localStream}
      />
    </div>
  );
}

function StageTile({ user, stream, hasVideo, isSpeaking, sizeClass, isCurrent, onVolume, onClick }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && hasVideo) {
      if (videoRef.current.srcObject !== stream) {
        videoRef.current.srcObject = stream;
      }
      const v = videoRef.current;
      const play = () => v.play().catch(() => {});
      v.addEventListener('loadedmetadata', play);
      play();
      return () => v.removeEventListener('loadedmetadata', play);
    }
  }, [stream, hasVideo]);

  return (
    <div
      className={`group relative rounded-lg bg-surface-2 border border-border shadow-sm overflow-hidden ${
        hasVideo ? 'cursor-pointer' : 'cursor-default'
      } select-none ${isSpeaking ? 'ring-2 ring-accent/70' : ''} ${sizeClass}`}
      onClick={onClick}
      title={user.username}
    >
      {hasVideo ? (
        <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline autoPlay muted />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center text-white text-xl font-semibold"
            style={{ backgroundColor: user.color || '#4b5563' }}
          >
            {user.username?.charAt(0)?.toUpperCase()}
          </div>
        </div>
      )}
      {hasVideo && (
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <span className="text-white text-sm tracking-wide">Fullscreen</span>
        </div>
      )}
      <div className="absolute left-0 right-0 bottom-0 p-2 bg-gradient-to-t from-black/60 to-transparent">
        <div className="flex items-center justify-between">
          <span className="text-sm text-white font-medium truncate">{user.username}</span>
          <div className="flex items-center space-x-2">
            {user.isMuted ? (
              <span className="text-xs text-discord-red">Muted</span>
            ) : (
              <span className="text-xs text-discord-green">Live</span>
            )}
          </div>
        </div>
        {!isCurrent && (
          <div className="mt-2">
            <input
              type="range"
              min="0"
              max="2"
              step="0.05"
              defaultValue={1}
              onChange={(e) => onVolume && onVolume(Number(e.target.value))}
              className="w-full"
              title={`Volume for ${user.username}`}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function FullscreenOverlay({ users, currentUser, fullscreenUserId, setFullscreenUserId, remoteStreams, localStream }) {
  useEffect(() => {
    if (!fullscreenUserId) return;
    const onKey = (e) => { if (e.key === 'Escape') setFullscreenUserId(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreenUserId, setFullscreenUserId]);

  if (!fullscreenUserId) return null;

  const user = users.find((u) => u.id === fullscreenUserId);
  const stream = fullscreenUserId === currentUser?.id ? localStream : remoteStreams.get(fullscreenUserId);
  const hasVideo = !!stream && stream.getVideoTracks && stream.getVideoTracks().length > 0;

  useEffect(() => {
    if (!stream || !hasVideo) {
      setFullscreenUserId(null);
      return;
    }
    const tracks = stream.getVideoTracks ? stream.getVideoTracks() : [];
    const onEnded = () => setFullscreenUserId(null);
    tracks.forEach((t) => t.addEventListener('ended', onEnded));
    return () => tracks.forEach((t) => t.removeEventListener('ended', onEnded));
  }, [stream, hasVideo, setFullscreenUserId]);

  const node = (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center" onClick={() => setFullscreenUserId(null)}>
      <div className="absolute top-4 right-4">
        <button onClick={() => setFullscreenUserId(null)} className="btn-secondary">Close</button>
      </div>
      <div className="max-w-[95vw] max-h-[90vh] w-full h-full flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
        {hasVideo ? (
          <video
            className="w-auto h-auto max-w-full max-h-full rounded"
            playsInline
            autoPlay
            muted
            controls
            ref={(el) => { if (el && el.srcObject !== stream) el.srcObject = stream; }}
          />
        ) : (
          <div className="text-white">No video</div>
        )}
      </div>
      <div className="absolute bottom-4 left-4 text-white text-sm opacity-80">
        {user?.username}
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
