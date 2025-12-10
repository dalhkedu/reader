import { AudioConfig } from '../types';

export const getNativeVoices = (): SpeechSynthesisVoice[] => {
  return window.speechSynthesis.getVoices();
};

export const speakNative = (
  text: string,
  config: AudioConfig,
  onEnd: () => void,
  onError: (e: any) => void
) => {
  // Cancel any ongoing speech
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = config.speed;

  // Find the selected voice object
  if (config.voice) {
    const voices = window.speechSynthesis.getVoices();
    const selectedVoice = voices.find(v => v.name === config.voice);
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }
  }

  utterance.onend = () => {
    onEnd();
  };

  utterance.onerror = (event) => {
    // Ignore errors that happen due to normal flow control
    if (event.error === 'canceled' || event.error === 'interrupted') {
      return;
    }
    
    console.error("Native TTS Error:", event.error);
    onError(event.error || 'Unknown Native TTS Error');
  };

  window.speechSynthesis.speak(utterance);
};

export const stopNative = () => {
  window.speechSynthesis.cancel();
};

export const pauseNative = () => {
  window.speechSynthesis.pause();
};

export const resumeNative = () => {
  window.speechSynthesis.resume();
};