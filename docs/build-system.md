# Build System Documentation

This document provides an overview of the build system used in the Caddy Ed Cadillac Hugo project.

## Overview

The project uses a modern build system that combines Hugo (for static site generation) with Webpack (for asset processing). This approach provides the best of both worlds:

- **Hugo**: Fast static site generation, content management, and templating
- **Webpack**: Modern JavaScript processing, CSS optimization, and asset management

## Core Components

### 1. Hugo

Hugo is responsible for generating HTML from markdown content and templates.

### 2. Webpack Configuration

The Webpack configuration is split into three files:

- `webpack.common.js`: Common configuration shared between environments
- `webpack.dev.js`: Development-specific configuration with fast builds and hot reloading
- `webpack.prod.js`: Production-specific configuration with optimizations

### 3. NPM Scripts

Several NPM scripts are available to streamline development:

- `npm start`: Start development server (Hugo + Webpack)
- `npm run build`: Build for production
- `npm run build:enhanced`: Build with enhanced error reporting
- `npm run build:notify`: Build with desktop notifications
- `npm run check:errors`: Run pre-build error checks
- `npm run critical-css`: Generate critical CSS manually

## Production Build Process

The production build process includes the following steps:

1. **Cleaning**: Remove previous build artifacts
2. **Webpack Build**: Process and optimize JavaScript and CSS
3. **Critical CSS Generation**: Extract and inline critical CSS
4. **Hugo Build**: Generate HTML from content and templates
5. **Post-processing**: Apply additional optimizations

### Critical CSS Optimization

The build system now includes critical CSS optimization to improve page load performance:

1. After Webpack has generated the main CSS file, critical CSS is extracted for key templates
2. The critical CSS is inlined directly into the HTML
3. The main CSS file is loaded asynchronously to prevent render blocking

This approach significantly improves Core Web Vitals metrics like First Contentful Paint (FCP) and Largest Contentful Paint (LCP).

## Development Workflow

During development:

1. Run `npm start` to start both Hugo and Webpack in development mode
2. Hugo will serve content on http://localhost:1313
3. Changes to source files trigger automatic rebuilds

## Error Reporting

The build system includes enhanced error reporting:

1. **Pre-build Checks**: Detect common issues before building
2. **Formatted Errors**: Clear, contextual error messages
3. **Build Notifications**: Desktop notifications for build events
4. **Visual Hierarchy**: Color-coded error output

## Advanced Features

### Bundle Analysis

Run `npm run build:analyze` to generate a visual representation of bundle sizes.

### Cache Management

Run `npm run cache:clear` to clear the build cache if you encounter unexplained issues.

### Clean Reinstall

Run `npm run reinstall` to perform a clean reinstallation of dependencies.
