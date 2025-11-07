/**
 * Configuration utility for streaming service
 * Handles environment variables and threshold settings
 */

export interface StreamConfig {
  /** Threshold in MB - files larger than this use Node.js service */
  streamSwitchThresholdMB: number;
  /** Threshold in bytes for internal calculations */
  streamSwitchThresholdBytes: number;
  /** URL of the dedicated Node.js streaming service */
  nodeStreamerUrl: string;
  /** API key for Node.js streaming service */
  nodeStreamerApiKey: string;
  /** Relay API key for torrent relay */
  relayApiKey?: string;
}

/**
 * Parse and validate streaming configuration from environment
 */
export function getStreamConfig(): StreamConfig {
  const thresholdMB = parseInt(
    process.env.STREAM_SWITCH_THRESHOLD_MB || '500',
    10
  );

  if (isNaN(thresholdMB) || thresholdMB <= 0) {
    throw new Error(
      'STREAM_SWITCH_THRESHOLD_MB must be a positive number'
    );
  }

  const nodeStreamerUrl = process.env.NODE_STREAMER_URL || 'http://localhost:8080';
  const nodeStreamerApiKey = process.env.NODE_STREAMER_API_KEY || '';

  if (!nodeStreamerApiKey) {
    console.warn(
      'Warning: NODE_STREAMER_API_KEY not set. Node.js streaming service will not be available.'
    );
  }

  return {
    streamSwitchThresholdMB: thresholdMB,
    streamSwitchThresholdBytes: thresholdMB * 1024 * 1024,
    nodeStreamerUrl,
    nodeStreamerApiKey,
    relayApiKey: process.env.RELAY_API_KEY,
  };
}

/**
 * Determine if a file should use the Node.js streaming service
 */
export function shouldUseNodeService(fileSizeBytes: number): boolean {
  const config = getStreamConfig();
  return fileSizeBytes > config.streamSwitchThresholdBytes;
}

/**
 * Format bytes to human-readable size
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}
