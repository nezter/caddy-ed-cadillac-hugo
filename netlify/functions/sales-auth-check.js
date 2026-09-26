const errorHandler = require('./utils/error-handler');
const { authenticateRequest } = require('./utils/auth-middleware');

// TOKEN CONTRACT: whatever sales-login handed out is replayed here as
// `Authorization: Bearer <token>` (or the `auth_token` cookie, or
// `x-auth-token` -- auth-middleware.js:29-31 accepts all three). Nothing is
// read from a query string: a token in a URL leaks into the browser history,
// the Referer header of every outbound link, and the access log.
//
// The response is wrapped by createSuccessResponse, so the flag the caller
// needs is at `body.data.authenticated`, NOT at `body.authenticated`. Reading
// the top level yields undefined, which is falsy, which reads as "signed out"
// to code that never looks at the reason. session-manager.js:126 and :252 both
// do exactly that.

/**
 * Sales Authentication Check
 * Verifies if a sales representative is authenticated
 */
exports.handler = async function(event) {
  // Only allow GET requests
  if (event.httpMethod !== 'GET') {
    return errorHandler.forbiddenError('Method not allowed');
  }

  try {
    // requireAuth: false is deliberate and NOT a hole. authenticateRequest
    // still verifies the signature, the expiry, the blacklist and the live
    // sales_reps row when a token is present; it just declines to manufacture
    // a 401 for a request that carried no token at all, because "am I signed
    // in?" is a question with a negative answer, not an error. Every function
    // that guards data (sales-customers, sales-appointments, ...) calls it with
    // the default requireAuth: true and does get a 401.
    const authResult = await authenticateRequest(event, { requireAuth: false });

    if (!authResult.authenticated) {
      // 200 on purpose. The caller asked a yes/no question; a 401 here would
      // make every page that probes on load log an error in the console for a
      // first-time visitor. `authenticated: false` is the answer.
      return withNoStore(
        errorHandler.createSuccessResponse({
          authenticated: false,
          message: readErrorMessage(authResult) || 'Not authenticated'
        }, 'Not authenticated')
      );
    }

    // Return authenticated user data
    return withNoStore(
      errorHandler.createSuccessResponse({
        authenticated: true,
        user: authResult.user
      }, 'Authenticated')
    );
  } catch (error) {
    console.error('Auth check error:', error);
    return withNoStore(errorHandler.serverError('Authentication check failed'));
  }
};

/**
 * Pull the human-readable reason out of an errorHandler response object.
 * authenticateRequest returns `{authenticated, error}` where `error` is already
 * a fully-formed Netlify response ({statusCode, headers, body-as-JSON-string}),
 * not an Error.
 */
function readErrorMessage(authResult) {
  if (!authResult.error || typeof authResult.error.body !== 'string') return null;
  try {
    return JSON.parse(authResult.error.body).message;
  } catch {
    return null;
  }
}

/**
 * This response describes the state of a credential. It must not be cached by
 * the browser, by a CDN, or by the service worker -- a cached "authenticated:
 * true" would outlive the session it describes.
 */
function withNoStore(response) {
  return {
    ...response,
    headers: {
      ...response.headers,
      'Cache-Control': 'no-store'
    }
  };
}
