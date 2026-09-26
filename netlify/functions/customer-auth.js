const jwt = require('jsonwebtoken');
const DatabaseService = require('./utils/database-service');
const { assertUsableSecret } = require('./utils/jwt-secret');

// JWT configuration -- REQUIRED, no fallback, and no context markers.
//
// This used to be `process.env.JWT_SECRET || 'fallback-secret'`. That string
// is in this file, which is in the repository, which means anyone who has read
// the repository can mint a token that verifies as a customer of their choosing
// and read that customer's dashboard. A signing key that is public is not a
// signing key. Fail closed instead -- if the secret is missing, the function
// refuses to load rather than inventing a weak one.
//
// The marker check closes the same hole from the other side. netlify.toml writes
// JWT_SECRET="deploy-preview-not-configured" into the preview, branch-deploy and
// [dev] contexts so they provably cannot use production tokens. A marker is a
// public string, so signing with one would mint forgeable tokens -- the
// 'fallback-secret' bug wearing a disguise. See utils/jwt-secret.js.
const { isUnconfiguredContext } = require('./utils/jwt-secret');
const JWT_SECRET = process.env.JWT_SECRET || '';
const TOKEN_TTL = '24h';

/**
 * Customer Authentication
 * Handles customer login and session management
 */
exports.handler = async (event) => {

    // Per-request, not at require time. See the note above: a load-time throw
    // makes the preview configuration (a deliberate marker secret) surface as an
    // opaque 502 instead of an honest 503.
    if (isUnconfiguredContext()) {
      return {
        statusCode: 503,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'This context has no JWT signing key configured',
          detail:
            'No token can be valid here. Deploy previews and branch deploys ' +
            'deliberately run without one so they cannot touch production.',
        }),
      };
    }
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return json(405, { success: false, error: 'Method not allowed' });
  }

  try {
    const data = JSON.parse(event.body || '{}');
    const { email, phone } = data;

    if (!email || !phone) {
      return json(400, {
        success: false,
        error: 'Email and phone are required'
      });
    }

    // Find customer by email and phone
    const customer = await findCustomerByContact(email, phone);

    if (!customer) {
      return json(404, {
        success: false,
        error: 'Customer not found. Please contact us to get started.'
      });
    }

    // Generate JWT token for session management.
    // Payload shape is the contract with customer-dashboard.js: that function
    // rejects any token whose `type` is not exactly 'customer' (a 403, so a
    // staff token cannot be replayed here even though both use one secret).
    const token = jwt.sign(
      {
        customerId: customer.id,
        email: customer.email,
        type: 'customer'
      },
      JWT_SECRET,
      { expiresIn: TOKEN_TTL }
    );

    // Wire format: the token is at body.data.token, NOT body.token.
    // createSuccessResponse-shaped envelopes put the payload under `data`; a
    // top-level read is `undefined` forever.
    return json(
      200,
      {
        success: true,
        data: {
          customer: {
            id: customer.id,
            first_name: customer.first_name,
            last_name: customer.last_name,
            email: customer.email,
            phone: customer.phone
          },
          token: token,
          expiresIn: TOKEN_TTL
        }
      },
      // Carries a bearer token: never cacheable.
      { 'Cache-Control': 'no-store' }
    );
  } catch (error) {
    // The message is logged, not returned. The old response echoed
    // `error.message` back to the client, which on a database failure is a
    // description of the internal schema.
    console.error('Customer authentication error:', error);
    return json(500, {
      success: false,
      error: 'Authentication failed'
    });
  }
};

function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      ...extraHeaders
    },
    body: JSON.stringify(body)
  };
}

/**
 * Find a customer by email and phone.
 *
 * WHAT THIS USED TO BE -- read this before "simplifying" it:
 *
 *     if (normalizedEmail.includes('test') || normalizedEmail.includes('john')) {
 *       return { id: 'customer_123', first_name: 'John', ... };
 *     }
 *
 * Any email containing the substring "test" or "john", with ANY phone number
 * whatsoever, produced a valid customer session. `attacker@john.example` and
 * `x@testing.io` both worked. There was no password, no database, and no check
 * that the person was a customer at all. The function called itself
 * authentication and performed a substring comparison.
 *
 * It now looks the customer up in the real `customers` table and requires BOTH
 * the email and the phone to match, which is the only credential the login form
 * collects (site/layouts/shortcodes/customer-login-form.html has two fields:
 * email and phone). That is a weak credential -- see the report -- but it is at
 * least a fact about a real person rather than a fact about a string.
 */
async function findCustomerByContact(email, phone) {
  const normalizedEmail = String(email).trim().toLowerCase();
  const normalizedPhone = digitsOnly(phone);

  if (!normalizedEmail || !normalizedPhone) return null;

  // searchCustomers ILIKEs across name/email/phone, so this narrows to the
  // email first; the exact phone comparison below is done in JS because the
  // column is free-text ("(704) 555-0102", "704-555-0102", "+17045550102" are
  // all the same number and no SQL comparison gets all three).
  const matches = await DatabaseService.searchCustomers({
    search: normalizedEmail,
    limit: 25,
    offset: 0,
    // Fixed, never user-supplied: searchCustomers interpolates sort_by and
    // sort_order straight into the SQL string.
    sort_by: 'last_name',
    sort_order: 'asc'
  });

  const wantedEmail = normalizedEmail;
  const byBoth = (Array.isArray(matches) ? matches : []).find(
    (row) =>
      String(row.email || '').trim().toLowerCase() === wantedEmail &&
      digitsOnly(row.phone) === normalizedPhone
  );

  if (!byBoth) return null;

  return {
    id: byBoth.id,
    first_name: byBoth.first_name,
    last_name: byBoth.last_name,
    email: byBoth.email,
    phone: byBoth.phone
  };
}

function digitsOnly(value) {
  return String(value == null ? '' : value).replace(/\D/g, '');
}
