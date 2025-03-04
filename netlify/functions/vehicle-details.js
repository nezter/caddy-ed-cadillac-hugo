const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  // Get vehicle ID from query string
  const vehicleId = event.queryStringParameters.id;
  
  if (!vehicleId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Vehicle ID is required' })
    };
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
      throw new Error(`API returned ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Cache results for improved performance
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300' // Cache for 5 minutes
      },
      body: JSON.stringify(data)
    };
  } catch (error) {
    console.error('Error fetching vehicle details:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to fetch vehicle details' })
    };
  }
};