/**
 * Input Validation Middleware
 * Provides comprehensive input validation using Joi schemas
 */

const Joi = require('joi');
const { sanitizeString, sanitizeEmail, sanitizePhone, sanitizeText } = require('./input-sanitizer');
const errorHandler = require('./error-handler');
const { route } = require('./request-path');

/**
 * Reusable field maps.
 *
 * These are PLAIN objects of field schemas, not compiled Joi schemas, so they
 * can be spread into a larger object schema or have individual fields
 * referenced (`paginationFields.limit`).
 *
 * This distinction matters: `pagination` and `sorting` below are *compiled*
 * `Joi.object(...)` values. Reaching into one of those -- `pagination.limit` --
 * yields `undefined`, because a compiled schema is not a map of its fields.
 * joi 17 silently ignored an `undefined` key inside `Joi.object({...})`, but
 * joi 18 throws `Invalid undefined schema` at module load, which took down
 * every function that requires this file (followup-campaigns among them).
 */
const paginationFields = {
  limit: Joi.number().integer().min(1).max(100).default(50),
  offset: Joi.number().integer().min(0).default(0)
};

const sortingFields = {
  sort_by: Joi.string(),
  sort_order: Joi.string().valid('asc', 'desc').default('desc')
};

/**
 * Common validation schemas
 */
const commonSchemas = {
  // Every primary key in this schema is TEXT, not a serial integer:
  //   CREATE TABLE followup_campaigns (id TEXT PRIMARY KEY, ...)
  // and the ids in circulation are UUIDs. Validating them as
  // `Joi.number().integer().positive()` rejected every real id, so
  // GET /{id}, PUT /{id}, DELETE /{id} and the activate/deactivate routes all
  // answered 400 for a perfectly valid UUID.
  //
  // What is actually worth asserting is that the segment is a single non-empty
  // path segment with nothing dangerous in it -- which is the property these
  // routes depend on, since it lands in a parameterised query. Length-capped so
  // a pathological segment cannot be pushed through.
  //
  // A purely numeric id is still accepted, so a table that ever does use a
  // serial key keeps working.
  id: Joi.string().trim().min(1).max(128).pattern(/^[A-Za-z0-9_-]+$/)
    .required(),
  pagination: Joi.object(paginationFields),
  dateRange: Joi.object({
    start_date: Joi.date().iso(),
    end_date: Joi.date().iso().min(Joi.ref('start_date'))
  }),
  sorting: Joi.object(sortingFields)
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
    ...paginationFields,
    ...sortingFields
  })
};

/**
 * Validation middleware factory
 * @param {Joi.Schema} schema - Joi validation schema
 * @param {string} source - Source of data ('body', 'query', 'params')
 * @returns {Function} - Express middleware function
 */
/** The function's own name, from the path Netlify delivered. */
function functionNameFrom(event) {
  const raw = String((event && (event.path || event.rawUrl)) || '');
  const parts = raw.split('/').filter(Boolean);
  const i = parts.indexOf('functions');
  return i !== -1 && parts[i + 1] ? parts[i + 1] : '';
}

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
          // The first segment after the function's own mount point is the id.
          //
          // This used to `parseInt(paramParts[0])` and hand the result to a
          // numeric Joi schema. The ids in this schema are TEXT (UUIDs), so
          // `parseInt('3f2a...')` is NaN, NaN fails `number().integer()`, and
          // every `{id}` route answered 400 for a valid id. The NaN then flowed
          // on as `id: NaN` in some paths.
          //
          // The segment is taken as the string it is. The schema is what decides
          // whether it is an acceptable id, and commonSchemas.id now describes
          // the TEXT keys this database actually has.
          data = { id: route(event, functionNameFrom(event)).split('/').filter(Boolean)[0] };
          break;
        default:
          data = {};
      }

      // Apply sanitization before validation
      if (source === 'body') {
        data = sanitizeData(data);
      }

      // `validateParams` is called both ways in this codebase:
      //
      //     validateParams(commonSchemas.id)(event)          a bare FIELD schema
      //     validateParams(Joi.object({ ... }))(event)        an OBJECT schema
      //
      // but `data` for 'params' is always `{ id }`. So the field-schema form
      // asked Joi to validate an OBJECT against `Joi.string()`, which fails with
      // `"value" must be a string` and an empty field path -- a 400 that named no
      // field and gave no reason, for every `{id}` route. With a numeric field
      // schema it failed the same way; the id type was never the actual problem.
      //
      // Wrapping the field schema in the key it is validated under makes both
      // call styles mean the same thing, and keeps `convert: true` working, so a
      // numeric id schema still accepts a numeric string.
      let effectiveSchema = schema;
      if (source === 'params' && schema && schema.describe && schema.describe().type !== 'object') {
        effectiveSchema = Joi.object({ id: schema });
      }

      const { error, value } = effectiveSchema.validate(data, {
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
  paginationFields,
  sortingFields,
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