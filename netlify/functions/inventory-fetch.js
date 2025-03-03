const fetch = require('node-fetch');
const DOMParser = require('dom-parser');

exports.handler = async function(event, context) {
  try {
    // Parse request parameters
    const params = event.queryStringParameters || {};
    const { type = 'new', limit = 12, offset = 0, model = '' } = params;
    
    // Configure cache headers
    const cacheHeaders = {
      'Cache-Control': 'public, max-age=3600' // Cache for 1 hour
    };
    
    // Fetch inventory data from dealer API
    const baseUrl = 'https://www.cadillacofsouthcharlotte.com/apis/inventory';
    let requestUrl = `${baseUrl}?type=${type}&limit=${limit}&offset=${offset}`;
    
    if (model) {
      requestUrl += `&model=${encodeURIComponent(model)}`;
    }
    
    console.log(`Fetching inventory from: ${requestUrl}`);
    
    const response = await fetch(requestUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`API responded with status: ${response.status}`);
    }
    
    // Process the API response
    let data;
    const contentType = response.headers.get('content-type') || '';
    
    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      // Handle HTML response by extracting structured data
      const html = await response.text();
      data = extractVehicleDataFromHTML(html);
    }
    
    // Return the processed inventory data
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...cacheHeaders
      },
      body: JSON.stringify({
        success: true,
        vehicles: data.vehicles || [],
        pagination: data.pagination || {
          total: data.vehicles?.length || 0,
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      })
    };
  } catch (error) {
    console.error('Error fetching inventory data:', error);
    
    // Return error response
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        success: false, 
        error: 'Failed to fetch inventory data',
        message: error.message
      })
    };
  }
};

// Helper function to extract vehicle data from HTML
function extractVehicleDataFromHTML(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  
  const vehicles = [];
  const vehicleElements = doc.getElementsByClassName('vehicle-card') || [];
  
  for (const element of vehicleElements) {
    try {
      const titleEl = element.getElementsByClassName('vehicle-title')[0];
      const priceEl = element.getElementsByClassName('vehicle-price')[0];
      const imageEl = element.getElementsByTagName('img')[0];
      const linkEl = element.getElementsByTagName('a')[0];
      
      const vehicle = {
        title: titleEl ? titleEl.textContent.trim() : 'Unknown Model',
        price: priceEl ? priceEl.textContent.trim() : 'Contact for Price',
        image: imageEl ? imageEl.getAttribute('src') : '',
        link: linkEl ? linkEl.getAttribute('href') : '',
        id: element.getAttribute('data-id') || Math.random().toString(36).substring(2)
      };
      
      vehicles.push(vehicle);
    } catch (err) {
      console.error('Error parsing vehicle element:', err);
    }
  }
  
  return { vehicles };
}
