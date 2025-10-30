/**
 * Input Validation Middleware
 * Provides comprehensive input validation using Joi schemas
 */

const Joi = require('joi');
const { sanitizeString, sanitizeEmail, sanitizePhone, sanitizeText } = require('./input-sanitizer');
const errorHandler = require('./error-handler');

/**
 * Common validation schemas
 */
const commonSchemas = {
  id: Joi.number().integer().positive().required(),
  pagination: Joi.object({
    limit: Joi.number().integer().min(1).max(100).default(50),
    offset: Joi.number().integer().min(0).default(0)
  }),
  dateRange: Joi.object({
    start_date: Joi.date().iso(),
    end_date: Joi.date().iso().min(Joi.ref('start_date'))
  }),
  sorting: Joi.object({
    sort_by: Joi.string(),
    sort_order: Joi.string().valid('asc', 'desc').default('desc')
  })
};

/**
 * Campaign validation schemas
 */
const campaignSchemas = {
  create: Joi.object({
    name: Joi.string().min(3).max(255).required(),
    description: Joi.string().max(1000).allow(''),
    campaign_type: Joi.string().valid(
      'nurture', 're_engagement', 'welcome', 'birthday', 
      'anniversary', 'holiday', 'custom'
    ).required(),
    is_active: Joi.boolean().default(true),
    priority: Joi.number().integer().min(1).max(10).default(1),
    target_audience: Joi.string().valid(
      'all', 'prospects', 'leads', 'active_customers', 
      'inactive_customers', 'vip_customers'
    ).default('all'),
    start_date: Joi.date().iso(),
    end_date: Joi.date().iso().min(Joi.ref('start_date')),
    timezone: Joi.string().default('America/New_York'),
    tags: Joi.array().items(Joi.string().max(50)).default([]),
    metadata: Joi.object({}).default({})
  }),
  
  update: Joi.object({
    name: Joi.string().min(3).max(255),
    description: Joi.string().max(1000).allow(''),
    campaign_type: Joi.string().valid(
      'nurture', 're_engagement', 'welcome', 'birthday', 
      'anniversary', 'holiday', 'custom'
    ),
    is_active: Joi.boolean(),
    priority: Joi.number().integer().min(1).max(10),
    target_audience: Joi.string().valid(
      'all', 'prospects', 'leads', 'active_customers', 
      'inactive_customers', 'vip_customers'
    ),
    start_date: Joi.date().iso(),
    end_date: Joi.date().iso(),
    timezone: Joi.string(),
    tags: Joi.array().items(Joi.string().max(50)),
    metadata: Joi.object({}),
    updated_by: Joi.string()
  }).min(1)
};

/**
 * Rule validation schemas
 */
const ruleSchemas = {
  create: Joi.object({
    name: Joi.string().min(3).max(255).required(),
    description: Joi.string().max(1000).allow(''),
    campaign_id: commonSchemas.id,
    trigger_event: Joi.string().valid(
      'lead_created', 'appointment_scheduled', 'interaction_added',
      'vehicle_viewed', 'test_drive_completed', 'quote_requested',
      'followup_sent', 'customer_birthday', 'customer_anniversary'
    ).required(),
    trigger_conditions: Joi.object({}).default({}),
    actions: Joi.array().items(
      Joi.object({
        type: Joi.string().valid(
          'send_email', 'send_sms', 'create_task', 'assign_lead',
          'update_lead_status', 'notify_manager', 'delay'
        ).required(),
        parameters: Joi.object({}).default({}),
        delay_minutes: Joi.number().integer().min(0).default(0)
      })
    ).min(1).required(),
    is_active: Joi.boolean().default(true),
    priority: Joi.number().integer().min(1).max(10).default(1),
    execution_count: Joi.number().integer().min(0).default(0),
    success_count: Joi.number().integer().min(0).default(0)
  }),
  
  update: Joi.object({
    name: Joi.string().min(3).max(255),
    description: Joi.string().max(1000).allow(''),
    trigger_event: Joi.string().valid(
      'lead_created', 'appointment_scheduled', 'interaction_added',
      'vehicle_viewed', 'test_drive_completed', 'quote_requested',
      'followup_sent', 'customer_birthday', 'customer_anniversary'
    ),
    trigger_conditions: Joi.object({}),
    actions: Joi.array().items(
      Joi.object({
        type: Joi.string().valid(
          'send_email', 'send_sms', 'create_task', 'assign_lead',
          'update_lead_status', 'notify_manager', 'delay'
        ).required(),
        parameters: Joi.object({}).default({}),
        delay_minutes: Joi.number().integer().min(0).default(0)
      })
    ).min(1),
    is_active: Joi.boolean(),
    priority: Joi.number().integer().min(1).max(10),
    updated_by: Joi.string()
  }).min(1)
};

