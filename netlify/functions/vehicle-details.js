const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  // Get VIN from query string
  const vin = event.queryStringParameters.vin;
  
  if (!vin) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'VIN parameter is required' })
    };
  }
  
  try {
    // Base URL for the dealership's API
    const baseUrl = 'https://www.cadillacofsouthcharlotte.com/apis/vehicle';
    
    // Build URL with VIN
    const url = `${baseUrl}?vin=${vin}`;
    
    console.log(`Fetching details for VIN: ${vin}`);
    
    // Fetch vehicle data
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch vehicle details: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Process and format the vehicle data
    const vehicle = processVehicleData(data);
    
    // Return the processed data
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600'
      },
      body: JSON.stringify(vehicle)
    };
  } catch (error) {
    console.log('Error fetching vehicle details:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to fetch vehicle details',
        message: error.message
      })