/**
 * Security Middleware
 * Provides security headers, rate limiting, and security utilities
 */

const { addCorsHeaders, corsHeaders } = require('./cors-middleware');
const { checkRateLimit } = require('./auth-middleware');

/**
 * Comprehensive security headers for production
 */
const securityHeaders = {
  // Content Security Policy
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
    "img-src 'self' data: https: blob:",
    "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com",
    "connect-src 'self' https://api.supabase.co https://*.supabase.co",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests"
  ].join('; '),

  // Other security headers
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': [
    'camera=()',
    'microphone=()',
    'geolocation=()',
    'payment=()',
    'usb=()',
    'magnetometer=()',
    'gyroscope=()',
    'accelerometer=()'
  ].join(', '),
  
  // Cache control for API responses
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0',

  // Remove server information
  'Server': 'Netlify',
  'X-Powered-By': '',

  // HSTS (HTTPS only)
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload'
};

/**
 * Development security headers (relaxed for development)
 */
const developmentHeaders = {
  ...securityHeaders,
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
    "img-src 'self' data: https: blob:",
    "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com",
    "connect-src 'self' https://api.supabase.co https://*.supabase.co ws: wss:",
    "frame-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'"
  ].join('; '),
  
  // Remove HSTS in development
  'Strict-Transport-Security': undefined
};

/**
 * Get appropriate headers based on environment
 */
function getSecurityHeaders() {
  const isDevelopment = process.env.NODE_ENV === 'development' || 
                       process.env.CONTEXT === 'dev' ||
                       process.env.CONTEXT === 'branch-deploy';
  
  return isDevelopment ? developmentHeaders : securityHeaders;
}

/**
 * Apply security headers to response
 * @param {Object} response - Netlify function response
 * @returns {Object} - Response with security headers
 */
function addSecurityHeaders(response) {
  const headers = getSecurityHeaders();
  
  // Filter out undefined headers
  const filteredHeaders = Object.entries(headers).reduce((acc, [key, value]) => {
    if (value !== undefined) {
      acc[key] = value;
    }
    return acc;
  }, {});

  return {
    ...response,
    headers: {
      ...response.headers,
      ...corsHeaders,
      ...filteredHeaders
    }
  };
}

/**
 * Security middleware for Netlify functions
 * @param {Object} event - Netlify function event
 * @param {Object} options - Security options
 * @param {boolean} options.enableRateLimit - Enable rate limiting
 * @param {number} options.maxRequests - Max requests per window
 * @param {number} options.windowMs - Time window in milliseconds
 * @param {string} options.rateLimitKey - Custom rate limit key
 * @returns {Object} - Security check result
 */
async function applySecurity(event, options = {}) {
  const {
    enableRateLimit = true,
    maxRequests = 100,
    windowMs = 60000, // 1 minute
    rateLimitKey = null
  } = options;

  // Handle CORS preflight
  const corsResponse = require('./cors-middleware').handleCors(event);
  if (corsResponse) {
    return addSecurityHeaders(corsResponse);
  }

  // Rate limiting
  if (enableRateLimit) {
    const identifier = rateLimitKey || 
                     event.headers['x-forwarded-for'] || 
                     event.headers['x-real-ip'] || 
                     event.requestContext?.identity?.sourceIp || 
                     'anonymous';

    const rateLimitResult = checkRateLimit(identifier, maxRequests, windowMs);
    
    if (!rateLimitResult.allowed) {
      const response = {
        statusCode: 429,
        body: JSON.stringify({
          error: 'Too Many Requests',
          message: `Rate limit exceeded. Try again in ${Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000)} seconds.`,
          retryAfter: Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000),
          remaining: rateLimitResult.remaining
        }),
        headers: {
          'Retry-After': Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000),
          'X-RateLimit-Limit': maxRequests,
          'X-RateLimit-Remaining': rateLimitResult.remaining,
          'X-RateLimit-Reset': new Date(rateLimitResult.resetTime).toISOString()
        }
      };
      
      return addSecurityHeaders(response);
    }

    // Add rate limit headers to successful responses
    event.rateLimitHeaders = {
      'X-RateLimit-Limit': maxRequests,
      'X-RateLimit-Remaining': rateLimitResult.remaining,
      'X-RateLimit-Reset': new Date(rateLimitResult.resetTime).toISOString()
    };
  }

  return null; // No security issues, continue processing
}

