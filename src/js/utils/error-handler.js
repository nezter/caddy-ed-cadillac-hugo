/**
 * Error Handler Utility
 * 
 * This utility provides standardized error handling for API responses across
 * the frontend components. It includes functions for parsing errors, displaying
 * user-friendly messages, and providing recovery options.
 */

/**
 * Parses API error responses into a standardized format
 * @param {Response|Error|Object} error - The error object from a fetch call or other source
 * @return {Object} Standardized error object
 */
export function parseApiError(error) {
  // Default error structure
  const standardError = {
    type: 'unknown',
    status: 0,
    message: 'An unknown error occurred',
    details: null,
    originalError: error,
    timestamp: new Date().toISOString(),
  };

  try {
    // Handle network errors (e.g., offline, server unreachable)
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return {
        ...standardError,
        type: 'network',
        message: 'Network error. Please check your connection and try again.',
      };
    }

    // Handle Response objects from fetch
    if (error instanceof Response || (error && error.status && error.json)) {
      standardError.status = error.status;
      
      // Handle different status codes
      switch (error.status) {
        case 400:
          standardError.type = 'validation';
          standardError.message = 'The submitted data is invalid. Please check your entries and try again.';
          break;
        case 401:
          standardError.type = 'authentication';
          standardError.message = 'Authentication is required to perform this action.';
          break;
        case 403:
          standardError.type = 'authorization';
          standardError.message = 'You don\'t have permission to perform this action.';
          break;
        case 404:
          standardError.type = 'notFound';
          standardError.message = 'The requested resource was not found.';
          break;
        case 422:
          standardError.type = 'validation';
          standardError.message = 'The submitted data is invalid. Please check your entries and try again.';
          break;
        case 429:
          standardError.type = 'rateLimit';
          standardError.message = 'You\'ve made too many requests. Please try again later.';
          break;
        case 500:
        case 502:
        case 503:
        case 504:
          standardError.type = 'server';
          standardError.message = 'The server encountered an error. Please try again later.';
          break;
        default:
          standardError.type = 'api';
          standardError.message = 'An error occurred while processing your request.';
      }

      // Try to extract more details from the response body if available
      if (error.data) {
        if (error.data.message) {
          standardError.message = error.data.message;
        }
        if (error.data.errors) {
          standardError.details = error.data.errors;
        }
      }

      return standardError;
    }

    // Handle standard error objects
    if (error instanceof Error) {
      return {
        ...standardError,
        type: 'javascript',
        message: error.message || standardError.message,
      };
    }

    // Handle API error responses that are already parsed as JSON
    if (error && typeof error === 'object') {
      // If it's our standard API error format
      if (error.status && error.message) {
        return {
          ...standardError,
          type: error.type || 'api',
          status: error.status,
          message: error.message,
          details: error.errors || error.details || null,
        };
      }
    }

    // Return default standardized error if nothing else matched
    return standardError;
  } catch (parsingError) {
    // If error parsing itself fails, return a generic error
    console.error('Error while parsing error:', parsingError);
    return standardError;
  }
}

/**
 * Extracts field-level validation errors from API response
 * @param {Object} apiError - Parsed API error object
 * @return {Object} Object with field names as keys and error messages as values
 */
export function extractValidationErrors(apiError) {
  const fieldErrors = {};
  
  if (!apiError.details) return fieldErrors;

  try {
    // Handle array of validation errors
    if (Array.isArray(apiError.details)) {
      apiError.details.forEach(detail => {
        if (detail.field && detail.message) {
          fieldErrors[detail.field] = detail.message;
        }
      });
    } 
    // Handle object with field keys
    else if (typeof apiError.details === 'object') {
      Object.keys(apiError.details).forEach(field => {
        const message = apiError.details[field];
        if (typeof message === 'string') {
          fieldErrors[field] = message;
        } else if (Array.isArray(message) && message.length > 0) {
          fieldErrors[field] = message[0]; // Take the first error message
        }
      });
    }
  } catch (err) {
    console.error('Error extracting validation errors:', err);
  }

  return fieldErrors;
}

/**
 * Gets user-friendly message for an error
 * @param {Object} parsedError - Standardized error object
 * @param {Object} options - Configuration options for message formatting
 * @return {String} User-friendly error message
 */
