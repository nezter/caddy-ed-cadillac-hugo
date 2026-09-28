/**
 * Unit tests: authentication middleware.
 *
 * WHAT THIS IS ACTUALLY ABOUT
 * ---------------------------
 * Two separate things, and the second is the one that matters:
 *
 *   1. The token -- signature, expiry, subject claim, and the ways a request
 *      can fail to present one.
 *   2. THE ACCOUNT. After the signature verifies, the middleware re-reads the
 *      user from the database and makes every authorisation decision from that
 *      row:
 *
 *          const user = await DatabaseService.getSalesRep(userId);
 *          if (!user || user.status !== 'active') { ... }
 *          if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) { ... }
 *          ...user.permissions...
 *
 *      Nothing about role or permissions is read from the token. A token's own
 *      `role` and `permissions` claims are decorative and never consulted.
 *
 * WHY THIS USED TO BE 20 FAILURES INSTEAD OF 31 PASSES
 * -------------------------------------------------------
 * These tests were written when the JWT carried the role, and set it there:
 *
 *      const token = createMockJWT({ role: 'admin' });
 *      expect(result.authenticated).toBe(true);
 *
 * The middleware reads the database instead, and the suite mocked no database,
 * so every lookup failed and every success path came back
 * `authenticated: false`. The rejection tests passed, because rejecting a bad
 * token never reaches the database -- which is why this looked like a broad
 * regression rather than one unmocked dependency.
 *
 * The file now mocks `getSalesRep` and sets role and permissions on the ROW,
 * which is where the middleware actually looks. The token carries identity and
 * nothing else.
 *
 * It also tests the property that design exists to provide: a token claiming
 * admin, against a row that is not admin, is refused. Under the old contract
 * that token would have been granted access.
 *
 * SHAPES, measured rather than assumed
 * -----------------------------------
 *   result          { authenticated, error? }  or  { authenticated, user }
 *   result.error    { statusCode, headers, body }
 *   result.error.body   a JSON STRING, not an object. Parse it.
 *   result.user     { id, firstName, lastName, email, role, permissions }
 *                    -- mapped from the row's snake_case, not the token's claims
 */

'use strict';

// Mocked before the middleware is required: the middleware captures
// DatabaseService at require time.
jest.mock('../../netlify/functions/utils/database-service', () => {
  const actual = jest.requireActual('../../netlify/functions/utils/database-service');
  return { __esModule: true, ...actual, getSalesRep: jest.fn() };
});

const {
  authenticateRequest,
  optionalAuthenticateRequest,
} = require('../../netlify/functions/utils/auth-middleware');
const DatabaseService = require('../../netlify/functions/utils/database-service');
const testUtils = require('../setup');

// The same physical jsonwebtoken the middleware loads, not whichever copy this
// file's own directory happens to resolve.
//
// jsonwebtoken is installed at the root AND nested under netlify/functions (its
// own package.json + lockfile, so npm does not hoist). The middleware requires
// the nested one; a bare require from tests/unit gets the root one. Requiring
// the root copy here handed back a REAL `verify`, so `verify.mockReturnValue`
// in the helper below threw "not a function" -- and before that, when the copy
// did line up, the mock was applied to a module the middleware never loaded, so
// the real verifier ran against the string 'mock-jwt-token' and every
// success-path test failed as "Invalid authentication token".
const { verify } = require(
  require.resolve('jsonwebtoken', {
    paths: [require.resolve('../../netlify/functions/package.json')],
  })
);

/** A sales_reps row as the database returns it. */
function dbUser(overrides = {}) {
  return {
    id: 'test-user-id',
    first_name: 'Test',
    last_name: 'User',
    email: 'test@example.com',
    role: 'admin',
    permissions: ['campaigns_read', 'campaigns_write'],
    status: 'active',
    ...overrides,
  };
}

/** The decoded payload the (mocked) verifier returns. */
function claims(overrides = {}) {
  return {
    sub: 'test-user-id',
    email: 'test@example.com',
    role: 'admin',
    permissions: ['campaigns_read', 'campaigns_write'],
    ...overrides,
  };
}

