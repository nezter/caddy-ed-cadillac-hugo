const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const { formatErrorMessage, formatWarningMessage } = require('../src/js/utils/build-error-reporter');
const { notifyError } = require('./build-notifier');

/**
 * Parse Hugo error output and format it in a more readable way
 * @param {string} output - Hugo error output
 * @return {Array} Formatted errors
 */
function parseHugoErrors(output) {
  const errors = [];
  const lines = output.split('\n');
  
  // Hugo error format: ERROR YYYY/MM/DD HH:MM:SS filepath:line:col: error message
  const hugoErrorRegex = /ERROR\s+\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2}\s+(.*?)(?::(\d+))?(?::(\d+))?\s*(?::\s*(.*))?/i;
  
  lines.forEach(line => {
    const match = line.match(hugoErrorRegex);
    if (match) {
      const [, file, lineNum, colNum, message] = match;
      
      // Try to extract the relevant code from the file
      let code = null;
      if (file && lineNum) {
        try {
          const fileContent = fs.readFileSync(path.resolve(file), 'utf-8');
          const lines = fileContent.split('\n');
          const errorLine = parseInt(lineNum) - 1;
          const start = Math.max(0, errorLine - 2);
          const end = Math.min(lines.length, errorLine + 3);
          
          code = lines.slice(start, end)
            .map((l, i) => {
              const lineNumber = start + i + 1;
              const isErrorLine = lineNumber === parseInt(lineNum);
              const prefix = isErrorLine ? '> ' : '  ';
              return `${prefix}${lineNumber}: ${l}`;
            })
            .join('\n');
        } catch (e) {
          // Failed to read file, skip code extraction
        }
      }
      
      errors.push({
        file,
        line: lineNum,
        column: colNum,
        message: message || 'Hugo build error',
        code
      });
    }
  });
  
  return errors;
}

/**
 * Handle Hugo build errors
 * @param {string} output - Hugo command output
 * @param {Object} options - Options
 */
function handleHugoErrors(output, options = {}) {
  const errors = parseHugoErrors(output);
  
  if (errors.length === 0) {
    return;
  }
  
  console.log(chalk.red.bold(`\n✖ ${errors.length} Hugo Error${errors.length > 1 ? 's' : ''} Found\n`));
  
  errors.forEach(error => {
    console.log(formatErrorMessage(error.message, {
      file: error.file,
      line: error.line,
      column: error.column,
      code: error.code,
      suggestion: getHugoErrorSuggestion(error.message)
    }));
  });
  
  // Send desktop notification
  notifyError(`Hugo build failed with ${errors.length} error(s)`);
  
  // Exit process if configured to do so
  if (options.exitOnError) {
    process.exit(1);
  }
}

/**
 * Get suggestion for common Hugo errors
 * @param {string} errorMessage - The error message
 * @return {string} Suggestion
 */
function getHugoErrorSuggestion(errorMessage) {
  const msg = errorMessage.toLowerCase();
  
  if (msg.includes('failed to resolve output format')) {
    return 'Check your Hugo config.toml file for correct output format configuration.';
  }
  
  if (msg.includes('template not found')) {
    return 'Make sure the referenced template exists and the path is correct.';
  }
  
  if (msg.includes('undefined variable') || msg.includes('variable not found')) {
    return 'Check that the variable is defined and available in the template context.';
  }
  
  if (msg.includes('field not found')) {
    return 'The referenced field does not exist in the data structure. Check your front matter or data file.';
  }
  
  if (msg.includes('convertible to duration')) {
    return 'Check the syntax of your duration values. Hugo uses Go\'s duration format.';
  }
  
  return 'Check the Hugo documentation for details on this error.';
}

module.exports = {
  parseHugoErrors,
  handleHugoErrors
};
