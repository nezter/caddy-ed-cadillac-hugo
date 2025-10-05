const DatabaseService = require('./utils/database-service');
const errorHandler = require('./utils/error-handler');

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
  const authToken = event.headers.authorization?.replace('Bearer ', '') ||
                    event.headers['x-auth-token'] ||
                    getCookieValue(event.headers.cookie, 'auth_token');

  if (!authToken) {
    return { authenticated: false };
  }

  try {
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

    const decodedToken = jwt.verify(authToken, JWT_SECRET);

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