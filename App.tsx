import React, { useState, useEffect, useRef } from 'react';
import { parsePdf } from './services/pdfService';
import { generateAudio } from './services/openaiService';
import { speakNative, stopNative, resumeNative, pauseNative } from './services/nativeTtsService';
import { ApiKeyInput } from './components/ApiKeyInput';
import { ReaderView } from './components/ReaderView';
import { Controls } from './components/Controls';
import { Sidebar } from './components/Sidebar';
import { AudioConfig, TextChunk, AudioCacheItem, PdfOutline, PdfMetadata } from './types';

const STORAGE_KEY = 'lumina_gemini_key';

export default function App() {
  // --- State ---
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [chunks, setChunks] = useState<TextChunk[]>([]);
  const [outline, setOutline] = useState<PdfOutline[]>([]);
  const [metadata, setMetadata] = useState<PdfMetadata | undefined>(undefined);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isProcessingPdf, setIsProcessingPdf] = useState<boolean>(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [scannedError, setScannedError] = useState(false);
  
  // Modal State
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  
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
    setIsKeyModalOpen(false); // Auto close on save
  };

  const handleModeSwitch = (mode: 'native' | 'gemini') => {
    if (mode === 'native') {
        setConfig(prev => ({ ...prev, useNative: true }));
        setIsKeyModalOpen(false);
    } else {
        setConfig(prev => ({ ...prev, useNative: false }));
        // Open modal if no key or explicitly clicked to configure
        setIsKeyModalOpen(true);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingPdf(true);
    setChunks([]);
    setOutline([]);
    setMetadata(undefined);
    setScannedError(false);
    setCurrentIndex(0);
    setIsPlaying(false);
    stopNative();
    
    // Clear cache
    audioCache.current.forEach((item) => URL.revokeObjectURL(item.blobUrl));
    audioCache.current.clear();

    try {
      const { chunks: textChunks, outline: pdfOutline, metadata: pdfMeta } = await parsePdf(file);
      setChunks(textChunks);
      setOutline(pdfOutline);
      setMetadata(pdfMeta);
    } catch (err: any) {
      console.error(err);
      if (err.message === 'SCANNED_PDF_DETECTED') {
        setScannedError(true);
      } else {
        alert('Error parsing PDF. Please ensure it is a valid text-based PDF.');
      }
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
        setIsPlaying(false);
      }
    );
  };

  // --- ORCHESTRATOR ---
  useEffect(() => {
    if (chunks.length === 0) return;

    if (isPlaying) {
      if (config.useNative) {
        if (audioPlayer.current) audioPlayer.current.pause();
        playNativeChunk(currentIndex);

      } else {
        stopNative();
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
      if (audioPlayer.current) audioPlayer.current.pause();
      stopNative(); 
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

  if (scannedError) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="bg-gray-900 border border-red-900/50 p-8 rounded-2xl max-w-md text-center shadow-2xl">
           <div className="w-16 h-16 bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4 text-red-500">
             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
               <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
             </svg>
           </div>
           <h2 className="text-xl font-bold text-white mb-2">Scanned PDF Detected</h2>
           <p className="text-gray-400 mb-6">
             This PDF appears to consist entirely of images (scanned pages) with no extractable text. 
             Lumina requires text-based PDFs to generate audio.
           </p>
           <button 
             onClick={() => window.location.reload()}
             className="bg-gray-800 hover:bg-gray-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
           >
             Try Another Book
           </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-slate-200 selection:bg-emerald-500/30 overflow-hidden relative">
      
      {/* KEY CONFIG MODAL (Absolute Overlay) */}
      {isKeyModalOpen && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-gray-900 border border-gray-800 p-6 md:p-8 rounded-2xl shadow-2xl max-w-md w-full relative" onClick={(e) => e.stopPropagation()}>
            <ApiKeyInput 
              onKeySet={handleKeySet} 
              existingKey={apiKey} 
              onClose={() => setIsKeyModalOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Header */}
      <header className="flex-none bg-gray-950/80 backdrop-blur border-b border-gray-800 h-14 flex items-center justify-between px-3 md:px-6 z-50">
        <div className="flex items-center gap-3">
           {hasContent && (
             <button 
               onClick={() => setIsSidebarOpen(!isSidebarOpen)}
               className="md:hidden p-1.5 -ml-1.5 text-gray-400 hover:text-white"
             >
               <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
             </button>
           )}
          <div className="w-7 h-7 bg-gradient-to-br from-emerald-500 to-blue-600 rounded flex items-center justify-center shadow-lg shadow-emerald-900/20">
              <span className="font-serif font-bold text-white text-base">L</span>
          </div>
          <h1 className="text-lg font-bold tracking-tight text-white hidden sm:block">Lumina</h1>
        </div>
        
        {/* Engine Switcher */}
        <div className="flex bg-gray-900 rounded-lg p-1 border border-gray-800">
            <button
                onClick={() => handleModeSwitch('native')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all duration-200 ${
                    config.useNative 
                        ? 'bg-emerald-600 text-white shadow' 
                        : 'text-gray-400 hover:text-gray-200'
                }`}
            >
                Native
            </button>
            <button
                onClick={() => handleModeSwitch('gemini')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all duration-200 flex items-center gap-1 ${
                    !config.useNative 
                        ? 'bg-blue-600 text-white shadow' 
                        : 'text-gray-400 hover:text-gray-200'
                }`}
            >
                Gemini
                {!apiKey && !config.useNative && (
                   <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                )}
            </button>
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
                   Extracting text, analyzing chapters, and generating cover...
                 </div>
               )}
             </div>
             
             {!apiKey && !config.useNative && (
               <div className="mt-8 p-4 bg-blue-900/20 border border-blue-900/50 rounded text-blue-200 text-sm text-center">
                 Tip: Select <b>Gemini</b> in the top right to configure your API Key.
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
          metadata={metadata}
        />
      )}
    </div>
  );
}