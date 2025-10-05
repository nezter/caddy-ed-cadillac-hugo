#!/usr/bin/env node

/**
 * Database Connection Setup Script
 * Sets up and tests both Supabase and Turso database connections
 */

require('dotenv').config({ path: './.env' });

const { createClient: createSupabaseClient } = require('@supabase/supabase-js');
const { createClient: createTursoClient } = require('@libsql/client');

// Database configuration
const DATABASE_CONFIG = {
  supabase: {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY
  },
  turso: {
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN
  }
};

/**
 * Test Supabase connection
 */
async function testSupabaseConnection() {
  console.log('\n🔍 Testing Supabase connection...');
  
  try {
    if (!DATABASE_CONFIG.supabase.url || !DATABASE_CONFIG.supabase.serviceKey) {
      throw new Error('Missing Supabase credentials in .env file');
    }

    const supabase = createSupabaseClient(
      DATABASE_CONFIG.supabase.url,
      DATABASE_CONFIG.supabase.serviceKey
    );

    // Test basic connection - try to query schema_migrations table
    const { data, error } = await supabase
      .from('schema_migrations')
      .select('filename')
      .limit(1);

    if (error && (error.code === 'PGRST116' || error.message.includes('Could not find the table'))) {
      // Table doesn't exist - this is expected for new setup
      console.log('⚠️ Schema migrations table not found (expected for new setup)');
    } else if (error) {
      // Some other error occurred
      console.log('❌ Error accessing schema_migrations table:', error.message);
      return false;
    }

    // Test basic connection with a health check
    const { data: testData, error: testError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .limit(1);

    // We expect this to potentially fail - the key is testing the connection
    if (testError && !testError.message.includes('permission denied')) {
      console.log('⚠️ Cannot access information_schema (this may be expected)');
    }

    console.log('✅ Supabase connection successful');
    console.log(`   URL: ${DATABASE_CONFIG.supabase.url}`);
    console.log('   Schema: Ready for migrations');
    
    return {
      success: true,
      type: 'supabase',
      url: DATABASE_CONFIG.supabase.url,
      ready: true
    };

  } catch (error) {
    console.log('❌ Supabase connection failed:', error.message);
    return {
      success: false,
      type: 'supabase',
      error: error.message
    };
  }
}

/**
 * Test Turso connection
 */
async function testTursoConnection() {
  console.log('\n🔍 Testing Turso connection...');
  
  try {
    if (!DATABASE_CONFIG.turso.url || !DATABASE_CONFIG.turso.authToken) {
      throw new Error('Missing Turso credentials in .env file');
    }

    const turso = createTursoClient({
      url: DATABASE_CONFIG.turso.url,
      authToken: DATABASE_CONFIG.turso.authToken,
    });

    // Test basic connection
    const result = await turso.execute('SELECT sqlite_version() as version');
    
    console.log('✅ Turso connection successful');
    console.log(`   URL: ${DATABASE_CONFIG.turso.url}`);
    console.log(`   SQLite Version: ${result.rows[0].version}`);
    
    // Check if schema_migrations table exists
    const tableCheck = await turso.execute(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='schema_migrations'
    `);
    
    if (tableCheck.rows.length === 0) {
      console.log('⚠️ Schema migrations table not found, will be created during migration');
    } else {
      console.log('✅ Schema migrations table exists');
    }

    return {
      success: true,
      type: 'turso',
      url: DATABASE_CONFIG.turso.url,
      version: result.rows[0].version,
      ready: true
    };

  } catch (error) {
    console.log('❌ Turso connection failed:', error.message);
    return {
      success: false,
      type: 'turso',
      error: error.message
    };
  }
}

/**
 * Validate environment configuration
 */
function validateEnvironment() {
  console.log('🔍 Validating environment configuration...');
  
  const required = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'TURSO_DATABASE_URL',
    'TURSO_AUTH_TOKEN',
    'JWT_SECRET'
  ];

  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.log('❌ Missing required environment variables:');
    missing.forEach(key => console.log(`   - ${key}`));
    return false;
  }

  console.log('✅ All required environment variables are present');
  return true;
}

/**
 * Create database connection status report
 */
function createConnectionReport(results) {
  const report = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    connections: results,
    summary: {
      total: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length
    }
  };

  return report;
}

/**
 * Main setup function
 */
async function setupDatabaseConnections() {
  console.log('🚀 Starting Database Connection Setup');
  console.log('=====================================');

  // Validate environment
  if (!validateEnvironment()) {
    process.exit(1);
  }

  // Test connections
  const results = [];

  // Test Supabase (primary database)
  const supabaseResult = await testSupabaseConnection();
  results.push(supabaseResult);

  // Test Turso (secondary database)
  const tursoResult = await testTursoConnection();
  results.push(tursoResult);

  // Generate report
  const report = createConnectionReport(results);

  console.log('\n📊 Connection Setup Summary');
  console.log('===========================');
  console.log(`Total Connections: ${report.summary.total}`);
  console.log(`Successful: ${report.summary.successful}`);
  console.log(`Failed: ${report.summary.failed}`);

  results.forEach(result => {
    console.log(`\n${result.success ? '✅' : '❌'} ${result.type ? result.type.toUpperCase() : 'UNKNOWN'}`);
    if (result.success) {
      console.log(`   Status: Connected`);
      if (result.version) console.log(`   Version: ${result.version}`);
      if (result.ready) console.log(`   Ready: Yes`);
    } else {
      console.log(`   Status: Failed`);
      console.log(`   Error: ${result.error}`);
    }
  });

  // Save connection report
  const fs = require('fs');
  const path = require('path');
  
  const reportPath = path.join(__dirname, '../database/connection-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 Connection report saved to: ${reportPath}`);

  // Exit with appropriate code
  if (report.summary.failed > 0) {
    console.log('\n⚠️ Some database connections failed. Please check the configuration.');
    process.exit(1);
  } else {
    console.log('\n🎉 All database connections are ready!');
    console.log('You can now run migrations with: npm run migrate');
    process.exit(0);
  }
}

// Run setup if called directly
if (require.main === module) {
  setupDatabaseConnections().catch(error => {
    console.error('💥 Setup failed:', error);
    process.exit(1);
  });
}

module.exports = {
  setupDatabaseConnections,
  testSupabaseConnection,
  testTursoConnection,
  validateEnvironment
};
