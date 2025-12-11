import React, { useEffect, useRef } from 'react';
import { TextChunk, Bookmark } from '../types';

interface ReaderViewProps {
  chunks: TextChunk[];
  currentIndex: number;
  maxReadIndex: number;
  bookmarks: Bookmark[];
  onChunkSelect: (index: number) => void;
  onToggleRead: (index: number) => void;
  onToggleBookmark: (index: number) => void;
}

export const ReaderView: React.FC<ReaderViewProps> = ({ 
  chunks, 
  currentIndex, 
  maxReadIndex,
  bookmarks,
  onChunkSelect,
  onToggleRead,
  onToggleBookmark
}) => {
  const activeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [currentIndex]);

  return (
    <div className="max-w-3xl mx-auto pb-32 px-4 md:px-6 pt-6">
      <div className="space-y-4">
        {chunks.map((chunk, index) => {
          const isActive = index === currentIndex;
          const isRead = index <= maxReadIndex;
          const isBookmarked = bookmarks.some(b => b.chunkIndex === index);
          
          return (
            <div
              key={chunk.id}
              ref={isActive ? activeRef : null}
              className={`
                group relative flex gap-4 transition-all duration-300 ease-in-out rounded-xl p-4 md:p-6
                ${isActive 
                  ? 'bg-gray-800/90 shadow-lg ring-1 ring-emerald-500/50 border-l-4 border-emerald-500' 
                  : 'hover:bg-gray-900/50 border-l-4 border-transparent'}
              `}
            >
              {/* Checkbox / Status Indicator */}
              <div className="flex-none pt-1 flex flex-col gap-2 items-center">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleRead(index);
                  }}
                  className={`
                    w-6 h-6 rounded-full border flex items-center justify-center transition-all duration-200
                    ${isRead 
                      ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm shadow-emerald-900/40' 
                      : 'border-gray-600 text-transparent hover:border-emerald-500 hover:text-emerald-500/30 bg-transparent'}
                  `}
                  title={isRead ? "Mark as unread" : "Mark as read"}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>

              {/* Text Content */}
              <div 
                className="flex-1 cursor-pointer"
                onClick={() => onChunkSelect(index)}
              >
                <div className="flex justify-between items-start mb-2">
                    <div className="opacity-50 text-[10px] uppercase font-mono tracking-wider pt-1">
                        <span className="mr-3">
                            {isActive ? 'Now Playing' : (isRead ? 'Read' : 'Unread')}
                        </span>
                        <span>Page {chunk.pageNumber}</span>
                    </div>

                    {/* Bookmark Toggle */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggleBookmark(index);
                        }}
                        className={`
                             p-1.5 rounded transition-colors
                             ${isBookmarked 
                                ? 'text-amber-400 hover:text-amber-300' 
                                : 'text-gray-600 hover:text-amber-500/50 opacity-0 group-hover:opacity-100'}
                        `}
                        title={isBookmarked ? "Remove Bookmark" : "Add Bookmark"}
                    >
                        {isBookmarked ? (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                                <path fillRule="evenodd" d="M6.32 2.577a49.255 49.255 0 0111.36 0c1.497.174 2.57 1.46 2.57 2.93V21a.75.75 0 01-1.085.67L12 18.089l-7.165 3.583A.75.75 0 013.75 21V5.507c0-1.47 1.073-2.756 2.57-2.93z" clipRule="evenodd" />
                            </svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0111.186 0z" />
                            </svg>
                        )}
                    </button>
                </div>

                <p className={`
                  font-serif text-lg md:text-xl leading-relaxed whitespace-pre-line transition-colors
                  ${isActive ? 'text-gray-100' : (isRead ? 'text-gray-400' : 'text-gray-300 group-hover:text-gray-200')}
                `}>
                  {chunk.text}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};