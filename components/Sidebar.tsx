import React, { useEffect, useRef, useState } from 'react';
import { TextChunk, PdfOutline } from '../types';

interface SidebarProps {
  chunks: TextChunk[];
  outline: PdfOutline[];
  currentIndex: number;
  onChunkSelect: (index: number) => void;
  isOpen: boolean;
  onCloseMobile: () => void;
}

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
  const activeItemRef = useRef<HTMLDivElement>(null);

  // Auto-switch to segments if no outline
  useEffect(() => {
    if (outline.length === 0 && chunks.length > 0) {
      setActiveTab('segments');
    }
  }, [outline, chunks]);

  // Scroll active segment into view
  useEffect(() => {
    if (activeTab === 'segments' && activeItemRef.current && scrollRef.current) {
      const parent = scrollRef.current;
      const element = activeItemRef.current;
      const parentTop = parent.scrollTop;
      const parentBottom = parentTop + parent.clientHeight;
      const elementTop = element.offsetTop;
      const elementBottom = elementTop + element.clientHeight;

      if (elementTop < parentTop || elementBottom > parentBottom) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentIndex, activeTab]);

  const handleChapterClick = (pageNumber: number | null) => {
    if (pageNumber === null) return;
    // Find the first chunk that belongs to this page
    const targetIndex = chunks.findIndex(c => c.pageNumber >= pageNumber);
    if (targetIndex !== -1) {
      onChunkSelect(targetIndex);
      onCloseMobile();
    }
  };

  const sidebarClasses = `
    fixed inset-y-0 left-0 z-40 w-72 bg-gray-900 border-r border-gray-800 transform transition-transform duration-300 ease-in-out flex flex-col
    ${isOpen ? 'translate-x-0' : '-translate-x-full'}
    md:translate-x-0 md:static md:h-[calc(100vh-64px)]
  `;

  return (
    <>
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
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
        <div className="flex-1 overflow-y-auto p-2" ref={scrollRef}>
          
          {/* Outline View */}
          {activeTab === 'chapters' && (
            <div className="space-y-1">
               <OutlineList nodes={outline} onSelect={handleChapterClick} level={0} />
            </div>
          )}

          {/* Segments View */}
          {activeTab === 'segments' && (
            <div className="space-y-1">
              {chunks.map((chunk, index) => {
                const isActive = index === currentIndex;
                return (
                  <div
                    key={chunk.id}
                    ref={isActive ? activeItemRef : null}
                    onClick={() => {
                      onChunkSelect(index);
                      onCloseMobile();
                    }}
                    className={`
                      cursor-pointer p-3 rounded text-sm transition-colors border-l-2 flex flex-col gap-1
                      ${isActive 
                        ? 'bg-gray-800 border-emerald-500 text-white' 
                        : 'border-transparent text-gray-500 hover:bg-gray-800/50 hover:text-gray-300'}
                    `}
                  >
                    <div className="flex justify-between items-center text-xs opacity-50 font-mono">
                      <span>#{index + 1}</span>
                      <span>Page {chunk.pageNumber}</span>
                    </div>
                    <span className="line-clamp-2">
                      {chunk.text.substring(0, 60)}...
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
  level: number 
}> = ({ nodes, onSelect, level }) => {
  if (!nodes || nodes.length === 0) return null;

  return (
    <>
      {nodes.map((node, i) => (
        <React.Fragment key={i}>
          <div
            onClick={() => onSelect(node.pageNumber)}
            className={`
              group flex items-center py-2 px-3 rounded cursor-pointer hover:bg-gray-800 transition-colors
              ${node.pageNumber === null ? 'opacity-50 cursor-default' : ''}
            `}
            style={{ paddingLeft: `${(level * 12) + 12}px` }}
          >
             {/* Bullet / Icon */}
             <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/50 mr-3 flex-shrink-0 group-hover:bg-emerald-400"></span>
             
             <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-300 truncate group-hover:text-white">
                  {node.title}
                </p>
                {node.pageNumber && (
                   <p className="text-[10px] text-gray-600 font-mono mt-0.5">Page {node.pageNumber}</p>
                )}
             </div>
          </div>
          
          {/* Recursion */}
          {node.items && node.items.length > 0 && (
            <OutlineList nodes={node.items} onSelect={onSelect} level={level + 1} />
          )}
        </React.Fragment>
      ))}
    </>
  );
};