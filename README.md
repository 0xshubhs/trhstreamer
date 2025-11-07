# Torrent & HLS Streamer

A production-ready Next.js application for streaming torrents and HLS playlists directly in your browser.

## ⚠️ Legal Notice

**This application is for educational and legal streaming purposes only.**

- You are solely responsible for ensuring you have the legal right to access and stream any content.
- Unauthorized distribution or streaming of copyrighted content is illegal and may result in civil and criminal penalties.
- This tool **does not** and **will not** implement features to bypass DRM, remove watermarks, or facilitate illegal sharing.

## Features

- 🎬 **Client-side torrent streaming** using WebTorrent (browser-based, WebRTC peers)
- 📺 **HLS playback** with hls.js and quality selection
- 💾 **Download functionality** for torrent files (with browser limitations warnings)
- � **Smart routing** - Automatically routes large files to dedicated Node.js service
- ⚡ **Scalable architecture** - Separate services for small and large file handling
- �🔒 **Security-first design** with input validation and sanitization
- ♿ **Accessible UI** with ARIA labels and keyboard navigation
- 🧪 **Full test coverage** (unit + E2E tests)
- 🚀 **Production-ready** with TypeScript, ESLint, Prettier

## Architecture Overview

This application uses a **dual-service architecture** that automatically routes streams based on file size:

### Small Files (≤ Threshold)
- Handled by **Next.js API routes**
- Client-side WebTorrent streaming
- Lightweight, serverless-friendly
- Perfect for files under 500 MB (configurable)

### Large Files (> Threshold)
- Routed to **dedicated Node.js service**
- Uses `webtorrent-hybrid` with full TCP/UDP support
- Efficient memory management and HTTP range support
- Handles large torrents (>500 MB) and intensive HLS remuxing

### How It Works

```
User Request
     ↓
┌────────────────────────┐
│  Next.js API Route     │
│  /api/stream           │
│  - Checks file size    │
│  - Determines routing  │
└────────────────────────┘
     ↓
┌────┴─────┐
│ Size Check│
└────┬─────┘
     │
     ├──→ Small File → Next.js API → Client-side WebTorrent
     │
     └──→ Large File → Node.js Service (port 8080)
                       └→ Full seeding/streaming capabilities
```

### Configuration

Set the threshold in `.env`:

```bash
# Files larger than this (in MB) will use the Node.js service
STREAM_SWITCH_THRESHOLD_MB=500

# Node.js service URL and API key
NODE_STREAMER_URL=http://localhost:8080
NODE_STREAMER_API_KEY=your-secure-api-key-here
```

## Tech Stack

- **Next.js 16** (App Router + TypeScript)
- **React 19**
- **Tailwind CSS 4**
- **WebTorrent** (client-side streaming)
- **hls.js** (HLS playback)
- **Zustand** (state management)
- **Jest + Testing Library** (unit tests)
- **Playwright** (E2E tests)

## Getting Started

### Prerequisites

- Node.js 18+ or 20+
- pnpm (recommended) or npm

### Installation

```bash
# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env

# Edit .env and set your API keys
# Required for Node.js streaming service:
# - NODE_STREAMER_API_KEY
```

### Development

#### Start Next.js App Only (Small Files)

```bash
# Start the development server
pnpm dev

# Or use the script
./scripts/dev.sh
```

#### Start Node.js Streaming Service (Large Files)

In a separate terminal:

```bash
# Make sure to set NODE_STREAMER_API_KEY in .env first
./scripts/start-relay.sh

# Or manually with ts-node
NODE_STREAMER_API_KEY=your-key PORT=8080 ts-node server/large-streamer.ts
```

#### Run Both Services

For development with both services:

```bash
# Terminal 1: Next.js app
pnpm dev

# Terminal 2: Node.js streaming service
./scripts/start-relay.sh
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build for Production

```bash
pnpm build
pnpm start
```

## Project Structure

```
my-torrent-streamer/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── stream/
│   │   │       └── route.ts          # Routing logic for stream requests
│   │   ├── components/
│   │   │   ├── MagnetInputForm.tsx   # Input form with validation
│   │   │   ├── TorrentPlayer.tsx     # WebTorrent player component
│   │   │   ├── HlsPlayer.tsx         # HLS player with quality selector
│   │   │   └── DownloadButton.tsx    # Download functionality
│   │   ├── page.tsx                  # Main application page
│   │   └── layout.tsx                # Root layout
│   ├── lib/
│   │   └── config.ts                 # Configuration utilities
│   └── types/
│       ├── webtorrent.d.ts           # TypeScript definitions
│       ├── parse-torrent.d.ts        # Parse-torrent types
│       └── webtorrent-hybrid.d.ts    # Hybrid types
├── server/
│   └── large-streamer.ts             # Node.js service for large files
├── tests/
│   ├── unit/                         # Unit tests
│   │   ├── MagnetInputForm.test.tsx
│   │   └── api-stream-route.test.ts  # Routing logic tests
│   └── e2e/                          # E2E tests
├── scripts/
│   ├── dev.sh                        # Development script
│   └── start-relay.sh                # Start Node.js service
└── public/
    └── test-fixtures/                # Test fixtures
