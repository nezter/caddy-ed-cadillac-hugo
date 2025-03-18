/**
 * Critical CSS Configuration
 * 
 * This file contains configuration settings for critical CSS extraction
 * using the Critical library.
 */

module.exports = {
  // Base configuration applied to all templates
  base: {
    // Inline the CSS directly into the HTML
    inline: true,
    
    // Extract CSS matching these dimensions
    dimensions: [
      {
        width: 375,  // Mobile portrait
        height: 667
      },
      {
        width: 768,  // Tablet
        height: 1024
      },
      {
        width: 1366, // Desktop
        height: 768
      }
    ],
    
    // Don't remove critical CSS from the full CSS file
    extract: false,
    
    // Ignore certain CSS rules (useful for print styles, etc.)
    ignore: {
      atrule: ['@font-face'],  // Ignore font-face rules
      rule: [/print/],         // Ignore print media queries
      decl: (node, value) => /url\(/.test(value) // Ignore declarations with URLs
    },
    
    // CSS Optimization settings
    minify: true,          // Minify the critical CSS
    preserveImports: true, // Keep @import statements
    
    // Timeout settings
    timeout: 30000,        // 30 seconds
  },
  
  // Template-specific configurations
  templates: [
    {
      // Home page template
      name: 'home',
      src: 'dist/index.html',
      dest: 'dist/index.html',
      css: [
        'dist/main.css'
      ],
      // Add additional viewport sizes if needed for this template
      dimensions: [
        {
          width: 1920, // Large desktop for hero section
          height: 1080
        }
      ]
    },
    {
      // Inventory listing
      name: 'inventory-list',
      src: 'dist/inventory/index.html',
      dest: 'dist/inventory/index.html',
      css: [
        'dist/main.css'
      ]
    },
    {
      // Vehicle detail page
      name: 'inventory-detail',
      src: 'dist/inventory/detail/index.html',
      dest: 'dist/inventory/detail/index.html', 
      css: [
        'dist/main.css'
      ]
    },
    {
      // Contact page
      name: 'contact',
      src: 'dist/contact/index.html',
      dest: 'dist/contact/index.html',
      css: [
        'dist/main.css'
      ]
    }
  ]
};
