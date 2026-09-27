const errorHandler = require('./utils/error-handler');
const DatabaseService = require('./utils/database-service');
const { authenticateRequest } = require('./utils/auth-middleware');
const { sanitizeCustomerData } = require('./utils/input-sanitizer');

/**
 * Upper bound on the row count used to derive `total` for pagination. It exists
 * only because searchCustomers cannot be asked for "every row" -- see the note
 * in handleGetCustomers. A one-person dealership will never reach it; it is here
 * so that a bad `page` parameter cannot ask the database for the whole table.
 */
const TOTAL_COUNT_CEILING = 10000;

// Columns a caller is allowed to sort by. Anything else falls back to the
// default rather than reaching the SQL string.
const SORTABLE_COLUMNS = new Set([
  'last_name',
  'first_name',
  'created_at',
  'updated_at',
  'customer_type',
  'status',
  'last_activity_date',
  'email'
]);

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 200;

function clampLimit(raw) {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(n, MAX_PAGE_SIZE);
}

function clampOffset(rawPage, limit) {
  const p = parseInt(rawPage, 10);
  if (!Number.isFinite(p) || p <= 0) return 0;
  return (p - 1) * limit;
}

function pickSortColumn(raw) {
  const value = String(raw || '').trim().toLowerCase();
  return SORTABLE_COLUMNS.has(value) ? value : 'last_activity_date';
}

function pickSortOrder(raw) {
  const value = String(raw || '').trim().toLowerCase();
  return value === 'asc' ? 'asc' : 'desc';
}

/**
 * Sales Customers API
 * CRUD operations for customer management
 */
exports.handler = async function(event, context) {
  try {
    // Authenticate and check permissions
    const authResult = await authenticateRequest(event, {
      requiredPermissions: ['view_customers']
    });

    if (!authResult.authenticated) {
      return authResult.error;
    }

    const user = authResult.user;

    switch (event.httpMethod) {
      case 'GET':
        return await handleGetCustomers(event, user);
      case 'POST':
        // Check if user can create customers
        if (!user.permissions.includes('manage_customers')) {
          return errorHandler.forbiddenError('Insufficient permissions to create customers');
        }
        return await handleCreateCustomer(event, user);
      case 'PUT':
        // Check if user can update customers
        if (!user.permissions.includes('manage_customers')) {
          return errorHandler.forbiddenError('Insufficient permissions to update customers');
        }
        return await handleUpdateCustomer(event, user);
      case 'DELETE':
        // Only admins can delete customers
        if (user.role !== 'admin') {
          return errorHandler.forbiddenError('Only administrators can delete customers');
        }
        return await handleDeleteCustomer(event, user);
      default:
        return errorHandler.forbiddenError('Method not allowed');
    }
  } catch (error) {
    console.error('Customers API error:', error);
    return errorHandler.serverError('Customer operation failed');
  }
};

/**
 * GET /.netlify/functions/sales-customers - List customers with optional filtering
 */
async function handleGetCustomers(event, user) {
  const params = event.queryStringParameters || {};

  try {
    // Build search filters
    const filters = {
      search: params.search || '',
      customer_type: params.type || '',
      status: params.status || '',
      assigned_sales_rep_id: user.id, // Only show customers assigned to this rep
      limit: clampLimit(params.limit),
      offset: clampOffset(params.page, clampLimit(params.limit)),
      // searchCustomers interpolates sort_by/sort_order into the SQL string
      // rather than binding them (utils/database-service.js:383-384), so
      // anything the caller sends here lands in the statement verbatim.
      // `?sortBy=id; DROP TABLE customers --` was a live injection point in
      // this handler. Allowlist the columns instead of trusting the parameter.
      sort_by: pickSortColumn(params.sortBy),
      sort_order: pickSortOrder(params.sortOrder)
    };

    // Get customers from database
    const customers = await DatabaseService.searchCustomers(filters);

    // Get total count for pagination.
    //
    // This used to pass `limit: null, offset: null` on the theory that
    // searchCustomers would treat them as "no limit". It does not: those are
    // destructuring DEFAULTS, so they only apply to `undefined` -- a null sails
    // straight through into the SQL as `LIMIT $9 OFFSET $10` bound to null, and
    // PostgreSQL rejects that with "LIMIT must not be null". The handler then
    // threw and returned 500, so the customer list never worked for anybody,
    // ever. Confirmed against a live database.
    const totalCustomers = await DatabaseService.searchCustomers({
      ...filters,
      limit: TOTAL_COUNT_CEILING,
      offset: 0
    });

    const page = parseInt(params.page) || 1;
    const limit = filters.limit;
    const total = totalCustomers.length;

    return errorHandler.createSuccessResponse({
      customers: customers,
      // `total` is the number of rows we could actually see, not a COUNT(*).
      // searchCustomers has no count method, so the honest number is the
      // fetched length -- and it is clamped, which `totalPages` below accounts
      // for. A bigger number here would only be a nicer lie.
      total,
      totalTruncated: total >= TOTAL_COUNT_CEILING,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit))
    });

  } catch (error) {
    console.error('Error getting customers:', error);
    throw error;
  }
}

/**
 * POST /api/sales/customers - Create new customer
 */
