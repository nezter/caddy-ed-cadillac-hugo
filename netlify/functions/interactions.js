const errorHandler = require('./utils/error-handler');
const InteractionService = require('./utils/interaction-service');
const FollowupService = require('./utils/followup-service');
const DatabaseService = require('./utils/database-service');

/**
 * Interactions API
 * Comprehensive API for managing customer interactions and touchpoints
 */
exports.handler = async function(event, context) {
  // Check authentication (simplified - in production use proper JWT validation)
  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return errorHandler.unauthorizedError('Authentication required');
  }

  try {
    const path = event.path.replace('/.netlify/functions/interactions', '');
    const method = event.httpMethod;

    // Parse path parameters
    const pathParts = path.split('/').filter(p => p);
    const resourceId = pathParts[0];
    const subResource = pathParts[1];

    switch (`${method} ${path}`) {
      case 'GET /timeline':
        return await getCustomerTimeline(event);
      case 'GET /stats':
        return await getInteractionStats(event);
      case 'GET /summary':
        return await getInteractionSummary(event);
      case 'GET /search':
        return await searchInteractions(event);
      case 'POST /log':
        return await logInteraction(event);
      case 'POST /log-automated':
        return await logAutomatedInteraction(event);
      case 'POST /log-sales':
        return await logSalesInteraction(event);
      case 'POST /log-customer':
        return await logCustomerInteraction(event);
      case 'GET /types':
        return await getInteractionTypes(event);
      case `GET /${resourceId}`:
        return await getInteraction(event, resourceId);
      case `PUT /${resourceId}`:
        return await updateInteraction(event, resourceId);
      case `DELETE /${resourceId}`:
        return await deleteInteraction(event, resourceId);
      default:
        return errorHandler.notFoundError('Endpoint not found');
    }

  } catch (error) {
    console.error('Interactions API error:', error);
    return errorHandler.serverError('Failed to process interaction request', error);
  }
};

/**
 * Get customer interaction timeline
 */
async function getCustomerTimeline(event) {
  const customerId = event.queryStringParameters?.customer_id;
  if (!customerId) {
    return errorHandler.validationError('Customer ID is required');
  }

  const options = {
    limit: parseInt(event.queryStringParameters?.limit) || 50,
    offset: parseInt(event.queryStringParameters?.offset) || 0,
    interaction_types: event.queryStringParameters?.types ? event.queryStringParameters.types.split(',') : [],
    date_from: event.queryStringParameters?.date_from,
    date_to: event.queryStringParameters?.date_to,
    sales_rep_id: event.queryStringParameters?.sales_rep_id,
    include_lead_interactions: event.queryStringParameters?.include_leads !== 'false'
  };

  try {
    const timeline = await InteractionService.getCustomerTimeline(customerId, options);

    return errorHandler.createSuccessResponse({
      customer_id: customerId,
      interactions: timeline,
      total: timeline.length,
      options
    });

  } catch (error) {
    console.error('Error getting customer timeline:', error);
    return errorHandler.serverError('Failed to get customer timeline', error);
  }
}

/**
 * Get interaction statistics
 */
async function getInteractionStats(event) {
  const customerId = event.queryStringParameters?.customer_id;
  const days = parseInt(event.queryStringParameters?.days) || 30;

  if (!customerId) {
    return errorHandler.validationError('Customer ID is required');
  }

  try {
    const stats = await InteractionService.getCustomerInteractionStats(customerId, days);

    return errorHandler.createSuccessResponse({
      customer_id: customerId,
      period_days: days,
      stats
    });

  } catch (error) {
    console.error('Error getting interaction stats:', error);
    return errorHandler.serverError('Failed to get interaction stats', error);
  }
}

/**
 * Get interaction summary for dashboard
 */
async function getInteractionSummary(event) {
  const days = parseInt(event.queryStringParameters?.days) || 30;

  try {
    const summary = await InteractionService.getInteractionSummary(days);

    return errorHandler.createSuccessResponse({
      period_days: days,
      summary
    });

  } catch (error) {
    console.error('Error getting interaction summary:', error);
    return errorHandler.serverError('Failed to get interaction summary', error);
  }
}

/**
 * Search interactions
 */
async function searchInteractions(event) {
  const searchCriteria = {
    query: event.queryStringParameters?.q || '',
    interaction_type: event.queryStringParameters?.type,
    customer_id: event.queryStringParameters?.customer_id,
    sales_rep_id: event.queryStringParameters?.sales_rep_id,
    date_from: event.queryStringParameters?.date_from,
    date_to: event.queryStringParameters?.date_to,
    limit: parseInt(event.queryStringParameters?.limit) || 50,
    offset: parseInt(event.queryStringParameters?.offset) || 0
  };

  try {
    const results = await InteractionService.searchInteractions(searchCriteria);

    return errorHandler.createSuccessResponse({
      search_criteria: searchCriteria,
      interactions: results,
      total: results.length
    });

  } catch (error) {
    console.error('Error searching interactions:', error);
    return errorHandler.serverError('Failed to search interactions', error);
  }
}

