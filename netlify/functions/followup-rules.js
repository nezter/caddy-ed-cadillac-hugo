const errorHandler = require('./utils/error-handler');
const DatabaseService = require('./utils/database-service');
const FollowupRulesEngine = require('./utils/followup-rules-engine');
const { authenticateRequest } = require('./utils/auth-middleware');

/**
 * Follow-up Rules API
 * Manages automated follow-up rules and conditional logic
 */
exports.handler = async function(event, context) {
  // Authenticate request with proper JWT validation
  const auth = await authenticateRequest(event, {
    requireAuth: true,
    allowedRoles: ['admin', 'manager', 'sales_rep'],
    requiredPermissions: ['rules_read', 'rules_write']
  });

  if (!auth.authenticated) {
    return auth.error;
  }

  try {
    const path = event.path.replace('/.netlify/functions/followup-rules', '');
    const method = event.httpMethod;

    // Parse path parameters
    const pathParts = path.split('/').filter(p => p);
    const resourceId = pathParts[0];
    const subResource = pathParts[1];

    switch (`${method} ${path}`) {
      case 'GET /':
        return await getRules(event);
      case 'POST /':
        return await createRule(event);
      case 'GET /stats':
        return await getRulesStats(event);
      case 'GET /active':
        return await getActiveRules(event);
      case 'GET /triggers':
        return await getTriggerEvents(event);
      case `GET /${resourceId}`:
        return await getRule(event, resourceId);
      case `PUT /${resourceId}`:
        return await updateRule(event, resourceId);
      case `DELETE /${resourceId}`:
        return await deleteRule(event, resourceId);
      case `POST /${resourceId}/activate`:
        return await activateRule(event, resourceId);
      case `POST /${resourceId}/deactivate`:
        return await deactivateRule(event, resourceId);
      case `POST /${resourceId}/test`:
        return await testRule(event, resourceId);
      case `GET /${resourceId}/performance`:
        return await getRulePerformance(event, resourceId);
      default:
        return errorHandler.notFoundError('Endpoint not found');
    }

  } catch (error) {
    console.error('Follow-up Rules API error:', error);
    return errorHandler.serverError('Failed to process rule request', error);
  }
};

/**
 * Get all rules with optional filtering
 */
async function getRules(event) {
  const filters = {
    trigger_event: event.queryStringParameters?.trigger,
    campaign_id: event.queryStringParameters?.campaign_id,
    is_active: event.queryStringParameters?.active ? event.queryStringParameters.active === 'true' : undefined,
    limit: parseInt(event.queryStringParameters?.limit) || 50,
    offset: parseInt(event.queryStringParameters?.offset) || 0,
    sort_by: event.queryStringParameters?.sort_by || 'priority',
    sort_order: event.queryStringParameters?.sort_order || 'desc'
  };

  try {
    const rules = await FollowupRulesEngine.getRules(filters);

    // Apply sorting and pagination (since getRules doesn't handle these)
    let sortedRules = [...rules];

    // Sort
    const validSortFields = ['name', 'trigger_event', 'priority', 'created_at', 'updated_at'];
    const sortField = validSortFields.includes(filters.sort_by) ? filters.sort_by : 'priority';
    const sortOrder = filters.sort_order.toUpperCase() === 'ASC' ? 1 : -1;

    sortedRules.sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];

      if (sortField === 'created_at' || sortField === 'updated_at') {
        aVal = new Date(aVal);
        bVal = new Date(bVal);
      }

      if (aVal < bVal) return -1 * sortOrder;
      if (aVal > bVal) return 1 * sortOrder;
      return 0;
    });

    // Apply pagination
    const total = sortedRules.length;
    const paginatedRules = sortedRules.slice(filters.offset, filters.offset + filters.limit);

    return errorHandler.createSuccessResponse({
      rules: paginatedRules,
      total,
      limit: filters.limit,
      offset: filters.offset,
      filters
    });

  } catch (error) {
    console.error('Error getting rules:', error);
    return errorHandler.serverError('Failed to get rules', error);
  }
}

/**
 * Create a new rule
 */
async function createRule(event) {
  let ruleData;
  try {
    ruleData = JSON.parse(event.body);
  } catch (e) {
    return errorHandler.validationError('Invalid JSON in request body');
  }

  const { name, trigger_event } = ruleData;

  if (!name || !trigger_event) {
    return errorHandler.validationError('Missing required fields', {
      name: !name ? 'Rule name is required' : null,
      trigger_event: !trigger_event ? 'Trigger event is required' : null
    });
  }

  // Validate trigger event
  const validTriggers = [
    'lead_created', 'interaction_added', 'appointment_scheduled', 'appointment_completed',
    'customer_updated', 'lead_status_changed', 'test_drive_completed', 'purchase_completed'
  ];
  if (!validTriggers.includes(trigger_event)) {
    return errorHandler.validationError('Invalid trigger event', {
      trigger_event: `Must be one of: ${validTriggers.join(', ')}`
    });
  }

  try {
    const rule = await FollowupRulesEngine.createRule(ruleData);

    return errorHandler.createSuccessResponse({
      message: 'Rule created successfully',
      rule
    }, 'Rule created');

  } catch (error) {
    console.error('Error creating rule:', error);
    return errorHandler.serverError('Failed to create rule', error);
  }
}

