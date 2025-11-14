# Torrent & HLS Streaming Server

An independent streaming server for proxying HLS content and managing torrent streams (server-side torrent disabled by default).

## Features

- 🎥 HLS proxy with automatic playlist rewriting
- 🔐 API key authentication
- 🛡️ Security headers via Helmet
- ⚡ Rate limiting
- 📊 Health monitoring
- 🔄 Range request support for video seeking

## Prerequisites

- Node.js >= 20.0.0
- pnpm (or npm/yarn)

## Installation

```bash
# Install dependencies
pnpm install
```

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

**Required environment variables:**

- `RELAY_API_KEY` - Secret key for API authentication (REQUIRED for production)
- `PORT` - Server port (default: 8080)
- `FETCH_TIMEOUT_MS` - Timeout for upstream requests (default: 15000)

## Development

```bash
# Run in development mode with auto-reload
pnpm dev
```

## Production

```bash
# Build the project
pnpm build

# Start the server
pnpm start
```

## API Endpoints

### Health Check
```
GET /health
```
Returns server status, active streams, uptime, and memory usage.

### Add HLS Stream
```
POST /api/add-stream
Headers: x-api-key: YOUR_API_KEY
Body: { "m3u8Url": "https://example.com/playlist.m3u8" }
```

### Stream Master Playlist
```
GET /api/stream/:id/master?apiKey=YOUR_API_KEY
```

### Stream Segments
```
GET /api/stream/:id/p/*?apiKey=YOUR_API_KEY
```

### Get Stream Status
```
GET /api/status/:id?apiKey=YOUR_API_KEY
```

### Delete Stream
```
DELETE /api/stream/:id?apiKey=YOUR_API_KEY
```

## Security

- Always set `RELAY_API_KEY` in production
- The server includes rate limiting (60 requests per minute)
- Helmet provides security headers
- Only use for authorized/legal content

## Docker Deployment (Optional)

Create a `Dockerfile`:

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

EXPOSE 8080

CMD ["pnpm", "start"]
```

Build and run:

```bash
docker build -t streaming-server .
docker run -p 8080:8080 -e RELAY_API_KEY=your-secret-key streaming-server
```

## License

MIT

## Legal Notice

⚠️ **IMPORTANT**: This software is intended for streaming legal, authorized content only. Users are responsible for ensuring they have proper rights and licenses for all content streamed through this server. The authors assume no liability for misuse.
