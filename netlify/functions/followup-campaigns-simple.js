const errorHandler = require('./utils/error-handler');

exports.handler = async function(event, context) {
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
        success: true,
        message: 'Follow-up campaigns API is working',
        data: [],
        pagination: {
          total: 0,
          limit: 5,
          offset: 0
        }
      })
    };
  } catch (error) {
    return errorHandler.handle(error, context);
  }
};