```

## Usage

### Streaming Torrents

1. Paste a magnet link in the format: `magnet:?xt=urn:btih:...`
2. Click "Stream"
3. Wait for peers to connect (WebRTC in-browser)
4. Video will start playing automatically

**Note:** Browser-based torrenting relies on WebRTC peers. For best results:
- Use popular, well-seeded torrents
- Ensure your browser supports WebRTC
- Some networks may block WebRTC connections

### Streaming HLS

1. Paste an HLS playlist URL ending in `.m3u8`
2. Click "Stream"
3. Select quality if multiple renditions are available

## Testing

### Unit Tests

```bash
pnpm test
```

### E2E Tests

```bash
# Install Playwright browsers (first time only)
pnpm exec playwright install

# Run E2E tests
pnpm test:e2e

# Run E2E tests in UI mode
pnpm exec playwright test --ui
```

## Security Considerations

- ✅ Input validation and sanitization
- ✅ API key authentication for relay
- ✅ Rate limiting recommendations
- ✅ CSP headers
- ✅ DMCA reporting mechanism placeholder
- ✅ Legal notices prominently displayed

## Deployment

### Client-Only Deployment (Vercel)

For small files only (no large-file Node.js service):

```bash
# Deploy to Vercel
pnpm add -g vercel
vercel

# Set environment variables in Vercel dashboard:
# - STREAM_SWITCH_THRESHOLD_MB=500
```

### Full Deployment (Docker with Both Services)

For production with both Next.js and Node.js streaming service:

#### Docker Compose

```yaml
version: '3.8'

services:
  nextjs:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_STREAMER_URL=http://node-streamer:8080
      - NODE_STREAMER_API_KEY=${NODE_STREAMER_API_KEY}
      - STREAM_SWITCH_THRESHOLD_MB=500

  node-streamer:
    build:
      context: .
      dockerfile: Dockerfile.streamer
    ports:
      - "8080:8080"
    environment:
      - NODE_STREAMER_API_KEY=${NODE_STREAMER_API_KEY}
      - PORT=8080
```

#### Dockerfile (Next.js)

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
EXPOSE 3000
CMD ["pnpm", "start"]
```

#### Dockerfile.streamer (Node.js Service)

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY server/ ./server/
COPY src/types/ ./src/types/
COPY tsconfig.json ./
RUN pnpm add -D typescript ts-node
EXPOSE 8080
CMD ["pnpm", "exec", "ts-node", "server/large-streamer.ts"]
```

### Deployment Architecture Recommendations

1. **Next.js App**: Deploy to Vercel, AWS Amplify, or similar
2. **Node.js Service**: Deploy to:
   - AWS EC2/ECS with higher bandwidth
   - DigitalOcean Droplet with dedicated resources
   - Self-hosted VPS with good network connectivity
3. **Use NGINX**: Reverse proxy for TLS and rate limiting
4. **Monitor**: Track bandwidth usage and peer counts

### Environment Variables for Production

```bash
# Next.js App
NEXT_PUBLIC_API_URL=https://your-domain.com
NODE_STREAMER_URL=https://streamer.your-domain.com
NODE_STREAMER_API_KEY=your-secure-key
STREAM_SWITCH_THRESHOLD_MB=500

# Node.js Service
NODE_STREAMER_API_KEY=your-secure-key
PORT=8080
```

## Browser Compatibility

- ✅ Chrome/Edge 90+
- ✅ Firefox 88+
- ✅ Safari 14+ (native HLS support)
- ⚠️ WebTorrent requires WebRTC support

## Known Limitations

- **Browser memory limits**: Large file downloads may fail
- **WebRTC connectivity**: Depends on network configuration
- **HLS download**: Requires server-side processing
- **Mobile support**: Limited by browser capabilities

## License

MIT License

## Disclaimer

The developers of this tool are not responsible for any misuse or illegal activity performed with this software. Users must comply with all applicable laws and respect intellectual property rights.

---

**Remember:** Only stream content you have the legal right to access. 🔒
