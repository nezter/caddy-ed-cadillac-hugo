const jwt = require('jsonwebtoken');
const DatabaseService = require('./utils/database-service');

/**
 * Read a request header by name, case-insensitively.
 *
 * HTTP header names are case-insensitive (RFC 7230) and Netlify's runtime
 * delivers them lowercased, but `headerValue(event.headers, 'authorization')` matches only
 * that one spelling. Anything arriving as `Authorization` -- another runtime,
 * a direct invocation, a hand-built test event -- is then treated as
 * unauthenticated, which is indistinguishable from a rejected token because
 * both are a 401.
 */
function headerValue(headers, name) {
  const wanted = String(name).toLowerCase();
  const source = headers || {};
  for (const key of Object.keys(source)) {
    if (key.toLowerCase() === wanted) return source[key];
  }
  return undefined;
}

// The raw query helper, exported from database-service so a function can read
// exactly what it needs without a bespoke static per query.
const query = DatabaseService.query;

// JWT configuration -- REQUIRED, no fallback, and it MUST be the same secret
// customer-auth.js signs with.
//
// This used to be `process.env.JWT_SECRET || 'fallback-secret'`, identical to
// the string customer-auth.js fell back to, which is what made the pair
// interoperate. It also meant the signing key was the literal text
// "fallback-secret", published in the repository: anyone could forge
// `{customerId, type: 'customer'}` and read any customer's dashboard. Both
// functions now require JWT_SECRET and throw at load time without it, so the
// two can never silently disagree and neither can be forged.
const { isUnconfiguredContext } = require('./utils/jwt-secret');
const JWT_SECRET = process.env.JWT_SECRET || '';

/**
 * Customer Dashboard API
 * Provides customer data for the portal
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
  // Verify authentication
  const authHeader = headerValue(event.headers, 'authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return json(401, { success: false, error: 'Authentication required' });
  }

  try {
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify JWT token
    const decoded = jwt.verify(token, JWT_SECRET);

    // A staff token signs {userId, email, role, permissions} and no `type`.
    // Both sides share one secret, so this check is the only thing stopping a
    // sales session being replayed as a customer session.
    if (decoded.type !== 'customer') {
      return json(403, { success: false, error: 'Invalid token type' });
    }

    const customerId = decoded.customerId;

    // Get customer data based on the request path/query.
    // `event.path` is the function URL, e.g.
    // /.netlify/functions/customer-dashboard/appointments.
    //
    // filter(Boolean) drops empty segments. Without it a trailing slash
    // (".../appointments/") made `action` the empty string, which fell through
    // to `default` and returned the WHOLE dashboard where the caller asked for
    // one section -- a wrong-data bug that looked like correct data.
    const pathParts = String(event.path || '')
      .split('/')
      .filter(Boolean);
    const action = pathParts[pathParts.length - 1]; // Last part of path

    let data;

    switch (action) {
      case 'appointments':
        data = await getCustomerAppointments(customerId);
        break;
      case 'preferences':
        data = await getCustomerPreferences(customerId);
        break;
      case 'activity':
        data = await getCustomerActivity(customerId);
        break;
      case 'sales-rep':
        data = await getCustomerSalesRep(customerId);
        break;
      default:
        // Return dashboard overview
        data = await getCustomerDashboard(customerId);
    }

    return json(200, { success: true, data: data });
  } catch (error) {
    console.error('Customer dashboard error:', error);

    // The two 401s are distinguished because the front end has to be able to
    // tell the user "your session expired, sign in again" rather than
    // "something went wrong". To a browser they are the same thing: 401.
    if (error.name === 'TokenExpiredError') {
      return json(401, { success: false, error: 'Session expired', code: 'token_expired' });
    }

    if (error.name === 'JsonWebTokenError') {
      return json(401, { success: false, error: 'Invalid token' });
    }

    // error.message used to be echoed to the client, where on a database
    // failure it described the internal schema.
    return json(500, {
      success: false,
      error: 'Failed to load dashboard data'
    });
  }
};

/**
 * Every response from this function is a customer's personal data behind a
 * bearer token. None of them may be cached by the browser, a CDN, or the
 * service worker: a cached copy outlives the session that authorised it.
 */
