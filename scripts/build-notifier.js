const notifier = require('node-notifier');
const path = require('path');
const chalk = require('chalk');

/**
 * Send a desktop notification for build events
 */
function notify({ title, message, type = 'info' }) {
  // Only show notifications if enabled via command line flag
  if (process.env.ENABLE_NOTIFICATIONS !== 'true') {
    return;
  }
  
  const icon = type === 'error' 
    ? path.join(__dirname, '../src/static/icons/error.png')
    : path.join(__dirname, '../src/static/icons/success.png');
  
  notifier.notify({
    title: title || 'Caddy Ed Hugo',
    message: message,
    icon: icon,
    sound: type === 'error',
    wait: type === 'error'
  });
  
  // Also log to console
  if (type === 'error') {
    console.log(chalk.red(`\n✖ ${title}: ${message}\n`));
  } else if (type === 'warning') {
    console.log(chalk.yellow(`\n⚠ ${title}: ${message}\n`));
  } else {
    console.log(chalk.green(`\n✓ ${title}: ${message}\n`));
  }
}

/**
 * Create success notification
 */
function notifySuccess(message) {
  notify({
    title: 'Build Successful',
    message: message || 'Build completed successfully',
    type: 'success'
  });
}

/**
 * Create error notification
 */
function notifyError(message) {
  notify({
    title: 'Build Failed',
    message: message || 'There were errors during the build',
    type: 'error'
  });
}

/**
 * Create warning notification
 */
function notifyWarning(message) {
  notify({
    title: 'Build Warning',
    message: message,
    type: 'warning'
  });
}

module.exports = {
  notify,
  notifySuccess,
  notifyError,
  notifyWarning
};
