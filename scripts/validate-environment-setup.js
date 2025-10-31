#!/usr/bin/env node

/**
 * Environment Setup Validation
 * Validates all required environment variables for Netlify deployment
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');

console.log('🔍 Validating Environment Setup for Netlify Deployment\n');

// Required environment variables for production
const requiredEnvVars = [
  {
    name: 'NODE_ENV',
    required: true,
    description: 'Environment (development/production)',
    example: 'production'
  },
  {
    name: 'JWT_SECRET',
    required: true,
    description: 'JWT signing secret for authentication',
    example: 'your-super-secure-jwt-secret-key'
  },
  {
    name: 'JWT_EXPIRES_IN',
    required: false,
    description: 'JWT token expiration time',
    example: '24h'
  }
];

// Database environment variables
const databaseEnvVars = [
  {
    name: 'SUPABASE_URL',
    required: true,
    description: 'Supabase project URL',
    example: 'https://your-project.supabase.co'
  },
  {
    name: 'SUPABASE_ANON_KEY',
    required: true,
    description: 'Supabase anonymous/public key',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
  },
  {
    name: 'SUPABASE_SERVICE_ROLE_KEY',
    required: true,
    description: 'Supabase service role key (admin access)',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
  }
];

// Optional but recommended environment variables
const optionalEnvVars = [
  {
    name: 'REDIS_URL',
    required: false,
    description: 'Redis connection URL for caching',
    example: 'redis://user:pass@host:port'
  },
  {
    name: 'SMTP_HOST',
    required: false,
    description: 'SMTP server for email sending',
    example: 'smtp.gmail.com'
  },
  {
    name: 'SMTP_PORT',
    required: false,
    description: 'SMTP server port',
    example: '587'
  },
  {
    name: 'SMTP_USER',
    required: false,
    description: 'SMTP username',
    example: 'your-email@gmail.com'
  },
  {
    name: 'SMTP_PASS',
    required: false,
    description: 'SMTP password',
    example: 'your-app-password'
  },
  {
    name: 'SITE_URL',
    required: false,
    description: 'Production site URL',
    example: 'https://your-site.netlify.app'
  },
  {
    name: 'ENABLE_CACHE',
    required: false,
    description: 'Enable caching features',
    example: 'true'
  },
  {
    name: 'ENABLE_RATE_LIMITING',
    required: false,
    description: 'Enable API rate limiting',
    example: 'true'
  },
  {
    name: 'ENABLE_ANALYTICS',
    required: false,
    description: 'Enable analytics tracking',
    example: 'true'
  },
  {
    name: 'LOG_LEVEL',
    required: false,
    description: 'Logging level (debug/info/warn/error)',
    example: 'info'
  }
];

function validateEnvVar(envVar) {
  const value = process.env[envVar.name];
  const isSet = value !== undefined && value !== '';
  
  if (envVar.required && !isSet) {
    return {
      name: envVar.name,
      status: '❌ MISSING',
      required: true,
      value: null,
      message: `Required: ${envVar.description}`
    };
  }
  
  if (!isSet) {
    return {
      name: envVar.name,
      status: '⚠️  NOT SET',
      required: false,
      value: null,
      message: `Optional: ${envVar.description}`
    };
  }
  
  // Check if it's a placeholder/test value
  if (value.includes('test') || value.includes('example') || value.includes('your-')) {
    return {
      name: envVar.name,
      status: '⚠️  PLACEHOLDER',
      required: envVar.required,
      value: maskValue(value),
      message: 'This appears to be a placeholder value - update for production'
    };
  }
  
  return {
    name: envVar.name,
    status: '✅ SET',
    required: envVar.required,
    value: maskValue(value),
    message: 'Environment variable is configured'
  };
}

function maskValue(value) {
  if (!value) return null;
  
  // Mask sensitive values
  if (value.includes('key') || value.includes('secret') || value.includes('pass')) {
    if (value.length > 10) {
      return value.substring(0, 6) + '...' + value.substring(value.length - 4);
    }
    return '***';
  }
  
  // Mask URLs
  if (value.startsWith('http')) {
    const url = new URL(value);
    return url.protocol + '//' + url.hostname + '/***';
  }
  
  // Show first part of long values
  if (value.length > 20) {
    return value.substring(0, 15) + '...';
  }
  
  return value;
}

function checkEnvironmentFiles() {
  console.log('📁 Checking Environment Files:');
  
  const files = [
    '.env',
    '.env.production', 
    '.env.local'
  ];
  
  files.forEach(file => {
    const exists = fs.existsSync(file);
    const status = exists ? '✅ EXISTS' : '❌ MISSING';
    console.log(`  ${status} ${file}`);
  });
  
  console.log('');
}

function validateServiceConnections() {
  console.log('🔗 Service Connection Requirements:');
  console.log('');
  
  console.log('📊 Database Services:');
  console.log('  • Supabase: PostgreSQL database with real-time features');
  console.log('  • Required: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY');
  console.log('');
  
  console.log('📧 Email Services:');
  console.log('  • SMTP: For sending follow-up emails and notifications');
  console.log('  • Required: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS');
  console.log('');
  
  console.log('🗄️  Cache Services (Optional):');
  console.log('  • Redis: For caching and session storage');
  console.log('  • Required: REDIS_URL');
  console.log('');
  
  console.log('🔐 Authentication:');
  console.log('  • JWT: For API authentication and user sessions');
  console.log('  • Required: JWT_SECRET (strong, random string)');
  console.log('');
}

function generateEnvironmentTemplate() {
  console.log('📝 Production Environment Template:');
  console.log('');
  console.log('# Production Environment Variables');
  console.log('NODE_ENV=production');
  console.log('');
  console.log('# JWT Configuration');
  console.log('JWT_SECRET=your-super-secure-jwt-secret-key-min-32-chars');
  console.log('JWT_EXPIRES_IN=24h');
  console.log('');
  console.log('# Supabase Database');
  console.log('SUPABASE_URL=https://your-project.supabase.co');
  console.log('SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...');
  console.log('SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...');
  console.log('');
  console.log('# Email Configuration');
  console.log('SMTP_HOST=smtp.gmail.com');
  console.log('SMTP_PORT=587');
  console.log('SMTP_USER=your-email@gmail.com');
  console.log('SMTP_PASS=your-app-password');
  console.log('');
  console.log('# Site Configuration');
  console.log('SITE_URL=https://your-site.netlify.app');
  console.log('');
  console.log('# Feature Flags');
  console.log('ENABLE_CACHE=true');
  console.log('ENABLE_RATE_LIMITING=true');
  console.log('ENABLE_ANALYTICS=true');
  console.log('');
  console.log('# Optional: Redis Cache');
  console.log('# REDIS_URL=redis://user:pass@host:port');
  console.log('');
}

function main() {
  console.log('🔍 Environment Validation for Cadillac CRM Netlify Deployment');
  console.log('='.repeat(65));
  console.log('');
  
  checkEnvironmentFiles();
  
  console.log('🔑 Required Environment Variables:');
  console.log('');
  
  const allVars = [...requiredEnvVars, ...databaseEnvVars, ...optionalEnvVars];
  const results = allVars.map(validateEnvVar);
  
  // Display results
  results.forEach(result => {
    console.log(`  ${result.status} ${result.name}`);
    if (result.value) {
      console.log(`      Value: ${result.value}`);
    }
    console.log(`      ${result.message}`);
    console.log('');
  });
  
  // Summary
  const missing = results.filter(r => r.status === '❌ MISSING');
  const placeholder = results.filter(r => r.status === '⚠️  PLACEHOLDER');
  const configured = results.filter(r => r.status === '✅ SET');
  
  console.log('='.repeat(65));
  console.log('📊 VALIDATION SUMMARY:');
  console.log('='.repeat(65));
  console.log(`✅ Configured: ${configured.length}`);
  console.log(`⚠️  Placeholders: ${placeholder.length}`);
  console.log(`❌ Missing: ${missing.length}`);
  console.log('');
  
  if (missing.length > 0) {
    console.log('❌ VALIDATION FAILED - Missing required variables');
    console.log('');
    console.log('Please set the following required environment variables:');
    missing.forEach(m => {
      console.log(`  • ${m.name}: ${m.message}`);
    });
    console.log('');
    validateServiceConnections();
    generateEnvironmentTemplate();
    return false;
  }
  
  if (placeholder.length > 0) {
    console.log('⚠️  VALIDATION WARNING - Placeholder values detected');
    console.log('');
    console.log('Update the following variables for production:');
    placeholder.forEach(p => {
      console.log(`  • ${p.name}: Currently set to placeholder value`);
    });
    console.log('');
    validateServiceConnections();
    generateEnvironmentTemplate();
    return false;
  }
  
  console.log('✅ VALIDATION PASSED - Environment is properly configured');
  console.log('');
  validateServiceConnections();
  console.log('');
  console.log('🚀 Your Netlify deployment should work with remote services!');
  console.log('');
  
  return true;
}

// Run validation
const isValid = main();
process.exit(isValid ? 0 : 1);
