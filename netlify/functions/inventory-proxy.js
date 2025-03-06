const fetch = require('node-fetch');
const cheerio = require('cheerio');
const { promisify } = require('util');
const crypto = require('crypto');

// Enhanced caching with Redis-like functionality using Netlify Environment Variables
// This is a simplified in-memory cache that persists across function invocations
let cache = {
  timestamp: 0,
  data: null,
  etag: '',
  ttl: 3600 * 1000, // 1 hour cache by default
  errorBackoff: {
    count: 0,
    lastError: 0,
    maxBackoff: 86400 * 1000 // 24 hour max backoff
  }
};

exports.handler = async function(event, context) {
  try {
    // Get query parameters for filtering
    const params = event.queryStringParameters || {};
    
    // Implement cache control from client
    const clientCacheControl = event.headers['cache-control'] || '';
    const noCache = clientCacheControl.includes('no-cache') || params.refresh === 'true';
    
    // Check if we should use cached data
    const now = Date.now();
    const cacheAge = now - cache.timestamp;
    let useCachedData = cache.data && !noCache && (cacheAge < cache.ttl);
    
    // Implement error backoff strategy
    const backoffTime = Math.min(
      Math.pow(2, cache.errorBackoff.count) * 1000, 
      cache.errorBackoff.maxBackoff
    );
    const inBackoffPeriod = (now - cache.errorBackoff.lastError) < backoffTime;
    
    if (inBackoffPeriod && cache.data) {
      console.log(`Using cached data due to error backoff (attempts: ${cache.errorBackoff.count})`);
      useCachedData = true;
    }
    
    // Get either cached data or fetch fresh data
    let vehicles;
    let sourceType = 'cache';
    
    if (useCachedData) {
      console.log("Using cached inventory data");
      vehicles = cache.data;
    } else {
      console.log("Fetching fresh inventory data");
      try {
        // Include staggered timing to prevent rate limiting detection
        const randomDelay = Math.floor(Math.random() * 500) + 500;
        await new Promise(resolve => setTimeout(resolve, randomDelay));
        
        vehicles = await fetchInventoryWithRetry();
        sourceType = 'fresh';
        
        // Update cache with new data
        cache = {
          timestamp: now,
          data: vehicles,
          etag: generateETag(vehicles),
          ttl: cache.ttl,
          errorBackoff: {
            count: 0,
            lastError: 0,
            maxBackoff: cache.errorBackoff.maxBackoff
          }
        };
      } catch (error) {
        console.error("Error fetching inventory:", error);
        
        // Update error backoff counter
        cache.errorBackoff.count += 1;
        cache.errorBackoff.lastError = now;
        
        // Fall back to cache if available
        if (cache.data) {
          console.log("Falling back to cached data after fetch error");
          vehicles = cache.data;
          sourceType = 'stale-cache';
        } else {
          throw error; // Re-throw if we have no cache to fall back to
        }
      }
    }

    // Apply filters from query parameters
    const filteredVehicles = filterVehicles(vehicles, params);
    
    // Apply pagination
    const page = parseInt(params.page) || 1;
    const perPage = parseInt(params.perPage) || 12;
    const start = (page - 1) * perPage;
    const end = start + perPage;
    
    const paginatedVehicles = filteredVehicles.slice(start, end);
    
    // Generate ETag for client caching
    const responseEtag = generateETag(paginatedVehicles);
    const clientEtag = event.headers['if-none-match'];
    
    // Return 304 Not Modified if ETags match
    if (clientEtag && clientEtag === responseEtag) {
      return {
        statusCode: 304,
        headers: {
          'ETag': responseEtag,
          'Cache-Control': 'public, max-age=300' // 5 minutes browser cache
        },
        body: '' // No body needed for 304
      };
    }
    
    // Return the response
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300', // 5 minutes browser cache
        'ETag': responseEtag,
        'X-Data-Source': sourceType
      },
      body: JSON.stringify({
        success: true,
        vehicles: paginatedVehicles,
        totalCount: filteredVehicles.length,
        pagination: {
          page,
          perPage,
          totalPages: Math.ceil(filteredVehicles.length / perPage)
        },
        lastUpdated: new Date(cache.timestamp).toISOString()
      })
    };
  } catch (error) {
    console.error('Error processing inventory request:', error);
    
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        success: false,
        error: 'Failed to fetch inventory data',
        message: error.message
      })
    };
  }
};

