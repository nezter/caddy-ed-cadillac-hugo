/**
 * Generate critical CSS
 * Standalone script to generate critical CSS for templates
 */
const critical = require('critical');
const fs = require('fs');
const path = require('path');
const config = require('./critical-css-config');

console.log('Generating critical CSS...');

// Ensure the directory exists
if (!fs.existsSync(config.base)) {
  fs.mkdirSync(config.base, { recursive: true });
}

// Process each template
config.templates.forEach(template => {
  console.log(`Generating critical CSS for ${template.name} from ${template.src}...`);
  
  critical.generate({
    src: template.src,
    target: {
      css: path.join(config.base, `${template.name}.css`)
    },
    dimensions: template.dimensions,
    ...config.options
  }).then(result => {
    console.log(`Critical CSS for ${template.name} generated successfully`);
  }).catch(error => {
    console.error(`Error generating critical CSS for ${template.name}:`, error);
  });
});
