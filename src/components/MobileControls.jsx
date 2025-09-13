import React from 'react';

export default function MobileControls({
  isMuted,
  onToggleMute,
  isDeafened,
  onToggleDeafen,
  isCameraOn,
  onToggleCamera,
  isScreenSharing,
  onToggleScreenShare,
}) {
  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-surface-2 border-t border-border p-2 flex items-center justify-around z-20">
      <IconButton active={!isMuted} onClick={onToggleMute} title={isMuted ? 'Unmute' : 'Mute'}>
        <MicIcon muted={isMuted} />
      </IconButton>
      <IconButton active={!isDeafened} onClick={onToggleDeafen} title={isDeafened ? 'Undeafen' : 'Deafen'}>
        <DeafenIcon />
      </IconButton>
      <IconButton active={isCameraOn} onClick={onToggleCamera} title={isCameraOn ? 'Camera Off' : 'Camera On'}>
        <CameraIcon on={isCameraOn} />
      </IconButton>
      <IconButton active={isScreenSharing} onClick={onToggleScreenShare} title={isScreenSharing ? 'Stop Share' : 'Share Screen'}>
        <ScreenIcon on={isScreenSharing} />
      </IconButton>
    </div>
  );
}

function IconButton({ active, onClick, title, children }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-3 rounded-full border ${active ? 'bg-discord-green border-discord-green' : 'bg-surface border-border'} text-white`}
    >
      {children}
    </button>
  );
}

function MicIcon({ muted }) {
  return (
    <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
      {muted ? (
        <path d="M10 12a2 2 0 100-4 2 2 0 000 4z M10 14a4 4 0 100-8 4 4 0 000 8zM2 10a8 8 0 1116 0 8 8 0 01-16 0z" />
      ) : (
        <path d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4z M5.5 9.643a.75.75 0 00-1.5 0V10c0 3.06 2.29 5.585 5.25 5.954V17.5h-1.5a.75.75 0 000 1.5h4.5a.75.75 0 000-1.5h-1.5v-1.546A6.001 6.001 0 0016 10v-.357a.75.75 0 00-1.5 0V10a4.5 4.5 0 01-9 0v-.357z" />
      )}
    </svg>
  );
}

function DeafenIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M9 7v10l-4-4H2V11h3l4-4zm13 5a7 7 0 01-7 7h-1v-2h1a5 5 0 000-10h-1V5h1a7 7 0 017 7z"/></svg>
  );
}

function CameraIcon({ on }) {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M15 8l5-3v14l-5-3v2a2 2 0 01-2 2H3a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v2z"/></svg>
  );
}

function ScreenIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M3 4h18a1 1 0 011 1v12a1 1 0 01-1 1h-7v2h3v2H8v-2h3v-2H3a1 1 0 01-1-1V5a1 1 0 011-1zm1 2v10h16V6H4z"/></svg>
  );
}