async function fetchInventoryWithRetry(attempts = 3) {
  let lastError;
  
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fetchInventory();
    } catch (error) {
      console.error(`Attempt ${attempt} failed:`, error.message);
      lastError = error;
      
      // Exponential backoff between attempts
      if (attempt < attempts) {
        const backoffTime = Math.pow(2, attempt) * 500; // 1s, 2s, 4s
        await new Promise(resolve => setTimeout(resolve, backoffTime));
      }
    }
  }
  
  throw lastError;
}

async function fetchInventory() {
  // Multiple URLs for inventory pages - rotate through them
  const inventoryUrls = [
    'https://www.cadillacofsouthcharlotte.com/new-inventory/index.htm?make=Cadillac',
    'https://www.cadillacofsouthcharlotte.com/VehicleSearchResults?search=new&make=Cadillac',
    'https://www.cadillacofsouthcharlotte.com/searchnew.aspx?make=Cadillac'
  ];
  
  const urlIndex = Math.floor(Math.random() * inventoryUrls.length);
  const url = inventoryUrls[urlIndex];
  
  // Diversify user agents to avoid detection
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.1 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:95.0) Gecko/20100101 Firefox/95.0',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.93 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 15_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.1 Mobile/15E148 Safari/604.1'
  ];
  
  const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
  
  // Random request headers to simulate browser behavior
  const headers = {
    'User-Agent': randomUserAgent,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.google.com/',
    'DNT': '1',
    'Connection': 'keep-alive',
    'Cache-Control': 'max-age=0',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'cross-site'
  };
  
  // Fetch the HTML page
  const response = await fetch(url, { headers });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch inventory, status: ${response.status}`);
  }
  
  const html = await response.text();
  
  if (!html || html.trim().length < 1000) {
    throw new Error('Received incomplete or empty page');
  }
  
  // Try to detect if we've been rate limited or blocked
  if (html.includes('rate limit') || html.includes('blocked') || 
      html.includes('captcha') || html.includes('security check')) {
    throw new Error('Access appears to be rate limited or blocked');
  }
  
  // Parse HTML to extract vehicle data
  return parseInventoryHtml(html, url);
}

function parseInventoryHtml(html, sourceUrl) {
  const $ = cheerio.load(html);
  const vehicles = [];
  
  // Store approximate inventory page type for better parsing
  let pageType = 'unknown';
  if (sourceUrl.includes('VehicleSearchResults')) {
    pageType = 'search-results';
  } else if (sourceUrl.includes('new-inventory')) {
    pageType = 'new-inventory';
  } else if (sourceUrl.includes('searchnew')) {
    pageType = 'search-new';
  }
  
  // Log the detected page type
  console.log(`Detected inventory page type: ${pageType}`);
  
  // Different selectors based on page structure
  let vehicleSelectors = [
    '.vehicle-card', 
    '.srp-vehicle', 
    '.inventory-item',
    '.inv-card',
    '.vehicle-listing',
    '.ddc-pod'
  ];
  
  if (pageType === 'search-results') {
    vehicleSelectors = ['.srp-vehicle', '.vehicle-card', '.ddc-pod'];
  } else if (pageType === 'new-inventory') {
    vehicleSelectors = ['.vehicle-listing', '.inventory-item'];
  }
  
  // Try each selector in order until we find matches
  let matchedSelector = '';
  let vehicleElements = [];
  
  for (let selector of vehicleSelectors) {
    vehicleElements = $(selector);
    if (vehicleElements.length > 0) {
      matchedSelector = selector;
      console.log(`Found ${vehicleElements.length} vehicles using selector: ${selector}`);
      break;
    }
  }
  
  if (vehicleElements.length === 0) {
    console.error('No vehicles found in HTML using standard selectors');
    
    // Fallback: try to find any element that might contain vehicle info
    const fallbackSelectors = ['[itemtype*="Product"]', '[data-make]', '[data-year]'];
    for (let selector of fallbackSelectors) {
      vehicleElements = $(selector);
      if (vehicleElements.length > 0) {
        matchedSelector = selector;
        console.log(`Fallback: found ${vehicleElements.length} vehicles using selector: ${selector}`);
        break;
      }
    }
  }
  
  // Process vehicle elements
  vehicleElements.each((index, element) => {
    try {
      const $el = $(element);
      
      // Extract vehicle data using the appropriate methods based on page type
      let vehicle = {};
      
      if (pageType === 'search-results') {
        vehicle = extractVehicleDataFromSearchResults($, $el, index);
      } else if (pageType === 'new-inventory') {
        vehicle = extractVehicleDataFromNewInventory($, $el, index);
      } else {
        // Generic extraction as fallback
        vehicle = extractGenericVehicleData($, $el, index);
      }
      
      // Validate and only add valid vehicles
      if (validateVehicle(vehicle)) {
        vehicles.push(vehicle);
      }
    } catch (err) {
      console.error('Error parsing vehicle element:', err);
    }
  });
  
  // If we found very few or no vehicles, try a different parsing approach
  if (vehicles.length < 3) {
    console.log('Found too few vehicles, trying alternate parsing approach');
    
    // Try to find structured data in script tags
    try {
      const structuredDataVehicles = extractStructuredDataVehicles($);
      if (structuredDataVehicles.length > 0) {
        console.log(`Found ${structuredDataVehicles.length} vehicles from structured data`);
        return structuredDataVehicles;
      }
    } catch (e) {
      console.error('Error extracting structured data:', e);
    }
    
    // Try one more fallback method
    try {
      const fallbackVehicles = extractVehiclesFromGenericHTML($, html);
      if (fallbackVehicles.length > 0) {
        console.log(`Fallback method found ${fallbackVehicles.length} vehicles`);
        return fallbackVehicles;
      }
    } catch (e) {
      console.error('Error in fallback extraction:', e);
    }
  }
  
  return vehicles;
}

function extractVehicleDataFromSearchResults($, $el, index) {
  // Extract title as a starting point
  const titleEl = $el.find('.vehicle-title, .vehicle-name, .srp-vehicle-title, .title, h2, h3').first();
  const title = titleEl.text().trim();
  
  // Generate ID from data attribute or create a unique one
  const id = $el.attr('data-id') || $el.attr('data-vehicle-id') || `vehicle-${index}-${Date.now()}`;
  
  // Parse title to extract year, make, model
  let year = '';
  let make = 'Cadillac'; 
  let model = '';
  
  const titleMatch = title.match(/(\d{4})\s+(.*)/);
  if (titleMatch) {
    year = titleMatch[1];
    const remaining = titleMatch[2].trim();
    
    // Extract model, assuming it comes after "Cadillac"
    const makeModelMatch = remaining.match(/Cadillac\s+(.*)/i);
    if (makeModelMatch) {
      model = makeModelMatch[1].trim();
    } else {
      model = remaining;
    }
  }
  
  // Extract price - try multiple selectors
  let price = '';
  let priceValue = 0;
  
  const priceSelectors = [
    '.price', '.vehicle-price', '.srp-price',
    '[data-price]', '[class*="price"]', 
    '.price-value', '.value', 
    '.primaryPrice'
  ];
  
  let priceEl;
  for (let selector of priceSelectors) {
    priceEl = $el.find(selector).first();
    if (priceEl.length && priceEl.text().trim()) {
      break;
    }
  }
  
  if (priceEl && priceEl.length) {
    price = priceEl.text().trim();
    // Extract numeric value from price string
    const priceMatch = price.match(/[\d,]+/);
    if (priceMatch) {
      priceValue = parseInt(priceMatch[0].replace(/,/g, ''), 10);
    }
  }
  
  // Get vehicle image with multiple selectors
  let image = '';
  const imgSelectors = ['img', '.vehicle-image img', '.photo img', '[data-image]'];
  
  for (let selector of imgSelectors) {
    const imgEl = $el.find(selector).first();
    if (imgEl.length) {
      image = imgEl.attr('src') || imgEl.attr('data-src') || imgEl.attr('data-lazy-src') || '';
      if (image) break;
    }
  }
  
  // Ensure image URL is absolute
  if (image && !image.startsWith('http')) {
    image = image.startsWith('/') 
      ? `https://www.cadillacofsouthcharlotte.com${image}`
      : `https://www.cadillacofsouthcharlotte.com/${image}`;
  }
  
  // Get vehicle link
  let link = '';
  const linkSelectors = [
    'a[href*="vehicle"]', 
    'a[href*="inventory"]',
    '.vehicle-title a', 
    '.title a', 
    'a.vehicle-url',
    'a[data-href]',
    'a'
  ];
  
  for (let selector of linkSelectors) {
    const linkEl = $el.find(selector).first();
    if (linkEl.length) {
      link = linkEl.attr('href') || linkEl.attr('data-href') || '';
      if (link) break;
    }
  }
  
  // Ensure link URL is absolute
  if (link && !link.startsWith('http')) {
    link = link.startsWith('/') 
      ? `https://www.cadillacofsouthcharlotte.com${link}`
      : `https://www.cadillacofsouthcharlotte.com/${link}`;
  }
  
  // Extract other details using helper function
  const mileage = extractVehicleDetail($, $el, [
    '.mileage', '.vehicle-miles', '.miles', 
    '[data-mileage]', '[class*="mileage"]'
  ], '0 miles');
  
  const mileageValue = parseInt(mileage.replace(/[^\d]/g, ''), 10) || 0;
  
  const extColor = extractVehicleDetail($, $el, [
    '.exterior-color', '.ext-color', '[data-color]',
    '.color', '[class*="exterior"]'
  ], '');
  
  const intColor = extractVehicleDetail($, $el, [
    '.interior-color', '.int-color',
    '[class*="interior"]', '.interior'
  ], '');
  
  const vin = extractVehicleDetail($, $el, [
    '.vin', '.vehicle-vin', '[data-vin]'
  ], '').replace(/VIN:\s*/i, '');
  
  const stockNumber = extractVehicleDetail($, $el, [
    '.stock', '.stock-number', '[data-stock]',
    '.stock-num', '[class*="stock"]'
  ], '').replace(/Stock\s*#?:\s*/i, '');
  
  // Build complete vehicle object
  return {
    id,
    title,
    year,
    make,
    model,
    price: priceValue,
    priceDisplay: price,
    mileage: mileageValue, 
    mileageDisplay: mileage,
    exteriorColor: extColor,
    interiorColor: intColor,
    vin,
    stockNumber,
    image,
    detailUrl: link || `https://www.cadillacofsouthcharlotte.com/inventory/${vin || stockNumber}`
  };
}

