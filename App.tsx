
import React, { useState, useEffect, useRef } from 'react';
import { parsePdf } from './services/pdfService';
import { generateAudio } from './services/openaiService';
import { speakNative, stopNative } from './services/nativeTtsService';
import { saveBook, getLibrary, updateProgress, deleteBook, addBookmark, removeBookmark } from './services/storageService';
import { ApiKeyInput } from './components/ApiKeyInput';
import { ReaderView } from './components/ReaderView';
import { Controls } from './components/Controls';
import { Sidebar } from './components/Sidebar';
import { LibraryView } from './components/LibraryView';
import { ConfirmationModal } from './components/ConfirmationModal';
import { AudioConfig, TextChunk, AudioCacheItem, PdfOutline, PdfMetadata, Book, Bookmark } from './types';

const STORAGE_KEY = 'lumina_gemini_key';

export default function App() {
  // --- View State ---
  const [currentView, setCurrentView] = useState<'library' | 'reader'>('library');
  
  // --- Global State ---
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [config, setConfig] = useState<AudioConfig>({
    voice: 'Puck',
    speed: 1.0,
    useNative: false,
  });
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);

  // --- Library State ---
  const [library, setLibrary] = useState<Book[]>([]);
  const [isProcessingPdf, setIsProcessingPdf] = useState<boolean>(false);

  // --- Reader State ---
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [chunks, setChunks] = useState<TextChunk[]>([]);
  const [outline, setOutline] = useState<PdfOutline[]>([]);
  const [metadata, setMetadata] = useState<PdfMetadata | undefined>(undefined);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [maxReadIndex, setMaxReadIndex] = useState<number>(-1); // Tracks the furthest read paragraph
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  // --- Navigation Confirmation State ---
  const [pendingJumpIndex, setPendingJumpIndex] = useState<number | null>(null);

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
    
    // Load Library
    loadLibrary();

    return () => {
      cleanupAudio();
    };
  }, []);

  const loadLibrary = async () => {
    try {
      const books = await getLibrary();
      setLibrary(books);
    } catch (e) {
      console.error("Failed to load library", e);
    }
  };

  const cleanupAudio = () => {
    if (audioPlayer.current) {
      audioPlayer.current.pause();
      audioPlayer.current.removeAttribute('src');
    }
    stopNative();
    audioCache.current.forEach((item) => URL.revokeObjectURL(item.blobUrl));
    audioCache.current.clear();
  };

  // Sync refs
  useEffect(() => {
    isPlayingRef.current = isPlaying;
    currentIndexRef.current = currentIndex;
  }, [isPlaying, currentIndex]);

  // Persist Progress (Max Read Index)
  useEffect(() => {
    // We only save if we have a valid book ID and we've actually loaded the book
    if (activeBookId) {
      // We save the MAX read index as the "progress" of the book
      updateProgress(activeBookId, maxReadIndex).catch(console.error);
    }
  }, [maxReadIndex, activeBookId]);

  // Handle HTML Audio Ended
  useEffect(() => {
    if (!audioPlayer.current) return;
    const onEnded = () => handleNextChunk();
    audioPlayer.current.addEventListener('ended', onEnded);
    return () => audioPlayer.current?.removeEventListener('ended', onEnded);
  }, [chunks.length]);

  const handleNextChunk = () => {
    const current = currentIndexRef.current;
    
    // Mark the finished chunk as read if it wasn't already
    setMaxReadIndex(prev => Math.max(prev, current));

    const nextIndex = current + 1;
    if (nextIndex < chunks.length) {
      setCurrentIndex(nextIndex);
    } else {
      setIsPlaying(false);
    }
  };

  // --- Actions ---

  const handleKeySet = (key: string) => {
    setApiKey(key);
    localStorage.setItem(STORAGE_KEY, key);
  };

  const handleModeSwitch = (mode: 'native' | 'gemini') => {
    if (mode === 'native') {
        setConfig(prev => ({ ...prev, useNative: true }));
        setIsKeyModalOpen(false);
    } else {
        setConfig(prev => ({ ...prev, useNative: false }));
        setIsKeyModalOpen(true);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingPdf(true);
    try {
      const pdfResult = await parsePdf(file);
      // Save to DB
      const newBook = await saveBook(pdfResult);
      // Refresh Library
      await loadLibrary();
      // Select and Open
      openBook(newBook);
    } catch (err: any) {
      console.error(err);
      if (err.message === 'SCANNED_PDF_DETECTED') {
         alert('This PDF appears to be scanned (images only). Lumina requires text-based PDFs.');
      } else {
        alert('Error parsing PDF.');
      }
    } finally {
      setIsProcessingPdf(false);
      // Reset input to allow re-uploading same file
      e.target.value = '';
    }
  };

  const openBook = (book: Book) => {
    // 1. Stop current playback
    setIsPlaying(false);
    cleanupAudio();
    
    // 2. Set Data
    setActiveBookId(book.id);
    setChunks(book.chunks);
    setOutline(book.outline);
    setMetadata(book.metadata);
    setBookmarks(book.bookmarks || []);
    
    // 3. Resume from history
    const savedProgress = book.progressIndex ?? -1;
    setMaxReadIndex(savedProgress);
    setCurrentIndex(savedProgress < 0 ? 0 : savedProgress);
    
    // 4. Switch View
    setCurrentView('reader');
  };

  const handleBackToLibrary = () => {
    setIsPlaying(false);
    cleanupAudio();
    setActiveBookId(null);
    loadLibrary(); // Reload to update progress bars with latest data
    setCurrentView('library');
  };

  const handleDeleteBook = async (id: string) => {
    try {
      await deleteBook(id);
      await loadLibrary();
    } catch (e) {
      console.error("Failed to delete book", e);
      alert("Failed to delete book. Please try again.");
    }
  };

  const handleToggleRead = (index: number) => {
    if (index <= maxReadIndex) {
      setMaxReadIndex(index - 1);
    } else {
      setMaxReadIndex(index);
    }
  };

  const handleToggleBookmark = async (index: number) => {
    if (!activeBookId) return;

    const existingBookmark = bookmarks.find(b => b.chunkIndex === index);
    
    if (existingBookmark) {
      // Remove
      try {
        await removeBookmark(activeBookId, existingBookmark.id);
        setBookmarks(prev => prev.filter(b => b.id !== existingBookmark.id));
      } catch (e) {
        console.error("Failed to remove bookmark", e);
      }
    } else {
      // Add
      const chunk = chunks[index];
      const newBookmark: Bookmark = {
        id: crypto.randomUUID(),
        chunkIndex: index,
        label: chunk.text.substring(0, 100),
        createdAt: Date.now()
      };
      
      try {
        await addBookmark(activeBookId, newBookmark);
        setBookmarks(prev => [...prev, newBookmark]);
      } catch (e) {
        console.error("Failed to add bookmark", e);
      }
    }
  };

  const handleDeleteBookmark = async (bookmarkId: string) => {
     if (!activeBookId) return;
     try {
        await removeBookmark(activeBookId, bookmarkId);
        setBookmarks(prev => prev.filter(b => b.id !== bookmarkId));
     } catch (e) {
        console.error("Failed to delete bookmark", e);
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

  const playNativeChunk = (index: number) => {
    if (index >= chunks.length) {
      setIsPlaying(false);
      return;
    }
    speakNative(
      chunks[index].text,
      config,
      () => { if (isPlayingRef.current) handleNextChunk(); },
      (err) => { console.error("Native TTS Error:", err); setIsPlaying(false); }
    );
  };

  // --- ORCHESTRATOR ---
  useEffect(() => {
    if (currentView !== 'reader' || chunks.length === 0) return;

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
  }, [currentIndex, isPlaying, config.useNative, currentView]);

  // Handle manual play/pause click
  const handlePlayPause = () => {
    if (isPlaying) {
      setIsPlaying(false);
    } else {
      // Trying to play
      if (!config.useNative && !apiKey) {
        setIsKeyModalOpen(true);
        return;
      }
      setIsPlaying(true);
    }
  };

  // Modified to handle interruptions
  const handleChunkSelect = (index: number) => {
    // If playing, we ask for confirmation to avoid wasting tokens or accidental clicks
    if (isPlaying) {
      setPendingJumpIndex(index);
    } else {
      // Not playing, so just jump (and wait for play click)
      setCurrentIndex(index);
    }
  };

  const confirmJump = () => {
    if (pendingJumpIndex !== null) {
      setCurrentIndex(pendingJumpIndex);
      setPendingJumpIndex(null);
      
      if (!config.useNative && !apiKey) {
        setIsKeyModalOpen(true);
        setIsPlaying(false);
      } else {
        setIsPlaying(true);
      }
    }
  };

  const cancelJump = () => {
    setPendingJumpIndex(null);
  };

  const handleReset = () => {
    setIsPlaying(false);
    setCurrentIndex(0);
    if(audioPlayer.current) audioPlayer.current.pause();
    stopNative();
  };

  // --- HELPERS ---
  const estimatedCost = chunks.length > 0 
    ? (chunks.reduce((acc, c) => acc + c.text.length, 0) / 1_000_000) * 0.35 
    : 0;

  // Reading Time Estimate
  const calculateReadingTime = () => {
    if (chunks.length === 0) return null;
    const totalWords = chunks.reduce((acc, c) => acc + c.text.split(/\s+/).length, 0);
    const wordsPerMinute = 150; // Average audiobook speed
    const baseMinutes = totalWords / wordsPerMinute;
    // Adjust for playback speed
    const adjustedMinutes = baseMinutes / config.speed;
    
    const hours = Math.floor(adjustedMinutes / 60);
    const minutes = Math.floor(adjustedMinutes % 60);
    
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  const readingTime = calculateReadingTime();

  // --- RENDER ---
  return (
    <div className="flex flex-col h-[100dvh] bg-gray-950 text-slate-200 selection:bg-emerald-500/30 overflow-hidden relative">
      
      {/* JUMP CONFIRMATION MODAL */}
      {pendingJumpIndex !== null && (
        <ConfirmationModal 
          title="Jump to new section?"
          message="Playback is currently active. Jumping to a new section will stop the current audio and generate new audio. Do you want to continue?"
          onConfirm={confirmJump}
          onCancel={cancelJump}
        />
      )}

      {/* KEY CONFIG MODAL */}
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
           {currentView === 'reader' && (
             <button 
               onClick={() => setIsSidebarOpen(!isSidebarOpen)}
               className="md:hidden p-1.5 -ml-1.5 text-gray-400 hover:text-white"
             >
               <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
             </button>
           )}
          
          <div className="flex items-center gap-2 cursor-pointer" onClick={handleBackToLibrary}>
             <div className="w-7 h-7 bg-gradient-to-br from-emerald-500 to-blue-600 rounded flex items-center justify-center shadow-lg shadow-emerald-900/20">
                 <span className="font-serif font-bold text-white text-base">L</span>
             </div>
             <h1 className="text-lg font-bold tracking-tight text-white hidden sm:block">Lumina</h1>
          </div>
        </div>
        
        {/* Right Actions */}
        <div className="flex items-center gap-4">
            
            {/* Back to Library Button (Reader Mode) */}
            {currentView === 'reader' && (
               <button 
                 onClick={handleBackToLibrary}
                 className="hidden md:flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-white bg-gray-900 hover:bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-800 transition-colors"
               >
                 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 5.25h16.5m-16.5 4.5h16.5m-16.5 4.5h16.5m-16.5 4.5h16.5" />
                 </svg>
                 Library
               </button>
            )}

            {/* Reading Time */}
            {currentView === 'reader' && readingTime && (
                <div className="hidden md:flex flex-col items-end leading-none">
                    <span className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Time</span>
                    <span className="text-xs text-gray-300 font-mono">
                        {readingTime}
                    </span>
                </div>
            )}

            {/* Cost Estimate */}
            {currentView === 'reader' && !config.useNative && (
                <div className="hidden md:flex flex-col items-end leading-none">
                    <span className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Est. Cost</span>
                    <span className="text-xs text-emerald-400 font-mono">
                        ${estimatedCost.toFixed(3)}
                    </span>
                </div>
            )}

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
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex-1 flex overflow-hidden relative">
        
        {/* View: LIBRARY */}
        {currentView === 'library' && (
           <LibraryView 
             books={library} 
             onSelectBook={openBook} 
             onDeleteBook={handleDeleteBook}
             onUpload={handleFileUpload}
             isProcessing={isProcessingPdf}
           />
        )}

        {/* View: READER */}
        {currentView === 'reader' && (
           <>
              <Sidebar 
                chunks={chunks}
                outline={outline}
                bookmarks={bookmarks}
                currentIndex={currentIndex}
                onChunkSelect={handleChunkSelect}
                onDeleteBookmark={handleDeleteBookmark}
                isOpen={isSidebarOpen}
                onCloseMobile={() => setIsSidebarOpen(false)}
              />
              
              <main className="flex-1 overflow-y-auto relative w-full">
                <ReaderView 
                  chunks={chunks} 
                  currentIndex={currentIndex}
                  maxReadIndex={maxReadIndex}
                  bookmarks={bookmarks}
                  onChunkSelect={handleChunkSelect} 
                  onToggleRead={handleToggleRead}
                  onToggleBookmark={handleToggleBookmark}
                />
              </main>
           </>
        )}
      </div>

      {currentView === 'reader' && (
        <Controls 
          isPlaying={isPlaying} 
          onPlayPause={handlePlayPause} 
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
