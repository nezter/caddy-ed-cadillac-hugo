const errorHandler = require('./utils/error-handler');
const DatabaseService = require('./utils/database-service');

/**
 * Email Templates API
 * Manages email templates for follow-up campaigns
 */
exports.handler = async function(event, context) {
  // Check authentication (simplified - in production use proper JWT validation)
  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return errorHandler.unauthorizedError('Authentication required');
  }

  try {
    const path = event.path.replace('/.netlify/functions/email-templates', '');
    const method = event.httpMethod;

    // Parse path parameters
    const pathParts = path.split('/').filter(p => p);
    const resourceId = pathParts[0];
    const subResource = pathParts[1];

    switch (`${method} ${path}`) {
      case 'GET /':
        return await getTemplates(event);
      case 'POST /':
        return await createTemplate(event);
      case 'GET /types':
        return await getTemplateTypes(event);
      case 'GET /variables':
        return await getAvailableVariables(event);
      case `GET /${resourceId}`:
        return await getTemplate(event, resourceId);
      case `PUT /${resourceId}`:
        return await updateTemplate(event, resourceId);
      case `DELETE /${resourceId}`:
        return await deleteTemplate(event, resourceId);
      case `POST /${resourceId}/duplicate`:
        return await duplicateTemplate(event, resourceId);
      case `POST /${resourceId}/test`:
        return await testTemplate(event, resourceId);
      case `GET /${resourceId}/usage`:
        return await getTemplateUsage(event, resourceId);
      default:
        return errorHandler.notFoundError('Endpoint not found');
    }

  } catch (error) {
    console.error('Email Templates API error:', error);
    return errorHandler.serverError('Failed to process template request', error);
  }
};

/**
 * Get all email templates with optional filtering
 */
async function getTemplates(event) {
  const filters = {
    template_type: event.queryStringParameters?.type,
    is_active: event.queryStringParameters?.active ? event.queryStringParameters.active === 'true' : undefined,
    search: event.queryStringParameters?.search,
    limit: parseInt(event.queryStringParameters?.limit) || 50,
    offset: parseInt(event.queryStringParameters?.offset) || 0,
    sort_by: event.queryStringParameters?.sort_by || 'name',
    sort_order: event.queryStringParameters?.sort_order || 'asc'
  };

  try {
    let sql = 'SELECT * FROM email_templates WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (filters.is_active !== undefined) {
      sql += ` AND is_active = $${paramIndex}`;
      params.push(filters.is_active);
      paramIndex++;
    }

    if (filters.template_type) {
      sql += ` AND template_type = $${paramIndex}`;
      params.push(filters.template_type);
      paramIndex++;
    }

    if (filters.search) {
      sql += ` AND (name ILIKE $${paramIndex} OR description ILIKE $${paramIndex} OR subject ILIKE $${paramIndex})`;
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    // Add sorting
    const validSortFields = ['name', 'template_type', 'usage_count', 'created_at', 'updated_at'];
    const sortField = validSortFields.includes(filters.sort_by) ? filters.sort_by : 'name';
    const sortOrder = filters.sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    sql += ` ORDER BY ${sortField} ${sortOrder}`;

    // Add pagination
    sql += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(filters.limit, filters.offset);

    const result = await DatabaseService.query(sql, params);

    // Get total count for pagination
    let countSql = 'SELECT COUNT(*) as total FROM email_templates WHERE 1=1';
    const countParams = params.slice(0, -2); // Remove limit and offset
    let countParamIndex = 1;

    if (filters.is_active !== undefined) {
      countSql += ` AND is_active = $${countParamIndex}`;
      countParamIndex++;
    }

    if (filters.template_type) {
      countSql += ` AND template_type = $${countParamIndex}`;
      countParamIndex++;
    }

    if (filters.search) {
      countSql += ` AND (name ILIKE $${countParamIndex} OR description ILIKE $${countParamIndex} OR subject ILIKE $${countParamIndex})`;
      countParamIndex++;
    }

    const countResult = await DatabaseService.query(countSql, countParams);

    return errorHandler.createSuccessResponse({
      templates: result.rows,
      total: parseInt(countResult.rows[0].total),
      limit: filters.limit,
      offset: filters.offset,
      filters
    });

  } catch (error) {
    console.error('Error getting templates:', error);
    return errorHandler.serverError('Failed to get templates', error);
  }
}