/**
 * Log a general interaction
 */
async function logInteraction(event) {
  let interactionData;
  try {
    interactionData = JSON.parse(event.body);
  } catch (e) {
    return errorHandler.validationError('Invalid JSON in request body');
  }

  const { customer_id, interaction_type } = interactionData;

  if (!customer_id || !interaction_type) {
    return errorHandler.validationError('Missing required fields', {
      customer_id: !customer_id ? 'Customer ID is required' : null,
      interaction_type: !interaction_type ? 'Interaction type is required' : null
    });
  }

   try {
     const interaction = await InteractionService.logCustomerInteraction(customerData);

     // Schedule follow-ups based on the customer interaction
     try {
       await FollowupService.scheduleFollowups(interaction.customer_id, interaction.lead_id, 'interaction_added');
       console.log(`Follow-ups scheduled for customer interaction ${interaction.id}`);
     } catch (followupError) {
       console.error('Error scheduling follow-ups for customer interaction:', followupError);
       // Continue with success response even if follow-up scheduling fails
     }

     return errorHandler.createSuccessResponse({
       message: 'Customer interaction logged successfully',
       interaction
     });

   } catch (error) {
     console.error('Error logging customer interaction:', error);
     return errorHandler.serverError('Failed to log customer interaction', error);
   }
}

/**
 * Log an automated interaction (email, SMS, etc.)
 */
async function logAutomatedInteraction(event) {
  let automatedData;
  try {
    automatedData = JSON.parse(event.body);
  } catch (e) {
    return errorHandler.validationError('Invalid JSON in request body');
  }

  const { customer_id, type } = automatedData;

  if (!customer_id || !type) {
    return errorHandler.validationError('Missing required fields', {
      customer_id: !customer_id ? 'Customer ID is required' : null,
      type: !type ? 'Interaction type is required' : null
    });
  }

   try {
     const interaction = await InteractionService.logAutomatedInteraction(automatedData);

     // Schedule follow-ups based on the automated interaction
     try {
       await FollowupService.scheduleFollowups(interaction.customer_id, interaction.lead_id, 'interaction_added');
       console.log(`Follow-ups scheduled for automated interaction ${interaction.id}`);
     } catch (followupError) {
       console.error('Error scheduling follow-ups for automated interaction:', followupError);
       // Continue with success response even if follow-up scheduling fails
     }

     return errorHandler.createSuccessResponse({
       message: 'Automated interaction logged successfully',
       interaction
     });

   } catch (error) {
     console.error('Error logging automated interaction:', error);
     return errorHandler.serverError('Failed to log automated interaction', error);
   }
}

/**
 * Log a sales rep interaction
 */
async function logSalesInteraction(event) {
  let salesData;
  try {
    salesData = JSON.parse(event.body);
  } catch (e) {
    return errorHandler.validationError('Invalid JSON in request body');
  }

  const { customer_id, sales_rep_id, interaction_type } = salesData;

  if (!customer_id || !sales_rep_id || !interaction_type) {
    return errorHandler.validationError('Missing required fields', {
      customer_id: !customer_id ? 'Customer ID is required' : null,
      sales_rep_id: !sales_rep_id ? 'Sales rep ID is required' : null,
      interaction_type: !interaction_type ? 'Interaction type is required' : null
    });
  }

   try {
     const interaction = await InteractionService.logInteraction(interactionData);

     // Schedule follow-ups based on the interaction
     try {
       await FollowupService.scheduleFollowups(interaction.customer_id, interaction.lead_id, 'interaction_added');
       console.log(`Follow-ups scheduled for interaction ${interaction.id}`);
     } catch (followupError) {
       console.error('Error scheduling follow-ups for interaction:', followupError);
       // Continue with success response even if follow-up scheduling fails
     }

     return errorHandler.createSuccessResponse({
       message: 'Interaction logged successfully',
       interaction
     });

   } catch (error) {
     console.error('Error logging interaction:', error);
     return errorHandler.serverError('Failed to log interaction', error);
   }
}

/**
 * Log a customer-initiated interaction
 */
