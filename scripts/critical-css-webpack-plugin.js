/**
 * Critical CSS Webpack Plugin
 * 
 * This is a custom webpack plugin that integrates Critical with
 * the webpack build process.
 */

const critical = require('critical');
const path = require('path');
const fs = require('fs');
const chalk = require('chalk');

class CriticalCssWebpackPlugin {
  constructor(options = {}) {
    this.options = {
      base: {},
      templates: [],
      ...options
    };
  }
  
  apply(compiler) {
    // Wait until after assets have been emitted
    compiler.hooks.afterEmit.tapPromise('CriticalCssWebpackPlugin', async (compilation) => {
      // Only run in production mode
      if (process.env.NODE_ENV !== 'production') {
        console.log(chalk.yellow('Skipping critical CSS generation in development mode'));
        return;
      }
      
      const logger = compilation.getInfrastructureLogger('CriticalCssWebpackPlugin');
      logger.info('Generating critical CSS...');
      
      const { templates, base } = this.options;
      const outputPath = compiler.outputPath;
      
      // Create the critical directory if it doesn't exist
      const criticalDir = path.join(outputPath, 'critical');
      if (!fs.existsSync(criticalDir)) {
        fs.mkdirSync(criticalDir, { recursive: true });
      }
      
      let successCount = 0;
      let failCount = 0;
      
      // Process each template
      for (const template of templates) {
        const templateName = template.name || path.basename(template.src, '.html');
        
        try {
          logger.info(`Processing template: ${templateName}`);
          
          // Resolve paths relative to webpack output directory
          const src = path.resolve(outputPath, template.src);
          const dest = path.resolve(outputPath, template.dest);
          const css = template.css.map(file => path.resolve(outputPath, file));
          
          // Skip if source doesn't exist
          if (!fs.existsSync(src)) {
            logger.warn(`Source file does not exist: ${src}`);
            failCount++;
            continue;
          }
          
          // Generate critical CSS
          const result = await critical.generate({
            ...base,
            ...template,
            src,
            dest,
            css,
            extract: true,
            target: {
              css: path.join(criticalDir, `${templateName}.css`),
              html: dest,
              uncritical: path.join(criticalDir, `${templateName}.uncritical.css`)
            }
          });
          
          logger.info(`Critical CSS generated for ${templateName}: ${result.uncritical.length} bytes uncritical, ${result.css.length} bytes critical`);
          successCount++;
        } catch (error) {
          logger.error(`Error generating critical CSS for ${templateName}:`, error);
          failCount++;
        }
      }
      
      logger.info(`Critical CSS generation complete: ${successCount} succeeded, ${failCount} failed`);
      
      // Run the Hugo critical CSS hook
      try {
        require('./hugo-critical-css-hook');
        logger.info('Hugo critical CSS hook executed');
      } catch (error) {
        logger.error('Error executing Hugo critical CSS hook:', error);
      }
    });
  }
}

module.exports = CriticalCssWebpackPlugin;
