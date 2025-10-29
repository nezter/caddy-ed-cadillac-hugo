const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const errorHandler = require('./utils/error-handler');
const DatabaseService = require('./utils/database-service');
const { checkRateLimit } = require('./utils/auth-middleware');
const { handleCors, addCorsHeaders } = require('./utils/cors-middleware');

// JWT configuration - require JWT_SECRET to be set
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

/**
 * Sales Login API
 * Authenticates sales representatives and returns JWT token
 */
exports.handler = async function(event, context) {
  // Handle CORS preflight
  const corsResponse = handleCors(event);
  if (corsResponse) return corsResponse;

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return addCorsHeaders(errorHandler.forbiddenError('Method not allowed'));
  }

  // Rate limiting for login attempts
  const clientIP = event.headers['x-forwarded-for'] || event.headers['x-real-ip'] || 'unknown';
  const rateLimit = checkRateLimit(`login_${clientIP}`, 5, 15 * 60 * 1000); // 5 attempts per 15 minutes

  if (!rateLimit.allowed) {
    return addCorsHeaders(errorHandler.createSuccessResponse({
      message: 'Too many login attempts. Please try again later.',
      retryAfter: Math.ceil((rateLimit.resetTime - Date.now()) / 1000)
    }, 'Rate limited', 429));
  }

  try {
    let credentials;
    try {
      credentials = JSON.parse(event.body);
    } catch (e) {
      return addCorsHeaders(errorHandler.validationError('Invalid JSON in request body'));
    }

    // Validate required fields
    if (!credentials.email || !credentials.password) {
      return addCorsHeaders(errorHandler.validationError('Email and password are required'));
    }

    // Authenticate user
    const authResult = await authenticateUser(credentials.email, credentials.password);

    if (!authResult.success) {
      return addCorsHeaders(errorHandler.unauthorizedError('Invalid email or password'));
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

    return addCorsHeaders(errorHandler.createSuccessResponse({
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
    }, 'Login successful'));

  } catch (error) {
    console.error('Login error:', error);
    return addCorsHeaders(errorHandler.serverError('Login failed'));
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

    // Check password hash - require hashed passwords
    if (!user.password_hash) {
      return { success: false, message: 'Account setup incomplete - please contact administrator' };
    }

    // Use bcrypt to compare password with hash
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

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