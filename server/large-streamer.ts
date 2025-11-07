/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Dedicated Node.js Streaming Service for Large Files
 * 
 * This service handles large torrent and HLS streams that exceed the threshold.
 * It uses webtorrent-hybrid for full TCP/UDP seeding capabilities and efficient
 * streaming with proper memory management and HTTP range support.
 * 
 * Run with: node server/large-streamer.js
 * Or: ts-node server/large-streamer.ts
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import WebTorrent from 'webtorrent-hybrid';
import parseTorrent from 'parse-torrent';
import { Readable } from 'stream';
import path from 'path';

const app = express();
const PORT = parseInt(process.env.PORT || '8080', 10);
const API_KEY = process.env.NODE_STREAMER_API_KEY || '';

if (!API_KEY) {
  console.error('ERROR: NODE_STREAMER_API_KEY environment variable is required');
  process.exit(1);
}

// Initialize WebTorrent client with optimized settings for large files
const client = new (WebTorrent as any)({
  maxConns: 100, // Maximum concurrent connections
  downloadLimit: -1, // No download limit
  uploadLimit: -1, // No upload limit
  dht: true,
  lsd: true,
  webSeeds: true,
});

// Store active streams
interface StreamInfo {
  id: string;
  torrent: any | null;
  magnetUri?: string;
  m3u8Url?: string;
  type: 'torrent' | 'hls';
  fileSize: number;
  fileName: string;
  startTime: number;
}

const activeStreams = new Map<string, StreamInfo>();

// Middleware
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// API Key authentication middleware
function authenticateApiKey(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey || apiKey !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing API key' });
  }
  
  next();
}

// Apply API key authentication to all routes
app.use('/api', authenticateApiKey);

/**
 * POST /api/add-stream
 * Add a new stream (torrent or HLS)
 */
