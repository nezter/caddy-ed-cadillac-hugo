# Caddy Ed Cadillac - Detailed Task Breakdown for AI Assistance

This document provides AI-friendly task breakdowns for the Caddy Ed Cadillac website updates.

## Critical Issues

### CRIT-01: Fix Webpack build errors in webpack.prod.js

**AI Task Breakdown:**
1. Analyze webpack.prod.js for duplicate declarations of 'merge'
2. Remove duplicate declaration, keeping only the first instance
3. Check for syntax errors in the file
4. Verify result against original error message: "SyntaxError: Identifier 'merge' has already been declared"

**Code Pointers:**
- Look at the beginning of webpack.prod.js
- Check for multiple instances of `const { merge } = require("webpack-merge");`

### CRIT-02: Resolve Hugo template error in header.html

**AI Task Breakdown:**
1. Review header.html focusing on the CSS inclusion code
2. Identify the problematic `resources.ExecuteAsTemplate` call
3. Replace with direct link to CSS files
4. Ensure the use of proper Hugo conditionals for development/production environments

**Code Pointers:**
- Look for code involving `resources.ExecuteAsTemplate`
- Focus on the `<link>` tags that include stylesheets

### CRIT-03: Fix package.json syntax error in prebuild script

**AI Task Breakdown:**
1. Locate the prebuild script in package.json
2. Check for invalid syntax (e.g., unexpected characters, missing quotes)
3. Specifically look for erroneous '&' that should be '&&' or a typo
4. Fix the syntax while preserving the intended functionality

**Code Pointers:**
- Look in the "scripts" section of package.json
- Focus on the "prebuild" entry

### CRIT-04: Update deprecated webpack hash to fullhash

**AI Task Breakdown:**
1. Scan webpack.prod.js for instances of [hash] in filename patterns
2. Replace [hash] with [fullhash] in output.filename and output.chunkFilename
3. Do the same in MiniCssExtractPlugin configuration
4. Check for any other instances that might need updating

**Code Pointers:**
- Look in the output configuration section
- Review MiniCssExtractPlugin configuration

### CRIT-05: Replace OptimizeCSSAssetsPlugin with CssMinimizerPlugin

**AI Task Breakdown:**
1. Replace require statement for OptimizeCSSAssetsPlugin with CssMinimizerPlugin
2. Update webpack.prod.js to use the new plugin in optimization.minimizer
3. Ensure proper configuration options are transferred
4. Update package.json if needed to include the new dependency

**Code Pointers:**
- Focus on optimization.minimizer array in webpack.prod.js
- Check require statements at the top of the file

## High Priority Tasks

### HIGH-01: Refactor schedulingCalendar.js for better maintainability

**AI Task Breakdown:**
1. Analyze schedulingCalendar.js to identify complex functions
2. Break down large functions into smaller, focused functions
3. Extract shared functionality into reusable methods
4. Implement proper error handling
5. Add descriptive comments for complex logic

**Code Pointers:**
- Look for functions longer than 30 lines
- Focus on methods like `renderCalendar`, `getTimeSlots`, and `initForm`

### HIGH-02: Refactor salesDashboard.js to use modular components

**AI Task Breakdown:**
1. Identify distinct UI components in salesDashboard.js (e.g., leads list, metrics panel)
2. Extract each component into a separate class/function
3. Implement a centralized state management approach
4. Use event delegation for better performance
5. Establish clear interfaces between components

**Code Pointers:**
- Look at rendering methods like `renderLeadsList` and `renderSalesMetrics`
- Analyze complex event handlers and state management

### HIGH-03: Implement structured error handling in API functions

**AI Task Breakdown:**
1. Review all API functions in netlify/functions/*
2. Ensure consistent try/catch patterns
3. Add proper error logging with context information
4. Implement user-friendly error responses
5. Add status code mapping for common errors

**Code Pointers:**
- Focus on fetch/axios calls
- Review error handling in async functions
- Check response formatting in catch blocks

### HIGH-04: Implement lazy loading for images

**AI Task Breakdown:**
1. Check if lazysizes library is already included
2. Add 'lazyload' class to image tags
3. Convert src attributes to data-src
4. Add placeholder images or low-quality image previews
5. Test performance impact

**Code Pointers:**
- Review HTML templates with image tags
- Check for existing lazy loading implementations
- Look at vehicle listing templates

## Medium Priority Tasks

### MED-02: Implement code splitting for JS bundles

**AI Task Breakdown:**
1. Analyze the current webpack configuration
2. Identify logical chunk split points (e.g., admin vs. public, by page types)
3. Configure webpack to use dynamic imports for routes/components
4. Set up caching strategy with proper chunk naming
5. Test and measure bundle size improvements

**Code Pointers:**
- Review webpack config files
- Check main.js and other entry points
- Look for logical component divisions

### MED-03: Enhance vehicle inventory filtering capabilities

**AI Task Breakdown:**
1. Review current inventory filtering implementation
2. Add support for additional filter parameters (e.g., price range, features)
3. Implement filter combination logic (AND/OR operations)
4. Add URL parameter synchronization for shareable filtered views
5. Optimize for performance with debouncing

**Code Pointers:**
- Check inventory.js or similar files
- Review filter UI components
- Analyze API filter parameter handling

## Low Priority Tasks

### LOW-01: Update README with better project documentation

**AI Task Breakdown:**
1. Create a comprehensive README.md structure
2. Include sections for: project overview, setup instructions, deployment
3. Document environment variables needed
4. Add architecture diagrams or explanations
5. Include troubleshooting section for common issues

**Code Pointers:**
- Review existing README.md
- Check package.json for scripts to document
- Look at netlify.toml for deployment settings

### LOW-07: Implement social sharing functionality

**AI Task Breakdown:**
1. Design a social sharing component
2. Implement share buttons for common platforms (Facebook, Twitter, etc.)
3. Set up Open Graph meta tags for proper link previews
4. Use Web Share API where supported
5. Add tracking for share events

**Code Pointers:**
- Review header.html for meta tags
- Check for existing sharing functionality
- Look at vehicle detail pages

## Testing Tasks

### TEST-01: Create unit tests for utility functions

**AI Task Breakdown:**
1. Set up testing framework if not present (Jest recommended)
2. Identify utility functions in src/js/utils.js
3. Write tests for each function covering main use cases
4. Add edge case testing for robust functions
5. Ensure tests are isolated and don't rely on external state

**Code Pointers:**
- Focus on src/js/utils.js
- Check for pure functions to test first
- Look for functions with clear inputs/outputs
