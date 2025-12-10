import React, { useState, useEffect, useRef, useCallback } from 'react';
import { parsePdf, chunkText } from './services/pdfService';
import { generateAudio } from './services/openaiService';
import { ApiKeyInput } from './components/ApiKeyInput';
import { ReaderView } from './components/ReaderView';
import { Controls } from './components/Controls';
import { AudioConfig, TextChunk, AudioCacheItem } from './types';

const STORAGE_KEY = 'lumina_gemini_key';

export default function App() {
  // --- State ---
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [chunks, setChunks] = useState<TextChunk[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isProcessingPdf, setIsProcessingPdf] = useState<boolean>(false);
  
  const [config, setConfig] = useState<AudioConfig>({
    voice: 'Puck', // Default Gemini voice
    speed: 1.0,
  });

  // --- Refs ---
  // Store cached audio URLs. Key is chunk index.
  const audioCache = useRef<Map<number, AudioCacheItem>>(new Map());
  const audioPlayer = useRef<HTMLAudioElement | null>(null);
  // To track if we should continue playing after a load
  const isPlayingRef = useRef<boolean>(false); 

  // --- Initialization ---
  useEffect(() => {
    const savedKey = localStorage.getItem(STORAGE_KEY);
    if (savedKey) setApiKey(savedKey);

    audioPlayer.current = new Audio();
    audioPlayer.current.onended = handleAudioEnded;
    
    // Cleanup
    return () => {
      if (audioPlayer.current) {
        audioPlayer.current.pause();
        audioPlayer.current = null;
      }
      // Revoke all blob URLs to avoid memory leaks
      audioCache.current.forEach((item) => URL.revokeObjectURL(item.blobUrl));
    };
  }, []);

  // Sync ref with state
  useEffect(() => {
    isPlayingRef.current = isPlaying;
    if (!isPlaying && audioPlayer.current) {
      audioPlayer.current.pause();
    } else if (isPlaying && audioPlayer.current && audioPlayer.current.paused && audioPlayer.current.src) {
       audioPlayer.current.play().catch(e => console.error("Play error:", e));
    }
  }, [isPlaying]);

  // --- Logic ---

  const handleKeySet = (key: string) => {
    setApiKey(key);
    localStorage.setItem(STORAGE_KEY, key);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingPdf(true);
    setChunks([]);
    setCurrentIndex(0);
    setIsPlaying(false);
    
    // Clear cache
    audioCache.current.forEach((item) => URL.revokeObjectURL(item.blobUrl));
    audioCache.current.clear();

    try {
      const text = await parsePdf(file);
      const textChunks = chunkText(text);
      setChunks(textChunks);
    } catch (err) {
      console.error(err);
      alert('Error parsing PDF. Please ensure it is a valid text-based PDF.');
    } finally {
      setIsProcessingPdf(false);
    }
  };

  const fetchAudioForChunk = async (index: number, priority: boolean = false) => {
    if (index >= chunks.length || !apiKey) return;
    
    // Check if already exists or fetching
    if (audioCache.current.has(index)) return;

    // Mark as fetching
    audioCache.current.set(index, { blobUrl: '', isFetching: true });

    try {
        // Double check apiKey before calling service
        if (!apiKey) throw new Error("No API key");

        const blob = await generateAudio(chunks[index].text, apiKey, config);
        const url = URL.createObjectURL(blob);
        
        audioCache.current.set(index, { blobUrl: url, isFetching: false });

        // If this was a priority fetch (current chunk) and we are supposed to be playing
        if (priority && index === currentIndex && isPlayingRef.current && audioPlayer.current) {
            audioPlayer.current.src = url;
            audioPlayer.current.playbackRate = config.speed; // Ensure speed is applied
            audioPlayer.current.play();
        }
    } catch (err) {
        console.error(`Failed to fetch audio for chunk ${index}`, err);
        audioCache.current.delete(index); // Remove failure so we can retry
        if (priority) setIsPlaying(false);
    }
  };

  const playChunk = async (index: number) => {
    if (!audioPlayer.current) return;

    const cacheItem = audioCache.current.get(index);

    if (cacheItem && !cacheItem.isFetching && cacheItem.blobUrl) {
      // Audio is ready
      audioPlayer.current.src = cacheItem.blobUrl;
      audioPlayer.current.playbackRate = config.speed;
      try {
        await audioPlayer.current.play();
      } catch (e) {
        console.error("Playback failed", e);
        setIsPlaying(false);
      }
    } else {
      // Audio needs fetching
      // We keep isPlaying true so that when fetch finishes, it auto-plays
      fetchAudioForChunk(index, true);
    }

    // Buffer next chunk
    fetchAudioForChunk(index + 1);
  };

  const handleAudioEnded = () => {
    setCurrentIndex((prev) => {
      const next = prev + 1;
      if (next < chunks.length) {
        return next;
      } else {
        setIsPlaying(false);
        return prev;
      }
    });
  };

  // Effect to trigger playback when index changes AND we are in playing state
  useEffect(() => {
    if (chunks.length > 0 && isPlaying) {
      playChunk(currentIndex);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, isPlaying, chunks.length]);

  // Effect: When config (speed/voice) changes, clear cache because audio is now different
  useEffect(() => {
    if (chunks.length === 0) return;
    
    const wasPlaying = isPlaying;
    setIsPlaying(false);
    
    // Clear cache
    audioCache.current.forEach((item) => URL.revokeObjectURL(item.blobUrl));
    audioCache.current.clear();

    if (wasPlaying) {
        // Give a brief moment for state to settle then resume
        setTimeout(() => setIsPlaying(true), 100);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.voice, config.speed]);

  const handleReset = () => {
    setIsPlaying(false);
    setCurrentIndex(0);
    if(audioPlayer.current) {
        audioPlayer.current.pause();
        audioPlayer.current.currentTime = 0;
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-slate-200 selection:bg-emerald-500/30">
      
      {/* Header */}
      <header className="sticky top-0 z-40 bg-gray-950/80 backdrop-blur border-b border-gray-800 p-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-blue-600 rounded-lg flex items-center justify-center">
                <span className="font-serif font-bold text-white text-lg">L</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white hidden sm:block">Lumina Reader</h1>
          </div>
          <div className="flex items-center gap-4">
            <ApiKeyInput onKeySet={handleKeySet} existingKey={apiKey} />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        
        {chunks.length === 0 && (
          <div className="max-w-lg mx-auto mt-20 text-center">
            <div className="border-2 border-dashed border-gray-700 rounded-2xl p-12 bg-gray-900/50 hover:bg-gray-900 transition-colors">
              <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-6 text-emerald-500">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Upload your PDF</h2>
              <p className="text-gray-400 mb-6">Select a book or document to start listening.</p>
              
              <label className="inline-block">
                <span className="bg-white text-gray-900 px-6 py-3 rounded-lg font-semibold cursor-pointer hover:bg-emerald-50 transition-colors shadow-lg hover:shadow-xl hover:scale-105 transform duration-200">
                  {isProcessingPdf ? 'Processing...' : 'Choose File'}
                </span>
                <input 
                  type="file" 
                  accept="application/pdf" 
                  onChange={handleFileUpload}
                  disabled={isProcessingPdf}
                  className="hidden" 
                />
              </label>
              
              {isProcessingPdf && (
                <div className="mt-4 text-emerald-500 text-sm animate-pulse">
                  Extracting text and analyzing chunks...
                </div>
              )}
            </div>
            
            {!apiKey && (
              <div className="mt-8 p-4 bg-orange-900/20 border border-orange-900/50 rounded text-orange-200 text-sm">
                Please configure your Google Gemini API key in the top right to enable audio features.
              </div>
            )}
          </div>
        )}

        {chunks.length > 0 && (
          <>
            <ReaderView chunks={chunks} currentIndex={currentIndex} />
            <Controls 
              isPlaying={isPlaying} 
              onPlayPause={() => setIsPlaying(!isPlaying)} 
              onReset={handleReset}
              config={config}
              onConfigChange={setConfig}
              progress={currentIndex}
              total={chunks.length}
            />
          </>
        )}
      </main>
    </div>
  );
}