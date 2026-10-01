const DatabaseService = require('./utils/database-service');
const errorHandler = require('./utils/error-handler');
const { isUsableSecret } = require('./utils/jwt-secret');

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


/**
 * Sales Appointments API
 * Handles appointment management for sales representatives
 */
exports.handler = async function(event, context) {
  // Only allow GET requests
  if (event.httpMethod !== 'GET') {
    return errorHandler.forbiddenError('Method not allowed');
  }

  try {
    // Check authentication
    const authCheck = await checkAuthentication(event);
    if (!authCheck.authenticated) {
      return errorHandler.unauthorizedError('Authentication required');
    }

    const salesRepId = authCheck.user.userId;

    // Get query parameters
    const params = event.queryStringParameters || {};
    const timeframe = params.timeframe || 'week';

    // Get appointments for this sales rep
    const appointments = await getSalesRepAppointments(salesRepId, timeframe);

    return errorHandler.createSuccessResponse({
      appointments: appointments,
      totalCount: appointments.length,
      timeframe: timeframe
    });

  } catch (error) {
    console.error('Sales appointments API error:', error);
    return errorHandler.serverError('Failed to fetch appointments', error);
  }
};

/**
 * Get appointments for a sales representative
 */
async function getSalesRepAppointments(salesRepId, timeframe) {
  try {
    // Calculate date range based on timeframe
    const now = new Date();
    let startDate, endDate;

    switch (timeframe) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        endDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // Include future appointments
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        endDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    }

    // Build SQL query
    const sql = `
      SELECT
        a.*,
        c.first_name as customer_first_name,
        c.last_name as customer_last_name,
        c.email as customer_email,
        c.phone as customer_phone,
        l.first_name as lead_first_name,
        l.last_name as lead_last_name,
        l.email as lead_email,
        l.phone as lead_phone
      FROM appointments a
      LEFT JOIN customers c ON a.customer_id = c.id
      LEFT JOIN leads l ON a.lead_id = l.id
      WHERE a.assigned_sales_rep_id = $1
      AND a.scheduled_start >= $2
      AND a.scheduled_start < $3
      AND a.status IN ('scheduled', 'confirmed')
      ORDER BY a.scheduled_start ASC
    `;

    const params = [salesRepId, startDate.toISOString(), endDate.toISOString()];

    const result = await DatabaseService.query(sql, params);

    // Transform the results to match the expected format
    return result.rows.map(row => ({
      id: row.id,
      customerName: row.customer_id ?
        `${row.customer_first_name} ${row.customer_last_name}` :
        `${row.lead_first_name || 'Unknown'} ${row.lead_last_name || 'Customer'}`,
      email: row.customer_id ? row.customer_email : row.lead_email,
      phone: row.customer_id ? row.customer_phone : row.lead_phone,
      date: row.scheduled_start,
      notes: row.preparation_notes || row.customer_notes,
      status: row.status,
      type: row.title || 'Test Drive',
      location: row.location || 'Cadillac of South Charlotte'
    }));

  } catch (error) {
    console.error('Error fetching sales rep appointments:', error);
    throw error;
  }
}

/**
 * Helper function to check authentication
 */
async function checkAuthentication(event) {
  const authToken = headerValue(event.headers, 'authorization')?.replace('Bearer ', '') ||
                    headerValue(event.headers, 'x-auth-token') ||
                    getCookieValue(headerValue(event.headers, 'cookie'), 'auth_token');

  if (!authToken) {
    return { authenticated: false };
  }

  try {
    const jwt = require('jsonwebtoken');
    // Never a fallback literal.
    //
    // This was `process.env.JWT_SECRET || 'your-secret-key-change-in-production'`
    // and the string is committed to a public repository. When JWT_SECRET is
    // unset -- which is the case under [dev.environment], and for production
    // until somebody sets it in the Netlify UI, because netlify.toml declares no
    // [context.production.environment] -- that literal became the VERIFYING key.
    // Anyone who reads this repo could sign a token with it, claim role 'admin',
    // and be believed. A secret that fails open to a published constant is worse
    // than no secret at all, because it looks configured.
    //
    // sales-customers.js already documented this exact hazard; four siblings kept
    // the literal. Refusing an unusable secret is one answer, and utils/jwt-secret.js
    // is where it lives -- including for the context markers netlify.toml writes
    // on purpose, which are public strings and must never verify a token either.
    const secret = process.env.JWT_SECRET;
    if (!isUsableSecret(secret)) {
      console.error(
        '[sales-appointments] JWT_SECRET is not configured (absent, empty, or a ' +
          'deploy marker). Refusing the request rather than verifying with a ' +
          'published default.'
      );
      return { authenticated: false, unconfigured: true };
    }

    const decodedToken = jwt.verify(authToken, secret);

    return {
      authenticated: true,
      user: {
        userId: decodedToken.userId,
        email: decodedToken.email,
        role: decodedToken.role
      }
    };
  } catch (error) {
    console.error('Token verification failed:', error);
    return { authenticated: false };
  }
}

/**
 * Helper function to get cookie value
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