import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const MediaContext = createContext(null);

export const useMediaContext = () => {
  const ctx = useContext(MediaContext);
  if (!ctx) throw new Error('useMediaContext must be used within MediaProvider');
  return ctx;
};

const DEFAULT_MASTER_VOLUME = 1.6;

export const MediaProvider = ({ children }) => {
  const [localStream, setLocalStream] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [audioElements, setAudioElements] = useState(new Map());

  const audioElementsRef = useRef(new Map());
  const remoteStreamsRef = useRef(new Map());
  const remoteVolumeRef = useRef(new Map());
  const masterVolumeRef = useRef(DEFAULT_MASTER_VOLUME);

  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const speakingTimeoutRef = useRef(null);
  const masterGainRef = useRef(null);
  const remoteGainsRef = useRef(new Map()); // userId -> { source, gain }
  const preDeafenMutedRef = useRef(false);
  const globalMuteRef = useRef(false);

  const ensureAudioContext = useCallback(async () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    if (audioContextRef.current.state === 'suspended') {
      try { await audioContextRef.current.resume(); } catch (err) { /* noop */ }
    }
    if (!masterGainRef.current) {
      masterGainRef.current = audioContextRef.current.createGain();
      masterGainRef.current.gain.value = masterVolumeRef.current;
      masterGainRef.current.connect(audioContextRef.current.destination);
    }
    return audioContextRef.current;
  }, []);

  const initializeAudio = useCallback(async () => {
    const ctx = await ensureAudioContext();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: false },
    });

    setLocalStream(stream);
    console.log('[media] local media acquired', { audioTracks: stream.getAudioTracks().length, videoTracks: stream.getVideoTracks().length });

    analyserRef.current = ctx.createAnalyser();
    const source = ctx.createMediaStreamSource(stream);
    source.connect(analyserRef.current);
    analyserRef.current.fftSize = 256;
    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const tick = () => {
      if (!analyserRef.current) return;
      analyserRef.current.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((acc, value) => acc + value, 0) / bufferLength;
      const speaking = average > 10;
      if (speaking !== isSpeaking) {
        setIsSpeaking(speaking);
        if (speakingTimeoutRef.current) clearTimeout(speakingTimeoutRef.current);
        if (speaking) speakingTimeoutRef.current = setTimeout(() => setIsSpeaking(false), 1000);
      }
      requestAnimationFrame(tick);
    };

    tick();
    return stream;
  }, [ensureAudioContext, isSpeaking]);

  const toggleMute = useCallback(() => {
    if (!localStream) return;
    const track = localStream.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setIsMuted(!track.enabled);
  }, [localStream]);

  const createAudioElement = useCallback((userId, stream) => {
    const audio = new Audio();
    audio.autoplay = true;
    audio.playsInline = true;
    audio.muted = globalMuteRef.current || isDeafened;
    audio.volume = 1;
    if (stream) audio.srcObject = stream;
    audio.addEventListener('loadedmetadata', () => {
      audio.play().catch(() => {});
    });
    audioElementsRef.current.set(userId, audio);
    if (!remoteVolumeRef.current.has(userId)) {
      remoteVolumeRef.current.set(userId, 1);
    }
    setAudioElements(new Map(audioElementsRef.current));
    return audio;
  }, [isDeafened]);

  const applyRemotePlaybackState = useCallback(({ deafen = isDeafened, muteAll = globalMuteRef.current } = {}) => {
    const shouldMuteElements = deafen || muteAll;
    audioElementsRef.current.forEach((audio) => {
      audio.muted = shouldMuteElements;
      if (!shouldMuteElements) {
        audio.play().catch(() => {});
      }
    });
    remoteStreamsRef.current.forEach((stream) => {
      stream.getAudioTracks().forEach((track) => {
        track.enabled = !deafen;
      });
    });
  }, [isDeafened]);

  const attachRemoteStream = useCallback((userId, stream) => {
    if (!stream) return;
    remoteStreamsRef.current.set(userId, stream);

    let audio = audioElementsRef.current.get(userId);
    if (!audio) {
      audio = createAudioElement(userId, stream);
    } else if (audio.srcObject !== stream) {
      audio.srcObject = stream;
    }

    audio.muted = globalMuteRef.current || isDeafened;
    audio.volume = 1;
    stream.getAudioTracks().forEach((track) => {
      track.enabled = !isDeafened;
    });

    ensureAudioContext()
      .then((ctx) => {
        let entry = remoteGainsRef.current.get(userId);
        const perUserVolume = remoteVolumeRef.current.get(userId) ?? 1;

        if (!entry) {
          const source = ctx.createMediaElementSource(audio);
          const gain = ctx.createGain();
          gain.gain.value = perUserVolume;
          source.connect(gain);
          if (!masterGainRef.current) {
            masterGainRef.current = ctx.createGain();
            masterGainRef.current.gain.value = masterVolumeRef.current;
            masterGainRef.current.connect(ctx.destination);
          }
          gain.connect(masterGainRef.current);
          entry = { source, gain };
          remoteGainsRef.current.set(userId, entry);
        } else {
          entry.gain.gain.value = perUserVolume;
        }

        console.log('[media] attach remote audio', {
          userId,
          tracks: typeof stream.getAudioTracks === 'function' ? stream.getAudioTracks().length : 0,
          volume: perUserVolume,
          masterVolume: masterVolumeRef.current,
        });
        applyRemotePlaybackState();
      })
      .catch((err) => {
        console.error('[media] attachRemoteStream error', err);
      });
  }, [applyRemotePlaybackState, createAudioElement, ensureAudioContext, isDeafened]);

  const setRemoteGain = useCallback((userId, value) => {
    const volume = Math.max(0, Number.isFinite(value) ? value : 1);
    remoteVolumeRef.current.set(userId, volume);
    const entry = remoteGainsRef.current.get(userId);
    if (entry) entry.gain.gain.value = volume;
  }, []);

  const setMasterGain = useCallback((value) => {
    const volume = Math.max(0, Number.isFinite(value) ? value : DEFAULT_MASTER_VOLUME);
    masterVolumeRef.current = volume;
    if (masterGainRef.current) masterGainRef.current.gain.value = volume;
  }, []);

  const removeAudioElement = useCallback((userId) => {
    const audio = audioElementsRef.current.get(userId);
    if (audio) {
      audio.pause();
      audio.srcObject = null;
      audioElementsRef.current.delete(userId);
      setAudioElements(new Map(audioElementsRef.current));
    }
    const entry = remoteGainsRef.current.get(userId);
    if (entry) {
      try { entry.source.disconnect(); } catch { /* noop */ }
      try { entry.gain.disconnect(); } catch { /* noop */ }
      remoteGainsRef.current.delete(userId);
    }
    remoteStreamsRef.current.delete(userId);
    remoteVolumeRef.current.delete(userId);
  }, []);

  const muteAll = useCallback((muted) => {
    globalMuteRef.current = !!muted;
    applyRemotePlaybackState({ muteAll: !!muted });
  }, [applyRemotePlaybackState]);

  const cleanup = useCallback(() => {
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
    }
    if (speakingTimeoutRef.current) clearTimeout(speakingTimeoutRef.current);

    audioElementsRef.current.forEach((audio) => {
      audio.pause();
      audio.srcObject = null;
    });
    audioElementsRef.current.clear();
    setAudioElements(new Map());

    remoteStreamsRef.current.clear();
    remoteVolumeRef.current.clear();

    remoteGainsRef.current.forEach((entry) => {
      try { entry.source.disconnect(); } catch { /* noop */ }
      try { entry.gain.disconnect(); } catch { /* noop */ }
    });
    remoteGainsRef.current.clear();

    if (masterGainRef.current) {
      try { masterGainRef.current.disconnect(); } catch { /* noop */ }
      masterGainRef.current = null;
    }
  }, [localStream]);

  useEffect(() => () => cleanup(), [cleanup]);

  const toggleDeafen = useCallback(() => {
    const next = !isDeafened;
    if (next) {
      preDeafenMutedRef.current = isMuted;
      if (!isMuted) toggleMute();
    } else if (!preDeafenMutedRef.current && isMuted) {
      toggleMute();
    }
    setIsDeafened(next);
    applyRemotePlaybackState({ deafen: next });
  }, [applyRemotePlaybackState, isDeafened, isMuted, toggleMute]);

  const disableScreenShare = useCallback(() => {
    if (!localStream) return;
    localStream.getVideoTracks().forEach((track) => {
      try { track.stop(); } catch { /* noop */ }
      try { localStream.removeTrack(track); } catch { /* noop */ }
    });
    setIsScreenSharing(false);
  }, [localStream]);

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
      screenTrack.onended = () => {
        disableScreenShare();
      };
      localStream.addTrack(screenTrack);
      setIsScreenSharing(true);
      setIsCameraOn(false);
    }
    return screenTrack || null;
  }, [disableScreenShare, isScreenSharing, localStream]);

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
    localStream.getVideoTracks().forEach((track) => {
      track.stop();
      localStream.removeTrack(track);
    });
    setIsCameraOn(false);
  }, [localStream]);

  const toggleCamera = useCallback(async () => {
    if (isCameraOn) {
      disableCamera();
      return null;
    }
    if (isScreenSharing) disableScreenShare();
    return enableCamera();
  }, [disableCamera, disableScreenShare, enableCamera, isCameraOn, isScreenSharing]);

  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      disableScreenShare();
      return null;
    }
    if (isCameraOn) disableCamera();
    return enableScreenShare();
  }, [disableCamera, disableScreenShare, enableScreenShare, isCameraOn, isScreenSharing]);

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
    [
      attachRemoteStream,
      audioElements,
      cleanup,
      createAudioElement,
      disableCamera,
      disableScreenShare,
      enableCamera,
      enableScreenShare,
      initializeAudio,
      isCameraOn,
      isDeafened,
      isMuted,
      isScreenSharing,
      isSpeaking,
      localStream,
      muteAll,
      removeAudioElement,
      setMasterGain,
      setRemoteGain,
      toggleCamera,
      toggleDeafen,
      toggleMute,
      toggleScreenShare,
    ],
  );

  return <MediaContext.Provider value={value}>{children}</MediaContext.Provider>;
};
