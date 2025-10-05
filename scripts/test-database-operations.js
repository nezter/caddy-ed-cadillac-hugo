#!/usr/bin/env node

/**
 * Database Operations Test Script
 * Tests CRUD operations and database functionality after migration
 */

require('dotenv').config({ path: './.env' });

const { createClient: createSupabaseClient } = require('@supabase/supabase-js');
const { createClient: createTursoClient } = require('@libsql/client');

// Test configuration
const TEST_CONFIG = {
  supabase: {
    url: process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY
  },
  turso: {
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN
  }
};

// Initialize database connections
const supabase = createSupabaseClient(
  TEST_CONFIG.supabase.url,
  TEST_CONFIG.supabase.serviceKey
);

const turso = createTursoClient({
  url: TEST_CONFIG.turso.url,
  authToken: TEST_CONFIG.turso.authToken,
});

// Test data
const TEST_CUSTOMER = {
  first_name: 'Test',
  last_name: 'Customer',
  email: 'test.customer@example.com',
  phone: '555-0123',
  customer_type: 'prospect',
  source: 'test_script',
  preferred_contact_method: 'email'
};

const TEST_LEAD = {
  first_name: 'Test',
  last_name: 'Lead',
  email: 'test.lead@example.com',
  phone: '555-0456',
  message: 'Interested in a Cadillac',
  form_type: 'general',
  lead_source: 'test_script',
  vehicle_interest: '2024 Cadillac Escalade'
};

const TEST_SALES_REP = {
  first_name: 'Test',
  last_name: 'Representative',
  email: 'test.rep@cadillac.com',
  role: 'sales_representative',
  status: 'active'
};

/**
 * Test Supabase Operations
 */
