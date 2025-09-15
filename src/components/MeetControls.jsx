import React from 'react';

export default function MeetControls({
  isMuted,
  onToggleMute,
  isDeafened,
  onToggleDeafen,
  onLeave,
  isSharing,
  onToggleShare,
  isCameraOn,
  onToggleCamera,
}) {
  return (
    <div className="pointer-events-auto fixed bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-surface-2/90 backdrop-blur border border-border rounded-full px-4 py-2 shadow-lg">
      <IconButton
        active={!isMuted}
        onClick={onToggleMute}
        title={isMuted ? 'Unmute (Ctrl+D)' : 'Mute (Ctrl+D)'}
        className={isMuted ? 'bg-discord-red hover:bg-red-600' : 'bg-surface hover:bg-surface-2'}
      >
        {isMuted ? <MuteIcon /> : <MicIcon />}
      </IconButton>

      <EndCallButton onClick={onLeave} />

      {onToggleDeafen && (
        <IconButton
          active={!isDeafened}
          onClick={onToggleDeafen}
          title={isDeafened ? 'Undeafen' : 'Deafen'}
          className={isDeafened ? 'bg-discord-red hover:bg-red-600' : 'bg-surface hover:bg-surface-2'}
        >
          <DeafenIcon />
        </IconButton>
      )}

      {onToggleShare && (
        <IconButton
          active={!!isSharing}
          onClick={onToggleShare}
          title={isSharing ? 'Stop Presenting' : 'Present Screen'}
          className={isSharing ? 'bg-discord-green hover:bg-green-600' : 'bg-surface hover:bg-surface-2'}
        >
          <PresentIcon />
        </IconButton>
      )}

      {onToggleCamera && (
        <IconButton
          active={!!isCameraOn}
          onClick={onToggleCamera}
          title={isCameraOn ? 'Turn camera off' : 'Turn camera on'}
          className={isCameraOn ? 'bg-discord-green hover:bg-green-600' : 'bg-surface hover:bg-surface-2'}
        >
          <CameraIcon />
        </IconButton>
      )}
    </div>
  );
}

function IconButton({ active, onClick, title, children, className = '' }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-10 h-10 grid place-items-center rounded-full border border-border text-white transition-all duration-200 ${className}`}
    >
      {children}
    </button>
  );
}

function EndCallButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      title="Leave call"
      className="w-12 h-12 grid place-items-center rounded-full bg-discord-red hover:bg-red-600 text-white font-semibold shadow"
    >
      <PhoneDownIcon />
    </button>
  );
}

function MicIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 14a3 3 0 003-3V6a3 3 0 10-6 0v5a3 3 0 003 3zm5-3a5 5 0 11-10 0H5a7 7 0 0014 0h-2zM11 19h2v3h-2v-3z"/></svg>
  );
}

function MuteIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M4.27 3L3 4.27 8.73 10H7v1c0 2.76 2.24 5 5 5 1.07 0 2.06-.34 2.87-.93l3.36 3.36L19.73 20 4.27 3zM12 4a3 3 0 013 3v3.18l-3-3V4zM11 19h2v3h-2v-3z"/></svg>
  );
}

function PhoneDownIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M21 15.46a16.09 16.09 0 00-6.29-1.27l-1.21 1.21a1 1 0 01-1.41 0l-1.21-1.21A16.09 16.09 0 003 15.46a1 1 0 00-1 1V20a1 1 0 001 1h3.54a1 1 0 001-.76l.57-2.28a1 1 0 011-.76h4.78a1 1 0 011 .76l.57 2.28a1 1 0 001 .76H22a1 1 0 001-1v-3.54a1 1 0 00-1-1z"/></svg>
  );
}

function PresentIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M3 4h18a1 1 0 011 1v11a1 1 0 01-1 1h-7v2h3v2H8v-2h3v-2H3a1 1 0 01-1-1V5a1 1 0 011-1zm1 2v9h16V6H4z"/></svg>
  );
}

function CameraIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M15 8l5-3v14l-5-3v2a2 2 0 01-2 2H3a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v2z"/></svg>
  );
}

function DeafenIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 3a7 7 0 00-7 7v6a2 2 0 002 2h1v-6H7a5 5 0 0110 0h-1v6h1a2 2 0 002-2v-6a7 7 0 00-7-7z"/>
    </svg>
  );
}
