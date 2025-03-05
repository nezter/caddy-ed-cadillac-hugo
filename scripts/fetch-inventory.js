import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';

const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INVENTORY_DATA_DIR = path.join(__dirname, '../site/data');
const INVENTORY_CONTENT_DIR = path.join(__dirname, '../site/content/inventory');
const API_ENDPOINT = 'https://www.cadillacofsouthcharlotte.com/apis/widget/INVENTORY_LISTING_DEFAULT_AUTO_ALL:inventory-data-bus1/getInventory';

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

async function fetchInventory() {
  console.log('Fetching inventory data...');
  
  try {
    // Ensure directories exist
    await ensureDirectoryExists(INVENTORY_DATA_DIR);
    await ensureDirectoryExists(INVENTORY_CONTENT_DIR);
    
    // Fetch new inventory
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      body: JSON.stringify({
        skip: 0,
        pageSize: 1000,
        sortBy: 'make',
        sortDirection: 'asc',
        conditions: ['new'],
        makes: ['Cadillac']
      })
    });
    
    if (!response.ok) {
      throw new Error(`API responded with status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data || !data.vehicles || !Array.isArray(data.vehicles)) {
      throw new Error('Invalid data received from API');
    }
    
    console.log(`Fetched ${data.vehicles.length} vehicles`);
    
    // Save raw inventory data for Hugo to use
    await writeFile(
      path.join(INVENTORY_DATA_DIR, 'inventory.json'),
      JSON.stringify(data, null, 2)
    );
    
    // Generate individual markdown files for each vehicle
    for (const vehicle of data.vehicles) {
      const { vin, year, make, model, trim } = vehicle;
      
      if (!vin) continue; // Skip if no VIN
      
      const slug = `${year}-${make}-${model}`.toLowerCase().replace(/\s+/g, '-');
      const fileName = `${slug}-${vin.substring(0, 8)}.md`;
      
      // Generate content for markdown file
      const fileContent = `---
title: "${year} ${make} ${model} ${trim}"
date: ${new Date().toISOString()}
draft: false
vin: "${vin}"
make: "${make}"
model: "${model}"
year: ${year}
trim: "${trim || ''}"
price: ${vehicle.internetPrice || vehicle.msrp || 0}
mileage: ${vehicle.odometer || 0}
exteriorColor: "${vehicle.exteriorColor || 'Not specified'}"
interiorColor: "${vehicle.interiorColor || 'Not specified'}"
engine: "${vehicle.engine || 'Not specified'}"
transmission: "${vehicle.transmission || 'Not specified'}"
drivetrain: "${vehicle.drivetrain || 'Not specified'}"
fuelType: "${vehicle.fuelType || 'Not specified'}"
stockNumber: "${vehicle.stockNumber || 'Not specified'}"
images:
${vehicle.images ? vehicle.images.map(img => `  - "${img.uri}"`).join('\n') : '  - ""'}
features:
${vehicle.features ? vehicle.features.map(feature => `  - "${feature}"`).join('\n') : '  - "Contact for details"'}
---

${vehicle.description || `This ${year} ${make} ${model} ${trim} is available now at Caddy Ed Cadillac. Contact us for more information or to schedule a test drive.`}
`;

      await writeFile(
        path.join(INVENTORY_CONTENT_DIR, fileName),
        fileContent
      );
      
      console.log(`Created markdown file for: ${year} ${make} ${model}`);
    }
    
    console.log('Inventory update completed successfully.');
  } catch (error) {
    console.error('Error fetching inventory:', error);
    process.exit(1);
  }
}

fetchInventory();
