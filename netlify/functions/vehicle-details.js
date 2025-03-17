const fetch = require('node-fetch');
const errorHandler = require('./utils/error-handler');

exports.handler = async function(event, context) {
  // Get vehicle ID from query string
  const vehicleId = event.queryStringParameters.id;
  
  if (!vehicleId) {
    return errorHandler.validationError('Vehicle ID is required', { id: 'Missing required parameter' });
  }
  
  try {
    // Call the dealer's API to get vehicle details
    const apiUrl = `https://www.cadillacofsouthcharlotte.com/api/vehicle/${vehicleId}`;
    
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    if (!response.ok) {
      // Handle different API error status codes
      if (response.status === 404) {
        return errorHandler.notFoundError(`Vehicle with ID ${vehicleId} not found`);
      }
      
      return errorHandler.apiError(
        `Failed to fetch vehicle data (Status: ${response.status})`, 
        { status: response.status, statusText: response.statusText }
      );
    }
    
    const data = await response.json();
    
    // Cache results for improved performance
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300' // Cache for 5 minutes
      },
      body: JSON.stringify({
        success: true,
        data: data
      })
    };
  } catch (error) {
    return errorHandler.serverError('Error fetching vehicle details', error);
  }
};