/**
 * Create a new email template
 */
async function createTemplate(event) {
  let templateData;
  try {
    templateData = JSON.parse(event.body);
  } catch (e) {
    return errorHandler.validationError('Invalid JSON in request body');
  }

  const { name, subject, content } = templateData;

  if (!name || !subject || !content) {
    return errorHandler.validationError('Missing required fields', {
      name: !name ? 'Template name is required' : null,
      subject: !subject ? 'Email subject is required' : null,
      content: !content ? 'Email content is required' : null
    });
  }

  // Validate template type
  const validTypes = ['welcome', 'follow_up', 'reminder', 'confirmation', 'nurture', 're_engagement', 'custom'];
  if (templateData.template_type && !validTypes.includes(templateData.template_type)) {
    return errorHandler.validationError('Invalid template type', {
      template_type: `Must be one of: ${validTypes.join(', ')}`
    });
  }

  // Check for duplicate name
  try {
    const existingSql = 'SELECT id FROM email_templates WHERE name = $1';
    const existingResult = await DatabaseService.query(existingSql, [name]);

    if (existingResult.rows.length > 0) {
      return errorHandler.validationError('Template name already exists', {
        name: 'Please choose a unique template name'
      });
    }
  } catch (error) {
    console.error('Error checking for duplicate template:', error);
  }

  try {
    const sql = `
      INSERT INTO email_templates (
        name, description, subject, content, template_type, is_active,
        variables, preview_text, test_email, tags, metadata, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `;

    const params = [
      templateData.name,
      templateData.description || '',
      templateData.subject,
      templateData.content,
      templateData.template_type || 'custom',
      templateData.is_active !== false,
      templateData.variables || [],
      templateData.preview_text,
      templateData.test_email,
      templateData.tags || [],
      templateData.metadata || {},
      templateData.created_by || 'system'
    ];

    const result = await DatabaseService.query(sql, params);

    return errorHandler.createSuccessResponse({
      message: 'Email template created successfully',
      template: result.rows[0]
    }, 'Template created');

  } catch (error) {
    console.error('Error creating template:', error);
    return errorHandler.serverError('Failed to create template', error);
  }
}

/**
 * Get template types
 */
async function getTemplateTypes(event) {
  const templateTypes = [
    { value: 'welcome', label: 'Welcome', description: 'Welcome new leads or customers' },
    { value: 'follow_up', label: 'Follow-up', description: 'General follow-up communications' },
    { value: 'reminder', label: 'Reminder', description: 'Appointment or task reminders' },
    { value: 'confirmation', label: 'Confirmation', description: 'Confirm appointments or actions' },
    { value: 'nurture', label: 'Nurture', description: 'Lead nurturing campaigns' },
    { value: 're_engagement', label: 'Re-engagement', description: 'Re-engage inactive customers' },
    { value: 'custom', label: 'Custom', description: 'Custom purpose templates' }
  ];

  return errorHandler.createSuccessResponse({
    template_types: templateTypes
  });
}

/**
 * Get available personalization variables
 */