/**
 * Get rules statistics
 */
async function getRulesStats(event) {
  const days = parseInt(event.queryStringParameters?.days) || 30;

  try {
    const stats = await FollowupRulesEngine.getRuleStats(null, days);

    // Get additional summary stats
    const summarySql = `
      SELECT
        COUNT(*) as total_rules,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active_rules,
        COUNT(DISTINCT trigger_event) as unique_triggers,
        SUM(trigger_count) as total_triggers,
        SUM(success_count) as total_successes,
        ROUND(
          CASE
            WHEN SUM(trigger_count) > 0
            THEN (SUM(success_count)::decimal / SUM(trigger_count)) * 100
            ELSE 0
          END, 2
        ) as overall_success_rate
      FROM followup_rules
      WHERE created_at >= NOW() - INTERVAL '${days} days'
    `;

    const summaryResult = await DatabaseService.query(summarySql);

    return errorHandler.createSuccessResponse({
      period_days: days,
      summary: summaryResult.rows[0],
      rule_performance: stats
    });

  } catch (error) {
    console.error('Error getting rules stats:', error);
    return errorHandler.serverError('Failed to get rules stats', error);
  }
}

/**
 * Get active rules
 */
async function getActiveRules(event) {
  try {
    const rules = await FollowupRulesEngine.getActiveRules('');

    return errorHandler.createSuccessResponse({
      active_rules: rules,
      total: rules.length
    });

  } catch (error) {
    console.error('Error getting active rules:', error);
    return errorHandler.serverError('Failed to get active rules', error);
  }
}

/**
 * Get available trigger events
 */
async function getTriggerEvents(event) {
  const triggerEvents = [
    { value: 'lead_created', label: 'Lead Created', description: 'When a new lead is created' },
    { value: 'interaction_added', label: 'Interaction Added', description: 'When any interaction is logged' },
    { value: 'appointment_scheduled', label: 'Appointment Scheduled', description: 'When an appointment is booked' },
    { value: 'appointment_completed', label: 'Appointment Completed', description: 'When an appointment is marked as completed' },
    { value: 'customer_updated', label: 'Customer Updated', description: 'When customer information is updated' },
    { value: 'lead_status_changed', label: 'Lead Status Changed', description: 'When lead status changes' },
    { value: 'test_drive_completed', label: 'Test Drive Completed', description: 'When a test drive is completed' },
    { value: 'purchase_completed', label: 'Purchase Completed', description: 'When a sale is completed' }
  ];

  return errorHandler.createSuccessResponse({
    trigger_events: triggerEvents
  });
}

/**
 * Get a specific rule
 */
async function getRule(event, ruleId) {
  try {
    const rules = await FollowupRulesEngine.getRules({ id: ruleId });

    if (rules.length === 0) {
      return errorHandler.notFoundError('Rule not found');
    }

    const rule = rules[0];

    // Get associated campaign info if exists
    if (rule.campaign_id) {
      const campaignSql = 'SELECT name, campaign_type FROM followup_campaigns WHERE id = $1';
      const campaignResult = await DatabaseService.query(campaignSql, [rule.campaign_id]);
      if (campaignResult.rows.length > 0) {
        rule.campaign_info = campaignResult.rows[0];
      }
    }

    // Get followups count
    const followupsSql = 'SELECT COUNT(*) as followups_count FROM followups WHERE rule_id = $1';
    const followupsResult = await DatabaseService.query(followupsSql, [ruleId]);
    rule.followups_count = parseInt(followupsResult.rows[0].followups_count);

    return errorHandler.createSuccessResponse({
      rule
    });

  } catch (error) {
    console.error('Error getting rule:', error);
    return errorHandler.serverError('Failed to get rule', error);
  }
}

/**
 * Update a rule
 */
async function updateRule(event, ruleId) {
  let updateData;
  try {
    updateData = JSON.parse(event.body);
  } catch (e) {
    return errorHandler.validationError('Invalid JSON in request body');
  }

  // Remove fields that shouldn't be updated
  delete updateData.id;
  delete updateData.created_at;
  delete updateData.created_by;

  if (Object.keys(updateData).length === 0) {
    return errorHandler.validationError('No valid fields to update');
  }

  // Validate trigger event if provided
  if (updateData.trigger_event) {
    const validTriggers = [
      'lead_created', 'interaction_added', 'appointment_scheduled', 'appointment_completed',
      'customer_updated', 'lead_status_changed', 'test_drive_completed', 'purchase_completed'
    ];
    if (!validTriggers.includes(updateData.trigger_event)) {
      return errorHandler.validationError('Invalid trigger event', {
        trigger_event: `Must be one of: ${validTriggers.join(', ')}`
      });
    }
  }

  try {
    const rule = await FollowupRulesEngine.updateRule(ruleId, updateData);

    return errorHandler.createSuccessResponse({
      message: 'Rule updated successfully',
      rule
    });

  } catch (error) {
    console.error('Error updating rule:', error);
    return errorHandler.serverError('Failed to update rule', error);
  }
}

