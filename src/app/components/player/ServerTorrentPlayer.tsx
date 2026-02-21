'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import PlayerShell from './PlayerShell';
import { useTorrentProgress } from '@/lib/hooks/useTorrentProgress';
import { log } from '@/lib/logger';

interface Props {
  magnetUri: string;
  serverUrl: string;
  apiKey?: string;
  onError: (error: string) => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
}

function formatSpeed(bytesPerSec: number): string {
  return formatBytes(bytesPerSec) + '/s';
}

export default function ServerTorrentPlayer({ magnetUri, serverUrl, apiKey, onError }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // torrentId arrives immediately from POST /api/torrent/add (no more 30s wait)
  const [torrentId, setTorrentId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState(0);
  const [videoReady, setVideoReady] = useState(false);

  const torrent = useTorrentProgress(serverUrl, torrentId);

  // POST the magnet link — responds immediately with { id }
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

        const data = await res.json();
        if (cancelled) return;

        log.debug('Torrent add response:', data);

        if (!data.id) throw new Error('Server did not return a torrent ID');

        setTorrentId(data.id);

        // If the torrent was already cached and ready, start immediately
        if (data.status === 'ready' && data.files) {
          startPlayback(data.id, data.files, selectedFile);
        }
      } catch (err) {
        if (!cancelled) {
          onError(err instanceof Error ? err.message : 'Unknown error');
        }
      }
    }

    init();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [magnetUri, serverUrl, apiKey]);

  const startPlayback = useCallback(
    (id: string, files: Array<{ name: string; index: number }>, fileIndex: number) => {
      const file = files[fileIndex];
      if (!file) return;

      const src = `${serverUrl}/api/torrent/stream/${id}/${fileIndex}`;

      log.debug('Starting playback:', file.name, src);

      if (videoRef.current) {
        videoRef.current.src = src;
        videoRef.current.load();
        videoRef.current.play().catch(() => { /* autoplay blocked; user can press play */ });
      }

      setVideoReady(true);
    },
    [serverUrl],
  );

  // When WebSocket signals ready, start playing the best video file
  useEffect(() => {
    if (torrent.status !== 'ready' || !torrentId || !torrent.metadata) return;

    const files = torrent.metadata.files;
    const playable = files.findIndex((f) =>
      /\.(mp4|webm|ogg|mkv|mov|avi|flv|ts)$/i.test(f.name),
    );

    if (playable === -1) {
      onError('No playable video file found in torrent');
      return;
    }

    setSelectedFile(playable);
    startPlayback(torrentId, files, playable);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [torrent.status]);

  // Surface WebSocket errors to the parent
  useEffect(() => {
    if (torrent.status === 'error' && torrent.error) {
      onError(torrent.error);
    }
  }, [torrent.status, torrent.error, onError]);

  function handleFileSelect(index: number) {
    if (!torrentId || !torrent.metadata) return;
    setSelectedFile(index);
    startPlayback(torrentId, torrent.metadata.files, index);
  }

  const meta = torrent.metadata;
  const isLoading = !videoReady;

  const loadingText =
    torrent.status === 'connecting' ? 'Connecting to peers...' :
    torrent.status === 'metadata'   ? 'Found torrent, waiting for ready signal...' :
    torrent.status === 'error'      ? 'Error — check below' :
                                      'Preparing stream...';

  const loadingInfo = torrent.numPeers > 0 ? (
    <p className="text-gray-400 text-xs">
      {torrent.numPeers} peer{torrent.numPeers !== 1 ? 's' : ''}
      {torrent.downloadSpeed > 0 && ` · ${formatSpeed(torrent.downloadSpeed)}`}
    </p>
  ) : null;

  return (
    <PlayerShell
      loading={isLoading}
      loadingText={loadingText}
      progress={torrent.progress > 0 ? torrent.progress : undefined}
      loadingInfo={loadingInfo}
      info={
        meta && (
          <div>
            <h3 className="font-semibold text-lg mb-1">{meta.name}</h3>
            <p className="text-sm text-gray-600 mb-2">
              Server-side streaming · {meta.files.length} file(s)
              {meta.totalSize > 0 && ` · ${formatBytes(meta.totalSize)}`}
              {torrent.numPeers > 0 && ` · ${torrent.numPeers} peers`}
              {torrent.downloadSpeed > 0 && ` · ${formatSpeed(torrent.downloadSpeed)}`}
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