async function getAvailableVariables(event) {
  const variables = [
    { variable: '{{first_name}}', label: 'First Name', description: 'Customer or lead first name' },
    { variable: '{{last_name}}', label: 'Last Name', description: 'Customer or lead last name' },
    { variable: '{{full_name}}', label: 'Full Name', description: 'Customer or lead full name' },
    { variable: '{{email}}', label: 'Email', description: 'Email address' },
    { variable: '{{phone}}', label: 'Phone', description: 'Phone number' },
    { variable: '{{vehicle_interest}}', label: 'Vehicle Interest', description: 'Vehicle of interest' },
    { variable: '{{lead_score}}', label: 'Lead Score', description: 'Lead scoring value' },
    { variable: '{{campaign_name}}', label: 'Campaign Name', description: 'Follow-up campaign name' },
    { variable: '{{company_name}}', label: 'Company Name', description: 'Company name' },
    { variable: '{{current_date}}', label: 'Current Date', description: 'Current date' },
    { variable: '{{appointment_date}}', label: 'Appointment Date', description: 'Scheduled appointment date/time' },
    { variable: '{{appointment_type}}', label: 'Appointment Type', description: 'Type of appointment' },
    { variable: '{{sales_rep_name}}', label: 'Sales Rep Name', description: 'Assigned sales representative name' }
  ];

  return errorHandler.createSuccessResponse({
    variables
  });
}

/**
 * Get a specific template
 */
async function getTemplate(event, templateId) {
  try {
    const sql = 'SELECT * FROM email_templates WHERE id = $1';
    const result = await DatabaseService.query(sql, [templateId]);

    if (result.rows.length === 0) {
      return errorHandler.notFoundError('Template not found');
    }

    const template = result.rows[0];

    // Get usage statistics
    const usageSql = `
      SELECT
        COUNT(*) as total_usage,
        MAX(sent_date) as last_used
      FROM followups
      WHERE email_template = $1 AND status = 'sent'
    `;
    const usageResult = await DatabaseService.query(usageSql, [template.name]);
    template.usage_stats = usageResult.rows[0];

    return errorHandler.createSuccessResponse({
      template
    });

  } catch (error) {
    console.error('Error getting template:', error);
    return errorHandler.serverError('Failed to get template', error);
  }
}

/**
 * Update a template
 */
