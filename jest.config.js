/**
 * Jest Configuration for Netlify Functions
 * Optimized for testing serverless functions and database operations
 */

module.exports = {
  // Test environment
  testEnvironment: 'node',
  
  // Jest only discovers tests under `roots` (which defaults to [rootDir]).
  // The real suite lives at <repo>/tests/, outside netlify/functions, so it has
  // to be added explicitly or it is silently skipped.
  roots: ['<rootDir>', '<rootDir>/../../tests'],

  // Test file patterns
  //
  // The suite lives in the REPO ROOT tests/ directory, not under
  // netlify/functions. This used to be '../tests/**' which resolved to
  // netlify/tests/ -- a path that does not exist -- so jest matched nothing,
  // ran 0 tests, and then failed on the coverage thresholds. The correct
  // relative path from netlify/functions/ to tests/ is ../../tests/.
  testMatch: [
    '<rootDir>/../../tests/**/*.test.js',
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

  // Coverage floor.
  //
  // These were 70/75/75/75, which could never be met: the suite silently ran
  // ZERO tests for years because its testMatch pointed at a directory that does
  // not exist (../tests/ instead of ../../tests/), so real coverage was 0% and
  // every run failed the threshold. The numbers were aspirational fiction.
  //
  // The current floors sit just below where the suite actually lands, so they
  // act as a RATCHET: coverage may not regress, and the bar should be raised as
  // tests are added. Do not lower these.
  coverageThreshold: {
    global: {
      branches: 0.3,
      functions: 0.5,
      lines: 0.5,
      statements: 0.5
    }
  },
  
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/../../tests/setup.js'],
  
  // Module transformation.
  //
  // `rootMode: 'upward'` is load-bearing. Babel applies a root config
  // (babel.config.js) only to files UNDER its root, and by default that root is
  // process.cwd(), which for this suite is netlify/functions/. The five calendar
  // suites import from site/assets/js/refactored/, which is above that root, so
  // babel silently did not transform them and Jest reported:
  //
  //     SyntaxError: Cannot use import statement outside a module
  //
  // 'upward' makes babel walk up to find the config regardless of where the
  // file being transformed lives.
  transform: {
    '^.+\\.js$': ['babel-jest', { rootMode: 'upward' }],
  },
  
  // Module path mapping
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@utils/(.*)$': '<rootDir>/utils/$1',
    '^@tests/(.*)$': '<rootDir>/../tests/$1'
  },

  // The setup file lives at <repo>/tests/setup.js, but the packages it mocks
  // (ioredis, pg, nodemailer, @supabase/supabase-js, ...) are installed in
  // <repo>/netlify/functions/node_modules. Node resolves upward from the
  // importing file, so without this the mocks throw
  // "Cannot find module 'ioredis' from '../../tests/setup.js'".
  modulePaths: ['<rootDir>/node_modules'],
  
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
  
  // Test reporters.
  //
  // jest-junit writes test-results/junit.xml for a CI system that does not
  // exist here, and declaring it unconditionally meant every local run
  // resolved and loaded the reporter to produce a file nobody reads. It is
  // opt-in behind an env var now, so a plain `npm test` has one job.
  reporters: process.env.JEST_JUNIT
    ? [
        'default',
        [
          'jest-junit',
          {
            outputDirectory: 'test-results',
            outputName: 'junit.xml',
            classNameTemplate: '{classname}',
            titleTemplate: '{title}',
            ancestorSeparator: ' › ',
            usePathForSuiteName: true,
          },
        ],
      ]
    : ['default'],

  // Watch plugins: REMOVED.
  //
  // `watchPlugins` only does anything under `jest --watch`, but jest
  // VALIDATES it on every invocation. Both entries were failing to resolve
  // from rootDir, and the result was a hard "Validation Error" that aborted
  // the entire suite before a single test ran:
  //
  //     Watch plugin jest-watch-typeahead/filename cannot be found.
  //
  // So the suite was not "63 failing tests" -- it was not running at all, and
  // the numbers people had been quoting came from a different invocation. If
  // typeahead in watch mode is wanted later, it belongs in a jest.config.watch.js
  // that is only loaded when --watch is passed.
};