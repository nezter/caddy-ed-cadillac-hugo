/**
 * Generate Critical CSS
 * 
 * This script allows manual generation of critical CSS for testing and debugging.
 * It uses the Critical library to extract and inline critical CSS for specified templates.
 */

const critical = require('critical');
const path = require('path');
const fs = require('fs');
const glob = require('glob');
const chalk = require('chalk');
const config = require('./critical-css-config');

// Parse command line arguments
const args = process.argv.slice(2);
const templateArg = args[0];
const allTemplates = templateArg === 'all';

// Function to generate critical CSS for a template
async function generateCriticalCss(template) {
  console.log(chalk.cyan(`Generating critical CSS for template: ${template.name}...`));
  
  try {
    // Ensure the source file exists
    if (!fs.existsSync(template.src)) {
      console.error(chalk.red(`Error: Source file not found: ${template.src}`));
      return false;
    }

    // Generate critical CSS
    const result = await critical.generate({
      // Merge base config with template config
      ...config.base,
      ...template,
      // Convert relative paths to absolute
      src: path.resolve(template.src),
      dest: path.resolve(template.dest),
      css: template.css.map(css => path.resolve(css)),
    });

    console.log(chalk.green(`✅ Critical CSS generated for ${template.name}`));
    
    // Log size info
    const originalSize = fs.statSync(template.src).size;
    const newSize = Buffer.byteLength(result.html, 'utf8');
    const criticalCssSize = Buffer.byteLength(result.css, 'utf8');
    
    console.log(chalk.yellow(`   Original HTML size: ${formatBytes(originalSize)}`));
    console.log(chalk.yellow(`   New HTML size: ${formatBytes(newSize)}`));
    console.log(chalk.yellow(`   Critical CSS size: ${formatBytes(criticalCssSize)}`));
    
    return true;
  } catch (error) {
    console.error(chalk.red(`❌ Error generating critical CSS for ${template.name}:`), error);
    return false;
  }
}

// Format bytes to a human-readable string
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Main function
async function main() {
  console.log(chalk.blue('Critical CSS Generator'));
  console.log(chalk.blue('====================='));
  
  let templates = config.templates;
  
  // If a specific template was provided
  if (!allTemplates && templateArg) {
    const template = templates.find(t => t.name === templateArg);
    if (template) {
      templates = [template];
    } else {
      console.error(chalk.red(`Error: Template "${templateArg}" not found in configuration.`));
      console.log(chalk.yellow('Available templates:'));
      config.templates.forEach(t => console.log(`- ${t.name}`));
      process.exit(1);
    }
  }
  
  console.log(chalk.blue(`Processing ${templates.length} template(s)...`));
  
  // Process all templates
  const results = await Promise.all(templates.map(generateCriticalCss));
  
  // Report results
  const successes = results.filter(Boolean).length;
  const failures = results.length - successes;
  
  console.log(chalk.blue('====================='));
  console.log(chalk.blue(`Complete: ${successes} succeeded, ${failures} failed`));
}

// Run the main function
main().catch(error => {
  console.error(chalk.red('Unhandled error:'), error);
  process.exit(1);
});
