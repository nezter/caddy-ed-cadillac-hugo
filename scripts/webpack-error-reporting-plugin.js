const chalk = require('chalk');
const { formatErrorMessage, formatWarningMessage, summarizeWebpackStats } = require('../src/js/utils/build-error-reporter');

/**
 * WebpackErrorReportingPlugin - A webpack plugin that enhances error and warning messages
 */
class WebpackErrorReportingPlugin {
  constructor(options = {}) {
    this.options = {
      showSummary: true,
      showErrorDetails: true,
      showWarningDetails: true,
      ...options
    };
  }

  apply(compiler) {
    // Hook into the done event to process errors and warnings
    compiler.hooks.done.tap('WebpackErrorReportingPlugin', stats => {
      const { errors, warnings } = stats.compilation;
      
      if (stats.hasErrors()) {
        console.log(chalk.red.bold(`\n✖ ${errors.length} Error${errors.length > 1 ? 's' : ''} found\n`));
        
        if (this.options.showErrorDetails) {
          errors.forEach(error => {
            const file = error.file || (error.module && error.module.resource) || 'Unknown file';
            console.log(formatErrorMessage(error.message, {
              file,
              suggestion: this.getSuggestion(error)
            }));
          });
        }
      }
      
      if (stats.hasWarnings()) {
        console.log(chalk.yellow.bold(`\n⚠ ${warnings.length} Warning${warnings.length > 1 ? 's' : ''} found\n`));
        
        if (this.options.showWarningDetails) {
          warnings.forEach(warning => {
            const file = warning.file || (warning.module && warning.module.resource) || 'Unknown file';
            console.log(formatWarningMessage(warning.message, { file }));
          });
        }
      }
      
      if (this.options.showSummary && !stats.hasErrors()) {
        console.log(summarizeWebpackStats(stats));
      }
    });

    // Add better error formatting for assets
    compiler.hooks.afterCompile.tap('WebpackErrorReportingPlugin', compilation => {
      compilation.warnings = this.improveMessages(compilation.warnings);
      compilation.errors = this.improveMessages(compilation.errors);
    });
  }

  // Helper to improve error messages
  improveMessages(messages) {
    return messages.map(message => {
      // Add custom suggestions or error formatting here
      return message;
    });
  }

  // Provide suggestions based on common error patterns
  getSuggestion(error) {
    const msg = error.message || '';
    
    if (msg.includes('Module not found')) {
      return 'Check that the imported module exists and the import path is correct.';
    }
    
    if (msg.includes('Unexpected token')) {
      return 'This is likely a syntax error. Check for missing brackets, semicolons, or quotes.';
    }
    
    if (msg.includes('Cannot find module')) {
      return 'The module might not be installed. Try running "npm install" or check the import path.';
    }
    
    if (msg.includes('.scss')) {
      return 'Check your Sass syntax for errors like missing semicolons or brackets.';
    }
    
    return null;
  }
}

module.exports = WebpackErrorReportingPlugin;
