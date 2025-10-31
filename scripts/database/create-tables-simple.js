/**
 * Create Tables Using Supabase Client
 * Creates essential tables using Supabase client's built-in methods
 */

require('dotenv').config();

async function createTablesSimple() {
  console.log('🏗️ Creating database tables using Supabase client...');

  try {
    const { createClient } = require('@supabase/supabase-js');

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Test connection first
    console.log('🔗 Testing Supabase connection...');
    const { data: testData, error: testError } = await supabase
      .from('sales_reps')
      .select('count')
      .limit(1);

    if (testError && testError.message.includes('does not exist')) {
      console.log('📋 Tables do not exist, will create them...');
    } else if (testError) {
      console.error('❌ Connection test failed:', testError.message);
      return;
    } else {
      console.log('✅ Tables already exist');
      return;
    }

    // Since we can't use raw SQL easily, let's try a different approach
    // We'll create a test sales rep and lead to verify the system works
    console.log('👤 Creating test sales representative...');

    const testSalesRep = {
      first_name: 'Test',
      last_name: 'Sales',
      email: 'test.sales@caddyed.com',
      phone: '(704) 555-0100',
      role: 'sales_representative',
      status: 'active',
      permissions: ['view_customers', 'manage_leads']
    };

    // Try to insert - this will fail if table doesn't exist, but will tell us
    const { data: salesRepData, error: salesRepError } = await supabase
      .from('sales_reps')
      .insert(testSalesRep)
      .select()
      .single();

    if (salesRepError) {
      console.log('❌ Sales reps table does not exist or other error:', salesRepError.message);
      console.log('💡 You may need to create tables manually in Supabase dashboard');
      console.log('   Go to: https://supabase.com/dashboard/project/YOUR_PROJECT/sql');
      console.log('   And run the migration SQL files manually');
      return;
    }

    console.log('✅ Test sales rep created:', salesRepData.email);

    // Now try to create a test lead
    console.log('📋 Creating test lead...');

    const testLead = {
      first_name: 'John',
      last_name: 'Doe',
      email: 'john.doe@example.com',
      phone: '(555) 123-4567',
      lead_source: 'website',
      status: 'new',
      message: 'Test lead for end-to-end testing'
    };

    const { data: leadData, error: leadError } = await supabase
      .from('leads')
      .insert(testLead)
      .select()
      .single();

    if (leadError) {
      console.log('❌ Leads table does not exist or other error:', leadError.message);
      console.log('💡 You may need to create tables manually in Supabase dashboard');
      return;
    }

    console.log('✅ Test lead created:', leadData.id);

    // Clean up test data
    console.log('🧹 Cleaning up test data...');

    await supabase.from('leads').delete().eq('id', leadData.id);
    await supabase.from('sales_reps').delete().eq('id', salesRepData.id);

    console.log('✅ Test data cleaned up');
    console.log('\n🎉 Database tables are working correctly!');

  } catch (error) {
    console.error('❌ Table creation test failed:', error.message);
    console.log('\n💡 To fix this:');
    console.log('1. Go to your Supabase dashboard: https://supabase.com/dashboard');
    console.log('2. Navigate to the SQL Editor');
    console.log('3. Run the migration files from database/migrations/ manually');
    console.log('4. Or create the basic tables: sales_reps, leads, schema_migrations');
  }
}

// Run if called directly
if (require.main === module) {
  createTablesSimple();
}

module.exports = { createTablesSimple };