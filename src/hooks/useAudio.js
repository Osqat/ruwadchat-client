import { useState, useEffect, useRef, useCallback } from 'react';

const useAudio = () => {
  const [localStream, setLocalStream] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioElements, setAudioElements] = useState(new Map());
  const audioElementsRef = useRef(new Map());
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const speakingTimeoutRef = useRef(null);

  // Initialize local audio stream
  const initializeAudio = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      setLocalStream(stream);
      
      // Set up audio analysis for speaking detection
      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      
      analyserRef.current.fftSize = 256;
      const bufferLength = analyserRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      
      const checkSpeaking = () => {
        if (!analyserRef.current) return;
        
        analyserRef.current.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / bufferLength;
        
        const speaking = average > 10; // Threshold for speaking detection
        
        if (speaking !== isSpeaking) {
          setIsSpeaking(speaking);
          
          // Clear existing timeout
          if (speakingTimeoutRef.current) {
            clearTimeout(speakingTimeoutRef.current);
          }
          
          // Set timeout to stop speaking detection after silence
          if (speaking) {
            speakingTimeoutRef.current = setTimeout(() => {
              setIsSpeaking(false);
            }, 1000);
          }
        }
        
        requestAnimationFrame(checkSpeaking);
      };
      
      checkSpeaking();
      
      return stream;
    } catch (error) {
      console.error('Error accessing microphone:', error);
      throw error;
    }
  }, [isSpeaking]);

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  }, [localStream]);

  // Create audio element for remote stream
  const createAudioElement = useCallback((userId, stream) => {
    const audio = new Audio();
    audio.srcObject = stream;
    audio.autoplay = true;
    audio.volume = 1.0;
    
    // Handle audio loading
    audio.addEventListener('loadedmetadata', () => {
      audio.play().catch(error => {
        console.error('Error playing audio:', error);
      });
    });
    
    audioElementsRef.current.set(userId, audio);
    setAudioElements(new Map(audioElementsRef.current));
    
    return audio;
  }, []);

  // Remove audio element
  const removeAudioElement = useCallback((userId) => {
    const audio = audioElementsRef.current.get(userId);
    if (audio) {
      audio.pause();
      audio.srcObject = null;
      audioElementsRef.current.delete(userId);
      setAudioElements(new Map(audioElementsRef.current));
    }
  }, []);

  // Mute all remote audio
  const muteAll = useCallback((muted) => {
    audioElementsRef.current.forEach((audio) => {
      audio.volume = muted ? 0 : 1;
    });
  }, []);

  // Cleanup
  const cleanup = useCallback(() => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    if (speakingTimeoutRef.current) {
      clearTimeout(speakingTimeoutRef.current);
    }
    
    audioElementsRef.current.forEach((audio) => {
      audio.pause();
      audio.srcObject = null;
    });
    audioElementsRef.current.clear();
    setAudioElements(new Map());
  }, [localStream]);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return {
    localStream,
    isMuted,
    isSpeaking,
    audioElements,
    initializeAudio,
    toggleMute,
    createAudioElement,
    removeAudioElement,
    muteAll,
    cleanup
  };
};

export default useAudio;
