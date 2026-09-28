const jwt = require('jsonwebtoken');
const errorHandler = require('./error-handler');
const DatabaseService = require('./database-service');
const { isTokenBlacklisted } = require('../sales-logout');
const { verifyIdentityToken, rolesFrom } = require('./netlify-identity');
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

  // Extract the auth token from wherever it was presented.
  //
  // Header lookup is case-INSENSITIVE. HTTP header names are case-insensitive by
  // specification, and Netlify's runtime happens to deliver them lowercased --
  // but this line read `event.headers.authorization` alone, so any caller that
  // arrived with `Authorization` (every hand-rolled test, any other runtime,
  // anything invoking the handler directly) was silently treated as
  // unauthenticated.
  //
  // That is not a cosmetic bug. "Unauthenticated" and "rejected" are the same
  // 401, so a test asserting rejection passed whether the token was missing or
  // merely spelled differently -- which is exactly how a whole suite here came
  // to pass 8 of 31 for the wrong reason while never exercising the
  // authorisation path at all.
  const headers = event.headers || {};
  const headerValue = (name) => {
    const wanted = name.toLowerCase();
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === wanted) return headers[key];
    }
    return undefined;
  };

  const authorization = headerValue('authorization');

  // Only the Bearer scheme is a token. The scheme is case-insensitive --
  // `bearer`, `Bearer` and `BeArEr` are all the same scheme, and RFC 7235 says
  // the client should not have to care.
  //
  // This used to strip a leading `bearer` and then accept WHATEVER was left,
  // which meant an `Authorization: Basic dXNlcjpwYXNz` header was handed to
  // jwt.verify as if the base64 blob were a token. It would fail to verify, so
  // nothing leaked -- but the wrong thing was happening for the wrong reason,
  // and a header that is not a token should not reach the verifier at all. A
  // request carrying Basic credentials is a request with no bearer token, and
  // saying so plainly is what the caller needs.
  const bearerToken = (() => {
    if (!authorization) return '';
    const match = String(authorization).match(/^\s*bearer\s+(.*)$/i);
    return match ? match[1].trim() : '';
  })();

  const authToken = bearerToken ||
                   headerValue('x-auth-token') ||
                   getCookieValue(headerValue('cookie'), 'auth_token');

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
  /*
   * Netlify Identity is tried FIRST, and deliberately.
   *
   * Identity is Netlify's own user store, so it works before any database
   * exists. The bespoke JWT below cannot: verifying it needs JWT_SECRET, and the
   * account lookup behind it needs a database. With no database configured the
   * bespoke scheme made the whole admin unreachable -- ten pages behind a door
   * with no key.
   *
   * Identity also brings password reset, invitations, MFA and session
   * revocation, none of which a hand-rolled JWT had.
   *
   * The bespoke scheme is still accepted, so an existing token keeps working
   * during the move. Nothing has to happen in one step.
   */
  const identityClaims = await verifyIdentityToken(authToken);
  if (identityClaims) {
    return applyIdentity(identityClaims);
  }

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

    // The payload has to be an object, and it has to name somebody.
    //
    // Neither was checked. `jwt.verify` will hand back whatever decoded, so a
    // payload that is a bare string -- or an object with no subject -- sailed
    // through, `userId` came out `undefined`, and the code went on to ask the
    // database for the account with id `undefined`. In production that returns
    // no rows and the request is refused, so nothing was granted. But the
    // refusal was an accident of the query, not a decision, and a token with no
    // subject is exactly the token a forged one would carry.
    //
    // Checked explicitly, before the database is involved, so that "this token
    // does not identify anyone" is answered as itself rather than as a
    // coincidental miss in a lookup.
    if (!decodedToken || typeof decodedToken !== 'object' || Array.isArray(decodedToken)) {
      return {
        authenticated: false,
        error: errorHandler.unauthorizedError('Invalid authentication token')
      };
    }

    // RFC 7519 puts the subject in `sub`. scripts/generate-test-jwt.js signs
    // `sub`; this line read `decodedToken.userId`. Every generated token
    // therefore authenticated as `undefined`, and every call 401'd with "User
    // account is no longer active" -- an error that blames the account rather
    // than the token, which is why it went unnoticed.
    // Read `sub`, fall back to `userId` so a token already issued with that
    // claim keeps working.
    const userId = decodedToken.sub || decodedToken.userId;

    if (typeof userId !== 'string' || userId.trim() === '') {
      return {
        authenticated: false,
        error: errorHandler.unauthorizedError('Invalid authentication token')
      };
    }

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
    // Log what ACTUALLY failed before deciding what to say.
    //
    // This catch has spanned the whole body of the function, so it has caught
    // far more than bad tokens: a database that is not configured, a
    // `getSalesRep` that rejects, a missing export, a bug in the role check. All
    // of those were reported to the caller as "Invalid authentication token",
    // which is a lie in the direction that costs the most time -- it tells the
    // operator to go and rotate a token when the token was fine and the data
    // layer was down. It also meant the only way to find the real cause was to
    // read this source, which is why a live sign-in break could sit here
    // uninvestigated.
    //
    // The response is unchanged -- an unverified caller still gets a 401 and no
    // detail about the server's internals. The detail goes to the log, where it
    // belongs. Expiry stays its own message because that one really is about the
    // token and the user can act on it.
    console.error('[auth-middleware] authentication failed:', tokenError && tokenError.stack ? tokenError.stack : tokenError);

    if (tokenError && tokenError.name === 'TokenExpiredError') {
      return {
        authenticated: false,
        error: errorHandler.unauthorizedError('Authentication token has expired')
      };
    }
    return {
      authenticated: false,
      error: errorHandler.unauthorizedError('Invalid authentication token')
    };
  }
}

