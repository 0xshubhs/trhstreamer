'use client';

import { useState } from 'react';
import MagnetInputForm from './components/MagnetInputForm';
import VideoPlayer from './components/player/VideoPlayer';
import type { StreamType } from '@/lib/url-detection';

export default function Home() {
  const [stream, setStream] = useState<{ url: string; type: StreamType } | null>(null);
  const [error, setError] = useState('');

  const handleSubmit = (url: string, type: StreamType) => {
    setError('');
    setStream({ url, type });
  };

  const handleError = (msg: string) => {
    setError(msg);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold text-gray-900">Stream Player</h1>
          <p className="mt-2 text-sm text-gray-600">
            Torrent, HLS, and direct video streaming
          </p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {!stream ? (
          <div className="mt-8">
            <MagnetInputForm onSubmit={handleSubmit} />
          </div>
        ) : (
          <div className="space-y-6">
            <button
              onClick={() => { setStream(null); setError(''); }}
              className="px-6 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
            >
              Back
            </button>

            {error && (
              <div className="max-w-4xl mx-auto bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-800">{error}</p>
              </div>
            )}

            <VideoPlayer url={stream.url} type={stream.type} onError={handleError} />
          </div>
        )}

        <footer className="mt-16 text-center text-sm text-gray-500">
          <div className="bg-white rounded-lg shadow-sm p-6 max-w-2xl mx-auto">
            <h3 className="font-semibold text-gray-900 mb-2">Legal Notice</h3>
            <p className="mb-2">
              This application is for educational and legal streaming purposes only.
            </p>
            <p>
              <strong>You are solely responsible for ensuring that you have the legal right to access and stream any content.</strong>
            </p>
          </div>
        </footer>
      </main>
    </div>
  );
}
