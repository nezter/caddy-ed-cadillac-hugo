/**
 * Communication Preferences API
 * Manages customer communication preferences and opt-out handling
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
    requiredPermissions: ['preferences_read', 'preferences_write']
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
    const path = event.path.replace('/.netlify/functions/communication-preferences', '');
    const method = event.httpMethod;

    switch (method) {
      case 'GET':
        if (path.startsWith('/customer/')) {
          return await getCustomerPreferences(event, headers);
        } else if (path.startsWith('/unsubscribe/')) {
          return await handleUnsubscribe(event, headers);
        }
        break;

      case 'POST':
        if (path === '/update') {
          return await updatePreferences(event, headers);
        } else if (path === '/opt-out') {
          return await optOut(event, headers);
        }
        break;

      case 'PUT':
        return await updatePreferences(event, headers);

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
    console.error('Communication preferences API error:', error);
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
 * Get customer communication preferences
 */
async function getCustomerPreferences(event, headers) {
  try {
    const customerId = event.path.split('/customer/')[1];

    if (!customerId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Customer ID required' })
      };
    }

    // Get customer preferences
    const sql = `
      SELECT
        id,
        first_name,
        last_name,
        email,
        phone,
        email_consent,
        sms_consent,
        phone_consent,
        communication_preferences,
        consent_date,
        consent_source,
        gdpr_consent_withdrawn,
        consent_withdrawn_date,
        created_at,
        updated_at
      FROM customers
      WHERE id = $1
    `;

    const result = await DatabaseService.query(sql, [customerId]);

    if (result.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Customer not found' })
      };
    }

    const customer = result.rows[0];

    // Parse communication preferences JSON
    if (customer.communication_preferences) {
      customer.communication_preferences = JSON.parse(customer.communication_preferences);
    } else {
      // Default preferences
      customer.communication_preferences = {
        email: {
          marketing: true,
          newsletters: true,
          promotions: true,
          product_updates: true,
          service_reminders: true
        },
        sms: {
          marketing: false,
          reminders: true,
          service_updates: true
        },
        phone: {
          marketing: false,
          service_calls: true,
          survey_calls: false
        }
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        preferences: customer
      })
    };

  } catch (error) {
    console.error('Error getting customer preferences:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to get preferences' })
    };
  }
}

/**
 * Update customer communication preferences
 */
async function updatePreferences(event, headers) {
  try {
    const body = JSON.parse(event.body);
    const { customerId, preferences, consentSource = 'customer_portal' } = body;

    if (!customerId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Customer ID required' })
      };
    }

    // Validate preferences structure
    if (!preferences || typeof preferences !== 'object') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Valid preferences object required' })
      };
    }

    // Update customer preferences
    const sql = `
      UPDATE customers
      SET
        email_consent = $2,
        sms_consent = $3,
        phone_consent = $4,
        communication_preferences = $5,
        consent_date = NOW(),
        consent_source = $6,
        updated_at = NOW()
      WHERE id = $1
      RETURNING id, email_consent, sms_consent, phone_consent
    `;

    const emailConsent = preferences.email?.marketing || preferences.email?.newsletters || false;
    const smsConsent = preferences.sms?.marketing || preferences.sms?.reminders || false;
    const phoneConsent = preferences.phone?.marketing || preferences.phone?.service_calls || false;

    const result = await DatabaseService.query(sql, [
      customerId,
      emailConsent,
      smsConsent,
      phoneConsent,
      JSON.stringify(preferences),
      consentSource
    ]);

    if (result.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Customer not found' })
      };
    }

    // Log preference change for audit trail
    await logPreferenceChange(customerId, preferences, 'update', consentSource);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Preferences updated successfully',
        preferences: result.rows[0]
      })
    };

  } catch (error) {
    console.error('Error updating preferences:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to update preferences' })
    };
  }
}

/**
 * Handle email unsubscribe link
 */
