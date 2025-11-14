export interface StreamInfo {
  id: string;
  type: 'torrent' | 'hls';
  fileSize: number;
  fileName: string;
  startTime: number;
  hls?: HlsInfo;
  torrent?: any | null;
  magnetUri?: string;
  m3u8Url?: string;
}

export interface HlsInfo {
  baseUrl: string;
  lastAccess: number;
}

export interface AddStreamRequest {
  magnetUri?: string;
  m3u8Url?: string;
}

export interface AddStreamResponse {
  id: string;
  type: 'hls' | 'torrent';
  fileName: string;
  fileSize: number;
  fileSizeFormatted: string;
  master?: string;
  proxyBase?: string;
  message: string;
}

export interface HealthResponse {
  status: 'ok' | 'error';
  activeStreams: number;
  uptime: number;
  memory: NodeJS.MemoryUsage;
  hlsIds: string[];
}

export interface ErrorResponse {
  error: string;
  suggestion?: string;
  infoHash?: string;
}
