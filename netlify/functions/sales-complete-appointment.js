const DatabaseService = require('./utils/database-service');
const errorHandler = require('./utils/error-handler');

/**
 * Sales Complete Appointment API
 * Marks an appointment as completed for sales representatives
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

    const { appointmentId } = requestBody;

    // Validate required fields
    if (!appointmentId) {
      return errorHandler.badRequestError('appointmentId is required');
    }

    // Verify the appointment exists and belongs to this sales rep
    const appointment = await DatabaseService.query(
      'SELECT id, status, lead_id FROM appointments WHERE id = $1 AND assigned_sales_rep_id = $2',
      [appointmentId, salesRepId]
    );

    if (appointment.rows.length === 0) {
      return errorHandler.notFoundError('Appointment not found or not assigned to you');
    }

    const currentStatus = appointment.rows[0].status;
    const leadId = appointment.rows[0].lead_id;

    // Check if appointment is already completed
    if (currentStatus === 'completed') {
      return errorHandler.badRequestError('Appointment is already completed');
    }

    // Update appointment status to completed
    await DatabaseService.query(
      'UPDATE appointments SET status = $1, completed_at = NOW(), updated_at = NOW() WHERE id = $2',
      ['completed', appointmentId]
    );

    // If this appointment was linked to a lead, consider updating lead status
    if (leadId) {
      await updateLeadStatusAfterAppointment(leadId, salesRepId);
    }

    return errorHandler.createSuccessResponse({
      success: true,
      message: 'Appointment marked as completed',
      appointmentId: appointmentId,
      previousStatus: currentStatus,
      newStatus: 'completed'
    });

  } catch (error) {
    console.error('Complete appointment API error:', error);
    return errorHandler.serverError('Failed to complete appointment', error);
  }
};

/**
 * Update lead status after appointment completion
 */
async function updateLeadStatusAfterAppointment(leadId, salesRepId) {
  try {
    // Check current lead status
    const lead = await DatabaseService.query(
      'SELECT status FROM leads WHERE id = $1 AND assigned_sales_rep_id = $2',
      [leadId, salesRepId]
    );

    if (lead.rows.length === 0) return;

    const currentStatus = lead.rows[0].status;

    // If lead is still in 'appointment' status, we might want to move it to 'contacted'
    // or leave it as is depending on business logic
    // For now, we'll leave it as is and let the sales rep manually update status

  } catch (error) {
    console.error('Failed to update lead status after appointment:', error);
    // Don't throw - appointment completion should still succeed
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