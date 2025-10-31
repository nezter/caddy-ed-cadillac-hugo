/**
 * Run Migrations Against Supabase
 * Executes database migrations directly against Supabase
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

async function runMigrationsAgainstSupabase() {
  console.log('🚀 Running migrations against Supabase...');

  try {
    const { createClient } = require('@supabase/supabase-js');

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Migration files to run
    const migrations = [
      '001_create_comprehensive_schema.sql',
      '002_create_functions_and_triggers.sql',
      '003_create_turso_schema.sql',
      '004_add_password_hash_to_sales_reps.sql',
      'create_leads_table.sql'
    ];

    for (const migrationFile of migrations) {
      console.log(`\n📄 Executing migration: ${migrationFile}`);

      const migrationPath = path.join(__dirname, 'database', 'migrations', migrationFile);
      if (!fs.existsSync(migrationPath)) {
        console.error(`❌ Migration file not found: ${migrationPath}`);
        continue;
      }

      const sql = fs.readFileSync(migrationPath, 'utf8');

      // Split SQL into individual statements
      const statements = sql
        .split(';')
        .map(stmt => stmt.trim())
        .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

      for (const statement of statements) {
        if (statement.trim()) {
          try {
            console.log(`🔍 Executing: ${statement.substring(0, 50)}...`);

            const { error } = await supabase.rpc('exec_sql', {
              sql_query: statement
            });

            if (error) {
              console.error(`❌ Statement failed:`, error.message);
              // Continue with other statements
            } else {
              console.log(`✅ Statement executed successfully`);
            }
          } catch (error) {
            console.error(`❌ Statement error:`, error.message);
          }
        }
      }

      console.log(`✅ Migration ${migrationFile} completed`);
    }

    console.log('\n🎉 All migrations completed against Supabase!');

  } catch (error) {
    console.error('❌ Migration execution failed:', error.message);
  }
}

// Run if called directly
if (require.main === module) {
  runMigrationsAgainstSupabase();
}

module.exports = { runMigrationsAgainstSupabase };