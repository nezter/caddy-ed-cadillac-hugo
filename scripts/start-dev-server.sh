#!/bin/bash

# Local Development Server Script
echo "🚀 Starting local development servers..."

# Load environment variables
export $(cat .env.local | grep -v '^#' | xargs)

# Start Redis in background
echo "Starting Redis..."
if command -v redis-server &> /dev/null; then
    redis-server --daemonize yes --port 6379 || echo "Redis already running"
else
    echo "⚠️  Redis not installed, skipping Redis server"
fi

# Start Netlify functions in background
echo "Starting Netlify functions..."
cd netlify/functions
npm install &>/dev/null
npx netlify functions:serve --port=8888 &
FUNCTIONS_PID=$!
cd ../..

# Wait for functions to start
sleep 5

# Start Hugo development server
echo "Starting Hugo development server..."
./hugo server -D -F --source=site --bind 0.0.0.0 --port 1313 --buildDrafts --buildFuture &
HUGO_PID=$!

echo "✅ Development servers started!"
echo ""
echo "🌐 Hugo site: http://localhost:1313"
echo "🔧 Netlify functions: http://localhost:8888"
echo "📊 Health check: http://localhost:8888/.netlify/functions/health-check"
echo ""
echo "Press Ctrl+C to stop all servers"

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Stopping development servers..."
    kill $FUNCTIONS_PID 2>/dev/null || true
    kill $HUGO_PID 2>/dev/null || true
    echo "✅ All servers stopped"
    exit 0
}

# Trap Ctrl+C
trap cleanup INT

# Wait for processes
wait