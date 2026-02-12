import { Router, Request, Response } from 'express';
import { Readable, pipeline as nodePipeline } from 'stream';
import { promisify } from 'util';
import type { StreamManager } from '../stream-manager.js';
import { generateId, isValidHttpUrl, fetchWithTimeout } from '../utils.js';

const pipeline = promisify(nodePipeline);

export function createHlsRouter(streamManager: StreamManager): Router {
  const router = Router();

  // POST /api/hls/add
  router.post('/add', (req: Request, res: Response) => {
    const { url } = req.body || {};

    if (!url || typeof url !== 'string' || !isValidHttpUrl(url)) {
      res.status(400).json({ error: 'Invalid HLS URL' });
      return;
    }

    const id = generateId();

    streamManager.add({
      id,
      type: 'hls',
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      hlsBaseUrl: url,
    });

    res.json({
      id,
      masterUrl: `/api/hls/${id}/master`,
    });
  });

  // GET /api/hls/:id/master
  router.get('/:id/master', async (req: Request, res: Response) => {
    const stream = streamManager.get(req.params.id);
    if (!stream || stream.type !== 'hls' || !stream.hlsBaseUrl) {
      res.status(404).json({ error: 'HLS stream not found' });
      return;
    }

    try {
      const upstream = await fetchWithTimeout(stream.hlsBaseUrl, {
        headers: { 'user-agent': req.get('user-agent') || '' },
      });

      if (!upstream.ok) {
        res.status(502).json({ error: `Upstream error ${upstream.status}` });
        return;
      }

      let text = await upstream.text();

      // Rewrite relative URIs to go through our proxy
      const proxyPrefix = `/api/hls/${req.params.id}/segment/`;
      text = text
        .split('\n')
        .map((line) => {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) return line;
          if (/^https?:\/\//i.test(trimmed)) return line;
          return proxyPrefix + encodeURI(trimmed);
        })
        .join('\n');

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'no-store');
      res.send(text);
    } catch {
      res.status(502).json({ error: 'Failed to proxy master playlist' });
    }
  });

  // GET /api/hls/:id/segment/*
  router.get('/:id/segment/*', async (req: Request, res: Response) => {
    const stream = streamManager.get(req.params.id);
    if (!stream || stream.type !== 'hls' || !stream.hlsBaseUrl) {
      res.status(404).json({ error: 'HLS stream not found' });
      return;
    }

    const suffix = (req.params as Record<string, string>)[0];
    const targetUrl = new URL(suffix, stream.hlsBaseUrl).toString();

    try {
      const headers: Record<string, string> = {};
      const range = req.get('range');
      if (range) headers['range'] = range;
      const ua = req.get('user-agent');
      if (ua) headers['user-agent'] = ua;

      const upstream = await fetchWithTimeout(targetUrl, { headers });

      res.status(upstream.status);

      const ct = upstream.headers.get('content-type');
      if (ct) res.setHeader('Content-Type', ct);
      const ar = upstream.headers.get('accept-ranges');
      if (ar) res.setHeader('Accept-Ranges', ar);
      const cr = upstream.headers.get('content-range');
      if (cr) res.setHeader('Content-Range', cr);
      const cl = upstream.headers.get('content-length');
      if (cl) res.setHeader('Content-Length', cl);
      res.setHeader('Cache-Control', 'public, max-age=30');

      const body = upstream.body as unknown as Readable;
      await pipeline(Readable.from(body), res);
    } catch {
      if (!res.headersSent) {
        res.status(502).json({ error: 'Failed to proxy HLS segment' });
      }
    }
  });

  return router;
}
