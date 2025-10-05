const DatabaseService = require('./utils/database-service');
const errorHandler = require('./utils/error-handler');

/**
 * Sales Add Note API
 * Adds a note to a lead for sales representatives
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

    const { leadId, content } = requestBody;

    // Validate required fields
    if (!leadId || !content) {
      return errorHandler.badRequestError('leadId and content are required');
    }

    // Verify the lead exists and belongs to this sales rep
    const lead = await DatabaseService.query(
      'SELECT id, sales_rep_notes FROM leads WHERE id = $1 AND assigned_sales_rep_id = $2',
      [leadId, salesRepId]
    );

    if (lead.rows.length === 0) {
      return errorHandler.notFoundError('Lead not found or not assigned to you');
    }

    // Get current notes
    let notes = [];
    try {
      const currentNotes = lead.rows[0].sales_rep_notes;
      notes = currentNotes ? JSON.parse(currentNotes) : [];
    } catch (parseError) {
      console.warn('Failed to parse existing notes, starting fresh:', parseError);
      notes = [];
    }

    // Add new note
    const newNote = {
      id: Date.now().toString(),
      content: content.trim(),
      timestamp: new Date().toISOString(),
      salesRepId: salesRepId
    };

    notes.push(newNote);

    // Save updated notes
    await DatabaseService.query(
      'UPDATE leads SET sales_rep_notes = $1, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(notes), leadId]
    );

    return errorHandler.createSuccessResponse({
      success: true,
      message: 'Note added successfully',
      note: newNote
    });

  } catch (error) {
    console.error('Add note API error:', error);
    return errorHandler.serverError('Failed to add note', error);
  }
};

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