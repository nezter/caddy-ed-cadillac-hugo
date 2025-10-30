#!/bin/bash

# Build Validation Script
echo "🔍 Validating build..."

# Load environment variables
export $(cat .env.local | grep -v '^#' | xargs)

# Build Hugo site
echo "Building Hugo site..."
./hugo --source=site --gc --minify

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

cd ../..
echo "✅ All functions syntax OK"

# Check build output
if [ -d "site/public" ]; then
    file_count=$(find site/public -type f | wc -l)
    if [ "$file_count" -gt 0 ]; then
        echo "✅ Build validation complete"
        echo "📊 Build size: $(du -sh site/public | cut -f1)"
        echo "📄 Files built: $file_count"
    else
        echo "❌ Build output is empty"
        exit 1
    fi
else
    echo "❌ Build output directory does not exist"
    exit 1
fi