function extractVehicleDataFromNewInventory($, $el, index) {
  // This method would have a different approach for the new-inventory page format
  // but for now, we'll use the generic extraction as a placeholder
  return extractGenericVehicleData($, $el, index);
}

function extractGenericVehicleData($, $el, index) {
  // Check for structured data first
  let vehicleData = {};
  
  // Check for year, make, model in data attributes
  const year = $el.attr('data-year') || '';
  const make = $el.attr('data-make') || 'Cadillac';
  const model = $el.attr('data-model') || '';
  
  // Check if there's a readable title somewhere
  let title = '';
  const titleEl = $el.find('h1, h2, h3, h4, .title, .vehicle-title').first();
  if (titleEl.length) {
    title = titleEl.text().trim();
  }
  
  // If we don't have basic info from data attributes, try to extract from title
  if (title && (!year || !model)) {
    const titleMatch = title.match(/(\d{4})\s+(Cadillac)\s+(.+)/i);
    if (titleMatch) {
      vehicleData.year = titleMatch[1];
      vehicleData.make = titleMatch[2];
      vehicleData.model = titleMatch[3];
    }
  } else {
    vehicleData.year = year;
    vehicleData.make = make;
    vehicleData.model = model;
  }
  
  // Ensure we have a title
  if (!title && vehicleData.year && vehicleData.model) {
    vehicleData.title = `${vehicleData.year} ${vehicleData.make} ${vehicleData.model}`;
  } else {
    vehicleData.title = title;
  }
  
  // Extract other details
  const id = $el.attr('data-id') || $el.attr('id') || `vehicle-${index}-${Date.now()}`;
  
  // Price can be in many formats
  let price = '';
  let priceValue = 0;
  
  const priceEl = $el.find('[class*="price"], [data-price], .price, .cost, .msrp').first();
  if (priceEl.length) {
    price = priceEl.text().trim();
    const priceMatch = price.match(/[\d,]+/);
    if (priceMatch) {
      priceValue = parseInt(priceMatch[0].replace(/,/g, ''), 10);
    }
  }
  
  // Get any image
  let image = '';
  const imgEl = $el.find('img').first();
  if (imgEl.length) {
    image = imgEl.attr('src') || imgEl.attr('data-src') || '';
  }
  
  // Get any link
  let link = '';
  const linkEl = $el.find('a').first();
  if (linkEl.length) {
    link = linkEl.attr('href') || '';
  }
  
  // Return collected data
  return {
    id,
    title: vehicleData.title,
    year: vehicleData.year || '',
    make: vehicleData.make || 'Cadillac',
    model: vehicleData.model || '',
    price: priceValue,
    priceDisplay: price,
    mileage: 0,
    mileageDisplay: 'New',
    image,
    detailUrl: link
  };
}

