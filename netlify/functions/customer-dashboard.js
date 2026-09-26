const jwt = require('jsonwebtoken');
const DatabaseService = require('./utils/database-service');

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
  const authHeader = event.headers.authorization;
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

/**
 * Get customer appointments
 */
async function getCustomerAppointments(customerId) {
  // MOCK DATA. The JWT is verified above, so the caller is a real customer, but
  // `customerId` is then thrown away and everyone is shown the same fabricated
  // Escalade test drive for a 2024 date. This function authenticates and does
  // not authorise a real record. See the report.
  return {
    upcoming: [
      {
        id: 'appt_1',
        type: 'Test Drive',
        scheduled_date: '2024-10-15',
        scheduled_time: '14:00',
        location: 'Cadillac Dealership',
        status: 'confirmed',
        notes: 'Escalade Premium Luxury test drive',
        sales_rep_name: 'Sarah Johnson'
      }
    ],
    past: []
  };
}

/**
 * Get customer preferences
 */
async function getCustomerPreferences(customerId) {
  // MOCK DATA -- see getCustomerAppointments.
  return {
    vehicle_type: 'SUV',
    budget_min: 40000,
    budget_max: 60000,
    preferred_contact_method: 'email',
    preferred_features: ['navigation', 'leather seats', 'premium audio']
  };
}

/**
 * Get customer recent activity
 */
async function getCustomerActivity(customerId, limit = 10) {
  // MOCK DATA -- see getCustomerAppointments.
  return [
    {
      id: 'activity_1',
      date: '2024-10-10',
      type: 'lead_created',
      description: 'Initial contact via website',
      details: 'Submitted test drive request for Escalade'
    },
    {
      id: 'activity_2',
      date: '2024-10-12',
      type: 'appointment_scheduled',
      description: 'Test drive appointment scheduled',
      details: 'Scheduled for October 15th at 2:00 PM'
    },
    {
      id: 'activity_3',
      date: '2024-10-08',
      type: 'email_sent',
      description: 'Follow-up email sent',
      details: 'Vehicle information and pricing details'
    }
  ].slice(0, limit);
}

/**
 * Get customer's assigned sales representative
 */
async function getCustomerSalesRep(customerId) {
  // MOCK DATA -- see getCustomerAppointments.
  return {
    name: 'Sarah Johnson',
    title: 'Sales Representative',
    email: 'sarah.johnson@cadillacofsouthcharlotte.com',
    phone: '(704) 555-0102',
    photo: '/images/sales-reps/sarah-johnson.jpg'
  };
}
