import { GoogleGenAI } from "@google/genai";
import { AudioConfig } from '../types';

// Helper to add a WAV header to raw PCM data so it can be played by an HTMLAudioElement
const createWavBlob = (pcmData: Uint8Array, sampleRate: number = 24000, numChannels: number = 1): Blob => {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);

  // RIFF identifier
  writeString(view, 0, 'RIFF');
  // RIFF chunk length (file length - 8)
  view.setUint32(4, 36 + pcmData.length, true);
  // RIFF type
  writeString(view, 8, 'WAVE');
  // format chunk identifier
  writeString(view, 12, 'fmt ');
  // format chunk length
  view.setUint32(16, 16, true);
  // sample format (raw)
  view.setUint16(20, 1, true);
  // channel count
  view.setUint16(22, numChannels, true);
  // sample rate
  view.setUint32(24, sampleRate, true);
  // byte rate (sample rate * block align)
  view.setUint32(28, sampleRate * numChannels * 2, true);
  // block align (channel count * bytes per sample)
  view.setUint16(32, numChannels * 2, true);
  // bits per sample
  view.setUint16(34, 16, true);
  // data chunk identifier
  writeString(view, 36, 'data');
  // data chunk length
  view.setUint32(40, pcmData.length, true);

  return new Blob([header, pcmData], { type: 'audio/wav' });
};

const writeString = (view: DataView, offset: number, string: string) => {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
};

const decodeBase64 = (base64: string): Uint8Array => {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

export const generateAudio = async (
  text: string,
  apiKey: string,
  config: AudioConfig
): Promise<Blob> => {
  if (!apiKey) throw new Error('API Key is missing');

  // Initialize Gemini
  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-tts',
      // Strictly follow the array structure for contents
      contents: [{ parts: [{ text }] }],
      config: {
        // Use string 'AUDIO' to ensure robustness in browser environments
        responseModalities: ['AUDIO' as any],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: config.voice },
          },
        },
      },
    });

    const firstPart = response.candidates?.[0]?.content?.parts?.[0];
    
    // Check for inlineData (Audio)
    if (firstPart?.inlineData?.data) {
       const base64Audio = firstPart.inlineData.data;
       const pcmData = decodeBase64(base64Audio);
       return createWavBlob(pcmData, 24000, 1);
    }

    // Check if we got text back instead (error/refusal)
    if (firstPart?.text) {
        throw new Error(`Gemini returned text instead of audio: "${firstPart.text.substring(0, 50)}...". This usually means safety filters triggered or the input was interpreted as a question.`);
    }

    throw new Error('No audio data received from Gemini API (Empty response)');

  } catch (error) {
    console.error('Gemini TTS Error:', error);
    // Add context to the error message if it looks like an API error
    if (error instanceof Error) {
        if (error.message.includes('403') || error.message.includes('401')) {
            throw new Error('Gemini API Authentication failed. Please check your API key.');
        }
        if (error.message.includes('503')) {
            throw new Error('Gemini Service Unavailable. Please try again later.');
        }
    }
    throw error;
  }
};