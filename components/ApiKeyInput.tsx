import React, { useState, useEffect } from 'react';

interface ApiKeyInputProps {
  onKeySet: (key: string) => void;
  existingKey: string | null;
}

export const ApiKeyInput: React.FC<ApiKeyInputProps> = ({ onKeySet, existingKey }) => {
  const [key, setKey] = useState('');
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (existingKey) {
      setKey(existingKey);
      setIsVisible(false);
    }
  }, [existingKey]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (key.trim().length > 0) {
      onKeySet(key.trim());
      setIsVisible(false);
    } else {
      alert('Please enter a valid API Key');
    }
  };

  if (!isVisible) {
    return (
      <button 
        onClick={() => setIsVisible(true)}
        className="text-xs text-gray-500 hover:text-emerald-400 transition-colors"
      >
        Gemini Key Configured (Click to change)
      </button>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto bg-gray-900 border border-gray-800 p-6 rounded-xl shadow-xl">
      <h3 className="text-lg font-semibold text-emerald-400 mb-2">Google Gemini Configuration</h3>
      <p className="text-sm text-gray-400 mb-4">
        Enter your Google GenAI API Key to enable Text-to-Speech. The key is stored locally in your browser and sent directly to Google.
      </p>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="AIzaSy..."
          className="flex-1 bg-gray-950 border border-gray-700 text-white px-4 py-2 rounded focus:outline-none focus:border-emerald-500"
        />
        <button
          type="submit"
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded font-medium transition-colors"
        >
          Save
        </button>
      </form>
    </div>
  );
};