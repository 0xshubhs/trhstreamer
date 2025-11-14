# Streaming Server - Quick Start Guide

## Local Development

### 1. Install Dependencies
```bash
cd standalone-server
pnpm install
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env and set your RELAY_API_KEY
```

### 3. Run Development Server
```bash
pnpm dev
# or
chmod +x scripts/dev.sh
./scripts/dev.sh
```

Server will start at `http://localhost:8080`

## Testing the Server

### Health Check
```bash
curl http://localhost:8080/health
```

### Add an HLS Stream
```bash
curl -X POST http://localhost:8080/api/add-stream \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key-here" \
  -d '{"m3u8Url": "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8"}'
```

Response:
```json
{
  "id": "abc123",
  "type": "hls",
  "master": "/api/stream/abc123/master",
  "proxyBase": "/api/stream/abc123/p/"
}
```

### Stream the Content
```bash
# Get master playlist
curl "http://localhost:8080/api/stream/abc123/master?apiKey=your-api-key-here"
```

## Production Deployment

### Option 1: Node.js
```bash
# Build
pnpm build

# Start
RELAY_API_KEY=your-secret-key pnpm start
```

### Option 2: Docker
```bash
# Build image
docker build -t streaming-server .

# Run container
docker run -d \
  -p 8080:8080 \
  -e RELAY_API_KEY=your-secret-key \
  --name streaming-server \
  streaming-server
```

### Option 3: Docker Compose
```bash
# Set environment variable
export RELAY_API_KEY=your-secret-key

# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `RELAY_API_KEY` | **Yes** | - | API authentication key |
| `PORT` | No | 8080 | Server port |
| `FETCH_TIMEOUT_MS` | No | 15000 | Upstream fetch timeout |
| `MAX_JSON` | No | 1mb | Max JSON body size |
| `NODE_ENV` | No | production | Environment mode |

## API Reference

### POST /api/add-stream
Add a new HLS stream for proxying.

**Headers:**
- `x-api-key: YOUR_API_KEY`

**Body:**
```json
{
  "m3u8Url": "https://example.com/playlist.m3u8"
}
```

### GET /api/stream/:id/master
Get the master playlist for a stream.

**Query Params:**
- `apiKey: YOUR_API_KEY`

### GET /api/status/:id
Get stream status and statistics.

### DELETE /api/stream/:id
Remove a stream from the server.

## Monitoring

The server exposes metrics at `/health`:

```json
{
  "status": "ok",
  "activeStreams": 2,
  "uptime": 3600,
  "memory": {
    "rss": 50000000,
    "heapTotal": 20000000,
    "heapUsed": 15000000
  },
  "hlsIds": ["abc123", "def456"]
}
```

## Troubleshooting

### Server won't start
- Check that Node.js >= 20 is installed: `node --version`
- Ensure all dependencies are installed: `pnpm install`
- Verify `.env` file exists with `RELAY_API_KEY` set

### 401 Unauthorized errors
- Make sure you're passing the correct API key in headers or query params
- Verify `RELAY_API_KEY` matches in both client and server

### Upstream connection timeouts
- Increase `FETCH_TIMEOUT_MS` in `.env`
- Check that the upstream HLS URL is accessible
- Verify network connectivity

### High memory usage
- Monitor active streams: `curl http://localhost:8080/health`
- Delete unused streams via `DELETE /api/stream/:id`
- Consider implementing stream cleanup/expiry

## Integration with Frontend

Update your Next.js frontend to point to this server:

```typescript
// In your Next.js app
const SERVER_URL = process.env.NEXT_PUBLIC_STREAMING_SERVER || 'http://localhost:8080';
const API_KEY = process.env.NEXT_PUBLIC_STREAMING_API_KEY;

const response = await fetch(`${SERVER_URL}/api/add-stream`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': API_KEY,
  },
  body: JSON.stringify({ m3u8Url: url }),
});
```

## Security Best Practices

1. **Always use HTTPS in production** - Deploy behind nginx or a reverse proxy
2. **Set strong API keys** - Use random, long strings (32+ characters)
3. **Enable rate limiting** - Already configured for 60 req/min
4. **Monitor logs** - Watch for suspicious activity
5. **Regular updates** - Keep dependencies updated

## License

MIT - See LICENSE file for details
