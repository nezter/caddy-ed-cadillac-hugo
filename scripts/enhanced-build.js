const { spawn } = require('child_process');
const chalk = require('chalk');
const { createProgressReporter, formatSuccessMessage, formatErrorMessage } = require('../src/js/utils/build-error-reporter');
const { notifySuccess, notifyError } = require('./build-notifier');
const { handleHugoErrors } = require('./hugo-error-handler');

// Enable desktop notifications if flag is passed
if (process.argv.includes('--notify')) {
  process.env.ENABLE_NOTIFICATIONS = 'true';
}

/**
 * Run a command with improved output formatting
 * @param {string} command - The command to run
 * @param {Array} args - Command arguments
 * @param {Object} options - Options
 * @return {Promise} - Promise resolving to { code, output }
 */
async function runCommand(command, args, options = {}) {
  const reporter = createProgressReporter(options.name || command);
  let output = '';
  
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      stdio: ['inherit', options.captureOutput ? 'pipe' : 'inherit', options.captureOutput ? 'pipe' : 'inherit'],
      shell: options.shell || true
    });
    
    if (options.captureOutput) {
      proc.stdout.on('data', (data) => {
        const text = data.toString().trim();
        output += text + '\n';
        
        // Log selected outputs for better visibility
        if (options.logFilter && options.logFilter(text)) {
          reporter.update(text);
        }
      });
      
      proc.stderr.on('data', (data) => {
        const text = data.toString().trim();
        output += text + '\n';
        
        // Always log errors
        if (text.toLowerCase().includes('error')) {
          console.error(chalk.red(text));
        }
      });
    }
    
    proc.on('close', (code) => {
      if (code === 0) {
        reporter.success(options.successMessage);
        resolve({ code, output });
      } else {
        reporter.error(options.errorMessage || `Process exited with code ${code}`);
        
        // Special handling for Hugo errors
        if (command.includes('hugo') && output) {
          handleHugoErrors(output, { exitOnError: false });
        }
        
        reject({ code, output });
      }
    });
  });
}

/**
 * Run the complete build process with enhanced error reporting
 */
async function runBuild() {
  console.log(chalk.cyan.bold('\n🚀 Starting production build...\n'));
  const startTime = Date.now();
  
  try {
    // Step 1: Clean build directory
    await runCommand('npm', ['run', 'prebuild'], {
      name: 'Clean build directory',
      successMessage: 'Build directory cleaned',
      errorMessage: 'Failed to clean build directory'
    });
    
    // Step 2: Build webpack assets
    await runCommand('npm', ['run', 'build:webpack'], {
      name: 'Webpack build',
      successMessage: 'Webpack assets built successfully',
      errorMessage: 'Webpack build failed'
    });
    
    // Step 3: Build Hugo site
    await runCommand('npm', ['run', 'build:hugo'], {
      name: 'Hugo build',
      captureOutput: true,
      successMessage: 'Hugo site built successfully',
      errorMessage: 'Hugo build failed',
      logFilter: (line) => line.includes('success') || line.includes('page') || line.includes('template')
    });
    
    // Step 4: Post-build optimizations
    await runCommand('npm', ['run', 'postbuild'], {
      name: 'Post-build optimization',
      successMessage: 'Post-build optimizations completed',
      errorMessage: 'Post-build optimizations failed'
    });
    
    // All done!
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(formatSuccessMessage(`Build completed successfully in ${duration}s`));
    notifySuccess(`Build completed in ${duration}s`);
    
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error(formatErrorMessage(`Build failed after ${duration}s`, { 
      suggestion: 'Review the error messages above to resolve the issue.'
    }));
    notifyError('Build failed. See console for details.');
    process.exit(1);
  }
}

runBuild();
