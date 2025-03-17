/**
 * Execute Placeholder Generation
 * 
 * This script runs the placeholder generation script and tracks progress.
 * It can be used to monitor the generation process and handle errors.
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const config = {
  sourceDir: 'site/static/img',
  outputDir: 'site/static/img/placeholders',
  logFile: 'placeholder-generation-log.txt'
};

// Log function
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  
  console.log(logMessage);
  
  // Also append to log file
  fs.appendFileSync(config.logFile, logMessage + '\n');
}

// Count images in source directory
function countImages(directory) {
  let count = 0;
  
  function traverseDir(dir) {
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        traverseDir(fullPath);
      } else {
        const ext = path.extname(file).toLowerCase();
        if (['.jpg', '.jpeg', '.png', '.gif'].includes(ext)) {
          count++;
        }
      }
    }
  }
  
  traverseDir(directory);
  return count;
}

// Main execution function
async function executeGeneration() {
  try {
    log('Starting placeholder image generation');
    
    // Clear log file
    fs.writeFileSync(config.logFile, '');
    
    // Ensure output directory exists
    if (!fs.existsSync(config.outputDir)) {
      fs.mkdirSync(config.outputDir, { recursive: true });
      log(`Created output directory: ${config.outputDir}`);
    }
    
    // Count total images
    const imageCount = countImages(config.sourceDir);
    log(`Found ${imageCount} images to process`);
    
    // Execute the placeholder generation script
    log('Executing placeholder generation script...');
    
    const child = exec('npm run generate-placeholders', {
      maxBuffer: 1024 * 1024 * 10 // 10MB buffer for lots of output
    });
    
    // Handle output
    child.stdout.on('data', (data) => {
      process.stdout.write(data);
    });
    
    child.stderr.on('data', (data) => {
      process.stderr.write(data);
    });
    
    // Handle completion
    child.on('close', (code) => {
      if (code === 0) {
        log('Placeholder generation completed successfully!');
        
        // Count generated placeholders
        const placeholderCount = countImages(config.outputDir);
        log(`Generated ${placeholderCount} placeholder images`);
        
        // Compare with original count
        if (placeholderCount < imageCount) {
          log(`Warning: Only ${placeholderCount} of ${imageCount} images have placeholders`);
        } else {
          log('All images have placeholders');
        }
      } else {
        log(`Error: Process exited with code ${code}`);
      }
    });
    
  } catch (error) {
    log(`Error executing placeholder generation: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

// Run the execution
executeGeneration();
