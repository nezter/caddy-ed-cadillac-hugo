const jwt = require('jsonwebtoken');
const errorHandler = require('./utils/error-handler');
const DatabaseService = require('./utils/database-service');

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

/**
 * Sales Authentication Check
 * Verifies if a sales representative is authenticated
 */
exports.handler = async function(event, context) {
  // Only allow GET requests
  if (event.httpMethod !== 'GET') {
    return errorHandler.forbiddenError('Method not allowed');
  }

  try {
    // Check for authentication token in cookies or headers
    const authToken = event.headers.authorization?.replace('Bearer ', '') ||
                      event.headers['x-auth-token'] ||
                      getCookieValue(event.headers.cookie, 'auth_token');

    if (!authToken) {
      return errorHandler.createSuccessResponse({
        authenticated: false,
        message: 'No authentication token provided'
      });
    }

    // Validate JWT token
    let decodedToken;
    try {
      decodedToken = jwt.verify(authToken, JWT_SECRET);
    } catch (tokenError) {
      if (tokenError.name === 'TokenExpiredError') {
        return errorHandler.createSuccessResponse({
          authenticated: false,
          message: 'Authentication token has expired'
        });
      } else {
        return errorHandler.createSuccessResponse({
          authenticated: false,
          message: 'Invalid authentication token'
        });
      }
    }

    // Verify user still exists and is active
    const user = await DatabaseService.getSalesRep(decodedToken.userId);
    if (!user || user.status !== 'active') {
      return errorHandler.createSuccessResponse({
        authenticated: false,
        message: 'User account is no longer active'
      });
    }

    // Return authenticated user data
    return errorHandler.createSuccessResponse({
      authenticated: true,
      user: {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        role: user.role,
        permissions: user.permissions || ['view_customers', 'manage_leads', 'schedule_appointments']
      }
    });

  } catch (error) {
    console.error('Auth check error:', error);
    return errorHandler.serverError('Authentication check failed', error);
  }
};

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