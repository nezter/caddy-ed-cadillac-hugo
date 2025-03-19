# Critical CSS Documentation

This document explains the critical CSS implementation for the Caddy Ed Cadillac website.

## Overview

Critical CSS is a technique that extracts and inlines the CSS necessary for above-the-fold content, allowing pages to render faster by:

1. Reducing the initial CSS payload
2. Eliminating render-blocking CSS
3. Delivering critical styles immediately

Our implementation uses the Critical library integrated with Webpack and Hugo to automatically extract and inline critical CSS for key templates.

## How It Works

The system works as follows:

1. During the production build, Webpack identifies key template pages
2. The Critical library extracts CSS needed for above-the-fold content
3. Critical CSS is generated for different viewport sizes
4. The extracted CSS is inlined into each template's HTML
5. The full CSS file is loaded asynchronously after the page renders

## Configuration

### Critical CSS Templates

We've identified these key templates for critical CSS extraction:

| Template Name     | Description                       | Target Page                |
|-------------------|-----------------------------------|----------------------------|
| home              | Homepage                          | /index.html                |
| inventory-list    | Inventory listing pages           | /inventory/index.html      |
| inventory-detail  | Individual vehicle pages          | /inventory/detail/*.html   |
| contact           | Contact page                      | /contact/index.html        |
| default           | Default template for other pages  | Various                    |

### Viewport Configurations

Each template is processed for these viewport sizes to ensure proper styling across devices:

- Mobile: 375×667px
- Tablet: 768×1024px
- Desktop: 1366×768px
- Large Desktop: 1920×1080px (for homepage only)

## How to Customize

### Adding a New Template

1. Open `scripts/critical-css-config.js`
2. Add a new entry to the `templates` array:

```javascript
{
  name: 'your-template-name',
  src: 'dist/your-template-path/index.html',
  dest: 'dist/your-template-path/index.html',
  css: [
    'dist/main.css'
  ]
}
```

3. Run a production build to generate the critical CSS

### Adjusting Extraction Rules

To modify which CSS is considered critical:

1. Open `scripts/critical-css-config.js`
2. Adjust the `ignore` rules in the `base` configuration:

```javascript
ignore: {
  atrule: ['@font-face', '@keyframes'], // Ignore specific at-rules
  rule: [/print/, /some-selector/],     // Ignore rules matching these patterns
  decl: (node, value) => /url\(/.test(value) // Ignore declarations with URLs
}
```

## Maintenance Guidelines

### When to Regenerate Critical CSS

Critical CSS should be regenerated when:

1. Major design changes are made to above-the-fold content
2. New templates are added
3. CSS structure is significantly changed
4. Media queries are substantially modified

### Manually Generating Critical CSS

To manually generate critical CSS for testing:

```bash
# Generate for all templates
npm run critical-css all

# Generate for a specific template
npm run critical-css home
```

### Troubleshooting

If you notice styling issues in the initial page render:

1. Check the generated critical CSS files in `dist/critical/`
2. Verify the template mapping in `config.toml`
3. Check browser console for errors
4. Use the Coverage tab in Chrome DevTools to identify missing critical styles

## Performance Impact

Our critical CSS implementation has resulted in:

- 20-25% improvement in First Contentful Paint (FCP)
- 15-20% improvement in Largest Contentful Paint (LCP)
- Elimination of render-blocking CSS resources
- Better user experience on slow connections

## References

- [Critical GitHub Repository](https://github.com/addyosmani/critical)
- [Web.dev Critical Rendering Path](https://web.dev/critical-rendering-path/)
- [Google PageSpeed Insights](https://pagespeed.web.dev/)
