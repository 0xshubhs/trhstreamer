'use client';

import { useEffect, useRef, useState } from 'react';
import PlayerShell from './PlayerShell';
import { log } from '@/lib/logger';

interface Props {
  magnetUri: string;
  onError: (error: string) => void;
}

interface TorrentStats {
  progress: number;
  downloadSpeed: number;
  numPeers: number;
}

export default function ClientTorrentPlayer({ magnetUri, onError }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const clientRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<TorrentStats>({ progress: 0, downloadSpeed: 0, numPeers: 0 });
  const [fileName, setFileName] = useState('');

  useEffect(() => {
    let mounted = true;
    let statsInterval: ReturnType<typeof setInterval>;

    async function init() {
      try {
        const WebTorrentModule = await import('webtorrent');
        const WebTorrent = WebTorrentModule.default;

        if (!mounted) return;

        const client = new WebTorrent();
        clientRef.current = client;

        client.add(magnetUri, (torrent: any) => {
          if (!mounted) return;

          log.debug('Torrent loaded:', torrent.name);

          const playable = torrent.files.findIndex((f: any) =>
            /\.(mp4|webm|ogg)$/i.test(f.name),
          );

          if (playable === -1) {
            onError('No playable video file found in torrent');
            setLoading(false);
            return;
          }

          const file = torrent.files[playable];
          setFileName(file.name);

          if (videoRef.current) {
            file.renderTo(videoRef.current, { autoplay: true, controls: true });
            setLoading(false);
          }

          statsInterval = setInterval(() => {
            if (!mounted) return;
            setStats({
              progress: torrent.progress * 100,
              downloadSpeed: torrent.downloadSpeed,
              numPeers: torrent.numPeers,
            });
          }, 1000);
        });

        client.on('error', (err: Error) => {
          if (mounted) {
            onError(`WebTorrent error: ${err.message}`);
            setLoading(false);
          }
        });
      } catch (err) {
        if (mounted) {
          onError(`Failed to load WebTorrent: ${err instanceof Error ? err.message : 'Unknown'}`);
          setLoading(false);
        }
      }
    }

    init();

    return () => {
      mounted = false;
      if (statsInterval) clearInterval(statsInterval);
      if (clientRef.current) clientRef.current.destroy();
    };
  }, [magnetUri, onError]);

  const formatSpeed = (bytes: number) => {
    if (bytes === 0) return '0 B/s';
    const k = 1024;
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
  };

  return (
    <PlayerShell
      loading={loading}
      loadingText="Loading torrent via browser (WebTorrent)..."
      info={
        !loading && (
          <div>
            {fileName && <p className="text-sm font-medium mb-2">{fileName}</p>}
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="font-semibold">Progress:</span>
                <div className="mt-1">
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all"
                      style={{ width: `${stats.progress}%` }}
                    />
                  </div>
                  <span className="text-gray-600">{stats.progress.toFixed(1)}%</span>
                </div>
              </div>
              <div>
                <span className="font-semibold">Speed:</span>
                <p className="text-gray-600">{formatSpeed(stats.downloadSpeed)}</p>
              </div>
              <div>
                <span className="font-semibold">Peers:</span>
                <p className="text-gray-600">{stats.numPeers}</p>
              </div>
            </div>
            <p className="text-xs text-amber-700 mt-2">
              Client-side mode (no server). Performance depends on peer availability.
            </p>
          </div>
        )
      }
    >
      <video
        ref={videoRef}
        className="w-full aspect-video bg-black"
        controls
        playsInline
      />
    </PlayerShell>
  );
}
