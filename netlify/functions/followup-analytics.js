/**
 * Follow-up Analytics API
 * Tracks email opens, clicks, and provides analytics data
 */

const DatabaseService = require('./utils/database-service');
const { createClient } = require('@supabase/supabase-js');
const { authenticateRequest } = require('./utils/auth-middleware');
const errorHandler = require('./utils/error-handler');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

exports.handler = async (event, context) => {
  // Authenticate request with proper JWT validation
  const auth = await authenticateRequest(event, {
    requireAuth: true,
    allowedRoles: ['admin', 'manager', 'sales_rep'],
    requiredPermissions: ['analytics_read']
  });

  if (!auth.authenticated) {
    return auth.error;
  }

  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const path = event.path.replace('/.netlify/functions/followup-analytics', '');
    const method = event.httpMethod;

    switch (method) {
      case 'GET':
        if (path.startsWith('/track/')) {
          return await handleTrackingPixel(event, headers);
        } else if (path === '/dashboard') {
          return await getAnalyticsDashboard(event, headers);
        } else if (path.startsWith('/campaign/')) {
          return await getCampaignAnalytics(event, headers);
        }
        break;

      case 'POST':
        if (path === '/track') {
          return await trackEvent(event, headers);
        } else if (path === '/click') {
          return await trackClick(event, headers);
        }
        break;

      default:
        return {
          statusCode: 405,
          headers,
          body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ error: 'Endpoint not found' })
    };

  } catch (error) {
    console.error('Follow-up analytics API error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message
      })
    };
  }
};

/**
 * Handle tracking pixel for email opens
 */
async function handleTrackingPixel(event, headers) {
  try {
    const trackingId = event.path.split('/track/')[1];

    if (!trackingId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Tracking ID required' })
      };
    }

    // Decode tracking ID (followup_id:customer_id encoded in base64)
    const decoded = Buffer.from(trackingId, 'base64').toString('utf8');
    const [followupId, customerId] = decoded.split(':');

    // Track email open event
    await trackAnalyticsEvent({
      followup_id: followupId,
      customer_id: customerId,
      event_type: 'opened',
      user_agent: event.headers['user-agent'],
      ip_address: event.headers['x-forwarded-for'] || event.headers['x-real-ip']
    });

    // Return 1x1 transparent pixel
    return {
      statusCode: 200,
      headers: {
        ...headers,
        'Content-Type': 'image/gif',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      },
      body: Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64').toString('base64'),
      isBase64Encoded: true
    };

  } catch (error) {
    console.error('Error handling tracking pixel:', error);
    // Still return pixel even on error to avoid broken images
    return {
      statusCode: 200,
      headers: {
        ...headers,
        'Content-Type': 'image/gif'
      },
      body: Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64').toString('base64'),
      isBase64Encoded: true
    };
  }
}

/**
 * Track analytics event
 */
async function trackEvent(event, headers) {
  try {
    const body = JSON.parse(event.body);
    const {
      followup_id,
      customer_id,
      event_type,
      link_clicked,
      user_agent,
      ip_address,
      metadata = {}
    } = body;

    if (!followup_id || !customer_id || !event_type) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'followup_id, customer_id, and event_type are required' })
      };
    }

    await trackAnalyticsEvent({
      followup_id,
      customer_id,
      event_type,
      link_clicked,
      user_agent: user_agent || event.headers['user-agent'],
      ip_address: ip_address || event.headers['x-forwarded-for'] || event.headers['x-real-ip'],
      metadata
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true })
    };

  } catch (error) {
    console.error('Error tracking event:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to track event' })
    };
  }
}

/**
 * Track link clicks
 */
async function trackClick(event, headers) {
  try {
    const body = JSON.parse(event.body);
    const { followup_id, customer_id, url, metadata = {} } = body;

    if (!followup_id || !customer_id || !url) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'followup_id, customer_id, and url are required' })
      };
    }

    await trackAnalyticsEvent({
      followup_id,
      customer_id,
      event_type: 'clicked',
      link_clicked: url,
      user_agent: event.headers['user-agent'],
      ip_address: event.headers['x-forwarded-for'] || event.headers['x-real-ip'],
      metadata
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true })
    };

  } catch (error) {
    console.error('Error tracking click:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to track click' })
    };
  }
}

/**
 * Get analytics dashboard data
 */
