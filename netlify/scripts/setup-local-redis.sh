#!/bin/bash

# Local Redis Setup Script
echo "🔴 Setting up Redis..."

# Check if Redis is running
if ! redis-cli ping > /dev/null 2>&1; then
    echo "Starting Redis..."
    redis-server --daemonize yes --port 6379
    sleep 2
fi

# Test Redis connection
if redis-cli ping > /dev/null 2>&1; then
    echo "✅ Redis is running"
else
    echo "❌ Redis failed to start"
    exit 1
fi
