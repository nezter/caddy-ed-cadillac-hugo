# HIGH-05 Remaining Work Plan

This document outlines the remaining work needed to complete HIGH-05 (Optimize CSS delivery with critical CSS).

## Current Progress

So far we have:
- Completed subtask 1: Analysis & Planning
- Partially completed subtask 2: Tool Setup & Configuration
  - Created critical CSS configuration file
  - Created manual critical CSS generation script
  - Created custom webpack plugin

## Remaining Work

### Subtask 2: Tool Setup & Configuration (Remaining)
- **Estimated effort: 1 hour**
- Install all required dependencies with `npm install`
- Test the critical CSS generation script on a single template
- Verify Critical CSS webpack plugin works with the build process
- Create a test case to measure performance improvements

### Subtask 3: Implementation & Integration
- **Estimated effort: 3 hours**

#### Hugo Template Modifications
1. Modify Hugo base template (baseof.html) to support critical CSS:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  {{ partial "head.html" . }}
  
  {{ if .Params.criticalCss }}
  <!-- Critical CSS for this template -->
  <style>{{ .Params.criticalCss | safeCSS }}</style>
  
  <!-- Non-critical CSS loaded asynchronously -->
  <link rel="preload" href="{{ .Site.Params.mainCSS }}" as="style" onload="this.onload=null;this.rel='stylesheet'">
  <noscript><link rel="stylesheet" href="{{ .Site.Params.mainCSS }}"></noscript>
  {{ else }}
  <!-- Regular CSS loading -->
  <link rel="stylesheet" href="{{ .Site.Params.mainCSS }}">
  {{ end }}
</head>
<body>
  <!-- Rest of the template -->
</body>
</html>
```

2. Create a new partial for handling critical CSS injection
3. Modify config.toml to include settings for critical CSS

#### Critical CSS Processing
1. Configure critical CSS extraction for all template types:
   - Home page 
   - Inventory listing
   - Vehicle detail page
   - General content pages
   - Contact page
2. Set up test cases for each template type
3. Implement a build flag to enable/disable critical CSS generation

#### Post-Processing
1. Create a post-build step to verify critical CSS was correctly injected
2. Add logging of critical CSS sizes and optimization metrics

### Subtask 4: Testing & Optimization
- **Estimated effort: 2 hours**

1. Set up performance testing environment
   - Use Lighthouse for standardized metrics
   - Measure before/after for each template type
   - Document improvements in Core Web Vitals

2. Optimize critical CSS rules
   - Review and refine viewport sizes for extraction
   - Adjust extraction settings for better coverage
   - Fine-tune which rules are included/excluded