function extractStructuredDataVehicles($) {
  const vehicles = [];
  
  // Look for JSON-LD scripts that might contain vehicle data
  $('script[type="application/ld+json"]').each((i, el) => {
    try {
      const scriptContent = $(el).html();
      if (!scriptContent) return;
      
      const jsonData = JSON.parse(scriptContent);
      
      // Check if this is vehicle/product data
      if (jsonData['@type'] === 'Product' || 
          jsonData['@type'] === 'Vehicle' || 
          jsonData['@type'] === 'Car') {
        
        // Extract data from JSON-LD
        const vehicle = {
          id: `structured-${i}`,
          title: jsonData.name || '',
          price: jsonData.offers?.price || 0,
          priceDisplay: jsonData.offers?.price ? `$${jsonData.offers.price}` : '',
          mileage: 0,
          mileageDisplay: 'New',
          image: jsonData.image || '',
          detailUrl: jsonData.url || ''
        };
        
        // Try to parse year/make/model from name
        const nameMatch = (vehicle.title || '').match(/(\d{4})\s+(Cadillac)\s+(.+)/i);
        if (nameMatch) {
          vehicle.year = nameMatch[1];
          vehicle.make = nameMatch[2];
          vehicle.model = nameMatch[3];
        } else {
          vehicle.year = '';
          vehicle.make = 'Cadillac';
          vehicle.model = vehicle.title;
        }
        
        if (validateVehicle(vehicle)) {
          vehicles.push(vehicle);
        }
      }
      
      // Check for arrays of products/vehicles
      if (Array.isArray(jsonData)) {
        jsonData.forEach((item, j) => {
          if (item['@type'] === 'Product' || 
              item['@type'] === 'Vehicle' || 
              item['@type'] === 'Car') {
            
            const vehicle = {
              id: `structured-array-${i}-${j}`,
              title: item.name || '',
              price: item.offers?.price || 0,
              priceDisplay: item.offers?.price ? `$${item.offers.price}` : '',
              mileage: 0,
              mileageDisplay: 'New',
              image: item.image || '',
              detailUrl: item.url || ''
            };
            
            // Try to parse year/make/model from name
            const nameMatch = (vehicle.title || '').match(/(\d{4})\s+(Cadillac)\s+(.+)/i);
            if (nameMatch) {
              vehicle.year = nameMatch[1];
              vehicle.make = nameMatch[2];
              vehicle.model = nameMatch[3];
            } else {
              vehicle.year = '';
              vehicle.make = 'Cadillac';
              vehicle.model = vehicle.title;
            }
            
            if (validateVehicle(vehicle)) {
              vehicles.push(vehicle);
            }
          }
        });
      }
    } catch (e) {
      console.error('Error parsing JSON-LD:', e);
    }
  });
  
  return vehicles;
}

