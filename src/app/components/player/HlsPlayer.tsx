'use client';

import { useEffect, useRef, useState } from 'react';
import PlayerShell from './PlayerShell';
import { log } from '@/lib/logger';

interface QualityLevel {
  height: number;
  bitrate: number;
  index: number;
}

interface Props {
  url: string;
  proxyUrl?: string;
  apiKey?: string;
  onError: (error: string) => void;
}

export default function HlsPlayer({ url, proxyUrl, apiKey, onError }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [qualities, setQualities] = useState<QualityLevel[]>([]);
  const [currentQuality, setCurrentQuality] = useState(-1);
  const [streamUrl, setStreamUrl] = useState(url);

  // If server is available, register the HLS stream for proxying
  useEffect(() => {
    if (!proxyUrl) return;

    let cancelled = false;

    async function registerProxy() {
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (apiKey) headers['x-api-key'] = apiKey;

        const res = await fetch(`${proxyUrl}/api/hls/add`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ url }),
        });

        if (!res.ok) throw new Error('Failed to register HLS stream');

        const data = await res.json();
        if (!cancelled) {
          const params = apiKey ? `?apiKey=${encodeURIComponent(apiKey)}` : '';
          setStreamUrl(`${proxyUrl}${data.masterUrl}${params}`);
        }
      } catch {
        log.debug('HLS proxy registration failed, using direct URL');
      }
    }

    registerProxy();
    return () => { cancelled = true; };
  }, [url, proxyUrl, apiKey]);

  useEffect(() => {
    let mounted = true;

    async function init() {
      if (!videoRef.current) return;

      // Safari/iOS native HLS
      if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
        videoRef.current.src = streamUrl;
        setLoading(false);
        return;
      }

      try {
        const Hls = (await import('hls.js')).default;

        if (!Hls.isSupported()) {
          onError('HLS is not supported in this browser');
          setLoading(false);
          return;
        }

        if (!mounted) return;

        const hls = new Hls({ enableWorker: true, lowLatencyMode: false });
        hlsRef.current = hls;

        hls.loadSource(streamUrl);
        hls.attachMedia(videoRef.current);

        hls.on(Hls.Events.MANIFEST_PARSED, (_: unknown, data: any) => {
          if (!mounted) return;
          setLoading(false);

          if (data.levels?.length > 1) {
            setQualities(
              data.levels.map((l: any, i: number) => ({
                height: l.height,
                bitrate: l.bitrate,
                index: i,
              })),
            );
            setCurrentQuality(hls.currentLevel);
          }
        });

        hls.on(Hls.Events.ERROR, (_: unknown, data: any) => {
          if (!mounted || !data.fatal) return;
          log.error('HLS fatal error:', data.type, data.details);

          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            onError('Network error loading HLS stream');
            hls.startLoad();
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          } else {
            onError('Fatal error loading HLS stream');
            hls.destroy();
          }
        });

        hls.on(Hls.Events.LEVEL_SWITCHED, (_: unknown, data: any) => {
          if (mounted) setCurrentQuality(data.level);
        });
      } catch (err) {
        if (mounted) {
          onError(`Failed to initialize HLS: ${err instanceof Error ? err.message : 'Unknown'}`);
          setLoading(false);
        }
      }
    }

    init();

    return () => {
      mounted = false;
      if (hlsRef.current) hlsRef.current.destroy();
    };
  }, [streamUrl, onError]);

  function handleQualityChange(level: number) {
    if (!hlsRef.current) return;
    hlsRef.current.currentLevel = level;
    setCurrentQuality(level);
  }

  const formatBitrate = (b: number) => (b / 1000).toFixed(0) + ' kbps';

  return (
    <PlayerShell
      loading={loading}
      loadingText="Loading HLS stream..."
      info={
        qualities.length > 0 && (
          <div>
            <label className="block text-sm font-semibold mb-2">Quality:</label>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => handleQualityChange(-1)}
                className={`px-3 py-1 rounded text-sm ${
                  currentQuality === -1
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Auto
              </button>
              {qualities.map((q) => (
                <button
                  key={q.index}
                  onClick={() => handleQualityChange(q.index)}
                  className={`px-3 py-1 rounded text-sm ${
                    currentQuality === q.index
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  {q.height}p ({formatBitrate(q.bitrate)})
                </button>
              ))}
            </div>
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
