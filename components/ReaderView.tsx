import React, { useEffect, useRef } from 'react';
import { TextChunk } from '../types';

interface ReaderViewProps {
  chunks: TextChunk[];
  currentIndex: number;
}

export const ReaderView: React.FC<ReaderViewProps> = ({ chunks, currentIndex }) => {
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
    <div className="max-w-2xl mx-auto pb-32 px-4 md:px-0">
      <div className="space-y-6">
        {chunks.map((chunk, index) => {
          const isActive = index === currentIndex;
          return (
            <div
              key={chunk.id}
              ref={isActive ? activeRef : null}
              className={`transition-all duration-500 ease-in-out rounded-lg p-4 md:p-6 ${
                isActive
                  ? 'bg-gray-800/80 shadow-lg ring-1 ring-emerald-500/30 border-l-4 border-emerald-500 text-gray-100 scale-[1.02]'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              <p className="font-serif text-lg md:text-xl leading-relaxed whitespace-pre-line">
                {chunk.text}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
};