/**
 * Authorise a request.
 *
 *   payload   what the mocked verifier decodes the token to
 *   user      the row the mocked database returns for that subject
 *   _throws   make the verifier throw, for the signature/expiry cases
 */
async function authenticate({
  payload = claims(),
  user = dbUser(),
  options = {},
  // A VALID BEARER BY DEFAULT, not opt-in. An earlier version of this file
  // defaulted `headers` to empty, so a dozen tests that meant to exercise the
  // database lookup and the role checks were actually asserting "no token
  // supplied" -- and passing, for the wrong reason, in exactly the way the
  // suite had been passing before.
  headers = { Authorization: 'Bearer mock-jwt-token' },
  cookie,
  _throws,
} = {}) {
  if (_throws) {
    verify.mockImplementation(() => { throw _throws; });
  } else {
    verify.mockReturnValue(payload);
  }
  DatabaseService.getSalesRep.mockResolvedValue(user);
  const event = testUtils.createMockEvent();
  if (headers && headers.Authorization) event.headers.Authorization = headers.Authorization;
  if (cookie) event.headers.cookie = cookie;
  return authenticateRequest(event, options);
}

/** Bearer header for a token whose payload the mock will return. */
const BEARER = 'Bearer mock-jwt-token';

/** result.error.body is a JSON string. */
function bodyOf(error) {
  return JSON.parse(error.body);
}

