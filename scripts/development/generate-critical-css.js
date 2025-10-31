const critical = require('critical');
const fs = require('fs');
const path = require('path');

const templates = [
  {
    name: 'home',
    src: 'public/index.html',
    dest: 'site/layouts/partials/critical/home.css',
    dimensions: [
      { width: 320, height: 568 },
      { width: 768, height: 1024 },
      { width: 1920, height: 1080 }
    ]
  },
  {
    name: 'inventory-list',
    src: 'public/inventory/index.html',
    dest: 'site/layouts/partials/critical/inventory-list.css',
    dimensions: [
      { width: 320, height: 568 },
      { width: 768, height: 1024 },
      { width: 1920, height: 1080 }
    ]
  },
  {
    name: 'inventory-single',
    src: 'public/inventory/example-vehicle/index.html',
    dest: 'site/layouts/partials/critical/inventory-single.css',
    dimensions: [
      { width: 320, height: 568 },
      { width: 768, height: 1024 },
      { width: 1920, height: 1080 }
    ]
  },
  {
    name: 'contact',
    src: 'public/contact/index.html',
    dest: 'site/layouts/partials/critical/contact.css',
    dimensions: [
      { width: 320, height: 568 },
      { width: 768, height: 1024 },
      { width: 1920, height: 1080 }
    ]
  }
];

// Ensure the directory exists
const criticalDir = path.dirname(templates[0].dest);
if (!fs.existsSync(criticalDir)) {
  fs.mkdirSync(criticalDir, { recursive: true });
}

// Process each template
templates.forEach(template => {
  console.log(`Generating critical CSS for ${template.name} from ${template.src}...`);
  
  critical.generate({
    src: template.src,
    target: {
      css: template.dest
    },
    dimensions: template.dimensions,
    extract: true,
    inline: false,
    minify: true,
    penthouse: {
      timeout: 30000
    }
  }).then(result => {
    console.log(`Critical CSS for ${template.name} saved to ${template.dest}`);
  }).catch(error => {
    console.error(`Error generating critical CSS for ${template.name}:`, error);
  });
});
