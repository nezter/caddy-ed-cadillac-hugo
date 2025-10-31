#!/usr/bin/env node

/**
 * Test Remote Service Connections
 * Validates that remote services are accessible before deployment
 */

require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

console.log('🔗 Testing Remote Service Connections\n');

// Test Supabase connection
async function testSupabaseConnection() {
  console.log('📊 Testing Supabase Database Connection...');
  
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    // Test basic connection with a simple query
    const { data, error } = await supabase
      .from('sales_reps')
      .select('count')
      .limit(1);
    
    if (error) {
      console.log('  ❌ Supabase connection failed:', error.message);
      console.log('  💡 Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
      return false;
    }
    
    console.log('  ✅ Supabase connection successful!');
    console.log('  📊 Database is accessible');
    return true;
    
  } catch (error) {
    console.log('  ❌ Supabase connection failed:', error.message);
    console.log('  💡 Check environment variables and network connection');
    return false;
  }
}

// Test JWT configuration
function testJWTConfiguration() {
  console.log('\n🔐 Testing JWT Configuration...');
  
  const jwtSecret = process.env.JWT_SECRET;
  
  if (!jwtSecret) {
    console.log('  ❌ JWT_SECRET not set');
    console.log('  💡 Set a strong JWT secret in environment variables');
    return false;
  }
  
  if (jwtSecret.length < 20) {
    console.log('  ⚠️  JWT_SECRET should be at least 20 characters');
    console.log('  💡 Use: openssl rand -base64 32');
    return false;
  }
  
  if (jwtSecret.includes('test') || jwtSecret.includes('example')) {
    console.log('  ⚠️  JWT_SECRET appears to be a placeholder value');
    console.log('  💡 Update with a strong, random secret for production');
    return false;
  }
  
  console.log('  ✅ JWT_SECRET is properly configured');
  console.log('  🔐 Length:', jwtSecret.length, 'characters');
  return true;
}

// Test email configuration
function testEmailConfiguration() {
  console.log('\n📧 Testing Email Configuration...');
  
  const required = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.log('  ⚠️  Email configuration incomplete');
    console.log('  💡 Missing:', missing.join(', '));
    console.log('  💡 Email will not work without SMTP configuration');
    return false;
  }
  
  console.log('  ✅ Email configuration found');
  console.log('  📧 SMTP Host:', process.env.SMTP_HOST);
  console.log('  👤 SMTP User:', process.env.SMTP_USER);
  return true;
}

// Test environment variables
function testEnvironmentVariables() {
  console.log('\n🔧 Testing Environment Variables...');
  
  const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.log('  ❌ Missing required environment variables');
    console.log('  💡 Missing:', missing.join(', '));
    return false;
  }
  
  // Check for placeholder values
  const placeholders = required.filter(key => {
    const value = process.env[key];
    return value.includes('test') || value.includes('example') || value.includes('your-');
  });
  
  if (placeholders.length > 0) {
    console.log('  ⚠️  Some environment variables have placeholder values');
    console.log('  💡 Update these with real production values:', placeholders.join(', '));
    return false;
  }
  
  console.log('  ✅ All required environment variables are set');
  console.log('  🔧 Environment:', process.env.NODE_ENV || 'development');
  return true;
}

// Main test function
async function runTests() {
  console.log('🧪 Remote Service Connection Tests');
  console.log('='.repeat(50));
  
  const results = {
    environment: testEnvironmentVariables(),
    jwt: testJWTConfiguration(),
    supabase: await testSupabaseConnection(),
    email: testEmailConfiguration()
  };
  
  console.log('\n' + '='.repeat(50));
  console.log('📊 TEST RESULTS SUMMARY');
  console.log('='.repeat(50));
  
  const passed = Object.values(results).filter(r => r).length;
  const total = Object.keys(results).length;
  
  Object.entries(results).forEach(([service, passed]) => {
    const icon = passed ? '✅' : '❌';
    const serviceName = service.charAt(0).toUpperCase() + service.slice(1);
    console.log(`${icon} ${serviceName}`);
  });
  
  console.log('='.repeat(50));
  console.log(`🎯 Overall: ${passed}/${total} services configured`);
  
  if (passed === total) {
    console.log('🎉 All services are properly configured!');
    console.log('🚀 Your Netlify deployment should work correctly.');
  } else {
    console.log('⚠️  Some services need configuration.');
    console.log('📝 See PRODUCTION_SETUP_GUIDE.md for setup instructions.');
    console.log('');
    console.log('❌ Deploying now will result in connection failures.');
    console.log('💡 Please configure the missing services before deploying.');
  }
  
  console.log('='.repeat(50));
  
  return passed === total;
}

// Run tests
runTests().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('❌ Test execution failed:', error.message);
  process.exit(1);
});