describe('Authentication Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('the account decides access, not the token', () => {
    it('takes role and permissions from the row even when the token disagrees', async () => {
      // Token says sales_rep with no permissions. Row says admin with two. If
      // any of this came from the token these assertions would fail.
      const result = await authenticate({
        payload: claims({ role: 'sales_rep', permissions: [] }),
        user: dbUser({ role: 'admin' }),
      });

      expect(result.authenticated).toBe(true);
      expect(result.user.role).toBe('admin');
      expect(result.user.permissions).toEqual(['campaigns_read', 'campaigns_write']);
    });

    it('refuses a token claiming admin when the row is a sales rep', async () => {
      // The reason the row is re-read: a token minted while the rep was an admin
      // must not keep admin after the row says otherwise.
      const result = await authenticate({
        payload: claims({ role: 'admin' }),
        options: { allowedRoles: ['admin'] },
        user: dbUser({ role: 'sales_rep' }),
      });

      expect(result.authenticated).toBe(false);
      expect(result.error.statusCode).toBe(403);
    });

    it('refuses a deactivated account even with a valid token', async () => {
      const result = await authenticate({ user: dbUser({ status: 'suspended' }) });

      expect(result.authenticated).toBe(false);
      expect(result.error.statusCode).toBe(401);
      expect(bodyOf(result.error).message).toMatch(/no longer active/i);
    });

    it('refuses a valid token when the account no longer exists', async () => {
      const result = await authenticate({ user: null });

      expect(result.authenticated).toBe(false);
      expect(result.error.statusCode).toBe(401);
    });

    it('looks the account up by the `sub` claim', async () => {
      await authenticate({ payload: claims({ sub: 'rep-42' }) });

      expect(DatabaseService.getSalesRep).toHaveBeenCalledWith('rep-42');
    });

    it('maps the row onto the user it returns', async () => {
      const result = await authenticate({ user: dbUser({ first_name: 'Caddy', last_name: 'Ed' }) });

      expect(result.user).toEqual({
        id: 'test-user-id',
        firstName: 'Caddy',
        lastName: 'Ed',
        email: 'test@example.com',
        role: 'admin',
        permissions: ['campaigns_read', 'campaigns_write'],
      });
    });
  });

  describe('token validation', () => {
    it('authenticates a valid token', async () => {
      const result = await authenticate({ headers: { Authorization: BEARER } });

      expect(result.authenticated).toBe(true);
      expect(result.user.id).toBe('test-user-id');
    });

    it('rejects a missing Authorization header', async () => {
      // `headers: {}` explicitly, because the helper's default is a VALID
      // bearer. A bare `authenticate({})` supplies one, which is the opposite of
      // what this test is about -- it satisfied a 401 assertion while actually
      // exercising the success path.
      const result = await authenticate({ headers: {} });

      expect(result.authenticated).toBe(false);
      expect(result.error.statusCode).toBe(401);
    });

    it('rejects a malformed Authorization header', async () => {
      const result = await authenticate({ headers: { Authorization: 'InvalidFormat token' } });

      expect(result.authenticated).toBe(false);
      expect(result.error.statusCode).toBe(401);
    });

    it('rejects an unparseable token', async () => {
      // The throw is supplied rather than produced by the string on purpose.
      //
      // `jwt.verify` is mocked in this suite, and the mock returns valid claims
      // for whatever it is given. So a token that is genuinely not a JWT cannot
      // fail here by being malformed -- it fails because the verifier says so.
      // Real jsonwebtoken throws `JsonWebTokenError: jwt malformed` for
      // 'invalid.jwt.token'; that is the behaviour under test, reproduced.
      const malformed = new Error('jwt malformed');
      malformed.name = 'JsonWebTokenError';
      const result = await authenticate({
        headers: { Authorization: 'Bearer invalid.jwt.token' },
        _throws: malformed,
      });

      expect(result.authenticated).toBe(false);
      expect(result.error.statusCode).toBe(401);
    });

    it('reports an expired token as expired, not as invalid', async () => {
      const err = new Error('jwt expired');
      err.name = 'TokenExpiredError';
      const result = await authenticate({ headers: { Authorization: BEARER }, _throws: err });

      expect(result.authenticated).toBe(false);
      expect(bodyOf(result.error).message).toMatch(/expired/i);
    });

    it('rejects a token whose signature does not verify', async () => {
      const result = await authenticate({ headers: { Authorization: BEARER }, _throws: new Error('invalid signature') });

      expect(result.authenticated).toBe(false);
      expect(result.error.statusCode).toBe(401);
    });

    it('rejects a token that decodes to something that is not an object', async () => {
      verify.mockReturnValue('invalid-payload');
      DatabaseService.getSalesRep.mockResolvedValue(dbUser());
      const event = testUtils.createMockEvent();
      event.headers.Authorization = BEARER;

      const result = await authenticateRequest(event);

      expect(result.authenticated).toBe(false);
      expect(result.error.statusCode).toBe(401);
    });

    it('rejects a token with no subject claim', async () => {
      const result = await authenticate({
        payload: { email: 'nobody@example.com' },
        headers: { Authorization: BEARER },
      });

      expect(result.authenticated).toBe(false);
      expect(result.error.statusCode).toBe(401);
    });
  });

  describe('role restrictions', () => {
    it('allows a role on the list', async () => {
      const result = await authenticate({
        headers: { Authorization: BEARER },
        options: { allowedRoles: ['admin', 'manager'] },
        user: dbUser({ role: 'admin' }),
      });

      expect(result.authenticated).toBe(true);
    });

    it('allows the other role on the list', async () => {
      const result = await authenticate({
        headers: { Authorization: BEARER },
        options: { allowedRoles: ['admin', 'manager'] },
        user: dbUser({ role: 'manager' }),
      });

      expect(result.authenticated).toBe(true);
    });

    it('refuses a role that is not on the list', async () => {
      const result = await authenticate({
        headers: { Authorization: BEARER },
        options: { allowedRoles: ['admin', 'manager'] },
        user: dbUser({ role: 'sales_rep' }),
      });

      expect(result.authenticated).toBe(false);
      expect(result.error.statusCode).toBe(403);
    });

    it('allows any role when no roles are specified', async () => {
      const result = await authenticate({
        headers: { Authorization: BEARER },
        user: dbUser({ role: 'anything_at_all' }),
      });

      expect(result.authenticated).toBe(true);
    });
  });

  describe('permission restrictions', () => {
    it('allows a permission the row holds', async () => {
      const result = await authenticate({
        headers: { Authorization: BEARER },
        options: { requiredPermissions: ['campaigns_read'] },
        user: dbUser({ permissions: ['campaigns_read', 'campaigns_write'] }),
      });

      expect(result.authenticated).toBe(true);
    });

    it('allows when the row holds every required permission', async () => {
      const result = await authenticate({
        headers: { Authorization: BEARER },
        options: { requiredPermissions: ['campaigns_read', 'campaigns_write'] },
        user: dbUser({ permissions: ['campaigns_read', 'campaigns_write', 'analytics_read'] }),
      });

      expect(result.authenticated).toBe(true);
    });

    it('refuses when the row is missing a required permission', async () => {
      const result = await authenticate({
        headers: { Authorization: BEARER },
        options: { requiredPermissions: ['campaigns_write'] },
        user: dbUser({ permissions: ['campaigns_read'] }),
      });

      expect(result.authenticated).toBe(false);
      expect(result.error.statusCode).toBe(403);
    });

    it('refuses when the row has no permissions at all', async () => {
      const result = await authenticate({
        headers: { Authorization: BEARER },
        options: { requiredPermissions: ['campaigns_read'] },
        user: dbUser({ permissions: null }),
      });

      expect(result.authenticated).toBe(false);
      expect(result.error.statusCode).toBe(403);
    });

    it('refuses when the row has an empty permissions array', async () => {
      const result = await authenticate({
        headers: { Authorization: BEARER },
        options: { requiredPermissions: ['campaigns_read'] },
        user: dbUser({ permissions: [] }),
      });

      expect(result.authenticated).toBe(false);
      expect(result.error.statusCode).toBe(403);
    });
  });

  describe('optional authentication', () => {
    it('reports a request with no token as anonymous, not as authenticated', async () => {
      // `authenticated: true` with a null user is the shape this used to
      // assert, and it is a contradiction. sales-auth-check branches on
      // `!authResult.authenticated` to decide what to tell the browser, so a
      // true-with-no-user answer makes it report "Authenticated" with nothing
      // behind it. The honest answer to "am I signed in?" is no.
      const result = await authenticate({
        headers: {},
        options: { requireAuth: false },
      });

      expect(result.authenticated).toBe(false);
      expect(result.user).toBeNull();
    });

    it('still resolves the account when a valid token is present', async () => {
      const result = await authenticate({
        headers: { Authorization: BEARER },
        options: { requireAuth: false },
      });

      expect(result.authenticated).toBe(true);
      expect(result.user).not.toBeNull();
      expect(result.user.id).toBe('test-user-id');
    });

    it('treats a token that does not verify as anonymous rather than as a 401', async () => {
      // A token that was PRESENT and failed is not the same as no token, but on
      // an optional endpoint both mean the same thing to the caller: nobody is
      // signed in. Returning 401 here would make every page that probes on load
      // log an error for anyone with a stale token in localStorage.
      const result = await optionalAuthenticateRequest(
        testUtils.createMockEvent(),
        {}
      );

      expect(result.authenticated).toBe(false);
      expect(result.user).toBeNull();
      expect(result.error).toBeUndefined();
    });
  });

  describe('token extraction', () => {
    const forms = [
      ['Bearer', `Bearer mock-jwt-token`],
      ['lowercase bearer', `bearer mock-jwt-token`],
      ['mixed case BeArEr', `BeArEr mock-jwt-token`],
      ['padded with whitespace', `  Bearer   mock-jwt-token  `],
    ];

    it.each(forms)('accepts a token written as %s', async (_label, header) => {
      const result = await authenticate({ headers: { Authorization: header } });

      expect(result.authenticated).toBe(true);
    });

    it('accepts a token from the auth_token cookie', async () => {
      // The staff portal keeps its token in a cookie as well as a header.
      const result = await authenticate({ cookie: 'auth_token=mock-jwt-token' });

      expect(result.authenticated).toBe(true);
    });
  });

  describe('error shape', () => {
    it('carries a status code, headers and a body', async () => {
      const result = await authenticate({ headers: {} });

      expect(result.error.statusCode).toBe(401);
      expect(result.error.headers).toHaveProperty('Content-Type');
      expect(typeof result.error.body).toBe('string');
    });

    it('body names the failure and says it was not authorised', async () => {
      const result = await authenticate({ headers: {} });
      const body = bodyOf(result.error);

      expect(body.success).toBe(false);
      expect(body.errorCode).toBe(401);
      expect(body.message).toMatch(/token/i);
    });

    it('sets nosniff on the error response', async () => {
      const result = await authenticate({ headers: {} });

      expect(result.error.headers).toHaveProperty('X-Content-Type-Options', 'nosniff');
    });
  });
});
