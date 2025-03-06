const { execSync } = require('child_process');
const log = require('fancy-log');

try {
  log('Updating Browserslist database...');
  execSync('npx browserslist@latest --update-db', { stdio: 'inherit' });
  log('Browserslist database updated successfully');
} catch (error) {
  log.error('Failed to update Browserslist database:', error.message);
  // Don't exit with error as this is not critical
}
