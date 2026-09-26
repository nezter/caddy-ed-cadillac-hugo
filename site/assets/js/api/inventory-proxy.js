/**
 * Inventory Proxy API
 * Serverless function to proxy inventory requests to avoid CORS issues
 * This will be deployed to Netlify Functions
 */

exports.handler = async function(event, context) {
  const baseUrl = 'https://www.cadillacofsouthcharlotte.com/VehicleSearchResults';
  
  try {
    // Parse query params from the request
    const params = event.queryStringParameters || {};
    
    // Build the URL with query params
    const url = new URL(baseUrl);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });
    
    // Set default parameters if not provided
    if (!url.searchParams.has('search')) {
      url.searchParams.append('search', 'new');
    }
    if (!url.searchParams.has('make')) {
      url.searchParams.append('make', 'Cadillac');
    }
    
    console.log(`Proxying request to: ${url.toString()}`);
    
    // Fetch the data from the target URL
    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    const data = await response.text();
    
    // Return the response
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html',
        'Cache-Control': 'public, max-age=3600'
      },
      body: data
    };
  } catch (error) {
    console.log('Error proxying inventory request:', error);
    
    // Return error response
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to fetch inventory data' })
    };
  }
};
