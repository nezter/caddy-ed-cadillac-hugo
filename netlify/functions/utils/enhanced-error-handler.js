/**
 * Enhanced Error Handler with Structured Logging and PII Masking
 * Provides comprehensive error handling with security features
 */

/**
 * PII detection and masking patterns
 */
const piiPatterns = {
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  phone: /\b(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})\b/g,
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
  creditCard: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
  ipAddress: /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g,
  address: /\d+\s+[\w\s]+,\s*[\w\s]+,\s*[A-Z]{2}\s*\d{5}/gi
};

/**
 * Sensitive field names to mask
 */
const sensitiveFields = [
  'password', 'passwd', 'secret', 'token', 'key', 'auth',
  'credit_card', 'ssn', 'social_security', 'bank_account',
  'routing_number', 'pin', 'cvv', 'cvc', 'security_code'
];

/**
 * Mask PII from text
 * @param {string} text - Text to mask
 * @returns {string} - Masked text
 */
function maskPII(text) {
  if (typeof text !== 'string') {
    return text;
  }

  let masked = text;

  // Mask email addresses
  masked = masked.replace(piiPatterns.email, (match) => {
    const [username, domain] = match.split('@');
    const maskedUsername = username.length > 2 
      ? username.charAt(0) + '*'.repeat(username.length - 2) + username.charAt(username.length - 1)
      : '*'.repeat(username.length);
    return `${maskedUsername}@${domain}`;
  });

  // Mask phone numbers
  masked = masked.replace(piiPatterns.phone, (match) => {
    return match.replace(/\d/g, (digit, index) => {
      // Keep first 3 and last 2 digits
      return index < 3 || index >= match.length - 2 ? digit : '*';
    });
  });

  // Mask SSN
  masked = masked.replace(piiPatterns.ssn, '***-**-****');

  // Mask credit cards
  masked = masked.replace(piiPatterns.creditCard, (match) => {
    return match.replace(/\d/g, (digit, index) => {
      // Keep first 4 and last 4 digits
      return index < 4 || index >= match.length - 4 ? digit : '*';
    });
  });

  // Mask IP addresses (partial)
  masked = masked.replace(piiPatterns.ipAddress, (match) => {
    const parts = match.split('.');
    return `${parts[0]}.${parts[1]}.*.*`;
  });

  // Mask addresses
  masked = masked.replace(piiPatterns.address, '*** ADDRESS ***');

  return masked;
}

/**
 * Mask PII in objects recursively
 * @param {any} data - Data to mask
 * @returns {any} - Masked data
 */
function maskObjectPII(data) {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'string') {
    return maskPII(data);
  }

  if (Array.isArray(data)) {
    return data.map(item => maskObjectPII(item));
  }

  if (typeof data === 'object') {
    const masked = {};
    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();
      
      // Check if field is sensitive
      const isSensitive = sensitiveFields.some(field => lowerKey.includes(field));
      
      if (isSensitive && value) {
        masked[key] = typeof value === 'string' ? '*'.repeat(value.length) : '***';
      } else {
        masked[key] = maskObjectPII(value);
      }
    }
    return masked;
  }

  return data;
}

/**
 * Structured logger with PII masking
 */
class StructuredLogger {
  constructor() {
    this.isDevelopment = process.env.NODE_ENV === 'development' || 
                       process.env.CONTEXT === 'dev' ||
                       process.env.CONTEXT === 'branch-deploy';
  }

  /**
   * Log error with structured format
   * @param {Error} error - Error object
   * @param {Object} context - Additional context
   * @param {Object} request - Request information
   */
  logError(error, context = {}, request = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      service: 'followup-system',
      error: {
        name: error.name,
        message: error.message,
        code: error.code,
        stack: this.isDevelopment ? error.stack : undefined
      },
      context: maskObjectPII(context),
      request: {
        method: request.httpMethod,
        path: request.path,
        userAgent: request.headers?.['user-agent'],
        ip: this.maskIP(request.headers?.['x-forwarded-for'] || request.requestContext?.identity?.sourceIp)
      },
      environment: process.env.NODE_ENV || 'unknown',
      version: process.env.NETLIFY_BUILD_VERSION || 'unknown'
    };

    // Log to console (in production, this would go to a logging service)
    console.error(JSON.stringify(logEntry));

