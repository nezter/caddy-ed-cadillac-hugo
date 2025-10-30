const errorHandler = require('./utils/error-handler');
const DatabaseService = require('./utils/database-service');
const { authenticateRequest } = require('./utils/auth-middleware');
const { validateBody, validateQuery, validateParams, campaignSchemas, commonSchemas } = require('./utils/validation-middleware');
const { applySecurity, createSecureResponse } = require('./utils/security-middleware');
const Joi = require('joi');

/**
 * Convert error handler response to secure response
 */
function toSecureResponse(errorResponse, rateLimitHeaders) {
  return createSecureResponse(
    errorResponse.statusCode || 500,
    {
      success: false,
      error: errorResponse.body?.error || 'Unknown error',
      message: errorResponse.body?.message,
      details: errorResponse.body?.details
    },
    rateLimitHeaders
  );
}

/**
 * Follow-up Campaigns API
 * Manages automated follow-up campaigns
 */
exports.handler = async function(event, context) {
  // Apply security checks (CORS, rate limiting, headers)
  const securityResult = await applySecurity(event, {
    enableRateLimit: true,
    maxRequests: 100,
    windowMs: 60000 // 1 minute
  });

  if (securityResult) {
    return securityResult;
  }

  // Authenticate request with proper JWT validation
  const auth = await authenticateRequest(event, {
    requireAuth: true,
    allowedRoles: ['admin', 'manager', 'sales_rep'],
    requiredPermissions: ['campaigns_read', 'campaigns_write']
  });

  if (!auth.authenticated) {
    return createSecureResponse(401, auth.error.body);
  }

  try {
    const path = event.path.replace('/.netlify/functions/followup-campaigns', '');
    const method = event.httpMethod;

    // Parse path parameters
    const pathParts = path.split('/').filter(p => p);
    const resourceId = pathParts[0];
    const subResource = pathParts[1];

    switch (`${method} ${path}`) {
      case 'GET /':
        return await getCampaigns(event);
      case 'POST /':
        return await createCampaign(event);
      case 'GET /stats':
        return await getCampaignStats(event);
      case 'GET /active':
        return await getActiveCampaigns(event);
      case `GET /${resourceId}`:
        return await getCampaign(event, resourceId);
      case `PUT /${resourceId}`:
        return await updateCampaign(event, resourceId);
      case `DELETE /${resourceId}`:
        return await deleteCampaign(event, resourceId);
      case `POST /${resourceId}/activate`:
        return await activateCampaign(event, resourceId);
      case `POST /${resourceId}/deactivate`:
        return await deactivateCampaign(event, resourceId);
      case `GET /${resourceId}/performance`:
        return await getCampaignPerformance(event, resourceId);
      default:
        return toSecureResponse(errorHandler.notFoundError('Endpoint not found'), event.rateLimitHeaders);
    }

  } catch (error) {
    console.error('Follow-up Campaigns API error:', error);
    return createSecureResponse(500, {
      success: false,
      error: 'Failed to process campaign request',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    }, event.rateLimitHeaders);
  }
};

/**
 * Get all campaigns with optional filtering
 */