/**
 * Template validation schemas
 */
const templateSchemas = {
  email: {
    create: Joi.object({
      name: Joi.string().min(3).max(255).required(),
      description: Joi.string().max(1000).allow(''),
      subject: Joi.string().min(1).max(255).required(),
      body_html: Joi.string().min(1).required(),
      body_text: Joi.string().min(1).required(),
      template_type: Joi.string().valid(
        'welcome', 'followup', 'appointment', 'promotion', 
        'reminder', 'birthday', 'holiday', 'custom'
      ).required(),
      variables: Joi.array().items(
        Joi.object({
          name: Joi.string().required(),
          description: Joi.string().allow(''),
          type: Joi.string().valid('string', 'number', 'date', 'boolean').default('string'),
          required: Joi.boolean().default(false)
        })
      ).default([]),
      is_active: Joi.boolean().default(true),
      tags: Joi.array().items(Joi.string().max(50)).default([])
    }),
    
    update: Joi.object({
      name: Joi.string().min(3).max(255),
      description: Joi.string().max(1000).allow(''),
      subject: Joi.string().min(1).max(255),
      body_html: Joi.string().min(1),
      body_text: Joi.string().min(1),
      template_type: Joi.string().valid(
        'welcome', 'followup', 'appointment', 'promotion', 
        'reminder', 'birthday', 'holiday', 'custom'
      ),
      variables: Joi.array().items(
        Joi.object({
          name: Joi.string().required(),
          description: Joi.string().allow(''),
          type: Joi.string().valid('string', 'number', 'date', 'boolean').default('string'),
          required: Joi.boolean().default(false)
        })
      ),
      is_active: Joi.boolean(),
      tags: Joi.array().items(Joi.string().max(50))
    }).min(1)
  },
  
  sms: {
    create: Joi.object({
      name: Joi.string().min(3).max(255).required(),
      description: Joi.string().max(1000).allow(''),
      message: Joi.string().min(1).max(1600).required(),
      template_type: Joi.string().valid(
        'welcome', 'followup', 'appointment', 'promotion', 
        'reminder', 'birthday', 'holiday', 'custom'
      ).required(),
      variables: Joi.array().items(
        Joi.object({
          name: Joi.string().required(),
          description: Joi.string().allow(''),
          type: Joi.string().valid('string', 'number', 'date', 'boolean').default('string'),
          required: Joi.boolean().default(false)
        })
      ).default([]),
      is_active: Joi.boolean().default(true),
      tags: Joi.array().items(Joi.string().max(50)).default([])
    }),
    
    update: Joi.object({
      name: Joi.string().min(3).max(255),
      description: Joi.string().max(1000).allow(''),
      message: Joi.string().min(1).max(1600),
      template_type: Joi.string().valid(
        'welcome', 'followup', 'appointment', 'promotion', 
        'reminder', 'birthday', 'holiday', 'custom'
      ),
      variables: Joi.array().items(
        Joi.object({
          name: Joi.string().required(),
          description: Joi.string().allow(''),
          type: Joi.string().valid('string', 'number', 'date', 'boolean').default('string'),
          required: Joi.boolean().default(false)
        })
      ),
      is_active: Joi.boolean(),
      tags: Joi.array().items(Joi.string().max(50))
    }).min(1)
  }
};

/**
 * Communication preferences validation schemas
 */
const preferenceSchemas = {
  update: Joi.object({
    lead_id: commonSchemas.id,
    email_enabled: Joi.boolean(),
    sms_enabled: Joi.boolean(),
    phone_enabled: Joi.boolean(),
    email_frequency: Joi.string().valid('immediate', 'daily', 'weekly', 'never'),
    sms_frequency: Joi.string().valid('immediate', 'daily', 'weekly', 'never'),
    phone_frequency: Joi.string().valid('immediate', 'daily', 'weekly', 'never'),
    preferred_time_start: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
    preferred_time_end: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
    timezone: Joi.string(),
    do_not_contact: Joi.boolean(),
    opt_out_reason: Joi.string().max(500).allow('')
  }).min(1)
};

