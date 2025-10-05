#!/usr/bin/env node

/**
 * Turso Migration Runner
 * Executes SQLite migrations for Turso database
 */

const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config();

const MIGRATIONS_DIR = path.join(__dirname, '../database/migrations');
const TURSO_MIGRATION_PREFIX = '003_create_turso_schema.sql';

async function initializeTurso() {
  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    console.error('❌ Turso configuration missing in .env file');
    console.error('Required: TURSO_DATABASE_URL and TURSO_AUTH_TOKEN');
    console.error('Run: npm run setup:turso');
    process.exit(1);
  }

  try {
    const { createClient } = require('@libsql/client');
    const turso = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });

    // Test connection
    await turso.execute('SELECT 1');
    console.log('✅ Connected to Turso database');
    return turso;
  } catch (error) {
    console.error('❌ Failed to connect to Turso:', error.message);
    process.exit(1);
  }
}

async function runTursoMigrations() {
  console.log('🚀 Running Turso migrations...\n');

  const turso = await initializeTurso();

  try {
    // Check if Turso schema already exists
    const checkResult = await turso.execute(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='customers'
    `);

    if (checkResult.rows.length > 0) {
      console.log('ℹ️ Turso schema already exists');
      return;
    }

    // Read Turso migration file
    const migrationFile = path.join(MIGRATIONS_DIR, TURSO_MIGRATION_PREFIX);
    if (!fs.existsSync(migrationFile)) {
      console.error(`❌ Migration file not found: ${migrationFile}`);
      process.exit(1);
    }

    const migrationSQL = fs.readFileSync(migrationFile, 'utf8');
    console.log('📄 Loaded Turso migration file');

    // Split into individual statements
    const statements = migrationSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

    console.log(`📋 Executing ${statements.length} SQL statements...`);

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.trim()) {
        try {
          console.log(`🔄 Executing statement ${i + 1}/${statements.length}...`);
          await turso.execute(statement + ';');
        } catch (error) {
          // Some statements might fail if tables already exist, continue
          if (error.message.includes('already exists')) {
            console.log(`⚠️ Statement ${i + 1} skipped (table already exists)`);
          } else {
            throw error;
          }
        }
      }
    }

    // Verify schema creation
    const verifyResult = await turso.execute(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name IN ('customers', 'leads', 'dashboard_metrics')
      ORDER BY name
    `);

    console.log('✅ Turso schema created successfully!');
    console.log('📊 Created tables:', verifyResult.rows.map(r => r.name).join(', '));

    // Test FTS functionality
    console.log('🔍 Testing full-text search...');
    await turso.execute(`
      INSERT OR IGNORE INTO customers (id, first_name, last_name, email)
      VALUES ('test-1', 'John', 'Doe', 'john.doe@test.com')
    `);

    const ftsResult = await turso.execute(`
      SELECT c.* FROM customers_fts cf
      JOIN customers c ON cf.rowid = c.rowid
      WHERE customers_fts MATCH 'John'
    `);

    if (ftsResult.rows.length > 0) {
      console.log('✅ Full-text search working');
    } else {
      console.log('⚠️ Full-text search may need additional setup');
    }

  } catch (error) {
    console.error('❌ Turso migration failed:', error.message);
    throw error;
  } finally {
    // Close connection
    await turso.close();
  }
}

// Run if called directly
if (require.main === module) {
  runTursoMigrations().catch(error => {
    console.error('💥 Migration failed:', error);
    process.exit(1);
  });
}

module.exports = { runTursoMigrations };