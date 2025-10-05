/**
 * Simple test script for dashboard APIs
 * This tests the basic functionality of the sales dashboard APIs
 */

const https = require('https');
const http = require('http');

// Test configuration
const BASE_URL = 'http://localhost:8888'; // Netlify dev server
const TEST_SALES_REP_ID = 'test-sales-rep-id';
const TEST_LEAD_ID = 'test-lead-id';
const TEST_APPOINTMENT_ID = 'test-appointment-id';

// Mock JWT token for testing
const TEST_JWT_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ0ZXN0LXNhbGVzLXJlcC1pZCIsImVtYWlsIjoidGVzdEBleGFtcGxlLmNvbSIsInJvbGUiOiJzYWxlcy1yZXAiLCJpYXQiOjE3MzU3MzYwMDAsImV4cCI6MTc2NzI3MjAwMH0.test-signature';

async function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https:') ? https : http;

    const requestOptions = {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TEST_JWT_TOKEN}`,
        ...options.headers
      },
      method: options.method || 'GET'
    };

    const req = protocol.request(url, requestOptions, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const response = {
            statusCode: res.statusCode,
            headers: res.headers,
            body: JSON.parse(data)
          };
          resolve(response);
        } catch (error) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data
          });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }

    req.end();
  });
}

async function testAuthCheck() {
  console.log('\n🧪 Testing Sales Auth Check API...');

  try {
    const response = await makeRequest(`${BASE_URL}/.netlify/functions/sales-auth-check`);

    if (response.statusCode === 200) {
      console.log('✅ Auth check API responded successfully');
      console.log('   Response:', response.body);
    } else {
      console.log('❌ Auth check API failed:', response.statusCode, response.body);
    }
  } catch (error) {
    console.log('❌ Auth check API error:', error.message);
  }
}

async function testSalesLeads() {
  console.log('\n🧪 Testing Sales Leads API...');

  try {
    const response = await makeRequest(`${BASE_URL}/.netlify/functions/sales-leads?timeframe=week`);

    if (response.statusCode === 200) {
      console.log('✅ Sales leads API responded successfully');
      console.log('   Leads count:', response.body.leads?.length || 0);
    } else {
      console.log('❌ Sales leads API failed:', response.statusCode, response.body);
    }
  } catch (error) {
    console.log('❌ Sales leads API error:', error.message);
  }
}

async function testSalesAppointments() {
  console.log('\n🧪 Testing Sales Appointments API...');

  try {
    const response = await makeRequest(`${BASE_URL}/.netlify/functions/sales-appointments?timeframe=week`);

    if (response.statusCode === 200) {
      console.log('✅ Sales appointments API responded successfully');
      console.log('   Appointments count:', response.body.appointments?.length || 0);
    } else {
      console.log('❌ Sales appointments API failed:', response.statusCode, response.body);
    }
  } catch (error) {
    console.log('❌ Sales appointments API error:', error.message);
  }
}

async function testSalesMetrics() {
  console.log('\n🧪 Testing Sales Metrics API...');

  try {
    const response = await makeRequest(`${BASE_URL}/.netlify/functions/sales-metrics?timeframe=week`);

    if (response.statusCode === 200) {
      console.log('✅ Sales metrics API responded successfully');
      console.log('   Metrics:', response.body);
    } else {
      console.log('❌ Sales metrics API failed:', response.statusCode, response.body);
    }
  } catch (error) {
    console.log('❌ Sales metrics API error:', error.message);
  }
}

async function testAddNote() {
  console.log('\n🧪 Testing Add Note API...');

  try {
    const response = await makeRequest(`${BASE_URL}/.netlify/functions/sales-add-note`, {
      method: 'POST',
      body: {
        leadId: TEST_LEAD_ID,
        content: 'Test note from API test'
      }
    });

    if (response.statusCode === 200) {
      console.log('✅ Add note API responded successfully');
      console.log('   Response:', response.body);
    } else {
      console.log('❌ Add note API failed:', response.statusCode, response.body);
    }
  } catch (error) {
    console.log('❌ Add note API error:', error.message);
  }
}

async function testUpdateStatus() {
  console.log('\n🧪 Testing Update Status API...');

  try {
    const response = await makeRequest(`${BASE_URL}/.netlify/functions/sales-update-status`, {
      method: 'POST',
      body: {
        leadId: TEST_LEAD_ID,
        status: 'contacted'
      }
    });

    if (response.statusCode === 200) {
      console.log('✅ Update status API responded successfully');
      console.log('   Response:', response.body);
    } else {
      console.log('❌ Update status API failed:', response.statusCode, response.body);
    }
  } catch (error) {
    console.log('❌ Update status API error:', error.message);
  }
}

async function testCompleteAppointment() {
  console.log('\n🧪 Testing Complete Appointment API...');

  try {
    const response = await makeRequest(`${BASE_URL}/.netlify/functions/sales-complete-appointment`, {
      method: 'POST',
      body: {
        appointmentId: TEST_APPOINTMENT_ID
      }
    });

    if (response.statusCode === 200) {
      console.log('✅ Complete appointment API responded successfully');
      console.log('   Response:', response.body);
    } else {
      console.log('❌ Complete appointment API failed:', response.statusCode, response.body);
    }
  } catch (error) {
    console.log('❌ Complete appointment API error:', error.message);
  }
}

// Run all tests
async function runTests() {
  console.log('🚀 Starting Dashboard API Tests...');
  console.log('📍 Base URL:', BASE_URL);

  // Test all APIs
  await testAuthCheck();
  await testSalesLeads();
  await testSalesAppointments();
  await testSalesMetrics();
  await testAddNote();
  await testUpdateStatus();
  await testCompleteAppointment();

  console.log('\n✨ API Testing Complete!');
}

// Run tests if this script is executed directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = {
  runTests,
  testAuthCheck,
  testSalesLeads,
  testSalesAppointments,
  testSalesMetrics,
  testAddNote,
  testUpdateStatus,
  testCompleteAppointment
};