#!/bin/bash

# Start the streaming server in development mode

echo "🚀 Starting Streaming Server (Development Mode)..."
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  No .env file found. Creating from .env.example..."
    cp .env.example .env
    echo "✅ Created .env file. Please update RELAY_API_KEY before running in production!"
    echo ""
fi

# Start the server with tsx (TypeScript execution)
pnpm dev
