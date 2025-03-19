/**
 * Hugo Critical CSS Hook
 * 
 * This script provides integration between Hugo and Critical CSS.
 * It reads the generated critical CSS files and injects them into Hugo's data.
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');
const chalk = require('chalk');

console.log(chalk.blue('Hugo Critical CSS Integration'));

// Configuration
const criticalCssDir = path.resolve(__dirname, '../dist/critical');
const hugoDataDir = path.resolve(__dirname, '../site/data/critical');

// Ensure the Hugo data directory exists
if (!fs.existsSync(hugoDataDir)) {
  fs.mkdirSync(hugoDataDir, { recursive: true });
  console.log(chalk.green(`Created Hugo data directory: ${hugoDataDir}`));
}

// Check if critical CSS directory exists
if (!fs.existsSync(criticalCssDir)) {
  console.log(chalk.yellow('Critical CSS directory not found. Creating placeholder...'));
  fs.mkdirSync(criticalCssDir, { recursive: true });
}

// Find all critical CSS files
const criticalCssFiles = glob.sync(`${criticalCssDir}/*.css`).filter(file => !file.includes('.uncritical.'));

if (criticalCssFiles.length === 0) {
  console.log(chalk.yellow('No critical CSS files found. Run a production build first.'));
  
  // Create placeholder data
  const placeholderData = {
    templates: ['home', 'inventory-list', 'inventory-detail', 'contact', 'default'],
    available: false
  };
  
  fs.writeFileSync(
    path.join(hugoDataDir, 'index.json'),
    JSON.stringify(placeholderData),
    'utf8'
  );
  
  console.log(chalk.yellow('Created placeholder critical data for Hugo.'));
  process.exit(0);
}

// Process each critical CSS file
console.log(chalk.blue(`Processing ${criticalCssFiles.length} critical CSS files...`));

const templates = [];

criticalCssFiles.forEach(file => {
  const basename = path.basename(file, '.css');
  templates.push(basename);
  
  // Read the critical CSS
  const criticalCss = fs.readFileSync(file, 'utf8');
  
  // Create Hugo data file
  const hugoDataFile = path.join(hugoDataDir, `${basename}.json`);
  
  fs.writeFileSync(
    hugoDataFile,
    JSON.stringify({ css: criticalCss }),
    'utf8'
  );
  
  console.log(chalk.green(`✓ Processed ${basename}.css (${Buffer.byteLength(criticalCss, 'utf8')} bytes)`));
});

// Create index.json for Hugo to know which templates have critical CSS
fs.writeFileSync(
  path.join(hugoDataDir, 'index.json'),
  JSON.stringify({ templates, available: true }),
  'utf8'
);

console.log(chalk.green('Successfully processed critical CSS for Hugo!'));
