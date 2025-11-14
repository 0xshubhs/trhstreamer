#!/bin/bash

# Example script showing how to use the server API with curl

SERVER_URL="http://localhost:8080"
API_KEY="your-api-key-here"

echo "=== Streaming Server API Examples ==="
echo ""

# 1. Health Check
echo "1. Checking server health..."
curl -s "${SERVER_URL}/health" | jq '.'
echo ""

# 2. Add HLS Stream
echo "2. Adding HLS stream..."
STREAM_RESPONSE=$(curl -s -X POST "${SERVER_URL}/api/add-stream" \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${API_KEY}" \
  -d '{
    "m3u8Url": "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8"
  }')

echo "$STREAM_RESPONSE" | jq '.'
STREAM_ID=$(echo "$STREAM_RESPONSE" | jq -r '.id')
echo ""
echo "Stream ID: $STREAM_ID"
echo ""

# 3. Get Stream Status
echo "3. Getting stream status..."
curl -s "${SERVER_URL}/api/status/${STREAM_ID}?apiKey=${API_KEY}" | jq '.'
echo ""

# 4. Get Master Playlist
echo "4. Getting master playlist..."
curl -s "${SERVER_URL}/api/stream/${STREAM_ID}/master?apiKey=${API_KEY}" | head -20
echo ""
echo "..."
echo ""

# 5. Delete Stream
echo "5. Deleting stream..."
curl -s -X DELETE "${SERVER_URL}/api/stream/${STREAM_ID}?apiKey=${API_KEY}" | jq '.'
echo ""

echo "=== Done ==="
