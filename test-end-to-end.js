/**
 * End-to-End Testing Script
 * Tests the complete workflow from lead capture to sale
 */

const https = require('https');
const http = require('http');

// Test configuration
const BASE_URL = 'http://localhost:8888'; // Netlify dev server
const TEST_DATA = {
  lead: {
    name: 'John Doe',
    email: 'john.doe@example.com',
    phone: '(555) 123-4567',
    message: 'I\'m interested in a new Cadillac Escalade. Please contact me about pricing and availability.',
    formType: 'test-drive',
    vehicleInterest: '2024 Cadillac Escalade',
    leadSource: 'website'
  },
  salesRep: {
    email: 'sales@caddyed.com',
    password: 'password123' // Temporary test password
  }
};

// Store test state
let testState = {
  leadId: null,
  authToken: null,
  salesRepId: null,
  appointmentId: null
};

async function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https:') ? https : http;

    const requestOptions = {
      headers: {
        'Content-Type': 'application/json',
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

async function testLeadCapture() {
  console.log('\n🧪 Testing Lead Capture Workflow...');

  try {
    // Test 1: Submit lead via lead-form.js
    console.log('  📝 Step 1: Submitting lead via lead-form.js...');
    const leadResponse = await makeRequest(`${BASE_URL}/.netlify/functions/lead-form`, {
      method: 'POST',
      body: TEST_DATA.lead
    });

    if (leadResponse.statusCode === 200 && leadResponse.body.success) {
      console.log('  ✅ Lead form submission successful');
    } else {
      console.log('  ❌ Lead form submission failed:', leadResponse.statusCode, leadResponse.body);
      return false;
    }

    // Test 2: Submit lead via leads.js API
    console.log('  📝 Step 2: Submitting lead via leads.js API...');
    const leadsResponse = await makeRequest(`${BASE_URL}/.netlify/functions/leads`, {
      method: 'POST',
      body: TEST_DATA.lead
    });

    if (leadsResponse.statusCode === 200 && leadsResponse.body.success) {
      console.log('  ✅ Leads API submission successful');
      testState.leadId = leadsResponse.body.data?.leadId;
      console.log('  📋 Lead ID:', testState.leadId);
    } else {
      console.log('  ❌ Leads API submission failed:', leadsResponse.statusCode, leadsResponse.body);
      return false;
    }

    return true;
  } catch (error) {
    console.log('  ❌ Lead capture test error:', error.message);
    return false;
  }
}

async function testSalesAuthentication() {
  console.log('\n🔐 Testing Sales Authentication...');

  try {
    // Test login
    console.log('  🔑 Step 1: Testing sales login...');
    const loginResponse = await makeRequest(`${BASE_URL}/.netlify/functions/sales-login`, {
      method: 'POST',
      body: TEST_DATA.salesRep
    });

    if (loginResponse.statusCode === 200 && loginResponse.body.success) {
      console.log('  ✅ Sales login successful');
      testState.authToken = loginResponse.body.data?.token;
      testState.salesRepId = loginResponse.body.data?.user?.id;
      console.log('  🆔 Sales Rep ID:', testState.salesRepId);
    } else {
      console.log('  ❌ Sales login failed:', loginResponse.statusCode, loginResponse.body);
      return false;
    }

    // Test auth check
    console.log('  🔍 Step 2: Testing authentication check...');
    const authCheckResponse = await makeRequest(`${BASE_URL}/.netlify/functions/sales-auth-check`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${testState.authToken}`
      }
    });

    if (authCheckResponse.statusCode === 200 && authCheckResponse.body.authenticated) {
      console.log('  ✅ Authentication check successful');
    } else {
      console.log('  ❌ Authentication check failed:', authCheckResponse.statusCode, authCheckResponse.body);
      return false;
    }

    return true;
  } catch (error) {
    console.log('  ❌ Authentication test error:', error.message);
    return false;
  }
}

async function testDashboardAPIs() {
  console.log('\n📊 Testing Dashboard APIs...');

  if (!testState.authToken) {
    console.log('  ❌ No auth token available, skipping dashboard tests');
    return false;
  }

  try {
    // Test leads API
    console.log('  📋 Step 1: Testing sales leads API...');
    const leadsResponse = await makeRequest(`${BASE_URL}/.netlify/functions/sales-leads?timeframe=week`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${testState.authToken}`
      }
    });

    if (leadsResponse.statusCode === 200 && leadsResponse.body.success) {
      console.log('  ✅ Sales leads API successful');
      console.log('  📊 Leads count:', leadsResponse.body.data?.totalCount || 0);
    } else {
      console.log('  ❌ Sales leads API failed:', leadsResponse.statusCode, leadsResponse.body);
      return false;
    }

    // Test appointments API
    console.log('  📅 Step 2: Testing sales appointments API...');
    const appointmentsResponse = await makeRequest(`${BASE_URL}/.netlify/functions/sales-appointments?timeframe=week`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${testState.authToken}`
      }
    });

    if (appointmentsResponse.statusCode === 200 && appointmentsResponse.body.success) {
      console.log('  ✅ Sales appointments API successful');
      console.log('  📊 Appointments count:', appointmentsResponse.body.data?.totalCount || 0);
    } else {
      console.log('  ❌ Sales appointments API failed:', appointmentsResponse.statusCode, appointmentsResponse.body);
      return false;
    }

    // Test metrics API
    console.log('  📈 Step 3: Testing sales metrics API...');
    const metricsResponse = await makeRequest(`${BASE_URL}/.netlify/functions/sales-metrics?timeframe=week`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${testState.authToken}`
      }
    });

    if (metricsResponse.statusCode === 200 && metricsResponse.body.success) {
      console.log('  ✅ Sales metrics API successful');
      const metrics = metricsResponse.body.data;
      console.log('  📊 Metrics:', {
        newLeads: metrics.newLeads,
        totalLeads: metrics.totalLeads,
        appointments: metrics.appointments,
        sales: metrics.sales,
        conversionRate: metrics.conversionRate
      });
    } else {
      console.log('  ❌ Sales metrics API failed:', metricsResponse.statusCode, metricsResponse.body);
      return false;
    }

    return true;
  } catch (error) {
    console.log('  ❌ Dashboard APIs test error:', error.message);
    return false;
  }
}

