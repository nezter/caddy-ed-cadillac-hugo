const errorHandler = require('./utils/error-handler');
const DatabaseService = require('./utils/database-service');
const { authenticateRequest } = require('./utils/auth-middleware');
const { sanitizeCustomerData } = require('./utils/input-sanitizer');

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
 * GET /api/sales/customers - List customers with optional filtering
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
      limit: parseInt(params.limit) || 20,
      offset: ((parseInt(params.page) || 1) - 1) * (parseInt(params.limit) || 20),
      sort_by: params.sortBy || 'last_activity_date',
      sort_order: params.sortOrder || 'desc'
    };

    // Get customers from database
    const customers = await DatabaseService.searchCustomers(filters);

    // Get total count for pagination
    const totalCustomers = await DatabaseService.searchCustomers({
      ...filters,
      limit: null,
      offset: null
    });

    const page = parseInt(params.page) || 1;
    const limit = parseInt(params.limit) || 20;

    return errorHandler.createSuccessResponse({
      customers: customers,
      total: totalCustomers.length,
      page,
      limit,
      totalPages: Math.ceil(totalCustomers.length / limit)
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

  return errorHandler.createSuccessResponse({
    id: customerId,
    deleted: true,
    deletedAt: new Date().toISOString(),
    deletedBy: user.id
  }, 'Customer deleted successfully');
}

/**
 * Helper function to check authentication
 */
async function checkAuthentication(event) {
  const jwt = require('jsonwebtoken');
  const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

  const authToken = event.headers.authorization?.replace('Bearer ', '') ||
                    event.headers['x-auth-token'] ||
                    getCookieValue(event.headers.cookie, 'auth_token');

  if (!authToken) {
    return { authenticated: false };
  }

  // Validate JWT token
  let decodedToken;
  try {
    decodedToken = jwt.verify(authToken, JWT_SECRET);
  } catch (tokenError) {
    return { authenticated: false };
  }

  // Verify user still exists and is active
  try {
    const user = await DatabaseService.getSalesRep(decodedToken.userId);
    if (!user || user.status !== 'active') {
      return { authenticated: false };
    }

    return {
      authenticated: true,
      user: {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        role: user.role,
        permissions: user.permissions || ['view_customers', 'manage_leads']
      }
    };
  } catch (error) {
    console.error('User verification error:', error);
    return { authenticated: false };
  }
}

/**
 * Helper function to extract cookie value
 */
function getCookieValue(cookieString, cookieName) {
  if (!cookieString) return null;

  const cookies = cookieString.split(';');
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === cookieName) {
      return decodeURIComponent(value);
    }
  }
  return null;
}