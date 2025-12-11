import React, { useEffect, useRef, useState, useMemo } from 'react';
import { TextChunk, PdfOutline, Bookmark, PdfMetadata } from '../types';

interface SidebarProps {
  chunks: TextChunk[];
  outline: PdfOutline[];
  bookmarks: Bookmark[];
  metadata?: PdfMetadata; // Added metadata for citation context
  currentIndex: number;
  onChunkSelect: (index: number) => void;
  onDeleteBookmark: (bookmarkId: string) => void;
  isOpen: boolean;
  onCloseMobile: () => void;
}

// Helper: Add unique IDs to outline nodes based on their tree position
interface EnrichedOutline extends PdfOutline {
  uniqueId: string; // e.g., "root-0", "root-0-1"
  items: EnrichedOutline[];
}

const enrichOutline = (nodes: PdfOutline[], parentId: string = 'root'): EnrichedOutline[] => {
  return nodes.map((node, index) => {
    const uniqueId = `${parentId}-${index}`;
    return {
      ...node,
      uniqueId,
      items: enrichOutline(node.items || [], uniqueId)
    };
  });
};

const flattenEnrichedOutline = (nodes: EnrichedOutline[]): EnrichedOutline[] => {
  let result: EnrichedOutline[] = [];
  for (const node of nodes) {
    result.push(node);
    if (node.items && node.items.length > 0) {
      result = result.concat(flattenEnrichedOutline(node.items));
    }
  }
  return result;
};

