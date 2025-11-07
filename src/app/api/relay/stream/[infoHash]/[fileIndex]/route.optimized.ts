// 🚀 OPTIMIZED VERSION - Performance Improvements Applied
// Changes:
// 1. On-demand piece selection (sequential with priority)
// 2. Optimized chunk sizes
// 3. Cache headers for performance
// 4. Access tracking

import { NextRequest, NextResponse } from 'next/server';
import { activeTorrents, updateTorrentAccess } from '../../../add/route.optimized';

const logger = {
  log: (...args: unknown[]) => process.env.NODE_ENV === 'development' && console.log(...args),
  error: (...args: unknown[]) => console.error(...args),
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ infoHash: string; fileIndex: string }> }
) {
  const { infoHash, fileIndex } = await params;
  logger.log(`=== API: GET /api/relay/stream/${infoHash.slice(0, 8)}.../${fileIndex} ===`);

  // 🚀 OPTIMIZATION 1: Track access for cleanup mechanism
  updateTorrentAccess(infoHash);

  const engine = activeTorrents.get(infoHash);

  if (!engine) {
    logger.error('API: Torrent not found:', infoHash);
    return NextResponse.json(
      { error: 'Torrent not found. It may have been cleaned up due to inactivity.' },
      { status: 404 }
    );
  }

  const fileIdx = parseInt(fileIndex);
  const file = engine.files[fileIdx];

  if (!file) {
    logger.error('API: File not found:', fileIdx);
    return NextResponse.json(
      { error: 'File not found' },
      { status: 404 }
    );
  }

  logger.log(`API: Streaming file: ${file.name}`);

  try {
    // Handle range requests for video seeking
    const range = request.headers.get('range');
    let start = 0;
    let end = file.length - 1;
    let statusCode = 200;
    
    // 🚀 OPTIMIZATION 2: Enhanced headers with cache and connection optimization
    const headers: Record<string, string> = {
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*',
      
      // Cache optimization - cache pieces for 1 hour
      'Cache-Control': 'public, max-age=3600',
      'Connection': 'keep-alive',
      'Keep-Alive': 'timeout=60',
      
      // Enable compression
      'Vary': 'Accept-Encoding',
    };

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      start = parseInt(parts[0], 10);
      end = parts[1] ? parseInt(parts[1], 10) : file.length - 1;
      
      // 🚀 OPTIMIZATION 3: Enforce minimum chunk size to reduce overhead
      const MIN_CHUNK_SIZE = 1024 * 64; // 64KB minimum
      const requestedSize = end - start + 1;
      
      if (requestedSize < MIN_CHUNK_SIZE && end < file.length - 1) {
        end = Math.min(start + MIN_CHUNK_SIZE - 1, file.length - 1);
        logger.log(`API: Adjusted range to minimum chunk size: ${start}-${end}`);
      }
      
      statusCode = 206; // Partial Content
      headers['Content-Range'] = `bytes ${start}-${end}/${file.length}`;
      headers['Content-Length'] = (end - start + 1).toString();
      
      logger.log(`API: Range request: bytes ${start}-${end}/${file.length} (${((end - start + 1) / 1024).toFixed(2)} KB)`);
    } else {
      headers['Content-Length'] = file.length.toString();
      logger.log(`API: Full file request: ${(file.length / 1024 / 1024).toFixed(2)} MB`);
    }

    // 🚀 OPTIMIZATION 4: Smart piece selection for streaming
    const pieceLength = engine.torrent.pieceLength;
    const firstPiece = Math.floor((file.offset + start) / pieceLength);
    const lastPiece = Math.floor((file.offset + end) / pieceLength);
    const LOOKAHEAD_PIECES = 10; // Buffer 10 pieces ahead
    
    logger.log(`API: Selecting pieces ${firstPiece} to ${lastPiece} (with ${LOOKAHEAD_PIECES} lookahead)`);
    
    // Deselect all pieces for this file first (prevents downloading entire file)
    file.deselect(0, file.length - 1, false);
    
    // Select only needed pieces with priority
    // Higher priority for current piece, lower for lookahead
    for (let i = firstPiece; i <= Math.min(lastPiece + LOOKAHEAD_PIECES, engine.torrent.pieces.length - 1); i++) {
      const priority = i === firstPiece ? 10 : (i <= lastPiece ? 8 : 5);
      file.select(i * pieceLength, Math.min((i + 1) * pieceLength - 1, file.length - 1), priority);
    }
    
    logger.log(`API: Prioritized pieces for streaming (first piece has priority 10)`);

    // Create a readable stream from the torrent file with range
    const stream = file.createReadStream({ start, end });
    
    // Track bytes sent for monitoring
    let bytesSent = 0;
    const startTime = Date.now();
    
    // Convert Node stream to Web Stream
    const readableStream = new ReadableStream({
      start(controller) {
        stream.on('data', (chunk: Buffer) => {
          controller.enqueue(new Uint8Array(chunk));
          bytesSent += chunk.length;
        });

        stream.on('end', () => {
          const duration = (Date.now() - startTime) / 1000;
          const speedMBps = (bytesSent / 1024 / 1024 / duration).toFixed(2);
          logger.log(`API: Stream complete - Sent ${(bytesSent / 1024).toFixed(2)} KB in ${duration.toFixed(2)}s (${speedMBps} MB/s)`);
          controller.close();
        });

        stream.on('error', (error: Error) => {
          logger.error('API: Stream error:', error);
          controller.error(error);
        });
      },
      cancel() {
        logger.log('API: Stream cancelled by client');
        stream.destroy();
      },
    });

    return new Response(readableStream, {
      status: statusCode,
      headers,
    });
  } catch (error) {
    logger.error('API: Error streaming file:', error);
    return NextResponse.json(
      { error: 'Failed to stream file' },
      { status: 500 }
    );
  }
}