async function testLeadManagement() {
  console.log('\n👥 Testing Lead Management Workflow...');

  if (!testState.authToken || !testState.leadId) {
    console.log('  ❌ Missing auth token or lead ID, skipping lead management tests');
    return false;
  }

  try {
    // Test updating lead status
    console.log('  🔄 Step 1: Testing lead status update...');
    const statusResponse = await makeRequest(`${BASE_URL}/.netlify/functions/sales-update-status`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${testState.authToken}`
      },
      body: {
        leadId: testState.leadId,
        status: 'contacted'
      }
    });

    if (statusResponse.statusCode === 200 && statusResponse.body.success) {
      console.log('  ✅ Lead status update successful');
    } else {
      console.log('  ❌ Lead status update failed:', statusResponse.statusCode, statusResponse.body);
      return false;
    }

    // Test adding note to lead
    console.log('  📝 Step 2: Testing add note to lead...');
    const noteResponse = await makeRequest(`${BASE_URL}/.netlify/functions/sales-add-note`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${testState.authToken}`
      },
      body: {
        leadId: testState.leadId,
        content: 'Called customer, they are interested in scheduling a test drive.'
      }
    });

    if (noteResponse.statusCode === 200 && noteResponse.body.success) {
      console.log('  ✅ Add note successful');
    } else {
      console.log('  ❌ Add note failed:', noteResponse.statusCode, noteResponse.body);
      return false;
    }

    // Test updating to appointment status
    console.log('  📅 Step 3: Testing lead status to appointment...');
    const appointmentStatusResponse = await makeRequest(`${BASE_URL}/.netlify/functions/sales-update-status`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${testState.authToken}`
      },
      body: {
        leadId: testState.leadId,
        status: 'appointment'
      }
    });

    if (appointmentStatusResponse.statusCode === 200 && appointmentStatusResponse.body.success) {
      console.log('  ✅ Lead status to appointment successful');
    } else {
      console.log('  ❌ Lead status to appointment failed:', appointmentStatusResponse.statusCode, appointmentStatusResponse.body);
      return false;
    }

    return true;
  } catch (error) {
    console.log('  ❌ Lead management test error:', error.message);
    return false;
  }
}

async function testAppointmentWorkflow() {
  console.log('\n📅 Testing Appointment Workflow...');

  if (!testState.authToken) {
    console.log('  ❌ No auth token available, skipping appointment tests');
    return false;
  }

  try {
    // Note: In a real scenario, we'd create an appointment first
    // For this test, we'll assume there might be existing appointments
    // and test the completion workflow

    console.log('  📋 Step 1: Checking for existing appointments...');
    const appointmentsResponse = await makeRequest(`${BASE_URL}/.netlify/functions/sales-appointments?timeframe=month`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${testState.authToken}`
      }
    });

    if (appointmentsResponse.statusCode === 200 && appointmentsResponse.body.success) {
      const appointments = appointmentsResponse.body.data?.appointments || [];
      console.log('  📊 Found', appointments.length, 'appointments');

      if (appointments.length > 0) {
        // Test completing an appointment (using the first one found)
        testState.appointmentId = appointments[0].id;
        console.log('  ✅ Step 2: Testing appointment completion...');

        const completeResponse = await makeRequest(`${BASE_URL}/.netlify/functions/sales-complete-appointment`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${testState.authToken}`
          },
          body: {
            appointmentId: testState.appointmentId
          }
        });

        if (completeResponse.statusCode === 200 && completeResponse.body.success) {
          console.log('  ✅ Appointment completion successful');
        } else {
          console.log('  ❌ Appointment completion failed:', completeResponse.statusCode, completeResponse.body);
          return false;
        }
      } else {
        console.log('  ℹ️ No appointments found to test completion');
      }
    } else {
      console.log('  ❌ Could not fetch appointments:', appointmentsResponse.statusCode, appointmentsResponse.body);
      return false;
    }

    return true;
  } catch (error) {
    console.log('  ❌ Appointment workflow test error:', error.message);
    return false;
  }
}

async function testSaleCompletion() {
  console.log('\n💰 Testing Sale Completion Workflow...');

  if (!testState.authToken || !testState.leadId) {
    console.log('  ❌ Missing auth token or lead ID, skipping sale completion tests');
    return false;
  }

  try {
    // Test updating lead to sold status
    console.log('  💰 Step 1: Testing lead status to sold...');
    const soldResponse = await makeRequest(`${BASE_URL}/.netlify/functions/sales-update-status`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${testState.authToken}`
      },
      body: {
        leadId: testState.leadId,
        status: 'sold'
      }
    });

    if (soldResponse.statusCode === 200 && soldResponse.body.success) {
      console.log('  ✅ Lead status to sold successful');
    } else {
      console.log('  ❌ Lead status to sold failed:', soldResponse.statusCode, soldResponse.body);
      return false;
    }

    // Check updated metrics
    console.log('  📈 Step 2: Verifying updated metrics...');
    const metricsResponse = await makeRequest(`${BASE_URL}/.netlify/functions/sales-metrics?timeframe=week`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${testState.authToken}`
      }
    });

    if (metricsResponse.statusCode === 200 && metricsResponse.body.success) {
      const metrics = metricsResponse.body.data;
      console.log('  📊 Final metrics:', {
        newLeads: metrics.newLeads,
        totalLeads: metrics.totalLeads,
        appointments: metrics.appointments,
        sales: metrics.sales,
        conversionRate: metrics.conversionRate
      });
      console.log('  ✅ Metrics verification successful');
    } else {
      console.log('  ❌ Metrics verification failed:', metricsResponse.statusCode, metricsResponse.body);
      return false;
    }

    return true;
  } catch (error) {
    console.log('  ❌ Sale completion test error:', error.message);
    return false;
  }
}

async function runEndToEndTests() {
  console.log('🚀 Starting End-to-End Testing Suite...');
  console.log('📍 Base URL:', BASE_URL);
  console.log('🎯 Testing complete workflow: Lead Capture → Authentication → Dashboard → Lead Management → Appointment → Sale');

  const results = {
    leadCapture: false,
    authentication: false,
    dashboardAPIs: false,
    leadManagement: false,
    appointmentWorkflow: false,
    saleCompletion: false
  };

  // Run all tests
  results.leadCapture = await testLeadCapture();
  results.authentication = await testSalesAuthentication();
  results.dashboardAPIs = await testDashboardAPIs();
  results.leadManagement = await testLeadManagement();
  results.appointmentWorkflow = await testAppointmentWorkflow();
  results.saleCompletion = await testSaleCompletion();

  // Summary
  console.log('\n📊 End-to-End Testing Results:');
  console.log('=====================================');

  const passedTests = Object.values(results).filter(Boolean).length;
  const totalTests = Object.keys(results).length;

  Object.entries(results).forEach(([test, passed]) => {
    const status = passed ? '✅' : '❌';
    console.log(`${status} ${test.replace(/([A-Z])/g, ' $1').toLowerCase()}`);
  });

  console.log('=====================================');
  console.log(`🎯 Overall: ${passedTests}/${totalTests} tests passed`);

  if (passedTests === totalTests) {
    console.log('🎉 All end-to-end tests passed! The complete workflow is working.');
  } else {
    console.log('⚠️ Some tests failed. Check the output above for details.');
  }

  return results;
}

// Run tests if this script is executed directly
if (require.main === module) {
  runEndToEndTests().catch(console.error);
}

module.exports = {
  runEndToEndTests,
  testLeadCapture,
  testSalesAuthentication,
  testDashboardAPIs,
  testLeadManagement,
  testAppointmentWorkflow,
  testSaleCompletion
};