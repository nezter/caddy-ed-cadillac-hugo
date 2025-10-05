/**
 * Test Database Connection
 * Tests if Supabase connection works for testing
 */

require('dotenv').config();

async function testDatabaseConnection() {
  console.log('🔧 Testing database connection...');

  try {
    const { createClient } = require('@supabase/supabase-js');

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    console.log('📡 Testing Supabase connection...');

    // Test basic connection with a simple query
    const { data, error } = await supabase
      .from('sales_reps')
      .select('count')
      .limit(1);

    if (error) {
      console.error('❌ Supabase connection failed:', error.message);
      return false;
    }

    console.log('✅ Supabase connection successful!');
    console.log('📊 Current sales reps count:', data?.length || 0);

    // Test if we can create a test sales rep
    console.log('👤 Testing sales rep creation...');

    const testEmail = `test-${Date.now()}@example.com`;
    const { data: newRep, error: createError } = await supabase
      .from('sales_reps')
      .insert({
        first_name: 'Test',
        last_name: 'User',
        email: testEmail,
        phone: '(704) 555-9999',
        role: 'sales_representative',
        status: 'active',
        permissions: ['view_customers', 'manage_leads']
      })
      .select()
      .single();

    if (createError) {
      console.error('❌ Failed to create test sales rep:', createError.message);
      return false;
    }

    console.log('✅ Test sales rep created successfully:', newRep.email);

    // Clean up test data
    const { error: deleteError } = await supabase
      .from('sales_reps')
      .delete()
      .eq('email', testEmail);

    if (deleteError) {
      console.warn('⚠️ Failed to clean up test data:', deleteError.message);
    } else {
      console.log('🧹 Test data cleaned up');
    }

    return true;

  } catch (error) {
    console.error('❌ Database connection test failed:', error.message);
    return false;
  }
}

async function testLeadCreation() {
  console.log('\n🧪 Testing lead creation...');

  try {
    const { createClient } = require('@supabase/supabase-js');

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const testLead = {
      first_name: 'John',
      last_name: 'Doe',
      email: `lead-test-${Date.now()}@example.com`,
      phone: '(555) 123-4567',
      lead_source: 'website',
      status: 'new',
      message: 'Test lead from automated testing'
    };

    const { data: newLead, error } = await supabase
      .from('leads')
      .insert(testLead)
      .select()
      .single();

    if (error) {
      console.error('❌ Failed to create test lead:', error.message);
      return false;
    }

    console.log('✅ Test lead created successfully:', newLead.id);

    // Clean up
    const { error: deleteError } = await supabase
      .from('leads')
      .delete()
      .eq('id', newLead.id);

    if (deleteError) {
      console.warn('⚠️ Failed to clean up test lead:', deleteError.message);
    } else {
      console.log('🧹 Test lead cleaned up');
    }

    return true;

  } catch (error) {
    console.error('❌ Lead creation test failed:', error.message);
    return false;
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  (async () => {
    const dbTest = await testDatabaseConnection();
    const leadTest = await testLeadCreation();

    console.log('\n📊 Test Results:');
    console.log('Database Connection:', dbTest ? '✅ PASS' : '❌ FAIL');
    console.log('Lead Creation:', leadTest ? '✅ PASS' : '❌ FAIL');

    if (dbTest && leadTest) {
      console.log('\n🎉 All database tests passed! Ready for end-to-end testing.');
    } else {
      console.log('\n⚠️ Some tests failed. Check database configuration.');
    }
  })();
}

module.exports = {
  testDatabaseConnection,
  testLeadCreation
};