/**
 * Search validation schemas
 */
const searchSchemas = {
  query: Joi.object({
    q: Joi.string().min(1).max(500).required(),
    type: Joi.string().valid('all', 'customers', 'leads', 'interactions', 'appointments').default('all'),
    filters: Joi.object({}).default({}),
    limit: commonSchemas.pagination.limit,
    offset: commonSchemas.pagination.offset,
    sort_by: commonSchemas.sorting.sort_by,
    sort_order: commonSchemas.sorting.sort_order
  })
};

/**
 * Validation middleware factory
 * @param {Joi.Schema} schema - Joi validation schema
 * @param {string} source - Source of data ('body', 'query', 'params')
 * @returns {Function} - Express middleware function
 */
function validate(schema, source = 'body') {
  return async (event) => {
    try {
      let data;
      
      switch (source) {
        case 'body':
          data = event.body ? JSON.parse(event.body) : {};
          break;
        case 'query':
          data = event.queryStringParameters || {};
          break;
        case 'params':
          // Extract path parameters from event.path
          const pathParts = event.path.split('/').filter(p => p);
          const functionName = event.path.split('/')[2]; // Extract function name
          const paramPath = event.path.replace(`/.netlify/functions/${functionName}`, '');
          const paramParts = paramPath.split('/').filter(p => p);
          data = { id: parseInt(paramParts[0]) };
          break;
        default:
          data = {};
      }

      // Apply sanitization before validation
      if (source === 'body') {
        data = sanitizeData(data);
      }

      const { error, value } = schema.validate(data, {
        abortEarly: false,
        stripUnknown: true,
        convert: true
      });

      if (error) {
        const validationErrors = {};
        error.details.forEach(detail => {
          validationErrors[detail.path.join('.')] = detail.message;
        });

        return {
          isValid: false,
          error: errorHandler.validationError('Validation failed', validationErrors)
        };
      }

      return {
        isValid: true,
        data: value
      };

    } catch (parseError) {
      return {
        isValid: false,
        error: errorHandler.validationError('Invalid JSON in request body')
      };
    }
  };
}

/**
 * Sanitize data based on field types
 * @param {Object} data - Data to sanitize
 * @returns {Object} - Sanitized data
 */
function sanitizeData(data) {
  if (!data || typeof data !== 'object') {
    return {};
  }

  const sanitized = {};

  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) {
      sanitized[key] = value;
      continue;
    }

    // Sanitize based on field name patterns
    if (key.includes('email')) {
      sanitized[key] = sanitizeEmail(value);
    } else if (key.includes('phone') || key.includes('mobile')) {
      sanitized[key] = sanitizePhone(value);
    } else if (key.includes('name') || key.includes('title') || key.includes('subject')) {
      sanitized[key] = sanitizeString(value);
    } else if (key.includes('message') || key.includes('body') || key.includes('content') || key.includes('notes')) {
      sanitized[key] = sanitizeText(value);
    } else if (typeof value === 'string') {
      sanitized[key] = sanitizeString(value);
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map(item => 
        typeof item === 'object' ? sanitizeData(item) : sanitizeString(item)
      );
    } else if (typeof value === 'object') {
      sanitized[key] = sanitizeData(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Validate query parameters
 * @param {Joi.Schema} schema - Joi schema for query parameters
 * @returns {Function} - Validation function
 */
function validateQuery(schema) {
  return validate(schema, 'query');
}

/**
 * Validate request body
 * @param {Joi.Schema} schema - Joi schema for request body
 * @returns {Function} - Validation function
 */
function validateBody(schema) {
  return validate(schema, 'body');
}

/**
 * Validate path parameters
 * @param {Joi.Schema} schema - Joi schema for path parameters
 * @returns {Function} - Validation function
 */
function validateParams(schema) {
  return validate(schema, 'params');
}

module.exports = {
  // Validation schemas
  commonSchemas,
  campaignSchemas,
  ruleSchemas,
  templateSchemas,
  preferenceSchemas,
  searchSchemas,
  
  // Middleware functions
  validate,
  validateQuery,
  validateBody,
  validateParams,
  
  // Utilities
  sanitizeData
};