/**
 * Simplified Jest Configuration for Basic Testing
 */

module.exports = {
  // Test environment
  testEnvironment: 'node',
  
  // Test file patterns
  testMatch: [
    '**/*.test.js'
  ],
  
  // Coverage configuration - disabled for now
  collectCoverage: false,
  
  // Test timeout
  testTimeout: 10000,
  
  // Verbose output
  verbose: true,
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Global variables
  globals: {
    'process.env': {
      NODE_ENV: 'test',
      SUPABASE_URL: 'http://localhost:54321',
      SUPABASE_ANON_KEY: 'test-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
      JWT_SECRET: 'test-jwt-secret'
    }
  }
};