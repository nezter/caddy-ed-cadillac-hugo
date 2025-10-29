const jwt = require('jsonwebtoken');
const errorHandler = require('./error-handler');
const DatabaseService = require('./database-service');
const { isTokenBlacklisted } = require('../sales-logout');

// JWT configuration - require JWT_SECRET to be set
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}
const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Authentication middleware for protecting API endpoints
 * @param {Object} event - Netlify function event
 * @param {Object} options - Middleware options
 * @param {boolean} options.requireAuth - Whether authentication is required (default: true)
 * @param {Array} options.requiredPermissions - Array of required permissions
 * @param {Array} options.allowedRoles - Array of allowed roles
 * @returns {Object} - Authentication result
 */
async function authenticateRequest(event, options = {}) {
  const {
    requireAuth = true,
    requiredPermissions = [],
    allowedRoles = []
  } = options;

  // Extract auth token from various sources
  const authToken = event.headers.authorization?.replace('Bearer ', '') ||
                   event.headers['x-auth-token'] ||
                   getCookieValue(event.headers.cookie, 'auth_token');

  if (!authToken) {
    if (requireAuth) {
      return {
        authenticated: false,
        error: errorHandler.unauthorizedError('Authentication token required')
      };
    }
    return { authenticated: false, user: null };
  }

  try {
    // Check if token is blacklisted
    if (isTokenBlacklisted(authToken)) {
      return {
        authenticated: false,
        error: errorHandler.unauthorizedError('Token has been revoked')
      };
    }

    // Verify JWT token
    const decodedToken = jwt.verify(authToken, JWT_SECRET);

    // Verify user still exists and is active
    const user = await DatabaseService.getSalesRep(decodedToken.userId);
    if (!user || user.status !== 'active') {
      return {
        authenticated: false,
        error: errorHandler.unauthorizedError('User account is no longer active')
      };
    }

    // Check role restrictions
    if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
      return {
        authenticated: false,
        error: errorHandler.forbiddenError('Insufficient permissions')
      };
    }

    // Check permission restrictions
    const userPermissions = user.permissions || [];
    if (requiredPermissions.length > 0) {
      const hasRequiredPermissions = requiredPermissions.every(perm => userPermissions.includes(perm));
      if (!hasRequiredPermissions) {
        return {
          authenticated: false,
          error: errorHandler.forbiddenError('Insufficient permissions')
        };
      }
    }

    return {
      authenticated: true,
      user: {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        role: user.role,
        permissions: userPermissions
      }
    };

  } catch (tokenError) {
    if (tokenError.name === 'TokenExpiredError') {
      return {
        authenticated: false,
        error: errorHandler.unauthorizedError('Authentication token has expired')
      };
    } else {
      return {
        authenticated: false,
        error: errorHandler.unauthorizedError('Invalid authentication token')
      };
    }
  }
}

/**
 * Helper function to extract cookie value
 */
function getCookieValue(cookieString, cookieName) {
  if (!cookieString) return null;

  const cookies = cookieString.split(';');
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === cookieName) {
      return decodeURIComponent(value);
    }
  }
  return null;
}

/**
 * Rate limiting helper (basic implementation)
 * In production, consider using Redis or a dedicated rate limiting service
 */
const rateLimitStore = new Map();

function checkRateLimit(identifier, maxRequests = 10, windowMs = 60000) {
  const now = Date.now();
  const key = `${identifier}`;

  if (!rateLimitStore.has(key)) {
    rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1 };
  }

  const limitData = rateLimitStore.get(key);

  if (now > limitData.resetTime) {
    // Reset the limit
    rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1 };
  }

  if (limitData.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetTime: limitData.resetTime };
  }

  limitData.count++;
  return { allowed: true, remaining: maxRequests - limitData.count };
}

module.exports = {
  authenticateRequest,
  checkRateLimit
};