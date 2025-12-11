import React, { useEffect, useRef, useState, useMemo } from 'react';
import { TextChunk, PdfOutline } from '../types';

interface SidebarProps {
  chunks: TextChunk[];
  outline: PdfOutline[];
  currentIndex: number;
  onChunkSelect: (index: number) => void;
  isOpen: boolean;
  onCloseMobile: () => void;
}

// Helper to flatten outline and sort by page number for accurate detection
const flattenOutline = (nodes: PdfOutline[]): PdfOutline[] => {
  let result: PdfOutline[] = [];
  for (const node of nodes) {
    result.push(node);
    if (node.items && node.items.length > 0) {
      result = result.concat(flattenOutline(node.items));
    }
  }
  return result;
};

export const Sidebar: React.FC<SidebarProps> = ({ 
  chunks, 
  outline,
  currentIndex, 
  onChunkSelect,
  isOpen,
  onCloseMobile
}) => {
  const [activeTab, setActiveTab] = useState<'chapters' | 'segments'>('chapters');
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Create a ref map to track all chapter nodes for scrolling
  const chapterRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const currentPage = chunks[currentIndex]?.pageNumber || 1;

  // Auto-switch to segments if no outline
  useEffect(() => {
    if (outline.length === 0 && chunks.length > 0) {
      setActiveTab('segments');
    }
  }, [outline, chunks]);

  // Determine the active chapter node
  const activeChapterNode = useMemo(() => {
    // Flatten and strictly sort by page number to ensure logic works
    const flat = flattenOutline(outline).sort((a, b) => (a.pageNumber || 0) - (b.pageNumber || 0));
    
    let candidate: PdfOutline | null = null;
    
    // Find the deepst/last node that starts on or before the current page
    for (const node of flat) {
      if (node.pageNumber !== null && node.pageNumber <= currentPage) {
        candidate = node;
      }
    }
    return candidate;
  }, [outline, currentPage]);


  // Scroll active item into view
  useEffect(() => {
    if (activeTab === 'chapters' && activeChapterNode) {
        // Generate a key based on title+page to find the ref
        const key = `${activeChapterNode.title}-${activeChapterNode.pageNumber}`;
        const element = chapterRefs.current.get(key);

        if (element && scrollRef.current) {
            const parent = scrollRef.current;
            const parentTop = parent.scrollTop;
            const parentBottom = parentTop + parent.clientHeight;
            const elementTop = element.offsetTop;
            const elementBottom = elementTop + element.clientHeight;

            // Scroll if out of view
            if (elementTop < parentTop + 20 || elementBottom > parentBottom - 20) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }
  }, [activeChapterNode, activeTab]);

  const handleChapterClick = (pageNumber: number | null) => {
    if (pageNumber === null) return;
    
    // Find the first chunk that matches or is closest after the chapter start page
    // This handles cases where the text might start slightly after the page break
    const targetIndex = chunks.findIndex(c => c.pageNumber >= pageNumber);
    
    if (targetIndex !== -1) {
      onChunkSelect(targetIndex);
      onCloseMobile();
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
        {/* Header / Tabs */}
        <div className="flex-none bg-gray-900 border-b border-gray-800">
          <div className="flex">
            <button
              onClick={() => setActiveTab('chapters')}
              disabled={outline.length === 0}
              className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${
                activeTab === 'chapters' 
                  ? 'border-emerald-500 text-white' 
                  : 'border-transparent text-gray-500 hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed'
              }`}
            >
              Chapters
            </button>
            <button
              onClick={() => setActiveTab('segments')}
              className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${
                activeTab === 'segments' 
                  ? 'border-emerald-500 text-white' 
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              Segments
            </button>
          </div>
        </div>
          
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-2 scroll-smooth" ref={scrollRef}>
          
          {/* Outline View */}
          {activeTab === 'chapters' && (
            <div className="space-y-1 pb-10">
               <OutlineList 
                 nodes={outline} 
                 onSelect={handleChapterClick} 
                 level={0} 
                 activeNode={activeChapterNode}
                 chapterRefs={chapterRefs}
               />
            </div>
          )}

          {/* Segments View */}
          {activeTab === 'segments' && (
            <div className="space-y-1 pb-10">
              {chunks.map((chunk, index) => {
                const isActive = index === currentIndex;
                const activeRef = useRef<HTMLDivElement>(null);

                // Auto scroll segments
                useEffect(() => {
                  if (isActive && activeRef.current && activeTab === 'segments') {
                      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }
                }, [isActive]);

                return (
                  <div
                    key={chunk.id}
                    ref={activeRef}
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
        </div>
      </aside>
    </>
  );
};

// Recursive Outline Component
const OutlineList: React.FC<{ 
  nodes: PdfOutline[], 
  onSelect: (page: number | null) => void,
  level: number,
  activeNode: PdfOutline | null,
  chapterRefs: React.MutableRefObject<Map<string, HTMLDivElement>>
}> = ({ nodes, onSelect, level, activeNode, chapterRefs }) => {
  if (!nodes || nodes.length === 0) return null;

  return (
    <>
      {nodes.map((node, i) => {
        const isActive = node === activeNode;
        const key = `${node.title}-${node.pageNumber}`;
        
        return (
        <React.Fragment key={i}>
          <div
            ref={(el) => {
                if (el) chapterRefs.current.set(key, el);
                else chapterRefs.current.delete(key);
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
                activeNode={activeNode}
                chapterRefs={chapterRefs}
            />
          )}
        </React.Fragment>
      )})}
    </>
  );
};
