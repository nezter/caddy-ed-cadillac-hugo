/**
 * Direct Function Testing
 * Tests Netlify functions directly without Netlify runtime
 */

const fs = require('fs');
const path = require('path');

// Mock Netlify environment
global.process.env.NODE_ENV = 'test';
global.process.env.JWT_SECRET = 'test-secret';
global.process.env.SUPABASE_URL = 'https://test.supabase.co';
global.process.env.SUPABASE_ANON_KEY = 'test-key';

// Mock event and context
function createMockEvent(method = 'POST', body = {}) {
  return {
    httpMethod: method,
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json'
    },
    queryStringParameters: {},
    path: '/.netlify/functions/test'
  };
}

function createMockContext() {
  return {
    callbackWaitsForEmptyEventLoop: false
  };
}

// Test data
const testData = {
  lead: {
    name: 'John Doe',
    email: 'john.doe@example.com',
    phone: '(555) 123-4567',
    message: 'I\'m interested in a new Cadillac Escalade.',
    formType: 'test-drive',
    vehicleInterest: '2024 Cadillac Escalade',
    leadSource: 'website'
  },
  salesRep: {
    email: 'sales@caddyed.com',
    password: 'password123'
  }
};

async function testFunction(functionName, event, context) {
  try {
    console.log(`\n🧪 Testing ${functionName}...`);

    // Load the function
    const functionPath = path.join(__dirname, 'netlify', 'functions', `${functionName}.js`);
    if (!fs.existsSync(functionPath)) {
      console.log(`❌ Function ${functionName} not found`);
      return false;
    }

    const func = require(functionPath);

    if (!func.handler) {
      console.log(`❌ Function ${functionName} has no handler`);
      return false;
    }

    // Call the function
    const result = await func.handler(event, context);

    console.log(`✅ ${functionName} executed successfully`);
    console.log(`   Status: ${result.statusCode}`);
    console.log(`   Response:`, JSON.parse(result.body || '{}'));

    return result.statusCode === 200;

  } catch (error) {
    console.log(`❌ ${functionName} failed:`, error.message);
    return false;
  }
}

async function runDirectTests() {
  console.log('🚀 Starting Direct Function Testing...');

  const results = {
    leadForm: false,
    leads: false,
    salesLogin: false
  };

  // Test lead-form function
  results.leadForm = await testFunction('lead-form', createMockEvent('POST', testData.lead), createMockContext());

  // Test leads function
  results.leads = await testFunction('leads', createMockEvent('POST', testData.lead), createMockContext());

  // Test sales-login function
  results.salesLogin = await testFunction('sales-login', createMockEvent('POST', testData.salesRep), createMockContext());

  // Summary
  console.log('\n📊 Direct Function Testing Results:');
  console.log('=====================================');

  const passedTests = Object.values(results).filter(Boolean).length;
  const totalTests = Object.keys(results).length;

  Object.entries(results).forEach(([test, passed]) => {
    const status = passed ? '✅' : '❌';
    console.log(`${status} ${test}`);
  });

  console.log('=====================================');
  console.log(`🎯 Overall: ${passedTests}/${totalTests} functions executed successfully`);

  if (passedTests === totalTests) {
    console.log('🎉 All functions executed successfully!');
  } else {
    console.log('⚠️ Some functions had issues. Check the output above.');
  }

  return results;
}

// Run tests if this script is executed directly
if (require.main === module) {
  runDirectTests().catch(console.error);
}

module.exports = {
  runDirectTests,
  testFunction
};