async function handleUnsubscribe(event, headers) {
  try {
    const token = event.path.split('/unsubscribe/')[1];
    const queryParams = event.queryStringParameters || {};
    const { type = 'all', source = 'email_link' } = queryParams;

    if (!token) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Unsubscribe token required' })
      };
    }

    // Decode and validate token (in production, use JWT or secure token)
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const [customerId, email] = decoded.split(':');

    if (!customerId || !email) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid unsubscribe token' })
      };
    }

    // Update preferences based on unsubscribe type
    let updateSql = '';
    let updateParams = [];

    switch (type) {
      case 'email':
        updateSql = `
          UPDATE customers
          SET email_consent = false, updated_at = NOW()
          WHERE id = $1 AND email = $2
        `;
        updateParams = [customerId, email];
        break;

      case 'sms':
        updateSql = `
          UPDATE customers
          SET sms_consent = false, updated_at = NOW()
          WHERE id = $1
        `;
        updateParams = [customerId];
        break;

      case 'all':
      default:
        updateSql = `
          UPDATE customers
          SET
            email_consent = false,
            sms_consent = false,
            phone_consent = false,
            gdpr_consent_withdrawn = true,
            consent_withdrawn_date = NOW(),
            updated_at = NOW()
          WHERE id = $1
        `;
        updateParams = [customerId];
        break;
    }

    const result = await DatabaseService.query(updateSql, updateParams);

    if (result.rowCount === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Customer not found' })
      };
    }

    // Log the unsubscribe action
    await logPreferenceChange(customerId, { type, source }, 'unsubscribe', source);

    // Return success page
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Unsubscribe Successful</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
          .success { color: #28a745; }
          .info { color: #6c757d; margin: 20px 0; }
        </style>
      </head>
      <body>
        <h1 class="success">✓ Unsubscribed Successfully</h1>
        <p class="info">You have been unsubscribed from ${type === 'all' ? 'all communications' : type + ' communications'}.</p>
        <p>If you change your mind, you can update your preferences in your account settings.</p>
        <a href="/">Return to Homepage</a>
      </body>
      </html>
    `;

    return {
      statusCode: 200,
      headers: {
        ...headers,
        'Content-Type': 'text/html'
      },
      body: html
    };

  } catch (error) {
    console.error('Error handling unsubscribe:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to process unsubscribe' })
    };
  }
}

/**
 * Complete opt-out from all communications
 */
async function optOut(event, headers) {
  try {
    const body = JSON.parse(event.body);
    const { customerId, reason, source = 'customer_request' } = body;

    if (!customerId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Customer ID required' })
      };
    }

    // Complete opt-out
    const sql = `
      UPDATE customers
      SET
        email_consent = false,
        sms_consent = false,
        phone_consent = false,
        gdpr_consent_withdrawn = true,
        consent_withdrawn_date = NOW(),
        consent_withdrawn_reason = $2,
        updated_at = NOW()
      WHERE id = $1
      RETURNING id
    `;

    const result = await DatabaseService.query(sql, [customerId, reason || 'Customer requested opt-out']);

    if (result.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Customer not found' })
      };
    }

    // Cancel all pending follow-ups for this customer
    await cancelPendingFollowups(customerId);

    // Log the opt-out
    await logPreferenceChange(customerId, { reason, complete_opt_out: true }, 'complete_opt_out', source);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Successfully opted out of all communications'
      })
    };

  } catch (error) {
    console.error('Error processing opt-out:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to process opt-out' })
    };
  }
}

/**
 * Cancel all pending follow-ups for a customer
 */
async function cancelPendingFollowups(customerId) {
  try {
    const sql = `
      UPDATE followups
      SET
        status = 'cancelled',
        skip_reason = 'Customer opted out',
        updated_at = NOW()
      WHERE customer_id = $1
        AND status = 'pending'
    `;

    await DatabaseService.query(sql, [customerId]);
  } catch (error) {
    console.error('Error cancelling pending follow-ups:', error);
  }
}

/**
 * Log preference changes for audit trail
 */
async function logPreferenceChange(customerId, changes, action, source) {
  try {
    const sql = `
      INSERT INTO communication_preference_log (
        customer_id,
        action,
        changes,
        source,
        ip_address,
        user_agent,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
    `;

    // Note: In a real implementation, you'd extract IP and user agent from the request
    await DatabaseService.query(sql, [
      customerId,
      action,
      JSON.stringify(changes),
      source,
      'system', // IP address
      'system'  // User agent
    ]);
  } catch (error) {
    console.error('Error logging preference change:', error);
  }
}