# Stream Player - Project Guide

## Architecture

Server-first streaming architecture with automatic client-side fallback.

```
Browser                              Express Server (:8080)
┌──────────────────┐                ┌────────────────────────┐
│ VideoPlayer      │──health check──│ GET /health            │
│ (orchestrator)   │                │                        │
│                  │──magnet────────│ POST /api/torrent/add  │
│ ServerTorrent    │──range req─────│ GET /api/torrent/stream│
│ HlsPlayer       │──hls.js────────│ GET /api/hls/:id/*     │
│ DirectPlayer     │──video src─────│ GET /api/proxy/stream  │
│                  │                │                        │
│ ClientTorrent    │ (fallback)     │ StreamManager (LRU+TTL)│
│ (WebTorrent)     │ no server      │ 20 max, 30min TTL     │
└──────────────────┘                └────────────────────────┘
```

**Two modes:**
- **Server available** → all streaming proxied through Express (torrent-stream, HLS proxy, direct URL proxy)
- **Server unavailable** → client-side WebTorrent for torrents, direct hls.js/video for HLS/URLs

## Tech Stack

- **Frontend**: Next.js 16, React 19, Tailwind CSS 4, TypeScript
- **Server**: Express 5, torrent-stream, helmet, cors, rate-limit
- **Client libs**: hls.js (HLS), webtorrent (fallback only, dynamically imported)

## File Structure

```
src/
├── app/
│   ├── page.tsx                              # Main page - single VideoPlayer entrypoint
│   ├── layout.tsx                            # Root layout
│   ├── globals.css                           # Tailwind config
│   └── components/
│       ├── MagnetInputForm.tsx               # URL input (magnet/HLS/direct)
│       └── player/
│           ├── VideoPlayer.tsx               # Orchestrator - picks sub-player
│           ├── ServerTorrentPlayer.tsx        # Torrent via server proxy
│           ├── ClientTorrentPlayer.tsx        # WebTorrent fallback (dynamic import)
│           ├── HlsPlayer.tsx                 # HLS via hls.js
│           ├── DirectPlayer.tsx              # Direct video URL player
│           └── PlayerShell.tsx               # Shared loading/error UI
├── lib/
│   ├── url-detection.ts                      # Detects stream type from URL
│   ├── logger.ts                             # Dev-only logger (no-op in prod)
│   └── hooks/
│       └── useServerStatus.ts                # Health check hook
└── types/
    └── webtorrent.d.ts                       # WebTorrent type defs

standalone-server/
├── src/
│   ├── index.ts                              # Express entry - composes routes
│   ├── stream-manager.ts                     # LRU+TTL stream lifecycle manager
│   ├── types.ts                              # TorrentEngine, TorrentFile interfaces
│   ├── utils.ts                              # MIME types, URL validation, fetch timeout
│   └── routes/
│       ├── torrent.ts                        # POST /api/torrent/add, GET /api/torrent/stream/:id/:fileIndex
│       ├── hls.ts                            # POST /api/hls/add, GET /api/hls/:id/master, GET /api/hls/:id/segment/*
│       └── proxy.ts                          # POST /api/proxy/add, GET /api/proxy/stream/:id
└── package.json
```

## Running

```bash
# Frontend
pnpm dev

# Streaming server (separate terminal)
cd standalone-server && pnpm dev
# or from root: pnpm server

# Build
pnpm build
```

## Environment Variables

```bash
# Frontend (.env.local)
NEXT_PUBLIC_SERVER_URL=http://localhost:8080    # Streaming server URL
NEXT_PUBLIC_RELAY_API_KEY=                      # Optional API key

# Standalone server
PORT=8080
RELAY_API_KEY=                                  # API key (empty = dev mode, no auth)
MAX_STREAMS=20                                  # Max concurrent streams
STREAM_TTL_MIN=30                               # Stream TTL in minutes
FETCH_TIMEOUT_MS=15000                          # Upstream fetch timeout
```

