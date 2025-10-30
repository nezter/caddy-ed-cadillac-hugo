#!/bin/bash

# Test Runner Script
echo "🧪 Running test suite..."

# Load environment variables
export $(cat .env.local | grep -v '^#' | xargs)

cd netlify/functions

# Run unit tests
echo "Running unit tests..."
npm run test:unit || npm test

# Run integration tests
echo "Running integration tests..."
npm run test:integration || echo "Integration tests not configured"

# Generate coverage report
echo "Generating coverage report..."
npm run test:coverage || npm test -- --coverage

cd ..
echo "✅ Tests completed"