export function getUserMessage(parsedError, options = {}) {
  // Default options
  const config = {
    includeDetails: false,
    maxLength: 150,
    ...options
  };

  let message = parsedError.message || 'An unexpected error occurred.';

  // Include additional details if requested and available
  if (config.includeDetails && parsedError.details) {
    if (typeof parsedError.details === 'string') {
      message += ` ${parsedError.details}`;
    }
  }

  // Truncate if needed
  if (config.maxLength && message.length > config.maxLength) {
    message = message.substring(0, config.maxLength) + '...';
  }

  return message;
}

/**
 * Displays an error message in a specified target element
 * @param {String|Element} target - CSS selector or DOM element where message should appear
 * @param {String} message - Error message to display
 * @param {Object} options - Display options (classes, timeout, etc.)
 */
export function displayErrorMessage(target, message, options = {}) {
  // Default options
  const config = {
    className: 'error-message',
    timeout: 0, // 0 = no auto-hide
    closeButton: true,
    ...options
  };

  // Get target element
  const targetEl = typeof target === 'string' ? document.querySelector(target) : target;
  
  if (!targetEl) {
    console.error(`Target element not found: ${target}`);
    return;
  }
  
  // Create error message element
  const errorElement = document.createElement('div');
  errorElement.className = config.className;
  
  // Add message
  const messageElement = document.createElement('p');
  messageElement.textContent = message;
  errorElement.appendChild(messageElement);
  
  // Add close button if requested
  if (config.closeButton) {
    const closeButton = document.createElement('button');
    closeButton.textContent = '×';
    closeButton.className = 'error-close';
    closeButton.setAttribute('aria-label', 'Close error message');
    closeButton.addEventListener('click', () => {
      errorElement.remove();
    });
    errorElement.appendChild(closeButton);
  }
  
  // Add to DOM
  targetEl.appendChild(errorElement);
  
  // Set auto-hide timeout if specified
  if (config.timeout > 0) {
    setTimeout(() => {
      if (errorElement.parentNode) {
        errorElement.remove();
      }
    }, config.timeout);
  }
  
  return errorElement;
}

/**
 * Displays field-level validation errors in a form
 * @param {Element} form - The form element containing fields with errors
 * @param {Object} fieldErrors - Object with field names as keys and error messages as values
 */
export function displayFieldErrors(form, fieldErrors) {
  if (!form || !fieldErrors) return;

  // Clear any existing error messages
  const existingErrors = form.querySelectorAll('.field-error-message');
  existingErrors.forEach(el => el.remove());

  // Display each field error
  Object.keys(fieldErrors).forEach(fieldName => {
    const field = form.querySelector(`[name="${fieldName}"]`);
    if (!field) return;
    
    // Mark field as invalid
    field.setAttribute('aria-invalid', 'true');
    
    // Create error message element
    const errorEl = document.createElement('div');
    errorEl.className = 'field-error-message';
    errorEl.textContent = fieldErrors[fieldName];
    errorEl.id = `${fieldName}-error`;
    
    // Connect error message to field with aria-describedby
    field.setAttribute('aria-describedby', errorEl.id);
    
    // Insert error after the field
    if (field.parentNode) {
      field.parentNode.insertBefore(errorEl, field.nextSibling);
    }
  });
}

/**
 * Creates a retry function that can be called after an error
 * @param {Function} originalFn - The original function that failed
 * @param {Object} options - Retry options (max attempts, delay, etc.)
 * @return {Function} A function that will retry the original function
 */
export function createRetryFunction(originalFn, options = {}) {
  // Default options
  const config = {
    maxAttempts: 3,
    delay: 1000,
    backoffFactor: 2,
    onRetry: null, // Callback before each retry
    ...options
  };
  
  let attempts = 0;
  
  return async function retry(...args) {
    try {
      attempts++;
      
      // Call original function
      return await originalFn(...args);
    } catch (error) {
      // If we've reached max attempts, rethrow
      if (attempts >= config.maxAttempts) {
        throw error;
      }
      
      // Calculate delay with exponential backoff
      const currentDelay = config.delay * Math.pow(config.backoffFactor, attempts - 1);
      
      // Call onRetry callback if provided
      if (typeof config.onRetry === 'function') {
        config.onRetry(attempts, currentDelay, error);
      }
      
      // Wait for delay
      await new Promise(resolve => setTimeout(resolve, currentDelay));
      
      // Retry
      return retry(...args);
    }
  };
}

/**
 * Preserves form data to prevent loss during errors
 * @param {Element} form - Form element containing user data
 */