function extractVehiclesFromGenericHTML($, html) {
  const vehicles = [];
  
  // Last resort approach: find all elements that could be vehicle cards
  $('div, article, section, li').each((i, el) => {
    const $el = $(el);
    
    // Skip very small elements or ones that are likely to be headers, etc.
    if ($el.find('*').length < 5) return;
    
    // Check if this element has both price-looking content and vehicle-looking content
    const text = $el.text();
    const hasPricePattern = /\$[\d,]+|\$\d{1,3}(,\d{3})+(\.\d{2})?/i.test(text);
    const hasVehiclePattern = /cadillac|escalade|ct[4-6]|xt[4-6]|lyriq/i.test(text);
    
    if (hasPricePattern && hasVehiclePattern) {
      // This might be a vehicle card, try to extract data
      try {
        // Look for a title-like element
        let title = '';
        $el.find('h1, h2, h3, h4, h5, .title, strong, b').each((j, titleEl) => {
          const titleText = $(titleEl).text().trim();
          if (titleText.length > 5 && /\d{4}|cadillac/i.test(titleText)) {
            title = titleText;
            return false; // break each loop
          }
        });
        
        if (!title) return; // Skip if no title found
        
        // Extract price
        let price = '';
        const priceMatch = text.match(/\$[\d,]+|\$\d{1,3}(,\d{3})+(\.\d{2})?/);
        if (priceMatch) {
          price = priceMatch[0];
        }
        
        // Extract year, make, model
        let year = '';
        let make = 'Cadillac';
        let model = '';
        
        const yearMatch = title.match(/\b(20\d{2})\b/);
        if (yearMatch) {
          year = yearMatch[1];
        }
        
        const modelPatterns = {
          'Escalade': /escalade/i,
          'CT4': /ct4|ct-4/i,
          'CT5': /ct5|ct-5/i,
          'CT6': /ct6|ct-6/i,
          'XT4': /xt4|xt-4/i,
          'XT5': /xt5|xt-5/i,
          'XT6': /xt6|xt-6/i,
          'LYRIQ': /lyriq/i
        };
        
        for (const [modelName, pattern] of Object.entries(modelPatterns)) {
          if (pattern.test(title)) {
            model = modelName;
            break;
          }
        }
        
        // Find any image
        let image = '';
        $el.find('img').each((j, imgEl) => {
          const imgSrc = $(imgEl).attr('src') || $(imgEl).attr('data-src') || '';
          if (imgSrc && !imgSrc.includes('logo') && !imgSrc.includes('icon')) {
            image = imgSrc;
            return false; // break each loop
          }
        });
        
        // Find any link
        let link = '';
        $el.find('a').each((j, linkEl) => {
          const href = $(linkEl).attr('href') || '';
          if (href && (href.includes('vehicle') || href.includes('inventory') || href.includes('detail'))) {
            link = href;
            return false; // break each loop
          }
        });
        
        // Create vehicle object
        const vehicle = {
          id: `fallback-${i}`,
          title,
          year,
          make,
          model,
          price: parseInt(price.replace(/[^\d]/g, ''), 10) || 0,
          priceDisplay: price,
          image,
          detailUrl: link
        };
        
        if (validateVehicle(vehicle)) {
          vehicles.push(vehicle);
        }
      } catch (e) {
        console.error('Error extracting from generic element:', e);
      }
    }
  });
  
  return vehicles;
}

