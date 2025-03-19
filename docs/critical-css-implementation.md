# Critical CSS Implementation Guide

This document explains the critical CSS implementation for the Caddy Ed Cadillac website, including the technical details, configuration options, and maintenance guidelines.

## What is Critical CSS?

Critical CSS is a performance optimization technique that extracts and inlines the CSS necessary for rendering above-the-fold content. This approach improves page load performance by:

1. Reducing the initial CSS payload
2. Eliminating render-blocking resources
3. Delivering the most important styles immediately
4. Loading non-critical CSS asynchronously

## Implementation Architecture

Our implementation uses the following components:

1. **Critical Library**: The core engine that extracts critical CSS
2. **Webpack Plugin**: Integration with our build process
3. **Hugo Integration**: Injects critical CSS into templates
4. **Configuration System**: Defines extraction rules and templates

### Workflow

1. During the build process, webpack identifies key templates
2. The Critical library analyzes each template's HTML and CSS
3. Critical CSS is extracted for different viewport sizes
4. The extracted CSS is stored in template-specific files
5. Hugo reads these files and injects the CSS inline
6. The full CSS is loaded asynchronously via JavaScript

## Configuration

The critical CSS configuration is stored in `scripts/critical-css-config.js` and includes:

### Base Configuration

```javascript
base: {
  inline: true,
  dimensions: [
    { width: 375, height: 667 },  // Mobile
    { width: 768, height: 1024 }, // Tablet
    { width: 1366, height: 768 }  // Desktop
  ],
  extract: false,
  ignore: {
    atrule: ['@font-face'],
    rule: [/print/],
    decl: (node, value) => /url\(/.test(value)
  },
  minify: true,
  preserveImports: true,
  timeout: 30000,
}
```

### Template Configuration

Each template defines:
- Template name (e.g., "home", "inventory-list")
- Source HTML file path
- Destination HTML file path
- CSS file paths to analyze
- Optional template-specific settings

## Directory Structure

The directory structure for the critical CSS implementation is as follows:

```
project-root/
├── scripts/
│   ├── critical-css-config.js
├── src/
│   ├── templates/
│   │   ├── home.html
│   │   ├── inventory-list.html
│   ├── css/
│   │   ├── home.css
│   │   ├── inventory-list.css
├── dist/
│   ├── templates/
│   │   ├── home.html
│   │   ├── inventory-list.html
```

## Maintenance Guidelines

To ensure the critical CSS implementation remains effective and up-to-date, follow these maintenance guidelines:

1. **Regularly Update CSS**: Ensure that any changes to the CSS files are reflected in the critical CSS extraction.
2. **Monitor Performance**: Use performance monitoring tools to track the impact of critical CSS on page load times.
3. **Review Configuration**: Periodically review the configuration settings to ensure they align with current best practices and project requirements.
4. **Test Across Viewports**: Validate the critical CSS extraction for different viewport sizes to ensure consistent rendering across devices.
5. **Automate Extraction**: Integrate the critical CSS extraction process into the CI/CD pipeline to automate updates and ensure consistency.

