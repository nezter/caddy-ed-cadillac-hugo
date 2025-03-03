const fetch = require('node-fetch');
const cheerio = require('cheerio');

// Cache inventory data for 15 minutes
let cache = {
  timestamp: 0,
  data: [],
  ttl: 15 * 60 * 1000 // 15 minutes in milliseconds
};

exports.handler = async function(event, context) {
  try {
    // Get query parameters
    const params = event.queryStringParameters || {};
    
    // Check if we can use cached data
    const now = Date.now();
    if (now - cache.timestamp < cache.ttl && cache.data.length > 0) {
      console.log('Using cached inventory data');
      // Filter cached results
      const filteredResults = filterInventory(cache.data, params);
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300' // 5 minutes browser cache
        },
        body: JSON.stringify(filteredResults)
      };
    }
    
    // If cache is expired or empty, fetch fresh data
    console.log('Fetching fresh inventory data');
    const baseUrl = 'https://www.cadillacofsouthcharlotte.com/VehicleSearchResults';
    
    // Build URL with minimal query params for full inventory
    const url = new URL(baseUrl);
    url.searchParams.append('search', params.condition || 'new');
    url.searchParams.append('make', 'Cadillac');
    
    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const html = await response.text();
    
    // Parse inventory items from the HTML
    const vehicles = parseInventoryHtml(html);
    
    // Update cache
    cache = {
      timestamp: now,
      data: vehicles,
      ttl: cache.ttl
    };
    
    // Filter results based on params
    const filteredResults = filterInventory(vehicles, params);
    
    // Return the filtered inventory
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300' // 5 minutes browser cache
      },
      body: JSON.stringify(filteredResults)
    };
    
  } catch (error) {
    console.log('Error fetching inventory data:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to fetch inventory data',
        message: error.message
      })
    };
  }
};

function parseInventoryHtml(html) {
  const $ = cheerio.load(html);
  const vehicles = [];
  
  // Find vehicle listings in the HTML
  $('.vehicle-card').each((index, element) => {
    try {
      const $el = $(element);
      
      // Extract vehicle data
      const id = $el.attr('data-id') || $el.attr('id') || `vehicle-${index}`;
      const titleEl = $el.find('.vehicle-card-title');
      const title = titleEl.text().trim();
      
      // Parse title to get year, make, model
      const titleParts = title.split(' ');
      const year = parseInt(titleParts[0], 10);
      const make = 'Cadillac'; // Assuming all are Cadillac
      const model = titleParts.slice(1).join(' ');
      
      // Get other details
      const price = parseInt($el.find('.price').text().replace(/[^\d]/g, ''), 10) || 0;
      const imageUrl = $el.find('img').attr('src') || '';
      const mileage = parseInt($el.find('.miles').text().replace(/[^\d]/g, ''), 10) || 0;
      const trim = $el.find('.trim').text().trim();
      const extColor = $el.find('.ext-color').text().trim();
      const transmission = $el.find('.transmission').text().trim() || 'Automatic';
      
      vehicles.push({
        id,
        year,
        make,
        model,
        trim,
        price,
        mileage,
        extColor,
        transmission,
        image: imageUrl,
        detailUrl: $el.find('a').attr('href') || '#'
      });
    } catch (err) {
      console.error('Error parsing vehicle element:', err);
    }
  });
  
  return vehicles;
}

function filterInventory(vehicles, params) {
  return vehicles.filter(vehicle => {
    // Filter by make
    if (params.make && params.make !== 'all' && vehicle.make.toLowerCase() !== params.make.toLowerCase()) {
      return false;
    }
    
    // Filter by model
    if (params.model && params.model !== 'all' && !vehicle.model.toLowerCase().includes(params.model.toLowerCase())) {
      return false;
    }
    
    // Filter by year
    if (params.year && parseInt(params.year, 10) !== vehicle.year) {
      return false;
    }
    
    // Filter by price range
    if (params.priceMin && vehicle.price < parseInt(params.priceMin, 10)) {
      return false;
    }
    if (params.priceMax && vehicle.price > parseInt(params.priceMax, 10)) {
      return false;
    }
    
    return true;
  });
}