async function handleCreateCustomer(event, user) {
  let customerData;
  try {
    customerData = JSON.parse(event.body);
  } catch (e) {
    return errorHandler.validationError('Invalid JSON in request body');
  }

  // Validate required fields
  const requiredFields = ['firstName', 'lastName', 'email'];
  const missingFields = requiredFields.filter(field => !customerData[field]);

  if (missingFields.length > 0) {
    return errorHandler.validationError('Missing required fields', {
      missingFields
    });
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(customerData.email)) {
    return errorHandler.validationError('Invalid email format', {
      email: 'Please provide a valid email address'
    });
  }

  try {
    // Sanitize input data
    const sanitizedData = sanitizeCustomerData({
      first_name: customerData.firstName,
      last_name: customerData.lastName,
      email: customerData.email,
      phone: customerData.phone,
      address_line1: customerData.address,
      city: customerData.city,
      state: customerData.state,
      zip_code: customerData.zipCode,
      customer_type: customerData.type || 'prospect',
      source: customerData.source || 'manual',
      vehicle_interest: customerData.vehicleInterest,
      preferred_contact_method: customerData.preferredContactMethod || 'email',
      email_consent: customerData.emailConsent || false,
      sms_consent: customerData.smsConsent || false,
      phone_consent: customerData.phoneConsent || false
    });

    // Check for duplicate customers
    const duplicateCheck = await DatabaseService.searchCustomers({
      search: sanitizedData.email,
      limit: 1
    });

    if (duplicateCheck.length > 0) {
      return errorHandler.validationError('Customer with this email already exists', {
        email: 'A customer with this email address is already in the system'
      });
    }

    // Prepare customer data for database
    const dbCustomerData = {
      ...sanitizedData,
      assigned_sales_rep_id: user.id
    };

    // Create customer in database
    const newCustomer = await DatabaseService.createCustomer(dbCustomerData);

    return errorHandler.createSuccessResponse(newCustomer, 'Customer created successfully');

  } catch (error) {
    console.error('Error creating customer:', error);
    return errorHandler.serverError('Failed to create customer', error);
  }
}

/**
 * PUT /api/sales/customers - Update customer
 */
async function handleUpdateCustomer(event, user) {
  const params = event.queryStringParameters || {};
  const customerId = params.id;

  if (!customerId) {
    return errorHandler.validationError('Customer ID is required');
  }

  let updateData;
  try {
    updateData = JSON.parse(event.body);
  } catch (e) {
    return errorHandler.validationError('Invalid JSON in request body');
  }

  try {
    // Check if customer exists and user has permission
    const existingCustomer = await DatabaseService.getCustomer(customerId);
    if (!existingCustomer) {
      return errorHandler.validationError('Customer not found');
    }

    // Check if user has permission to update this customer
    if (existingCustomer.assigned_sales_rep_id !== user.id) {
      return errorHandler.forbiddenError('You can only update customers assigned to you');
    }

    // Prepare update data for database
    const dbUpdateData = {};
    
    // Map frontend field names to database field names
    const fieldMapping = {
      firstName: 'first_name',
      lastName: 'last_name',
      email: 'email',
      phone: 'phone',
      addressLine1: 'address_line1',
      city: 'city',
      state: 'state',
      zipCode: 'zip_code',
      type: 'customer_type',
      status: 'status',
      vehicleInterest: 'vehicle_interest',
      preferredContactMethod: 'preferred_contact_method',
      emailConsent: 'email_consent',
      smsConsent: 'sms_consent',
      phoneConsent: 'phone_consent'
    };

    for (const [frontendField, dbField] of Object.entries(fieldMapping)) {
      if (updateData[frontendField] !== undefined) {
        dbUpdateData[dbField] = updateData[frontendField];
      }
    }

    // Update customer in database
    const updatedCustomer = await DatabaseService.updateCustomer(customerId, dbUpdateData);

    return errorHandler.createSuccessResponse(updatedCustomer, 'Customer updated successfully');

  } catch (error) {
    console.error('Error updating customer:', error);
    return errorHandler.serverError('Failed to update customer', error);
  }
}

/**
 * DELETE /api/sales/customers - Delete customer
 */
async function handleDeleteCustomer(event, user) {
  const params = event.queryStringParameters || {};
  const customerId = params.id;

  if (!customerId) {
    return errorHandler.validationError('Customer ID is required');
  }

  // TODO: Check permissions (only admins can delete)
  // TODO: Soft delete customer from database

  // This used to return {deleted: true} with HTTP 200 while deleting nothing,
  // which is a lie a caller would believe. The honest answer to a delete that
  // has not been implemented is 501, not a fake success.
  //
  // What is missing is a decision the code cannot make for you: hard delete,
  // or `status = 'archived'` (which the customers table already permits via
  // its CHECK constraint). No front end calls DELETE here today, so nothing
  // depends on this returning something else -- but if one ever does, it will
  // get an honest "not implemented" instead of a false "done".
  return {
    statusCode: 501,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      error: 'Not implemented',
      detail:
        'Customer deletion is not implemented. The schema supports ' +
        'status=archived, but no code performs it. See docs/OPEN-QUESTIONS.md Q8.'
    })
  };
}

/**
 * DELETED: `checkAuthentication(event)` and its `getCookieValue` helper.
 *
 * Neither was ever called -- every request goes through
 * `authenticateRequest(event, {requiredPermissions: [...]})` at the top of the
 * handler, which verifies the signature, the expiry, the blacklist AND the live
 * `sales_reps` row. So the dead copy was not a second way in.
 *
 * It was left in as a trap, though: it verified tokens with
 * `process.env.JWT_SECRET || 'your-secret-key-change-in-production'`. A
 * fallback signing key in a dead authentication helper is one careless
 * `authCheck = await checkAuthentication(event)` away from being a live bypass,
 * and `'your-secret-key-change-in-production'` is a string anybody has typed
 * before. Removed rather than left to rot.
 */

/**
 * DELETED: `handleDeleteCustomer` reports success without deleting.
 *
 * See the function body -- it is preserved below with a note. It is NOT called
 * by anything in the front end, and the TODO it carries is the honest state of
 * that feature.
 */
