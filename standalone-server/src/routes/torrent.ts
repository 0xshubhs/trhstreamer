import { Router, Request, Response } from 'express';
import { Readable } from 'stream';
import { spawn } from 'child_process';
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
    // Use infoHash as download directory so pieces survive server restarts.
    // Falls back to random id if infoHash can't be parsed (shouldn't happen).
    const downloadDir = infoHashMatch
      ? path.join(os.tmpdir(), 'trhstreamer', infoHashMatch[1].toLowerCase())
      : path.join(os.tmpdir(), 'trhstreamer', id);

    try {
      const engine: TorrentEngine = await waitForReady(
        torrentStream(magnetUri, {
          connections: 100,
          uploads: 10,
          path: downloadDir,
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

  // GET /api/torrent/transcode/:id/:fileIndex
  // Transcodes any video format to H.264/AAC fragmented MP4 for browser playback.
  // Used for MKV/AVI/x265 files that browsers cannot decode natively.
  router.get('/transcode/:id/:fileIndex', (req: Request, res: Response) => {
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

    // Send headers immediately so browser doesn't timeout waiting for ffmpeg startup.
    // flushHeaders() actually writes the status line + headers to the socket right now.
    res.writeHead(200, {
      'Content-Type': 'video/mp4',
      'Cache-Control': 'no-store',
    });
    res.flushHeaders();

    // Detect if input is likely already H.264 (mp4/m4v) - remux instead of re-encode
    const isNativeMp4 = /\.(mp4|m4v)$/i.test(file.name);

    const ffmpegArgs = isNativeMp4
      ? [
          // Fast remux: copy video codec (H.264 stays H.264), re-encode audio to AAC stereo.
          // Fragmented output puts moov at start so browser plays immediately.
          '-fflags', 'nobuffer+discardcorrupt',
          '-probesize', '1000000',
          '-analyzeduration', '1000000',
          '-i', 'pipe:0',
          '-map', '0:v:0',
          '-map', '0:a:0?',
          '-vcodec', 'copy',
          '-acodec', 'aac',
          '-ac', '2',
          '-b:a', '192k',
          '-movflags', 'frag_keyframe+empty_moov',
          '-f', 'mp4',
          'pipe:1',
        ]
      : [
          // Full transcode: converts H.265/MKV/AVI/etc → H.264 fragmented MP4
          '-fflags', 'nobuffer+discardcorrupt',
          '-probesize', '1000000',
          '-analyzeduration', '1000000',
          '-i', 'pipe:0',
          '-map', '0:v:0',
          '-map', '0:a:0?',
          '-vcodec', 'libx264',
          '-preset', 'veryfast',
          '-crf', '23',
          '-pix_fmt', 'yuv420p',
          '-profile:v', 'high',
          '-level', '4.1',
          '-acodec', 'aac',
          '-ac', '2',
          '-b:a', '192k',
          '-movflags', 'frag_keyframe+empty_moov',
          '-f', 'mp4',
          'pipe:1',
        ];

    const ffmpeg = spawn('ffmpeg', ffmpegArgs);

    const torrentStream = file.createReadStream({ start: 0, end: file.length - 1 }) as unknown as Readable;
    torrentStream.pipe(ffmpeg.stdin);
    ffmpeg.stdin.on('error', () => { /* suppress EPIPE if ffmpeg closes stdin early */ });

    ffmpeg.stdout.pipe(res);
    ffmpeg.stderr.on('data', () => { /* suppress */ });

    const cleanup = () => {
      torrentStream.destroy();
      ffmpeg.kill('SIGKILL');
    };
    req.on('close', cleanup);
    ffmpeg.on('error', () => { /* headers already sent, nothing to do */ });
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
