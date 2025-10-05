const fetch = require('node-fetch');
const cheerio = require('cheerio');

// Cache inventory data for 15 minutes
let cache = {
  timestamp: 0,
  data: [],
  ttl: 15 * 60 * 1000 // 15 minutes in milliseconds
};

exports.handler = async function(event, context) {
  const startTime = Date.now();

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

    // If cache is expired or empty, fetch fresh data from the dealership's API
    console.log('Fetching fresh inventory data from API');

    // Use the dealership's inventory API endpoint
    const apiUrl = 'https://www.cadillacofsouthcharlotte.com/api/widget/ws-inv-data/getInventory';

    const requestBody = {
      "siteId": "cadillacofsouthcharlottecadillac",
      "locale": "en_US",
      "device": "DESKTOP",
      "pageAlias": "INVENTORY_LISTING_DEFAULT_AUTO_NEW",
      "pageId": "cadillacofsouthcharlottecadillac_SITEBUILDER_INVENTORY_SEARCH_RESULTS_AUTO_NEW_V1_1",
      "windowId": "inventory-data-bus1",
      "widgetName": "ws-inv-data",
      "inventoryParameters": {},
      "preferences": {
        "widgetClasses": "spacing-reset",
        "pageSize": "18",
        "listing.config.id": "auto-new",
        "listing.boost.order": "account,make,model,bodyStyle,trim,optionCodes,modelCode,fuelType",
        "removeEmptyFacets": "true",
        "removeEmptyConstraints": "true",
        "displayerInstanceId": "",
        "required.display.sets": "TITLE,IMAGE_ALT,IMAGE_TITLE,PRICE,FEATURED_ITEMS,CALLOUT,LISTING,HIGHLIGHTED_ATTRIBUTES",
        "required.display.attributes": "accountCity,accountCountry,accountId,accountName,accountState,accountZipcode,askingPrice,attributes,autodataCaId_att_data,bed,bodyStyle,cab,carfaxIconUrl,carfaxIconUrlBlackWhite,carfaxUrl,carfaxValueBadgeAltText,categoryName,certified,chromeId_att_data,cityMpg,classification,classificationName,comments,courtesy,cpoChecklistUrl,daysOnLot,dcpaisVideoToken_att_data,deliveryDateRange,doors,driveLine,ebayAuctionId,eleadPrice,eleadPriceLessOEMCash,engine,engineSize,equipment,extColor,exteriorColor,fuelType,globalVehicleTrimId,gvLongTrimDescription,gvTrim,hasCarFaxReport,hideInternetPrice,highwayMpg,id,incentives,intColor,interiorColor,interiorColorCode,internetComments,internetPrice,inventoryDate,invoicePrice,isElectric_att_b,key,location,make,marketingTitle,mileage,model,modelCode,msrp,normalExteriorColor,normalFuelType,normalInteriorColor,numSaves,odometer,oemSerialNumber,oemSourcedMerchandisingStatus,optionCodes,options,packageCode,packages_internal,parent,parentId,paymentMonthly,payments,primary_image,propertyDescription,retailValue,saleLease,salePrice,sharedVehicle,status,stockNumber,transmission,trim,trimLevel,type,uuid,video,vin,warrantyDescription,wholesalePrice,year,cpoTier",
        "required.display.attributes.extra": "",
        "facetInstanceId": "INVENTORY_LISTING_DEFAULT_AUTO_NEW:inventory-listing1_1585592438",
        "geoLocationEnabled": "false",
        "defaultGeoDistRadius": "0",
        "geoRadiusValues": "0,5,25,50,100,250,500,1000",
        "showCertifiedFranchiseVehiclesOnly": "false",
        "showFranchiseVehiclesOnly": "true",
        "extraFranchisesForUsedWindowStickers": "",
        "suppressAllConditions": "compliant",
        "violateUsedCompliance": "false",
        "showOffSiteInventoryBanner": "false",
        "showPhotosViewer": "true",
        "offsetSharedVehicleImageByOne": "false",
        "certifiedLogoColor": "",
        "certifiedDefaultPath": "",
        "certifiedDefaultLogoOnly": "false",
        "transferBadgeImage": "",
        "transferBadgeType": "DARK",
        "transferLinkHref": "",
        "certifiedBadgeTooltip": "",
        "certifiedBadgeLinkTarget": "_self",
        "inTransitStatuses": "",
        "customInTransitLogoUrl": "https://pictures.dealer.com/c/cadillacdealerdemo/1444/0241da356d0f2b08f30148cc41828b6ex.jpg",
        "carfaxLogoBlackWhite": "false",
        "hideCertifiedDefaultLogo": "false",
        "sorts": "year,normalBodyStyle,normalExteriorColor,odometer,internetPrice",
        "sortsTitles": "YEAR,BODYSTYLE,COLOR,MILEAGE,PRICE",
        "inventoryDateFormat": "MM_DD_YYYY_FORMAT",
        "offsiteInventoryMarkup": "0",
        "geoLocationEnhanced": "false",
        "showLocationTab": "true",
        "showEffectiveStartDate": "true",
        "showIncentiveTitleSubText": "true",
        "showIncentiveAmountAndLabel": "true",
        "showIncentiveDisclaimer": "true",
        "showIncentiveEffectiveDates": "true",
        "newCarBoostEnable": "false",
        "newCarBoostListingConfigId": "auto-new",
        "numberOfSpotlightVehicles": "3",
        "disableGeodistSort": "false",
        "linkToDealCentralVDP": "false",
        "removeOdometerOnNew": "true"
      },
      "includePricing": true,
      "flags": {
        "vcda-js-environment": "live",
        "ws-scripts-concurrency-limits-concurrency": 16,
        "ws-scripts-concurrency-limits-queue": 16,
        "ws-scripts-concurrency-limits-enabled": true,
        "ws-itemlist-service-version": "v5",
        "ws-itemlist-model-version": "v1",
        "ws-scripts-inline-css": true,
        "ws-inv-data-fetch-timeout": 30000,
        "ws-inv-data-fetch-retries": 2,
        "ws-inv-data-use-wis": true,
        "ws-inv-data-wis-fetch-timeout": 5000,
        "srp-track-fetch-resource-timing": false,
        "ws-inv-data-location-service-fetch-timeout": 3000,
        "ws-inv-data-location-service-fetch-retries": 2,
        "enable-client-side-geolocation-ws-inv-data": true,
        "ws-inv-data-spellcheck-proxy-timeout": 5000,
        "ws-inv-data-spellcheck-server-timeout": 1500,
        "ws-inv-data-spellcheck-server-retries": 0,
        "srp-toggle-databus-editor": true,
        "srp-send-ws-inv-data-prefs-to-wis": true,
        "ddc-ab-testing": "CONTROL"
      }
    };

    // Make API request with timeout and retry logic
    let response;
    let lastError;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`API request attempt ${attempt}/3`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

        response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        // If we get a successful response, break out of retry loop
        if (response.ok) {
          break;
        }

        // Log HTTP errors but continue to retry
        console.warn(`API request attempt ${attempt} failed with status: ${response.status}`);
        lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);

      } catch (error) {
        lastError = error;
        console.warn(`API request attempt ${attempt} failed:`, error.message);

        // Don't retry on certain errors
        if (error.name === 'AbortError') {
          console.error('Request timed out');
          break;
        }

        // Wait before retry (exponential backoff)
        if (attempt < 3) {
          const delay = Math.pow(2, attempt) * 1000; // 2s, 4s
          console.log(`Waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // If all retries failed, throw the last error
    if (!response || !response.ok) {
      const errorMsg = lastError ? lastError.message : 'Unknown API error';
      throw new Error(`Failed to fetch inventory after 3 attempts: ${errorMsg}`);
    }

    // Parse JSON response with validation
    let data;
    try {
      data = await response.json();
    } catch (parseError) {
      throw new Error(`Failed to parse API response as JSON: ${parseError.message}`);
    }

    // Validate API response structure
    if (!data || typeof data !== 'object') {
      throw new Error('API response is not a valid object');
    }

    if (!data.inventory || !Array.isArray(data.inventory)) {
      console.warn('API response missing inventory array, returning empty results');
      // Return empty array instead of failing completely
      const emptyResults = filterInventory([], params);
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300'
        },
        body: JSON.stringify(emptyResults)
      };
    }

    // Parse inventory items from the API response
    const vehicles = parseInventoryApiResponse(data);

    // Validate that we got some vehicles
    if (vehicles.length === 0) {
      console.warn('No vehicles parsed from API response');
    } else {
      console.log(`Successfully parsed ${vehicles.length} vehicles from API`);
    }

    // Update cache
    cache = {
      timestamp: now,
      data: vehicles,
      ttl: cache.ttl
    };

    // Filter results based on params
    const filteredResults = filterInventory(vehicles, params);

    const duration = Date.now() - startTime;
    console.log(`Inventory API request completed in ${duration}ms`);

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
    const duration = Date.now() - startTime;
    console.error(`Inventory API error after ${duration}ms:`, error.message);
    console.error('Error details:', error);

    // Determine error type for appropriate response
    let statusCode = 500;
    let errorType = 'INTERNAL_ERROR';

    if (error.message.includes('timeout') || error.name === 'AbortError') {
      statusCode = 504;
      errorType = 'TIMEOUT';
    } else if (error.message.includes('HTTP')) {
      statusCode = 502;
      errorType = 'API_ERROR';
    } else if (error.message.includes('JSON')) {
      statusCode = 502;
      errorType = 'PARSE_ERROR';
    }

    // For API failures, try to return cached data if available
    const now = Date.now();
    if (cache.data.length > 0 && (now - cache.timestamp) < (cache.ttl * 2)) { // Allow stale cache for up to 2x TTL
      console.log('Returning stale cached data due to API failure');
      const params = event.queryStringParameters || {};
      const filteredResults = filterInventory(cache.data, params);

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=60', // Shorter cache for stale data
          'X-Cache-Status': 'stale'
        },
        body: JSON.stringify(filteredResults)
      };
    }

    return {
      statusCode: statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify({
        error: 'Failed to fetch inventory data',
        errorType: errorType,
        message: error.message,
        timestamp: new Date().toISOString()
      })
    };
  }
};

function parseInventoryApiResponse(data) {
  const vehicles = [];

  try {
    // Check if we have inventory data
    if (!data || !data.inventory || !Array.isArray(data.inventory)) {
      console.log('No inventory data found in API response');
      return vehicles;
    }

    // Parse each vehicle from the API response
    data.inventory.forEach((vehicle, index) => {
      try {
        // Validate vehicle object structure
        if (!vehicle || typeof vehicle !== 'object') {
          console.warn(`Skipping invalid vehicle at index ${index}: not an object`);
          return;
        }

        const parsedVehicle = parseVehicle(vehicle, index);

        // Validate the parsed vehicle has required fields
        if (validateVehicle(parsedVehicle)) {
          vehicles.push(parsedVehicle);
        } else {
          console.warn(`Skipping invalid parsed vehicle at index ${index}: validation failed`);
        }

      } catch (err) {
        console.error(`Error parsing vehicle at index ${index}:`, err.message);
        // Continue processing other vehicles
      }
    });

  } catch (err) {
    console.error('Error parsing API response:', err);
  }

  return vehicles;
}

function parseVehicle(vehicle, index) {
  const id = vehicle.uuid || vehicle.id || vehicle.vin || `vehicle-${index}`;

  // Extract basic vehicle information
  const year = parseInt(vehicle.year, 10) || 0;
  const make = vehicle.make || 'Cadillac';
  const model = vehicle.model || '';
  const trim = vehicle.trim || vehicle.gvTrim || '';

  // Price information - extract from pricing.dprice array
  let price = 0;
  if (vehicle.pricing && vehicle.pricing.dprice && Array.isArray(vehicle.pricing.dprice)) {
    // Find the final price (isFinalPrice: true) or "Your Price"
    const finalPriceItem = vehicle.pricing.dprice.find(item =>
      item.isFinalPrice === true || item.label === 'Your Price'
    );
    if (finalPriceItem && finalPriceItem.value) {
      // Parse price like "$44,150" to 44150
      const parsedPrice = parseInt(finalPriceItem.value.replace(/[$,]/g, ''), 10);
      price = isNaN(parsedPrice) ? 0 : parsedPrice;
    }
  }

  // Mileage - extract from attributes
  let mileage = 0;
  if (vehicle.attributes) {
    // Find odometer attribute
    const odometerAttr = Object.values(vehicle.attributes).find(attr =>
      attr.name === 'odometer' || attr.label === 'Mileage'
    );
    if (odometerAttr && odometerAttr.value) {
      // Parse mileage like "15 miles" to 15
      const parsedMileage = parseInt(odometerAttr.value.replace(/[^\d]/g, ''), 10);
      mileage = isNaN(parsedMileage) ? 0 : parsedMileage;
    }
  }

  // Colors - extract from attributes
  let extColor = '';
  if (vehicle.attributes) {
    // Find exterior color attribute
    const colorAttr = Object.values(vehicle.attributes).find(attr =>
      attr.name === 'exteriorColor' || attr.label === 'Exterior Color'
    );
    if (colorAttr && colorAttr.value) {
      extColor = String(colorAttr.value).trim();
    }
  }

  // Transmission - try to extract from attributes or use default
  let transmission = 'Automatic';
  if (vehicle.attributes) {
    // Look for transmission in attributes if available
    const transAttr = Object.values(vehicle.attributes).find(attr =>
      attr.name === 'transmission'
    );
    if (transAttr && transAttr.value) {
      transmission = String(transAttr.value).trim();
    }
  }

  // Image URL - use first image from images array
  let imageUrl = '';
  if (vehicle.images && Array.isArray(vehicle.images) && vehicle.images.length > 0) {
    const firstImage = vehicle.images[0];
    if (firstImage && firstImage.uri) {
      imageUrl = firstImage.uri;
      // Ensure full URL
      if (imageUrl.startsWith('//')) {
        imageUrl = 'https:' + imageUrl;
      } else if (imageUrl.startsWith('/')) {
        imageUrl = 'https://pictures.dealer.com' + imageUrl;
      }
    }
  }

  // Stock number - extract from attributes or direct field
  let stockNumber = vehicle.stockNumber || '';
  if (!stockNumber && vehicle.attributes) {
    const stockAttr = Object.values(vehicle.attributes).find(attr =>
      attr.name === 'stockNumber' || attr.label === 'Stock Number'
    );
    if (stockAttr && stockAttr.value) {
      stockNumber = String(stockAttr.value).trim();
    }
  }

  // VIN - extract from attributes or direct field
  let vin = vehicle.vin || '';
  if (!vin && vehicle.attributes) {
    const vinAttr = Object.values(vehicle.attributes).find(attr =>
      attr.name === 'vin' || attr.label === 'VIN'
    );
    if (vinAttr && vinAttr.value) {
      vin = String(vinAttr.value).trim();
    }
  }

  return {
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
    stockNumber,
    vin,
    detailUrl: `/new-cadillac/${model.toLowerCase().replace(/\s+/g, '-')}/${year}/${id}.htm` || '#'
  };
}

function validateVehicle(vehicle) {
  // Required fields validation
  if (!vehicle.id || typeof vehicle.id !== 'string') {
    console.warn('Vehicle missing valid id');
    return false;
  }

  if (!vehicle.year || vehicle.year < 1900 || vehicle.year > 2030) {
    console.warn(`Vehicle ${vehicle.id} has invalid year: ${vehicle.year}`);
    return false;
  }

  if (!vehicle.make || typeof vehicle.make !== 'string') {
    console.warn(`Vehicle ${vehicle.id} missing valid make`);
    return false;
  }

  if (!vehicle.model || typeof vehicle.model !== 'string') {
    console.warn(`Vehicle ${vehicle.id} missing valid model`);
    return false;
  }

  // Price should be a reasonable number (not negative, not excessively high)
  if (typeof vehicle.price !== 'number' || vehicle.price < 0 || vehicle.price > 10000000) {
    console.warn(`Vehicle ${vehicle.id} has invalid price: ${vehicle.price}`);
    return false;
  }

  // Mileage should be reasonable
  if (typeof vehicle.mileage !== 'number' || vehicle.mileage < 0 || vehicle.mileage > 500000) {
    console.warn(`Vehicle ${vehicle.id} has invalid mileage: ${vehicle.mileage}`);
    return false;
  }

  // Optional fields validation (warnings only)
  if (!vehicle.stockNumber) {
    console.warn(`Vehicle ${vehicle.id} missing stock number`);
  }

  if (!vehicle.vin) {
    console.warn(`Vehicle ${vehicle.id} missing VIN`);
  }

  if (!vehicle.image) {
    console.warn(`Vehicle ${vehicle.id} missing image`);
  }

  return true;
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
