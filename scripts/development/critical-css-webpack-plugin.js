const fs = require('fs');
const path = require('path');
const critical = require('critical');

class CriticalCssWebpackPlugin {
  constructor(options) {
    this.options = Object.assign({
      baseFolder: 'site/layouts/partials/critical',
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
        }
      ],
      minify: true,
      extract: true,
      inline: false
    }, options);
  }

  apply(compiler) {
    // This runs after the assets are emitted
    compiler.hooks.afterEmit.tapAsync('CriticalCssWebpackPlugin', (compilation, callback) => {
      if (process.env.NODE_ENV !== 'production') {
        console.log('Skipping critical CSS generation in development mode');
        callback();
        return;
      }

      console.log('Generating critical CSS...');
      
      // Ensure the directory exists
      if (!fs.existsSync(this.options.baseFolder)) {
        fs.mkdirSync(this.options.baseFolder, { recursive: true });
      }

      // Process each template
      const templatePromises = this.options.templates.map(template => {
        return this.generateCriticalCss(template)
          .catch(error => {
            console.error(`Error generating critical CSS for ${template.name}:`, error);
          });
      });

      Promise.all(templatePromises)
        .then(() => {
          console.log('Critical CSS generation completed.');
          callback();
        })
        .catch(error => {
          console.error('Error in critical CSS generation:', error);
          callback();
        });
    });
  }

  generateCriticalCss(template) {
    const outputFile = path.join(this.options.baseFolder, `${template.name}.css`);
    
    console.log(`Generating critical CSS for ${template.name} from ${template.src}...`);
    
    return critical.generate({
      src: template.src,
      dimensions: template.dimensions,
      extract: this.options.extract,
      inline: this.options.inline,
      minify: this.options.minify,
      penthouse: {
        timeout: 30000
      }
    }).then(result => {
      fs.writeFileSync(outputFile, result.css);
      console.log(`Critical CSS for ${template.name} saved to ${outputFile}`);
      return result;
    });
  }
}

module.exports = CriticalCssWebpackPlugin;
