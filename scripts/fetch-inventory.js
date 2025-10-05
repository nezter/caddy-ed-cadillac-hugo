import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import crypto from 'crypto';

const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INVENTORY_DATA_DIR = path.join(__dirname, '../site/data');
const INVENTORY_CONTENT_DIR = path.join(__dirname, '../site/content/inventory');
const API_ENDPOINT = 'https://www.cadillacofsouthcharlotte.com/apis/widget/INVENTORY_LISTING_DEFAULT_AUTO_ALL:inventory-data-bus1/getInventory';

// Configuration constants
const MAX_RETRIES = 3;
const RETRY_DELAY_BASE = 1000; // 1 second
const API_TIMEOUT = 30000; // 30 seconds
const RATE_LIMIT_DELAY = 100; // 100ms between requests if needed

// Utility functions
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function retryWithBackoff(fn, maxRetries = MAX_RETRIES, baseDelay = RETRY_DELAY_BASE) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries) {
        break;
      }

      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000; // Exponential backoff with jitter
      console.warn(`Attempt ${attempt + 1} failed, retrying in ${Math.round(delay)}ms:`, error.message);
      await sleep(delay);
    }
  }

  throw new Error(`Operation failed after ${maxRetries + 1} attempts. Last error: ${lastError.message}`);
}

