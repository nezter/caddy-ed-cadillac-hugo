const DatabaseService = require('./utils/database-service');
const errorHandler = require('./utils/error-handler');
const { authenticateRequest } = require('./utils/auth-middleware');

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
    // Check authentication and permissions
    const authResult = await authenticateRequest(event, {
      requiredPermissions: ['view_leads']
    });

    if (!authResult.authenticated) {
      return authResult.error;
    }

    const user = authResult.user;
    let salesRepId = user.id;

    // Managers and admins can view all leads or specify a sales rep. With
    // no salesId they get the whole shop -- scoping them to their own id
    // showed an empty dashboard on an account that owns no leads.
    const params = event.queryStringParameters || {};
    if (user.role === 'admin' || user.role === 'sales_manager') {
      salesRepId = params.salesId || null;
    }

    // Get query parameters
    const queryParams = event.queryStringParameters || {};
    const timeframe = queryParams.timeframe || 'week';
    const status = queryParams.status || 'all';
    const sort = queryParams.sort || 'date-desc';
    const search = queryParams.search || '';

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
      case 'all':
        // No window: the console's 'All time' filter. Useful because a shop
        // between campaigns can have nothing in the last year while the
        // pipeline itself is not empty.
        startDate = new Date(0);
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
      WHERE 1=1
    `;

    const params = [];
    if (salesRepId) {
      sql += ` AND l.assigned_sales_rep_id = $${params.length + 1}`;
      params.push(salesRepId);
    }
    sql += ` AND l.created_at >= $${params.length + 1}`;
    params.push(startDate.toISOString());

    // Add status filter
    if (status !== 'all') {
      sql += ` AND l.status = $${params.length + 1}`;
      params.push(status);
    }

    // Add search filter
    if (search) {
      sql += ` AND (
        l.first_name LIKE $${params.length + 1} OR
        l.last_name LIKE $${params.length + 1} OR
        l.email LIKE $${params.length + 1} OR
        l.message LIKE $${params.length + 1}
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

