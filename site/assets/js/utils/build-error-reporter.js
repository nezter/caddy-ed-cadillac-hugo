/**
 * Build Error Reporter Utility
 * Provides utilities for improved error reporting during build and runtime
 */

const chalk = require('chalk');

/**
 * Format an error message with visual hierarchy
 * @param {string} message - The error message
 * @param {Object} details - Additional error details
 * @return {string} Formatted error message
 */
function formatErrorMessage(message, details = {}) {
  let output = `\n${chalk.bgRed.white.bold(' ERROR ')} ${chalk.red.bold(message)}\n`;
  
  if (details.file) {
    output += `\n  ${chalk.yellow('File:')} ${details.file}`;
  }
  
  if (details.line) {
    output += `\n  ${chalk.yellow('Line:')} ${details.line}`;
    if (details.column) {
      output += `:${details.column}`;
    }
  }
  
  if (details.code) {
    output += `\n\n  ${chalk.gray(details.code)}\n`;
  }
  
  if (details.suggestion) {
    output += `\n  ${chalk.green('Suggestion:')} ${details.suggestion}\n`;
  }

  if (details.stack && process.env.NODE_ENV !== 'production') {
    output += `\n  ${chalk.gray('Stack trace:')}\n  ${chalk.gray(
      details.stack.split('\n').slice(1).join('\n  ')
    )}\n`;
  }
  
  return output;
}

/**
 * Format a warning message
 * @param {string} message - The warning message
 * @param {Object} details - Additional warning details
 * @return {string} Formatted warning message
 */
function formatWarningMessage(message, details = {}) {
  let output = `\n${chalk.bgYellow.black.bold(' WARNING ')} ${chalk.yellow.bold(message)}\n`;
  
  if (details.file) {
    output += `\n  ${chalk.cyan('File:')} ${details.file}`;
  }
  
  if (details.suggestion) {
    output += `\n  ${chalk.green('Suggestion:')} ${details.suggestion}\n`;
  }
  
  return output;
}

/**
 * Format a success message
 * @param {string} message - The success message
 * @return {string} Formatted success message
 */
function formatSuccessMessage(message) {
  return `\n${chalk.bgGreen.black.bold(' SUCCESS ')} ${chalk.green(message)}\n`;
}

/**
 * Format an info message
 * @param {string} message - The info message
 * @return {string} Formatted info message
 */
function formatInfoMessage(message) {
  return `\n${chalk.bgBlue.white.bold(' INFO ')} ${chalk.blue(message)}\n`;
}

/**
 * Create a function to report build progress
 * @param {string} name - The name of the build step
 * @return {Function} The reporter function
 */
function createProgressReporter(name) {
  const startTime = Date.now();
  const stepName = chalk.cyan(name);
  
  console.log(`\n${chalk.bold('Starting:')} ${stepName}`);
  
  return {
    update: (message) => {
      console.log(`  ${chalk.gray('→')} ${message}`);
    },
    success: (message) => {
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`${chalk.bold('Completed:')} ${stepName} ${chalk.gray(`(${duration}s)`)}`);
      if (message) {
        console.log(`  ${chalk.green('✓')} ${message}`);
      }
    },
    error: (message) => {
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`${chalk.bold('Failed:')} ${stepName} ${chalk.gray(`(${duration}s)`)}`);
      console.log(`  ${chalk.red('✗')} ${message}`);
    }
  };
}

/**
 * Helper to summarize webpack stats
 * @param {Object} stats - Webpack stats object
 * @return {string} Formatted summary
 */
function summarizeWebpackStats(stats) {
  const { time, assets, chunks, modules, errors, warnings } = stats.toJson({ all: false, assets: true, errors: true, warnings: true, timings: true });
  
  let summary = chalk.bold('\nBuild Summary:\n');
  
  // Time information
  summary += `  ${chalk.cyan('Build time:')} ${(time / 1000).toFixed(2)}s\n`;
  
  // Assets information
  const totalSize = assets.reduce((size, asset) => size + asset.size, 0);
  summary += `  ${chalk.cyan('Output size:')} ${(totalSize / 1024).toFixed(2)} KB\n`;
  summary += `  ${chalk.cyan('Assets:')} ${assets.length}\n`;
  
  // Errors and warnings
  if (errors.length > 0) {
    summary += `  ${chalk.red(`Errors: ${errors.length}`)}\n`;
  }
  
  if (warnings.length > 0) {
    summary += `  ${chalk.yellow(`Warnings: ${warnings.length}`)}\n`;
  }
  
  return summary;
}

module.exports = {
  formatErrorMessage,
  formatWarningMessage,
  formatSuccessMessage,
  formatInfoMessage,
  createProgressReporter,
  summarizeWebpackStats
};
