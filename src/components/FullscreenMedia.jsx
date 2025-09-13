import React, { useEffect, useRef } from 'react';

export default function FullscreenMedia({ stream, user, onClose }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      if (videoRef.current.srcObject !== stream) {
        videoRef.current.srcObject = stream;
      }
      const v = videoRef.current;
      const play = () => v.play().catch(() => {});
      v.addEventListener('loadedmetadata', play);
      play();
      return () => v.removeEventListener('loadedmetadata', play);
    }
  }, [stream]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center" onClick={onClose}>
      <div className="absolute top-4 right-4">
        <button onClick={onClose} className="btn-secondary">Close</button>
      </div>
      <div className="max-w-[95vw] max-h-[90vh] w-full h-full flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
        <video ref={videoRef} className="w-auto h-auto max-w-full max-h-full rounded" playsInline autoPlay muted controls />
      </div>
      <div className="absolute bottom-4 left-4 text-white text-sm opacity-80">
        {user?.username}
      </div>
    </div>
  );
}

