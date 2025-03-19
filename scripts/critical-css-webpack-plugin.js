/**
 * Webpack plugin for generating critical CSS
 * This plugin extracts critical CSS for specified templates and saves them to Hugo partials
 */
const fs = require('fs');
const path = require('path');
const critical = require('critical');

class CriticalCssWebpackPlugin {
  constructor(options) {
    this.options = Object.assign({
      base: 'site/layouts/partials/critical',
      templates: [],
      options: {
        minify: true,
        extract: true,
        inline: false
      }
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
      if (!fs.existsSync(this.options.base)) {
        fs.mkdirSync(this.options.base, { recursive: true });
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
    const outputFile = path.join(this.options.base, `${template.name}.css`);
    
    console.log(`Generating critical CSS for ${template.name} from ${template.src}...`);
    
    const options = {
      ...this.options.options,
      src: template.src,
      dimensions: template.dimensions
    };
    
    return critical.generate(options)
      .then(result => {
        fs.writeFileSync(outputFile, result.css);
        console.log(`Critical CSS for ${template.name} saved to ${outputFile}`);
        return result;
      });
  }
}

module.exports = CriticalCssWebpackPlugin;
