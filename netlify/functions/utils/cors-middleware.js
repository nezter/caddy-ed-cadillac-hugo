/**
 * CORS middleware for Netlify functions
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://caddyed.com',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Auth-Token',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Max-Age': '86400'
};

/**
 * Handle CORS preflight requests
 * @param {Object} event - Netlify function event
 * @returns {Object|null} - CORS response or null if not a preflight
 */
function handleCors(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }
  return null;
}

/**
 * Add CORS headers to a response
 * @param {Object} response - Netlify function response
 * @returns {Object} - Response with CORS headers
 */
function addCorsHeaders(response) {
  return {
    ...response,
    headers: {
      ...response.headers,
      ...corsHeaders
    }
  };
}

module.exports = {
  handleCors,
  addCorsHeaders,
  corsHeaders
};