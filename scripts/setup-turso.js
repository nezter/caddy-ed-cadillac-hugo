#!/usr/bin/env node

/**
 * Turso Database Setup Script
 * Sets up Turso database for hybrid architecture
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ENV_FILE = path.join(__dirname, '..', '.env');

function runCommand(command, description) {
  console.log(`🔧 ${description}...`);
  try {
    const result = execSync(command, { encoding: 'utf8' });
    console.log(`✅ ${description} completed`);
    return result;
  } catch (error) {
    console.error(`❌ ${description} failed:`, error.message);
    throw error;
  }
}

function checkTursoCLI() {
  try {
    execSync('turso --version', { stdio: 'ignore' });
    return true;
  } catch (error) {
    return false;
  }
}

function installTursoCLI() {
  console.log('📦 Installing Turso CLI...');

  const platform = process.platform;
  let installCommand;

  if (platform === 'darwin') {
    installCommand = 'brew install tursodatabase/tap/turso';
  } else if (platform === 'linux') {
    installCommand = 'curl -sSfL https://get.tur.so/install.sh | bash';
  } else if (platform === 'win32') {
    console.log('⚠️  Windows installation not supported via script');
    console.log('   Please install Turso CLI manually: https://docs.turso.tech/reference/turso-cli');
    return false;
  } else {
    console.log(`⚠️  Unsupported platform: ${platform}`);
    console.log('   Please install Turso CLI manually: https://docs.turso.tech/reference/turso-cli');
    return false;
  }

  try {
    runCommand(installCommand, 'Installing Turso CLI');
    return true;
  } catch (error) {
    console.log('⚠️  Automatic installation failed');
    console.log('   Please install Turso CLI manually: https://docs.turso.tech/reference/turso-cli');
    return false;
  }
}

async function setupTursoDatabase() {
  console.log('🚀 Setting up Turso Database for Hybrid Architecture\n');

  // Check if Turso CLI is installed
  if (!checkTursoCLI()) {
    console.log('📦 Turso CLI not found');
    if (!installTursoCLI()) {
      console.log('❌ Turso CLI installation failed or cancelled');
      console.log('💡 You can continue with Supabase-only setup for now');
      return;
    }
  }

  try {
    // Login to Turso (user will need to authenticate)
    console.log('🔐 Logging into Turso...');
    console.log('   A browser window will open for authentication');
    runCommand('turso auth login', 'Authenticating with Turso');

    // Create database
    const dbName = 'cadillac-dealership';
    console.log(`📊 Creating Turso database: ${dbName}`);
    runCommand(`turso db create ${dbName}`, `Creating database ${dbName}`);

    // Get database URL
    console.log('🔗 Getting database connection details...');
    const dbUrl = runCommand(`turso db show ${dbName} --url`, 'Getting database URL').trim();
    const authToken = runCommand(`turso db tokens create ${dbName}`, 'Creating auth token').trim();

    // Update .env file
    console.log('📝 Updating environment configuration...');

    let envContent = fs.readFileSync(ENV_FILE, 'utf8');

    // Update Turso configuration
    envContent = envContent.replace(
      /TURSO_DATABASE_URL=.*/,
      `TURSO_DATABASE_URL=${dbUrl}`
    );
    envContent = envContent.replace(
      /TURSO_AUTH_TOKEN=.*/,
      `TURSO_AUTH_TOKEN=${authToken}`
    );

    fs.writeFileSync(ENV_FILE, envContent);

    console.log('✅ Turso database setup completed!');
    console.log(`📊 Database: ${dbName}`);
    console.log(`🔗 URL: ${dbUrl}`);
    console.log('\n📋 NEXT STEPS:');
    console.log('1. Run Turso schema migrations');
    console.log('2. Update DatabaseService to use hybrid architecture');
    console.log('3. Test database connections');

  } catch (error) {
    console.error('❌ Turso setup failed:', error.message);
    console.log('\n💡 You can continue with Supabase-only setup');
    console.log('   Run: npm run setup  (to configure Supabase only)');
  }
}

// Run setup if called directly
if (require.main === module) {
  setupTursoDatabase().catch(error => {
    console.error('💥 Setup failed:', error);
    process.exit(1);
  });
}

module.exports = { setupTursoDatabase };