async function testSupabaseOperations() {
  console.log('\n🔍 Testing Supabase Operations...');
  const results = [];

  try {
    // Test 1: Create a customer
    console.log('  📝 Creating test customer...');
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .insert(TEST_CUSTOMER)
      .select()
      .single();

    if (customerError) {
      throw new Error(`Customer creation failed: ${customerError.message}`);
    }
    console.log('  ✅ Customer created:', customer.id);
    results.push({ operation: 'create_customer', success: true, id: customer.id });

    // Test 2: Create a lead
    console.log('  📝 Creating test lead...');
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .insert({
        ...TEST_LEAD,
        customer_id: customer.id
      })
      .select()
      .single();

    if (leadError) {
      throw new Error(`Lead creation failed: ${leadError.message}`);
    }
    console.log('  ✅ Lead created:', lead.id);
    results.push({ operation: 'create_lead', success: true, id: lead.id });

    // Test 3: Create a sales representative
    console.log('  👤 Creating test sales representative...');
    const { data: salesRep, error: salesRepError } = await supabase
      .from('sales_reps')
      .insert(TEST_SALES_REP)
      .select()
      .single();

    if (salesRepError) {
      throw new Error(`Sales rep creation failed: ${salesRepError.message}`);
    }
    console.log('  ✅ Sales representative created:', salesRep.id);
    results.push({ operation: 'create_sales_rep', success: true, id: salesRep.id });

    // Test 4: Create an interaction
    console.log('  💬 Creating test interaction...');
    const { data: interaction, error: interactionError } = await supabase
      .from('interactions')
      .insert({
        customer_id: customer.id,
        interaction_type: 'phone_call',
        subject: 'Initial contact',
        content: 'Test interaction content',
        sales_rep_id: salesRep.id,
        sales_rep_name: `${salesRep.first_name} ${salesRep.last_name}`
      })
      .select()
      .single();

    if (interactionError) {
      throw new Error(`Interaction creation failed: ${interactionError.message}`);
    }
    console.log('  ✅ Interaction created:', interaction.id);
    results.push({ operation: 'create_interaction', success: true, id: interaction.id });

    // Test 5: Create an appointment
    console.log('  📅 Creating test appointment...');
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);
    
    const { data: appointment, error: appointmentError } = await supabase
      .from('appointments')
      .insert({
        customer_id: customer.id,
        appointment_type: 'test_drive',
        title: 'Test Drive Appointment',
        description: 'Test appointment for customer',
        scheduled_start: futureDate.toISOString(),
        scheduled_end: new Date(futureDate.getTime() + 60 * 60 * 1000).toISOString(),
        assigned_sales_rep_id: salesRep.id,
        assigned_sales_rep_name: `${salesRep.first_name} ${salesRep.last_name}`,
        vehicle_of_interest: '2024 Cadillac Escalade'
      })
      .select()
      .single();

    if (appointmentError) {
      throw new Error(`Appointment creation failed: ${appointmentError.message}`);
    }
    console.log('  ✅ Appointment created:', appointment.id);
    results.push({ operation: 'create_appointment', success: true, id: appointment.id });

    // Test 6: Query operations
    console.log('  🔍 Testing query operations...');
    
    // Get all customers
    const { data: customers, error: customersError } = await supabase
      .from('customers')
      .select('*')
      .limit(5);

    if (customersError) {
      throw new Error(`Customer query failed: ${customersError.message}`);
    }
    console.log(`  ✅ Retrieved ${customers.length} customers`);

    // Get customer with interactions
    const { data: customerWithInteractions, error: joinedError } = await supabase
      .from('customers')
      .select(`
        *,
        interactions:interaction_id (
          interaction_type,
          created_at,
          sales_rep_name
        )
      `)
      .eq('id', customer.id)
      .single();

    if (joinedError) {
      console.log(`  ⚠️ Join query failed: ${joinedError.message}`);
    } else {
      console.log(`  ✅ Retrieved customer with ${customerWithInteractions.interactions.length} interactions`);
    }

    // Test 7: Update operations
    console.log('  ✏️ Testing update operations...');
    const { data: updatedCustomer, error: updateError } = await supabase
      .from('customers')
      .update({
        lead_score: 85,
        last_activity_date: new Date().toISOString()
      })
      .eq('id', customer.id)
      .select()
      .single();

    if (updateError) {
      throw new Error(`Customer update failed: ${updateError.message}`);
    }
    console.log('  ✅ Customer updated successfully');

    // Test 8: Delete test data
    console.log('  🗑️ Cleaning up test data...');
    
    // Delete in reverse order of dependencies
    await supabase.from('appointments').delete().eq('id', appointment.id);
    await supabase.from('interactions').delete().eq('id', interaction.id);
    await supabase.from('leads').delete().eq('id', lead.id);
    await supabase.from('sales_reps').delete().eq('id', salesRep.id);
    await supabase.from('customers').delete().eq('id', customer.id);
    
    console.log('  ✅ Test data cleaned up');

    return {
      success: true,
      database: 'supabase',
      operations: results,
      totalOperations: results.length
    };

  } catch (error) {
    console.error('  ❌ Supabase test failed:', error.message);
    return {
      success: false,
      database: 'supabase',
      error: error.message,
      operations: results
    };
  }
}

/**
 * Test Turso Operations
 */
async function testTursoOperations() {
  console.log('\n🔍 Testing Turso Operations...');
  const results = [];

  try {
    // Test 1: Basic query
    console.log('  🔍 Testing basic query...');
    const result = await turso.execute('SELECT COUNT(*) as count FROM customers');
    console.log(`  ✅ Customers count: ${result.rows[0].count}`);
    results.push({ operation: 'count_customers', success: true });

    // Test 2: Schema validation
    console.log('  📋 Validating schema...');
    const tables = await turso.execute(`
      SELECT name FROM sqlite_master 
      WHERE type='table' 
      ORDER BY name
    `);
    
    const expectedTables = [
      'customers', 'leads', 'interactions', 'appointments', 
      'sales_reps', 'vehicles', 'tasks', 'schema_migrations'
    ];
    
    const foundTables = tables.rows.map(row => row.name);
    const missingTables = expectedTables.filter(table => !foundTables.includes(table));
    
    if (missingTables.length > 0) {
      throw new Error(`Missing tables: ${missingTables.join(', ')}`);
    }
    
    console.log(`  ✅ All ${expectedTables.length} expected tables found`);
    results.push({ operation: 'validate_schema', success: true });

    // Test 3: Index validation
    console.log('  📊 Validating indexes...');
    const indexes = await turso.execute(`
      SELECT name, tbl_name FROM sqlite_master 
      WHERE type='index' AND name NOT LIKE 'sqlite_%'
      ORDER BY tbl_name, name
    `);
    
    console.log(`  ✅ Found ${indexes.rows.length} custom indexes`);
    results.push({ operation: 'validate_indexes', success: true });

    return {
      success: true,
      database: 'turso',
      operations: results,
      totalOperations: results.length
    };

  } catch (error) {
    console.error('  ❌ Turso test failed:', error.message);
    return {
      success: false,
      database: 'turso',
      error: error.message,
      operations: results
    };
  }
}

