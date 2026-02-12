import type { TorrentEngine } from './types.js';

export interface ManagedStream {
  id: string;
  type: 'torrent' | 'hls' | 'direct';
  createdAt: number;
  lastAccessedAt: number;
  engine?: TorrentEngine;
  hlsBaseUrl?: string;
  directUrl?: string;
  infoHash?: string;
  metadata?: {
    name: string;
    files: Array<{ name: string; length: number; index: number }>;
    totalSize: number;
    infoHash: string;
  };
}

export class StreamManager {
  private streams = new Map<string, ManagedStream>();
  private readonly maxStreams: number;
  private readonly ttlMs: number;
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor(opts?: { maxStreams?: number; ttlMs?: number }) {
    this.maxStreams = opts?.maxStreams ?? 20;
    this.ttlMs = opts?.ttlMs ?? 30 * 60 * 1000;
    this.cleanupTimer = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  add(stream: ManagedStream): void {
    if (this.streams.size >= this.maxStreams) {
      this.evictLRU();
    }
    this.streams.set(stream.id, stream);
  }

  get(id: string): ManagedStream | undefined {
    const stream = this.streams.get(id);
    if (stream) {
      stream.lastAccessedAt = Date.now();
    }
    return stream;
  }

  findByInfoHash(infoHash: string): ManagedStream | undefined {
    for (const stream of this.streams.values()) {
      if (stream.infoHash === infoHash) {
        stream.lastAccessedAt = Date.now();
        return stream;
      }
    }
    return undefined;
  }

  remove(id: string): void {
    const stream = this.streams.get(id);
    if (!stream) return;
    this.destroyEngine(stream);
    this.streams.delete(id);
  }

  list(): ManagedStream[] {
    return Array.from(this.streams.values());
  }

  stats(): { count: number; types: Record<string, number> } {
    const types: Record<string, number> = {};
    for (const s of this.streams.values()) {
      types[s.type] = (types[s.type] ?? 0) + 1;
    }
    return { count: this.streams.size, types };
  }

  shutdown(): void {
    clearInterval(this.cleanupTimer);
    for (const stream of this.streams.values()) {
      this.destroyEngine(stream);
    }
    this.streams.clear();
  }

  private evictLRU(): void {
    let oldest: ManagedStream | null = null;
    for (const stream of this.streams.values()) {
      if (!oldest || stream.lastAccessedAt < oldest.lastAccessedAt) {
        oldest = stream;
      }
    }
    if (oldest) {
      this.remove(oldest.id);
    }
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [id, stream] of this.streams) {
      if (now - stream.lastAccessedAt > this.ttlMs) {
        this.remove(id);
      }
    }
  }

  private destroyEngine(stream: ManagedStream): void {
    if (stream.engine && typeof stream.engine.destroy === 'function') {
      try {
        stream.engine.destroy();
      } catch {
        // ignore cleanup errors
      }
    }
  }
}
