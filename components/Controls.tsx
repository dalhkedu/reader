import React, { useEffect, useState } from 'react';
import { AudioConfig, VoiceOption, PdfMetadata } from '../types';
import { getNativeVoices } from '../services/nativeTtsService';

interface ControlsProps {
  isPlaying: boolean;
  onPlayPause: () => void;
  onReset: () => void;
  config: AudioConfig;
  onConfigChange: (newConfig: AudioConfig) => void;
  progress: number;
  total: number;
  metadata?: PdfMetadata;
}

const GEMINI_VOICES: VoiceOption[] = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'];
const SPEEDS = [1.0, 1.25, 1.5, 2.0];

export const Controls: React.FC<ControlsProps> = ({
  isPlaying,
  onPlayPause,
  onReset,
  config,
  onConfigChange,
  progress,
  total,
  metadata
}) => {
  const [availableVoices, setAvailableVoices] = useState<VoiceOption[]>(GEMINI_VOICES);

  // Load voices if in native mode
  useEffect(() => {
    if (config.useNative) {
      const loadNativeVoices = () => {
        const voices = getNativeVoices();
        if (voices.length > 0) {
          setAvailableVoices(voices.map(v => v.name));
          // If current voice isn't in list, select first
          if (!voices.some(v => v.name === config.voice)) {
            onConfigChange({ ...config, voice: voices[0].name });
          }
        }
      };

      loadNativeVoices();
      window.speechSynthesis.onvoiceschanged = loadNativeVoices;
    } else {
      setAvailableVoices(GEMINI_VOICES);
      if (!GEMINI_VOICES.includes(config.voice)) {
        onConfigChange({ ...config, voice: 'Puck' });
      }
    }
  }, [config.useNative]);

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gray-900/95 backdrop-blur-md border-t border-gray-800 p-3 shadow-2xl z-50">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        
        {/* Book Info (Left) */}
        <div className="flex items-center gap-3 w-full md:w-1/4 min-w-0">
          {metadata?.coverUrl ? (
            <img 
              src={metadata.coverUrl} 
              alt="Cover" 
              className="h-12 w-9 object-cover rounded shadow-md border border-gray-700 bg-gray-800"
            />
          ) : (
             <div className="h-12 w-9 bg-gray-800 rounded flex items-center justify-center border border-gray-700">
               <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-gray-600">
                 <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
               </svg>
             </div>
          )}
          <div className="min-w-0">
            <h3 className="font-semibold text-sm text-gray-100 truncate pr-2">
              {metadata?.title || 'Unknown Title'}
            </h3>
            <p className="text-xs text-gray-500 font-mono">
              Chunk {progress + 1} / {total}
            </p>
          </div>
        </div>

        {/* Playback Controls (Center) */}
        <div className="flex items-center gap-6 justify-center w-full md:w-auto">
           <button
            onClick={onReset}
            className="p-2 text-gray-400 hover:text-white transition-colors"
            title="Reset to beginning"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
          </button>

          <button
            onClick={onPlayPause}
            className="w-14 h-14 flex items-center justify-center rounded-full bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-900/20 transition-all active:scale-95"
          >
            {isPlaying ? (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-7 h-7">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-7 h-7 ml-1">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
              </svg>
            )}
          </button>
        </div>

        {/* Settings (Right) */}
        <div className="flex items-center gap-4 flex-wrap justify-end w-full md:w-1/4">
          <div className="flex flex-col gap-1 w-32 md:w-40">
            <label className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
              {config.useNative ? 'Browser' : 'Gemini'}
            </label>
            <select
              value={config.voice}
              onChange={(e) => onConfigChange({ ...config, voice: e.target.value as VoiceOption })}
              className="bg-gray-800 text-xs text-gray-200 rounded px-2 py-1.5 border border-gray-700 focus:border-emerald-500 focus:outline-none w-full truncate"
            >
              {availableVoices.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Speed</label>
            <div className="flex bg-gray-800 rounded border border-gray-700 overflow-hidden">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  onClick={() => onConfigChange({ ...config, speed: s })}
                  className={`px-2 py-1.5 text-xs font-medium transition-colors ${
                    config.speed === s 
                      ? 'bg-emerald-600 text-white' 
                      : 'text-gray-400 hover:text-white hover:bg-gray-700'
                  }`}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};