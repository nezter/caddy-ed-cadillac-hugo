#!/usr/bin/env node

/**
 * Generate Test JWT Tokens
 * Creates JWT tokens for testing API authentication
 */

require('dotenv').config();
const jwt = require('jsonwebtoken');

const users = [
  {
    id: '1',
    email: 'ed@caddyed.com',
    role: 'admin',
    permissions: ['campaigns_read', 'campaigns_write', 'leads_read', 'leads_write', 'analytics_read']
  },
  {
    id: '2',
    email: 'sarah@caddyed.com',
    role: 'sales_representative',
    permissions: ['leads_read', 'leads_write', 'campaigns_read']
  },
  {
    id: '3',
    email: 'manager@caddyed.com',
    role: 'manager',
    permissions: ['campaigns_read', 'campaigns_write', 'leads_read', 'leads_write', 'team_management']
  }
];

function generateTestTokens() {
  console.log('🔐 Generating Test JWT Tokens\n');
  
  if (!process.env.JWT_SECRET) {
    console.error('❌ JWT_SECRET not found in environment variables');
    process.exit(1);
  }
  
  const tokens = [];
  
  users.forEach(user => {
    const token = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        permissions: user.permissions,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
      },
      process.env.JWT_SECRET,
      { algorithm: 'HS256' }
    );
    
    tokens.push({
      user: user,
      token: token,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log(`✅ Generated token for ${user.email} (${user.role})`);
  });
  
  // Save tokens to file for testing
  const fs = require('fs');
  const path = require('path');
  
  fs.writeFileSync(
    path.join(__dirname, '../test-data/test-tokens.json'),
    JSON.stringify(tokens, null, 2)
  );
  
  console.log('\n📁 Tokens saved to: test-data/test-tokens.json');
  console.log('\n📋 Token Usage Examples:');
  
  tokens.forEach((tokenInfo, index) => {
    console.log(`\n${index + 1}. ${tokenInfo.user.email} (${tokenInfo.user.role}):`);
    console.log(`   Authorization: Bearer ${tokenInfo.token.substring(0, 50)}...`);
    console.log(`   Permissions: ${tokenInfo.user.permissions.join(', ')}`);
  });
  
  console.log('\n🧪 You can now use these tokens to test authenticated API endpoints!');
  
  return tokens;
}

// Generate tokens
const tokens = generateTestTokens();

// Export for use in other scripts
module.exports = { tokens, users };