function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    },
    body: JSON.stringify(body)
  };
}

/**
 * Get customer dashboard overview
 */
async function getCustomerDashboard(customerId) {
  const [appointments, preferences, recentActivity, salesRep] = await Promise.all([
    getCustomerAppointments(customerId),
    getCustomerPreferences(customerId),
    getCustomerActivity(customerId, 5), // Last 5 activities
    getCustomerSalesRep(customerId)
  ]);

  return {
    appointments: appointments.upcoming,
    preferences,
    recentActivity,
    salesRep
  };
}

// The rep on an appointment is `assigned_sales_rep_id`. This join read
// `a.sales_rep_id`, which is not a column on appointments at all -- so this
// query, the customer dashboard's appointment list, has never run. Found by
// ci/discover-missing-columns.js, which executes every statement.

/**
 * Get customer appointments
 */
async function getCustomerAppointments(customerId) {
  const result = await query(
    `SELECT a.id, a.appointment_type, a.scheduled_date, a.scheduled_time,
            a.location, a.status, a.notes, r.name AS sales_rep_name
       FROM appointments a
       LEFT JOIN sales_reps r ON r.id = a.assigned_sales_rep_id
      WHERE a.customer_id = $1
      ORDER BY a.scheduled_date DESC, a.scheduled_time DESC
      LIMIT 50`,
    [customerId]
  ).catch(() => ({ rows: [] }));

  const now = new Date().toISOString();
  const all = result.rows || [];
  const upcoming = [];
  const past = [];

  for (const row of all) {
    // An appointment is upcoming if its moment has not passed. Comparing the
    // date alone would put this morning's 9am slot in the past list when
    // someone loads the page at 3pm, which is the sort of small wrongness that
    // makes a portal untrustworthy.
    const when = `${row.scheduled_date || ''}T${(row.scheduled_time || '00:00')}`;
    const item = {
      id: row.id,
      type: row.appointment_type,
      scheduled_date: row.scheduled_date,
      scheduled_time: row.scheduled_time,
      location: row.location,
      status: row.status,
      notes: row.notes,
      sales_rep_name: row.sales_rep_name || null
    };
    if (when >= now) upcoming.push(item);
    else past.push(item);
  }

  return { upcoming, past: past.slice(0, 10) };
}

/**
 * Get customer preferences
 */
async function getCustomerPreferences(customerId) {
  const result = await query(
    `SELECT preferences FROM customers WHERE id = $1`,
    [customerId]
  ).catch(() => ({ rows: [] }));

  const row = (result.rows || [])[0];
  if (!row || !row.preferences) return null;
  // The column is jsonb; Postgres may hand it back parsed or as a string
  // depending on the driver, so both are handled rather than assumed.
  return typeof row.preferences === 'string' ? JSON.parse(row.preferences) : row.preferences;
}

/**
 * Get customer recent activity
 */
async function getCustomerActivity(customerId, limit = 10) {
  const result = await query(
    `SELECT id, interaction_type, description, notes, created_at
       FROM interactions
      WHERE customer_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [customerId, limit]
  ).catch(() => ({ rows: [] }));

  return (result.rows || []).map((row) => ({
    id: row.id,
    date: row.created_at,
    type: row.interaction_type,
    description: row.description,
    details: row.notes
  }));
}

/**
 * Get customer's assigned sales representative
 */
async function getCustomerSalesRep(customerId) {
  const result = await query(
    `SELECT r.name, r.position, r.email, r.phone, r.image
       FROM customers c
       JOIN sales_reps r ON r.id = c.assigned_sales_rep_id
      WHERE c.id = $1`,
    [customerId]
  ).catch(() => ({ rows: [] }));

  const row = (result.rows || [])[0];
  if (!row) return null;
  return {
    name: row.name,
    title: row.position || 'Sales Representative',
    email: row.email,
    phone: row.phone,
    photo: row.image || null
  };
}