## API Endpoints (Standalone Server)

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/health` | GET | No | Health check + stream stats |
| `/api/torrent/add` | POST | Yes | Start torrent engine, return metadata |
| `/api/torrent/stream/:id/:fileIndex` | GET | Yes | Stream file bytes (Range support) |
| `/api/hls/add` | POST | Yes | Register HLS stream for proxying |
| `/api/hls/:id/master` | GET | Yes | Rewritten m3u8 playlist |
| `/api/hls/:id/segment/*` | GET | Yes | Proxied HLS segments |
| `/api/proxy/add` | POST | Yes | Register direct URL for proxying |
| `/api/proxy/stream/:id` | GET | Yes | Proxy stream with Range support |
| `/api/streams` | GET | Yes | List active streams |
| `/api/streams/:id` | DELETE | Yes | Remove a stream |

## Key Design Decisions

1. **Server-first for torrents** - `torrent-stream` connects to full DHT+tracker network (thousands of peers). Browser WebTorrent only uses WebRTC (tiny peer pool). Server is always faster.
2. **WebTorrent as dynamic fallback only** - loaded via `next/dynamic` with `ssr: false`. Never in the initial bundle. Only fetched when server health check fails.
3. **No Next.js API routes** - all streaming logic lives in the standalone Express server. Next.js is purely a frontend. This avoids the stateless/serverless problem (torrent engines need persistent memory).
4. **Single VideoPlayer orchestrator** - one component decides which sub-player to render based on URL type + server availability. No broken routing by file size.

## Known Issues / Production Gaps

### Critical (Must Fix Before Production)

1. **SSRF via proxy routes** - `isValidHttpUrl()` in `standalone-server/src/utils.ts` only checks protocol, doesn't block private IPs (127.0.0.1, 169.254.169.254, 10.x, 192.168.x). Attacker can proxy to internal networks / cloud metadata.

2. **API key in URL query params** - `ServerTorrentPlayer.tsx:79` and `DirectPlayer.tsx:42` pass `?apiKey=` in URL. Leaked in browser history, server logs, referer headers. Should use headers only.

3. **Unbounded disk usage** - torrent downloads go to `os.tmpdir()/trhstreamer/{id}` but only cleaned on LRU eviction or TTL. No disk space check before accepting. No max download size.

4. **No torrent stream timeout** - `file.createReadStream()` in `routes/torrent.ts` has no timeout. If peers stop sending, stream hangs forever, holding the connection.

5. **No fd/connection limits** - 20 torrents x 100 peer connections = 2000 file descriptors. No middleware to cap concurrent connections. Will hit ulimit and crash.

6. **Race condition on eviction** - `StreamManager` can evict a stream via LRU while a GET request is actively reading from it. No reference counting. Destroyed engine mid-read = 500 error.

7. **HLS path traversal** - `routes/hls.ts:85` uses `new URL(suffix, baseUrl)` which can resolve `../` paths. Attacker can access arbitrary paths on the HLS origin server.

8. **Weak stream IDs** - `Math.random().toString(36).slice(2,10)` is predictable and brute-forceable. Should use `crypto.randomUUID()`.

### High (Degrades Under Load)

9. **Single process** - no clustering, no worker threads. All streams on one CPU core. No horizontal scaling (in-memory StreamManager).

10. **No backpressure handling** - `readable.pipe(res)` without timeout. Slow client = server buffers unbounded data in memory.

11. **No graceful shutdown** - `process.exit(0)` called immediately on SIGTERM. Active streams cut mid-request. Should drain connections first.

12. **Health check doesn't verify functionality** - only reports memory/uptime. Doesn't check disk space, torrent connectivity, or actual streaming ability.

13. **No Range validation** - `parseInt(parts[0])` without checking start < end, max chunk size. Malicious Range header = potential OOM.

14. **Client WebTorrent uncontrolled** - `new WebTorrent()` with no config. Uses all bandwidth, unlimited connections, unlimited memory.

### Medium (Operational)

15. **No structured logging** - `logger.ts` is console.log only in dev. No JSON logging, no correlation IDs, no timestamps for production.

16. **No metrics/monitoring** - no Prometheus, no StatsD. Can't monitor stream counts, error rates, latency.

17. **No error boundaries** - React error boundaries missing. JS error in any player = blank page.

18. **No circuit breaker** - if HLS origin is down, every proxy request hangs for 15s (FETCH_TIMEOUT_MS). No fast-fail after N failures.

19. **No env validation** - typo in RELAY_API_KEY env var = dev mode (no auth) in production silently.

20. **No Docker Compose** - no containerized deployment setup.

21. **Streams lost on restart** - in-memory only, no persistence. Deploy = all active streams die.

22. **No reconnection logic** - client-side players don't retry on transient network errors. One blip = permanent failure.

## Conventions

- No console.log in production code. Use `log.debug()` / `log.info()` from `src/lib/logger.ts`
- Player components go in `src/app/components/player/`
- Server routes go in `standalone-server/src/routes/`
- All streaming logic belongs in the standalone server, never in Next.js
- `useServerStatus()` hook handles server detection - components should not probe server themselves
- URL type detection uses `detectStreamType()` from `src/lib/url-detection.ts`
