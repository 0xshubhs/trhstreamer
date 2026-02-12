'use client';

import { useEffect, useRef, useState } from 'react';
import PlayerShell from './PlayerShell';
import { log } from '@/lib/logger';

interface TorrentFile {
  name: string;
  length: number;
  index: number;
}

interface TorrentMeta {
  id: string;
  name: string;
  files: TorrentFile[];
  totalSize: number;
  infoHash: string;
}

interface Props {
  magnetUri: string;
  serverUrl: string;
  apiKey?: string;
  onError: (error: string) => void;
}

export default function ServerTorrentPlayer({ magnetUri, serverUrl, apiKey, onError }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<TorrentMeta | null>(null);
  const [selectedFile, setSelectedFile] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (apiKey) headers['x-api-key'] = apiKey;

        const res = await fetch(`${serverUrl}/api/torrent/add`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ magnetUri }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(data.error || 'Failed to add torrent');
        }

        const data: TorrentMeta = await res.json();
        if (cancelled) return;

        log.debug('Torrent metadata received:', data.name);
        setMeta(data);

        const playable = data.files.findIndex((f) => /\.(mp4|webm|ogg)$/i.test(f.name));
        if (playable === -1) {
          onError('No playable video file found in torrent');
          setLoading(false);
          return;
        }

        setSelectedFile(playable);
        setStreamSource(data.id, playable);
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          onError(err instanceof Error ? err.message : 'Unknown error');
          setLoading(false);
        }
      }
    }

    function setStreamSource(id: string, fileIndex: number) {
      if (!videoRef.current) return;
      const params = apiKey ? `?apiKey=${encodeURIComponent(apiKey)}` : '';
      videoRef.current.src = `${serverUrl}/api/torrent/stream/${id}/${fileIndex}${params}`;
      videoRef.current.load();
    }

    init();
    return () => { cancelled = true; };
  }, [magnetUri, serverUrl, apiKey, onError]);

  function handleFileSelect(index: number) {
    if (!meta) return;
    setSelectedFile(index);
    const params = apiKey ? `?apiKey=${encodeURIComponent(apiKey)}` : '';
    if (videoRef.current) {
      videoRef.current.src = `${serverUrl}/api/torrent/stream/${meta.id}/${index}${params}`;
      videoRef.current.load();
    }
  }

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
  };

  return (
    <PlayerShell
      loading={loading}
      loadingText="Connecting to server and loading torrent..."
      info={
        meta && (
          <div>
            <h3 className="font-semibold text-lg mb-1">{meta.name}</h3>
            <p className="text-sm text-gray-600 mb-2">
              Server-side streaming &middot; {meta.files.length} file(s)
              {meta.totalSize > 0 && ` &middot; ${formatBytes(meta.totalSize)}`}
            </p>
            {meta.files.length > 1 && (
              <div className="max-h-32 overflow-y-auto space-y-1">
                {meta.files.map((file) => (
                  <div
                    key={file.index}
                    onClick={() => handleFileSelect(file.index)}
                    className={`text-sm p-2 rounded cursor-pointer ${
                      file.index === selectedFile
                        ? 'bg-blue-100 border border-blue-300'
                        : 'hover:bg-gray-100'
                    }`}
                  >
                    {file.name} ({formatBytes(file.length)})
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      }
    >
      <video
        ref={videoRef}
        className="w-full aspect-video bg-black"
        controls
        autoPlay
        playsInline
      />
    </PlayerShell>
  );
}
