const errorHandler = require('./utils/error-handler');
const DatabaseService = require('./utils/database-service');

/**
 * Follow-up Campaigns API
 * Manages automated follow-up campaigns
 */
exports.handler = async function(event, context) {
  // Check authentication (simplified - in production use proper JWT validation)
  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return errorHandler.unauthorizedError('Authentication required');
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
        return errorHandler.notFoundError('Endpoint not found');
    }

  } catch (error) {
    console.error('Follow-up Campaigns API error:', error);
    return errorHandler.serverError('Failed to process campaign request', error);
  }
};

/**
 * Get all campaigns with optional filtering
 */
async function getCampaigns(event) {
  const filters = {
    is_active: event.queryStringParameters?.active ? event.queryStringParameters.active === 'true' : undefined,
    campaign_type: event.queryStringParameters?.type,
    target_audience: event.queryStringParameters?.audience,
    limit: parseInt(event.queryStringParameters?.limit) || 50,
    offset: parseInt(event.queryStringParameters?.offset) || 0,
    sort_by: event.queryStringParameters?.sort_by || 'created_at',
    sort_order: event.queryStringParameters?.sort_order || 'desc'
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

    return errorHandler.createSuccessResponse({
      campaigns: result.rows,
      total: parseInt(countResult.rows[0].total),
      limit: filters.limit,
      offset: filters.offset,
      filters
    });

  } catch (error) {
    console.error('Error getting campaigns:', error);
    return errorHandler.serverError('Failed to get campaigns', error);
  }
}

/**
 * Create a new campaign
 */
async function createCampaign(event) {
  let campaignData;
  try {
    campaignData = JSON.parse(event.body);
  } catch (e) {
    return errorHandler.validationError('Invalid JSON in request body');
  }

  const { name, campaign_type } = campaignData;

  if (!name || !campaign_type) {
    return errorHandler.validationError('Missing required fields', {
      name: !name ? 'Campaign name is required' : null,
      campaign_type: !campaign_type ? 'Campaign type is required' : null
    });
  }

  // Validate campaign type
  const validTypes = ['nurture', 're_engagement', 'welcome', 'birthday', 'anniversary', 'holiday', 'custom'];
  if (!validTypes.includes(campaign_type)) {
    return errorHandler.validationError('Invalid campaign type', {
      campaign_type: `Must be one of: ${validTypes.join(', ')}`
    });
  }

  // Validate target audience
  const validAudiences = ['all', 'prospects', 'leads', 'active_customers', 'inactive_customers', 'vip_customers'];
  if (campaignData.target_audience && !validAudiences.includes(campaignData.target_audience)) {
    return errorHandler.validationError('Invalid target audience', {
      target_audience: `Must be one of: ${validAudiences.join(', ')}`
    });
  }

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

    return errorHandler.createSuccessResponse({
      message: 'Campaign created successfully',
      campaign: result.rows[0]
    }, 'Campaign created');

  } catch (error) {
    console.error('Error creating campaign:', error);
    return errorHandler.serverError('Failed to create campaign', error);
  }
}

/**
 * Get campaign statistics
 */
async function getCampaignStats(event) {
  const days = parseInt(event.queryStringParameters?.days) || 30;

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
    return errorHandler.serverError('Failed to get campaign stats', error);
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
    return errorHandler.serverError('Failed to get active campaigns', error);
  }
}

/**
 * Get a specific campaign
 */
async function getCampaign(event, campaignId) {
  try {
    const sql = 'SELECT * FROM followup_campaigns WHERE id = $1';
    const result = await DatabaseService.query(sql, [campaignId]);

    if (result.rows.length === 0) {
      return errorHandler.notFoundError('Campaign not found');
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

  // Validate campaign type if provided
  if (updateData.campaign_type) {
    const validTypes = ['nurture', 're_engagement', 'welcome', 'birthday', 'anniversary', 'holiday', 'custom'];
    if (!validTypes.includes(updateData.campaign_type)) {
      return errorHandler.validationError('Invalid campaign type', {
        campaign_type: `Must be one of: ${validTypes.join(', ')}`
      });
    }
  }

  // Validate target audience if provided
  if (updateData.target_audience) {
    const validAudiences = ['all', 'prospects', 'leads', 'active_customers', 'inactive_customers', 'vip_customers'];
    if (!validAudiences.includes(updateData.target_audience)) {
      return errorHandler.validationError('Invalid target audience', {
        target_audience: `Must be one of: ${validAudiences.join(', ')}`
      });
    }
  }

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
  const days = parseInt(event.queryStringParameters?.days) || 30;

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