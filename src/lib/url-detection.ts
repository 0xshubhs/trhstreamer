export type StreamType = 'torrent' | 'hls' | 'direct';

const VIDEO_EXTENSIONS = /\.(mp4|webm|mkv|avi|mov|flv|wmv|m4v|ogg)(\?.*)?$/i;
const HLS_PATTERN = /\.m3u8(\?.*)?$/i;

export function detectStreamType(input: string): StreamType | null {
  const trimmed = input.trim();

  if (trimmed.startsWith('magnet:?') && trimmed.includes('xt=urn:')) {
    return 'torrent';
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

    if (HLS_PATTERN.test(url.pathname) || HLS_PATTERN.test(trimmed)) {
      return 'hls';
    }

    if (VIDEO_EXTENSIONS.test(url.pathname)) {
      return 'direct';
    }

    // Any valid HTTP URL treated as direct (server will probe content-type)
    return 'direct';
  } catch {
    return null;
  }
}
