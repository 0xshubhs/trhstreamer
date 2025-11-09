'use client';

import { useState } from 'react';
import MagnetInputForm from './components/MagnetInputForm';
import TorrentPlayer from './components/TorrentPlayer';
import TorrentPlayerBackend from './components/TorrentPlayerBackend';
import HlsPlayer from './components/HlsPlayer';

interface StreamInfo {
  service: 'nextjs' | 'nodejs';
  streamUrl: string;
  downloadUrl?: string;
  fileSize?: number;
  fileSizeFormatted?: string;
  fileName?: string;
  message?: string;
}

export default function Home() {
  const [activeStream, setActiveStream] = useState<{
    originalUrl: string; // Store the original magnet/m3u8 URL
    streamUrl: string;   // Store the processed stream URL
    type: 'magnet' | 'hls';
    streamInfo?: StreamInfo;
  } | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  console.log('=== PAGE RENDER ===');
  console.log('Active stream:', activeStream);
  console.log('Error:', error);

  const handleSubmit = async (url: string, type: 'magnet' | 'hls') => {
    console.log('=== PAGE: handleSubmit called ===');
    console.log('URL:', url);
    console.log('Type:', type);
    
    setError('');
    setLoading(true);
    
    try {
      // Call the routing API to determine which service to use
      const response = await fetch('/api/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          magnetUri: type === 'magnet' ? url : undefined,
          m3u8Url: type === 'hls' ? url : undefined,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to process stream');
      }
      
      const streamInfo: StreamInfo = await response.json();
      console.log('Stream routing response:', streamInfo);
      
      // Show info about routing decision
      if (streamInfo.message) {
        console.log('Routing message:', streamInfo.message);
      }
      
      // Set the stream with routing info, keeping both original and processed URLs
      setActiveStream({ 
        originalUrl: url,           // Keep the original magnet/m3u8 URL
        streamUrl: streamInfo.streamUrl, // The processed stream URL for display
        type,
        streamInfo 
      });
      
    } catch (err) {
      console.error('=== PAGE: Error during submission ===', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleError = (errorMsg: string) => {
    console.error('=== PAGE: Error received ===');
    console.error('Error message:', errorMsg);
    setError(errorMsg);
  };

  const handleReset = () => {
    console.log('=== PAGE: Reset called ===');
    setActiveStream(null);
    setError('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold text-gray-900">Torrent & HLS Streamer</h1>
          <p className="mt-2 text-sm text-gray-600">
            Stream torrents and HLS playlists directly in your browser
          </p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {!activeStream ? (
          <div className="mt-8">
            {loading ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                <p className="mt-4 text-gray-600">Processing stream request...</p>
              </div>
            ) : (
              <MagnetInputForm onSubmit={handleSubmit} />
            )}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <button
                onClick={handleReset}
                className="px-6 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
              >
                ← Back to Input
              </button>
              
              {activeStream.streamInfo && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
                  <div className="flex items-center gap-2 text-sm">
                    <span className={`inline-block w-2 h-2 rounded-full ${
                      activeStream.streamInfo.service === 'nextjs' ? 'bg-green-500' : 'bg-blue-500'
                    }`}></span>
                    <span className="text-blue-900">
                      {activeStream.streamInfo.message}
                    </span>
                    {activeStream.streamInfo.fileSizeFormatted && (
                      <span className="text-blue-700">
                        ({activeStream.streamInfo.fileSizeFormatted})
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div className="max-w-4xl mx-auto bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-800">{error}</p>
              </div>
            )}

            {activeStream.type === 'magnet' && (
              <>
                {/* 
                  Routing logic:
                  - Large files (>500MB) → Server-side (TorrentPlayerBackend)
                  - Small files (<500MB) → Client-side (TorrentPlayer) 
                  - Unknown size (0) → Server-side (safer default, server will determine size)
                */}
                {activeStream.streamInfo?.service === 'nextjs' && 
                 activeStream.streamInfo?.fileSize !== undefined &&
                 (activeStream.streamInfo.fileSize === 0 || activeStream.streamInfo.fileSize > 500 * 1024 * 1024) ? (
                  <>
                    <div className="max-w-4xl mx-auto mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="inline-block w-2 h-2 rounded-full bg-green-500"></span>
                        <span className="text-green-900 font-medium">
                          🖥️ Server-Side Streaming (Dedicated Backend)
                        </span>
                      </div>
                      <p className="text-xs text-green-700 mt-1 ml-4">
                        {activeStream.streamInfo.fileSize === 0 
                          ? 'File size unknown - server will determine size from peers and handle streaming'
                          : 'Large file detected - using dedicated server with more resources for optimal performance'
                        }
                      </p>
                    </div>
                    <TorrentPlayerBackend magnet={activeStream.originalUrl} onError={handleError} />
                  </>
                ) : (
                  <>
                    <div className="max-w-4xl mx-auto mb-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="inline-block w-2 h-2 rounded-full bg-purple-500"></span>
                        <span className="text-purple-900 font-medium">
                          🌐 Client-Side Streaming (WebTorrent in Browser)
                        </span>
                      </div>
                      <p className="text-xs text-purple-700 mt-1 ml-4">
                        Small file - streaming directly in your browser for quick playback
                      </p>
                    </div>
                    <TorrentPlayer magnet={activeStream.originalUrl} onError={handleError} />
                  </>
                )}
                {activeStream.streamInfo?.downloadUrl && (
                  <div className="text-center">
                    <a
                      href={activeStream.streamInfo.downloadUrl}
                      className="inline-block px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                      download
                    >
                      ⬇️ Download File
                    </a>
                  </div>
                )}
              </>
            )}

            {activeStream.type === 'hls' && (
              <>
                <HlsPlayer m3u8Url={activeStream.originalUrl} onError={handleError} />
                {activeStream.streamInfo?.downloadUrl && (
                  <div className="text-center">
                    <a
                      href={activeStream.streamInfo.downloadUrl}
                      className="inline-block px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                      download
                    >
                      ⬇️ Download Stream
                    </a>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <footer className="mt-16 text-center text-sm text-gray-500">
          <div className="bg-white rounded-lg shadow-sm p-6 max-w-2xl mx-auto">
            <h3 className="font-semibold text-gray-900 mb-2">Legal Notice & Disclaimer</h3>
            <p className="mb-2">
              This application is for educational and legal streaming purposes only.
            </p>
            <p className="mb-2">
              <strong>You are solely responsible for ensuring that you have the legal right to access and stream any content.</strong>
            </p>
            <p>
              Unauthorized distribution or streaming of copyrighted content is illegal and may result in civil and criminal penalties.
            </p>
            <div className="mt-4">
              <a href="#" className="text-blue-600 hover:underline">Report DMCA Issue</a>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}