    // In production, you might also send to external logging service
    if (!this.isDevelopment) {
      this.sendToLoggingService(logEntry);
    }
  }

  /**
   * Log warning with structured format
   * @param {string} message - Warning message
   * @param {Object} context - Additional context
   */
  logWarning(message, context = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: 'WARNING',
      service: 'followup-system',
      message,
      context: maskObjectPII(context),
      environment: process.env.NODE_ENV || 'unknown'
    };

    console.warn(JSON.stringify(logEntry));
  }

  /**
   * Log info with structured format
   * @param {string} message - Info message
   * @param {Object} context - Additional context
   */
  logInfo(message, context = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: 'INFO',
      service: 'followup-system',
      message,
      context: maskObjectPII(context),
      environment: process.env.NODE_ENV || 'unknown'
    };

    console.log(JSON.stringify(logEntry));
  }

  /**
   * Partially mask IP address for logging
   * @param {string} ip - IP address
   * @returns {string} - Masked IP
   */
  maskIP(ip) {
    if (!ip) return 'unknown';
    
    const parts = ip.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.*.*`;
    }
    return ip.substring(0, ip.length / 2) + '*';
  }

  /**
   * Send log to external logging service (placeholder)
   * @param {Object} logEntry - Log entry
   */
  async sendToLoggingService(logEntry) {
    // In production, integrate with services like:
    // - AWS CloudWatch Logs
    // - DataDog
    // - Loggly
    // - Papertrail
    // - Sentry (for errors)
    
    try {
      // Example: Send to CloudWatch Logs
      // const AWS = require('aws-sdk');
      // const cloudwatchlogs = new AWS.CloudWatchLogs();
      // await cloudwatchlogs.putLogEvents({...}).promise();
      
      console.log('Would send to logging service:', logEntry.timestamp);
    } catch (error) {
      console.error('Failed to send log to external service:', error);
    }
  }
}

// Create singleton logger instance
const logger = new StructuredLogger();

/**
 * Enhanced error response with structured logging
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Error message
 * @param {Error} error - Original error object
 * @param {Object} context - Additional context
 * @param {Object} request - Request information
 * @returns {Object} - Netlify function response
 */
function enhancedErrorResponse(statusCode, message, error = null, context = {}, request = {}) {
  // Log the error with structured format
  logger.logError(error || new Error(message), {
    statusCode,
    message,
    context
  }, request);

  // Determine error category
  const errorCategory = categorizeError(statusCode, error);

  // Create safe response
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
      'X-Error-Category': errorCategory
    },
    body: JSON.stringify({
      success: false,
      message: sanitizeErrorMessage(message),
      errorCode: statusCode,
      errorCategory,
      timestamp: new Date().toISOString(),
      requestId: request.requestContext?.requestId,
      // Only include detailed error info in development
      ...(isDevelopment && {
        errorDetails: {
          name: error?.name,
          message: error?.message,
          stack: error?.stack
        }
      })
    })
  };
}

/**
 * Categorize errors for better monitoring
 * @param {number} statusCode - HTTP status code
 * @param {Error} error - Error object
 * @returns {string} - Error category
 */
function categorizeError(statusCode, error) {
  if (statusCode === 429) return 'rate_limit';
  if (statusCode === 401) return 'authentication';
  if (statusCode === 403) return 'authorization';
  if (statusCode === 404) return 'not_found';
  if (statusCode === 400) return 'validation';
  if (statusCode === 413) return 'payload_too_large';
  
  // Server errors
  if (error?.name === 'ValidationError') return 'validation';
  if (error?.name === 'DatabaseError') return 'database';
  if (error?.name === 'NetworkError') return 'network';
  if (error?.name === 'TimeoutError') return 'timeout';
  
  return 'server_error';
}

/**
 * Sanitize error messages to prevent information leakage
 * @param {string} message - Original error message
 * @returns {string} - Sanitized message
 */
function sanitizeErrorMessage(message) {
  if (!message || typeof message !== 'string') {
    return 'An error occurred';
  }

  // Remove potential sensitive information
  let sanitized = message;

  // Remove database details
  sanitized = sanitized.replace(/database\s+[^,\s]+/gi, 'database');
  sanitized = sanitized.replace(/table\s+[`"']?[\w]+[`"']?/gi, 'table');
  sanitized = sanitized.replace(/column\s+[`"']?[\w]+[`"']?/gi, 'column');

  // Remove file paths
  sanitized = sanitized.replace(/\/[\w\/\.-]+/g, '/path/to/file');
  sanitized = sanitized.replace(/[A-Z]:\\[\w\\\/\.-]+/g, 'C:\\path\\to\\file');

  // Remove internal stack traces
  sanitized = sanitized.split('\n')[0]; // Only keep first line

  // Remove potential SQL injection traces
  sanitized = sanitized.replace(/(union|select|insert|update|delete|drop|create|alter)/gi, '[SQL]');

  return sanitized.trim();
}

/**
 * Enhanced validation error
 * @param {string} message - Error message
 * @param {Object} fieldErrors - Field-specific errors
 * @param {Object} request - Request information
 * @returns {Object} - Netlify function response
 */
function enhancedValidationError(message = 'Validation failed', fieldErrors = {}, request = {}) {
  logger.logWarning('Validation error', {
    message,
    fieldErrors
  });

  return {
    statusCode: 400,
    headers: {
      'Content-Type': 'application/json',
      'X-Error-Category': 'validation'
    },
    body: JSON.stringify({
      success: false,
      message,
      errorCode: 400,
      errorCategory: 'validation',
      validationErrors: maskObjectPII(fieldErrors),
      timestamp: new Date().toISOString(),
      requestId: request.requestContext?.requestId
    })
  };
}

/**
 * Enhanced success response
 * @param {any} data - Response data
 * @param {string} message - Success message
 * @param {Object} meta - Additional metadata
 * @returns {Object} - Netlify function response
 */
function enhancedSuccessResponse(data = null, message = 'Success', meta = {}) {
  logger.logInfo('Request completed successfully', {
    message,
    dataType: Array.isArray(data) ? 'array' : typeof data,
    dataSize: data ? JSON.stringify(data).length : 0
  });

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      success: true,
      message,
      data: maskObjectPII(data),
      meta: {
        timestamp: new Date().toISOString(),
        ...meta
      }
    })
  };
}

module.exports = {
  // Main error handling functions
  enhancedErrorResponse,
  enhancedValidationError,
  enhancedSuccessResponse,
  
  // Utilities
  maskPII,
  maskObjectPII,
  sanitizeErrorMessage,
  categorizeError,
  
  // Logger
  logger
};