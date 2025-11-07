#!/bin/bash

# Start the large-file streaming service
# This service handles torrents and HLS streams larger than the configured threshold

echo "🚀 Starting Large File Streaming Service..."

# Load environment variables
if [ -f .env ]; then
  export $(cat .env | sed 's/#.*//g' | xargs)
fi

# Check if NODE_STREAMER_API_KEY is set
if [ -z "$NODE_STREAMER_API_KEY" ]; then
  echo "❌ Error: NODE_STREAMER_API_KEY environment variable is required"
  echo "Please set it in your .env file or export it"
  exit 1
fi

# Check if port is available
PORT=${PORT:-8080}
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo "❌ Port $PORT is already in use"
  exit 1
fi

# Start the service with ts-node or node
if command -v ts-node &> /dev/null; then
  echo "Starting with ts-node on port $PORT..."
  ts-node server/large-streamer.ts
elif command -v tsx &> /dev/null; then
  echo "Starting with tsx on port $PORT..."
  tsx server/large-streamer.ts
elif command -v node &> /dev/null; then
  echo "Starting with node (requires compiled JS)..."
  node server/large-streamer.js
else
  echo "❌ Error: No TypeScript/Node.js runtime found"
  echo "Please install ts-node or tsx: pnpm add -D ts-node"
  exit 1
fi

