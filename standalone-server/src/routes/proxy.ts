import { Router, Request, Response } from 'express';
import { Readable, pipeline as nodePipeline } from 'stream';
import { promisify } from 'util';
import type { StreamManager } from '../stream-manager.js';
import { generateId, isValidHttpUrl, fetchWithTimeout } from '../utils.js';

const pipeline = promisify(nodePipeline);

export function createProxyRouter(streamManager: StreamManager): Router {
  const router = Router();

  // POST /api/proxy/add
  router.post('/add', (req: Request, res: Response) => {
    const { url } = req.body || {};

    if (!url || typeof url !== 'string' || !isValidHttpUrl(url)) {
      res.status(400).json({ error: 'Invalid URL' });
      return;
    }

    const id = generateId();

    streamManager.add({
      id,
      type: 'direct',
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      directUrl: url,
    });

    res.json({
      id,
      streamUrl: `/api/proxy/stream/${id}`,
    });
  });

  // GET /api/proxy/stream/:id
  router.get('/stream/:id', async (req: Request, res: Response) => {
    const stream = streamManager.get(req.params.id);
    if (!stream || stream.type !== 'direct' || !stream.directUrl) {
      res.status(404).json({ error: 'Stream not found' });
      return;
    }

    try {
      const headers: Record<string, string> = {};
      if (req.headers.range) headers['range'] = req.headers.range as string;
      const ua = req.get('user-agent');
      if (ua) headers['user-agent'] = ua;

      const upstream = await fetchWithTimeout(stream.directUrl, { headers });

      res.status(upstream.status);

      for (const key of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
        const val = upstream.headers.get(key);
        if (val) res.setHeader(key, val);
      }

      const body = upstream.body as unknown as Readable;
      await pipeline(Readable.from(body), res);
    } catch {
      if (!res.headersSent) {
        res.status(502).json({ error: 'Failed to proxy stream' });
      }
    }
  });

  return router;
}