/**
 * Validate request size
 * @param {Object} event - Netlify function event
 * @param {number} maxSize - Maximum size in bytes
 * @returns {Object} - Validation result
 */
function validateRequestSize(event, maxSize = 1024 * 1024) { // 1MB default
  const contentLength = event.headers['content-length'];
  
  if (contentLength && parseInt(contentLength) > maxSize) {
    const response = {
      statusCode: 413,
      body: JSON.stringify({
        error: 'Payload Too Large',
        message: `Request size ${contentLength} bytes exceeds maximum allowed size of ${maxSize} bytes`
      })
    };
    
    return addSecurityHeaders(response);
  }
  
  return null;
}

/**
 * Sanitize response data to remove sensitive information
 * @param {Object} data - Response data
 * @returns {Object} - Sanitized data
 */
function sanitizeResponse(data) {
  if (!data || typeof data !== 'object') {
    return data;
  }

  // Fields to never expose in responses
  const sensitiveFields = [
    'password', 'password_hash', 'salt', 'secret', 'token',
    'api_key', 'private_key', 'credit_card', 'ssn',
    'internal_notes', 'system_logs'
  ];

  function removeSensitiveFields(obj) {
    if (Array.isArray(obj)) {
      return obj.map(removeSensitiveFields);
    }
    
    if (obj && typeof obj === 'object') {
      const sanitized = {};
      for (const [key, value] of Object.entries(obj)) {
        const lowerKey = key.toLowerCase();
        
        // Skip sensitive fields
        if (sensitiveFields.some(field => lowerKey.includes(field))) {
          continue;
        }
        
        // Recursively sanitize nested objects
        if (value && typeof value === 'object') {
          sanitized[key] = removeSensitiveFields(value);
        } else {
          sanitized[key] = value;
        }
      }
      return sanitized;
    }
    
    return obj;
  }

  return removeSensitiveFields(data);
}

/**
 * Create a secure response object
 * @param {number} statusCode - HTTP status code
 * @param {Object} body - Response body
 * @param {Object} headers - Additional headers
 * @returns {Object} - Secure response object
 */
function createSecureResponse(statusCode, body, headers = {}) {
  const response = {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  };

  // Add rate limit headers if available
  if (headers.rateLimitHeaders) {
    response.headers = {
      ...response.headers,
      ...headers.rateLimitHeaders
    };
    delete headers.rateLimitHeaders;
  }

  // Sanitize response data
  if (body && typeof body === 'object') {
    response.body = JSON.stringify(sanitizeResponse(body));
  } else {
    response.body = body;
  }

  return addSecurityHeaders(response);
}

/**
 * Security utility functions
 */
const securityUtils = {
  /**
   * Generate a secure random token
   * @param {number} length - Token length
   * @returns {string} - Secure token
   */
  generateSecureToken(length = 32) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    return result;
  },

  /**
   * Check if IP address is in private range
   * @param {string} ip - IP address
   * @returns {boolean} - True if private IP
   */
  isPrivateIP(ip) {
    const privateRanges = [
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^192\.168\./,
      /^127\./,
      /^169\.254\./,
      /^::1$/,
      /^fc00:/,
      /^fe80:/
    ];
    
    return privateRanges.some(range => range.test(ip));
  },

  /**
   * Validate email format with additional security checks
   * @param {string} email - Email to validate
   * @returns {boolean} - True if valid
   */
  isValidEmail(email) {
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    
    if (!emailRegex.test(email)) {
      return false;
    }
    
    // Additional security checks
    if (email.includes('..') || email.includes('./') || email.includes('.@')) {
      return false;
    }
    
    if (email.length > 254) { // RFC 5321 limit
      return false;
    }
    
    return true;
  }
};

module.exports = {
  // Main middleware functions
  applySecurity,
  addSecurityHeaders,
  validateRequestSize,
  createSecureResponse,
  
  // Utility functions
  sanitizeResponse,
  securityUtils,
  getSecurityHeaders
};