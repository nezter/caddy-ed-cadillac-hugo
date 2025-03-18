# Error Handling Guide

This document provides comprehensive information about the error handling system implemented in the Caddy Ed Cadillac build toolchain.

## Error Handling Components

Our error handling system consists of multiple interconnected components:

### 1. Pre-build Error Detection

The `check-build-errors.js` script runs before build starts and detects potential issues:

- Missing Hugo templates and partials
- Broken JavaScript imports
- CSS syntax problems
- Missing asset references

To run pre-build checks manually:

```bash
npm run check:errors
```

### 2. Error Formatting Utility

The core `build-error-reporter.js` utility provides standardized error formatting with:

- Visual hierarchy with color coding
- Contextual information (file, line, column)
- Code snippets where possible
- Suggestions for fixing common issues

Error reporting functions:

```javascript
// Report an error with detailed formatting
formatErrorMessage(message, {
  file: 'path/to/file.js',
  line: 10,
  column: 5,
  code: '// The problematic code',
  suggestion: 'Try fixing the syntax error'
});

// Report a warning
formatWarningMessage(message, {
  file: 'path/to/file.js',
  suggestion: 'Consider updating this approach'
});

// Report success
formatSuccessMessage('Build completed successfully');

// Report general information
formatInfoMessage('Processing files...');
```

### 3. Webpack Error Plugin

The `WebpackErrorReportingPlugin` enhances webpack's error reporting by:

- Providing clearer error messages
- Adding context-aware suggestions
- Summarizing build statistics
- Formatting output for better readability

### 4. Hugo Error Handler

The `hugo-error-handler.js` script improves Hugo error messages by:

- Extracting key error information from Hugo's output
- Showing code context around the error
- Providing specific suggestions for common Hugo errors
- Displaying errors in a consistent format

### 5. Build Notifications

Desktop notifications provide at-a-glance build status information:

- Success notifications with build duration
- Error notifications with issue count
- Warning notifications for non-critical issues

Enable notifications by using:

```bash
npm run build:notify
```

## Common Error Patterns and Solutions

### JavaScript Errors

| Error Pattern | Likely Cause | Solution |
|---------------|--------------|----------|
| `Module not found` | Missing dependency or incorrect path | Check import path or run `npm install` |
| `Unexpected token` | Syntax error | Look for missing brackets, semicolons, or quotes |
| `Cannot resolve module` | Typo in import path | Double-check the file path and name |
| `Invalid hook call` | React hooks used incorrectly | Verify hook is called within a functional component |

### CSS/Sass Errors

| Error Pattern | Likely Cause | Solution |
|---------------|--------------|----------|
| `Unclosed block` | Missing closing brace | Add missing `}` character |
| `Invalid property` | Typo in property name | Correct the property name |
| `Undefined variable` | Using a Sass variable that doesn't exist | Define the variable or fix the typo |
| `Expected a semicolon` | Missing semicolon | Add the missing `;` character |

### Hugo Errors

| Error Pattern | Likely Cause | Solution |
|---------------|--------------|----------|
| `Template not found` | Missing template file | Create the template or fix the reference |
| `Undefined variable` | Using a non-existent variable | Check that the variable is defined in the context |
| `Failed to resolve output format` | Incorrect format configuration | Verify format definitions in config.toml |
| `Range can't iterate over` | Attempting to range over non-iterable | Check the value is an array, slice, map, etc. |

## Decision Tree for Error Resolution

Start here to diagnose and fix build errors:

1. **Is it a JavaScript build error?**
   - Yes → Check for syntax errors or missing dependencies
   - No → Continue to next question

2. **Is it a Hugo template error?**
   - Yes → Check template syntax and variable existence
   - No → Continue to next question

3. **Is it a CSS/Sass processing error?**
   - Yes → Check for syntax errors or invalid properties
   - No → Continue to next question

4. **Is it a dependency or environment issue?**
   - Yes → Try `npm run reinstall` or check environment variables
   - No → Continue to next question

5. **Is it a runtime error after successful build?**
   - Yes → Check browser console and corresponding source files
   - No → Continue to next question

6. **Is it a build configuration issue?**
   - Yes → Check webpack configuration files and Hugo config
   - No → Report the issue in detail to the development team

## Example Error Messages and Interpretation

### Example 1: JavaScript Syntax Error