/**
 * Delete a rule
 */
async function deleteRule(event, ruleId) {
  try {
    // Check if rule has associated followups
    const followupsSql = 'SELECT COUNT(*) as followups_count FROM followups WHERE rule_id = $1';
    const followupsResult = await DatabaseService.query(followupsSql, [ruleId]);

    if (parseInt(followupsResult.rows[0].followups_count) > 0) {
      return errorHandler.validationError('Cannot delete rule with associated followups', {
        followups_count: parseInt(followupsResult.rows[0].followups_count)
      });
    }

    const rule = await FollowupRulesEngine.deleteRule(ruleId);

    return errorHandler.createSuccessResponse({
      message: 'Rule deleted successfully',
      rule
    });

  } catch (error) {
    console.error('Error deleting rule:', error);
    return errorHandler.serverError('Failed to delete rule', error);
  }
}

/**
 * Activate a rule
 */
async function activateRule(event, ruleId) {
  try {
    const rule = await FollowupRulesEngine.updateRule(ruleId, { is_active: true });

    return errorHandler.createSuccessResponse({
      message: 'Rule activated successfully',
      rule
    });

  } catch (error) {
    console.error('Error activating rule:', error);
    return errorHandler.serverError('Failed to activate rule', error);
  }
}

/**
 * Deactivate a rule
 */
async function deactivateRule(event, ruleId) {
  try {
    const rule = await FollowupRulesEngine.updateRule(ruleId, { is_active: false });

    return errorHandler.createSuccessResponse({
      message: 'Rule deactivated successfully',
      rule
    });

  } catch (error) {
    console.error('Error deactivating rule:', error);
    return errorHandler.serverError('Failed to deactivate rule', error);
  }
}

/**
 * Test a rule with sample data
 */
async function testRule(event, ruleId) {
  let testData;
  try {
    testData = JSON.parse(event.body);
  } catch (e) {
    return errorHandler.validationError('Invalid JSON in request body');
  }

  try {
    // Get the rule
    const rules = await FollowupRulesEngine.getRules({ id: ruleId });
    if (rules.length === 0) {
      return errorHandler.notFoundError('Rule not found');
    }

    const rule = rules[0];

    // Test the rule evaluation
    const shouldTrigger = await FollowupRulesEngine.evaluateRule(rule, testData);

    // Simulate what would happen if triggered
    let simulatedActions = [];
    if (shouldTrigger) {
      simulatedActions = rule.actions || [];
    }

    return errorHandler.createSuccessResponse({
      rule_id: ruleId,
      test_data: testData,
      should_trigger: shouldTrigger,
      simulated_actions: simulatedActions,
      rule_conditions: rule.conditions,
      rule_actions: rule.actions
    });

  } catch (error) {
    console.error('Error testing rule:', error);
    return errorHandler.serverError('Failed to test rule', error);
  }
}

/**
 * Get rule performance metrics
 */
async function getRulePerformance(event, ruleId) {
  const days = parseInt(event.queryStringParameters?.days) || 30;

  try {
    const stats = await FollowupRulesEngine.getRuleStats(ruleId, days);

    if (stats.length === 0) {
      return errorHandler.notFoundError('Rule not found or no performance data');
    }

    // Get additional metrics
    const metricsSql = `
      SELECT
        COUNT(*) as total_followups,
        COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent_followups,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_followups,
        COUNT(CASE WHEN status = 'skipped' THEN 1 END) as skipped_followups,
        COUNT(CASE WHEN status = 'error' THEN 1 END) as error_followups,
        ROUND(
          CASE
            WHEN COUNT(CASE WHEN status = 'sent' THEN 1 END) > 0
            THEN AVG(EXTRACT(EPOCH FROM (sent_date - scheduled_date))/3600)
            ELSE 0
          END, 2
        ) as avg_processing_time_hours
      FROM followups
      WHERE rule_id = $1
        AND created_at >= NOW() - INTERVAL '${days} days'
    `;

    const metricsResult = await DatabaseService.query(metricsSql, [ruleId]);

    return errorHandler.createSuccessResponse({
      rule_performance: stats[0],
      detailed_metrics: metricsResult.rows[0],
      period_days: days
    });

  } catch (error) {
    console.error('Error getting rule performance:', error);
    return errorHandler.serverError('Failed to get rule performance', error);
  }
}