export function preserveFormData(form) {
  if (!form || !form.id || !window.sessionStorage) {
    return false;
  }

  try {
    const formData = new FormData(form);
    const dataToSave = {};
    
    // Convert FormData to a simple object
    formData.forEach((value, key) => {
      // Skip file inputs as they can't be serialized easily
      const field = form.querySelector(`[name="${key}"]`);
      if (field && field.type !== 'file') {
        dataToSave[key] = value;
      }
    });
    
    // Add timestamp to prevent using very old data
    dataToSave.__timestamp = Date.now();
    
    // Save to session storage
    sessionStorage.setItem(`form_${form.id}`, JSON.stringify(dataToSave));
    return true;
  } catch (err) {
    console.error('Error preserving form data:', err);
    return false;
  }
}

/**
 * Restores previously preserved form data
 * @param {Element} form - Form element to populate with saved data
 * @param {Object} options - Options for restoration
 * @return {Boolean} True if data was restored, false otherwise
 */
export function restoreFormData(form, options = {}) {
  if (!form || !form.id || !window.sessionStorage) {
    return false;
  }

  // Default options
  const config = {
    maxAge: 3600000, // 1 hour in milliseconds
    clearAfterRestore: true,
    ...options
  };

  try {
    // Get saved data
    const savedDataStr = sessionStorage.getItem(`form_${form.id}`);
    if (!savedDataStr) {
      return false;
    }
    
    const savedData = JSON.parse(savedDataStr);
    
    // Check if data is too old
    if (savedData.__timestamp && 
        Date.now() - savedData.__timestamp > config.maxAge) {
      sessionStorage.removeItem(`form_${form.id}`);
      return false;
    }
    
    // Populate form fields
    Object.keys(savedData).forEach(key => {
      if (key === '__timestamp') return; // Skip timestamp
      
      const field = form.querySelector(`[name="${key}"]`);
      if (!field) return;
      
      // Handle different field types
      if (field.type === 'checkbox' || field.type === 'radio') {
        field.checked = savedData[key] === 'on' || 
                         savedData[key] === true || 
                         savedData[key] === field.value;
      } else {
        field.value = savedData[key];
      }
    });
    
    // Clear storage if requested
    if (config.clearAfterRestore) {
      sessionStorage.removeItem(`form_${form.id}`);
    }
    
    return true;
  } catch (err) {
    console.error('Error restoring form data:', err);
    return false;
  }
}

/**
 * Logs an error to the console and/or analytics service
 * @param {Object} error - Error object to log
 * @param {String} context - Additional context information
 * @param {Object} options - Logging options
 */
export function logError(error, context = '', options = {}) {
  // Default options
  const config = {
    logToConsole: true,
    logToAnalytics: false,
    includeSensitiveData: false,
    ...options
  };

  // Standardize the error
  const standardError = error.type ? error : parseApiError(error);
  
  // Prepare error data for logging
  const errorData = {
    type: standardError.type,
    message: standardError.message,
    status: standardError.status,
    timestamp: new Date().toISOString(),
    context,
    url: window.location.href
  };

  // Include stack trace if available
  if (standardError.originalError && standardError.originalError.stack) {
    errorData.stack = standardError.originalError.stack;
  }

  // Remove sensitive data unless explicitly requested
  if (!config.includeSensitiveData && standardError.details) {
    // Create a shallow copy to avoid modifying the original error
    errorData.details = { ...standardError.details };
    
    // Remove potentially sensitive fields
    const sensitiveFields = ['password', 'token', 'credit_card', 'ssn', 'email'];
    sensitiveFields.forEach(field => {
      if (errorData.details[field]) {
        errorData.details[field] = '[REDACTED]';
      }
    });
  } else if (config.includeSensitiveData) {
    errorData.details = standardError.details;
  }

  // Log to console
  if (config.logToConsole) {
    console.group(`Error: ${errorData.message}`);
    console.error('Context:', context);
    console.error('Details:', errorData);
    if (standardError.originalError) {
      console.error('Original error:', standardError.originalError);
    }
    console.groupEnd();
  }

  // Log to analytics (if available and requested)
  if (config.logToAnalytics && typeof window.gtag === 'function') {
    try {
      window.gtag('event', 'error', {
        'event_category': 'error',
        'event_label': `${errorData.type}: ${errorData.message}`,
        'value': errorData.status,
        'non_interaction': true
      });
    } catch (e) {
      console.error('Failed to log error to analytics:', e);
    }
  }

  return errorData;
}