/**
 * Test Database Service Integration
 */
async function testDatabaseServiceIntegration() {
  console.log('\n🔍 Testing Database Service Integration...');
  
  try {
    // Import and test the DatabaseService
    const DatabaseService = require('../netlify/functions/utils/database-service');
    
    console.log('  📦 Database Service loaded successfully');
    
    // Test search functionality (mock for now)
    console.log('  🔍 Testing search functionality...');
    const searchResults = await DatabaseService.searchCustomers({
      search: 'test',
      limit: 5
    });
    
    console.log(`  ✅ Search completed: ${searchResults.length} results`);
    
    return {
      success: true,
      component: 'database_service',
      searchResults: searchResults.length
    };

  } catch (error) {
    console.error('  ❌ Database Service test failed:', error.message);
    return {
      success: false,
      component: 'database_service',
      error: error.message
    };
  }
}

/**
 * Generate Test Report
 */
function generateTestReport(results) {
  const report = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    summary: {
      totalTests: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length
    },
    results: results,
    recommendations: []
  };

  // Add recommendations
  if (report.summary.failed > 0) {
    report.recommendations.push('Some tests failed. Please review the errors and fix configuration issues.');
  }

  if (report.summary.successful === report.summary.totalTests) {
    report.recommendations.push('All tests passed! Database setup is ready for production use.');
  }

  const failedResults = results.filter(r => !r.success);
  if (failedResults.length > 0) {
    report.recommendations.push('Failed tests:');
    failedResults.forEach(result => {
      report.recommendations.push(`  - ${result.database || result.component}: ${result.error}`);
    });
  }

  return report;
}

/**
 * Main test function
 */
async function runDatabaseTests() {
  console.log('🚀 Starting Database Operations Tests');
  console.log('=====================================');

  const results = [];

  // Run Supabase tests
  const supabaseResult = await testSupabaseOperations();
  results.push(supabaseResult);

  // Run Turso tests
  const tursoResult = await testTursoOperations();
  results.push(tursoResult);

  // Run Database Service tests
  const serviceResult = await testDatabaseServiceIntegration();
  results.push(serviceResult);

  // Generate report
  const report = generateTestReport(results);

  console.log('\n📊 Test Results Summary');
  console.log('=========================');
  console.log(`Total Tests: ${report.summary.totalTests}`);
  console.log(`Successful: ${report.summary.successful}`);
  console.log(`Failed: ${report.summary.failed}`);

  results.forEach(result => {
    console.log(`\n${result.success ? '✅' : '❌'} ${result.database || result.component}`);
    if (result.success) {
      console.log(`   Status: Passed`);
      if (result.totalOperations) console.log(`   Operations: ${result.totalOperations}`);
      if (result.searchResults !== undefined) console.log(`   Search Results: ${result.searchResults}`);
    } else {
      console.log(`   Status: Failed`);
      console.log(`   Error: ${result.error}`);
    }
  });

  // Save report
  const fs = require('fs');
  const path = require('path');
  
  const reportPath = path.join(__dirname, '../database/test-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 Test report saved to: ${reportPath}`);

  // Exit with appropriate code
  if (report.summary.failed > 0) {
    console.log('\n⚠️ Some database tests failed. Please review the errors.');
    process.exit(1);
  } else {
    console.log('\n🎉 All database tests passed! The system is ready for production.');
    process.exit(0);
  }
}

// Run tests if called directly
if (require.main === module) {
  runDatabaseTests().catch(error => {
    console.error('💥 Test execution failed:', error);
    process.exit(1);
  });
}

module.exports = {
  runDatabaseTests,
  testSupabaseOperations,
  testTursoOperations,
  testDatabaseServiceIntegration
};
