import React from 'react';
import { AudioConfig, VoiceOption } from '../types';

interface ControlsProps {
  isPlaying: boolean;
  onPlayPause: () => void;
  onReset: () => void;
  config: AudioConfig;
  onConfigChange: (newConfig: AudioConfig) => void;
  progress: number;
  total: number;
}

const VOICES: VoiceOption[] = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'];
const SPEEDS = [1.0, 1.25, 1.5, 2.0];

export const Controls: React.FC<ControlsProps> = ({
  isPlaying,
  onPlayPause,
  onReset,
  config,
  onConfigChange,
  progress,
  total,
}) => {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gray-900/95 backdrop-blur-md border-t border-gray-800 p-4 md:p-6 shadow-2xl z-50">
      <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        
        {/* Playback Controls */}
        <div className="flex items-center gap-4">
          <button
            onClick={onPlayPause}
            className="w-12 h-12 flex items-center justify-center rounded-full bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg transition-transform active:scale-95"
          >
            {isPlaying ? (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6 ml-1">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
              </svg>
            )}
          </button>
          
          <button
            onClick={onReset}
            className="p-2 text-gray-400 hover:text-white transition-colors"
            title="Reset to beginning"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
          </button>

          <div className="text-sm font-mono text-gray-400">
            {progress + 1} / {total}
          </div>
        </div>

        {/* Settings */}
        <div className="flex items-center gap-4 flex-wrap justify-center">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Voice</label>
            <select
              value={config.voice}
              onChange={(e) => onConfigChange({ ...config, voice: e.target.value as VoiceOption })}
              className="bg-gray-800 text-sm text-gray-200 rounded px-3 py-1.5 border border-gray-700 focus:border-emerald-500 focus:outline-none"
            >
              {VOICES.map(v => (
                <option key={v} value={v}>{v}</option>
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
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
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