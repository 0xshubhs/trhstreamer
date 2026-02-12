'use client';

import { useEffect, useRef, useState } from 'react';
import PlayerShell from './PlayerShell';
import { log } from '@/lib/logger';

interface Props {
  url: string;
  proxyUrl?: string;
  apiKey?: string;
  onError: (error: string) => void;
}

export default function DirectPlayer({ url, proxyUrl, apiKey, onError }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [loading, setLoading] = useState(true);
  const [streamUrl, setStreamUrl] = useState(url);
  const [useProxy, setUseProxy] = useState(false);

  // Try direct first, register proxy as fallback for CORS issues
  useEffect(() => {
    if (!proxyUrl) return;

    let cancelled = false;

    async function registerProxy() {
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (apiKey) headers['x-api-key'] = apiKey;

        const res = await fetch(`${proxyUrl}/api/proxy/add`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ url }),
        });

        if (!res.ok) return;

        const data = await res.json();
        if (!cancelled) {
          const params = apiKey ? `?apiKey=${encodeURIComponent(apiKey)}` : '';
          setStreamUrl(`${proxyUrl}${data.streamUrl}${params}`);
          setUseProxy(true);
        }
      } catch {
        log.debug('Proxy registration failed, using direct URL');
      }
    }

    registerProxy();
    return () => { cancelled = true; };
  }, [url, proxyUrl, apiKey]);

  useEffect(() => {
    if (!videoRef.current) return;

    const video = videoRef.current;

    function onLoadedData() {
      setLoading(false);
    }

    function handleVideoError() {
      if (!useProxy) {
        log.debug('Direct playback failed, trying proxy...');
      } else {
        onError('Failed to load video');
      }
      setLoading(false);
    }

    video.addEventListener('loadeddata', onLoadedData);
    video.addEventListener('error', handleVideoError);
    video.src = streamUrl;
    video.load();

    return () => {
      video.removeEventListener('loadeddata', onLoadedData);
      video.removeEventListener('error', handleVideoError);
    };
  }, [streamUrl, useProxy]);

  return (
    <PlayerShell loading={loading} loadingText="Loading video...">
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