function validateVehicleData(vehicle) {
  const requiredFields = ['vin', 'year', 'make', 'model'];
  const errors = [];

  // Check required fields
  for (const field of requiredFields) {
    if (!vehicle[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Validate VIN format (basic check)
  if (vehicle.vin && !/^[A-HJ-NPR-Z0-9]{17}$/i.test(vehicle.vin)) {
    errors.push(`Invalid VIN format: ${vehicle.vin}`);
  }

  // Validate year
  if (vehicle.year && (isNaN(vehicle.year) || vehicle.year < 1900 || vehicle.year > new Date().getFullYear() + 2)) {
    errors.push(`Invalid year: ${vehicle.year}`);
  }

  // Validate price
  if (vehicle.internetPrice && isNaN(vehicle.internetPrice)) {
    errors.push(`Invalid internetPrice: ${vehicle.internetPrice}`);
  }

  if (vehicle.msrp && isNaN(vehicle.msrp)) {
    errors.push(`Invalid msrp: ${vehicle.msrp}`);
  }

  // Validate mileage
  if (vehicle.odometer && isNaN(vehicle.odometer)) {
    errors.push(`Invalid odometer: ${vehicle.odometer}`);
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

function sanitizeString(str) {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/[<>\"'&]/g, '').trim();
}

function generateDataChecksum(data) {
  return crypto.createHash('md5').update(JSON.stringify(data)).digest('hex');
}

async function ensureDirectoryExists(directory) {
  try {
    await fs.promises.stat(directory);
  } catch (error) {
    if (error.code === 'ENOENT') {
      await mkdir(directory, { recursive: true });
    } else {
      throw error;
    }
  }
}

async function fetchInventoryData() {
  try {
    console.log('📡 Making API request to:', API_ENDPOINT);

    const response = await axios.post(API_ENDPOINT, {
      skip: 0,
      pageSize: 1000,
      sortBy: 'make',
      sortDirection: 'asc',
      conditions: ['new'],
      makes: ['Cadillac']
    }, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: API_TIMEOUT,
      validateStatus: (status) => status < 500 // Accept 4xx errors but not 5xx
    });

    console.log('📥 Response received, status:', response.status);
    console.log('📄 Response content-type:', response.headers['content-type']);

    const data = response.data;

    // Debug: Log response type and structure
    console.log('🔍 Response type:', typeof data);
    if (typeof data === 'string') {
      console.log('🔍 Response preview:', data.substring(0, 200) + (data.length > 200 ? '...' : ''));
    } else if (data && typeof data === 'object') {
      console.log('🔍 Response keys:', Object.keys(data));
    }

    // Validate response structure
    if (!data || typeof data !== 'object') {
      throw new Error(`Invalid response format: expected object, got ${typeof data}`);
    }

    if (!data.vehicles || !Array.isArray(data.vehicles)) {
      throw new Error('Invalid data structure: vehicles array not found');
    }

    // Generate checksum for data integrity
    const checksum = generateDataChecksum(data);
    console.log(`✅ Data integrity checksum: ${checksum}`);

    return { data, checksum };
  } catch (error) {
    if (error.code === 'ECONNABORTED') {
      throw new Error('API request timed out');
    }
    if (error.response) {
      // Server responded with error status
      console.log('❌ Server error response:', error.response.status, error.response.statusText);
      console.log('❌ Error response data:', error.response.data);
      throw new Error(`API responded with status: ${error.response.status} ${error.response.statusText}`);
    }
    if (error.request) {
      // Network error
      throw new Error(`Network error: ${error.message}`);
    }
    // Other error
    throw new Error(`Request failed: ${error.message}`);
  }
}

async function processVehicle(vehicle, index) {
  try {
    // Validate vehicle data
    const validation = validateVehicleData(vehicle);
    if (!validation.isValid) {
      console.warn(`Skipping invalid vehicle at index ${index}:`, validation.errors.join(', '));
      return null;
    }

    const { vin, year, make, model, trim } = vehicle;

    // Sanitize and validate required fields
    const sanitizedMake = sanitizeString(make);
    const sanitizedModel = sanitizeString(model);
    const sanitizedTrim = sanitizeString(trim || '');

    if (!sanitizedMake || !sanitizedModel) {
      console.warn(`Skipping vehicle ${vin}: missing make or model after sanitization`);
      return null;
    }

    const slug = `${year}-${sanitizedMake}-${sanitizedModel}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const fileName = `${slug}-${vin.substring(0, 8)}.md`;

    // Generate content for markdown file with sanitized data
    const fileContent = `---
title: "${year} ${sanitizedMake} ${sanitizedModel}${sanitizedTrim ? ' ' + sanitizedTrim : ''}"
date: ${new Date().toISOString()}
draft: false
vin: "${vin}"
make: "${sanitizedMake}"
model: "${sanitizedModel}"
year: ${year}
trim: "${sanitizedTrim}"
price: ${isNaN(vehicle.internetPrice) ? (isNaN(vehicle.msrp) ? 0 : vehicle.msrp) : vehicle.internetPrice}
mileage: ${isNaN(vehicle.odometer) ? 0 : vehicle.odometer}
exteriorColor: "${sanitizeString(vehicle.exteriorColor) || 'Not specified'}"
interiorColor: "${sanitizeString(vehicle.interiorColor) || 'Not specified'}"
engine: "${sanitizeString(vehicle.engine) || 'Not specified'}"
transmission: "${sanitizeString(vehicle.transmission) || 'Not specified'}"
drivetrain: "${sanitizeString(vehicle.drivetrain) || 'Not specified'}"
fuelType: "${sanitizeString(vehicle.fuelType) || 'Not specified'}"
stockNumber: "${sanitizeString(vehicle.stockNumber) || 'Not specified'}"
images:
${vehicle.images && Array.isArray(vehicle.images) ? vehicle.images.map(img => `  - "${sanitizeString(img.uri)}"`).join('\n') : '  - ""'}
features:
${vehicle.features && Array.isArray(vehicle.features) ? vehicle.features.map(feature => `  - "${sanitizeString(feature)}"`).join('\n') : '  - "Contact for details"'}
---

${sanitizeString(vehicle.description) || `This ${year} ${sanitizedMake} ${sanitizedModel}${sanitizedTrim ? ' ' + sanitizedTrim : ''} is available now at Caddy Ed Cadillac. Contact us for more information or to schedule a test drive.`}
`;

    await writeFile(
      path.join(INVENTORY_CONTENT_DIR, fileName),
      fileContent
    );

    console.log(`✓ Created markdown file for: ${year} ${sanitizedMake} ${sanitizedModel}`);
    return fileName;
  } catch (error) {
    console.error(`✗ Error processing vehicle at index ${index} (${vehicle.vin || 'unknown VIN'}):`, error.message);
    return null;
  }
}

async function fetchInventory() {
  console.log('🚗 Starting inventory data fetch...');

  let success = false;
  let errorMessage = '';

  try {
    // Ensure directories exist
    console.log('📁 Ensuring directories exist...');
    await ensureDirectoryExists(INVENTORY_DATA_DIR);
    await ensureDirectoryExists(INVENTORY_CONTENT_DIR);

    // Fetch inventory data with retry logic
    console.log('🔄 Fetching inventory data with retry logic...');
    const { data, checksum } = await retryWithBackoff(fetchInventoryData);

    console.log(`📊 Fetched ${data.vehicles.length} vehicles (checksum: ${checksum})`);

    // Filter and validate vehicles
    const validVehicles = [];
    const invalidCount = data.vehicles.length;

    for (let i = 0; i < data.vehicles.length; i++) {
      const vehicle = data.vehicles[i];
      const validation = validateVehicleData(vehicle);

      if (validation.isValid) {
        validVehicles.push(vehicle);
      } else {
        console.warn(`⚠️  Skipping invalid vehicle ${i + 1}/${data.vehicles.length}: ${validation.errors.join(', ')}`);
      }
    }

    console.log(`✅ Valid vehicles: ${validVehicles.length}/${data.vehicles.length}`);

    if (validVehicles.length === 0) {
      throw new Error('No valid vehicles found in the response');
    }

    // Save raw inventory data for Hugo to use (with checksum for integrity)
    const inventoryData = {
      ...data,
      vehicles: validVehicles,
      metadata: {
        fetchedAt: new Date().toISOString(),
        checksum,
        totalVehicles: data.vehicles.length,
        validVehicles: validVehicles.length,
        invalidVehicles: data.vehicles.length - validVehicles.length
      }
    };

    await writeFile(
      path.join(INVENTORY_DATA_DIR, 'inventory.json'),
      JSON.stringify(inventoryData, null, 2)
    );

    console.log('💾 Saved inventory data to JSON file');

    // Generate individual markdown files for each valid vehicle
    console.log('📝 Generating markdown files...');
    const results = await Promise.allSettled(
      validVehicles.map((vehicle, index) => processVehicle(vehicle, index))
    );

    const successfulFiles = results.filter(result =>
      result.status === 'fulfilled' && result.value !== null
    ).length;

    const failedFiles = results.filter(result =>
      result.status === 'rejected' || result.value === null
    ).length;

    console.log(`📋 Markdown generation complete: ${successfulFiles} successful, ${failedFiles} failed`);

    if (successfulFiles === 0) {
      throw new Error('Failed to generate any markdown files');
    }

    success = true;
    console.log('🎉 Inventory update completed successfully!');
    console.log(`   - Total vehicles processed: ${validVehicles.length}`);
    console.log(`   - Markdown files created: ${successfulFiles}`);
    console.log(`   - Data integrity checksum: ${checksum}`);

  } catch (error) {
    errorMessage = error.message;
    console.error('❌ Error during inventory fetch:', error);

    // Don't exit the process - let the caller decide what to do
    success = false;
  }

  return { success, error: errorMessage };
}

// Main execution
async function main() {
  try {
    const result = await fetchInventory();

    if (!result.success) {
      console.error('💥 Inventory fetch failed:', result.error);
      process.exit(1);
    }

    console.log('✅ All operations completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('💥 Unexpected error:', error);
    process.exit(1);
  }
}

main();
