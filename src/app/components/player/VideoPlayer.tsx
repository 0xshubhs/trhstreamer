'use client';

import dynamic from 'next/dynamic';
import { useServerStatus } from '@/lib/hooks/useServerStatus';
import type { StreamType } from '@/lib/url-detection';
import ServerTorrentPlayer from './ServerTorrentPlayer';
import HlsPlayer from './HlsPlayer';
import DirectPlayer from './DirectPlayer';
import PlayerShell from './PlayerShell';

const ClientTorrentPlayer = dynamic(() => import('./ClientTorrentPlayer'), {
  ssr: false,
  loading: () => (
    <PlayerShell loading loadingText="Loading WebTorrent engine...">
      <div />
    </PlayerShell>
  ),
});

interface Props {
  url: string;
  type: StreamType;
  onError: (error: string) => void;
}

export default function VideoPlayer({ url, type, onError }: Props) {
  const { serverAvailable, serverUrl, checking } = useServerStatus();
  const apiKey = typeof window !== 'undefined'
    ? (process.env.NEXT_PUBLIC_RELAY_API_KEY || undefined)
    : undefined;

  if (checking) {
    return (
      <PlayerShell loading loadingText="Detecting streaming server...">
        <div />
      </PlayerShell>
    );
  }

  const modeBadge = (
    <div className="max-w-4xl mx-auto mb-4 px-4">
      <div
        className={`inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-full ${
          serverAvailable
            ? 'bg-green-50 text-green-800 border border-green-200'
            : 'bg-amber-50 text-amber-800 border border-amber-200'
        }`}
      >
        <span
          className={`inline-block w-2 h-2 rounded-full ${
            serverAvailable ? 'bg-green-500' : 'bg-amber-500'
          }`}
        />
        {serverAvailable ? 'Server-assisted streaming' : 'Client-side streaming (no server)'}
      </div>
    </div>
  );

  if (type === 'hls') {
    return (
      <>
        {modeBadge}
        <HlsPlayer
          url={url}
          proxyUrl={serverAvailable ? serverUrl : undefined}
          apiKey={apiKey}
          onError={onError}
        />
      </>
    );
  }

  if (type === 'direct') {
    return (
      <>
        {modeBadge}
        <DirectPlayer
          url={url}
          proxyUrl={serverAvailable ? serverUrl : undefined}
          apiKey={apiKey}
          onError={onError}
        />
      </>
    );
  }

  // Torrent
  if (serverAvailable) {
    return (
      <>
        {modeBadge}
        <ServerTorrentPlayer
          magnetUri={url}
          serverUrl={serverUrl}
          apiKey={apiKey}
          onError={onError}
        />
      </>
    );
  }

  return (
    <>
      {modeBadge}
      <ClientTorrentPlayer magnetUri={url} onError={onError} />
    </>
  );
}
