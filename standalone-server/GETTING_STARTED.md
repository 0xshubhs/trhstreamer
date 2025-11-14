# 🚀 Standalone Streaming Server - Complete Setup

## Overview

You now have a **fully independent** streaming server that is completely separate from your Next.js frontend project. This server can be deployed anywhere and used by any frontend application.

## 📁 Project Structure

```
standalone-server/
├── src/
│   ├── index.ts              # Main server application
│   └── types.ts              # TypeScript type definitions
├── examples/
│   ├── client.ts             # Example client implementation
│   └── test-api.sh           # API testing script
├── scripts/
│   ├── dev.sh                # Development start script
│   └── start-prod.sh         # Production start script
├── .github/
│   └── workflows/
│       └── ci.yml            # GitHub Actions CI pipeline
├── dist/                     # Compiled JavaScript (after build)
├── node_modules/             # Dependencies
├── .env.example              # Environment template
├── .gitignore
├── .dockerignore
├── .prettierrc
├── .prettierignore
├── tsconfig.json             # TypeScript configuration
├── package.json              # Project dependencies & scripts
├── eslint.config.js          # ESLint configuration
├── Dockerfile                # Docker image definition
├── docker-compose.yml        # Docker Compose setup
├── README.md                 # Main documentation
├── QUICKSTART.md             # Quick start guide
├── DEPLOYMENT.md             # Deployment guide
├── CONTRIBUTING.md           # Contribution guidelines
├── CHANGELOG.md              # Version history
└── LICENSE                   # MIT License
```

## ✅ What's Included

### Core Features
- ✅ HLS proxy with playlist rewriting
- ✅ API key authentication
- ✅ Rate limiting (60 req/min)
- ✅ Health monitoring
- ✅ Range request support
- ✅ Security headers (Helmet)
- ✅ CORS enabled
- ✅ TypeScript with strict typing

### Development Tools
- ✅ Hot reload with `tsx`
- ✅ ESLint for linting
- ✅ Prettier for formatting
- ✅ Type checking
- ✅ Build scripts

### Deployment Options
- ✅ Node.js (direct)
- ✅ Docker
- ✅ Docker Compose
- ✅ Kubernetes manifests
- ✅ PM2 ecosystem config
- ✅ Systemd service

### Documentation
- ✅ Comprehensive README
- ✅ Quick start guide
- ✅ Full deployment guide
- ✅ API examples
- ✅ Client implementation example
- ✅ Contributing guidelines

## 🚀 Quick Start

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
./scripts/dev.sh
```

### 4. Test the Server
```bash
# Health check
curl http://localhost:8080/health

# Add an HLS stream
curl -X POST http://localhost:8080/api/add-stream \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key" \
  -d '{"m3u8Url": "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8"}'
```

## 📦 Available Scripts

```bash
pnpm dev              # Start development server with hot reload
pnpm build            # Compile TypeScript to JavaScript
pnpm start            # Start production server (requires build)
pnpm lint             # Run ESLint
pnpm type-check       # Run TypeScript type checking
pnpm clean            # Remove dist folder
```

## 🔧 Production Deployment

### Option 1: Node.js
```bash
pnpm build
RELAY_API_KEY=your-secret-key pnpm start
```

### Option 2: Docker
```bash
docker build -t streaming-server .
docker run -d -p 8080:8080 -e RELAY_API_KEY=your-key streaming-server
```

### Option 3: Docker Compose
```bash
export RELAY_API_KEY=your-secret-key
docker-compose up -d
```

See `DEPLOYMENT.md` for detailed deployment instructions including:
- VPS/Cloud deployment
- Nginx reverse proxy setup
- SSL/TLS with Let's Encrypt
- Kubernetes deployment
- PM2 process management
- Monitoring and logging
- Security hardening

## 🔌 Integration with Frontend

Update your Next.js frontend to use this server:

```typescript
// In your Next.js .env.local
NEXT_PUBLIC_STREAMING_SERVER=http://localhost:8080
NEXT_PUBLIC_STREAMING_API_KEY=your-api-key

// In your code
const response = await fetch(
  `${process.env.NEXT_PUBLIC_STREAMING_SERVER}/api/add-stream`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.NEXT_PUBLIC_STREAMING_API_KEY,
    },
    body: JSON.stringify({ m3u8Url: url }),
  }
);
```

See `examples/client.ts` for a complete client implementation.

## 🔒 Security

**Before deploying to production:**

1. ✅ Set a strong `RELAY_API_KEY` (32+ random characters)
2. ✅ Use HTTPS (deploy behind nginx with SSL)
3. ✅ Enable firewall rules
4. ✅ Set up log monitoring
5. ✅ Configure automatic backups
6. ✅ Review security settings in `DEPLOYMENT.md`

## 📊 Monitoring

The server exposes a `/health` endpoint:

```json
{
  "status": "ok",
  "activeStreams": 2,
  "uptime": 3600,
  "memory": { ... },
  "hlsIds": ["abc123", "def456"]
}
```

## 🧪 Testing

```bash
# Run the example test script
cd examples
./test-api.sh

# Or manually test endpoints
curl http://localhost:8080/health
```

## 📚 Documentation

- **README.md** - Main project documentation
- **QUICKSTART.md** - Step-by-step setup guide
- **DEPLOYMENT.md** - Production deployment guide
- **CONTRIBUTING.md** - How to contribute
- **CHANGELOG.md** - Version history

## 🛠️ Troubleshooting

### Server won't start
```bash
# Check Node version (needs 20+)
node --version

# Reinstall dependencies
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

### Build fails
```bash
# Check TypeScript
pnpm type-check

# Clean and rebuild
pnpm clean
pnpm build
```

### API returns 401
- Verify `RELAY_API_KEY` is set in `.env`
- Ensure you're passing the key in headers or query params

## 🎯 Next Steps

1. **Deploy to production** - See `DEPLOYMENT.md`
2. **Set up CI/CD** - GitHub Actions workflow included
3. **Add monitoring** - Set up health check alerts
4. **Configure backups** - Backup scripts in deployment guide
5. **Add custom features** - Extend the server as needed

## 📝 Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `RELAY_API_KEY` | **Yes** | - | API authentication key |
| `PORT` | No | 8080 | Server port |
| `FETCH_TIMEOUT_MS` | No | 15000 | Upstream timeout |
| `MAX_JSON` | No | 1mb | Max JSON body size |
| `NODE_ENV` | No | production | Environment |

## 🤝 Contributing

Contributions are welcome! Please read `CONTRIBUTING.md` for guidelines.

## 📄 License

MIT License - See `LICENSE` file for details.

**Legal Notice:** This software is for legal, authorized content only. Users are responsible for ensuring proper rights and licenses.

## 🆘 Support

- Check documentation files
- Review examples in `examples/`
- See troubleshooting in `DEPLOYMENT.md`
- Open an issue on GitHub

---

**🎉 Your standalone server is ready to use!**

The server is completely independent from the Next.js frontend and can be:
- Deployed anywhere
- Used by multiple frontends
- Scaled independently
- Monitored separately

Start developing with `pnpm dev` or deploy to production following `DEPLOYMENT.md`.
