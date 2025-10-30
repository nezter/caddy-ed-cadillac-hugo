#!/bin/bash

# API Testing Script
echo "🔧 Testing API endpoints..."

BASE_URL="http://localhost:8888"

# Test health check
echo "Testing health check..."
curl -s "$BASE_URL/.netlify/functions/health-check" | jq '.' || echo "Health check failed"

# Test campaigns endpoint
echo "Testing campaigns endpoint..."
curl -s -H "Authorization: Bearer test-token" \
     "$BASE_URL/.netlify/functions/followup-campaigns" | jq '.' || echo "Campaigns test failed"

# Test analytics endpoint
echo "Testing analytics endpoint..."
curl -s -H "Authorization: Bearer test-token" \
     "$BASE_URL/.netlify/functions/followup-analytics/dashboard" | jq '.' || echo "Analytics test failed"

echo "✅ API testing complete"