/**
 * Optional authentication: same verification, but a bad token is anonymous
 * rather than an error.
 *
 * The distinction that matters is between "this request carried no token" and
 * "this request carried a token that does not hold up". The first is a normal
 * state for an endpoint whose whole job is to answer a yes/no question --
 * sales-auth-check is asked "am I signed in?" by every page on load, and a 401
 * there is a console error for every first-time visitor. The second is a real
 * problem, but on an optional endpoint it still only means "not signed in".
 *
 * Note what this does NOT do. It does not skip verification: a token that is
 * present and valid is still verified and still resolved to the live account
 * row, and one that is revoked or forged is still refused. It reports the
 * refusal as anonymous instead of as a 401, because the caller asked a question
 * and "no" is an answer.
 *
 * Every endpoint that returns customer data calls with the default
 * requireAuth: true and does get a 401.
 */
async function optionalAuthenticateRequest(event, options = {}) {
  const result = await authenticateRequest(event, { ...options, requireAuth: false });
  if (result.authenticated) return result;
  // An error here means a token WAS presented and did not survive. Collapse it
  // to the anonymous answer, but keep the reason available in the log rather
  // than in the response.
  if (result.error) {
    const body = readMessage(result.error);
    if (body) console.warn(`[auth-middleware] optional auth: presenting token rejected (${body})`);
  }
  return { authenticated: false, user: null };
}

/** Pull the message out of an errorHandler response, which has a JSON string body. */
function readMessage(errorResponse) {
  if (!errorResponse || typeof errorResponse.body !== 'string') return null;
  try {
    return JSON.parse(errorResponse.body).message || null;
  } catch {
    return null;
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


  /**
   * Turn a verified Identity claim set into the same shape the rest of this
   * module returns, and apply the role/permission rules to it.
   *
   * The shape is deliberately identical to the database path's, so every
   * function downstream keeps working whether the caller signed in through
   * Identity or through the bespoke JWT. Nothing above this point needs to know
   * which happened.
   *
   * ONE DIFFERENCE, DELIBERATE: the database path re-reads the account on every
   * request, so a rep whose permissions are withdrawn loses access immediately.
   * Identity has no such re-read -- the role lives in the token's app_metadata
   * until it is refreshed. So a permission change takes effect when the token
   * is next refreshed rather than instantly. That is the trade for having a door
   * that opens without a database, and it is a normal one for a token-based
   * system; Identity's own admin can revoke a user outright, which does take
   * effect at once.
   */
  async function applyIdentity(claims) {
    const roles = rolesFrom(claims);
    const user = {
      id: claims.sub,
      firstName: (claims.user_metadata && claims.user_metadata.full_name) || '',
      lastName: '',
      email: claims.email || '',
      role: roles[0] || 'viewer',
      permissions: roles.includes('admin') ? ['*'] : roles,
      status: 'active',
      provider: 'netlify-identity',
    };

    if (allowedRoles.length > 0 && !allowedRoles.some((r) => roles.includes(String(r).toLowerCase()))) {
      return {
        authenticated: false,
        error: errorHandler.forbiddenError('Insufficient permissions')
      };
    }

    if (requiredPermissions.length > 0) {
      const held = new Set(user.permissions);
      // An admin holds everything. Spelling that out here means an admin does not
      // have to be granted each individual permission by hand.
      const hasAll = requiredPermissions.every(
        (perm) => held.has(perm) || held.has('*') || roles.includes('admin')
      );
      if (!hasAll) {
        return {
          authenticated: false,
          error: errorHandler.forbiddenError('Insufficient permissions')
        };
      }
    }

    return { authenticated: true, user };
  }

module.exports = {
  authenticateRequest,
  optionalAuthenticateRequest,
  checkRateLimit
};