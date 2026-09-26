/**
 * Global Notification System
 * 
 * Provides a site-wide notification system for displaying important messages,
 * especially for critical errors that need user attention.
 */

// Store for active notifications
const notifications = new Set();

// Default configuration
const defaultConfig = {
  position: 'top-right',  // top-right, top-left, bottom-right, bottom-left, top-center, bottom-center
  duration: 5000,         // milliseconds, 0 for no auto-hide
  maxVisible: 3,          // maximum number of notifications visible at once
  animationDuration: 300, // milliseconds for fade in/out
  container: null,        // optional custom container element
  closeOnClick: true      // whether to close the notification on click
};

/**
 * Creates the container for notifications if it doesn't exist
 * @param {string} position - The position for the notification container
 * @returns {HTMLElement} The notification container
 */
function getContainer(position) {
  const containerId = `notification-container-${position}`;
  let container = document.getElementById(containerId);
  
  if (!container) {
    container = document.createElement('div');
    container.id = containerId;
    container.className = `notification-container ${position}`;
    document.body.appendChild(container);
  }
  
  return container;
}

/**
 * Create and show a notification
 * @param {string} message - The message to display
 * @param {string} type - The notification type (info, success, warning, error)
 * @param {Object} options - Custom options for this notification
 * @returns {Object} The notification object with id and close method
 */
function show(message, type = 'info', options = {}) {
  // Merge default config with provided options
  const config = {
    ...defaultConfig,
    ...options
  };
  
  // Get the appropriate container
  const container = config.container || getContainer(config.position);
  
  // Create notification element
  const notification = document.createElement('div');
  const id = `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  notification.id = id;
  notification.className = `notification notification-${type}`;
  notification.setAttribute('role', 'alert');
  notification.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
  
  // Add message content
  const messageEl = document.createElement('div');
  messageEl.className = 'notification-message';
  messageEl.innerHTML = message;
  notification.appendChild(messageEl);
  
  // Add close button
  const closeButton = document.createElement('button');
  closeButton.className = 'notification-close';
  closeButton.innerHTML = '&times;';
  closeButton.setAttribute('aria-label', 'Close notification');
  notification.appendChild(closeButton);
  
  // Add notification to container
  container.appendChild(notification);
  
  // Ensure we don't exceed max visible notifications
  const visibleNotifications = container.querySelectorAll('.notification:not(.notification-removing)');
  if (visibleNotifications.length > config.maxVisible) {
    // Remove oldest notification
    const oldest = visibleNotifications[0];
    removeNotification(oldest);
  }
  
  // Create the notification object
  const notificationObj = {
    id,
    element: notification,
    close: () => removeNotification(notification)
  };
  
  // Add to active notifications
  notifications.add(notificationObj);
  
  // Setup close button event
  closeButton.addEventListener('click', (e) => {
    e.stopPropagation();
    notificationObj.close();
  });
  
  // Setup click to close if enabled
  if (config.closeOnClick) {
    notification.addEventListener('click', () => {
      notificationObj.close();
    });
  }
  
  // Handle auto-close with duration
  if (config.duration > 0) {
    setTimeout(() => {
      // Only close if the notification still exists
      if (notifications.has(notificationObj)) {
        notificationObj.close();
      }
    }, config.duration);
  }
  
  // Trigger animation after insertion to ensure CSS transition works
  setTimeout(() => {
    notification.classList.add('notification-visible');
  }, 10);
  
  return notificationObj;
}

/**
 * Remove a notification with animation
 * @param {HTMLElement} notification - The notification element to remove
 */
function removeNotification(notification) {
  if (!notification) return;
  
  // Add removing class to start the fade-out animation
  notification.classList.add('notification-removing');
  notification.classList.remove('notification-visible');
  
  // Remove from DOM after animation completes
  setTimeout(() => {
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification);
    }
    
    // Remove from active notifications
    for (const notif of notifications) {
      if (notif.element === notification || notif.id === notification.id) {
        notifications.delete(notif);
        break;
      }
    }
    
    // If the container is empty, remove it
    const container = notification.parentNode;
    if (container && container.children.length === 0) {
      if (container.classList.contains('notification-container')) {
        document.body.removeChild(container);
      }
    }
  }, defaultConfig.animationDuration);
}

/**
 * Remove all active notifications
 */
function clearAll() {
  // Create a copy to avoid issues with Set mutation during iteration
  const activeNotifications = Array.from(notifications);
  
  // Close each notification
  activeNotifications.forEach(notification => {
    notification.close();
  });
}

// Helper methods for common notification types
const info = (message, options) => show(message, 'info', options);
const success = (message, options) => show(message, 'success', options);
const warning = (message, options) => show(message, 'warning', options);
const error = (message, options) => show(message, 'error', options);

// Export the notification API
export default {
  show,
  info,
  success,
  warning,
  error,
  clearAll
};
