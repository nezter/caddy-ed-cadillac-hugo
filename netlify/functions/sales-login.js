const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const errorHandler = require('./utils/error-handler');
const DatabaseService = require('./utils/database-service');

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

/**
 * Sales Login API
 * Authenticates sales representatives and returns JWT token
 */
exports.handler = async function(event, context) {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return errorHandler.forbiddenError('Method not allowed');
  }

  try {
    let credentials;
    try {
      credentials = JSON.parse(event.body);
    } catch (e) {
      return errorHandler.validationError('Invalid JSON in request body');
    }

    // Validate required fields
    if (!credentials.email || !credentials.password) {
      return errorHandler.validationError('Email and password are required');
    }

    // Authenticate user
    const authResult = await authenticateUser(credentials.email, credentials.password);

    if (!authResult.success) {
      return errorHandler.unauthorizedError('Invalid email or password');
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: authResult.user.id,
        email: authResult.user.email,
        role: authResult.user.role,
        permissions: authResult.user.permissions
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Update last login
    await DatabaseService.updateSalesRep(authResult.user.id, {
      last_login: new Date().toISOString()
    });

    return errorHandler.createSuccessResponse({
      token,
      user: {
        id: authResult.user.id,
        firstName: authResult.user.first_name,
        lastName: authResult.user.last_name,
        email: authResult.user.email,
        role: authResult.user.role,
        permissions: authResult.user.permissions
      },
      expiresIn: JWT_EXPIRES_IN
    }, 'Login successful');

  } catch (error) {
    console.error('Login error:', error);
    return errorHandler.serverError('Login failed', error);
  }
};

/**
 * Authenticate user credentials
 */
async function authenticateUser(email, password) {
  try {
    // Get user from database
    const user = await DatabaseService.getSalesRepByEmail(email);

    if (!user) {
      return { success: false, message: 'User not found' };
    }

    // Check if user is active
    if (user.status !== 'active') {
      return { success: false, message: 'Account is not active' };
    }

    // Check password hash
    let isValidPassword = false;
    if (user.password_hash) {
      // Use bcrypt to compare password with hash
      isValidPassword = await bcrypt.compare(password, user.password_hash);
    } else {
      // Fallback for development - check against plain text (remove in production)
      console.warn('⚠️ Using plain text password comparison - implement proper hashing in production');
      isValidPassword = password === 'password123'; // Temporary fallback
    }

    if (!isValidPassword) {
      return { success: false, message: 'Invalid password' };
    }

    return {
      success: true,
      user: {
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        role: user.role,
        permissions: user.permissions || ['view_customers', 'manage_leads']
      }
    };

  } catch (error) {
    console.error('Authentication error:', error);
    return { success: false, message: 'Authentication failed' };
  }
}