/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Large Stream Service (HLS-focused proxy, server-side torrent disabled)
 * - Proxies .m3u8 masters, variants, and media segments with range support.
 * - Adds API key auth, rate limiting, security headers, and timeouts.
 * - Use only for legal/authorized content you own rights to.
 *
 * Run: pnpm dev
 */

import express, { Request, Response, NextFunction, Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Readable, pipeline as nodePipeline } from 'stream';
import { promisify } from 'util';
import path from 'path';
import { URL } from 'url';

const pipeline = promisify(nodePipeline);
const app: Application = express();

const PORT = parseInt(process.env.PORT || '8080', 10);
// Require an API key for any mutating or streaming routes
const API_KEY = process.env.RELAY_API_KEY;
if (!API_KEY) {
  console.warn('⚠️ RELAY_API_KEY not set. Set it to secure your API.');
}

const FETCH_TIMEOUT_MS = parseInt(process.env.FETCH_TIMEOUT_MS || '15000', 10);
const MAX_JSON = process.env.MAX_JSON || '1mb';

type StreamType = 'torrent' | 'hls';

interface HlsInfo {
  baseUrl: string;        // The absolute URL of the master or variant the client added
  lastAccess: number;
}

interface StreamInfo {
  id: string;
  type: StreamType;
  fileSize: number;
  fileName: string;
  startTime: number;
  // HLS-specific
  hls?: HlsInfo;
  // Torrent-specific (kept for future use but disabled)
  torrent?: any | null;
  magnetUri?: string;
  m3u8Url?: string;
}

const activeStreams = new Map<string, StreamInfo>();

// ---------- Middleware ----------
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: MAX_JSON }));

// Simple API key auth
function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  if (!API_KEY) {
    res.status(503).json({ error: 'Server not configured (RELAY_API_KEY missing)' });
    return;
  }
  const key = req.get('x-api-key') || req.query.apiKey;
  if (key !== API_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

// Basic rate limiting
const limiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// ---------- Utilities ----------
function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function getMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const map: Record<string, string> = {
    '.m3u8': 'application/vnd.apple.mpegurl', // HLS playlists
    '.m3u': 'application/vnd.apple.mpegurl',
    '.ts': 'video/mp2t',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mkv': 'video/x-matroska',
    '.mov': 'video/quicktime',
    '.aac': 'audio/aac',
    '.mp3': 'audio/mpeg',
  };
  return map[ext] || 'application/octet-stream';
}

function isValidHttpUrl(u: string): boolean {
  try {
    const url = new URL(u);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

async function fetchWithTimeout(resource: string, init: RequestInit = {}) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(resource, { ...init, signal: ctrl.signal as any });
    return res;
  } finally {
    clearTimeout(to);
  }
}

// ---------- Health ----------
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    activeStreams: activeStreams.size,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    hlsIds: [...activeStreams.values()]
      .filter(s => s.type === 'hls')
      .map(s => s.id),
  });
});

// ---------- Add Stream ----------
/**
 * POST /api/add-stream
 * Body: { m3u8Url?: string, magnetUri?: string }
 * NOTE: torrent is disabled server-side; returns 501 for torrent requests.
 */
app.post('/api/add-stream', requireApiKey, async (req: Request, res: Response) => {
  try {
    const { magnetUri, m3u8Url } = req.body || {};

    if (!magnetUri && !m3u8Url) {
      return res.status(400).json({ error: 'Either magnetUri or m3u8Url is required' });
    }

    // Torrent path (disabled)
    if (magnetUri) {
      if (typeof magnetUri !== 'string' || !magnetUri.startsWith('magnet:?')) {
        return res.status(400).json({ error: 'Invalid magnet URI format' });
      }
      const infoHashMatch = magnetUri.match(/xt=urn:btih:([a-fA-F0-9]{40}|[a-zA-Z2-7]{32})/);
      const infoHash = infoHashMatch?.[1]?.toLowerCase();
      return res.status(501).json({
        error: 'Server-side torrent streaming not available',
        suggestion: 'Use client-side WebTorrent for torrent streaming',
        infoHash,
      });
    }

    // HLS path
    if (m3u8Url) {
      if (typeof m3u8Url !== 'string' || !isValidHttpUrl(m3u8Url)) {
        return res.status(400).json({ error: 'Invalid m3u8 URL format' });
      }

      const id = generateId();

      // Store base URL to resolve relative paths later
      activeStreams.set(id, {
        id,
        type: 'hls',
        fileSize: 0,
        fileName: 'HLS Stream',
        startTime: Date.now(),
        m3u8Url,
        hls: { baseUrl: m3u8Url, lastAccess: Date.now() },
      });

      return res.json({
        id,
        type: 'hls',
        fileName: 'HLS Stream',
        fileSize: 0,
        fileSizeFormatted: 'Unknown',
        master: `/api/stream/${id}/master`, // master playlist
        proxyBase: `/api/stream/${id}/p/`, // segments/variants base
        message: 'HLS stream added successfully',
      });
    }

    return res.status(400).json({ error: 'Bad request' });
  } catch (err) {
    console.error('Error adding stream:', err);
    return res.status(500).json({ error: 'Failed to add stream' });
  }
});

