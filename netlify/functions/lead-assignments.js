const errorHandler = require('./utils/error-handler');
const { route } = require('./utils/request-path');
const LeadAssignmentService = require('./utils/lead-assignment-service');
const DatabaseService = require('./utils/database-service');
const { authenticateRequest } = require('./utils/auth-middleware');

/**
 * Lead Assignment Management API
 * Handles manual assignment, analytics, and rebalancing
 */
exports.handler = async function(event, context) {
  // Authenticate request with proper JWT validation
  const auth = await authenticateRequest(event, {
    requireAuth: true,
    allowedRoles: ['admin', 'manager', 'sales_rep'],
    requiredPermissions: ['assignments_read', 'assignments_write']
  });

  if (!auth.authenticated) {
    return auth.error;
  }

  try {
    const path = route(event, 'lead-assignments');
    const method = event.httpMethod;

    switch (`${method} ${path}`) {
      case 'GET /analytics':
        return await getAssignmentAnalytics(event);
      case 'POST /rebalance':
        return await rebalanceAssignments(event);
      case 'POST /assign':
        return await manualAssignLead(event);
      case 'GET /unassigned':
        return await getUnassignedLeads(event);
      case 'GET /reps':
        return await getSalesReps(event);
      default:
        return errorHandler.notFoundError('Endpoint not found');
    }

  } catch (error) {
    console.error('Lead assignment API error:', error);
    return errorHandler.serverError('Failed to process assignment request', error);
  }
};

/**
 * Get assignment analytics
 */
async function getAssignmentAnalytics(event) {
  const days = parseInt(event.queryStringParameters?.days) || 30;

  try {
    const analytics = await LeadAssignmentService.getAssignmentAnalytics(days);

    return errorHandler.createSuccessResponse({
      analytics,
      period: `${days} days`
    });

  } catch (error) {
    console.error('Error getting assignment analytics:', error);
    return errorHandler.serverError('Failed to get assignment analytics', error);
  }
}

/**
 * Rebalance existing lead assignments
 */
async function rebalanceAssignments(event) {
  try {
    const results = await LeadAssignmentService.rebalanceAssignments();

    return errorHandler.createSuccessResponse({
      message: 'Lead assignments rebalanced successfully',
      results
    });

  } catch (error) {
    console.error('Error rebalancing assignments:', error);
    return errorHandler.serverError('Failed to rebalance assignments', error);
  }
}

/**
 * Manually assign a lead to a specific sales rep
 */
async function manualAssignLead(event) {
  let requestData;
  try {
    requestData = JSON.parse(event.body);
  } catch (e) {
    return errorHandler.validationError('Invalid JSON in request body');
  }

  const { leadId, salesRepId, reason = 'manual_assignment' } = requestData;

  if (!leadId || !salesRepId) {
    return errorHandler.validationError('Missing required fields', {
      leadId: !leadId ? 'Lead ID is required' : null,
      salesRepId: !salesRepId ? 'Sales rep ID is required' : null
    });
  }

  try {
    // Get sales rep details
    const salesRep = await DatabaseService.getSalesRep(salesRepId);
    if (!salesRep) {
      return errorHandler.notFoundError('Sales representative not found');
    }

    if (salesRep.status !== 'active') {
      return errorHandler.validationError('Sales representative is not active');
    }

    // Update lead assignment
    await DatabaseService.updateLead(leadId, {
      assigned_sales_rep_id: salesRepId,
      assignment_reason: reason,
      assignment_score: 100 // Manual assignments get perfect score
    });

    return errorHandler.createSuccessResponse({
      message: 'Lead assigned successfully',
      leadId,
      assignedTo: {
        id: salesRep.id,
        name: `${salesRep.first_name} ${salesRep.last_name}`,
        email: salesRep.email
      },
      assignmentReason: reason
    });

  } catch (error) {
    console.error('Error manually assigning lead:', error);
    return errorHandler.serverError('Failed to assign lead', error);
  }
}

/**
 * Get active sales reps, for the assignment picker.
 *
 * The front end needs a roster to populate POST /assign, and there was no way
 * to get one from this function: the analytics carry a workload rollup keyed on
 * display name but no rep id, and the dashboard was filling the dropdown with
 * three invented people. Invented names are worse than an empty picker: the
 * assignment writes that `sales_rep_id` straight into the leads table.
 *
 * Only active reps, matching the check manualAssignLead already enforces, so
 * the picker cannot offer a choice the server will reject with a 400.
 */
async function getSalesReps(event) {
  const includeAll = event.queryStringParameters?.include_inactive === 'true';

  try {
    const reps = await DatabaseService.getAllSalesReps();

    const formatted = reps
      .filter((rep) => includeAll || rep.status === 'active')
      .map((rep) => ({
        id: rep.id,
        name: `${rep.first_name} ${rep.last_name}`.trim(),
        email: rep.email,
        role: rep.role,
        status: rep.status
      }));

    return errorHandler.createSuccessResponse({
      reps: formatted,
      total: formatted.length
    }, 'Sales representatives retrieved successfully');

  } catch (error) {
    console.error('Error getting sales reps:', error);
    return errorHandler.serverError('Failed to get sales representatives', error);
  }
}

/**
 * Get unassigned leads
 */
async function getUnassignedLeads(event) {
  const limit = parseInt(event.queryStringParameters?.limit) || 50;

  try {
    const leads = await DatabaseService.getLeadsNeedingReassignment();

    // Format for response
    const formattedLeads = leads.slice(0, limit).map(lead => ({
      id: lead.id,
      firstName: lead.first_name,
      lastName: lead.last_name,
      email: lead.email,
      phone: lead.phone,
      vehicleInterest: lead.vehicle_interest,
      source: lead.lead_source,
      score: lead.score,
      createdAt: lead.created_at,
      priority: lead.priority
    }));

    return errorHandler.createSuccessResponse({
      leads: formattedLeads,
      total: leads.length,
      limit
    });

  } catch (error) {
    console.error('Error getting unassigned leads:', error);
    return errorHandler.serverError('Failed to get unassigned leads', error);
  }
}