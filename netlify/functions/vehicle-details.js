const fetch = require('node-fetch');
const errorHandler = require('./utils/error-handler');

exports.handler = async function(event, context) {
  // Get vehicle ID from query string
  const vehicleId = event.queryStringParameters.id;
  
  if (!vehicleId) {
    return errorHandler.validationError('Vehicle ID is required', { id: 'Missing required parameter' });
  }
  
  // This was hardcoded to https://www.cadillacofsouthcharlotte.com/api/vehicle/
  // -- a different dealership -- and spoofed a desktop Chrome User-Agent to get
  // past its 403. It is now INVENTORY_SOURCE_URL: a feed you control, with no
  // default. With nothing configured, respond honestly rather than failing
  // against someone else's server.
  const source = require('./utils/inventory-source');
  if (!source.isConfigured()) {
    return errorHandler.createSuccessResponse({
      vehicleId,
      configured: false,
      ...source.notConfigured(),
    });
  }

  try {
    const apiUrl = `${source.baseUrl()}/vehicle/${encodeURIComponent(vehicleId)}`;
    const response = await fetch(apiUrl, { headers: source.headers() });
    
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