import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useMediaContext } from '../context/MediaProvider.jsx';

const tileVariants = {
  initial: { opacity: 0, scale: 0.93 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.9 },
};

export default function StageGrid({
  users = [],
  currentUser,
  remoteStreams = new Map(),
  localStream,
  speakingUsers = new Set(),
  localSpeaking = false,
}) {
  const containerRef = useRef(null);
  const { setRemoteGain, getRemoteGain } = useMediaContext();

  const streamByUserId = useMemo(() => {
    const map = new Map(remoteStreams);
    if (currentUser?.id && localStream) {
      map.set(currentUser.id, localStream);
    }
    return map;
  }, [currentUser, localStream, remoteStreams]);

  const count = users.length;

  const columns = useMemo(() => {
    if (count <= 1) return 1;
    if (count === 2) return 2;
    if (count <= 4) return 2;
    if (count <= 9) return 3;
    if (count <= 16) return 4;
    return Math.min(5, Math.ceil(Math.sqrt(count)));
  }, [count]);

  const gridStyle = useMemo(
    () => ({
      gridTemplateColumns: `repeat(${Math.max(columns, 1)}, minmax(0, 1fr))`,
      gridAutoRows: 'minmax(0, 1fr)',
    }),
    [columns],
  );

  const gridClass = `grid h-full w-full gap-4 p-6 transition-all duration-300 ${count <= 1 ? 'place-items-center' : ''}`;

  const isSpeakingUser = (userId) => {
    if (!userId) return false;
    if (currentUser?.id === userId && localSpeaking) return true;
    return speakingUsers.has(userId);
  };

  return (
    <div ref={containerRef} className={gridClass} style={gridStyle}>
      <AnimatePresence>
        {users.map((user) => {
          const stream = streamByUserId.get(user.id);
          const hasVideo = !!stream && typeof stream.getVideoTracks === 'function' && stream.getVideoTracks().some((track) => track.readyState === 'live');
          const isCurrent = currentUser?.id === user.id;
          const isSpeaking = isSpeakingUser(user.id);

          return (
            <StageTile
              key={user.id}
              user={user}
              stream={stream}
              hasVideo={hasVideo}
              isSpeaking={isSpeaking}
              isCurrent={isCurrent}
              isSpotlight={count <= 1}
              initialVolume={getRemoteGain(user.id)}
              onVolume={(v) => !isCurrent && setRemoteGain(user.id, v)}
            />
          );
        })}
      </AnimatePresence>
    </div>
  );
}

function StageTile({ user, stream, hasVideo, isSpeaking, isCurrent, isSpotlight, onVolume, initialVolume = 1 }) {
  const videoRef = useRef(null);
  const [volume, setVolume] = useState(initialVolume);

  useEffect(() => {
    if (videoRef.current && hasVideo) {
      if (videoRef.current.srcObject !== stream) {
        videoRef.current.srcObject = stream;
      }
      const video = videoRef.current;
      const handleLoaded = () => video.play().catch(() => {});
      video.addEventListener('loadedmetadata', handleLoaded);
      handleLoaded();
      return () => video.removeEventListener('loadedmetadata', handleLoaded);
    }
  }, [hasVideo, stream]);

  const initialLetter = user.username?.charAt(0)?.toUpperCase() || '?';
  useEffect(() => {
    setVolume(initialVolume);
  }, [initialVolume]);

  const handleVolumeChange = (value) => {
    const next = Math.min(3, Math.max(0.5, value));
    setVolume(next);
    if (onVolume) onVolume(next);
  };

  return (
    <motion.div
      layout
      variants={tileVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={`group relative select-none overflow-hidden rounded-3xl border border-white/5 bg-[#11141b]/95 shadow-xl transition-shadow duration-300 backdrop-blur-sm ${
        isSpeaking
          ? 'ring-2 ring-[#3090FF]/80 shadow-[0_0_45px_rgba(48,144,255,0.45)]'
          : 'hover:shadow-[0_16px_40px_rgba(16,24,40,0.45)]'
      } ${isSpotlight ? 'w-full max-w-5xl' : ''}`}
      title={user.username}
      style={{ aspectRatio: '16 / 9' }}
    >
      {hasVideo ? (
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover bg-black transition-transform duration-500 group-hover:scale-[1.02]"
          playsInline
          autoPlay
          muted={isCurrent}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#141823] via-[#1f2532] to-[#0b0f17]">
          <div
            className="flex h-24 w-24 items-center justify-center rounded-full text-2xl font-semibold text-white shadow-inner shadow-black/40"
            style={{ backgroundColor: user.color || '#4b5563' }}
          >
            {initialLetter}
          </div>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent p-3">
        <div className="flex items-end justify-between">
          <div>
            <p className="max-w-[14rem] truncate text-sm font-semibold text-white drop-shadow">{user.username}</p>
            <p className="text-xs text-white/70">{isCurrent ? 'You' : user.isMuted ? 'Muted' : 'Live'}</p>
          </div>
          {!isCurrent && (
            <div className="ml-4 flex items-center space-x-2 text-xs text-white/70">
              <span className="tracking-wide uppercase text-[0.65rem]">Vol</span>
              <input
                type="range"
                min="0.5"
                max="3"
                step="0.05"
                value={volume}
                onChange={(e) => handleVolumeChange(Number(e.target.value))}
                onInput={(e) => handleVolumeChange(Number(e.target.value))}
                className="h-1 w-24 accent-[#3090FF] transition-all duration-200 hover:accent-[#62a8ff]"
                title={`Volume for ${user.username}`}
              />
            </div>
          )}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/15 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
    </motion.div>
  );
}
