/**
 * Sales Logout API
 * Handles user logout and token invalidation.
 *
 * TWO contract bugs were fixed here. Both were fatal, not cosmetic:
 *
 * 1. `module.exports = { isTokenBlacklisted }` at the bottom of the old file
 *    REPLACED the module's export object, so the `exports.handler` assigned at
 *    the top of the file was thrown away. Netlify could not find a handler and
 *    this function was dead on arrival -- which is why "nothing has ever been
 *    able to sign out" as well as "nothing has ever been able to sign in".
 *    Both `handler` and `isTokenBlacklisted` are exported now.
 *
 * 2. The old file required ./utils/auth-middleware, and auth-middleware requires
 *    THIS file (line 4, for isTokenBlacklisted). That is a require cycle, and
 *    the outcome depended on which side Node loaded first: the loser sees a
 *    half-populated module.exports, so `isTokenBlacklisted` is `undefined` and
 *    auth-middleware's `isTokenBlacklisted(authToken)` throws. That throw lands
 *    inside its own try/catch, so it is reported as "Invalid authentication
 *    token" -- i.e. a perfectly valid session is rejected, silently. The import
 *    was never used, so requiring auth-middleware here is now gone and the
 *    dependency runs one way only (auth-middleware -> sales-logout).
 */
const errorHandler = require('./utils/error-handler');

// The middleware accepts a token from three places (auth-middleware.js:29-31).
// Logout has to look in exactly the same three places, or it fails to revoke
// the very token the middleware would have accepted.
const AUTH_COOKIE = 'auth_token';

// Simple in-memory token blacklist (in production, use Redis or database).
//
// THIS DOES NOT REVOKE ANYTHING, AND IT CANNOT. Proven, not assumed: Netlify
// bundles each function into its OWN esbuild output, so every function that
// reaches this file gets its own inlined copy of this Set. In a local probe:
//
//   md5 .netlify/functions-serve/sales-logout/netlify/functions/sales-logout.js
//       61bde2397851687ac6882a845cb16a14
//   md5 .netlify/functions-serve/sales-auth-check/netlify/functions/sales-auth-check.js
//       0dbf07dd90b0353f6de60140616463cb
//
// Different files, different `new Set()`. `sales-logout` adds to its own; the
// `isTokenBlacklisted` that `auth-middleware` calls inside a DIFFERENT function
// reads a different one, which is always empty. Curl proof, below the fix:
//
//   POST sales-logout      -> {"loggedOut":true,"tokenRevoked":true}
//   GET  sales-auth-check  -> {"authenticated":true, ... same token ...}
//
// The endpoint reports `tokenRevoked: true` because this function cannot know it
// did not. The flag is kept ONLY because it distinguishes "you had no token" from
// "you had one"; do not read it as a guarantee.
//
// It is kept rather than deleted because it is a correct no-op in the
// single-bundle case (a local `node` invocation, a test) and removing it would
// mean also removing the `auth-middleware` call site, which is out of this
// change's scope.
//
// WHAT ACTUALLY BOUNDS A STOLEN TOKEN: the JWT's own `exp` claim -- 8h, from
// JWT_EXPIRES_IN. Revocation on sign-out needs shared state (Redis, or a
// `revoked_tokens` table). Until that exists, "sign out" means "this browser
// forgets the token", which is the half that protects the person at the
// keyboard and NOT the half that protects a copy of the token. This is the
// single most important thing in this report.
const tokenBlacklist = new Set();

// Clean up expired tokens periodically (basic implementation)
const cleanupTimer = setInterval(() => {
  // In a real implementation, you'd check expiration times
  // For now, we'll clear the blacklist periodically
  if (tokenBlacklist.size > 1000) {
    tokenBlacklist.clear();
  }
}, 60 * 60 * 1000); // Clear every hour
// A bare setInterval keeps the Node event loop (and therefore the Lambda
// invocation) alive forever. unref() lets the process exit as soon as the
// handler's response has been written. Guarded because the timer handle is not
// unref-able in every runtime.
if (typeof cleanupTimer.unref === 'function') cleanupTimer.unref();

/**
 * Extract a token from the request using the middleware's precedence order.
 */
function extractToken(event) {
  const headers = event.headers || {};
  const authorization = headers.authorization || headers.Authorization || '';
  if (authorization.startsWith('Bearer ')) return authorization.slice(7).trim();
  if (headers['x-auth-token']) return headers['x-auth-token'];
  return getCookieValue(headers.cookie, AUTH_COOKIE);
}

/**
 * Helper function to extract cookie value
 */
function getCookieValue(cookieString, cookieName) {
  if (!cookieString) return null;

  for (const cookie of cookieString.split(';')) {
    const [name, ...rest] = cookie.trim().split('=');
    if (name === cookieName) {
      return decodeURIComponent(rest.join('='));
    }
  }
  return null;
}

/**
 * Sales Logout API
 * Handles user logout and token invalidation
 */
const handler = async function (event) {
  // Allow both POST and GET for logout
  if (!['POST', 'GET'].includes(event.httpMethod)) {
    return errorHandler.forbiddenError('Method not allowed');
  }

  try {
    // Extract token for blacklisting
    const authToken = extractToken(event);

    if (authToken) {
      // In production, you'd want to store this in Redis/database with expiration
      // For now, we'll use a simple in-memory set with periodic cleanup
      tokenBlacklist.add(authToken);
    }

    const response = errorHandler.createSuccessResponse(
      {
        loggedOut: true,
        message: 'Successfully logged out',
        // Whether a token was PRESENT to revoke. Read the comment on
        // `tokenBlacklist` before treating this as a guarantee: it is not one.
        tokenRevoked: Boolean(authToken),
      },
      'Logout successful'
    );

    return {
      ...response,
      headers: {
        ...response.headers,
        // Belt and braces: the front end stores the token in localStorage and
        // clears it there, but the middleware also accepts an `auth_token`
        // cookie, so expire that too rather than leaving a live credential
        // sitting in the jar. Matching attributes (Path/SameSite) are required
        // or the browser keeps the original.
        'Set-Cookie': `${AUTH_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly`,
        // Never cache a response that reports on credential state.
        'Cache-Control': 'no-store',
      },
    };
  } catch (error) {
    console.error('Logout error:', error);
    return errorHandler.serverError('Logout failed');
  }
};

/**
 * Check if token is blacklisted.
 *
 * Only ever true within THIS bundle's own Set. See the comment on
 * `tokenBlacklist`: across separately-bundled functions this always answers
 * false, so it is not a security control today.
 *
 * @param {string} token - JWT token to check
 * @returns {boolean} - True if token is blacklisted
 */
function isTokenBlacklisted(token) {
  return tokenBlacklist.has(token);
}

// `exports.handler = ...` followed by `module.exports = {...}` is the bug that
// killed this function; assign both onto the same export object.
exports.handler = handler;
exports.isTokenBlacklisted = isTokenBlacklisted;
