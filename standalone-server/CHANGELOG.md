# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-01-XX

### Added
- Initial release of standalone streaming server
- HLS proxy with automatic playlist rewriting
- API key authentication system
- Rate limiting (60 requests per minute)
- Health monitoring endpoint
- Docker and Docker Compose support
- Comprehensive documentation (README, QUICKSTART, DEPLOYMENT)
- GitHub Actions CI workflow
- TypeScript support with strict type checking
- Security headers via Helmet
- CORS support
- Range request support for video seeking
- Example client implementation
- Shell scripts for development and production

### Security
- Required API key authentication for all endpoints
- Request timeout protection (15s default)
- Input validation for URLs and magnet links
- Rate limiting to prevent abuse

## [Unreleased]

### Planned
- Unit and integration tests
- WebSocket support for real-time updates
- Stream analytics and metrics
- Automatic stream cleanup/expiry
- Multi-user support with JWT tokens
- Database integration for persistent storage
- WebTorrent hybrid support (optional)
