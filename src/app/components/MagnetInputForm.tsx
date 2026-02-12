'use client';

import { useState } from 'react';
import { detectStreamType, type StreamType } from '@/lib/url-detection';

interface MagnetInputFormProps {
  onSubmit: (url: string, type: StreamType) => void;
}

export default function MagnetInputForm({ onSubmit }: MagnetInputFormProps) {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmed = input.trim();
    const type = detectStreamType(trimmed);

    if (!type) {
      setError('Please enter a valid magnet link, HLS playlist URL (.m3u8), or direct video URL');
      return;
    }

    onSubmit(trimmed, type);
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setInput(text);
    } catch {
      setError('Failed to read clipboard. Please paste manually.');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-md">
      <div className="mb-4">
        <label htmlFor="stream-input" className="block text-sm font-medium text-gray-700 mb-2">
          Magnet Link, HLS Playlist, or Video URL
        </label>
        <div className="flex gap-2">
          <input
            id="stream-input"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="magnet:?xt=... / https://...m3u8 / https://...mp4"
            className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            type="button"
            onClick={handlePaste}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
          >
            Paste
          </button>
        </div>
        {error && (
          <p className="mt-2 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
      </div>

      <button
        type="submit"
        className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:bg-gray-400"
        disabled={!input.trim()}
      >
        Stream
      </button>

      <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
        <p className="text-sm text-yellow-800">
          <strong>Legal Notice:</strong> Only use this tool with content you have the right to access.
          Streaming copyrighted material without permission is illegal.
        </p>
      </div>

      <div className="mt-3 text-xs text-gray-500">
        <p>Supported formats: Magnet links, .m3u8 HLS playlists, direct video URLs (.mp4, .webm, .mkv, etc.)</p>
      </div>
    </form>
  );
}
