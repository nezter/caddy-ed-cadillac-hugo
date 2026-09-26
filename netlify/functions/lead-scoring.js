const errorHandler = require('./utils/error-handler');
const { authenticateRequest } = require('./utils/auth-middleware');
const LeadScoringService = require('./utils/lead-scoring-service');
const DatabaseService = require('./utils/database-service');

/**
 * Lead Scoring API
 * Handles lead scoring operations and analytics
 */
exports.handler = async function(event, context) {
  try {
    // Authenticate and check permissions
    const authResult = await authenticateRequest(event, {
      requiredPermissions: ['manage_leads']
    });

    if (!authResult.authenticated) {
      return authResult.error;
    }

    const user = authResult.user;

    switch (event.httpMethod) {
      case 'POST':
        return await handleUpdateLeadScore(event, user);
      case 'GET':
        return await handleGetLeadScoringAnalytics(event, user);
      default:
        return errorHandler.forbiddenError('Method not allowed');
    }
  } catch (error) {
    console.error('Lead scoring API error:', error);
    return errorHandler.serverError('Lead scoring operation failed');
  }
};

/**
 * POST /api/lead-scoring - Update lead score
 */
async function handleUpdateLeadScore(event, user) {
  const params = event.queryStringParameters || {};

  if (!params.leadId) {
    return errorHandler.validationError('Lead ID is required');
  }

  try {
    // Update lead score
    const result = await updateLeadScore(params.leadId);

    if (!result) {
      return errorHandler.notFoundError('Lead not found');
    }

    return errorHandler.createSuccessResponse(result, 'Lead score updated successfully');

  } catch (error) {
    console.error('Error updating lead score:', error);
    return errorHandler.serverError('Failed to update lead score');
  }
}

/**
 * GET /api/lead-scoring - Get lead scoring analytics
 */
async function handleGetLeadScoringAnalytics(event, user) {
  const params = event.queryStringParameters || {};

  try {
    // Get scoring analytics
    const analytics = await getLeadScoringAnalytics(params.timeframe || '30d');

    return errorHandler.createSuccessResponse(analytics, 'Lead scoring analytics retrieved successfully');

  } catch (error) {
    console.error('Error getting lead scoring analytics:', error);
    return errorHandler.serverError('Failed to get lead scoring analytics');
  }
}

/**
 * Update lead score based on new interactions or data changes
 */
async function updateLeadScore(leadId) {
  try {
    // Get lead data and recent interactions
    const lead = await DatabaseService.getLead(leadId);
    if (!lead) return null;

    // Get recent interactions (last 30 days)
    const interactions = await DatabaseService.getLeadInteractions(leadId, 30);

    // Calculate updated score
    const newScore = await LeadScoringService.updateDynamicScore(leadId, interactions);

    // Update lead score in database
    await DatabaseService.updateLead(leadId, { score: newScore });

    return {
      leadId,
      oldScore: lead.score,
      newScore,
      priority: LeadScoringService.getPriorityLevel(newScore),
      recommendedActions: LeadScoringService.getRecommendedActions(newScore, interactions)
    };

  } catch (error) {
    console.error('Error updating lead score:', error);
    throw error;
  }
}

/**
 * Get lead scoring analytics
 */
async function getLeadScoringAnalytics(timeframe = '30d') {
  try {
    // Parse timeframe
    const days = parseTimeframe(timeframe);

    // Get scoring distribution
    const scoreDistribution = await DatabaseService.getLeadScoreDistribution(days);

    // Get average scores by source
    const scoresBySource = await DatabaseService.getAverageScoresBySource(days);

    // Get priority distribution
    const priorityDistribution = await DatabaseService.getLeadPriorityDistribution(days);

    // Get scoring trends
    const scoringTrends = await DatabaseService.getLeadScoringTrends(days);

    return {
      timeframe,
      scoreDistribution,
      scoresBySource,
      priorityDistribution,
      scoringTrends,
      summary: {
        // The aggregate queries reach this function through node-postgres,
        // which returns COUNT(*) and friends as STRINGS. `sum + item.count`
        // therefore concatenated rather than added: a five-band distribution
        // of 7/14/23/11/4 came back as totalLeads "071423114". Coerced here so
        // the numbers a dashboard prints are the numbers in the database.
        totalLeads: scoreDistribution.reduce((sum, item) => sum + toCount(item.count), 0),
        averageScore: calculateAverageScore(scoreDistribution),
        hotLeadsPercentage: calculatePriorityPercentage(priorityDistribution, 'hot'),
        conversionRateByScore: await DatabaseService.getConversionRateByScore(days)
      }
    };

  } catch (error) {
    console.error('Error getting lead scoring analytics:', error);
    throw error;
  }
}

/**
 * Coerce a COUNT/SUM that arrived from node-postgres as a string.
 * @param {any} value - raw column value
 * @returns {number} - 0 when the value is absent or unparseable
 */
function toCount(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Parse timeframe string to days
 */
function parseTimeframe(timeframe) {
  const match = timeframe.match(/^(\d+)([dwmy])$/);
  if (!match) return 30;

  const value = parseInt(match[1]);
  const unit = match[2];

  switch (unit) {
    case 'd': return value;
    case 'w': return value * 7;
    case 'm': return value * 30;
    case 'y': return value * 365;
    default: return 30;
  }
}

/**
 * Calculate average score from distribution
 */
function calculateAverageScore(distribution) {
  if (!distribution || distribution.length === 0) return 0;

  let totalScore = 0;
  let totalCount = 0;

  distribution.forEach(item => {
    if (!item.score_range) return;
    const scoreRange = String(item.score_range).split('-');
    const avgScore = (parseInt(scoreRange[0], 10) + parseInt(scoreRange[1], 10)) / 2;
    const count = toCount(item.count);
    if (!Number.isFinite(avgScore) || !count) return;
    totalScore += avgScore * count;
    totalCount += count;
  });

  return totalCount > 0 ? Math.round(totalScore / totalCount) : 0;
}

/**
 * Calculate percentage for a specific priority level
 */
function calculatePriorityPercentage(distribution, priority) {
  if (!distribution || distribution.length === 0) return 0;

  // Same string/number trap as the totalLeads reduce: the counts arrive as
  // strings, so the total concatenated and every percentage rounded to 0.
  const total = distribution.reduce((sum, item) => sum + toCount(item.count), 0);
  const priorityItem = distribution.find(item => item.priority === priority);

  return total > 0 ? Math.round((toCount(priorityItem?.count) / total) * 100) : 0;
}