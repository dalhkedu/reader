import React from 'react';
import { Book } from '../types';

interface LibraryViewProps {
  books: Book[];
  onSelectBook: (book: Book) => void;
  onDeleteBook: (id: string) => void;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isProcessing: boolean;
}

export const LibraryView: React.FC<LibraryViewProps> = ({ 
  books, 
  onSelectBook, 
  onDeleteBook, 
  onUpload, 
  isProcessing 
}) => {
  return (
    <div className="max-w-7xl mx-auto p-6 md:p-10 w-full h-full overflow-y-auto">
      <div className="mb-8">
        <h2 className="text-3xl font-serif font-bold text-white mb-2">My Library</h2>
        <p className="text-gray-400">Manage your collection and resume reading.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 pb-20">
        
        {/* Add New Card */}
        <label className={`
          relative group cursor-pointer border-2 border-dashed border-gray-700 bg-gray-900/50 hover:bg-gray-800 hover:border-emerald-500/50 rounded-xl flex flex-col items-center justify-center text-center p-6 transition-all duration-300 min-h-[280px]
          ${isProcessing ? 'opacity-50 pointer-events-none animate-pulse' : ''}
        `}>
          <input 
            type="file" 
            accept="application/pdf" 
            onChange={onUpload}
            disabled={isProcessing}
            className="hidden" 
          />
          <div className="w-14 h-14 bg-gray-800 rounded-full flex items-center justify-center mb-4 text-emerald-500 group-hover:scale-110 transition-transform">
            {isProcessing ? (
               <svg className="animate-spin w-6 h-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
               </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            )}
          </div>
          <span className="font-medium text-gray-300 group-hover:text-white">
            {isProcessing ? 'Processing PDF...' : 'Add New Book'}
          </span>
          <span className="text-xs text-gray-500 mt-2">PDF Format Only</span>
        </label>

        {/* Book Cards */}
        {books.map((book) => {
          const progressPercent = Math.round(((book.progressIndex + 1) / Math.max(book.chunks.length, 1)) * 100);
          
          return (
            <div key={book.id} className="group relative bg-gray-900 border border-gray-800 rounded-xl overflow-hidden hover:border-gray-700 hover:shadow-2xl transition-all duration-300 flex flex-col">
              {/* Cover Area */}
              <div onClick={() => onSelectBook(book)} className="aspect-[2/3] bg-gray-950 relative cursor-pointer overflow-hidden">
                {book.metadata.coverUrl ? (
                  <img src={book.metadata.coverUrl} alt={book.metadata.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-4 text-gray-700">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="w-16 h-16 mb-2">
                       <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                    </svg>
                    <span className="text-xs uppercase tracking-widest">No Cover</span>
                  </div>
                )}
                
                {/* Overlay Play Icon */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
                   <div className="w-12 h-12 bg-emerald-500 rounded-full flex items-center justify-center text-white shadow-lg transform scale-90 group-hover:scale-100 transition-transform">
                     <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 ml-0.5">
                       <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
                     </svg>
                   </div>
                </div>
              </div>

              {/* Info Area */}
              <div className="p-4 flex-1 flex flex-col">
                <h3 onClick={() => onSelectBook(book)} className="text-white font-medium line-clamp-2 leading-tight mb-auto cursor-pointer hover:text-emerald-400 transition-colors">
                  {book.metadata.title || 'Untitled Document'}
                </h3>
                
                <div className="mt-4 space-y-2">
                   {/* Progress Bar */}
                   <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
                      <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${progressPercent}%` }}></div>
                   </div>
                   <div className="flex justify-between items-center text-[10px] text-gray-500 uppercase font-bold tracking-wider">
                      <span>{progressPercent}% Complete</span>
                   </div>
                </div>

                {/* Delete Button (Corner) */}
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    if(confirm('Delete this book from your library?')) onDeleteBook(book.id);
                  }}
                  className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-red-900/80 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur"
                  title="Delete Book"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                </button>
              </div>
            </div>
          )})}
      </div>
    </div>
  );
};
