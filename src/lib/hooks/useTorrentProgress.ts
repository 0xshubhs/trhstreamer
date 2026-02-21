'use client';

import { useEffect, useRef, useState } from 'react';

export interface TorrentFileInfo {
  name: string;
  length: number;
  index: number;
}

export interface TorrentMetadata {
  name: string;
  files: TorrentFileInfo[];
  totalSize: number;
  infoHash: string;
}

export interface TorrentProgressState {
  status: 'idle' | 'connecting' | 'metadata' | 'ready' | 'error';
  metadata: TorrentMetadata | null;
  progress: number;       // 0–1
  downloadSpeed: number;  // bytes/s
  uploadSpeed: number;
  numPeers: number;
  error: string | null;
}

const INITIAL_STATE: TorrentProgressState = {
  status: 'idle',
  metadata: null,
  progress: 0,
  downloadSpeed: 0,
  uploadSpeed: 0,
  numPeers: 0,
  error: null,
};

export function useTorrentProgress(
  serverUrl: string,
  torrentId: string | null,
): TorrentProgressState {
  const [state, setState] = useState<TorrentProgressState>(INITIAL_STATE);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!torrentId) {
      setState(INITIAL_STATE);
      return;
    }

    setState((s) => ({ ...s, status: 'connecting', error: null }));

    // Convert http(s):// → ws(s)://
    const wsUrl = serverUrl.replace(/^http/, 'ws') + `/ws/torrent/${torrentId}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string);

        switch (msg.type) {
          case 'metadata':
            setState((s) => ({
              ...s,
              status: 'metadata',
              metadata: {
                name: msg.name,
                files: msg.files,
                totalSize: msg.totalSize,
                infoHash: msg.infoHash,
              },
            }));
            break;

          case 'ready':
            setState((s) => ({ ...s, status: 'ready' }));
            break;

          case 'progress':
            setState((s) => ({
              ...s,
              progress: msg.progress ?? s.progress,
              downloadSpeed: msg.downloadSpeed ?? s.downloadSpeed,
              uploadSpeed: msg.uploadSpeed ?? s.uploadSpeed,
              numPeers: msg.numPeers ?? s.numPeers,
            }));
            break;

          case 'error':
            setState((s) => ({ ...s, status: 'error', error: msg.message }));
            break;
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onerror = () => {
      setState((s) => ({
        ...s,
        status: 'error',
        error: 'WebSocket connection failed. Is the streaming server running?',
      }));
    };

    ws.onclose = (event) => {
      // 1001 = server removed the stream, 1000 = normal close
      if (event.code !== 1000 && event.code !== 1001) {
        setState((s) => {
          if (s.status !== 'ready' && s.status !== 'error') {
            return { ...s, status: 'error', error: 'Connection to streaming server lost.' };
          }
          return s;
        });
      }
    };

    return () => {
      ws.close(1000, 'Component unmounted');
      wsRef.current = null;
    };
  }, [serverUrl, torrentId]);

  return state;
}
