/**
 * Jest Configuration for Netlify Functions
 * Optimized for testing serverless functions and database operations
 */

module.exports = {
  // Test environment
  testEnvironment: 'node',
  
  // Test file patterns
  testMatch: [
    '../tests/**/*.test.js',
    '**/__tests__/**/*.js',
    '**/?(*.)+(spec|test).js'
  ],
  
  // Coverage configuration
  collectCoverage: true,
  collectCoverageFrom: [
    '**/*.js',
    '!**/*.test.js',
    '!**/__tests__/**',
    '!jest.config.js',
    '!coverage/**',
    '!node_modules/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json'],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 75,
      lines: 75,
      statements: 75
    }
  },
  
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/../../tests/setup.js'],
  
  // Module transformation
  transform: {
    '^.+\\.js$': 'babel-jest'
  },
  
  // Module path mapping
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@utils/(.*)$': '<rootDir>/utils/$1',
    '^@tests/(.*)$': '<rootDir>/../tests/$1'
  },
  
  // Test timeout
  testTimeout: 30000,
  
  // Verbose output
  verbose: true,
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Error handling
  errorOnDeprecated: true,
  
  // Global variables
  globals: {
    'process.env': {
      NODE_ENV: 'test',
      SUPABASE_URL: 'http://localhost:54321',
      SUPABASE_ANON_KEY: 'test-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
      JWT_SECRET: 'test-jwt-secret',
      REDIS_URL: 'redis://localhost:6379'
    }
  },
  
  // Test reporters
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: 'test-results',
        outputName: 'junit.xml',
        classNameTemplate: '{classname}',
        titleTemplate: '{title}',
        ancestorSeparator: ' › ',
        usePathForSuiteName: true
      }
    ]
  ],
  
  // Watch plugins
  watchPlugins: [
    'jest-watch-typeahead/filename',
    'jest-watch-typeahead/testname'
  ]
};