export const Sidebar: React.FC<SidebarProps> = ({ 
  chunks, 
  outline,
  bookmarks,
  metadata,
  currentIndex, 
  onChunkSelect,
  onDeleteBookmark,
  isOpen,
  onCloseMobile
}) => {
  const [activeTab, setActiveTab] = useState<'chapters' | 'segments' | 'bookmarks'>('chapters');
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Refs for scrolling
  const chapterRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const segmentRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const currentPage = chunks[currentIndex]?.pageNumber || 1;

  // Enrich outline with stable IDs
  const enrichedOutline = useMemo(() => enrichOutline(outline), [outline]);

  // Determine active chapter based on current page
  const activeChapterId = useMemo(() => {
    const flat = flattenEnrichedOutline(enrichedOutline);
    // Sort primarily by page number to handle order correctly
    flat.sort((a, b) => (a.pageNumber || 0) - (b.pageNumber || 0));
    
    let candidateId: string | null = null;
    
    for (const node of flat) {
      if (node.pageNumber !== null && node.pageNumber <= currentPage) {
        candidateId = node.uniqueId;
      }
    }
    return candidateId;
  }, [enrichedOutline, currentPage]);

  // Auto-switch tabs if needed
  useEffect(() => {
    if (outline.length === 0 && chunks.length > 0 && activeTab === 'chapters') {
      setActiveTab('segments');
    }
  }, [outline, chunks]);

  // Scroll Active Chapter into view
  useEffect(() => {
    if (activeTab === 'chapters' && activeChapterId) {
        const element = chapterRefs.current.get(activeChapterId);
        if (element && scrollRef.current) {
            scrollToElement(element, scrollRef.current);
        }
    }
  }, [activeChapterId, activeTab]);

  // Scroll Active Segment into view
  useEffect(() => {
    if (activeTab === 'segments') {
      const element = segmentRefs.current.get(currentIndex);
      if (element && scrollRef.current) {
        scrollToElement(element, scrollRef.current);
      }
    }
  }, [currentIndex, activeTab]);

  const scrollToElement = (element: HTMLElement, parent: HTMLElement) => {
    const parentRect = parent.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    
    // Check if out of view
    if (elementRect.top < parentRect.top || elementRect.bottom > parentRect.bottom) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const handleChapterClick = (pageNumber: number | null) => {
    if (pageNumber === null) return;
    
    const targetIndex = chunks.findIndex(c => c.pageNumber >= pageNumber);
    if (targetIndex !== -1) {
      onChunkSelect(targetIndex);
      onCloseMobile();
    }
  };

  const handleShare = async (e: React.MouseEvent, bookmark: Bookmark) => {
    e.stopPropagation();
    
    // Get full text from the chunk, not just the label snippet
    const fullText = chunks[bookmark.chunkIndex]?.text || bookmark.label;
    
    // Format citation
    const citation = `“${fullText}”\n\n— ${metadata?.title || 'Unknown Title'}${metadata?.author ? `, by ${metadata.author}` : ''}`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: metadata?.title || 'Book Quote',
          text: citation,
        });
      } catch (err) {
        // User canceled share
        console.log('Share canceled');
      }
    } else {
      // Fallback for desktops without native share
      try {
        await navigator.clipboard.writeText(citation);
        alert('Quote copied to clipboard!');
      } catch (err) {
        console.error('Failed to copy', err);
      }
    }
  };

  const sidebarClasses = `
    absolute inset-y-0 left-0 z-40 w-80 bg-gray-900 border-r border-gray-800 transform transition-transform duration-300 ease-in-out flex flex-col h-full
    ${isOpen ? 'translate-x-0' : '-translate-x-full'}
    md:translate-x-0 md:static md:h-full
  `;

  return (
    <>
      {isOpen && (
        <div 
          className="absolute inset-0 bg-black/50 z-30 md:hidden"
          onClick={onCloseMobile}
        />
      )}

      <aside className={sidebarClasses}>
        {/* Tabs */}
        <div className="flex-none bg-gray-900 border-b border-gray-800">
          <div className="flex">
            <button
              onClick={() => setActiveTab('chapters')}
              disabled={outline.length === 0}
              className={`flex-1 py-3 text-[10px] md:text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${
                activeTab === 'chapters' 
                  ? 'border-emerald-500 text-white' 
                  : 'border-transparent text-gray-500 hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed'
              }`}
            >
              Chapters
            </button>
            <button
              onClick={() => setActiveTab('segments')}
              className={`flex-1 py-3 text-[10px] md:text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${
                activeTab === 'segments' 
                  ? 'border-emerald-500 text-white' 
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              Segments
            </button>
            <button
              onClick={() => setActiveTab('bookmarks')}
              className={`flex-1 py-3 text-[10px] md:text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${
                activeTab === 'bookmarks' 
                  ? 'border-emerald-500 text-white' 
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              Bookmarks
            </button>
          </div>
        </div>
          
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-2 scroll-smooth" ref={scrollRef}>
          
          {/* Outline View */}
          {activeTab === 'chapters' && (
            <div className="space-y-1 pb-10">
               <OutlineList 
                 nodes={enrichedOutline} 
                 onSelect={handleChapterClick} 
                 level={0} 
                 activeId={activeChapterId}
                 chapterRefs={chapterRefs}
               />
            </div>
          )}

          {/* Segments View */}
          {activeTab === 'segments' && (
            <div className="space-y-1 pb-10">
              {chunks.map((chunk, index) => {
                const isActive = index === currentIndex;
                
                return (
                  <div
                    key={chunk.id}
                    ref={(el) => {
                      if (el) segmentRefs.current.set(index, el);
                      else segmentRefs.current.delete(index);
                    }}
                    onClick={() => {
                      onChunkSelect(index);
                      onCloseMobile();
                    }}
                    className={`
                      cursor-pointer p-3 rounded text-sm transition-colors border-l-2 flex flex-col gap-1
                      ${isActive 
                        ? 'bg-gray-800 border-emerald-500 text-white shadow-sm' 
                        : 'border-transparent text-gray-500 hover:bg-gray-800/50 hover:text-gray-300'}
                    `}
                  >
                    <div className="flex justify-between items-center text-xs opacity-50 font-mono">
                      <span>#{index + 1}</span>
                      <span>Page {chunk.pageNumber}</span>
                    </div>
                    <span className="line-clamp-2 leading-relaxed">
                      {chunk.text.substring(0, 80)}...
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Bookmarks View */}
          {activeTab === 'bookmarks' && (
             <div className="space-y-2 pb-10">
                {bookmarks.length === 0 ? (
                    <div className="text-center p-6 text-gray-500 text-sm">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-10 h-10 mx-auto mb-2 opacity-50">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0111.186 0z" />
                        </svg>
                        <p>No bookmarks yet.</p>
                        <p className="text-xs mt-1 opacity-70">Tap the bookmark icon on any paragraph to save it here.</p>
                    </div>
                ) : (
                    bookmarks.sort((a,b) => a.chunkIndex - b.chunkIndex).map((b) => (
                        <div key={b.id} className="group relative bg-gray-800/50 hover:bg-gray-800 border border-gray-700/50 hover:border-emerald-500/30 rounded p-3 transition-all cursor-pointer"
                             onClick={() => { onChunkSelect(b.chunkIndex); onCloseMobile(); }}>
                            <div className="flex justify-between items-start mb-1">
                                <span className="text-[10px] uppercase font-bold text-amber-500 tracking-wider">
                                    Page {chunks[b.chunkIndex]?.pageNumber || '?'}
                                </span>
                                
                                <div className="flex items-center gap-1 -mr-2 -mt-2">
                                  {/* Share Button */}
                                  <button
                                      onClick={(e) => handleShare(e, b)}
                                      className="text-gray-500 hover:text-emerald-400 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                      title="Share Quote"
                                  >
                                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                        <path d="M13 4.5a2.5 2.5 0 11.702 1.737L6.97 9.604a2.518 2.518 0 010 .792l6.733 3.367a2.5 2.5 0 11-.671 1.341l-6.733-3.367a2.5 2.5 0 110-3.475l6.733-3.366A2.52 2.52 0 0113 4.5z" />
                                      </svg>
                                  </button>

                                  {/* Delete Button */}
                                  <button
                                      onClick={(e) => { e.stopPropagation(); onDeleteBookmark(b.id); }}
                                      className="text-gray-500 hover:text-red-400 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                      title="Remove Bookmark"
                                  >
                                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                          <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                      </svg>
                                  </button>
                                </div>
                            </div>
                            <p className="text-xs text-gray-300 line-clamp-3 font-serif leading-relaxed">
                                {b.label}
                            </p>
                        </div>
                    ))
                )}
             </div>
          )}
        </div>
      </aside>
    </>
  );
};

// Recursive Outline Component
const OutlineList: React.FC<{ 
  nodes: EnrichedOutline[], 
  onSelect: (page: number | null) => void,
  level: number,
  activeId: string | null,
  chapterRefs: React.MutableRefObject<Map<string, HTMLDivElement>>
}> = ({ nodes, onSelect, level, activeId, chapterRefs }) => {
  if (!nodes || nodes.length === 0) return null;

  return (
    <>
      {nodes.map((node) => {
        const isActive = node.uniqueId === activeId;
        
        return (
        <React.Fragment key={node.uniqueId}>
          <div
            ref={(el) => {
                if (el) chapterRefs.current.set(node.uniqueId, el);
                else chapterRefs.current.delete(node.uniqueId);
            }}
            onClick={() => onSelect(node.pageNumber)}
            className={`
              group flex items-center py-2 px-3 rounded cursor-pointer transition-all duration-200 border-l-2 relative
              ${isActive 
                ? 'bg-emerald-900/30 border-emerald-500 text-emerald-100' 
                : 'border-transparent hover:bg-gray-800/60 text-gray-400 hover:text-gray-200'}
              ${node.pageNumber === null ? 'opacity-50 cursor-default' : ''}
            `}
            style={{ 
                paddingLeft: `${(level * 12) + 12}px`,
                marginLeft: `${level > 0 ? 4 : 0}px`
            }}
          >
             {/* Bullet / Icon */}
             <span className={`w-1.5 h-1.5 rounded-full mr-3 flex-shrink-0 transition-all ${
                 isActive 
                    ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)] scale-125' 
                    : 'bg-gray-600 group-hover:bg-gray-500'
             }`}></span>
             
             <div className="flex-1 min-w-0">
                <p className={`text-sm truncate ${isActive ? 'font-semibold' : 'font-normal'}`}>
                  {node.title}
                </p>
                {node.pageNumber && (
                   <p className={`text-[10px] font-mono mt-0.5 ${isActive ? 'text-emerald-400/70' : 'text-gray-600'}`}>
                     Page {node.pageNumber}
                   </p>
                )}
             </div>
             
             {/* Active indicator bar on the right */}
             {isActive && (
                 <div className="absolute right-2 w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
             )}
          </div>
          
          {/* Recursion */}
          {node.items && node.items.length > 0 && (
            <OutlineList 
                nodes={node.items} 
                onSelect={onSelect} 
                level={level + 1} 
                activeId={activeId}
                chapterRefs={chapterRefs}
            />
          )}
        </React.Fragment>
      )})}
    </>
  );
};