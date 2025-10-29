const errorHandler = require('./utils/error-handler');
const { authenticateRequest } = require('./utils/auth-middleware');

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
    const authResult = await authenticateRequest(event, { requireAuth: false });

    if (!authResult.authenticated) {
      return errorHandler.createSuccessResponse({
        authenticated: false,
        message: authResult.error?.body ? JSON.parse(authResult.error.body).message : 'Not authenticated'
      });
    }

    // Return authenticated user data
    return errorHandler.createSuccessResponse({
      authenticated: true,
      user: authResult.user
    });

  } catch (error) {
    console.error('Auth check error:', error);
    return errorHandler.serverError('Authentication check failed');
  }
};