async function getAnalyticsDashboard(event, headers) {
  try {
    const queryParams = event.queryStringParameters || {};
    const days = parseInt(queryParams.days) || 30;

    // Get overall analytics
    const overallStats = await getOverallAnalytics(days);

    // Get campaign performance
    const campaignStats = await getCampaignPerformance(days);

    // Get recent activity
    const recentActivity = await getRecentActivity(days);

    // Get conversion attribution
    const conversionAttribution = await getConversionAttribution(days);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        data: {
          overall: overallStats,
          campaigns: campaignStats,
          recentActivity,
          conversions: conversionAttribution,
          period: `${days} days`
        }
      })
    };

  } catch (error) {
    console.error('Error getting analytics dashboard:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to get analytics data' })
    };
  }
}

/**
 * Get campaign-specific analytics
 */
async function getCampaignAnalytics(event, headers) {
  try {
    const campaignId = event.path.split('/campaign/')[1];
    const queryParams = event.queryStringParameters || {};
    const days = parseInt(queryParams.days) || 30;

    if (!campaignId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Campaign ID required' })
      };
    }

    const campaignStats = await getCampaignAnalyticsData(campaignId, days);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        data: campaignStats
      })
    };

  } catch (error) {
    console.error('Error getting campaign analytics:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to get campaign analytics' })
    };
  }
}

/**
 * Track analytics event in database
 */
async function trackAnalyticsEvent(eventData) {
  const sql = `
    INSERT INTO followup_analytics (
      followup_id, customer_id, campaign_id, event_type,
      link_clicked, user_agent, ip_address, metadata
    )
    SELECT
      $1, $2, f.campaign_id, $3, $4, $5, $6, $7
    FROM followups f
    WHERE f.id = $1
  `;

  const params = [
    eventData.followup_id,
    eventData.customer_id,
    eventData.event_type,
    eventData.link_clicked || null,
    eventData.user_agent || null,
    eventData.ip_address || null,
    JSON.stringify(eventData.metadata || {})
  ];

  try {
    await DatabaseService.query(sql, params);
  } catch (error) {
    console.error('Error tracking analytics event:', error);
  }
}

/**
 * Get overall analytics data
 */
async function getOverallAnalytics(days) {
  const sql = `
    SELECT
      COUNT(DISTINCT fa.followup_id) as total_followups,
      COUNT(DISTINCT CASE WHEN fa.event_type = 'sent' THEN fa.followup_id END) as sent_followups,
      COUNT(DISTINCT CASE WHEN fa.event_type = 'opened' THEN fa.followup_id END) as opened_followups,
      COUNT(DISTINCT CASE WHEN fa.event_type = 'clicked' THEN fa.followup_id END) as clicked_followups,
      COUNT(DISTINCT CASE WHEN fa.event_type = 'bounced' THEN fa.followup_id END) as bounced_followups,
      COUNT(DISTINCT CASE WHEN fa.event_type = 'unsubscribed' THEN fa.followup_id END) as unsubscribed_followups,
      ROUND(
        COUNT(DISTINCT CASE WHEN fa.event_type = 'opened' THEN fa.followup_id END)::decimal /
        NULLIF(COUNT(DISTINCT CASE WHEN fa.event_type = 'sent' THEN fa.followup_id END), 0) * 100, 2
      ) as open_rate,
      ROUND(
        COUNT(DISTINCT CASE WHEN fa.event_type = 'clicked' THEN fa.followup_id END)::decimal /
        NULLIF(COUNT(DISTINCT CASE WHEN fa.event_type = 'opened' THEN fa.followup_id END), 0) * 100, 2
      ) as click_rate
    FROM followup_analytics fa
    WHERE fa.event_timestamp >= NOW() - INTERVAL '${days} days'
  `;

  try {
    const result = await DatabaseService.query(sql);
    return result.rows[0] || {};
  } catch (error) {
    console.error('Error getting overall analytics:', error);
    return {};
  }
}

/**
 * Get campaign performance data
 */
