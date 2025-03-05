const axios = require('axios');

exports.handler = async function(event, context) {
  try {
    // Get the path parameter from the request
    const pathSegments = event.path.split('/inventory-api/');
    const endpoint = pathSegments.length > 1 ? pathSegments[1] : '';
    
    // Base API URL for the dealer inventory system
    const baseUrl = process.env.INVENTORY_API_URL || 'https://api.cadillacofsouthcharlotte.com';
    const apiKey = process.env.INVENTORY_API_KEY;
    
    // Set up request configuration
    const config = {
      method: event.httpMethod,
      url: `${baseUrl}/${endpoint}`,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };
    
    // Pass through query parameters
    if (event.queryStringParameters) {
      config.params = event.queryStringParameters;
    }
    
    // Pass through body data for POST/PUT/PATCH requests
    if (['POST', 'PUT', 'PATCH'].includes(event.httpMethod) && event.body) {
      config.data = JSON.parse(event.body);
    }
    
    // Make the API request
    const response = await axios(config);
    
    // Return the proxied response
    return {
      statusCode: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300'
      },
      body: JSON.stringify(response.data)
    };
  } catch (error) {
    console.error('Error proxying inventory request:', error);
    
    // Properly handle different error types
    const statusCode = error.response?.status || 500;
    const errorMessage = error.response?.data || error.message;
    
    return {
      statusCode: statusCode,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        error: errorMessage,
        message: 'Error fetching inventory data'
      })
    };
  }
};
