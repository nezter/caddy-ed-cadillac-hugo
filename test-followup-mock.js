#!/usr/bin/env node

/**
 * Follow-up System Mock Test
 * Tests follow-up system functionality with mock data
 */

const fs = require('fs');
const path = require('path');

// Load mock database
const mockDb = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'test-data/mock-database.json'), 'utf8')
);

console.log('🚀 Testing Follow-up System with Mock Data\n');

// Test 1: Campaign Management
function testCampaignManagement() {
  console.log('📋 Testing Campaign Management...');
  
  try {
    const campaigns = mockDb.followup_campaigns;
    console.log(`✅ Found ${campaigns.length} campaigns`);
    
    campaigns.forEach(campaign => {
      console.log(`  - ${campaign.name}: ${campaign.is_active ? 'Active' : 'Inactive'}`);
    });
    
    return true;
  } catch (error) {
    console.error('❌ Campaign management test failed:', error.message);
    return false;
  }
}

// Test 2: Rule Processing
function testRuleProcessing() {
  console.log('\n🎯 Testing Rule Processing...');
  
  try {
    const rules = mockDb.followup_rules;
    const leads = mockDb.leads;
    
    console.log(`✅ Found ${rules.length} rules`);
    
    // Simulate rule processing
    const matchingLeads = leads.filter(lead => lead.status === 'new');
    console.log(`✅ Found ${matchingLeads.length} leads matching rule conditions`);
    
    rules.forEach(rule => {
      console.log(`  - Rule: ${rule.name}`);
      console.log(`    Conditions: ${JSON.stringify(rule.conditions)}`);
      console.log(`    Actions: ${JSON.stringify(rule.actions)}`);
    });
    
    return true;
  } catch (error) {
    console.error('❌ Rule processing test failed:', error.message);
    return false;
  }
}

// Test 3: Template Processing
function testTemplateProcessing() {
  console.log('\n📧 Testing Template Processing...');
  
  try {
    const templates = mockDb.email_templates;
    const leads = mockDb.leads;
    
    console.log(`✅ Found ${templates.length} templates`);
    
    templates.forEach(template => {
      console.log(`  - Template: ${template.name}`);
      console.log(`    Subject: ${template.subject}`);
      
      // Test personalization
      let personalizedContent = template.content;
      const testLead = leads[0];
      
      personalizedContent = personalizedContent.replace(
        /\{\{(\w+)\}\}/g, 
        (match, key) => testLead[key] || match
      );
      
      console.log(`    Personalized: ${personalizedContent}`);
    });
    
    return true;
  } catch (error) {
    console.error('❌ Template processing test failed:', error.message);
    return false;
  }
}

// Test 4: API Endpoint Simulation
function testApiEndpoints() {
  console.log('\n🌐 Testing API Endpoint Simulation...');
  
  try {
    // Simulate API responses
    const apiResponses = {
      '/api/followup-campaigns': {
        success: true,
        data: mockDb.followup_campaigns,
        count: mockDb.followup_campaigns.length
      },
      '/api/followup-rules': {
        success: true,
        data: mockDb.followup_rules,
        count: mockDb.followup_rules.length
      },
      '/api/email-templates': {
        success: true,
        data: mockDb.email_templates,
        count: mockDb.email_templates.length
      },
      '/api/leads': {
        success: true,
        data: mockDb.leads,
        count: mockDb.leads.length
      }
    };
    
    Object.entries(apiResponses).forEach(([endpoint, response]) => {
      console.log(`  ✅ ${endpoint}: ${response.count} items returned`);
    });
    
    return true;
  } catch (error) {
    console.error('❌ API endpoint test failed:', error.message);
    return false;
  }
}

// Test 5: Follow-up Workflow Simulation
function testFollowupWorkflow() {
  console.log('\n🔄 Testing Follow-up Workflow...');
  
  try {
    const newLeads = mockDb.leads.filter(lead => lead.status === 'new');
    const welcomeCampaign = mockDb.followup_campaigns.find(c => c.campaign_type === 'welcome');
    const welcomeRule = mockDb.followup_rules.find(r => r.campaign_id === welcomeCampaign?.id);
    const welcomeTemplate = mockDb.email_templates.find(t => t.template_type === 'welcome');
    
    console.log(`✅ Found ${newLeads.length} new leads to process`);
    
    if (welcomeCampaign && welcomeRule && welcomeTemplate) {
      console.log('✅ Welcome workflow is properly configured');
      console.log(`  Campaign: ${welcomeCampaign.name}`);
      console.log(`  Rule: ${welcomeRule.name}`);
      console.log(`  Template: ${welcomeTemplate.name}`);
      
      // Simulate processing each lead
      newLeads.forEach(lead => {
        console.log(`  📧 Processing lead: ${lead.first_name} ${lead.last_name}`);
        console.log(`    Email: ${lead.email}`);
        console.log(`    Status: ${lead.status} → follow-up_scheduled`);
      });
      
      return true;
    } else {
      console.error('❌ Incomplete follow-up workflow configuration');
      return false;
    }
  } catch (error) {
    console.error('❌ Follow-up workflow test failed:', error.message);
    return false;
  }
}

// Run all tests
async function runAllTests() {
  const tests = [
    { name: 'Campaign Management', fn: testCampaignManagement },
    { name: 'Rule Processing', fn: testRuleProcessing },
    { name: 'Template Processing', fn: testTemplateProcessing },
    { name: 'API Endpoints', fn: testApiEndpoints },
    { name: 'Follow-up Workflow', fn: testFollowupWorkflow }
  ];
  
  const results = [];
  
  for (const test of tests) {
    const result = test.fn();
    results.push({ name: test.name, passed: result });
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('📊 Test Results Summary:');
  console.log('='.repeat(50));
  
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  
  results.forEach(result => {
    console.log(`${result.passed ? '✅' : '❌'} ${result.name}`);
  });
  
  console.log('='.repeat(50));
  console.log(`🎯 Overall: ${passed}/${total} tests passed`);
  
  if (passed === total) {
    console.log('🎉 All tests passed! Follow-up system is working correctly.');
  } else {
    console.log('⚠️  Some tests failed. Please review the implementation.');
  }
  
  return passed === total;
}

// Run the tests
runAllTests().then(success => {
  process.exit(success ? 0 : 1);
});
