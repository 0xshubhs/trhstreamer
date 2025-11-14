/**
 * Example client for the streaming server
 * This shows how to interact with the standalone server from your frontend
 */

export class StreamingClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string = 'http://localhost:8080', apiKey: string = '') {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  /**
   * Check server health
   */
  async checkHealth() {
    const response = await fetch(`${this.baseUrl}/health`);
    if (!response.ok) {
      throw new Error(`Health check failed: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Add an HLS stream
   */
  async addHlsStream(m3u8Url: string) {
    const response = await fetch(`${this.baseUrl}/api/add-stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
      },
      body: JSON.stringify({ m3u8Url }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to add stream: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get stream status
   */
  async getStreamStatus(id: string) {
    const response = await fetch(`${this.baseUrl}/api/status/${id}?apiKey=${this.apiKey}`);
    if (!response.ok) {
      throw new Error(`Failed to get status: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Delete a stream
   */
  async deleteStream(id: string) {
    const response = await fetch(`${this.baseUrl}/api/stream/${id}?apiKey=${this.apiKey}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error(`Failed to delete stream: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Get the master playlist URL for a stream
   */
  getMasterPlaylistUrl(id: string): string {
    return `${this.baseUrl}/api/stream/${id}/master?apiKey=${this.apiKey}`;
  }
}

// Usage example:
/*
const client = new StreamingClient('http://localhost:8080', 'your-api-key');

// Add HLS stream
const stream = await client.addHlsStream('https://example.com/playlist.m3u8');
console.log('Stream ID:', stream.id);

// Get master playlist URL for video player
const playlistUrl = client.getMasterPlaylistUrl(stream.id);
// Use playlistUrl with hls.js or native player

// Check status
const status = await client.getStreamStatus(stream.id);
console.log('Stream status:', status);

// Clean up
await client.deleteStream(stream.id);
*/
