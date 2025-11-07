// 🚀 OPTIMIZED VERSION - Performance Improvements Applied
// Changes:
// 1. Automatic cleanup of idle torrents (prevents memory leaks)
// 2. Optimized logging (throttled progress updates)
// 3. Better torrent configuration
// 4. Access tracking for cleanup

import { NextRequest, NextResponse } from 'next/server';
import torrentStream from 'torrent-stream';

// Store active torrent engines
const activeTorrents = new Map<string, any>();
const torrentTimestamps = new Map<string, number>();
const progressIntervals = new Map<string, NodeJS.Timeout>();

// Configuration
const TORRENT_IDLE_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL = 10 * 60 * 1000; // 10 minutes
const MIN_LOG_INTERVAL = 2000; // Log at most every 2 seconds

// Logger utility
const logger = {
  log: (...args: unknown[]) => process.env.NODE_ENV === 'development' && console.log(...args),
  error: (...args: unknown[]) => console.error(...args),
};

// 🚀 OPTIMIZATION 1: Track last access time for cleanup
export function updateTorrentAccess(infoHash: string) {
  torrentTimestamps.set(infoHash, Date.now());
}

// 🚀 OPTIMIZATION 2: Cleanup old torrents to prevent memory leaks
function cleanupOldTorrents() {
  const now = Date.now();
  let cleanedCount = 0;
  
  for (const [infoHash, timestamp] of torrentTimestamps.entries()) {
    if (now - timestamp > TORRENT_IDLE_TIMEOUT) {
      logger.log(`SERVER: Cleaning up idle torrent: ${infoHash}`);
      const engine = activeTorrents.get(infoHash);
      
      if (engine) {
        // Clear progress interval
        const interval = progressIntervals.get(infoHash);
        if (interval) {
          clearInterval(interval);
          progressIntervals.delete(infoHash);
        }
        
        // Destroy engine
        engine.destroy();
        activeTorrents.delete(infoHash);
        torrentTimestamps.delete(infoHash);
        cleanedCount++;
      }
    }
  }
  
  if (cleanedCount > 0) {
    logger.log(`SERVER: Cleaned up ${cleanedCount} idle torrent(s)`);
  }
  
  // Log current memory usage
  if (process.env.NODE_ENV === 'development') {
    const memUsage = process.memoryUsage();
    logger.log(`SERVER: Memory usage - RSS: ${(memUsage.rss / 1024 / 1024).toFixed(2)} MB, Heap: ${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    logger.log(`SERVER: Active torrents: ${activeTorrents.size}`);
  }
}

// Run cleanup periodically
setInterval(cleanupOldTorrents, CLEANUP_INTERVAL);

export async function POST(request: NextRequest) {
  try {
    logger.log('=== API: POST /api/relay/add called ===');
    
    const { magnetURI } = await request.json();
    logger.log('API: Received magnet:', magnetURI);
    
    if (!magnetURI || typeof magnetURI !== 'string') {
      return NextResponse.json(
        { error: 'Invalid magnet URI' },
        { status: 400 }
      );
    }

    return new Promise((resolve) => {
      logger.log('SERVER: Creating torrent-stream engine...');
      
      // 🚀 OPTIMIZATION 3: Better torrent configuration
      const engine = torrentStream(magnetURI, {
        connections: 100,     // Max connections
        uploads: 10,          // Max upload slots
        path: '/tmp/torrents', // Temp storage
        verify: true,         // Verify pieces (integrity)
        dht: true,            // Use DHT for peer discovery
        tracker: true,        // Use trackers
      });

      let resolved = false;

      engine.on('ready', () => {
        if (resolved) return;
        resolved = true;

        logger.log('=== SERVER: Torrent engine ready ===');
        logger.log('Torrent name:', engine.torrent.name);
        logger.log('Torrent infoHash:', engine.infoHash);
        
        const infoHash = engine.infoHash;
        activeTorrents.set(infoHash, engine);
        torrentTimestamps.set(infoHash, Date.now()); // Track creation time

        // DO NOT select all files immediately - select on-demand in stream endpoint
        // This is a critical optimization for large torrents
        logger.log('SERVER: Torrent files ready for on-demand streaming');

        const files = engine.files.map((file: any, index: number) => ({
          name: file.name,
          length: file.length,
          index,
        }));

        logger.log(`SERVER: Torrent has ${files.length} file(s)`);

        // 🚀 OPTIMIZATION 4: Throttled progress logging
        let lastLoggedProgress = 0;
        let lastLogTime = 0;
        
        const progressInterval = setInterval(() => {
          const downloaded = engine.swarm.downloaded;
          const total = engine.torrent.length;
          const progress = Math.floor((downloaded / total) * 100);
          const now = Date.now();
          
          // Only log if progress increased by at least 5% AND enough time has passed
          if (progress > lastLoggedProgress && 
              progress - lastLoggedProgress >= 5 && 
              now - lastLogTime >= MIN_LOG_INTERVAL) {
            
            const speed = engine.swarm.downloadSpeed();
            const speedMB = (speed / 1024 / 1024).toFixed(2);
            const peers = engine.swarm.wires.length;
            
            logger.log(`SERVER: [${infoHash.slice(0, 8)}] Progress: ${progress}% | Speed: ${speedMB} MB/s | Peers: ${peers}`);
            lastLoggedProgress = progress;
            lastLogTime = now;
          }
          
          // Always log when complete
          if (progress === 100 && lastLoggedProgress < 100) {
            logger.log(`SERVER: [${infoHash.slice(0, 8)}] ✓ Download complete!`);
            lastLoggedProgress = 100;
          }
        }, 1000);
        
        // Store interval for cleanup
        progressIntervals.set(infoHash, progressInterval);

        // 🚀 OPTIMIZATION 5: Clean up interval on engine lifecycle events
        engine.on('idle', () => {
          const interval = progressIntervals.get(infoHash);
          if (interval) {
            clearInterval(interval);
            progressIntervals.delete(infoHash);
          }
          logger.log(`SERVER: [${infoHash.slice(0, 8)}] Torrent download idle`);
        });

        engine.on('download', () => {
          // Update access timestamp on download activity
          updateTorrentAccess(infoHash);
        });

        resolve(
          NextResponse.json({
            success: true,
            infoHash,
            name: engine.torrent.name,
            files,
          })
        );
      });

      engine.on('error', (err: Error) => {
        if (resolved) return;
        resolved = true;
        logger.error('SERVER: Torrent engine error:', err);
        resolve(
          NextResponse.json(
            { error: err.message || 'Failed to add torrent' },
            { status: 500 }
          )
        );
      });

      // Add timeout to prevent hanging requests
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          logger.error('SERVER: Torrent add timeout after 30s');
          engine.destroy();
          resolve(
            NextResponse.json(
              { error: 'Timeout: Failed to initialize torrent after 30 seconds' },
              { status: 504 }
            )
          );
        }
      }, 30000); // 30 second timeout
    });
  } catch (error: unknown) {
    logger.error('API: Error adding torrent:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to add torrent';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

export { activeTorrents };
