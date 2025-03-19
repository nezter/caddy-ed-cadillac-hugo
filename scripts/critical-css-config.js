/**
 * Configuration for Critical CSS generation
 */
module.exports = {
  base: 'site/layouts/partials/critical',
  templates: [
    {
      name: 'home',
      src: 'public/index.html',
      dimensions: [
        { width: 320, height: 568 },
        { width: 768, height: 1024 },
        { width: 1920, height: 1080 }
      ]
    },
    {
      name: 'inventory-list',
      src: 'public/inventory/index.html',
      dimensions: [
        { width: 320, height: 568 },
        { width: 768, height: 1024 },
        { width: 1920, height: 1080 }
      ]
    },
    {
      name: 'inventory-single',
      src: 'public/inventory/example-vehicle/index.html',
      dimensions: [
        { width: 320, height: 568 },
        { width: 768, height: 1024 },
        { width: 1920, height: 1080 }
      ]
    },
    {
      name: 'contact',
      src: 'public/contact/index.html',
      dimensions: [
        { width: 320, height: 568 },
        { width: 768, height: 1024 },
        { width: 1920, height: 1080 }
      ]
    },
    {
      name: 'blog',
      src: 'public/blog/index.html',
      dimensions: [
        { width: 320, height: 568 },
        { width: 768, height: 1024 },
        { width: 1920, height: 1080 }
      ]
    }
  ],
  options: {
    minify: true,
    extract: true,
    inline: false,
    penthouse: {
      timeout: 30000,
      forceInclude: [
        '.header',
        '.footer',
        '.main-nav',
        '.skip-link'
      ]
    }
  }
};
