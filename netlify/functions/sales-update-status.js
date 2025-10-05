const DatabaseService = require('./utils/database-service');
const errorHandler = require('./utils/error-handler');

/**
 * Sales Update Status API
 * Updates the status of a lead for sales representatives
 */
exports.handler = async function(event, context) {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return errorHandler.forbiddenError('Method not allowed');
  }

  try {
    // Check authentication
    const authCheck = await checkAuthentication(event);
    if (!authCheck.authenticated) {
      return errorHandler.unauthorizedError('Authentication required');
    }

    const salesRepId = authCheck.user.userId;

    // Parse request body
    let requestBody;
    try {
      requestBody = JSON.parse(event.body);
    } catch (parseError) {
      return errorHandler.badRequestError('Invalid JSON in request body');
    }

    const { leadId, status } = requestBody;

    // Validate required fields
    if (!leadId || !status) {
      return errorHandler.badRequestError('leadId and status are required');
    }

    // Validate status value
    const validStatuses = ['new', 'contacted', 'appointment', 'sold', 'lost'];
    if (!validStatuses.includes(status)) {
      return errorHandler.badRequestError('Invalid status value');
    }

    // Verify the lead exists and belongs to this sales rep
    const lead = await DatabaseService.query(
      'SELECT id, status FROM leads WHERE id = $1 AND assigned_sales_rep_id = $2',
      [leadId, salesRepId]
    );

    if (lead.rows.length === 0) {
      return errorHandler.notFoundError('Lead not found or not assigned to you');
    }

    const oldStatus = lead.rows[0].status;

    // Update lead status
    await DatabaseService.query(
      'UPDATE leads SET status = $1, updated_at = NOW() WHERE id = $2',
      [status, leadId]
    );

    // Log status change in notes if status changed
    if (oldStatus !== status) {
      await logStatusChange(leadId, salesRepId, oldStatus, status);
    }

    return errorHandler.createSuccessResponse({
      success: true,
      message: 'Lead status updated successfully',
      leadId: leadId,
      oldStatus: oldStatus,
      newStatus: status
    });

  } catch (error) {
    console.error('Update status API error:', error);
    return errorHandler.serverError('Failed to update lead status', error);
  }
};

/**
 * Log status change in lead notes
 */
async function logStatusChange(leadId, salesRepId, oldStatus, newStatus) {
  try {
    // Get current notes
    const lead = await DatabaseService.query(
      'SELECT sales_rep_notes FROM leads WHERE id = $1',
      [leadId]
    );

    let notes = [];
    try {
      const currentNotes = lead.rows[0].sales_rep_notes;
      notes = currentNotes ? JSON.parse(currentNotes) : [];
    } catch (parseError) {
      console.warn('Failed to parse existing notes for status change log:', parseError);
      notes = [];
    }

    // Add status change note
    const statusNote = {
      id: `status-${Date.now()}`,
      content: `Status changed from "${oldStatus}" to "${newStatus}"`,
      timestamp: new Date().toISOString(),
      salesRepId: salesRepId,
      type: 'status_change'
    };

    notes.push(statusNote);

    // Save updated notes
    await DatabaseService.query(
      'UPDATE leads SET sales_rep_notes = $1 WHERE id = $2',
      [JSON.stringify(notes), leadId]
    );
  } catch (error) {
    console.error('Failed to log status change:', error);
    // Don't throw - status update should still succeed even if logging fails
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