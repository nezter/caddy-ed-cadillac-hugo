/**
 * Create Database Tables Manually
 * Uses Supabase client to create tables directly
 */

require('dotenv').config();

async function createTablesManually() {
  console.log('🏗️ Creating database tables manually...');

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

    if (testError && testError.message.includes('relation "public.sales_reps" does not exist')) {
      console.log('📋 Tables do not exist, creating them...');

      // Create sales_reps table
      console.log('👥 Creating sales_reps table...');
      const { error: createError } = await supabase.rpc('exec_sql', {
        sql_query: `
          CREATE TABLE IF NOT EXISTS sales_reps (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            first_name VARCHAR(100) NOT NULL,
            last_name VARCHAR(100) NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            phone VARCHAR(20),
            password_hash VARCHAR(255),
            role VARCHAR(50) DEFAULT 'sales_representative',
            status VARCHAR(20) DEFAULT 'active',
            permissions TEXT[] DEFAULT ARRAY['view_customers', 'manage_leads'],
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            last_login TIMESTAMP WITH TIME ZONE
          )
        `
      });

      if (createError) {
        console.log('⚠️ RPC method not available, tables need to be created manually in Supabase dashboard');
        console.log('📋 Please go to https://supabase.com/dashboard/project/YOUR_PROJECT/sql');
        console.log('📄 And run the SQL from database/migrations/001_create_comprehensive_schema.sql');
        return false;
      } else {
        console.log('✅ sales_reps table created');
      }

      // Create leads table
      console.log('📋 Creating leads table...');
      const { error: leadsError } = await supabase.rpc('exec_sql', {
        sql_query: `
          CREATE TABLE IF NOT EXISTS leads (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            first_name VARCHAR(100),
            last_name VARCHAR(100),
            email VARCHAR(255),
            phone VARCHAR(20),
            normalized_email VARCHAR(255),
            normalized_phone VARCHAR(20),
            normalized_name VARCHAR(255),
            lead_source VARCHAR(50) DEFAULT 'website',
            status VARCHAR(20) DEFAULT 'new',
            priority_score INTEGER DEFAULT 0,
            assigned_sales_rep_id UUID,
            vehicle_interest TEXT,
            message TEXT,
            notes TEXT,
            next_follow_up_date TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          )
        `
      });

      if (leadsError) {
        console.log('⚠️ Leads table creation failed, but continuing...');
      } else {
        console.log('✅ leads table created');
      }

    } else if (!testError) {
      console.log('✅ Tables already exist!');
      return true;
    } else {
      console.error('❌ Connection test failed:', testError.message);
      return false;
    }

    return true;

  } catch (error) {
    console.error('❌ Table creation failed:', error.message);
    console.log('\n📋 MANUAL STEP REQUIRED:');
    console.log('1. Go to https://supabase.com/dashboard');
    console.log('2. Select your project');
    console.log('3. Go to SQL Editor');
    console.log('4. Run the SQL from database/migrations/001_create_comprehensive_schema.sql');
    return false;
  }
}

// Run if called directly
if (require.main === module) {
  createTablesManually().then(success => {
    if (success) {
      console.log('\n🎉 Database setup complete!');
    } else {
      console.log('\n⚠️ Manual table creation required.');
    }
  });
}

module.exports = { createTablesManually };