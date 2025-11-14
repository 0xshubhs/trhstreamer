# Contributing to Streaming Server

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/your-username/streaming-server.git`
3. Create a branch: `git checkout -b feature/your-feature-name`
4. Make your changes
5. Test your changes
6. Commit with clear messages
7. Push and create a Pull Request

## Development Setup

```bash
cd standalone-server
pnpm install
pnpm dev
```

## Code Style

This project uses:
- **TypeScript** - All code must be typed
- **ESLint** - For linting
- **Prettier** - For formatting

Run checks:
```bash
pnpm lint
pnpm type-check
```

## Commit Messages

Follow conventional commits:
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation only
- `style:` - Formatting, missing semi colons, etc
- `refactor:` - Code change that neither fixes a bug nor adds a feature
- `test:` - Adding missing tests
- `chore:` - Maintain

Example:
```
feat: add support for custom timeout configuration
fix: resolve race condition in stream cleanup
docs: update deployment guide with Docker instructions
```

## Pull Request Process

1. Update documentation if needed
2. Add tests for new features
3. Ensure all tests pass: `pnpm test` (when tests are added)
4. Update CHANGELOG.md
5. Request review from maintainers

## Testing

Currently, this project doesn't have automated tests, but they are planned. When adding features, please consider:

- Unit tests for utility functions
- Integration tests for API endpoints
- E2E tests for critical user flows

## Security

If you discover a security vulnerability, please email the maintainers directly instead of opening a public issue.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
