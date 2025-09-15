import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  const containerRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const { setRemoteGain } = useMediaContext();
  // Precompute a lookup of userId -> media stream
  const streamByUserId = useMemo(() => {
    const m = new Map(remoteStreams);
    if (currentUser?.id && localStream) {
      m.set(currentUser.id, localStream);
    }
    return m;
  }, [remoteStreams, localStream, currentUser]);

  // Measure container to compute optimal grid like Google Meet
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0].contentRect;
      setSize({ w: cr.width, h: cr.height });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const count = users.length;
  const gapPx = 12; // matches gap-3 (12px)
  const aspect = 16 / 9;

  const columns = useMemo(() => {
    if (count === 0 || size.w === 0 || size.h === 0) return Math.max(1, Math.min(count, 3));
    let bestCols = 1;
    let bestArea = 0;
    for (let cols = 1; cols <= count; cols++) {
      const rows = Math.ceil(count / cols);
      const tileW = (size.w - gapPx * (cols - 1)) / cols;
      const tileH = (size.h - gapPx * (rows - 1)) / rows;
      const usedW = Math.min(tileW, tileH * aspect);
      const usedH = usedW / aspect;
      const area = usedW * usedH;
      if (area > bestArea) {
        bestArea = area;
        bestCols = cols;
      }
    }
    return bestCols;
  }, [count, size.w, size.h]);

  const gridStyle = useMemo(() => ({ gridTemplateColumns: `repeat(${Math.max(columns, 1)}, minmax(0, 1fr))` }), [columns]);
  const gridClass = 'grid gap-3 p-3 h-full w-full';

  const isSpeakingUser = (userId) => {
    if (!userId) return false;
    if (currentUser?.id === userId && localSpeaking) return true;
    return speakingUsers.has(userId);
  };

  return (
    <div ref={containerRef} className={gridClass} style={gridStyle}>
      {users.map((u) => {
        const stream = streamByUserId.get(u.id);
        const isSpeaking = isSpeakingUser(u.id);
        const hasVideo = !!stream && typeof stream.getVideoTracks === 'function' && stream.getVideoTracks().some(t => t.readyState === 'live');
        const isCurrent = currentUser?.id === u.id;
        return (
          <StageTile
            key={u.id}
            user={u}
            stream={stream}
            hasVideo={hasVideo}
            isSpeaking={isSpeaking}
            // tiles keep 16:9 while filling space
            isCurrent={isCurrent}
            onVolume={(v) => !isCurrent && setRemoteGain(u.id, v)}
          />
        );
      })}
    </div>
  );
}

function StageTile({ user, stream, hasVideo, isSpeaking, isCurrent, onVolume }) {
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
      className={`animate-tile relative rounded-lg bg-surface-2 border border-border shadow-sm overflow-hidden select-none ${
        isSpeaking ? 'ring-2 ring-accent/70' : ''
      }`}
      title={user.username}
      style={{ aspectRatio: '16 / 9' }}
    >
      {hasVideo ? (
        <video ref={videoRef} className="absolute inset-0 w-full h-full object-contain bg-black" playsInline autoPlay muted />
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