async function getCampaignPerformance(days) {
  const sql = `
    SELECT
      fc.name as campaign_name,
      fc.id as campaign_id,
      COUNT(DISTINCT fa.followup_id) as total_followups,
      COUNT(DISTINCT CASE WHEN fa.event_type = 'opened' THEN fa.followup_id END) as opened_followups,
      COUNT(DISTINCT CASE WHEN fa.event_type = 'clicked' THEN fa.followup_id END) as clicked_followups,
      ROUND(
        COUNT(DISTINCT CASE WHEN fa.event_type = 'opened' THEN fa.followup_id END)::decimal /
        NULLIF(COUNT(DISTINCT fa.followup_id), 0) * 100, 2
      ) as open_rate
    FROM followup_campaigns fc
    LEFT JOIN followup_analytics fa ON fc.id = fa.campaign_id
      AND fa.event_timestamp >= NOW() - INTERVAL '${days} days'
    GROUP BY fc.id, fc.name
    ORDER BY total_followups DESC
    LIMIT 10
  `;

  try {
    const result = await DatabaseService.query(sql);
    return result.rows;
  } catch (error) {
    console.error('Error getting campaign performance:', error);
    return [];
  }
}

/**
 * Get recent activity
 */
async function getRecentActivity(limit = 50) {
  const sql = `
    SELECT
      fa.event_type,
      fa.event_timestamp,
      c.first_name,
      c.last_name,
      fc.name as campaign_name,
      fa.link_clicked
    FROM followup_analytics fa
    JOIN customers c ON fa.customer_id = c.id
    LEFT JOIN followup_campaigns fc ON fa.campaign_id = fc.id
    ORDER BY fa.event_timestamp DESC
    LIMIT $1
  `;

  try {
    const result = await DatabaseService.query(sql, [limit]);
    return result.rows;
  } catch (error) {
    console.error('Error getting recent activity:', error);
    return [];
  }
}

/**
 * Get conversion attribution data
 */
async function getConversionAttribution(days) {
  const sql = `
    SELECT
      fc.name as campaign_name,
      COUNT(DISTINCT fa.customer_id) as attributed_conversions,
      COUNT(DISTINCT fa.followup_id) as touchpoints
    FROM followup_analytics fa
    JOIN followup_campaigns fc ON fa.campaign_id = fc.id
    WHERE fa.event_type = 'clicked'
      AND fa.event_timestamp >= NOW() - INTERVAL '${days} days'
      AND EXISTS (
        SELECT 1 FROM interactions i
        WHERE i.customer_id = fa.customer_id
          AND i.type = 'conversion'
          AND i.created_at >= fa.event_timestamp
          AND i.created_at <= fa.event_timestamp + INTERVAL '30 days'
      )
    GROUP BY fc.id, fc.name
    ORDER BY attributed_conversions DESC
    LIMIT 10
  `;

  try {
    const result = await DatabaseService.query(sql);
    return result.rows;
  } catch (error) {
    console.error('Error getting conversion attribution:', error);
    return [];
  }
}

/**
 * Get campaign-specific analytics
 */
async function getCampaignAnalyticsData(campaignId, days) {
  const sql = `
    SELECT
      fc.name as campaign_name,
      COUNT(DISTINCT f.id) as total_followups,
      COUNT(DISTINCT CASE WHEN fa.event_type = 'sent' THEN f.id END) as sent_followups,
      COUNT(DISTINCT CASE WHEN fa.event_type = 'opened' THEN f.id END) as opened_followups,
      COUNT(DISTINCT CASE WHEN fa.event_type = 'clicked' THEN f.id END) as clicked_followups,
      ROUND(
        COUNT(DISTINCT CASE WHEN fa.event_type = 'opened' THEN f.id END)::decimal /
        NULLIF(COUNT(DISTINCT CASE WHEN fa.event_type = 'sent' THEN f.id END), 0) * 100, 2
      ) as open_rate,
      ROUND(
        COUNT(DISTINCT CASE WHEN fa.event_type = 'clicked' THEN f.id END)::decimal /
        NULLIF(COUNT(DISTINCT CASE WHEN fa.event_type = 'opened' THEN f.id END), 0) * 100, 2
      ) as click_rate
    FROM followup_campaigns fc
    LEFT JOIN followups f ON fc.id = f.campaign_id
    LEFT JOIN followup_analytics fa ON f.id = fa.followup_id
      AND fa.event_timestamp >= NOW() - INTERVAL '${days} days'
    WHERE fc.id = $1
    GROUP BY fc.id, fc.name
  `;

  try {
    const result = await DatabaseService.query(sql, [campaignId]);
    return result.rows[0] || {};
  } catch (error) {
    console.error('Error getting campaign analytics data:', error);
    return {};
  }
}