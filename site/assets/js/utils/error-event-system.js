/**
 * Global Error Event System
 * 
 * This module provides a central system for handling errors across the application.
 * It connects the error handler utility with the global notification system.
 */

import { parseApiError, logError } from './error-handler';
import Notification from '../components/notification';

// Event names
const EVENTS = {
  ERROR: 'app:error',
  API_ERROR: 'app:api-error',
  NETWORK_ERROR: 'app:network-error',
  VALIDATION_ERROR: 'app:validation-error'
};

// Default error notification options
const defaultOptions = {
  position: 'top-right',
  duration: 7000,
  notifyUser: true,
  logToConsole: true,
  logToAnalytics: false
};

/**
 * Dispatch an error event
 * @param {string} eventName - The name of the event to dispatch
 * @param {Object} data - The error data to include in the event
 * @returns {boolean} Whether the event was canceled by any listeners
 */
function dispatchErrorEvent(eventName, data) {
  const event = new CustomEvent(eventName, {
    detail: data,
    cancelable: true, // Allow the event to be canceled by listeners
    bubbles: true // Allow the event to bubble up
  });
  
  return document.dispatchEvent(event);
}

/**
 * Handle an error with the global error system
 * @param {Error|Response|Object} error - The error that occurred
 * @param {string} context - Context information about where the error occurred
 * @param {Object} options - Configuration options
 * @returns {Object} The parsed error object
 */
function handleError(error, context = '', options = {}) {
  // Merge options with defaults
  const config = {
    ...defaultOptions,
    ...options
  };
  
  // Parse the error into a standardized format
  const parsedError = error.type ? error : parseApiError(error);
  
  // Add context information
  parsedError.context = context;
  
  // Log the error if requested
  if (config.logToConsole) {
    logError(parsedError, context, {
      logToConsole: true,
      logToAnalytics: config.logToAnalytics
    });
  }
  
  // Dispatch the appropriate event based on error type
  let eventName = EVENTS.ERROR;
  
  switch (parsedError.type) {
    case 'network':
      eventName = EVENTS.NETWORK_ERROR;
      break;
    case 'validation':
      eventName = EVENTS.VALIDATION_ERROR;
      break;
    case 'api':
    case 'server':
    case 'authentication':
    case 'authorization':
      eventName = EVENTS.API_ERROR;
      break;
  }
  
  // Dispatch the error event
  const wasHandled = !dispatchErrorEvent(eventName, parsedError);
  
  // If the event wasn't handled by any listeners and notification is requested,
  // show a notification to the user
  if (!wasHandled && config.notifyUser) {
    displayErrorNotification(parsedError, config);
  }
  
  return parsedError;
}

/**
 * Display an error notification to the user
 * @param {Object} parsedError - The parsed error object
 * @param {Object} options - Notification options
 */
function displayErrorNotification(parsedError, options) {
  // Different treatments based on error type
  switch (parsedError.type) {
    case 'network':
      Notification.warning(
        `<strong>Connection Issue</strong><p>${parsedError.message}</p>`, 
        { duration: 0 } // No auto-hide for network errors
      );
      break;
    
    case 'validation':
      // Validation errors are typically displayed inline with forms,
      // so we don't show a notification unless explicitly requested
      if (options.notifyValidationErrors) {
        Notification.warning(
          `<strong>Validation Error</strong><p>${parsedError.message}</p>`,
          { duration: 5000 }
        );
      }
      break;
    
    case 'authentication':
    case 'authorization':
      Notification.error(
        `<strong>Access Error</strong><p>${parsedError.message}</p>`,
        { duration: 10000 }
      );
      break;
      
    case 'server':
      Notification.error(
        `<strong>Server Error</strong><p>${parsedError.message}</p>`,
        { duration: 10000 }
      );
      break;
      
    default:
      Notification.error(
        `<strong>Error</strong><p>${parsedError.message}</p>`,
        { duration: options.duration }
      );
  }
}

/**
 * Register a listener for specific error types
 * @param {string} errorType - The type of error to listen for (use EVENTS constants)
 * @param {Function} handler - The handler function
 */
function onError(errorType, handler) {
  document.addEventListener(errorType, handler);
}

/**
 * Remove a previously registered error listener
 * @param {string} errorType - The type of error that was being listened for
 * @param {Function} handler - The handler function to remove
 */
function offError(errorType, handler) {
  document.removeEventListener(errorType, handler);
}

// Export the error event system API
export default {
  handleError,
  onError,
  offError,
  EVENTS
};
