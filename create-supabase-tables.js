/**
 * Create Supabase Tables Script
 * Automatically creates database tables and inserts test data
 */

require('dotenv').config();

async function createSupabaseTables() {
  console.log('🔧 Creating Supabase database tables...');

  try {
    const { createClient } = require('@supabase/supabase-js');

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    console.log('📡 Connected to Supabase...');

    // Enable required extensions
    console.log('🔌 Enabling PostgreSQL extensions...');
    const { error: extError } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
        CREATE EXTENSION IF NOT EXISTS "pg_trgm";
      `
    });

    if (extError) {
      console.warn('⚠️ Extension creation may have failed (this is normal in Supabase):', extError.message);
    }

    // Create sales_reps table
    console.log('👥 Creating sales_reps table...');
    const { error: salesRepsError } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS sales_reps (
          id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
          first_name VARCHAR(100) NOT NULL,
          last_name VARCHAR(100) NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          phone VARCHAR(20),
          password_hash VARCHAR(255),
          role VARCHAR(50) DEFAULT 'sales_representative',
          status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'on_leave', 'terminated')),
          permissions TEXT[] DEFAULT ARRAY['view_customers', 'manage_leads'],
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          last_login TIMESTAMP WITH TIME ZONE
        );
      `
    });

    if (salesRepsError) {
      console.error('❌ Failed to create sales_reps table:', salesRepsError.message);
      return false;
    }

    // Create leads table
    console.log('📋 Creating leads table...');
    const { error: leadsError } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS leads (
          id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
          first_name VARCHAR(100),
          last_name VARCHAR(100),
          email VARCHAR(255),
          phone VARCHAR(20),
          normalized_email VARCHAR(255),
          normalized_phone VARCHAR(20),
          normalized_name VARCHAR(255),
          lead_source VARCHAR(50) DEFAULT 'website',
          status VARCHAR(20) DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'converted', 'lost', 'duplicate')),
          priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
          score INTEGER DEFAULT 0,
          assigned_sales_rep_id UUID,
          vehicle_interest TEXT,
          message TEXT,
          notes TEXT,
          next_follow_up_date TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `
    });

    if (leadsError) {
      console.error('❌ Failed to create leads table:', leadsError.message);
      return false;
    }

    // Create indexes
    console.log('⚡ Creating performance indexes...');
    const { error: indexError } = await supabase.rpc('exec_sql', {
      sql: `
        -- Sales reps indexes
        CREATE INDEX IF NOT EXISTS idx_sales_reps_email ON sales_reps(email);
        CREATE INDEX IF NOT EXISTS idx_sales_reps_status ON sales_reps(status);

        -- Leads indexes
        CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(normalized_email);
        CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(normalized_phone);
        CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
        CREATE INDEX IF NOT EXISTS idx_leads_assigned_rep ON leads(assigned_sales_rep_id);
        CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);
      `
    });

    if (indexError) {
      console.warn('⚠️ Index creation may have failed:', indexError.message);
    }

    // Insert test sales reps
    console.log('👤 Inserting test sales representatives...');
    const testSalesReps = [
      {
        first_name: 'John',
        last_name: 'Smith',
        email: 'john.smith@cadillacofsouthcharlotte.com',
        phone: '(704) 555-0101',
        role: 'sales_representative',
        status: 'active',
        permissions: ['view_customers', 'manage_leads', 'create_appointments']
      },
      {
        first_name: 'Sarah',
        last_name: 'Johnson',
        email: 'sarah.johnson@cadillacofsouthcharlotte.com',
        phone: '(704) 555-0102',
        role: 'sales_representative',
        status: 'active',
        permissions: ['view_customers', 'manage_leads', 'create_appointments']
      },
      {
        first_name: 'Mike',
        last_name: 'Davis',
        email: 'mike.davis@cadillacofsouthcharlotte.com',
        phone: '(704) 555-0103',
        role: 'sales_manager',
        status: 'active',
        permissions: ['view_customers', 'manage_leads', 'create_appointments', 'manage_team', 'view_reports']
      },
      {
        first_name: 'Lisa',
        last_name: 'Brown',
        email: 'lisa.brown@cadillacofsouthcharlotte.com',
        phone: '(704) 555-0104',
        role: 'sales_representative',
        status: 'active',
        permissions: ['view_customers', 'manage_leads', 'create_appointments']
      }
    ];

    const { data: insertedReps, error: insertError } = await supabase
      .from('sales_reps')
      .upsert(testSalesReps, { onConflict: 'email' })
      .select();

    if (insertError) {
      console.error('❌ Failed to insert test sales reps:', insertError.message);
      return false;
    }

    console.log(`✅ Successfully inserted ${insertedReps.length} test sales representatives`);

    // Verify tables exist
    console.log('🔍 Verifying table creation...');
    const { data: salesRepsCount, error: countError } = await supabase
      .from('sales_reps')
      .select('count', { count: 'exact', head: true });

    if (countError) {
      console.error('❌ Failed to verify sales_reps table:', countError.message);
      return false;
    }

    console.log(`✅ Tables created successfully! Sales reps count: ${salesRepsCount}`);

    return true;

  } catch (error) {
    console.error('❌ Database setup failed:', error.message);
    return false;
  }
}

// Alternative approach using direct SQL execution
async function createTablesWithDirectSQL() {
  console.log('🔧 Attempting direct SQL table creation...');

  try {
    const { createClient } = require('@supabase/supabase-js');

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Try direct table creation using Supabase's SQL execution
    const createTablesSQL = `
      -- Enable extensions (may not work in all Supabase plans)
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      CREATE EXTENSION IF NOT EXISTS "pg_trgm";

      -- Sales reps table
      CREATE TABLE IF NOT EXISTS sales_reps (
        id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        phone VARCHAR(20),
        password_hash VARCHAR(255),
        role VARCHAR(50) DEFAULT 'sales_representative',
        status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'on_leave', 'terminated')),
        permissions TEXT[] DEFAULT ARRAY['view_customers', 'manage_leads'],
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        last_login TIMESTAMP WITH TIME ZONE
      );

      -- Leads table
      CREATE TABLE IF NOT EXISTS leads (
        id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        email VARCHAR(255),
        phone VARCHAR(20),
        normalized_email VARCHAR(255),
        normalized_phone VARCHAR(20),
        normalized_name VARCHAR(255),
        lead_source VARCHAR(50) DEFAULT 'website',
        status VARCHAR(20) DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'converted', 'lost', 'duplicate')),
        priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
        score INTEGER DEFAULT 0,
        assigned_sales_rep_id UUID,
        vehicle_interest TEXT,
        message TEXT,
        notes TEXT,
        next_follow_up_date TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      -- Indexes
      CREATE INDEX IF NOT EXISTS idx_sales_reps_email ON sales_reps(email);
      CREATE INDEX IF NOT EXISTS idx_sales_reps_status ON sales_reps(status);
      CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(normalized_email);
      CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(normalized_phone);
      CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
      CREATE INDEX IF NOT EXISTS idx_leads_assigned_rep ON leads(assigned_sales_rep_id);
      CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);
    `;

    // Note: This approach may not work due to Supabase restrictions
    // We'll fall back to manual creation if this fails
    console.log('⚠️ Direct SQL execution may be restricted in Supabase');
    console.log('📋 Please use the manual approach in SUPABASE_TABLE_CREATION_GUIDE.md');

    return false;

  } catch (error) {
    console.error('❌ Direct SQL approach failed:', error.message);
    return false;
  }
}

// Run the script
if (require.main === module) {
  (async () => {
    console.log('🚀 Starting Supabase table creation...\n');

    // Try the programmatic approach first
    const success = await createSupabaseTables();

    if (success) {
      console.log('\n🎉 Database tables created successfully!');
      console.log('✅ Ready to proceed with testing.');
    } else {
      console.log('\n⚠️ Programmatic table creation failed.');
      console.log('📋 Please create tables manually using SUPABASE_TABLE_CREATION_GUIDE.md');
      console.log('   Then run: node test-database-connection.js');
    }
  })();
}

module.exports = {
  createSupabaseTables,
  createTablesWithDirectSQL
};