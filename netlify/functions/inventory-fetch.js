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

  // Try multiple selector strategies for different website structures
  let vehicleElements = [];

  // Strategy 1: Modern dealership sites with data attributes
  vehicleElements = doc.querySelectorAll('[data-vehicle-id], [data-vin], .vehicle-item, .inventory-item');

  // Strategy 2: Common class names used by dealership sites
  if (vehicleElements.length === 0) {
    vehicleElements = doc.querySelectorAll('.vehicle-card, .car-card, .vehicle-listing, .inventory-card');
  }

  // Strategy 3: Look for containers with vehicle information
  if (vehicleElements.length === 0) {
    const containers = doc.querySelectorAll('.vehicle-container, .car-container, .listing-container');
    vehicleElements = Array.from(containers).filter(container => {
      // Check if container has vehicle-related content
      const text = container.textContent.toLowerCase();
      return text.includes('cadillac') || text.includes('$') || /\d{4}/.test(text);
    });
  }

  console.log(`Found ${vehicleElements.length} potential vehicle elements`);

  for (const element of vehicleElements) {
    try {
      const vehicle = extractVehicleInfo(element);
      if (vehicle && vehicle.title && vehicle.title !== 'Unknown Model') {
        // Validate extracted data
        if (validateVehicleData(vehicle)) {
          vehicles.push(vehicle);
        } else {
          console.warn('Skipping invalid vehicle data:', vehicle);
        }
      }
    } catch (err) {
      console.error('Error parsing vehicle element:', err);
    }
  }

  console.log(`Successfully extracted ${vehicles.length} valid vehicles`);

  return { vehicles };
}

function validateVehicleData(vehicle) {
  // Basic validation rules
  if (!vehicle.title || vehicle.title.length < 3) {
    return false;
  }

  // Check for Cadillac brand (assuming this is a Cadillac dealership)
  if (!vehicle.title.toLowerCase().includes('cadillac') &&
      !/(CT[4-6]|XT[4-6]|Escalade|Lyriq)/i.test(vehicle.title)) {
    return false;
  }

  // Validate price format if present
  if (vehicle.price && vehicle.price !== 'Contact for Price') {
    const pricePattern = /^\$?[\d,]+(?:\.\d{2})?$/;
    if (!pricePattern.test(vehicle.price.replace(/[^\d$.,]/g, ''))) {
      console.warn(`Invalid price format: ${vehicle.price}`);
    }
  }

  // Validate image URLs
  if (vehicle.image && !vehicle.image.startsWith('http') && !vehicle.image.startsWith('//')) {
    console.warn(`Invalid image URL: ${vehicle.image}`);
  }

  return true;
}

function extractVehicleInfo(element) {
  // Multiple strategies for extracting vehicle information

  // Title/Model extraction
  let title = '';
  const titleSelectors = [
    '[data-vehicle-title]',
    '.vehicle-title', '.car-title', '.model-title',
    '.vehicle-name', '.car-name',
    'h2', 'h3', 'h4',
    '.title', '.name'
  ];

  for (const selector of titleSelectors) {
    const titleEl = element.querySelector(selector);
    if (titleEl) {
      title = titleEl.textContent.trim();
      console.log(`Found title with selector ${selector}: ${title}`);
      if (title && title.length > 3) break;
    }
  }

  // Fallback: look for text containing Cadillac and year
  if (!title || title.length < 5) {
    const text = element.textContent;
    const cadillacMatch = text.match(/(20\d{2}\s+.*?(?:Cadillac|CT4|CT5|CT6|XT4|XT5|XT6|Escalade|Lyriq).*?)(?:\s+\$|\n|$)/i);
    if (cadillacMatch) {
      title = cadillacMatch[1].trim();
    }
  }

  // Price extraction
  let price = '';
  const priceSelectors = [
    '[data-vehicle-price]',
    '.vehicle-price', '.car-price', '.price',
    '.msrp', '.sale-price',
    '[class*="price"]'
  ];

  for (const selector of priceSelectors) {
    const priceEl = element.querySelector(selector);
    if (priceEl) {
      price = priceEl.textContent.trim();
      // Clean up price format
      price = price.replace(/[^\d$,.]/g, '');
      if (price && (price.includes('$') || /^\d/.test(price))) break;
    }
  }

  // Fallback price extraction from text
  if (!price) {
    const text = element.textContent;
    const priceMatch = text.match(/\$[\d,]+(?:\.\d{2})?/);
    if (priceMatch) {
      price = priceMatch[0];
    }
  }

  // Image extraction (support multiple images and lazy loading)
  let images = [];
  const imageSelectors = [
    '[data-vehicle-image] img',
    '.vehicle-image img', '.car-image img',
    'img.vehicle-image', 'img.car-image',
    '.gallery img', '.thumbnails img',
    'img[data-src]', 'img[loading="lazy"]',
    'img:not([alt*="placeholder"]):not([alt*="no-image"])'
  ];

  for (const selector of imageSelectors) {
    const imgEls = element.querySelectorAll(selector);
    for (const imgEl of imgEls) {
      const src = imgEl.getAttribute('src') || imgEl.getAttribute('data-src') || '';
      const alt = imgEl.getAttribute('alt') || '';

      // Skip placeholder/no-image images
      if (src && !src.includes('placeholder') && !src.includes('no-image') &&
          !alt.toLowerCase().includes('placeholder') && !alt.toLowerCase().includes('no image')) {
        images.push({
          url: src,
          alt: alt,
          isPrimary: images.length === 0 // First image is primary
        });
      }

      // Limit to 5 images per vehicle
      if (images.length >= 5) break;
    }
    if (images.length > 0) break;
  }

  const image = images.length > 0 ? images[0].url : '';

  // Video extraction
  let video = '';
  const videoSelectors = [
    '[data-vehicle-video]',
    '.vehicle-video video', '.car-video video',
    'video source', 'iframe[src*="youtube"]', 'iframe[src*="vimeo"]'
  ];

  for (const selector of videoSelectors) {
    const videoEl = element.querySelector(selector);
    if (videoEl) {
      if (videoEl.tagName === 'VIDEO') {
        const sourceEl = videoEl.querySelector('source');
        video = sourceEl ? sourceEl.getAttribute('src') : '';
      } else if (videoEl.tagName === 'IFRAME') {
        video = videoEl.getAttribute('src');
      } else {
        video = videoEl.getAttribute('href') || videoEl.textContent;
      }
      if (video) break;
    }
  }

  // Link extraction
  let link = '';
  const linkSelectors = [
    '[data-vehicle-url]',
    'a.vehicle-link', 'a.car-link',
    'a:first-child'
  ];

  for (const selector of linkSelectors) {
    const linkEl = element.querySelector(selector);
    if (linkEl) {
      link = linkEl.getAttribute('href') || '';
      if (link && link.startsWith('http')) break;
    }
  }

  // Generate ID
  const id = element.getAttribute('data-vehicle-id') ||
             element.getAttribute('data-vin') ||
             element.getAttribute('data-id') ||
             Math.random().toString(36).substring(2, 15);

  return {
    title: title || 'Unknown Model',
    price: price || 'Contact for Price',
    image: image || '',
    images: images,
    video: video || '',
    link: link || '',
    id: id
  };
}