async function getCampaigns(event) {
  // Validate query parameters
  const queryValidation = validateQuery(Joi.object({
    active: Joi.boolean(),
    type: Joi.string().valid('nurture', 're_engagement', 'welcome', 'birthday', 'anniversary', 'holiday', 'custom'),
    audience: Joi.string().valid('all', 'prospects', 'leads', 'active_customers', 'inactive_customers', 'vip_customers'),
    ...commonSchemas.pagination,
    ...commonSchemas.sorting
  }))(event);

  if (!queryValidation.isValid) {
    return queryValidation.error;
  }

  const filters = {
    is_active: queryValidation.data.active,
    campaign_type: queryValidation.data.type,
    target_audience: queryValidation.data.audience,
    limit: queryValidation.data.limit,
    offset: queryValidation.data.offset,
    sort_by: queryValidation.data.sort_by,
    sort_order: queryValidation.data.sort_order
  };

  try {
    let sql = 'SELECT * FROM followup_campaigns WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (filters.is_active !== undefined) {
      sql += ` AND is_active = $${paramIndex}`;
      params.push(filters.is_active);
      paramIndex++;
    }

    if (filters.campaign_type) {
      sql += ` AND campaign_type = $${paramIndex}`;
      params.push(filters.campaign_type);
      paramIndex++;
    }

    if (filters.target_audience) {
      sql += ` AND target_audience = $${paramIndex}`;
      params.push(filters.target_audience);
      paramIndex++;
    }

    // Add sorting
    const validSortFields = ['name', 'campaign_type', 'created_at', 'updated_at', 'priority'];
    const sortField = validSortFields.includes(filters.sort_by) ? filters.sort_by : 'created_at';
    const sortOrder = filters.sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    sql += ` ORDER BY ${sortField} ${sortOrder}`;

    // Add pagination
    sql += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(filters.limit, filters.offset);

    const result = await DatabaseService.query(sql, params);

    // Get total count for pagination
    let countSql = 'SELECT COUNT(*) as total FROM followup_campaigns WHERE 1=1';
    const countParams = params.slice(0, -2); // Remove limit and offset
    const countResult = await DatabaseService.query(countSql, countParams);

    return createSecureResponse(200, {
      success: true,
      campaigns: result.rows,
      total: parseInt(countResult.rows[0].total),
      limit: filters.limit,
      offset: filters.offset,
      filters
    }, event.rateLimitHeaders);

  } catch (error) {
    console.error('Error getting campaigns:', error);
    return createSecureResponse(500, {
      success: false,
      error: 'Failed to get campaigns',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    }, event.rateLimitHeaders);
  }
}

/**
 * Create a new campaign
 */
async function createCampaign(event) {
  // Validate request body
  const bodyValidation = validateBody(campaignSchemas.create)(event);
  if (!bodyValidation.isValid) {
    return createSecureResponse(400, bodyValidation.error.body, event.rateLimitHeaders);
  }

  const campaignData = bodyValidation.data;

  try {
    const sql = `
      INSERT INTO followup_campaigns (
        name, description, campaign_type, is_active, priority, target_audience,
        start_date, end_date, timezone, tags, metadata, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `;

    const params = [
      campaignData.name,
      campaignData.description || '',
      campaignData.campaign_type,
      campaignData.is_active !== false,
      campaignData.priority || 1,
      campaignData.target_audience || 'all',
      campaignData.start_date,
      campaignData.end_date,
      campaignData.timezone || 'America/New_York',
      campaignData.tags || [],
      campaignData.metadata || {},
      campaignData.created_by || 'system'
    ];

    const result = await DatabaseService.query(sql, params);

    return createSecureResponse(201, {
      success: true,
      message: 'Campaign created successfully',
      campaign: result.rows[0]
    }, event.rateLimitHeaders);

  } catch (error) {
    console.error('Error creating campaign:', error);
    return toSecureResponse(errorHandler.serverError('Failed to create campaign', error), event.rateLimitHeaders);
  }
}

/**
 * Get campaign statistics
 */
async function getCampaignStats(event) {
  // Validate query parameters
  const queryValidation = validateQuery(Joi.object({
    days: Joi.number().integer().min(1).max(365).default(30)
  }))(event);

  if (!queryValidation.isValid) {
    return queryValidation.error;
  }

  const days = queryValidation.data.days;

  try {
    const sql = `
      SELECT
        COUNT(*) as total_campaigns,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active_campaigns,
        COUNT(CASE WHEN campaign_type = 'nurture' THEN 1 END) as nurture_campaigns,
        COUNT(CASE WHEN campaign_type = 're_engagement' THEN 1 END) as reengagement_campaigns,
        COUNT(CASE WHEN campaign_type = 'welcome' THEN 1 END) as welcome_campaigns,
        SUM(total_sent) as total_sent_all,
        SUM(total_opened) as total_opened_all,
        SUM(total_clicked) as total_clicked_all,
        SUM(total_converted) as total_converted_all,
        ROUND(
          CASE
            WHEN SUM(total_sent) > 0
            THEN (SUM(total_converted)::decimal / SUM(total_sent)) * 100
            ELSE 0
          END, 2
        ) as overall_conversion_rate
      FROM followup_campaigns
      WHERE created_at >= NOW() - INTERVAL '${days} days'
    `;

    const result = await DatabaseService.query(sql);

    return errorHandler.createSuccessResponse({
      period_days: days,
      stats: result.rows[0]
    });

  } catch (error) {
    console.error('Error getting campaign stats:', error);
    return toSecureResponse(errorHandler.serverError('Failed to get campaign stats', error), event.rateLimitHeaders);
  }
}

