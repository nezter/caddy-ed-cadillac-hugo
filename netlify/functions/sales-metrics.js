const DatabaseService = require('./utils/database-service');
const errorHandler = require('./utils/error-handler');

/**
 * Sales Metrics API
 * Provides sales performance metrics for sales representatives
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

    // Get metrics for this sales rep
    const metrics = await getSalesRepMetrics(salesRepId, timeframe);

    return errorHandler.createSuccessResponse(metrics);

  } catch (error) {
    console.error('Sales metrics API error:', error);
    return errorHandler.serverError('Failed to fetch metrics', error);
  }
};

/**
 * Get sales metrics for a sales representative
 */
async function getSalesRepMetrics(salesRepId, timeframe) {
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
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // Get lead metrics
    const leadMetrics = await getLeadMetrics(salesRepId, startDate);

    // Get appointment metrics
    const appointmentMetrics = await getAppointmentMetrics(salesRepId, startDate);

    // Get sales metrics
    const salesMetrics = await getSalesMetrics(salesRepId, startDate);

    // Calculate conversion rates
    const conversionRate = leadMetrics.totalLeads > 0 ?
      ((salesMetrics.totalSales / leadMetrics.totalLeads) * 100).toFixed(1) + '%' : '0%';

    return {
      newLeads: leadMetrics.newLeads,
      totalLeads: leadMetrics.totalLeads,
      appointments: appointmentMetrics.totalAppointments,
      sales: salesMetrics.totalSales,
      conversionRate: conversionRate,
      timeframe: timeframe,
      period: {
        start: startDate.toISOString().split('T')[0],
        end: now.toISOString().split('T')[0]
      }
    };

  } catch (error) {
    console.error('Error calculating sales metrics:', error);
    throw error;
  }
}

/**
 * Get lead metrics for a sales rep
 */
async function getLeadMetrics(salesRepId, startDate) {
  const sql = `
    SELECT
      COUNT(*) as total_leads,
      COUNT(CASE WHEN status = 'new' THEN 1 END) as new_leads,
      COUNT(CASE WHEN status = 'contacted' THEN 1 END) as contacted_leads,
      COUNT(CASE WHEN status = 'appointment' THEN 1 END) as appointment_leads,
      COUNT(CASE WHEN status = 'sold' THEN 1 END) as sold_leads
    FROM leads
    WHERE assigned_sales_rep_id = $1
    AND created_at >= $2
  `;

  const result = await DatabaseService.query(sql, [salesRepId, startDate.toISOString()]);

  return {
    totalLeads: parseInt(result.rows[0].total_leads) || 0,
    newLeads: parseInt(result.rows[0].new_leads) || 0,
    contactedLeads: parseInt(result.rows[0].contacted_leads) || 0,
    appointmentLeads: parseInt(result.rows[0].appointment_leads) || 0,
    soldLeads: parseInt(result.rows[0].sold_leads) || 0
  };
}

/**
 * Get appointment metrics for a sales rep
 */
async function getAppointmentMetrics(salesRepId, startDate) {
  const sql = `
    SELECT
      COUNT(*) as total_appointments,
      COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_appointments,
      COUNT(CASE WHEN status = 'scheduled' THEN 1 END) as scheduled_appointments,
      COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_appointments
    FROM appointments
    WHERE assigned_sales_rep_id = $1
    AND scheduled_start >= $2
  `;

  const result = await DatabaseService.query(sql, [salesRepId, startDate.toISOString()]);

  return {
    totalAppointments: parseInt(result.rows[0].total_appointments) || 0,
    completedAppointments: parseInt(result.rows[0].completed_appointments) || 0,
    scheduledAppointments: parseInt(result.rows[0].scheduled_appointments) || 0,
    cancelledAppointments: parseInt(result.rows[0].cancelled_appointments) || 0
  };
}

/**
 * Get sales metrics for a sales rep
 */
async function getSalesMetrics(salesRepId, startDate) {
  // For now, we'll count leads marked as 'sold' as sales
  // In a real implementation, this would query actual sales transactions
  const sql = `
    SELECT COUNT(*) as total_sales
    FROM leads
    WHERE assigned_sales_rep_id = $1
    AND status = 'sold'
    AND updated_at >= $2
  `;

  const result = await DatabaseService.query(sql, [salesRepId, startDate.toISOString()]);

  return {
    totalSales: parseInt(result.rows[0].total_sales) || 0
  };
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