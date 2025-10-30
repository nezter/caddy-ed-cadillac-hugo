#!/bin/bash

# Build Validation Script
echo "🔍 Validating build..."

# Load environment variables
export $(cat .env.local | grep -v '^#' | xargs)

# Clean previous build
echo "Cleaning previous build..."
rm -rf public/

# Build Hugo site
echo "Building Hugo site..."
./hugo --gc --minify

if [ $? -eq 0 ]; then
    echo "✅ Hugo build successful"
else
    echo "❌ Hugo build failed"
    exit 1
fi

# Test Netlify functions
echo "Testing Netlify functions..."
cd netlify/functions

# Run syntax check
for function in *.js; do
    if [ -f "$function" ]; then
        node -c "$function"
        if [ $? -eq 0 ]; then
            echo "✅ $function syntax OK"
        else
            echo "❌ $function syntax error"
            exit 1
        fi
    fi
done

cd ..
echo "✅ All functions syntax OK"

# Check build output
if [ -d "public" ] && [ "$(ls -A public)" ]; then
    echo "✅ Build validation complete"
    echo "📊 Build size: $(du -sh public | cut -f1)"
    echo "📄 Files built: $(find public -type f | wc -l)"
else
    echo "❌ Build output is empty"
    exit 1
fi