/**
 * Get active campaigns
 */
async function getActiveCampaigns(event) {
  try {
    const sql = `
      SELECT * FROM followup_campaigns
      WHERE is_active = true
        AND (start_date IS NULL OR start_date <= NOW())
        AND (end_date IS NULL OR end_date >= NOW())
      ORDER BY priority DESC, created_at DESC
    `;

    const result = await DatabaseService.query(sql);

    return errorHandler.createSuccessResponse({
      active_campaigns: result.rows,
      total: result.rows.length
    });

  } catch (error) {
    console.error('Error getting active campaigns:', error);
    return toSecureResponse(errorHandler.serverError('Failed to get active campaigns', error), event.rateLimitHeaders);
  }
}

/**
 * Get a specific campaign
 */
async function getCampaign(event, campaignId) {
  // Validate campaign ID
  const paramsValidation = validateParams(commonSchemas.id)(event);
  if (!paramsValidation.isValid) {
    return paramsValidation.error;
  }
  try {
    const sql = 'SELECT * FROM followup_campaigns WHERE id = $1';
    const result = await DatabaseService.query(sql, [campaignId]);

    if (result.rows.length === 0) {
      return toSecureResponse(errorHandler.notFoundError('Campaign not found'), event.rateLimitHeaders);
    }

    // Get associated rules count
    const rulesSql = 'SELECT COUNT(*) as rules_count FROM followup_rules WHERE campaign_id = $1';
    const rulesResult = await DatabaseService.query(rulesSql, [campaignId]);

    // Get associated followups count
    const followupsSql = 'SELECT COUNT(*) as followups_count FROM followups WHERE campaign_id = $1';
    const followupsResult = await DatabaseService.query(followupsSql, [campaignId]);

    const campaign = result.rows[0];
    campaign.rules_count = parseInt(rulesResult.rows[0].rules_count);
    campaign.followups_count = parseInt(followupsResult.rows[0].followups_count);

    return errorHandler.createSuccessResponse({
      campaign
    });

  } catch (error) {
    console.error('Error getting campaign:', error);
    return errorHandler.serverError('Failed to get campaign', error);
  }
}

/**
 * Update a campaign
 */
async function updateCampaign(event, campaignId) {
  // Validate campaign ID
  const paramsValidation = validateParams(commonSchemas.id)(event);
  if (!paramsValidation.isValid) {
    return paramsValidation.error;
  }

  // Validate request body
  const bodyValidation = validateBody(campaignSchemas.update)(event);
  if (!bodyValidation.isValid) {
    return bodyValidation.error;
  }

  const updateData = bodyValidation.data;

  try {
    const allowedFields = [
      'name', 'description', 'campaign_type', 'is_active', 'priority', 'target_audience',
      'start_date', 'end_date', 'timezone', 'tags', 'metadata', 'updated_by'
    ];

    const updateFields = [];
    const params = [campaignId];
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

    updateFields.push('updated_at = NOW()');

    const sql = `
      UPDATE followup_campaigns
      SET ${updateFields.join(', ')}
      WHERE id = $1
      RETURNING *
    `;

    const result = await DatabaseService.query(sql, params);

    if (result.rows.length === 0) {
      return errorHandler.notFoundError('Campaign not found');
    }

    return errorHandler.createSuccessResponse({
      message: 'Campaign updated successfully',
      campaign: result.rows[0]
    });

  } catch (error) {
    console.error('Error updating campaign:', error);
    return errorHandler.serverError('Failed to update campaign', error);
  }
}

/**
 * Delete a campaign
 */
async function deleteCampaign(event, campaignId) {
  try {
    // Check if campaign has associated rules or followups
    const rulesSql = 'SELECT COUNT(*) as rules_count FROM followup_rules WHERE campaign_id = $1';
    const rulesResult = await DatabaseService.query(rulesSql, [campaignId]);

    const followupsSql = 'SELECT COUNT(*) as followups_count FROM followups WHERE campaign_id = $1';
    const followupsResult = await DatabaseService.query(followupsSql, [campaignId]);

    if (parseInt(rulesResult.rows[0].rules_count) > 0 || parseInt(followupsResult.rows[0].followups_count) > 0) {
      return errorHandler.validationError('Cannot delete campaign with associated rules or followups', {
        rules_count: parseInt(rulesResult.rows[0].rules_count),
        followups_count: parseInt(followupsResult.rows[0].followups_count)
      });
    }

    const sql = 'DELETE FROM followup_campaigns WHERE id = $1 RETURNING *';
    const result = await DatabaseService.query(sql, [campaignId]);

    if (result.rows.length === 0) {
      return errorHandler.notFoundError('Campaign not found');
    }

    return errorHandler.createSuccessResponse({
      message: 'Campaign deleted successfully',
      campaign: result.rows[0]
    });

  } catch (error) {
    console.error('Error deleting campaign:', error);
    return errorHandler.serverError('Failed to delete campaign', error);
  }
}

