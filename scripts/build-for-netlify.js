#!/usr/bin/env node

/**
 * Build Script for Netlify
 * Handles both Hugo build and asset processing
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Starting Netlify Build Process...\n');

// Build steps
const buildSteps = [
  {
    name: 'Clean previous build',
    command: 'rm -rf site/public',
    skipIfExists: false
  },
  {
    name: 'Build Hugo site',
    command: 'cd site && ../hugo --destination=../site/public --minify',
    skipIfExists: false
  },
  {
    name: 'Copy static assets',
    command: 'cp -r dist/* site/public/ 2>/dev/null || echo "No dist assets to copy"',
    skipIfExists: true
  },
  {
    name: 'Build functions dependencies',
    command: 'cd netlify/functions && npm install --production',
    skipIfExists: false
  },
  {
    name: 'Verify build output',
    command: 'ls -la site/public/',
    skipIfExists: false
  }
];

// Execute build steps
let success = true;

buildSteps.forEach((step, index) => {
  console.log(`${index + 1}. ${step.name}...`);
  
  try {
    const result = execSync(step.command, { 
      encoding: 'utf8',
      stdio: 'inherit',
      timeout: 300000 // 5 minutes timeout
    });
    
    console.log(`   ✅ ${step.name} completed`);
  } catch (error) {
    if (step.skipIfExists && error.status === 1) {
      console.log(`   ⚠️  ${step.name} skipped (non-critical)`);
    } else {
      console.error(`   ❌ ${step.name} failed:`);
      console.error(`      ${error.message}`);
      success = false;
    }
  }
});

console.log('\n' + '='.repeat(50));

if (success) {
  console.log('🎉 Netlify build completed successfully!');
  
  // Check if public directory exists and has files
  if (fs.existsSync('site/public')) {
    const files = fs.readdirSync('site/public');
    console.log(`📁 Generated ${files.length} files in site/public/`);
    
    // Show key files
    const keyFiles = files.filter(file => 
      file.endsWith('.html') || 
      file.endsWith('.css') || 
      file.endsWith('.js')
    );
    
    if (keyFiles.length > 0) {
      console.log('📄 Key files generated:');
      keyFiles.slice(0, 10).forEach(file => {
        console.log(`   - ${file}`);
      });
      
      if (keyFiles.length > 10) {
        console.log(`   ... and ${keyFiles.length - 10} more files`);
      }
    }
  }
  
  console.log('\n✅ Ready for Netlify deployment!');
} else {
  console.error('❌ Netlify build failed!');
  console.error('\nTroubleshooting:');
  console.error('1. Check if Hugo binary is executable: chmod +x ./hugo');
  console.error('2. Verify Hugo site structure: ./hugo --source=site --destination=test');
  console.error('3. Check for missing dependencies: npm install');
  console.error('4. Review build logs above for specific errors');
  
  process.exit(1);
}

console.log('='.repeat(50));
