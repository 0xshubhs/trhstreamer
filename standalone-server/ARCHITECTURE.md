# Architecture Overview

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐    ┌─────────────────┐   ┌─────────────┐ │
│  │   Next.js App   │    │   React Web     │   │  Mobile App │ │
│  │   (Frontend)    │    │   Application   │   │   (React)   │ │
│  └────────┬────────┘    └────────┬────────┘   └──────┬──────┘ │
│           │                      │                     │        │
│           └──────────────────────┼─────────────────────┘        │
│                                  │                              │
└──────────────────────────────────┼──────────────────────────────┘
                                   │
                                   │ HTTP/HTTPS
                                   │ x-api-key: xxxxxx
                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                      STANDALONE SERVER                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                  Express.js Application                  │  │
│  │                                                          │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │  │
│  │  │   Helmet     │  │   CORS       │  │ Rate Limiter │  │  │
│  │  │  (Security)  │  │  (Enabled)   │  │  (60 req/m)  │  │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  │  │
│  │                                                          │  │
│  │  ┌──────────────────────────────────────────────────┐   │  │
│  │  │           API Key Authentication                 │   │  │
│  │  └──────────────────────────────────────────────────┘   │  │
│  │                                                          │  │
│  │  ┌─────────────────────────────────────────────────────┐│  │
│  │  │              API Endpoints                          ││  │
│  │  │                                                     ││  │
│  │  │  GET  /health                                      ││  │
│  │  │  POST /api/add-stream                              ││  │
│  │  │  GET  /api/stream/:id/master                       ││  │
│  │  │  GET  /api/stream/:id/p/*                          ││  │
│  │  │  GET  /api/status/:id                              ││  │
│  │  │  DEL  /api/stream/:id                              ││  │
│  │  └─────────────────────────────────────────────────────┘│  │
│  │                                                          │  │
│  │  ┌─────────────────────────────────────────────────────┐│  │
│  │  │         In-Memory Stream Management                 ││  │
│  │  │         (Map<string, StreamInfo>)                   ││  │
│  │  └─────────────────────────────────────────────────────┘│  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          │ HTTP/HTTPS
                          │ Fetch with timeout
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      UPSTREAM SOURCES                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌────────────────┐    ┌────────────────┐   ┌───────────────┐  │
│  │  HLS Servers   │    │  CDN Services  │   │  Live Streams │  │
│  │  (.m3u8)       │    │  (Cloudflare)  │   │  (Legal only) │  │
│  └────────────────┘    └────────────────┘   └───────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Request Flow

### Adding an HLS Stream

```
1. Client Request
   ↓
   POST /api/add-stream
   Headers: x-api-key, Content-Type
   Body: { "m3u8Url": "https://..." }
   ↓
2. Server Processing
   ↓
   - Validate API key
   - Validate URL format
   - Generate unique stream ID
   - Store stream info in memory
   ↓
3. Server Response
   ↓
   {
     "id": "abc123",
     "type": "hls",
     "master": "/api/stream/abc123/master",
     "proxyBase": "/api/stream/abc123/p/"
   }
```

### Streaming Content

```
1. Client Request
   ↓
   GET /api/stream/:id/master?apiKey=xxx
   ↓
2. Server Processing
   ↓
   - Validate API key
   - Lookup stream info
   - Fetch upstream playlist
   - Rewrite relative URLs
   - Proxy to client
   ↓
3. Client Request (segments)
   ↓
   GET /api/stream/:id/p/segment-001.ts
   ↓
4. Server Processing
   ↓
   - Validate API key
   - Resolve segment URL
   - Forward range headers
   - Stream to client
```

## Deployment Architectures

### Simple Deployment

```
┌─────────────┐
│   Clients   │
└──────┬──────┘
       │
       │ HTTPS
       ▼
┌─────────────┐
│   Nginx     │ ← SSL Termination
│   :443      │
└──────┬──────┘
       │
       │ HTTP
       ▼
┌─────────────┐
│   Server    │
│   :8080     │
└─────────────┘
```

### Docker Deployment

```
┌─────────────┐
│   Clients   │
└──────┬──────┘
       │
       │ HTTPS
       ▼
┌──────────────────────┐
│   Docker Host        │
│  ┌────────────────┐  │
│  │  Nginx         │  │
│  │  Container     │  │
│  └────────┬───────┘  │
│           │          │
│           ▼          │
│  ┌────────────────┐  │
│  │  Server        │  │
│  │  Container     │  │
│  └────────────────┘  │
└──────────────────────┘
```

### Kubernetes Deployment

```
┌─────────────┐
│   Clients   │
└──────┬──────┘
       │
       ▼
┌──────────────────────────────────┐
│   Kubernetes Cluster             │
│  ┌────────────────────────────┐  │
│  │   Ingress Controller       │  │
│  │   (SSL Termination)        │  │
│  └────────┬───────────────────┘  │
│           │                      │
│           ▼                      │
│  ┌────────────────────────────┐  │
│  │   Service (Load Balancer)  │  │
│  └────────┬───────────────────┘  │
│           │                      │
│      ┌────┴────┬────┬────┐       │
│      ▼         ▼    ▼    ▼       │
│   ┌────┐   ┌────┐ ...  ┌────┐   │
│   │Pod │   │Pod │      │Pod │   │
│   └────┘   └────┘      └────┘   │
│   (Replicas: 3+)                 │
└──────────────────────────────────┘
```

## Component Interactions

```
┌────────────────────────────────────────────────────────────┐
│                    Standalone Server                       │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  ┌──────────────┐          ┌──────────────┐              │
│  │  Middleware  │──────────│  Auth Check  │              │
│  └──────┬───────┘          └──────────────┘              │
│         │                                                 │
│         ▼                                                 │
│  ┌──────────────────────────────────────────┐            │
│  │           Route Handlers                 │            │
│  │                                          │            │
│  │  /health         (Public)                │            │
│  │  /api/add-stream (Protected)             │            │
│  │  /api/stream/*   (Protected)             │            │
│  │  /api/status/*   (Protected)             │            │
│  └─────────┬────────────────────────────────┘            │
│            │                                              │
│            ▼                                              │
│  ┌─────────────────────────────────┐                     │
│  │   Stream Manager (In-Memory)    │                     │
│  │   - Store stream metadata       │                     │
│  │   - Track active streams         │                     │
│  │   - Manage HLS sessions          │                     │
│  └─────────┬───────────────────────┘                     │
│            │                                              │
│            ▼                                              │
│  ┌─────────────────────────────────┐                     │
│  │   Upstream Fetch Service        │                     │
│  │   - Timeout control (15s)       │                     │
│  │   - Header forwarding           │                     │
│  │   - Range request support       │                     │
│  └─────────────────────────────────┘                     │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

## Data Flow

### Stream Addition Flow

```
Client ──┬──> POST /api/add-stream
         │
         ├──> Validate API Key
         │
         ├──> Validate m3u8 URL
         │
         ├──> Generate Stream ID
         │
         ├──> Store in activeStreams Map
         │     {
         │       id: "abc123",
         │       type: "hls",
         │       hls: { baseUrl: "...", lastAccess: ... }
         │     }
         │
         └──> Return Stream Info
              {
                id: "abc123",
                master: "/api/stream/abc123/master"
              }
```

### HLS Proxy Flow

```
Client ──┬──> GET /api/stream/abc123/master
         │
         ├──> Validate API Key
         │
         ├──> Lookup Stream (abc123)
         │
         ├──> Fetch Upstream Playlist
         │     https://upstream.com/master.m3u8
         │
         ├──> Parse & Rewrite URLs
         │     segment-001.ts → /api/stream/abc123/p/segment-001.ts
         │
         └──> Return Rewritten Playlist

Client ──┬──> GET /api/stream/abc123/p/segment-001.ts
         │
         ├──> Validate API Key
         │
         ├──> Resolve Full URL
         │     https://upstream.com/segment-001.ts
         │
         ├──> Forward Range Headers
         │
         ├──> Fetch & Stream
         │
         └──> Return Video Segment
```

## Security Layers

```
┌────────────────────────────────────────┐
│  1. Network Layer                      │
│     - Firewall rules                   │
│     - DDoS protection                  │
└────────────────┬───────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────┐
│  2. Transport Layer                    │
│     - HTTPS/TLS encryption             │
│     - Certificate validation           │
└────────────────┬───────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────┐
│  3. Application Layer                  │
│     - Rate limiting (60 req/min)       │
│     - API key authentication           │
│     - Request validation               │
└────────────────┬───────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────┐
│  4. Data Layer                         │
│     - URL validation                   │
│     - Timeout enforcement              │
│     - Resource limits                  │
└────────────────────────────────────────┘
```

## File Structure Relationships

```
standalone-server/
│
├── Configuration
│   ├── package.json      (Dependencies & Scripts)
│   ├── tsconfig.json     (TypeScript Config)
│   ├── eslint.config.js  (Linting Rules)
│   └── .env.example      (Environment Template)
│
├── Source Code
│   └── src/
│       ├── index.ts      (Main Server)
│       └── types.ts      (Type Definitions)
│
├── Build Output
│   └── dist/             (Compiled JS - created by build)
│
├── Deployment
│   ├── Dockerfile        (Container Image)
│   ├── docker-compose.yml (Multi-container Setup)
│   └── .github/workflows/ (CI/CD Pipeline)
│
├── Scripts
│   └── scripts/
│       ├── dev.sh        (Development)
│       └── start-prod.sh (Production)
│
├── Examples
│   └── examples/
│       ├── client.ts     (Client Library)
│       └── test-api.sh   (API Testing)
│
└── Documentation
    ├── README.md         (Overview)
    ├── QUICKSTART.md     (Getting Started)
    ├── DEPLOYMENT.md     (Deploy Guide)
    ├── GETTING_STARTED.md (Complete Setup)
    └── ARCHITECTURE.md   (This file)
```

---

This architecture is designed to be:
- **Independent** - Runs separately from frontend
- **Scalable** - Can be deployed as multiple instances
- **Secure** - Multiple security layers
- **Maintainable** - Clear separation of concerns
- **Flexible** - Supports various deployment options
