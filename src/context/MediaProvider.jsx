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
  const [audioElements, setAudioElements] = useState(new Map());
  const audioElementsRef = useRef(new Map());
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const speakingTimeoutRef = useRef(null);

  const initializeAudio = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });

    setLocalStream(stream);

    // speaking detection
    audioContextRef.current = new AudioContext();
    analyserRef.current = audioContextRef.current.createAnalyser();
    const source = audioContextRef.current.createMediaStreamSource(stream);
    source.connect(analyserRef.current);
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
    audio.addEventListener('loadedmetadata', () => {
      audio.play().catch(() => {});
    });
    audioElementsRef.current.set(userId, audio);
    setAudioElements(new Map(audioElementsRef.current));
    return audio;
  }, []);

  const removeAudioElement = useCallback((userId) => {
    const audio = audioElementsRef.current.get(userId);
    if (audio) {
      audio.pause();
      audio.srcObject = null;
      audioElementsRef.current.delete(userId);
      setAudioElements(new Map(audioElementsRef.current));
    }
  }, []);

  const muteAll = useCallback((muted) => {
    audioElementsRef.current.forEach((audio) => (audio.volume = muted ? 0 : 1));
  }, []);

  const cleanup = useCallback(() => {
    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
      setLocalStream(null);
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (speakingTimeoutRef.current) clearTimeout(speakingTimeoutRef.current);
    audioElementsRef.current.forEach((a) => {
      a.pause();
      a.srcObject = null;
    });
    audioElementsRef.current.clear();
    setAudioElements(new Map());
  }, [localStream]);

  useEffect(() => () => cleanup(), [cleanup]);

  const value = useMemo(
    () => ({
      localStream,
      isMuted,
      isSpeaking,
      audioElements,
      initializeAudio,
      toggleMute,
      createAudioElement,
      removeAudioElement,
      muteAll,
      cleanup,
    }),
    [localStream, isMuted, isSpeaking, audioElements, initializeAudio, toggleMute, createAudioElement, removeAudioElement, muteAll, cleanup]
  );

  return <MediaContext.Provider value={value}>{children}</MediaContext.Provider>;
};

