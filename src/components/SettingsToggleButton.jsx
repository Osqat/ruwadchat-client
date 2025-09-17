import React from 'react';
import { motion } from 'framer-motion';
import { Settings } from 'lucide-react';

const springTransition = { type: 'spring', stiffness: 320, damping: 26 };
const safeAreaStyle = {
  paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)',
  paddingLeft: 'calc(env(safe-area-inset-left, 0px) + 1rem)',
};

export default function SettingsToggleButton({ isActive = false, onToggle }) {
  const baseClasses = 'pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full border text-white transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3090FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#1C1C1E]';
  const visualClasses = isActive
    ? ' border-[#3090FF] bg-[#3090FF] shadow-[0_10px_25px_rgba(48,144,255,0.4)]'
    : ' border-white/10 bg-white/10 hover:bg-white/20';

  return (
    <div className="pointer-events-none fixed bottom-0 left-0 z-40" style={safeAreaStyle}>
      <motion.button
        type="button"
        className={`${baseClasses}${visualClasses}`}
        onClick={onToggle}
        aria-label="Toggle settings"
        aria-pressed={isActive}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.92 }}
        transition={springTransition}
      >
        <Settings className="h-5 w-5" />
      </motion.button>
    </div>
  );
}
