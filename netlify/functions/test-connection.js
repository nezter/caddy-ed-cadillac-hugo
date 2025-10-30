/**
 * Test connection function
 * Simple function to test Netlify functions server without database dependencies
 */

exports.handler = async function(event, context) {
  console.log('Test connection function called');
  
  try {
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
      },
      body: JSON.stringify({
        message: 'Functions server is working!',
        timestamp: new Date().toISOString(),
        method: event.httpMethod,
        path: event.path,
        env: {
          NODE_ENV: process.env.NODE_ENV || 'not set',
          HAS_SUPABASE_URL: !!process.env.SUPABASE_URL,
          HAS_DATABASE_URL: !!process.env.DATABASE_URL || !!process.env.SUPABASE_DB_URL
        }
      })
    };
  } catch (error) {
    console.error('Test connection error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message
      })
    };
  }
};