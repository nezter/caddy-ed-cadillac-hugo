/**
 * Error handler utilities for Netlify functions
 */

/**
 * Generic error response
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Error message
 * @param {Error} error - Original error object (optional)
 * @returns {Object} - Netlify function response object
 */
function errorResponse(statusCode, message, error = null) {
  console.error(`[Error ${statusCode}]`, message, error);
  
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      success: false,
      message,
      errorCode: statusCode,
      // Include error details in development
      ...(process.env.NODE_ENV !== 'production' && error && {
        errorDetails: error.message,
        stack: error.stack
      })
    })
  };
}

/**
 * Bad request error (400)
 * @param {string} message - Error message
 * @param {Error} error - Original error (optional)
 * @returns {Object} - Netlify function response
 */
function badRequestError(message = 'Bad request', error = null) {
  return errorResponse(400, message, error);
}

/**
 * Unauthorized error (401)
 * @param {string} message - Error message
 * @param {Error} error - Original error (optional)
 * @returns {Object} - Netlify function response
 */
function unauthorizedError(message = 'Unauthorized', error = null) {
  return errorResponse(401, message, error);
}

/**
 * Forbidden error (403)
 * @param {string} message - Error message
 * @param {Error} error - Original error (optional)
 * @returns {Object} - Netlify function response
 */
function forbiddenError(message = 'Forbidden', error = null) {
  return errorResponse(403, message, error);
}

/**
 * Not found error (404)
 * @param {string} message - Error message
 * @param {Error} error - Original error (optional)
 * @returns {Object} - Netlify function response
 */
function notFoundError(message = 'Resource not found', error = null) {
  return errorResponse(404, message, error);
}

/**
 * Server error (500)
 * @param {string} message - Error message
 * @param {Error} error - Original error (optional)
 * @returns {Object} - Netlify function response
 */
function serverError(message = 'Internal server error', error = null) {
  return errorResponse(500, message, error);
}

/**
 * Validation error (400)
 * @param {string} message - Error message
 * @param {Object} fieldErrors - Object with field-specific errors
 * @returns {Object} - Netlify function response
 */
function validationError(message = 'Validation failed', fieldErrors = {}) {
  console.error('[Validation Error]', message, fieldErrors);

  return {
    statusCode: 400,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      success: false,
      message,
      errorCode: 400,
      validationErrors: fieldErrors,
      // Include error details in development
      ...(process.env.NODE_ENV !== 'production' && {
        errorDetails: message,
        fieldErrors: fieldErrors
      })
    })
  };
}

/**
 * Success response
 * @param {any} data - Response data
 * @param {string} message - Success message
 * @returns {Object} - Netlify function response
 */
function createSuccessResponse(data = null, message = 'Success') {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      success: true,
      message,
      data,
      timestamp: new Date().toISOString()
    })
  };
}

module.exports = {
  badRequestError,
  unauthorizedError,
  forbiddenError,
  notFoundError,
  serverError,
  validationError,
  createSuccessResponse
};
