import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const MediaContext = createContext(null);

export const useMediaContext = () => {
  const ctx = useContext(MediaContext);
  if (!ctx) throw new Error('useMediaContext must be used within MediaProvider');
  return ctx;
};

export const MediaProvider = ({ children }) => {
  const [localStream, setLocalStream] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [audioElements, setAudioElements] = useState(new Map());
  const audioElementsRef = useRef(new Map());
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const speakingTimeoutRef = useRef(null);
  const masterGainRef = useRef(null);
  const remoteGainsRef = useRef(new Map()); // userId -> {source, gain}
  const preDeafenMutedRef = useRef(false);
  const globalMuteRef = useRef(false);

  const initializeAudio = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });

    setLocalStream(stream);
    console.log('[media] local media acquired', { audioTracks: stream.getAudioTracks().length, videoTracks: stream.getVideoTracks().length });

    // speaking detection
    audioContextRef.current = audioContextRef.current || new AudioContext();
    try { await audioContextRef.current.resume(); } catch {}
    analyserRef.current = audioContextRef.current.createAnalyser();
    const source = audioContextRef.current.createMediaStreamSource(stream);
    source.connect(analyserRef.current);
    // master gain for remote playback, default boosted for clarity
    if (!masterGainRef.current) {
      masterGainRef.current = audioContextRef.current.createGain();
      masterGainRef.current.gain.value = 1.6; // default boost to address low volume
      masterGainRef.current.connect(audioContextRef.current.destination);
    }
    analyserRef.current.fftSize = 256;
    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const tick = () => {
      if (!analyserRef.current) return;
      analyserRef.current.getByteFrequencyData(dataArray);
      const avg = dataArray.reduce((a, b) => a + b, 0) / bufferLength;
      const speaking = avg > 10;
      if (speaking !== isSpeaking) {
        setIsSpeaking(speaking);
        if (speakingTimeoutRef.current) clearTimeout(speakingTimeoutRef.current);
        if (speaking) speakingTimeoutRef.current = setTimeout(() => setIsSpeaking(false), 1000);
      }
      requestAnimationFrame(tick);
    };
    tick();
    return stream;
  }, [isSpeaking]);

  const toggleMute = useCallback(() => {
    if (!localStream) return;
    const track = localStream.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setIsMuted(!track.enabled);
  }, [localStream]);

  const createAudioElement = useCallback((userId, stream) => {
    const audio = new Audio();
    audio.srcObject = stream;
    audio.autoplay = true;
    audio.playsInline = true;
    audio.volume = 0; // we will route audio through WebAudio for gain control
    audio.addEventListener('loadedmetadata', () => {
      audio.play().catch(() => {});
    });
    audioElementsRef.current.set(userId, audio);
    setAudioElements(new Map(audioElementsRef.current));
    return audio;
  }, []);

  // Attach remote stream to WebAudio graph with per-user gain
  const attachRemoteStream = useCallback((userId, stream) => {
    if (!audioContextRef.current || !masterGainRef.current || !stream) return;
    // If exists, disconnect old
    const existing = remoteGainsRef.current.get(userId);
    if (existing) {
      try { existing.source.disconnect(); existing.gain.disconnect(); } catch { /* noop */ }
    }
    const source = audioContextRef.current.createMediaStreamSource(stream);
    const gain = audioContextRef.current.createGain();
    gain.gain.value = globalMuteRef.current ? 0 : 1.0; // respect global mute state
    source.connect(gain);
    gain.connect(masterGainRef.current);
    remoteGainsRef.current.set(userId, { source, gain });
  }, []);

  const setRemoteGain = useCallback((userId, value) => {
    const entry = remoteGainsRef.current.get(userId);
    if (entry) entry.gain.gain.value = value;
  }, []);

  const setMasterGain = useCallback((value) => {
    if (masterGainRef.current) masterGainRef.current.gain.value = value;
  }, []);

  const removeAudioElement = useCallback((userId) => {
    const audio = audioElementsRef.current.get(userId);
    if (audio) {
      audio.pause();
      audio.srcObject = null;
      audioElementsRef.current.delete(userId);
      setAudioElements(new Map(audioElementsRef.current));
    }
    const nodes = remoteGainsRef.current.get(userId);
    if (nodes) {
      try { nodes.source.disconnect(); nodes.gain.disconnect(); } catch { /* noop */ }
      remoteGainsRef.current.delete(userId);
    }
  }, []);

  const muteAll = useCallback((muted) => {
    globalMuteRef.current = !!muted;
    remoteGainsRef.current.forEach((entry) => {
      entry.gain.gain.value = muted ? 0 : 1.0;
    });
  }, []);

  const cleanup = useCallback(() => {
    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
      setLocalStream(null);
    }
    // keep audio context alive for user interactions; do not close to avoid autoplay issues
    if (speakingTimeoutRef.current) clearTimeout(speakingTimeoutRef.current);
    audioElementsRef.current.forEach((a) => {
      a.pause();
      a.srcObject = null;
    });
    audioElementsRef.current.clear();
    setAudioElements(new Map());
    remoteGainsRef.current.forEach((n) => { try { n.source.disconnect(); n.gain.disconnect(); } catch{} });
    remoteGainsRef.current.clear();
  }, [localStream]);

  useEffect(() => () => cleanup(), [cleanup]);

  // Deafen: mutes mic and silences remote via master gain
  const toggleDeafen = useCallback(() => {
    const next = !isDeafened;
    if (next) {
      preDeafenMutedRef.current = isMuted;
      // ensure mic muted
      if (!isMuted) toggleMute();
      setMasterGain(0);
    } else {
      // restore master gain and previous mic state (stay muted if was muted before)
      setMasterGain(1.6);
      if (!preDeafenMutedRef.current && isMuted) toggleMute();
    }
    setIsDeafened(next);
  }, [isDeafened, isMuted, toggleMute, setMasterGain]);

  // Camera controls
  const enableCamera = useCallback(async () => {
    if (!localStream) return null;
    if (isCameraOn) return localStream.getVideoTracks()[0] || null;
    const cam = await navigator.mediaDevices.getUserMedia({ video: true });
    const videoTrack = cam.getVideoTracks()[0];
    if (videoTrack) {
      localStream.addTrack(videoTrack);
      setIsCameraOn(true);
      setIsScreenSharing(false);
    }
    return videoTrack || null;
  }, [localStream, isCameraOn]);

  const disableCamera = useCallback(() => {
    if (!localStream) return;
    localStream.getVideoTracks().forEach((t) => { t.stop(); localStream.removeTrack(t); });
    setIsCameraOn(false);
  }, [localStream]);

  const toggleCamera = useCallback(async () => {
    if (isCameraOn) {
      disableCamera();
      return null;
    }
    // if screen is on, turn it off first
    if (isScreenSharing) disableScreenShare();
    return await enableCamera();
  }, [isCameraOn, isScreenSharing, enableCamera, disableCamera]);

  // Screen share controls
  const enableScreenShare = useCallback(async () => {
    if (!localStream) return null;
    if (isScreenSharing) return localStream.getVideoTracks()[0] || null;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      console.warn('Screen sharing not supported on this browser');
      throw new Error('Screen sharing not supported on this browser');
    }
    const screen = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    const screenTrack = screen.getVideoTracks()[0];
    if (screenTrack) {
      // auto-stop when user ends share from browser UI
      screenTrack.onended = () => {
        disableScreenShare();
      };
      localStream.addTrack(screenTrack);
      setIsScreenSharing(true);
      setIsCameraOn(false);
    }
    return screenTrack || null;
  }, [localStream, isScreenSharing]);

  const disableScreenShare = useCallback(() => {
    if (!localStream) return;
    // Remove ALL video tracks to ensure no stale black video frames
    localStream.getVideoTracks().forEach((t) => {
      try { t.stop(); } catch {}
      try { localStream.removeTrack(t); } catch {}
    });
    setIsScreenSharing(false);
  }, [localStream]);

  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      disableScreenShare();
      return null;
    }
    // if camera is on, turn it off first
    if (isCameraOn) disableCamera();
    return await enableScreenShare();
  }, [isScreenSharing, isCameraOn, enableScreenShare, disableScreenShare, disableCamera]);

  const value = useMemo(
    () => ({
      localStream,
      isMuted,
      isSpeaking,
      isDeafened,
      isCameraOn,
      isScreenSharing,
      audioElements,
      initializeAudio,
      toggleMute,
      toggleDeafen,
      enableCamera,
      disableCamera,
      toggleCamera,
      enableScreenShare,
      disableScreenShare,
      toggleScreenShare,
      createAudioElement,
      attachRemoteStream,
      removeAudioElement,
      muteAll,
      setRemoteGain,
      setMasterGain,
      cleanup,
    }),
    [localStream, isMuted, isSpeaking, isDeafened, isCameraOn, isScreenSharing, audioElements, initializeAudio, toggleMute, toggleDeafen, enableCamera, disableCamera, toggleCamera, enableScreenShare, disableScreenShare, toggleScreenShare, createAudioElement, attachRemoteStream, removeAudioElement, muteAll, setRemoteGain, setMasterGain, cleanup]
  );

  return <MediaContext.Provider value={value}>{children}</MediaContext.Provider>;
};
