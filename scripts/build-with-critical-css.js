/**
 * Build With Critical CSS
 * 
 * This script runs a complete build process that includes critical CSS generation
 */

const { spawn } = require('child_process');
const chalk = require('chalk');
const dotenv = require('dotenv');
const path = require('path');
const { notifySuccess, notifyError } = require('./build-notifier');

// Load environment variables
dotenv.config();

// Start timing
const startTime = Date.now();

console.log(chalk.blue('Starting optimized build with critical CSS...'));

// Make sure to enable critical CSS generation
process.env.GENERATE_CRITICAL_CSS = 'true';

// Function to run a command
function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    console.log(chalk.cyan(`Running: ${command} ${args.join(' ')}`));
    
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: true,
      ...options
    });
    
    child.on('close', code => {
      if (code !== 0) {
        reject(new Error(`${command} exited with code ${code}`));
        return;
      }
      
      resolve();
    });
  });
}

// Build process
async function build() {
  try {
    // 1. Clean previous build
    await runCommand('npm', ['run', 'clean']);
    console.log(chalk.green('✓ Clean completed'));
    
    // 2. Build webpack assets
    await runCommand('npm', ['run', 'build:webpack']);
    console.log(chalk.green('✓ Webpack build completed'));
    
    // 3. Process critical CSS
    await runCommand('node', ['scripts/hugo-critical-css-hook.js']);
    console.log(chalk.green('✓ Critical CSS processed for Hugo'));
    
    // 4. Build Hugo site
    await runCommand('npm', ['run', 'build:hugo']);
    console.log(chalk.green('✓ Hugo build completed'));
    
    // 5. Run post-build optimizations
    await runCommand('npm', ['run', 'optimize']);
    console.log(chalk.green('✓ Post-build optimizations completed'));
    
    // Complete
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(chalk.green(`✓ Build with critical CSS completed in ${duration}s`));
    
    // Notify success
    notifySuccess(`Build completed in ${duration}s`);
  } catch (error) {
    console.error(chalk.red('Build failed:'), error.message);
    notifyError('Build failed with errors');
    process.exit(1);
  }
}

// Run the build
build();