/**
 * Activate a campaign
 */
async function activateCampaign(event, campaignId) {
  try {
    const sql = `
      UPDATE followup_campaigns
      SET is_active = true, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    const result = await DatabaseService.query(sql, [campaignId]);

    if (result.rows.length === 0) {
      return errorHandler.notFoundError('Campaign not found');
    }

    return errorHandler.createSuccessResponse({
      message: 'Campaign activated successfully',
      campaign: result.rows[0]
    });

  } catch (error) {
    console.error('Error activating campaign:', error);
    return errorHandler.serverError('Failed to activate campaign', error);
  }
}

/**
 * Deactivate a campaign
 */
async function deactivateCampaign(event, campaignId) {
  try {
    const sql = `
      UPDATE followup_campaigns
      SET is_active = false, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    const result = await DatabaseService.query(sql, [campaignId]);

    if (result.rows.length === 0) {
      return errorHandler.notFoundError('Campaign not found');
    }

    return errorHandler.createSuccessResponse({
      message: 'Campaign deactivated successfully',
      campaign: result.rows[0]
    });

  } catch (error) {
    console.error('Error deactivating campaign:', error);
    return errorHandler.serverError('Failed to deactivate campaign', error);
  }
}

/**
 * Get campaign performance metrics
 */
async function getCampaignPerformance(event, campaignId) {
  // Validate campaign ID
  const paramsValidation = validateParams(commonSchemas.id)(event);
  if (!paramsValidation.isValid) {
    return paramsValidation.error;
  }

  // Validate query parameters
  const queryValidation = validateQuery(Joi.object({
    days: Joi.number().integer().min(1).max(365).default(30)
  }))(event);

  if (!queryValidation.isValid) {
    return queryValidation.error;
  }

  const days = queryValidation.data.days;

  try {
    // Get campaign details
    const campaignSql = 'SELECT * FROM followup_campaigns WHERE id = $1';
    const campaignResult = await DatabaseService.query(campaignSql, [campaignId]);

    if (campaignResult.rows.length === 0) {
      return errorHandler.notFoundError('Campaign not found');
    }

    // Get performance metrics
    const performanceSql = `
      SELECT
        COUNT(*) as total_followups,
        COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent_followups,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_followups,
        COUNT(CASE WHEN status = 'skipped' THEN 1 END) as skipped_followups,
        COUNT(CASE WHEN status = 'error' THEN 1 END) as error_followups,
        COUNT(CASE WHEN email = true THEN 1 END) as email_followups,
        COUNT(CASE WHEN sms = true THEN 1 END) as sms_followups,
        ROUND(
          CASE
            WHEN COUNT(CASE WHEN status = 'sent' THEN 1 END) > 0
            THEN AVG(EXTRACT(EPOCH FROM (sent_date - scheduled_date))/3600)
            ELSE 0
          END, 2
        ) as avg_delay_hours
      FROM followups
      WHERE campaign_id = $1
        AND created_at >= NOW() - INTERVAL '${days} days'
    `;

    const performanceResult = await DatabaseService.query(performanceSql, [campaignId]);

    // Get rules associated with this campaign
    const rulesSql = 'SELECT id, name, trigger_count, success_count FROM followup_rules WHERE campaign_id = $1';
    const rulesResult = await DatabaseService.query(rulesSql, [campaignId]);

    return errorHandler.createSuccessResponse({
      campaign: campaignResult.rows[0],
      period_days: days,
      performance: performanceResult.rows[0],
      rules: rulesResult.rows
    });

  } catch (error) {
    console.error('Error getting campaign performance:', error);
    return errorHandler.serverError('Failed to get campaign performance', error);
  }
}