import React from 'react';
import { motion } from 'framer-motion';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  MonitorUp,
  Volume2,
  VolumeX,
  PhoneOff,
  MessageCircle,
  Users,
  Settings as SettingsIcon,
} from 'lucide-react';

const springTransition = { type: 'spring', stiffness: 380, damping: 24 };
const safeAreaStyle = { paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' };

export default function MeetControls({
  isMuted,
  isCameraOn,
  isScreenSharing,
  isDeafened,
  isChatOpen,
  isParticipantsOpen,
  isSettingsOpen,
  canShareScreen = true,
  onToggleMute,
  onToggleCamera,
  onToggleShare,
  onToggleDeafen,
  onToggleChat,
  onToggleParticipants,
  onToggleSettings,
  onLeave,
}) {
  const primaryButtons = React.useMemo(() => ([
    {
      key: 'mic',
      label: isMuted ? 'Unmute microphone' : 'Mute microphone',
      icon: isMuted ? MicOff : Mic,
      onClick: onToggleMute,
      active: !isMuted,
      disabled: !onToggleMute,
    },
    {
      key: 'camera',
      label: isCameraOn ? 'Turn camera off' : 'Turn camera on',
      icon: isCameraOn ? Video : VideoOff,
      onClick: onToggleCamera,
      active: !!isCameraOn,
      disabled: !onToggleCamera,
    },
    {
      key: 'screen',
      label: !canShareScreen ? 'Screen share not supported' : (isScreenSharing ? 'Stop sharing screen' : 'Share your screen'),
      icon: MonitorUp,
      onClick: onToggleShare,
      active: !!isScreenSharing,
      disabled: !onToggleShare || !canShareScreen,
    },
    {
      key: 'deafen',
      label: isDeafened ? 'Undeafen' : 'Deafen',
      icon: isDeafened ? VolumeX : Volume2,
      onClick: onToggleDeafen,
      active: !!isDeafened,
      disabled: !onToggleDeafen,
    },
  ]), [isMuted, onToggleMute, isCameraOn, onToggleCamera, isScreenSharing, onToggleShare, canShareScreen, isDeafened, onToggleDeafen]);

  const secondaryButtons = React.useMemo(() => ([
    {
      key: 'chat',
      label: 'Toggle chat panel',
      icon: MessageCircle,
      onClick: onToggleChat,
      active: !!isChatOpen,
      disabled: !onToggleChat,
    },
    {
      key: 'participants',
      label: 'Toggle participants panel',
      icon: Users,
      onClick: onToggleParticipants,
      active: !!isParticipantsOpen,
      disabled: !onToggleParticipants,
    },
    {
      key: 'settings',
      label: 'Open meeting settings',
      icon: SettingsIcon,
      onClick: onToggleSettings,
      active: !!isSettingsOpen,
      disabled: !onToggleSettings,
    },
  ]), [onToggleChat, isChatOpen, onToggleParticipants, isParticipantsOpen, onToggleSettings, isSettingsOpen]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40">
      <div className="flex justify-center px-4 pb-6 pt-4 sm:pb-8" style={safeAreaStyle}>
        <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-3 rounded-full border border-white/10 bg-[#1C1C1E]/90 px-4 py-3 shadow-2xl backdrop-blur-xl">
          {primaryButtons.map((btn) => (
            <ControlButton key={btn.key} {...btn} />
          ))}

          <ControlButton
            key="leave"
            label="Leave call"
            icon={PhoneOff}
            onClick={onLeave}
            variant="danger"
            disabled={!onLeave}
          />

          {secondaryButtons.map((btn) => (
            <ControlButton key={btn.key} {...btn} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ControlButton({ icon: Icon, label, onClick, active = false, variant = 'default', disabled = false }) {
  const isDanger = variant === 'danger';
  const ResolvedIcon = Icon || Mic;
  const classes = [
    'flex items-center justify-center rounded-full transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#3090FF] focus-visible:ring-offset-[#1C1C1E]',
    isDanger ? 'h-14 w-14 border border-red-500/70 bg-red-500 text-white shadow-[0_12px_30px_rgba(255,0,0,0.45)] hover:bg-red-600' : 'h-12 w-12 border border-white/10 text-white',
    !isDanger && active ? 'bg-[#3090FF] border-[#3090FF] text-white shadow-[0_12px_30px_rgba(48,144,255,0.45)]' : '',
    !isDanger && !active ? 'bg-white/10 hover:bg-white/20' : '',
    disabled ? 'cursor-not-allowed opacity-40 hover:bg-white/10' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const hoverProps = disabled ? {} : { whileHover: { scale: 1.05 }, whileTap: { scale: 0.95 } };

  return (
    <motion.button
      type="button"
      className={classes}
      title={label}
      aria-label={label}
      aria-pressed={!isDanger ? active : undefined}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      {...hoverProps}
      transition={springTransition}
    >
      <ResolvedIcon className="h-5 w-5" />
    </motion.button>
  );
}
