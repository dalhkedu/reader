import React, { useState, useEffect } from 'react';

interface ApiKeyInputProps {
  onKeySet: (key: string) => void;
  existingKey: string | null;
  onClose?: () => void;
}

export const ApiKeyInput: React.FC<ApiKeyInputProps> = ({ onKeySet, existingKey, onClose }) => {
  const [key, setKey] = useState('');

  useEffect(() => {
    if (existingKey) {
      setKey(existingKey);
    }
  }, [existingKey]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (key.trim().length > 0) {
      onKeySet(key.trim());
      if (onClose) onClose();
    } else {
      alert('Please enter a valid API Key');
    }
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-emerald-400">Gemini Configuration</h3>
        {onClose && (
          <button onClick={onClose} className="text-gray-500 hover:text-white">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
      
      <p className="text-sm text-gray-400 mb-6 leading-relaxed">
        Enter your Google GenAI API Key to enable high-quality neural Text-to-Speech. 
        <br/>
        <span className="text-xs opacity-70">The key is stored locally in your browser and sent directly to Google.</span>
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">API Key</label>
            <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="AIzaSy..."
            className="w-full bg-gray-950 border border-gray-700 text-white px-4 py-3 rounded focus:outline-none focus:border-emerald-500 font-mono text-sm"
            autoFocus
            />
        </div>
        
        <div className="flex justify-end gap-3 mt-2">
            {onClose && (
                <button 
                    type="button" 
                    onClick={onClose}
                    className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                >
                    Cancel
                </button>
            )}
            <button
            type="submit"
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded font-medium transition-colors shadow-lg shadow-emerald-900/20"
            >
            Save Key
            </button>
        </div>
      </form>
    </div>
  );
};