app.post('/api/add-stream', async (req: Request, res: Response) => {
  try {
    const { magnetUri, m3u8Url } = req.body;
    
    if (!magnetUri && !m3u8Url) {
      return res.status(400).json({ error: 'Either magnetUri or m3u8Url is required' });
    }
    
    // Handle torrent
    if (magnetUri) {
      // Validate magnet URI
      if (!magnetUri.startsWith('magnet:?')) {
        return res.status(400).json({ error: 'Invalid magnet URI format' });
      }
      
      // Parse torrent info
      const parsed = await parseTorrent(magnetUri);
      const id = parsed.infoHash || generateId();
      
      // Check if already added
      if (activeStreams.has(id)) {
        const existing = activeStreams.get(id)!;
        return res.json({
          id,
          fileName: existing.fileName,
          fileSize: existing.fileSize,
          fileSizeFormatted: formatBytes(existing.fileSize),
          message: 'Stream already active',
        });
      }
      
      // Add torrent to client
      const torrent = await addTorrent(magnetUri);
      
      const fileSize = torrent.length;
      const fileName = torrent.name;
      
      // Store stream info
      activeStreams.set(id, {
        id,
        torrent,
        magnetUri,
        type: 'torrent',
        fileSize,
        fileName,
        startTime: Date.now(),
      });
      
      console.log(`Added torrent stream: ${fileName} (${formatBytes(fileSize)})`);
      
      return res.json({
        id,
        fileName,
        fileSize,
        fileSizeFormatted: formatBytes(fileSize),
        files: torrent.files.map((f: any, idx: number) => ({
          index: idx,
          name: f.name,
          size: f.length,
          sizeFormatted: formatBytes(f.length),
        })),
        message: 'Torrent added successfully',
      });
    }
    
    // Handle HLS
    if (m3u8Url) {
      try {
        new URL(m3u8Url);
      } catch {
        return res.status(400).json({ error: 'Invalid m3u8 URL format' });
      }
      
      const id = generateId();
      
      // For HLS, we'll proxy the stream
      activeStreams.set(id, {
        id,
        torrent: null,
        m3u8Url,
        type: 'hls',
        fileSize: 0, // Unknown for HLS
        fileName: 'HLS Stream',
        startTime: Date.now(),
      });
      
      console.log(`Added HLS stream: ${m3u8Url}`);
      
      return res.json({
        id,
        fileName: 'HLS Stream',
        fileSize: 0,
        fileSizeFormatted: 'Unknown',
        message: 'HLS stream added successfully',
      });
    }
    
  } catch (error) {
    console.error('Error adding stream:', error);
    return res.status(500).json({
      error: 'Failed to add stream',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/stream/:id/:fileIndex?
 * Stream a torrent file or HLS content
 */
app.get('/api/stream/:id/:fileIndex?', async (req: Request, res: Response) => {
  try {
    const { id, fileIndex } = req.params;
    const streamInfo = activeStreams.get(id);
    
    if (!streamInfo) {
      return res.status(404).json({ error: 'Stream not found' });
    }
    
    // Handle torrent streaming
    if (streamInfo.type === 'torrent' && streamInfo.torrent) {
      const torrent = streamInfo.torrent;
      const index = parseInt(fileIndex || '0', 10);
      
      if (index < 0 || index >= torrent.files.length) {
        return res.status(404).json({ error: 'File not found in torrent' });
      }
      
      const file = torrent.files[index];
      const fileSize = file.length;
      
      // Parse range header for seeking support
      const range = req.headers.range;
      let start = 0;
      let end = fileSize - 1;
      
      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        start = parseInt(parts[0], 10);
        end = parts[1] ? parseInt(parts[1], 10) : end;
        
        // Clamp values
        start = Math.max(0, start);
        end = Math.min(end, fileSize - 1);
        
        res.status(206); // Partial content
        res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      }
      
      const contentLength = end - start + 1;
      
      // Set headers
      res.setHeader('Content-Type', getMimeType(file.name));
      res.setHeader('Content-Length', contentLength);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      
      // Create stream with proper back-pressure handling
      const stream = file.createReadStream({ start, end });
      
      stream.on('error', (error: Error) => {
        console.error('Stream error:', error);
        if (!res.headersSent) {
          res.status(500).end();
        }
      });
      
      // Pipe with proper back-pressure
      stream.pipe(res);
      
      req.on('close', () => {
        stream.destroy();
      });
      
      console.log(`Streaming: ${file.name} (${start}-${end}/${fileSize})`);
      return;
    }
    
    // Handle HLS streaming (proxy)
    if (streamInfo.type === 'hls' && streamInfo.m3u8Url) {
      const response = await fetch(streamInfo.m3u8Url);
      
      if (!response.ok) {
        return res.status(502).json({ error: 'Failed to fetch HLS stream' });
      }
      
      // Forward headers
      response.headers.forEach((value, key) => {
        res.setHeader(key, value);
      });
      
      // Stream response
      const readable = Readable.from(response.body as unknown as AsyncIterable<Uint8Array>);
      readable.pipe(res);
      
      return;
    }
    
    return res.status(500).json({ error: 'Invalid stream configuration' });
    
  } catch (error) {
    console.error('Streaming error:', error);
    return res.status(500).json({
      error: 'Streaming failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/download/:id/:fileIndex?
 * Download a file from torrent
 */
app.get('/api/download/:id/:fileIndex?', async (req: Request, res: Response) => {
  try {
    const { id, fileIndex } = req.params;
    const streamInfo = activeStreams.get(id);
    
    if (!streamInfo || streamInfo.type !== 'torrent' || !streamInfo.torrent) {
      return res.status(404).json({ error: 'Torrent not found' });
    }
    
    const torrent = streamInfo.torrent;
    const index = parseInt(fileIndex || '0', 10);
    
    if (index < 0 || index >= torrent.files.length) {
      return res.status(404).json({ error: 'File not found in torrent' });
    }
    
    const file = torrent.files[index];
    
    // Set download headers
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`);
    res.setHeader('Content-Length', file.length);
    
    // Stream file
    const stream = file.createReadStream();
    stream.pipe(res);
    
    stream.on('error', (error: Error) => {
      console.error('Download error:', error);
      if (!res.headersSent) {
        res.status(500).end();
      }
    });
    
    console.log(`Download started: ${file.name}`);
    
  } catch (error) {
    console.error('Download error:', error);
    return res.status(500).json({
      error: 'Download failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/status/:id
 * Get stream status and progress
 */
app.get('/api/status/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const streamInfo = activeStreams.get(id);
  
  if (!streamInfo) {
    return res.status(404).json({ error: 'Stream not found' });
  }
  
  if (streamInfo.type === 'torrent' && streamInfo.torrent) {
    const torrent = streamInfo.torrent;
    
    return res.json({
      id,
      type: 'torrent',
      name: torrent.name,
      progress: torrent.progress,
      downloadSpeed: torrent.downloadSpeed,
      uploadSpeed: torrent.uploadSpeed,
      peers: torrent.numPeers,
      downloaded: torrent.downloaded,
      uploaded: torrent.uploaded,
      ratio: torrent.uploaded / torrent.downloaded || 0,
      timeRemaining: torrent.timeRemaining,
      done: torrent.done,
    });
  }
  
  return res.json({
    id,
    type: 'hls',
    name: streamInfo.fileName,
  });
});

/**
 * DELETE /api/stream/:id
 * Remove a stream and cleanup
 */
app.delete('/api/stream/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const streamInfo = activeStreams.get(id);
  
  if (!streamInfo) {
    return res.status(404).json({ error: 'Stream not found' });
  }
  
  // Destroy torrent if exists
  if (streamInfo.torrent) {
    streamInfo.torrent.destroy();
  }
  
  activeStreams.delete(id);
  
  console.log(`Removed stream: ${id}`);
  
  return res.json({ message: 'Stream removed successfully' });
});

/**
 * GET /health
 * Health check endpoint
 */
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    activeStreams: activeStreams.size,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  });
});

// Utility functions

function addTorrent(magnetUri: string): Promise<any> {
  return new Promise((resolve, reject) => {
    client.add(magnetUri, (torrent: any) => {
      resolve(torrent);
    });
    
    // Set timeout
    setTimeout(() => {
      reject(new Error('Torrent add timeout'));
    }, 30000);
  });
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

function getMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mkv': 'video/x-matroska',
    '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime',
    '.m3u8': 'application/vnd.apple.mpegurl',
    '.ts': 'video/mp2t',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

// Cleanup on shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  client.destroy();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down gracefully...');
  client.destroy();
  process.exit(0);
});

// Start server
const server = createServer(app);

server.listen(PORT, () => {
  console.log(`🚀 Large Stream Service running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔐 API Key authentication enabled`);
});

export default app;
