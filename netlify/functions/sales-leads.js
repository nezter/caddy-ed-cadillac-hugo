const DatabaseService = require('./utils/database-service');
const errorHandler = require('./utils/error-handler');

/**
 * Sales Leads API
 * Handles lead management for sales representatives
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
    const status = params.status || 'all';
    const sort = params.sort || 'date-desc';
    const search = params.search || '';

    // Get leads for this sales rep
    const leads = await getSalesRepLeads(salesRepId, timeframe, status, sort, search);

    return errorHandler.createSuccessResponse({
      leads: leads,
      totalCount: leads.length,
      timeframe: timeframe,
      status: status
    });

  } catch (error) {
    console.error('Sales leads API error:', error);
    return errorHandler.serverError('Failed to fetch leads', error);
  }
};

/**
 * Get leads assigned to a sales representative
 */
async function getSalesRepLeads(salesRepId, timeframe, status, sort, search) {
  try {
    // Calculate date range based on timeframe
    const now = new Date();
    let startDate;

    switch (timeframe) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'quarter':
        const quarterStart = Math.floor(now.getMonth() / 3) * 3;
        startDate = new Date(now.getFullYear(), quarterStart, 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // Default to 30 days
    }

    // Build SQL query
    let sql = `
      SELECT
        l.*,
        c.first_name as customer_first_name,
        c.last_name as customer_last_name,
        c.email as customer_email,
        c.phone as customer_phone,
        l.sales_rep_notes
      FROM leads l
      LEFT JOIN customers c ON l.customer_id = c.id
      WHERE l.assigned_sales_rep_id = $1
      AND l.created_at >= $2
    `;

    const params = [salesRepId, startDate.toISOString()];

    // Add status filter
    if (status !== 'all') {
      sql += ` AND l.status = $${params.length + 1}`;
      params.push(status);
    }

    // Add search filter
    if (search) {
      sql += ` AND (
        l.first_name ILIKE $${params.length + 1} OR
        l.last_name ILIKE $${params.length + 1} OR
        l.email ILIKE $${params.length + 1} OR
        l.message ILIKE $${params.length + 1}
      )`;
      params.push(`%${search}%`);
    }

    // Add sorting
    switch (sort) {
      case 'date-asc':
        sql += ' ORDER BY l.created_at ASC';
        break;
      case 'date-desc':
      default:
        sql += ' ORDER BY l.created_at DESC';
        break;
      case 'name-asc':
        sql += ' ORDER BY l.last_name ASC, l.first_name ASC';
        break;
      case 'name-desc':
        sql += ' ORDER BY l.last_name DESC, l.first_name DESC';
        break;
      case 'status':
        sql += ' ORDER BY l.status ASC, l.created_at DESC';
        break;
    }

    const result = await DatabaseService.query(sql, params);

    // Transform the results to match the expected format
    return result.rows.map(row => {
      // Parse notes from JSON
      let notes = [];
      try {
        notes = row.sales_rep_notes ? JSON.parse(row.sales_rep_notes) : [];
      } catch (parseError) {
        console.warn('Failed to parse notes for lead', row.id, parseError);
        notes = [];
      }

      return {
        id: row.id,
        firstName: row.first_name,
        lastName: row.last_name,
        email: row.email,
        phone: row.phone,
        message: row.message,
        interests: row.vehicle_interest,
        source: row.lead_source,
        status: row.status,
        timestamp: row.created_at,
        vehicleId: row.vehicle_id,
        customerId: row.customer_id,
        notes: notes
      };
    });

  } catch (error) {
    console.error('Error fetching sales rep leads:', error);
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