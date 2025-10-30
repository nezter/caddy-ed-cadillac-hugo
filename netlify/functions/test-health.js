// Load environment variables
require('dotenv').config({ path: '/home/nez/Projects/caddy-ed-cadillac-hugo/.env.local' });
console.log('JWT_SECRET:', process.env.JWT_SECRET ? 'found' : 'missing');
console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? 'found' : 'missing');

const healthCheck = require('./health-check.js');

// Test health check
healthCheck.handler({httpMethod: 'GET'}, {}, (err, res) => {
  if (err) {
    console.error('Error:', err);
  } else {
    console.log('✅ Health check status:', res.statusCode);
    console.log('Response body:', res.body);
  }
});