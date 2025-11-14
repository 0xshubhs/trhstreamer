#!/bin/bash

# Production build and start script

echo "🏗️  Building production server..."
pnpm build

if [ $? -ne 0 ]; then
    echo "❌ Build failed!"
    exit 1
fi

echo "✅ Build successful!"
echo ""
echo "🚀 Starting production server..."
pnpm start
