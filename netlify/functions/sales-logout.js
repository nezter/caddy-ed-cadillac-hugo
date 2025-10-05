const errorHandler = require('./utils/error-handler');

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
    // In a stateless JWT system, logout is primarily handled on the client side
    // by removing the token from storage. Server-side token blacklisting would
    // require additional infrastructure (Redis, database table, etc.)

    // For now, we just return success and let the client handle token removal
    return errorHandler.createSuccessResponse({
      loggedOut: true,
      message: 'Successfully logged out'
    }, 'Logout successful');

  } catch (error) {
    console.error('Logout error:', error);
    return errorHandler.serverError('Logout failed', error);
  }
};