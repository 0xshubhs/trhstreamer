import { Router, Request, Response } from 'express';
import { Readable } from 'stream';
import os from 'os';
import path from 'path';
import type { StreamManager } from '../stream-manager.js';
import type { TorrentEngine } from '../types.js';
import { generateId, getMimeType } from '../utils.js';

// @ts-expect-error no types for torrent-stream
import torrentStream from 'torrent-stream';

export function createTorrentRouter(streamManager: StreamManager): Router {
  const router = Router();

  // POST /api/torrent/add
  router.post('/add', async (req: Request, res: Response) => {
    const { magnetUri } = req.body || {};

    if (!magnetUri || typeof magnetUri !== 'string' || !magnetUri.startsWith('magnet:?')) {
      res.status(400).json({ error: 'Invalid magnet URI' });
      return;
    }

    // Check for existing torrent by infoHash
    const infoHashMatch = magnetUri.match(
      /xt=urn:btih:([a-fA-F0-9]{40}|[a-zA-Z2-7]{32})/i,
    );
    if (infoHashMatch) {
      const existing = streamManager.findByInfoHash(infoHashMatch[1].toLowerCase());
      if (existing && existing.metadata) {
        res.json({ id: existing.id, cached: true, ...existing.metadata });
        return;
      }
    }

    const id = generateId();

    try {
      const engine: TorrentEngine = await waitForReady(
        torrentStream(magnetUri, {
          connections: 100,
          uploads: 10,
          path: path.join(os.tmpdir(), 'trhstreamer', id),
          dht: true,
          tracker: true,
        }),
        30_000,
      );

      // Select all files so they can be streamed
      engine.files.forEach((f) => f.select());

      const files = engine.files.map((f, i) => ({
        name: f.name,
        length: f.length,
        index: i,
      }));

      const metadata = {
        name: engine.torrent.name,
        files,
        totalSize: engine.torrent.length,
        infoHash: engine.infoHash,
      };

      streamManager.add({
        id,
        type: 'torrent',
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
        engine,
        infoHash: engine.infoHash,
        metadata,
      });

      res.json({ id, ...metadata });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Torrent initialization failed';
      res.status(504).json({ error: msg });
    }
  });

  // GET /api/torrent/stream/:id/:fileIndex
  router.get('/stream/:id/:fileIndex', (req: Request, res: Response) => {
    const stream = streamManager.get(req.params.id);
    if (!stream || stream.type !== 'torrent' || !stream.engine) {
      res.status(404).json({ error: 'Torrent stream not found' });
      return;
    }

    const fileIdx = parseInt(req.params.fileIndex, 10);
    const file = stream.engine.files[fileIdx];
    if (!file) {
      res.status(404).json({ error: 'File not found in torrent' });
      return;
    }

    const contentType = getMimeType(file.name);
    const totalSize = file.length;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
      const chunkSize = end - start + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${totalSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
      });

      const readable = file.createReadStream({ start, end }) as unknown as Readable;
      readable.pipe(res);
      readable.on('error', () => { if (!res.headersSent) res.status(500).end(); });
    } else {
      res.writeHead(200, {
        'Content-Length': totalSize,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
      });

      const readable = file.createReadStream({ start: 0, end: totalSize - 1 }) as unknown as Readable;
      readable.pipe(res);
      readable.on('error', () => { if (!res.headersSent) res.status(500).end(); });
    }
  });

  return router;
}

function waitForReady(engine: TorrentEngine, timeoutMs: number): Promise<TorrentEngine> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      engine.destroy();
      reject(new Error('Torrent metadata timeout'));
    }, timeoutMs);

    engine.on('ready', () => {
      clearTimeout(timer);
      resolve(engine);
    });

    engine.on('error', (err: Error) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
