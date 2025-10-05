const jwt = require('jsonwebtoken');
const DatabaseService = require('./utils/database-service');

/**
 * Customer Dashboard API
 * Provides customer data for the portal
 */
exports.handler = async (event, context) => {
  // Verify authentication
  const authHeader = event.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      statusCode: 401,
      body: JSON.stringify({ success: false, error: 'Authentication required' })
    };
  }

  try {
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');

    if (decoded.type !== 'customer') {
      return {
        statusCode: 403,
        body: JSON.stringify({ success: false, error: 'Invalid token type' })
      };
    }

    const customerId = decoded.customerId;

    // Get customer data based on the request path/query
    const pathParts = event.path.split('/');
    const action = pathParts[pathParts.length - 1]; // Last part of path

    let data;

    switch (action) {
      case 'appointments':
        data = await getCustomerAppointments(customerId);
        break;
      case 'preferences':
        data = await getCustomerPreferences(customerId);
        break;
      case 'activity':
        data = await getCustomerActivity(customerId);
        break;
      case 'sales-rep':
        data = await getCustomerSalesRep(customerId);
        break;
      default:
        // Return dashboard overview
        data = await getCustomerDashboard(customerId);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data: data
      })
    };

  } catch (error) {
    console.error('Customer dashboard error:', error);

    if (error.name === 'JsonWebTokenError') {
      return {
        statusCode: 401,
        body: JSON.stringify({ success: false, error: 'Invalid token' })
      };
    }

    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: 'Failed to load dashboard data',
        details: error.message
      })
    };
  }
};

/**
 * Get customer dashboard overview
 */
async function getCustomerDashboard(customerId) {
  const [appointments, preferences, recentActivity, salesRep] = await Promise.all([
    getCustomerAppointments(customerId),
    getCustomerPreferences(customerId),
    getCustomerActivity(customerId, 5), // Last 5 activities
    getCustomerSalesRep(customerId)
  ]);

  return {
    appointments: appointments.upcoming,
    preferences,
    recentActivity,
    salesRep
  };
}

/**
 * Get customer appointments
 */
async function getCustomerAppointments(customerId) {
  // In a real implementation, this would query the database
  // For now, return mock data
  return {
    upcoming: [
      {
        id: 'appt_1',
        type: 'Test Drive',
        scheduled_date: '2024-10-15',
        scheduled_time: '14:00',
        location: 'Cadillac Dealership',
        status: 'confirmed',
        notes: 'Escalade Premium Luxury test drive',
        sales_rep_name: 'Sarah Johnson'
      }
    ],
    past: []
  };
}

/**
 * Get customer preferences
 */
async function getCustomerPreferences(customerId) {
  // In a real implementation, this would query the database
  // For now, return mock data
  return {
    vehicle_type: 'SUV',
    budget_min: 40000,
    budget_max: 60000,
    preferred_contact_method: 'email',
    preferred_features: ['navigation', 'leather seats', 'premium audio']
  };
}

/**
 * Get customer recent activity
 */
async function getCustomerActivity(customerId, limit = 10) {
  // In a real implementation, this would query the database
  // For now, return mock data
  return [
    {
      id: 'activity_1',
      date: '2024-10-10',
      type: 'lead_created',
      description: 'Initial contact via website',
      details: 'Submitted test drive request for Escalade'
    },
    {
      id: 'activity_2',
      date: '2024-10-12',
      type: 'appointment_scheduled',
      description: 'Test drive appointment scheduled',
      details: 'Scheduled for October 15th at 2:00 PM'
    },
    {
      id: 'activity_3',
      date: '2024-10-08',
      type: 'email_sent',
      description: 'Follow-up email sent',
      details: 'Vehicle information and pricing details'
    }
  ].slice(0, limit);
}

/**
 * Get customer's assigned sales representative
 */
async function getCustomerSalesRep(customerId) {
  // In a real implementation, this would query the database
  // For now, return mock data
  return {
    name: 'Sarah Johnson',
    title: 'Sales Representative',
    email: 'sarah.johnson@cadillacofsouthcharlotte.com',
    phone: '(704) 555-0102',
    photo: '/images/sales-reps/sarah-johnson.jpg'
  };
}