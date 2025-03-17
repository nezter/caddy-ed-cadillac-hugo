/**
 * Error handling utilities for Netlify Functions
 */

// Standard error codes
const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  SERVER_ERROR: 'SERVER_ERROR',
  API_ERROR: 'API_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
};

/**
 * Create a standardized error response
 * @param {string} code - Error code from ERROR_CODES
 * @param {string} message - User-friendly error message
 * @param {any} details - Additional error details (optional, for logging)
 * @param {number} statusCode - HTTP status code to return
 * @returns {Object} Formatted error response object
 */
function createErrorResponse(code, message, details = null, statusCode = 400) {
  const errorResponse = {
    statusCode,
    body: JSON.stringify({
      success: false,
      error: {
        code: code,
        message: message,
      },
      timestamp: new Date().toISOString()
    }),
    headers: {
      'Content-Type': 'application/json'
    }
  };

  // Only include details in non-production environments
  if (process.env.NODE_ENV !== 'production' && details) {
    const bodyObj = JSON.parse(errorResponse.body);
    bodyObj.error.details = details;
    errorResponse.body = JSON.stringify(bodyObj);
  }

  // Log error details
  logError(code, message, details);

  return errorResponse;
}

/**
 * Log error information
 * @param {string} code - Error code
 * @param {string} message - Error message
 * @param {any} details - Error details
 */
function logError(code, message, details) {
  const errorLog = {
    timestamp: new Date().toISOString(),
    code,
    message
  };

  if (details) {
    if (details instanceof Error) {
      errorLog.details = {
        name: details.name,
        message: details.message,
        stack: details.stack,
      };
    } else {
      errorLog.details = details;
    }
  }

  // Log to console (in production, this would go to a proper logging service)
  console.error('API Error:', JSON.stringify(errorLog));
}

/**
 * Handle validation errors
 * @param {string} message - User-friendly error message
 * @param {Object} validationErrors - Field-specific validation errors
 * @returns {Object} Error response
 */
function validationError(message, validationErrors) {
  return createErrorResponse(
    ERROR_CODES.VALIDATION_ERROR,
    message || 'Validation error occurred',
    validationErrors,
    400
  );
}

/**
 * Handle not found errors
 * @param {string} message - User-friendly error message
 * @param {any} details - Additional details
 * @returns {Object} Error response
 */
function notFoundError(message, details) {
  return createErrorResponse(
    ERROR_CODES.NOT_FOUND,
    message || 'Resource not found',
    details,
    404
  );
}

/**
 * Handle unauthorized errors
 * @param {string} message - User-friendly error message
 * @returns {Object} Error response
 */
function unauthorizedError(message) {
  return createErrorResponse(
    ERROR_CODES.UNAUTHORIZED,
    message || 'Authentication required',
    null,
    401
  );
}

/**
 * Handle forbidden errors
 * @param {string} message - User-friendly error message
 * @returns {Object} Error response
 */
function forbiddenError(message) {
  return createErrorResponse(
    ERROR_CODES.FORBIDDEN,
    message || 'Access denied',
    null,
    403
  );
}

/**
 * Handle server errors
 * @param {string} message - User-friendly error message
 * @param {Error|any} error - Error object or details
 * @returns {Object} Error response
 */
function serverError(message, error) {
  return createErrorResponse(
    ERROR_CODES.SERVER_ERROR,
    message || 'An unexpected error occurred',
    error,
    500
  );
}

/**
 * Handle external API errors
 * @param {string} message - User-friendly error message
 * @param {any} apiResponse - API response details
 * @returns {Object} Error response
 */
function apiError(message, apiResponse) {
  return createErrorResponse(
    ERROR_CODES.API_ERROR,
    message || 'External API error',
    apiResponse,
    502
  );
}

/**
 * Handle network errors
 * @param {string} message - User-friendly error message
 * @param {any} details - Additional details
 * @returns {Object} Error response
 */
function networkError(message, details) {
  return createErrorResponse(
    ERROR_CODES.NETWORK_ERROR,
    message || 'Network error occurred',
    details,
    503
  );
}

/**
 * Create a success response
 * @param {any} data - Response data
 * @param {string} message - Optional success message
 * @returns {Object} Success response
 */
function createSuccessResponse(data, message = null) {
  const response = {
    success: true,
    data
  };

  if (message) {
    response.message = message;
  }

  return {
    statusCode: 200,
    body: JSON.stringify(response),
    headers: {
      'Content-Type': 'application/json'
    }
  };
}

module.exports = {
  ERROR_CODES,
  createErrorResponse,
  createSuccessResponse,
  validationError,
  notFoundError,
  unauthorizedError,
  forbiddenError,
  serverError,
  apiError,
  networkError  // Add this to exports
};
