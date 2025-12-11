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
  const [isExpanded, setIsExpanded] = useState(false);

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

  // --- Components ---

  const CoverArt = () => (
    metadata?.coverUrl ? (
      <img 
        src={metadata.coverUrl} 
        alt="Cover" 
        className="h-10 w-8 md:h-12 md:w-9 object-cover rounded shadow-md border border-gray-700 bg-gray-800 flex-shrink-0"
      />
    ) : (
      <div className="h-10 w-8 md:h-12 md:w-9 bg-gray-800 rounded flex-shrink-0 flex items-center justify-center border border-gray-700">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-gray-600">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
        </svg>
      </div>
    )
  );

  const PlayControls = () => (
    <div className="flex items-center gap-3">
       <button
        onClick={onPlayPause}
        className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center rounded-full bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-900/20 transition-all active:scale-95"
      >
        {isPlaying ? (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 md:w-6 md:h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 md:w-6 md:h-6 ml-1">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
          </svg>
        )}
      </button>

      <button
        onClick={onReset}
        className="p-2 text-gray-400 hover:text-white transition-colors rounded-full hover:bg-gray-800"
        title="Reset"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
        </svg>
      </button>
    </div>
  );

  const Settings = () => (
    <div className="flex flex-row items-center gap-4 bg-gray-800/50 p-1.5 rounded-lg border border-gray-800/50">
      
      {/* Voice Selector */}
      <div className="flex flex-col min-w-[120px]">
        <div className="flex items-center justify-between mb-1">
           <label className="text-[9px] uppercase tracking-wider text-gray-500 font-bold">Voice</label>
        </div>
        <select
          value={config.voice}
          onChange={(e) => onConfigChange({ ...config, voice: e.target.value as VoiceOption })}
          className="bg-gray-900 text-xs text-gray-200 rounded px-2 py-1.5 border border-gray-700 focus:border-emerald-500 focus:outline-none w-full truncate appearance-none"
        >
          {availableVoices.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </div>

      {/* Speed Selector */}
      <div className="flex flex-col">
        <label className="text-[9px] uppercase tracking-wider text-gray-500 font-bold mb-1">Speed</label>
        <div className="flex bg-gray-900 rounded border border-gray-700 overflow-hidden">
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => onConfigChange({ ...config, speed: s })}
              className={`px-2 py-1.5 text-[10px] md:text-xs font-medium transition-colors border-r border-gray-700 last:border-r-0 ${
                config.speed === s 
                  ? 'bg-emerald-600 text-white' 
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  // --- Layouts ---

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gray-900/95 backdrop-blur-md border-t border-gray-800 z-50 transition-all duration-300">
      
      {/* Mobile Handle */}
      <div className="md:hidden w-full flex justify-center -mt-3">
         <button 
           onClick={() => setIsExpanded(!isExpanded)}
           className="bg-gray-800 border border-gray-700 rounded-full p-1 text-gray-400 hover:text-white shadow-lg"
         >
           {isExpanded ? (
             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
               <path fillRule="evenodd" d="M14.77 12.79a.75.75 0 01-1.06-.02L10 8.832 6.29 12.77a.75.75 0 11-1.08-1.04l4.25-4.5a.75.75 0 011.08 0l4.25 4.5a.75.75 0 01-.02 1.06z" clipRule="evenodd" />
             </svg>
           ) : (
             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
               <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
             </svg>
           )}
         </button>
      </div>

      <div className="max-w-7xl mx-auto p-3">
        
        {/* DESKTOP LAYOUT (Flex Row) */}
        <div className="hidden md:flex items-center justify-between gap-6">
          {/* Left: Cover + Title + Play */}
          <div className="flex items-center gap-4 flex-1 min-w-0">
             <CoverArt />
             <div className="flex flex-col min-w-0 mr-2">
                <h3 className="font-semibold text-sm text-gray-100 truncate max-w-[200px]">
                  {metadata?.title || 'Unknown Title'}
                </h3>
                <p className="text-xs text-gray-500 font-mono">
                  Chunk {progress + 1} / {total}
                </p>
             </div>
             {/* Play Button Next to Title */}
             <PlayControls />
          </div>

          {/* Right: Settings (Side by Side) */}
          <div className="flex-none">
             <Settings />
          </div>
        </div>

        {/* MOBILE LAYOUT */}
        <div className="md:hidden flex flex-col gap-4">
           {/* Collapsed View: Cover + Title + Play */}
           <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                 <CoverArt />
                 <div className="min-w-0">
                    <h3 className="font-semibold text-sm text-gray-100 truncate">
                      {metadata?.title || 'Reader'}
                    </h3>
                    <p className="text-xs text-gray-500 font-mono">
                      {progress + 1} / {total}
                    </p>
                 </div>
              </div>
              <PlayControls />
           </div>

           {/* Expanded Settings */}
           {isExpanded && (
             <div className="border-t border-gray-800 pt-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
               <Settings />
             </div>
           )}
        </div>

      </div>
    </div>
  );
};