function extractVehicleDetail($, $el, selectors, defaultValue) {
  for (let selector of selectors) {
    const detailEl = $el.find(selector).first();
    if (detailEl.length) {
      const value = detailEl.text().trim();
      if (value) return value;
    }
  }
  return defaultValue;
}

function validateVehicle(vehicle) {
  // Check required fields
  if (!vehicle.title) return false;
  
  // Basic validation for year
  if (vehicle.year) {
    const yearNum = parseInt(vehicle.year, 10);
    if (isNaN(yearNum) || yearNum < 1886 || yearNum > new Date().getFullYear() + 1) {
      return false;
    }
  }
  
  return true;
}

function generateETag(data) {
  const hash = crypto.createHash('md5').update(JSON.stringify(data)).digest('hex');
  return `"${hash}"`;
}

function filterVehicles(vehicles, params) {
  return vehicles.filter(vehicle => {
    // Filter by model
    if (params.model && !vehicle.model.toLowerCase().includes(params.model.toLowerCase())) {
      return false;
    }
    
    // Filter by year
    if (params.year && vehicle.year !== params.year) {
      return false;
    }
    
    // Filter by price range
    if (params.minPrice && vehicle.price < parseInt(params.minPrice, 10)) {
      return false;
    }
    if (params.maxPrice && vehicle.price > parseInt(params.maxPrice, 10)) {
      return false;
    }
    
    // Filter by search term
    if (params.search) {
      const searchTerm = params.search.toLowerCase();
      const vehicleText = `${vehicle.title} ${vehicle.model} ${vehicle.exteriorColor} ${vehicle.interiorColor} ${vehicle.vin} ${vehicle.stockNumber}`.toLowerCase();
      
      if (!vehicleText.includes(searchTerm)) {
        return false;
      }
    }
    
    return true;
  });
}
