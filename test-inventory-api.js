// Test script for inventory API integration
const fetch = require('node-fetch');

// Mock event and context for testing
const mockEvent = {
  queryStringParameters: {}
};

const mockContext = {};

async function testInventoryApi() {
  console.log('Testing inventory API integration...\n');

  try {
    // Import the handler function
    const { handler } = require('./netlify/functions/inventory-api.js');

    // Call the handler
    console.log('Making request to inventory API...');
    const startTime = Date.now();

    const result = await handler(mockEvent, mockContext);

    const endTime = Date.now();
    const duration = endTime - startTime;

    console.log(`Request completed in ${duration}ms`);
    console.log(`Status Code: ${result.statusCode}`);

    if (result.statusCode === 200) {
      const data = JSON.parse(result.body);
      console.log(`\n✅ Success! Retrieved ${data.length} vehicles`);

      if (data.length > 0) {
        console.log('\n📋 Sample vehicle data:');
        const sample = data[0];
        console.log(`- ID: ${sample.id}`);
        console.log(`- Year: ${sample.year}`);
        console.log(`- Make: ${sample.make}`);
        console.log(`- Model: ${sample.model}`);
        console.log(`- Price: $${sample.price.toLocaleString()}`);
        console.log(`- Mileage: ${sample.mileage} miles`);
        console.log(`- Color: ${sample.extColor}`);
        console.log(`- Transmission: ${sample.transmission}`);
        console.log(`- Stock #: ${sample.stockNumber}`);
        console.log(`- Image: ${sample.image ? '✅ Available' : '❌ Missing'}`);
      }

      // Test filtering
      console.log('\n🔍 Testing filters...');

      // Test make filter
      const makeFilterEvent = {
        queryStringParameters: { make: 'Cadillac' }
      };
      const makeFilterResult = await handler(makeFilterEvent, mockContext);
      if (makeFilterResult.statusCode === 200) {
        const makeFilteredData = JSON.parse(makeFilterResult.body);
        console.log(`Cadillac vehicles: ${makeFilteredData.length} vehicles`);
      }

      // Test model filter
      const modelFilterEvent = {
        queryStringParameters: { model: 'CT4' }
      };
      const modelFilterResult = await handler(modelFilterEvent, mockContext);
      if (modelFilterResult.statusCode === 200) {
        const modelFilteredData = JSON.parse(modelFilterResult.body);
        console.log(`CT4 models: ${modelFilteredData.length} vehicles`);
      }

      // Test price range filter
      const priceFilterEvent = {
        queryStringParameters: { priceMin: '40000', priceMax: '50000' }
      };
      const priceFilterResult = await handler(priceFilterEvent, mockContext);
      if (priceFilterResult.statusCode === 200) {
        const priceFilteredData = JSON.parse(priceFilterResult.body);
        console.log(`Price range ($40k-$50k): ${priceFilteredData.length} vehicles`);
        if (priceFilteredData.length > 0) {
          console.log(`Sample prices: ${priceFilteredData.slice(0, 3).map(v => `$${v.price.toLocaleString()}`).join(', ')}`);
        }
      }

      // Test year filter
      const yearFilterEvent = {
        queryStringParameters: { year: '2025' }
      };
      const yearFilterResult = await handler(yearFilterEvent, mockContext);
      if (yearFilterResult.statusCode === 200) {
        const yearFilteredData = JSON.parse(yearFilterResult.body);
        console.log(`2025 models: ${yearFilteredData.length} vehicles`);
      }

    } else {
      console.log('❌ API request failed');
      console.log('Response:', result.body);
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

// Run the test
testInventoryApi();