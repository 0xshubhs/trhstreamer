export interface TorrentFile {
  name: string;
  length: number;
  createReadStream(opts?: { start: number; end: number }): NodeJS.ReadableStream;
  select(): void;
  deselect(): void;
}

export interface TorrentEngine {
  files: TorrentFile[];
  infoHash: string;
  torrent: { name: string; length: number };
  swarm: {
    downloaded: number;
    wires: unknown[];
    downloadSpeed(): number;
  };
  on(event: 'ready', cb: () => void): void;
  on(event: 'error', cb: (err: Error) => void): void;
  on(event: 'idle', cb: () => void): void;
  destroy(): void;
}

export interface HealthResponse {
  status: 'ok';
  activeStreams: number;
  uptime: number;
  memory: NodeJS.MemoryUsage;
}
