/**
 * @jest-environment node
 */

import { POST, GET } from '@/app/api/stream/route';
import { NextRequest } from 'next/server';
import { getStreamConfig, shouldUseNodeService } from '@/lib/config';

// Mock modules
jest.mock('@/lib/config');
jest.mock('parse-torrent', () => jest.fn());

const mockedGetStreamConfig = getStreamConfig as jest.MockedFunction<typeof getStreamConfig>;
const mockedShouldUseNodeService = shouldUseNodeService as jest.MockedFunction<typeof shouldUseNodeService>;

// Import parse-torrent after mocking
// eslint-disable-next-line @typescript-eslint/no-require-imports
const parseTorrent = require('parse-torrent') as jest.Mock;

describe('/api/stream routing logic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default mock implementations
    mockedGetStreamConfig.mockReturnValue({
      streamSwitchThresholdMB: 500,
      streamSwitchThresholdBytes: 500 * 1024 * 1024,
      nodeStreamerUrl: 'http://localhost:8080',
      nodeStreamerApiKey: 'test-api-key',
      relayApiKey: 'relay-key',
    });
  });

  describe('POST /api/stream', () => {
    it('should return 400 if neither magnetUri nor m3u8Url is provided', async () => {
      const request = new NextRequest('http://localhost:3000/api/stream', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Either magnetUri or m3u8Url is required');
    });

    it('should return 400 for invalid magnet URI format', async () => {
      const request = new NextRequest('http://localhost:3000/api/stream', {
        method: 'POST',
        body: JSON.stringify({ magnetUri: 'not-a-magnet-link' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid magnet URI format');
    });

    it('should return 400 for invalid m3u8 URL format', async () => {
      const request = new NextRequest('http://localhost:3000/api/stream', {
        method: 'POST',
        body: JSON.stringify({ m3u8Url: 'not-a-valid-url' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid m3u8 URL format');
    });

    it('should route small files to Next.js service', async () => {
      // Mock parse-torrent
      parseTorrent.mockResolvedValue({
        infoHash: 'abc123',
        name: 'test-file.mp4',
        length: 100 * 1024 * 1024, // 100 MB (small file)
      });

      mockedShouldUseNodeService.mockReturnValue(false);

      const request = new NextRequest('http://localhost:3000/api/stream', {
        method: 'POST',
        body: JSON.stringify({
          magnetUri: 'magnet:?xt=urn:btih:abc123&dn=test-file.mp4',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.service).toBe('nextjs');
      expect(data.streamUrl).toContain('/api/relay/stream/');
      expect(data.message).toContain('Small file');
    });

    it('should route large files to Node.js service', async () => {
      // Mock parse-torrent
      parseTorrent.mockResolvedValue({
        infoHash: 'def456',
        name: 'large-file.mkv',
        length: 2 * 1024 * 1024 * 1024, // 2 GB (large file)
      });

      mockedShouldUseNodeService.mockReturnValue(true);

      // Mock fetch for Node.js service
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'stream-id-123',
          fileName: 'large-file.mkv',
          fileSize: 2 * 1024 * 1024 * 1024,
          fileSizeFormatted: '2 GB',
        }),
      });

      const request = new NextRequest('http://localhost:3000/api/stream', {
        method: 'POST',
        body: JSON.stringify({
          magnetUri: 'magnet:?xt=urn:btih:def456&dn=large-file.mkv',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.service).toBe('nodejs');
      expect(data.streamUrl).toContain('http://localhost:8080');
      expect(data.message).toContain('Large file');
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/add-stream',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'X-API-Key': 'test-api-key',
          }),
        })
      );
    });

    it('should route unknown-size torrents to Node.js service for safety', async () => {
      // Mock parse-torrent with no size info
      parseTorrent.mockResolvedValue({
        infoHash: 'xyz789',
        name: 'unknown-size-file.mp4',
        length: 0, // Unknown size
      });

      // Mock fetch for Node.js service
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'stream-id-456',
          fileName: 'unknown-size-file.mp4',
          fileSize: 0,
          fileSizeFormatted: 'Unknown',
        }),
      });

      const request = new NextRequest('http://localhost:3000/api/stream', {
        method: 'POST',
        body: JSON.stringify({
          magnetUri: 'magnet:?xt=urn:btih:xyz789&dn=unknown-size-file.mp4',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.service).toBe('nodejs');
      expect(global.fetch).toHaveBeenCalled();
    });

    it('should handle HLS streams based on estimated size', async () => {
      // Mock fetch for HLS manifest
      global.fetch = jest.fn()
        .mockResolvedValueOnce({
          ok: true,
          text: async () => `
            #EXTM3U
            #EXT-X-TARGETDURATION:10
            #EXT-X-STREAM-INF:BANDWIDTH=2000000
            segment1.ts
            segment2.ts
            segment3.ts
          `,
        });

      mockedShouldUseNodeService.mockReturnValue(false);

      const request = new NextRequest('http://localhost:3000/api/stream', {
        method: 'POST',
        body: JSON.stringify({
          m3u8Url: 'https://example.com/playlist.m3u8',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.service).toBe('nextjs');
      expect(data.streamUrl).toBe('https://example.com/playlist.m3u8');
      expect(data.message).toContain('Small HLS stream');
    });
  });

  describe('GET /api/stream', () => {
    it('should support GET requests with query parameters', async () => {
      // Mock parse-torrent
      parseTorrent.mockResolvedValue({
        infoHash: 'abc123',
        name: 'test-file.mp4',
        length: 100 * 1024 * 1024,
      });

      mockedShouldUseNodeService.mockReturnValue(false);

      const request = new NextRequest(
        'http://localhost:3000/api/stream?magnet=magnet:?xt=urn:btih:abc123',
        { method: 'GET' }
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.service).toBe('nextjs');
    });
  });
});
