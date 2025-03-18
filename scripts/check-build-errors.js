const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const glob = require('glob');
const { formatWarningMessage } = require('../src/js/utils/build-error-reporter');

/**
 * Script to check for common build errors before starting the build process
 */
function checkForBuildErrors() {
  console.log(chalk.cyan.bold('\n⚙️ Checking project for potential build issues...\n'));
  const issuesFound = [];
  
  // Check 1: Look for missing Hugo templates
  issuesFound.push(...checkHugoTemplates());
  
  // Check 2: Look for broken imports in JS files
  issuesFound.push(...checkJsImports());
  
  // Check 3: Look for potential CSS issues
  issuesFound.push(...checkCssIssues());
  
  // Check 4: Look for missing assets
  issuesFound.push(...checkMissingAssets());
  
  // Report results
  if (issuesFound.length === 0) {
    console.log(chalk.green('\n✓ No potential build issues found!\n'));
    process.exit(0);
  } else {
    console.log(chalk.yellow.bold(`\n⚠ ${issuesFound.length} potential issue${issuesFound.length > 1 ? 's' : ''} found:\n`));
    
    issuesFound.forEach((issue, index) => {
      console.log(formatWarningMessage(`Issue #${index + 1}: ${issue.message}`, {
        file: issue.file,
        suggestion: issue.suggestion
      }));
    });
    
    console.log(chalk.yellow('\nResolve these issues to prevent build errors.\n'));
    process.exit(1);
  }
}

/**
 * Check for missing or problematic Hugo templates
 */
function checkHugoTemplates() {
  const issues = [];
  const templatesPath = path.join(__dirname, '../site/layouts');
  
  // Check for missing partial templates referenced in files
  const layoutFiles = glob.sync(`${templatesPath}/**/*.html`);
  
  layoutFiles.forEach(file => {
    const content = fs.readFileSync(file, 'utf-8');
    const partialMatches = content.match(/\{\{\s*partial\s+["'](.+?)["']/g) || [];
    
    partialMatches.forEach(match => {
      // Extract partial name
      const partialName = match.match(/\{\{\s*partial\s+["'](.+?)["']/)[1];
      const partialPath = path.join(templatesPath, 'partials', `${partialName}.html`);
      
      if (!fs.existsSync(partialPath)) {
        issues.push({
          file,
          message: `Missing partial template: ${partialName}.html`,
          suggestion: `Create the missing partial at ${partialPath} or correct the template name.`
        });
      }
    });
  });
  
  return issues;
}

/**
 * Check for broken or problematic imports in JavaScript files
 */
function checkJsImports() {
  const issues = [];
  const jsFiles = glob.sync('src/**/*.js');
  
  jsFiles.forEach(file => {
    const content = fs.readFileSync(file, 'utf-8');
    
    // Check for relative imports that might not exist
    const importMatches = content.match(/(?:import|require)\s*\(?["']\.\.?\/([^"']+)["']/g) || [];
    
    importMatches.forEach(match => {
      const importPath = match.match(/(?:import|require)\s*\(?["'](\.\.?\/[^"']+)["']/)[1];
      const basePath = path.dirname(file);
      const resolvedPath = path.join(basePath, importPath);
      
      // Check if the file exists with different extensions
      const extensions = ['.js', '.jsx', '.ts', '.tsx', '.json'];
      const fileExists = extensions.some(ext => {
        return fs.existsSync(`${resolvedPath}${ext}`) || fs.existsSync(resolvedPath) || 
               fs.existsSync(`${resolvedPath}/index.js`);
      });
      
      if (!fileExists) {
        issues.push({
          file,
          message: `Potentially broken import: ${importPath}`,
          suggestion: `Check that the imported file exists or correct the import path.`
        });
      }
    });
  });
  
  return issues;
}

/**
 * Check for potential CSS issues
 */
function checkCssIssues() {
  const issues = [];
  const cssFiles = glob.sync('src/**/*.{css,scss}');
  
  cssFiles.forEach(file => {
    const content = fs.readFileSync(file, 'utf-8');
    
    // Check for potentially unclosed blocks
    const openBraces = (content.match(/{/g) || []).length;
    const closeBraces = (content.match(/}/g) || []).length;
    
    if (openBraces !== closeBraces) {
      issues.push({
        file,
        message: `Potentially unclosed CSS block (${openBraces} opening vs ${closeBraces} closing braces)`,
        suggestion: `Check for missing closing braces in your CSS.`
      });
    }
    
    // Check for invalid CSS properties
    const potentialInvalidProps = content.match(/([a-z-]+)\s*:\s*[^;{}]+(?=[;}])/g) || [];
    const commonTypos = {
      'marign': 'margin',
      'pading': 'padding',
      'boarder': 'border',
      'alig-items': 'align-items',
      'just-content': 'justify-content',
      'dispaly': 'display',
      'postion': 'position',
      'backround': 'background'
    };
    
    potentialInvalidProps.forEach(prop => {
      const propertyName = prop.split(':')[0].trim();
      if (commonTypos[propertyName]) {
        issues.push({
          file,
          message: `Possible CSS property typo: "${propertyName}"`,
          suggestion: `Did you mean "${commonTypos[propertyName]}"?`
        });
      }
    });
  });
  
  return issues;
}

/**
 * Check for missing asset references
 */
function checkMissingAssets() {
  const issues = [];
  const htmlFiles = glob.sync('site/**/*.{html,md}');
  
  // Common asset directories to check
  const assetDirs = ['src/img', 'src/static', 'src/fonts'];
  
  htmlFiles.forEach(file => {
    const content = fs.readFileSync(file, 'utf-8');
    
    // Check for image references
    const imgMatches = content.match(/src=["']([^"']+\.(jpg|jpeg|png|gif|svg|webp))["']/g) || [];
    
    imgMatches.forEach(match => {
      const src = match.match(/src=["']([^"']+)["']/)[1];
      
      // Don't check external URLs or data URIs
      if (src.startsWith('http') || src.startsWith('data:') || src.startsWith('{{')) {
        return;
      }
      
      // Check if the image exists
      const exists = assetDirs.some(dir => {
        // Remove any leading slash for path resolution
        const imgPath = src.replace(/^\//, '');
        return fs.existsSync(path.join(__dirname, '..', dir, imgPath)) || 
               fs.existsSync(path.join(__dirname, '..', imgPath));
      });
      
      if (!exists) {
        issues.push({
          file,
          message: `Missing image asset: ${src}`,
          suggestion: `Make sure the file exists in one of the asset directories.`
        });
      }
    });
  });
  
  return issues;
}

// Run the checks when this script is executed directly
if (require.main === module) {
  checkForBuildErrors();
}

module.exports = {
  checkForBuildErrors,
  checkHugoTemplates,
  checkJsImports,
  checkCssIssues,
  checkMissingAssets
};
