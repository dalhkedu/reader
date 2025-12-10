import React, { useState, useEffect, useRef } from 'react';
import { parsePdf } from './services/pdfService';
import { generateAudio } from './services/openaiService';
import { speakNative, stopNative, resumeNative, pauseNative } from './services/nativeTtsService';
import { ApiKeyInput } from './components/ApiKeyInput';
import { ReaderView } from './components/ReaderView';
import { Controls } from './components/Controls';
import { Sidebar } from './components/Sidebar';
import { AudioConfig, TextChunk, AudioCacheItem, PdfOutline } from './types';

const STORAGE_KEY = 'lumina_gemini_key';

export default function App() {
  // --- State ---
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [chunks, setChunks] = useState<TextChunk[]>([]);
  const [outline, setOutline] = useState<PdfOutline[]>([]); // New Outline State
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isProcessingPdf, setIsProcessingPdf] = useState<boolean>(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  const [config, setConfig] = useState<AudioConfig>({
    voice: 'Puck',
    speed: 1.0,
    useNative: false,
  });

  // --- Refs ---
  const audioCache = useRef<Map<number, AudioCacheItem>>(new Map());
  const audioPlayer = useRef<HTMLAudioElement | null>(null);
  
  const isPlayingRef = useRef<boolean>(false); 
  const currentIndexRef = useRef<number>(0);

  // --- Initialization ---
  useEffect(() => {
    const savedKey = localStorage.getItem(STORAGE_KEY);
    if (savedKey) setApiKey(savedKey);

    audioPlayer.current = new Audio();
    
    // Cleanup
    return () => {
      if (audioPlayer.current) {
        audioPlayer.current.pause();
        audioPlayer.current = null;
      }
      stopNative();
      audioCache.current.forEach((item) => URL.revokeObjectURL(item.blobUrl));
    };
  }, []);

  // Sync refs
  useEffect(() => {
    isPlayingRef.current = isPlaying;
    currentIndexRef.current = currentIndex;
  }, [isPlaying, currentIndex]);

  // Handle HTML Audio Ended
  useEffect(() => {
    if (!audioPlayer.current) return;

    const onEnded = () => {
      handleNextChunk();
    };

    audioPlayer.current.addEventListener('ended', onEnded);
    return () => {
      audioPlayer.current?.removeEventListener('ended', onEnded);
    };
  }, [chunks.length]);

  const handleNextChunk = () => {
    const nextIndex = currentIndexRef.current + 1;
    if (nextIndex < chunks.length) {
      setCurrentIndex(nextIndex);
    } else {
      setIsPlaying(false);
    }
  };

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
    setOutline([]); // Reset outline
    setCurrentIndex(0);
    setIsPlaying(false);
    stopNative();
    
    // Clear cache
    audioCache.current.forEach((item) => URL.revokeObjectURL(item.blobUrl));
    audioCache.current.clear();

    try {
      const { chunks: textChunks, outline: pdfOutline } = await parsePdf(file);
      setChunks(textChunks);
      setOutline(pdfOutline);
    } catch (err) {
      console.error(err);
      alert('Error parsing PDF. Please ensure it is a valid text-based PDF.');
    } finally {
      setIsProcessingPdf(false);
    }
  };

  // --- GEMINI PLAYBACK LOGIC ---
  const fetchAudioForChunk = async (index: number, forcePlay: boolean = false) => {
    if (index >= chunks.length || !apiKey) return;
    
    if (audioCache.current.has(index)) {
      const item = audioCache.current.get(index);
      if (item && !item.isFetching && item.blobUrl && forcePlay) {
         playBlob(item.blobUrl);
      }
      return;
    }

    audioCache.current.set(index, { blobUrl: '', isFetching: true });

    try {
        if (!apiKey) throw new Error("No API key");

        const blob = await generateAudio(chunks[index].text, apiKey, config);
        const url = URL.createObjectURL(blob);
        
        audioCache.current.set(index, { blobUrl: url, isFetching: false });

        if (index === currentIndexRef.current && isPlayingRef.current && !config.useNative) {
            playBlob(url);
        }
    } catch (err) {
        console.error(`Failed to fetch audio for chunk ${index}`, err);
        audioCache.current.delete(index);
        
        if (index === currentIndexRef.current && isPlayingRef.current && !config.useNative) {
            setIsPlaying(false);
            alert(`Gemini Playback failed. ${err instanceof Error ? err.message : ''}`);
        }
    }
  };

  const playBlob = async (url: string) => {
    if (!audioPlayer.current) return;
    
    if (audioPlayer.current.src !== url) {
        audioPlayer.current.src = url;
    }
    audioPlayer.current.playbackRate = config.speed;

    try {
        await audioPlayer.current.play();
    } catch (e: any) {
        if (e.name !== 'AbortError') console.error("Play error:", e);
    }
  };

  // --- NATIVE PLAYBACK LOGIC ---
  const playNativeChunk = (index: number) => {
    if (index >= chunks.length) {
      setIsPlaying(false);
      return;
    }
    
    speakNative(
      chunks[index].text,
      config,
      () => {
        // On End
        if (isPlayingRef.current) {
          handleNextChunk();
        }
      },
      (err) => {
        console.error("Native TTS Error detected in App:", err);
        // Only stop if it's a real error, though speakNative filters cancel/interrupt now.
        setIsPlaying(false);
      }
    );
  };

  // --- ORCHESTRATOR ---
  useEffect(() => {
    if (chunks.length === 0) return;

    if (isPlaying) {
      if (config.useNative) {
        // Native Mode
        // Ensure Gemini is stopped
        if (audioPlayer.current) audioPlayer.current.pause();
        
        // Use resume if just paused? SpeechSynthesis is flaky with resume/pause on some browsers.
        // Safer to just speak current chunk.
        playNativeChunk(currentIndex);

      } else {
        // Gemini Mode
        stopNative();
        
        // Fetch/Play Gemini
        const cacheItem = audioCache.current.get(currentIndex);
        if (cacheItem && !cacheItem.isFetching && cacheItem.blobUrl) {
          playBlob(cacheItem.blobUrl);
        } else {
          fetchAudioForChunk(currentIndex, true);
        }
        // Preload next
        if (currentIndex + 1 < chunks.length) {
          fetchAudioForChunk(currentIndex + 1);
        }
      }
    } else {
      // Paused
      if (audioPlayer.current) audioPlayer.current.pause();
      stopNative(); // Cancel clears the queue
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, isPlaying, config.useNative]);

  // Handle Config Switch (Reset audio)
  useEffect(() => {
    if (chunks.length === 0) return;
    
    const wasPlaying = isPlaying;
    setIsPlaying(false);
    stopNative();
    if (audioPlayer.current) audioPlayer.current.pause();

    // Clear Gemini cache if switching options that affect audio file
    if (!config.useNative) {
      audioCache.current.forEach((item) => URL.revokeObjectURL(item.blobUrl));
      audioCache.current.clear();
    }

    if (wasPlaying) {
        setTimeout(() => setIsPlaying(true), 250);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.voice, config.speed, config.useNative]);


  const handleChunkSelect = (index: number) => {
    setCurrentIndex(index);
    setIsPlaying(true);
  };

  const handleReset = () => {
    setIsPlaying(false);
    setCurrentIndex(0);
    if(audioPlayer.current) {
        audioPlayer.current.pause();
        audioPlayer.current.currentTime = 0;
    }
    stopNative();
  };

  // --- RENDER ---

  const hasContent = chunks.length > 0;

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-slate-200 selection:bg-emerald-500/30 overflow-hidden">
      
      {/* Header */}
      <header className="flex-none bg-gray-950/80 backdrop-blur border-b border-gray-800 p-3 z-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
             {hasContent && (
               <button 
                 onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                 className="md:hidden p-2 text-gray-400 hover:text-white"
               >
                 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                </svg>
               </button>
             )}
            <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-blue-600 rounded-lg flex items-center justify-center">
                <span className="font-serif font-bold text-white text-lg">L</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white hidden sm:block">Lumina</h1>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 mr-2 border-r border-gray-800 pr-4">
                <span className={`text-xs font-bold ${config.useNative ? 'text-white' : 'text-gray-500'}`}>Native</span>
                <button 
                    onClick={() => setConfig({...config, useNative: !config.useNative})}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${config.useNative ? 'bg-emerald-600' : 'bg-gray-700'}`}
                >
                    <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${config.useNative ? 'translate-x-5' : 'translate-x-1'}`} />
                </button>
            </div>
            
            <div className={`${config.useNative ? 'opacity-30 pointer-events-none' : 'opacity-100'} transition-opacity`}>
               <ApiKeyInput onKeySet={handleKeySet} existingKey={apiKey} />
            </div>
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Sidebar */}
        {hasContent && (
          <Sidebar 
            chunks={chunks}
            outline={outline}
            currentIndex={currentIndex}
            onChunkSelect={handleChunkSelect}
            isOpen={isSidebarOpen}
            onCloseMobile={() => setIsSidebarOpen(false)}
          />
        )}

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto relative w-full">
          {!hasContent && (
             <div className="max-w-lg mx-auto mt-20 text-center px-4">
             <div className="border-2 border-dashed border-gray-700 rounded-2xl p-12 bg-gray-900/50 hover:bg-gray-900 transition-colors">
               <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-6 text-emerald-500">
                 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
                   <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                 </svg>
               </div>
               <h2 className="text-2xl font-bold text-white mb-2">Upload PDF</h2>
               <p className="text-gray-400 mb-6">Select a book to start listening.</p>
               
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
             
             {!apiKey && !config.useNative && (
               <div className="mt-8 p-4 bg-orange-900/20 border border-orange-900/50 rounded text-orange-200 text-sm">
                 Configure Gemini API key above OR toggle "Native" switch to use your browser's offline voice.
               </div>
             )}
           </div>
          )}

          {hasContent && (
             <ReaderView 
               chunks={chunks} 
               currentIndex={currentIndex} 
               onChunkSelect={handleChunkSelect}
             />
          )}
        </main>
      </div>

      {hasContent && (
        <Controls 
          isPlaying={isPlaying} 
          onPlayPause={() => setIsPlaying(!isPlaying)} 
          onReset={handleReset}
          config={config}
          onConfigChange={setConfig}
          progress={currentIndex}
          total={chunks.length}
        />
      )}
    </div>
  );
}