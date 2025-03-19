/**
 * Process Critical CSS
 * 
 * This script processes the generated critical CSS files and creates Hugo data files
 * that can be used by templates to inline critical CSS.
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');
const chalk = require('chalk');

// Configuration
const criticalCssDir = path.resolve(__dirname, '../dist/critical');
const hugoDataDir = path.resolve(__dirname, '../site/data/critical');
const config = require('./critical-css-config');

// Ensure directories exist
if (!fs.existsSync(criticalCssDir)) {
  console.error(chalk.red(`Critical CSS directory does not exist: ${criticalCssDir}`));
  console.error(chalk.yellow('Make sure to generate critical CSS first with: npm run critical-css'));
  process.exit(1);
}

// Create Hugo data directory if it doesn't exist
if (!fs.existsSync(hugoDataDir)) {
  fs.mkdirSync(hugoDataDir, { recursive: true });
  console.log(chalk.blue(`Created Hugo data directory: ${hugoDataDir}`));
}

// Process each template defined in the config
console.log(chalk.blue('Processing critical CSS files...'));
let processedCount = 0;

config.templates.forEach(template => {
  const templateName = template.name;
  const criticalCssPath = path.resolve(criticalCssDir, `${templateName}.css`);
  
  if (!fs.existsSync(criticalCssPath)) {
    console.warn(chalk.yellow(`Critical CSS file does not exist for template: ${templateName}`));
    return;
  }
  
  // Read the critical CSS
  const criticalCss = fs.readFileSync(criticalCssPath, 'utf8');
  
  // Create Hugo data file
  const hugoDataFile = path.resolve(hugoDataDir, `${templateName}.json`);
  
  // Write the CSS to a JSON file for Hugo
  fs.writeFileSync(
    hugoDataFile,
    JSON.stringify({ css: criticalCss }),
    'utf8'
  );
  
  console.log(chalk.green(`✓ Processed critical CSS for ${templateName}`));
  processedCount++;
});

console.log(chalk.blue(`Processed ${processedCount} critical CSS files`));

// Create an index.json file to make it easier to access in Hugo
const templates = config.templates.map(t => t.name);
fs.writeFileSync(
  path.resolve(hugoDataDir, 'index.json'),
  JSON.stringify({ templates }),
  'utf8'
);

console.log(chalk.blue('Critical CSS processing complete!'));
