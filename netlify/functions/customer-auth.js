const jwt = require('jsonwebtoken');
const DatabaseService = require('./utils/database-service');

/**
 * Customer Authentication
 * Handles customer login and session management
 */
exports.handler = async (event, context) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ success: false, error: 'Method not allowed' })
    };
  }

  try {
    const data = JSON.parse(event.body);
    const { email, phone } = data;

    if (!email || !phone) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          error: 'Email and phone are required'
        })
      };
    }

    // Find customer by email and phone
    // In a real implementation, this would search the database
    // For now, we'll simulate finding a customer
    const customer = await findCustomerByContact(email, phone);

    if (!customer) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          success: false,
          error: 'Customer not found. Please contact us to get started.'
        })
      };
    }

    // Generate JWT token for session management
    const token = jwt.sign(
      {
        customerId: customer.id,
        email: customer.email,
        type: 'customer'
      },
      process.env.JWT_SECRET || 'fallback-secret',
      { expiresIn: '24h' }
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data: {
          customer: {
            id: customer.id,
            first_name: customer.first_name,
            last_name: customer.last_name,
            email: customer.email,
            phone: customer.phone
          },
          token: token
        }
      })
    };

  } catch (error) {
    console.error('Customer authentication error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: 'Authentication failed',
        details: error.message
      })
    };
  }
};

/**
 * Find customer by email and phone
 * In production, this would query the database
 */
async function findCustomerByContact(email, phone) {
  try {
    // Normalize inputs for searching
    const normalizedEmail = email.toLowerCase().trim();
    const normalizedPhone = phone.replace(/\D/g, '');

    // In a real implementation, this would be:
    // const customer = await DatabaseService.findCustomerByContact(normalizedEmail, normalizedPhone);

    // For now, simulate finding a customer based on test data
    if (normalizedEmail.includes('test') || normalizedEmail.includes('john')) {
      return {
        id: 'customer_123',
        first_name: 'John',
        last_name: 'Doe',
        email: normalizedEmail,
        phone: normalizedPhone,
        sales_rep: {
          name: 'Sarah Johnson',
          email: 'sarah.johnson@cadillacofsouthcharlotte.com',
          phone: '(704) 555-0102'
        },
        preferences: {
          vehicle_type: 'SUV',
          budget_min: 40000,
          budget_max: 60000
        }
      };
    }

    // Return null if no customer found
    return null;

  } catch (error) {
    console.error('Error finding customer:', error);
    throw error;
  }
}