// ---------- HLS Proxy ----------
// 1) Serve master playlist exactly as provided (and rewrite relative URIs to our proxy base)
app.get('/api/stream/:id/master', requireApiKey, async (req, res) => {
  const { id } = req.params;
  const streamInfo = activeStreams.get(id);
  if (!streamInfo || streamInfo.type !== 'hls' || !streamInfo.hls?.baseUrl) {
    return res.status(404).json({ error: 'Stream not found' });
  }

  try {
    const upstream = await fetchWithTimeout(streamInfo.hls.baseUrl, {
      headers: { 'user-agent': req.get('user-agent') || '' },
    });

    if (!upstream.ok) {
      return res.status(502).json({ error: `Upstream error ${upstream.status}` });
    }

    let text = await upstream.text();
    // Rewrite relative URIs in playlists to go through /api/stream/:id/p/<relative>
    // Simple heuristic: replace any non-absolute URIs on their own lines
    const proxyPrefix = `/api/stream/${id}/p/`;
    text = text
      .split('\n')
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return line; // comments/directives
        // If it's already absolute (http/https), leave it
        if (/^https?:\/\//i.test(trimmed)) return line;
        // Otherwise, route through proxy
        return proxyPrefix + encodeURI(trimmed);
      })
      .join('\n');

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Cache-Control', 'no-store');
    return res.send(text);
  } catch (err) {
    console.error('Master proxy error:', err);
    return res.status(502).json({ error: 'Failed to proxy master playlist' });
  }
});

// 2) Proxy any variant playlists or media segments under /p/*
app.get('/api/stream/:id/p/*', requireApiKey, async (req, res): Promise<void> => {
  const { id } = req.params as { id: string };
  const streamInfo = activeStreams.get(id);
  if (!streamInfo || streamInfo.type !== 'hls' || !streamInfo.hls?.baseUrl) {
    res.status(404).json({ error: 'Stream not found' });
    return;
  }

  const suffix = (req.params as any)[0] as string; // the wildcard path after /p/
  const targetUrl = new URL(suffix, streamInfo.hls.baseUrl).toString();

  try {
    // Forward range header for segments
    const headers: Record<string, string> = {};
    const range = req.get('range');
    if (range) headers['range'] = range;
    const ua = req.get('user-agent');
    if (ua) headers['user-agent'] = ua;

    const upstream = await fetchWithTimeout(targetUrl, { headers });

    // Propagate status for partial content
    res.status(upstream.status);

    // Propagate essential headers
    const contentType = upstream.headers.get('content-type') || getMimeType(targetUrl);
    res.setHeader('Content-Type', contentType);
    const acceptRanges = upstream.headers.get('accept-ranges');
    if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);
    const contentRange = upstream.headers.get('content-range');
    if (contentRange) res.setHeader('Content-Range', contentRange);
    const contentLength = upstream.headers.get('content-length');
    if (contentLength) res.setHeader('Content-Length', contentLength);
    res.setHeader('Cache-Control', 'public, max-age=30');

    const body = upstream.body as unknown as Readable;
    await pipeline(Readable.from(body), res);
    streamInfo.hls.lastAccess = Date.now();
  } catch (err) {
    console.error('HLS subresource proxy error:', err);
    if (!res.headersSent) {
      res.status(502).json({ error: 'Failed to proxy HLS resource' });
    }
  }
});

// ---------- Torrent Endpoints (disabled) ----------
app.post('/api/torrent/add', requireApiKey, (_req, res) => {
  return res.status(501).json({
    error: 'Server-side torrent streaming not available',
    suggestion: 'Use client-side WebTorrent for torrent streaming',
  });
});

app.get('/api/status/:id', requireApiKey, (req: Request, res: Response) => {
  const { id } = req.params;
  const streamInfo = activeStreams.get(id);
  if (!streamInfo) return res.status(404).json({ error: 'Stream not found' });

  if (streamInfo.type === 'hls') {
    return res.json({
      id,
      type: 'hls',
      name: streamInfo.fileName,
      lastAccess: streamInfo.hls?.lastAccess ?? null,
      since: Date.now() - (streamInfo.hls?.lastAccess ?? streamInfo.startTime),
    });
  }

  // Placeholder for torrent status when enabled in the future
  return res.json({ id, type: streamInfo.type });
});

app.delete('/api/stream/:id', requireApiKey, (req, res) => {
  const { id } = req.params;
  const streamInfo = activeStreams.get(id);
  if (!streamInfo) return res.status(404).json({ error: 'Stream not found' });

  try {
    if (streamInfo.torrent && typeof streamInfo.torrent.destroy === 'function') {
      streamInfo.torrent.destroy();
    }
  } catch (e) {
    console.warn('Error destroying torrent on delete:', e);
  }
  activeStreams.delete(id);
  return res.json({ message: 'Stream removed successfully' });
});

// ---------- Server start ----------
function banner() {
  console.log('🚀 Large Stream Service');
  console.log(`   Port: ${PORT}`);
  console.log(`   Auth: ${API_KEY ? 'API key required' : '⚠️  NO API KEY — set RELAY_API_KEY'}`);
  console.log(`   Timeout: ${FETCH_TIMEOUT_MS}ms`);
  console.log(`📊 Health: http://localhost:${PORT}/health`);
}

const server = createServer(app);
server.listen(PORT, () => banner());

export default app;
