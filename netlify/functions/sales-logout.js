const errorHandler = require('./utils/error-handler');
const { authenticateRequest } = require('./utils/auth-middleware');

// Simple in-memory token blacklist (in production, use Redis or database)
const tokenBlacklist = new Set();

// Clean up expired tokens periodically (basic implementation)
setInterval(() => {
  // In a real implementation, you'd check expiration times
  // For now, we'll clear the blacklist periodically
  if (tokenBlacklist.size > 1000) {
    tokenBlacklist.clear();
  }
}, 60 * 60 * 1000); // Clear every hour

/**
 * Sales Logout API
 * Handles user logout and token invalidation
 */
exports.handler = async function(event, context) {
  // Allow both POST and GET for logout
  if (!['POST', 'GET'].includes(event.httpMethod)) {
    return errorHandler.forbiddenError('Method not allowed');
  }

  try {
    // Extract token for blacklisting
    const authToken = event.headers.authorization?.replace('Bearer ', '') ||
                     event.headers['x-auth-token'];

    if (authToken) {
      // Add token to blacklist
      tokenBlacklist.add(authToken);

      // In production, you'd want to store this in Redis/database with expiration
      // For now, we'll use a simple in-memory set with periodic cleanup
    }

    return errorHandler.createSuccessResponse({
      loggedOut: true,
      message: 'Successfully logged out'
    }, 'Logout successful');

  } catch (error) {
    console.error('Logout error:', error);
    return errorHandler.serverError('Logout failed');
  }
};

/**
 * Check if token is blacklisted
 * @param {string} token - JWT token to check
 * @returns {boolean} - True if token is blacklisted
 */
function isTokenBlacklisted(token) {
  return tokenBlacklist.has(token);
}

module.exports = {
  isTokenBlacklisted
};