async function logCustomerInteraction(event) {
  let customerData;
  try {
    customerData = JSON.parse(event.body);
  } catch (e) {
    return errorHandler.validationError('Invalid JSON in request body');
  }

  const { customer_id, interaction_type } = customerData;

  if (!customer_id || !interaction_type) {
    return errorHandler.validationError('Missing required fields', {
      customer_id: !customer_id ? 'Customer ID is required' : null,
      interaction_type: !interaction_type ? 'Interaction type is required' : null
    });
  }

   try {
     const interaction = await InteractionService.logSalesInteraction(salesData);

     // Schedule follow-ups based on the sales interaction
     try {
       await FollowupService.scheduleFollowups(interaction.customer_id, interaction.lead_id, 'interaction_added');
       console.log(`Follow-ups scheduled for sales interaction ${interaction.id}`);
     } catch (followupError) {
       console.error('Error scheduling follow-ups for sales interaction:', followupError);
       // Continue with success response even if follow-up scheduling fails
     }

     return errorHandler.createSuccessResponse({
       message: 'Sales interaction logged successfully',
       interaction
     });

   } catch (error) {
     console.error('Error logging sales interaction:', error);
     return errorHandler.serverError('Failed to log sales interaction', error);
   }
}

/**
 * Get interaction types
 */
async function getInteractionTypes(event) {
  const interactionTypes = [
    { value: 'phone_call', label: 'Phone Call', category: 'communication' },
    { value: 'email', label: 'Email', category: 'communication' },
    { value: 'sms', label: 'SMS/Text', category: 'communication' },
    { value: 'in_person', label: 'In-Person Visit', category: 'communication' },
    { value: 'website_visit', label: 'Website Visit', category: 'digital' },
    { value: 'form_submission', label: 'Form Submission', category: 'digital' },
    { value: 'test_drive', label: 'Test Drive', category: 'sales' },
    { value: 'service_visit', label: 'Service Visit', category: 'service' },
    { value: 'note', label: 'Internal Note', category: 'internal' },
    { value: 'task', label: 'Task/Follow-up', category: 'internal' },
    { value: 'appointment', label: 'Appointment', category: 'sales' },
    { value: 'follow_up', label: 'Follow-up', category: 'sales' }
  ];

  return errorHandler.createSuccessResponse({
    interaction_types: interactionTypes
  });
}

/**
 * Get a specific interaction
 */
async function getInteraction(event, interactionId) {
  try {
    const interactions = await DatabaseService.getCustomerInteractions(null, 1, interactionId);

    if (!interactions || interactions.length === 0) {
      return errorHandler.notFoundError('Interaction not found');
    }

    return errorHandler.createSuccessResponse({
      interaction: interactions[0]
    });

  } catch (error) {
    console.error('Error getting interaction:', error);
    return errorHandler.serverError('Failed to get interaction', error);
  }
}

/**
 * Update an interaction
 */
async function updateInteraction(event, interactionId) {
  let updateData;
  try {
    updateData = JSON.parse(event.body);
  } catch (e) {
    return errorHandler.validationError('Invalid JSON in request body');
  }

  // Remove fields that shouldn't be updated
  delete updateData.id;
  delete updateData.customer_id;
  delete updateData.created_at;
  delete updateData.created_by;

  if (Object.keys(updateData).length === 0) {
    return errorHandler.validationError('No valid fields to update');
  }

  try {
    // For now, we'll need to implement update in DatabaseService
    // Since the existing DatabaseService doesn't have updateInteraction, we'll use direct query
    const allowedFields = [
      'lead_id', 'interaction_type', 'direction', 'subject', 'content', 'summary',
      'initiated_by', 'sales_rep_id', 'sales_rep_name', 'contact_method',
      'contact_details', 'outcome', 'next_action', 'next_action_date',
      'duration_minutes', 'tags', 'metadata', 'updated_by'
    ];

    const updateFields = [];
    const params = [interactionId];
    let paramIndex = 2;

    for (const [key, value] of Object.entries(updateData)) {
      if (allowedFields.includes(key)) {
        updateFields.push(`${key} = $${paramIndex}`);
        params.push(value);
        paramIndex++;
      }
    }

    if (updateFields.length === 0) {
      return errorHandler.validationError('No valid fields to update');
    }

    const sql = `
      UPDATE interactions
      SET ${updateFields.join(', ')}, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    const result = await DatabaseService.query(sql, params);

    if (result.rows.length === 0) {
      return errorHandler.notFoundError('Interaction not found');
    }

    return errorHandler.createSuccessResponse({
      message: 'Interaction updated successfully',
      interaction: result.rows[0]
    });

  } catch (error) {
    console.error('Error updating interaction:', error);
    return errorHandler.serverError('Failed to update interaction', error);
  }
}

/**
 * Delete an interaction
 */
async function deleteInteraction(event, interactionId) {
  try {
    const sql = 'DELETE FROM interactions WHERE id = $1 RETURNING *';
    const result = await DatabaseService.query(sql, [interactionId]);

    if (result.rows.length === 0) {
      return errorHandler.notFoundError('Interaction not found');
    }

    return errorHandler.createSuccessResponse({
      message: 'Interaction deleted successfully',
      interaction: result.rows[0]
    });

  } catch (error) {
    console.error('Error deleting interaction:', error);
    return errorHandler.serverError('Failed to delete interaction', error);
  }
}