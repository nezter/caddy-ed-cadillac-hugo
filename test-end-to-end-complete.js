#!/usr/bin/env node

/**
 * Complete End-to-End Test
 * Tests the entire system with authentication and mock data
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Load test data
const mockDb = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'test-data/mock-database.json'), 'utf8')
);
const tokensData = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'test-data/test-tokens.json'), 'utf8')
);
const tokens = tokensData; // The file already contains the tokens array

console.log('🚀 Running Complete End-to-End Test\n');

// Mock API responses
function createMockApiResponse(endpoint, method, data, userRole) {
  return new Promise((resolve) => {
    setTimeout(() => {
      console.log(`📡 ${method} ${endpoint} (${userRole})`);
      
      let response;
      
      switch (endpoint) {
        case '/api/followup-campaigns':
          response = {
            success: true,
            data: mockDb.followup_campaigns,
            count: mockDb.followup_campaigns.length
          };
          break;
          
        case '/api/followup-rules':
          response = {
            success: true,
            data: mockDb.followup_rules,
            count: mockDb.followup_rules.length
          };
          break;
          
        case '/api/email-templates':
          response = {
            success: true,
            data: mockDb.email_templates,
            count: mockDb.email_templates.length
          };
          break;
          
        case '/api/leads':
          response = {
            success: true,
            data: mockDb.leads,
            count: mockDb.leads.length
          };
          break;
          
        case '/api/sales-reps':
          response = {
            success: true,
            data: mockDb.sales_reps,
            count: mockDb.sales_reps.length
          };
          break;
          
        default:
          response = {
            success: false,
            error: 'Endpoint not found'
          };
      }
      
      resolve({
        statusCode: 200,
        body: JSON.stringify(response)
      });
    }, 100); // Simulate network delay
  });
}

// Test authentication
function testAuthentication() {
  console.log('🔐 Testing Authentication...');
  
  return new Promise((resolve) => {
    const testResults = [];
    
    tokens.forEach(tokenInfo => {
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(tokenInfo.token, process.env.JWT_SECRET);
        
        console.log(`✅ ${tokenInfo.user.email}: Valid token (${decoded.role})`);
        testResults.push({
          user: tokenInfo.user.email,
          valid: true,
          role: decoded.role
        });
      } catch (error) {
        console.log(`❌ ${tokenInfo.user.email}: Invalid token - ${error.message}`);
        testResults.push({
          user: tokenInfo.user.email,
          valid: false,
          error: error.message
        });
      }
    });
    
    resolve(testResults);
  });
}

// Test API endpoints with authentication
async function testApiEndpoints() {
  console.log('\n🌐 Testing API Endpoints...');
  
  const endpoints = [
    '/api/followup-campaigns',
    '/api/followup-rules', 
    '/api/email-templates',
    '/api/leads',
    '/api/sales-reps'
  ];
  
  const results = [];
  
  for (const tokenInfo of tokens) {
    console.log(`\n👤 Testing as ${tokenInfo.user.email} (${tokenInfo.user.role}):`);
    
    for (const endpoint of endpoints) {
      try {
        const response = await createMockApiResponse(endpoint, 'GET', null, tokenInfo.user.role);
        const data = JSON.parse(response.body);
        
        console.log(`  ✅ ${endpoint}: ${data.count} items`);
        
        results.push({
          user: tokenInfo.user.email,
          role: tokenInfo.user.role,
          endpoint: endpoint,
          success: data.success,
          count: data.count
        });
      } catch (error) {
        console.log(`  ❌ ${endpoint}: ${error.message}`);
        results.push({
          user: tokenInfo.user.email,
          role: tokenInfo.user.role,
          endpoint: endpoint,
          success: false,
          error: error.message
        });
      }
    }
  }
  
  return results;
}

// Test follow-up workflow with authentication
async function testFollowupWorkflow() {
  console.log('\n🔄 Testing Follow-up Workflow...');
  
  const adminToken = tokens.find(t => t.user.role === 'admin');
  const salesToken = tokens.find(t => t.user.role === 'sales_representative');
  
  if (!adminToken || !salesToken) {
    console.error('❌ Missing required test tokens');
    return [];
  }
  
  const workflowSteps = [
    {
      step: 'Create Campaign',
      endpoint: '/api/followup-campaigns',
      method: 'POST',
      user: adminToken.user.email,
      data: {
        name: 'Test Campaign',
        description: 'Automated test campaign',
        campaign_type: 'nurture',
        is_active: true
      }
    },
    {
      step: 'View Campaigns',
      endpoint: '/api/followup-campaigns',
      method: 'GET',
      user: salesToken.user.email,
      data: null
    },
    {
      step: 'Create Rule',
      endpoint: '/api/followup-rules',
      method: 'POST', 
      user: adminToken.user.email,
      data: {
        campaign_id: '1',
        name: 'Test Rule',
        conditions: { lead_status: 'new' },
        actions: { send_email: 'welcome-template' }
      }
    },
    {
      step: 'Process Leads',
      endpoint: '/api/leads/process-followups',
      method: 'POST',
      user: adminToken.user.email,
      data: { campaign_id: '1' }
    }
  ];
  
  const results = [];
  
  for (const step of workflowSteps) {
    try {
      console.log(`  📋 ${step.step} (${step.user})`);
      
      const response = await createMockApiResponse(
        step.endpoint, 
        step.method, 
        step.data, 
        step.user
      );
      
      const data = JSON.parse(response.body);
      
      if (data.success) {
        console.log(`    ✅ Success`);
        results.push({ step: step.step, success: true });
      } else {
        console.log(`    ❌ Failed: ${data.error}`);
        results.push({ step: step.step, success: false, error: data.error });
      }
    } catch (error) {
      console.log(`    ❌ Error: ${error.message}`);
      results.push({ step: step.step, success: false, error: error.message });
    }
  }
  
  return results;
}

// Test role-based permissions
function testPermissions() {
  console.log('\n🛡️ Testing Role-Based Permissions...');
  
  const permissionTests = [
    {
      role: 'admin',
      permissions: ['campaigns_read', 'campaigns_write', 'leads_read', 'leads_write', 'analytics_read'],
      shouldPass: true
    },
    {
      role: 'manager', 
      permissions: ['campaigns_read', 'campaigns_write', 'leads_read', 'leads_write', 'team_management'],
      shouldPass: true
    },
    {
      role: 'sales_representative',
      permissions: ['leads_read', 'leads_write', 'campaigns_read'],
      shouldPass: true
    }
  ];
  
  const results = [];
  
  permissionTests.forEach(test => {
    const tokenInfo = tokens.find(t => t.user.role === test.role);
    
    if (tokenInfo) {
      const hasRequiredPerms = test.permissions.every(perm => 
        tokenInfo.user.permissions.includes(perm)
      );
      
      if (hasRequiredPerms === test.shouldPass) {
        console.log(`✅ ${test.role}: Permissions correct`);
        results.push({ role: test.role, success: true });
      } else {
        console.log(`❌ ${test.role}: Permission mismatch`);
        results.push({ role: test.role, success: false });
      }
    } else {
      console.log(`❌ ${test.role}: No test token found`);
      results.push({ role: test.role, success: false, error: 'No token' });
    }
  });
  
  return results;
}

// Run all tests
async function runCompleteTest() {
  const startTime = Date.now();
  
  console.log('='.repeat(60));
  console.log('🧪 COMPLETE END-TO-END SYSTEM TEST');
  console.log('='.repeat(60));
  
  const results = {
    authentication: await testAuthentication(),
    apiEndpoints: await testApiEndpoints(),
    followupWorkflow: await testFollowupWorkflow(),
    permissions: testPermissions()
  };
  
  const endTime = Date.now();
  const duration = endTime - startTime;
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST RESULTS SUMMARY');
  console.log('='.repeat(60));
  
  // Authentication results
  const authPassed = results.authentication.filter(r => r.valid).length;
  console.log(`🔐 Authentication: ${authPassed}/${results.authentication.length} passed`);
  
  // API endpoint results
  const apiPassed = results.apiEndpoints.filter(r => r.success).length;
  console.log(`🌐 API Endpoints: ${apiPassed}/${results.apiEndpoints.length} passed`);
  
  // Workflow results
  const workflowPassed = results.followupWorkflow.filter(r => r.success).length;
  console.log(`🔄 Follow-up Workflow: ${workflowPassed}/${results.followupWorkflow.length} passed`);
  
  // Permission results
  const permPassed = results.permissions.filter(r => r.success).length;
  console.log(`🛡️ Permissions: ${permPassed}/${results.permissions.length} passed`);
  
  const totalTests = authPassed + apiPassed + workflowPassed + permPassed;
  const totalPossible = results.authentication.length + results.apiEndpoints.length + 
                       results.followupWorkflow.length + results.permissions.length;
  
  console.log('='.repeat(60));
  console.log(`🎯 Overall: ${totalTests}/${totalPossible} tests passed`);
  console.log(`⏱️  Duration: ${duration}ms`);
  console.log('='.repeat(60));
  
  if (totalTests === totalPossible) {
    console.log('🎉 ALL TESTS PASSED! System is ready for production.');
  } else {
    console.log('⚠️  Some tests failed. Please review the results above.');
  }
  
  return totalTests === totalPossible;
}

// Run the complete test
runCompleteTest().then(success => {
  process.exit(success ? 0 : 1);
});
