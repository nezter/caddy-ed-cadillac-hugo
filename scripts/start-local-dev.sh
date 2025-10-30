#!/bin/bash

# Local Development Environment Starter
# Starts Hugo and Netlify functions for local development

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}🚀 Starting Local Development Environment${NC}"
echo "================================================"

# Check Hugo
if [ ! -f "./hugo" ]; then
    echo -e "${YELLOW}⚠️  Hugo binary not found. Please install Hugo first.${NC}"
    exit 1
fi

# Check Netlify CLI
if ! command -v netlify &> /dev/null; then
    echo -e "${YELLOW}⚠️  Netlify CLI not found. Install with: npm install -g netlify-cli${NC}"
    exit 1
fi

# Start Hugo in background
echo -e "${BLUE}📱 Starting Hugo development server...${NC}"
./hugo server --source=site --port 1313 --bind 0.0.0.0 --disableFastRender > hugo-dev.log 2>&1 &
HUGO_PID=$!

# Wait for Hugo to start
sleep 2

# Check if Hugo started successfully
if pgrep -f "hugo server" > /dev/null; then
    echo -e "${GREEN}✅ Hugo server started at http://localhost:1313${NC}"
else
    echo -e "${YELLOW}⚠️  Hugo server may not have started properly. Check hugo-dev.log${NC}"
fi

# Start Netlify functions in background
echo -e "${BLUE}🔧 Starting Netlify functions...${NC}"
netlify dev --live > netlify-dev.log 2>&1 &
NETLIFY_PID=$!

# Wait for Netlify to start
sleep 5

# Check if Netlify started successfully
if pgrep -f "netlify dev" > /dev/null; then
    echo -e "${GREEN}✅ Netlify functions started at http://localhost:8888${NC}"
else
    echo -e "${YELLOW}⚠️  Netlify functions may not have started properly. Check netlify-dev.log${NC}"
fi

echo ""
echo "================================================"
echo -e "${GREEN}🎉 Local Development Environment Ready!${NC}"
echo "================================================"
echo ""
echo "📱 Hugo Frontend:    http://localhost:1313"
echo "🔧 Netlify Functions: http://localhost:8888"
echo "📊 Health Check:     http://localhost:8888/.netlify/functions/health-check"
echo ""
echo "📝 Logs:"
echo "  tail -f hugo-dev.log    # Hugo server logs"
echo "  tail -f netlify-dev.log # Netlify functions logs"
echo ""
echo "🛑 Stop Services:"
echo "  kill $HUGO_PID   # Stop Hugo server"
echo "  kill $NETLIFY_PID # Stop Netlify functions"
echo "  Or press Ctrl+C to stop all services"
echo ""

# Wait for user interrupt
trap 'echo -e "\n${YELLOW}🛑 Stopping development servers...${NC}"; kill $HUGO_PID $NETLIFY_PID 2>/dev/null; exit 0' INT

echo -e "${BLUE}✨ Development servers are running. Press Ctrl+C to stop.${NC}"
wait
