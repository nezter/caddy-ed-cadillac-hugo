const jwt = require('jsonwebtoken');
const errorHandler = require('./error-handler');
const DatabaseService = require('./database-service');
const { isTokenBlacklisted } = require('../sales-logout');
const { isUsableSecret, isUnconfiguredContext } = require('./jwt-secret');

// JWT configuration.
//
// This used to `throw` at require time when JWT_SECRET was unset. That 500s
// the whole function, and ~35 functions require this module, so one missing
// env var took out the entire surface with an opaque stack trace. An unset
// secret is a configuration error, not a programming error, and it is checked
// per request below so the caller gets a message that says so.
//
// It is NOT thrown here, unlike in customer-auth.js and sales-login.js, and the
// difference is deliberate: this module is required by every function whether or
// not it authenticates anything, so a load-time throw here is the failure mode
// this comment describes. The signers can afford to refuse to load; the
// verifier cannot.
//
// The "is this secret usable" rule itself lives in utils/jwt-secret.js, shared
// with both signers, because three copies of one security predicate is three
// places to forget.
const JWT_SECRET = process.env.JWT_SECRET || '';


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
      // If this context has no usable signing key, signing in cannot possibly
      // work, so "Authentication token required" is a false invitation -- it
      // tells the caller to do something that will not help. Say what is
      // actually wrong.
      //
      // This is the deploy-preview / branch-deploy / netlify dev case, and it is
      // a server error (503), not a client one. Getting this distinction right is
      // the whole point of the context scoping in netlify.toml: the preview
      // fails closed, and it fails legibly.
      if (isUnconfiguredContext()) {
        return {
          authenticated: false,
          error: errorHandler.serverError(
            'This context has no JWT signing key configured, so no token can be ' +
              'valid here. Previews and branch deploys deliberately run without ' +
              'one so they cannot touch production. Set a real JWT_SECRET if this ' +
              'context needs to authenticate.'
          )
        };
      }
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

    // Guard BEFORE verifying, not after.
    //
    // This read `jwt.verify(authToken, JWT_SECRET)` and only then checked
    // `if (!JWT_SECRET)`. The configuration check was downstream of the
    // operation it was guarding, so with no secret set the middleware verified
    // against an empty string first and only reported misconfiguration if that
    // happened to succeed. Order is the whole check.
    //
    // A marker value is treated exactly as unset. netlify.toml sets
    // JWT_SECRET="deploy-preview-not-configured" on deploy previews and branch
    // deploys so that a pull request preview provably cannot validate tokens
    // minted with the production secret. Honouring the marker is what makes
    // that guard real; ignoring it would leave the marker decorative and a
    // preview would quietly accept production tokens.
    if (!isUsableSecret(JWT_SECRET)) {
      return {
        authenticated: false,
        error: errorHandler.serverError(
          'Server is misconfigured: JWT_SECRET is not set'
        )
      };
    }

    // Verify JWT token
    const decodedToken = jwt.verify(authToken, JWT_SECRET);

    // RFC 7519 puts the subject in `sub`. scripts/generate-test-jwt.js signs
    // `sub`; this line read `decodedToken.userId`. Every generated token
    // therefore authenticated as `undefined`, and every call 401'd with "User
    // account is no longer active" -- an error that blames the account rather
    // than the token, which is why it went unnoticed.
    // Read `sub`, fall back to `userId` so a token already issued with that
    // claim keeps working.
    const userId = decodedToken.sub || decodedToken.userId;

    // The role and permission checks below read the DATABASE row, not the
    // token. A token's `permissions` claim is decorative and never consulted;
    // generate-test-jwt.js grants an array that looks load-bearing and is not.
    const user = await DatabaseService.getSalesRep(userId);
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