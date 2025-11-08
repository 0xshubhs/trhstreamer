import { NextRequest, NextResponse } from 'next/server';
import parseTorrent from 'parse-torrent';
import { getStreamConfig, shouldUseNodeService, formatBytes } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface StreamRequest {
  magnetUri?: string;
  m3u8Url?: string;
  infoHash?: string;
}

interface StreamResponse {
  service: 'nextjs' | 'nodejs';
  streamUrl: string;
  downloadUrl?: string;
  fileSize?: number;
  fileSizeFormatted?: string;
  fileName?: string;
  message?: string;
}

/**
 * Estimate HLS stream size from manifest
 * This is a rough estimate based on segment count and typical bitrates
 */
async function estimateHlsSize(m3u8Url: string): Promise<number> {
  try {
    const response = await fetch(m3u8Url);
    const content = await response.text();
    
    // Count segments
    const segments = content.split('\n').filter(line => 
      line.trim() && !line.startsWith('#')
    ).length;
    
    // Parse target duration if available
    const durationMatch = content.match(/#EXT-X-TARGETDURATION:(\d+)/);
    const segmentDuration = durationMatch ? parseInt(durationMatch[1]) : 10;
    
    // Parse bandwidth if available (highest quality)
    const bandwidthMatches = content.match(/#EXT-X-STREAM-INF:.*BANDWIDTH=(\d+)/g);
    let maxBandwidth = 5000000; // Default 5 Mbps
    
    if (bandwidthMatches && bandwidthMatches.length > 0) {
      const bandwidths = bandwidthMatches.map(match => {
        const bwMatch = match.match(/BANDWIDTH=(\d+)/);
        return bwMatch ? parseInt(bwMatch[1]) : 0;
      });
      maxBandwidth = Math.max(...bandwidths);
    }
    
    // Estimate: segments × duration × bandwidth / 8 (bits to bytes)
    const estimatedBytes = segments * segmentDuration * (maxBandwidth / 8);
    
    return estimatedBytes;
  } catch (error) {
    console.error('Error estimating HLS size:', error);
    // Default to 100 MB estimate if we can't determine
    return 100 * 1024 * 1024;
  }
}

/**
 * Get torrent metadata and file size
 */
async function getTorrentMetadata(magnetUri: string): Promise<{
  infoHash: string;
  name: string;
  size: number;
}> {
  try {
    const parsed = await parseTorrent(magnetUri);
    
    // For magnet links, we may not have size info immediately
    // We'll need to fetch from trackers or DHT
    // For now, return what we can parse
    const infoHash = parsed.infoHash || '';
    const name = parsed.name || 'Unknown';
    const size = parsed.length || 0;
    
    return { infoHash, name, size };
  } catch (error) {
    console.error('Error parsing magnet URI:', error);
    throw new Error('Invalid magnet URI');
  }
}

/**
 * Forward request to Node.js streaming service
 */
async function forwardToNodeService(
  magnetUri?: string,
  m3u8Url?: string
): Promise<StreamResponse> {
  const config = getStreamConfig();
  
  const payload = magnetUri ? { magnetUri } : { m3u8Url };
  
  const response = await fetch(`${config.nodeStreamerUrl}/api/add-stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  
  if (!response.ok) {
    throw new Error(`Node service error: ${response.statusText}`);
  }
  
  const data = await response.json();
  
  return {
    service: 'nodejs',
    streamUrl: `${config.nodeStreamerUrl}/api/stream/${data.id}`,
    downloadUrl: `${config.nodeStreamerUrl}/api/download/${data.id}`,
    fileSize: data.fileSize,
    fileSizeFormatted: data.fileSizeFormatted,
    fileName: data.fileName,
    message: 'Large file - routed to dedicated streaming service',
  };
}

/**
 * Handle stream request via Next.js API
 */
function handleViaNextjs(
  infoHash: string,
  name: string,
  size: number
): StreamResponse {
  return {
    service: 'nextjs',
    streamUrl: `/api/relay/stream/${infoHash}/0`,
    downloadUrl: `/api/relay/download/${infoHash}`,
    fileSize: size,
    fileSizeFormatted: formatBytes(size),
    fileName: name,
    message: 'Small file - handled by Next.js',
  };
}

/**
 * POST /api/stream
 * Determines routing for stream based on file size
 */
export async function POST(request: NextRequest) {
  try {
    const body: StreamRequest = await request.json();
    const { magnetUri, m3u8Url } = body;
    
    if (!magnetUri && !m3u8Url) {
      return NextResponse.json(
        { error: 'Either magnetUri or m3u8Url is required' },
        { status: 400 }
      );
    }
    
    // Handle magnet links
    if (magnetUri) {
      // Validate magnet URI format
      if (!magnetUri.startsWith('magnet:?')) {
        return NextResponse.json(
          { error: 'Invalid magnet URI format' },
          { status: 400 }
        );
      }
      
      const metadata = await getTorrentMetadata(magnetUri);
      
      // If we don't have size info or file is large, use client-side streaming
      // Server-side torrent streaming is currently disabled due to native module issues
      if (metadata.size === 0) {
        console.log('Size unknown - using client-side streaming');
        const response = handleViaNextjs(
          metadata.infoHash,
          metadata.name,
          metadata.size
        );
        return NextResponse.json(response);
      }
      
      // Check threshold - for very large files, use client-side WebTorrent
      if (shouldUseNodeService(metadata.size)) {
        console.log(
          `Large file detected (${formatBytes(metadata.size)}) - will use client-side WebTorrent`
        );
        const response = handleViaNextjs(
          metadata.infoHash,
          metadata.name,
          metadata.size
        );
        // Override the message to indicate client-side streaming
        response.message = `Large file (${formatBytes(metadata.size)}) - using client-side WebTorrent for better performance`;
        return NextResponse.json(response);
      }
      
      // Handle via Next.js server-side streaming
      console.log(
        `Small file detected (${formatBytes(metadata.size)}) - using server-side streaming`
      );
      const response = handleViaNextjs(
        metadata.infoHash,
        metadata.name,
        metadata.size
      );
      response.message = `Small file (${formatBytes(metadata.size)}) - using server-side streaming`;
      return NextResponse.json(response);
    }
    
    // Handle HLS streams
    if (m3u8Url) {
      // Validate URL format
      try {
        new URL(m3u8Url);
      } catch {
        return NextResponse.json(
          { error: 'Invalid m3u8 URL format' },
          { status: 400 }
        );
      }
      
      const estimatedSize = await estimateHlsSize(m3u8Url);
      
      // Check threshold
      if (shouldUseNodeService(estimatedSize)) {
        console.log(
          `Large HLS stream detected (${formatBytes(estimatedSize)}) - routing to Node.js service`
        );
        const response = await forwardToNodeService(undefined, m3u8Url);
        return NextResponse.json(response);
      }
      
      // Handle via Next.js (client-side HLS playback)
      console.log(
        `Small HLS stream detected (${formatBytes(estimatedSize)}) - handling client-side`
      );
      return NextResponse.json({
        service: 'nextjs',
        streamUrl: m3u8Url,
        fileSize: estimatedSize,
        fileSizeFormatted: formatBytes(estimatedSize),
        message: 'Small HLS stream - handled client-side',
      });
    }
    
    return NextResponse.json(
      { error: 'No valid stream source provided' },
      { status: 400 }
    );
    
  } catch (error) {
    console.error('Stream routing error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to process stream request',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/stream?magnet=... or ?m3u8=...
 * Alternative GET endpoint for simple requests
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const magnetUri = searchParams.get('magnet');
  const m3u8Url = searchParams.get('m3u8');
  
  // Forward to POST handler
  return POST(
    new NextRequest(request.url, {
      method: 'POST',
      body: JSON.stringify({ magnetUri, m3u8Url }),
      headers: { 'Content-Type': 'application/json' },
    })
  );
}
