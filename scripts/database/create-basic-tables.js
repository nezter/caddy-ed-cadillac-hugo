/**
 * Create Basic Database Tables
 * Creates essential tables for testing using Supabase client
 */

require('dotenv').config();

async function createBasicTables() {
  console.log('🏗️ Creating basic database tables...');

  try {
    const { createClient } = require('@supabase/supabase-js');

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Create sales_reps table
    console.log('👥 Creating sales_reps table...');
    const { error: salesRepsError } = await supabase.rpc('exec_sql', {
      sql_query: `
        CREATE TABLE IF NOT EXISTS sales_reps (
          id SERIAL PRIMARY KEY,
          first_name VARCHAR(100) NOT NULL,
          last_name VARCHAR(100) NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          phone VARCHAR(20),
          password_hash VARCHAR(255),
          role VARCHAR(50) DEFAULT 'sales_representative',
          status VARCHAR(20) DEFAULT 'active',
          permissions JSONB DEFAULT '["view_customers", "manage_leads"]',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          last_login TIMESTAMP WITH TIME ZONE
        )
      `
    });

    if (salesRepsError) {
      console.error('❌ Failed to create sales_reps table:', salesRepsError.message);
    } else {
      console.log('✅ sales_reps table created');
    }

    // Create leads table
    console.log('📋 Creating leads table...');
    const { error: leadsError } = await supabase.rpc('exec_sql', {
      sql_query: `
        CREATE TABLE IF NOT EXISTS leads (
          id SERIAL PRIMARY KEY,
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
          assigned_sales_rep_id INTEGER REFERENCES sales_reps(id),
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
      console.error('❌ Failed to create leads table:', leadsError.message);
    } else {
      console.log('✅ leads table created');
    }

    // Create schema_migrations table
    console.log('📊 Creating schema_migrations table...');
    const { error: migrationsError } = await supabase.rpc('exec_sql', {
      sql_query: `
        CREATE TABLE IF NOT EXISTS schema_migrations (
          id SERIAL PRIMARY KEY,
          filename VARCHAR(255) UNIQUE NOT NULL,
          checksum VARCHAR(255),
          executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `
    });

    if (migrationsError) {
      console.error('❌ Failed to create schema_migrations table:', migrationsError.message);
    } else {
      console.log('✅ schema_migrations table created');
    }

    console.log('\n🎉 Basic tables created successfully!');

  } catch (error) {
    console.error('❌ Table creation failed:', error.message);
  }
}

// Run if called directly
if (require.main === module) {
  createBasicTables();
}

module.exports = { createBasicTables };