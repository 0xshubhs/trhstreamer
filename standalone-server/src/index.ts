import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { StreamManager } from './stream-manager.js';
import { createTorrentRouter } from './routes/torrent.js';
import { createHlsRouter } from './routes/hls.js';
import { createProxyRouter } from './routes/proxy.js';

const PORT = parseInt(process.env.PORT || '8080', 10);
const API_KEY = process.env.RELAY_API_KEY;
const MAX_STREAMS = parseInt(process.env.MAX_STREAMS || '20', 10);
const STREAM_TTL_MIN = parseInt(process.env.STREAM_TTL_MIN || '30', 10);

const app: ReturnType<typeof express> = express();
const streamManager = new StreamManager({
  maxStreams: MAX_STREAMS,
  ttlMs: STREAM_TTL_MIN * 60 * 1000,
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(
  rateLimit({
    windowMs: 60_000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

// API key auth for mutating routes
function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  if (!API_KEY) {
    // No key configured - allow all requests (dev mode)
    next();
    return;
  }
  const key = req.get('x-api-key') || (req.query.apiKey as string);
  if (key !== API_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

// Health (no auth required)
app.get('/health', (_req, res) => {
  const stats = streamManager.stats();
  res.json({
    status: 'ok',
    activeStreams: stats.count,
    streamTypes: stats.types,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  });
});

// Routes
app.use('/api/torrent', requireApiKey, createTorrentRouter(streamManager));
app.use('/api/hls', requireApiKey, createHlsRouter(streamManager));
app.use('/api/proxy', requireApiKey, createProxyRouter(streamManager));

// List all streams
app.get('/api/streams', requireApiKey, (_req, res) => {
  const streams = streamManager.list().map((s) => ({
    id: s.id,
    type: s.type,
    createdAt: s.createdAt,
    lastAccessedAt: s.lastAccessedAt,
    name: s.metadata?.name,
  }));
  res.json({ streams });
});

// Delete a stream
app.delete('/api/streams/:id', requireApiKey, (req, res) => {
  streamManager.remove(req.params.id);
  res.json({ message: 'Stream removed' });
});

// Graceful shutdown
function shutdown() {
  console.log('Shutting down...');
  streamManager.shutdown();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start
const server = createServer(app);
server.listen(PORT, () => {
  console.log(`Streaming server on port ${PORT}`);
  console.log(`Auth: ${API_KEY ? 'API key required' : 'open (dev mode)'}`);
  console.log(`Limits: ${MAX_STREAMS} streams, ${STREAM_TTL_MIN}min TTL`);
  console.log(`Health: http://localhost:${PORT}/health`);
});

export default app;