async function updateTemplate(event, templateId) {
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
  delete updateData.usage_count; // This is auto-updated
  delete updateData.last_used; // This is auto-updated

  if (Object.keys(updateData).length === 0) {
    return errorHandler.validationError('No valid fields to update');
  }

  // Validate template type if provided
  if (updateData.template_type) {
    const validTypes = ['welcome', 'follow_up', 'reminder', 'confirmation', 'nurture', 're_engagement', 'custom'];
    if (!validTypes.includes(updateData.template_type)) {
      return errorHandler.validationError('Invalid template type', {
        template_type: `Must be one of: ${validTypes.join(', ')}`
      });
    }
  }

  // Check for duplicate name if name is being updated
  if (updateData.name) {
    try {
      const existingSql = 'SELECT id FROM email_templates WHERE name = $1 AND id != $2';
      const existingResult = await DatabaseService.query(existingSql, [updateData.name, templateId]);

      if (existingResult.rows.length > 0) {
        return errorHandler.validationError('Template name already exists', {
          name: 'Please choose a unique template name'
        });
      }
    } catch (error) {
      console.error('Error checking for duplicate template:', error);
    }
  }

  try {
    const allowedFields = [
      'name', 'description', 'subject', 'content', 'template_type', 'is_active',
      'variables', 'preview_text', 'test_email', 'tags', 'metadata', 'updated_by'
    ];

    const updateFields = [];
    const params = [templateId];
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
      UPDATE email_templates
      SET ${updateFields.join(', ')}
      WHERE id = $1
      RETURNING *
    `;

    const result = await DatabaseService.query(sql, params);

    if (result.rows.length === 0) {
      return errorHandler.notFoundError('Template not found');
    }

    return errorHandler.createSuccessResponse({
      message: 'Template updated successfully',
      template: result.rows[0]
    });

  } catch (error) {
    console.error('Error updating template:', error);
    return errorHandler.serverError('Failed to update template', error);
  }
}

/**
 * Delete a template
 */
async function deleteTemplate(event, templateId) {
  try {
    // Check if template is being used by active rules
    const rulesSql = 'SELECT COUNT(*) as rules_count FROM followup_rules WHERE email_template = $1';
    const rulesResult = await DatabaseService.query(rulesSql, [templateId]);

    if (parseInt(rulesResult.rows[0].rules_count) > 0) {
      return errorHandler.validationError('Cannot delete template used by active rules', {
        rules_count: parseInt(rulesResult.rows[0].rules_count)
      });
    }

    // Check if template has been used in followups
    const followupsSql = 'SELECT COUNT(*) as followups_count FROM followups WHERE email_template = $1';
    const followupsResult = await DatabaseService.query(followupsSql, [templateId]);

    if (parseInt(followupsResult.rows[0].followups_count) > 0) {
      return errorHandler.validationError('Cannot delete template that has been used in followups', {
        followups_count: parseInt(followupsResult.rows[0].followups_count)
      });
    }

    const sql = 'DELETE FROM email_templates WHERE id = $1 RETURNING *';
    const result = await DatabaseService.query(sql, [templateId]);

    if (result.rows.length === 0) {
      return errorHandler.notFoundError('Template not found');
    }

    return errorHandler.createSuccessResponse({
      message: 'Template deleted successfully',
      template: result.rows[0]
    });

  } catch (error) {
    console.error('Error deleting template:', error);
    return errorHandler.serverError('Failed to delete template', error);
  }
}

/**
 * Duplicate a template
 */
async function duplicateTemplate(event, templateId) {
  let duplicateData;
  try {
    duplicateData = JSON.parse(event.body);
  } catch (e) {
    duplicateData = {};
  }

  try {
    // Get original template
    const originalSql = 'SELECT * FROM email_templates WHERE id = $1';
    const originalResult = await DatabaseService.query(originalSql, [templateId]);

    if (originalResult.rows.length === 0) {
      return errorHandler.notFoundError('Template not found');
    }

    const original = originalResult.rows[0];
    const newName = duplicateData.name || `${original.name}_copy`;

    // Check for duplicate name
    const existingSql = 'SELECT id FROM email_templates WHERE name = $1';
    const existingResult = await DatabaseService.query(existingSql, [newName]);

    if (existingResult.rows.length > 0) {
      return errorHandler.validationError('Template name already exists', {
        name: 'Please choose a unique template name'
      });
    }

    // Create duplicate
    const sql = `
      INSERT INTO email_templates (
        name, description, subject, content, template_type, is_active,
        variables, preview_text, test_email, tags, metadata, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `;

    const params = [
      newName,
      duplicateData.description || `${original.description} (Copy)`,
      original.subject,
      original.content,
      original.template_type,
      false, // Start as inactive
      original.variables,
      original.preview_text,
      original.test_email,
      original.tags,
      { ...original.metadata, duplicated_from: templateId },
      duplicateData.created_by || 'system'
    ];

    const result = await DatabaseService.query(sql, params);

    return errorHandler.createSuccessResponse({
      message: 'Template duplicated successfully',
      template: result.rows[0]
    });

  } catch (error) {
    console.error('Error duplicating template:', error);
    return errorHandler.serverError('Failed to duplicate template', error);
  }
}

/**
 * Test a template with sample data
 */
async function testTemplate(event, templateId) {
  let testData;
  try {
    testData = JSON.parse(event.body);
  } catch (e) {
    return errorHandler.validationError('Invalid JSON in request body');
  }

  try {
    // Get the template
    const templateSql = 'SELECT * FROM email_templates WHERE id = $1';
    const templateResult = await DatabaseService.query(templateSql, [templateId]);

    if (templateResult.rows.length === 0) {
      return errorHandler.notFoundError('Template not found');
    }

    const template = templateResult.rows[0];

    // Personalize the content
    const personalizedSubject = personalizeContent(template.subject, testData);
    const personalizedContent = personalizeContent(template.content, testData);

    // Send test email if test_email is configured
    let emailSent = false;
    if (template.test_email && testData.send_test) {
      // Here you would integrate with your email service to send the test
      console.log(`Test email would be sent to: ${template.test_email}`);
      console.log(`Subject: ${personalizedSubject}`);
      console.log(`Content: ${personalizedContent}`);
      emailSent = true; // In real implementation, check if email was sent successfully
    }

    return errorHandler.createSuccessResponse({
      template_id: templateId,
      test_data: testData,
      personalized_subject: personalizedSubject,
      personalized_content: personalizedContent,
      email_sent: emailSent,
      test_email: template.test_email
    });

  } catch (error) {
    console.error('Error testing template:', error);
    return errorHandler.serverError('Failed to test template', error);
  }
}

/**
 * Get template usage statistics
 */
async function getTemplateUsage(event, templateId) {
  const days = parseInt(event.queryStringParameters?.days) || 30;

  try {
    const usageSql = `
      SELECT
        COUNT(*) as total_sent,
        COUNT(CASE WHEN status = 'sent' THEN 1 END) as successful_sends,
        COUNT(CASE WHEN status = 'error' THEN 1 END) as failed_sends,
        MAX(sent_date) as last_used_date,
        ROUND(
          CASE
            WHEN COUNT(*) > 0
            THEN (COUNT(CASE WHEN status = 'sent' THEN 1 END)::decimal / COUNT(*)) * 100
            ELSE 0
          END, 2
        ) as success_rate
      FROM followups
      WHERE email_template = (SELECT name FROM email_templates WHERE id = $1)
        AND created_at >= NOW() - INTERVAL '${days} days'
    `;

    const usageResult = await DatabaseService.query(usageSql, [templateId]);

    // Get campaigns using this template
    const campaignsSql = `
      SELECT DISTINCT fc.name, fc.campaign_type, COUNT(f.id) as usage_count
      FROM followup_campaigns fc
      JOIN followup_rules fr ON fc.id = fr.campaign_id
      JOIN followups f ON fr.id = f.rule_id
      WHERE fr.email_template = (SELECT name FROM email_templates WHERE id = $1)
        AND f.created_at >= NOW() - INTERVAL '${days} days'
      GROUP BY fc.id, fc.name, fc.campaign_type
      ORDER BY usage_count DESC
    `;

    const campaignsResult = await DatabaseService.query(campaignsSql, [templateId]);

    return errorHandler.createSuccessResponse({
      template_id: templateId,
      period_days: days,
      usage_stats: usageResult.rows[0],
      campaigns_using_template: campaignsResult.rows
    });

  } catch (error) {
    console.error('Error getting template usage:', error);
    return errorHandler.serverError('Failed to get template usage', error);
  }
}

/**
 * Personalize template content with test data
 */
function personalizeContent(content, data) {
  if (!content) return '';

  return content
    .replace(/\{\{first_name\}\}/g, data.first_name || '[First Name]')
    .replace(/\{\{last_name\}\}/g, data.last_name || '[Last Name]')
    .replace(/\{\{full_name\}\}/g, `${data.first_name || '[First Name]'} ${data.last_name || '[Last Name]'}`.trim())
    .replace(/\{\{email\}\}/g, data.email || '[Email]')
    .replace(/\{\{phone\}\}/g, data.phone || '[Phone]')
    .replace(/\{\{vehicle_interest\}\}/g, data.vehicle_interest || '[Vehicle Interest]')
    .replace(/\{\{lead_score\}\}/g, data.lead_score || '[Lead Score]')
    .replace(/\{\{campaign_name\}\}/g, data.campaign_name || '[Campaign Name]')
    .replace(/\{\{company_name\}\}/g, data.company_name || 'Caddy Ed Cadillac')
    .replace(/\{\{current_date\}\}/g, new Date().toLocaleDateString())
    .replace(/\{\{appointment_date\}\}/g, data.appointment_date || '[Appointment Date]')
    .replace(/\{\{appointment_type\}\}/g, data.appointment_type || '[Appointment Type]')
    .replace(/\{\{sales_rep_name\}\}/g, data.sales_rep_name || '[Sales Rep Name]');
}