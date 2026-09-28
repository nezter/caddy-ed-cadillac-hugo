/**
 * Jest Test Setup
 * Global test configuration and utilities
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
process.env.REDIS_URL = 'redis://localhost:6379';

// Mock console methods to reduce noise in tests
const originalConsole = { ...console };
beforeAll(() => {
  console.error = jest.fn();
  console.warn = jest.fn();
  console.log = jest.fn();
  console.info = jest.fn();
});

afterAll(() => {
  // Restore original console methods
  Object.assign(console, originalConsole);
});

// Global test utilities
global.testUtils = {
  /**
   * Create a mock AWS Lambda event
   */
  createMockEvent: (overrides = {}) => ({
    httpMethod: 'GET',
    path: '/.netlify/functions/test',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'jest-test'
    },
    queryStringParameters: null,
    body: null,
    isBase64Encoded: false,
    requestContext: {
      requestId: 'test-request-id',
      stage: 'test'
    },
    ...overrides
  }),

  /**
   * Create a mock JWT token
   */
  createMockJWT: (payload = {}) => {
    const defaultPayload = {
      sub: 'test-user-id',
      email: 'test@example.com',
      role: 'admin',
      permissions: ['campaigns_read', 'campaigns_write'],
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600
    };
    
    return Buffer.from(JSON.stringify({ ...defaultPayload, ...payload })).toString('base64');
  },

  /**
   * Create mock database response
   */
  createMockDBResponse: (data, error = null) => ({
    data: data || null,
    error: error || null,
    count: data ? (Array.isArray(data) ? data.length : 1) : 0
  }),

  /**
   * Wait for async operations
   */
  wait: (ms = 100) => new Promise(resolve => setTimeout(resolve, ms)),

  /**
   * Generate test data
   */
  generateTestData: {
    customer: (overrides = {}) => ({
      id: 'test-customer-id',
      first_name: 'Test',
      last_name: 'Customer',
      email: 'test@example.com',
      phone: '+1234567890',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides
    }),

    campaign: (overrides = {}) => ({
      id: 'test-campaign-id',
      name: 'Test Campaign',
      description: 'Test campaign description',
      campaign_type: 'nurture',
      is_active: true,
      priority: 1,
      target_audience: 'all',
      total_sent: 0,
      total_opened: 0,
      total_clicked: 0,
      total_converted: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides
    }),

    followup: (overrides = {}) => ({
      id: 'test-followup-id',
      customer_id: 'test-customer-id',
      campaign_id: 'test-campaign-id',
      email: true,
      sms: false,
      email_template: 'test-template',
      scheduled_date: new Date().toISOString(),
      sent_date: null,
      status: 'pending',
      priority: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides
    }),

    analytics: (overrides = {}) => ({
      id: 'test-analytics-id',
      followup_id: 'test-followup-id',
      customer_id: 'test-customer-id',
      campaign_id: 'test-campaign-id',
      event_type: 'opened',
      event_timestamp: new Date().toISOString(),
      email_opened: true,
      link_clicked: null,
      user_agent: 'Test Agent',
      ip_address: '127.0.0.1',
      created_at: new Date().toISOString(),
      ...overrides
    })
  }
};

// Also export the helpers.
//
// Several suites load them with `const testUtils = require('../setup')`, but
// this file only assigned them to `global.testUtils`, so `require()` handed back
// an empty object and every helper call failed with
// "testUtils.createMockEvent is not a function". Exporting satisfies both
// access styles.
module.exports = global.testUtils;

/**
 * The account every authenticated request resolves to, unless a test says
 * otherwise.
 *
 * WHY THIS IS HERE AND NOT IN EACH SUITE
 * ---------------------------------------
 * The auth middleware does not take the caller's role or permissions from the
 * token. It verifies the signature, then re-reads the account from the database
 * and makes every authorisation decision from that row. That is the correct
 * design -- it means revoking access takes effect on the next request rather than
 * when the token happens to expire -- and it means any test that exercises an
 * authenticated path needs a database.
 *
 * No suite had one. The result was a very confusing failure shape: with no
 * account to find, every authenticated request came back 401, which is
 * indistinguishable from a rejected token, so suites testing the DATABASE reported
 * what looked like authorisation failures. `followup-campaigns` read 0-for-31
 * and `auth-middleware` read 20-of-31 failing, neither with a hint that the
 * missing thing was a row.
 *
 * A default here fixes all of them at once, and gives a test one obvious place
 * to say "this account is a sales_rep" or "this account is suspended".
 */
global.testUtils.DEFAULT_REP = Object.freeze({
  id: 'test-user-id',
  first_name: 'Test',
  last_name: 'User',
  email: 'test@example.com',
  role: 'admin',
  permissions: Object.freeze(['campaigns_read', 'campaigns_write']),
  status: 'active',
});

/** Override the account a request resolves to. Call from beforeEach. */
global.testUtils.asRep = (overrides = {}) => {
  const DatabaseService = require('../netlify/functions/utils/database-service');
  if (typeof DatabaseService.getSalesRep !== 'function') return null;
  DatabaseService.getSalesRep.mockResolvedValue({
    ...global.testUtils.DEFAULT_REP,
    ...overrides,
  });
  return DatabaseService.getSalesRep;
};

jest.mock('../netlify/functions/utils/database-service', () => {
  const actual = jest.requireActual('../netlify/functions/utils/database-service');
  return {
    __esModule: true,
    ...actual,
    // Active admin by default, so a test only has to describe the account when
    // the ACCOUNT is the thing under test.
    getSalesRep: jest.fn(() =>
      Promise.resolve({
        id: 'test-user-id',
        first_name: 'Test',
        last_name: 'User',
        email: 'test@example.com',
        role: 'admin',
        permissions: ['campaigns_read', 'campaigns_write'],
        status: 'active',
      })
    ),
  };
});

// Mock external dependencies
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(() => Promise.resolve(global.testUtils.createMockDBResponse(null, { message: 'Not found' }))),
          data: [],
          error: null
        })),
        in: jest.fn(() => ({
          data: [],
          error: null
        })),
        data: [],
        error: null
      })),
      insert: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn(() => Promise.resolve(global.testUtils.createMockDBResponse({ id: 'test-id' }))),
          data: [{ id: 'test-id' }],
          error: null
        })),
        data: [{ id: 'test-id' }],
        error: null
      })),
      update: jest.fn(() => ({
        eq: jest.fn(() => ({
          select: jest.fn(() => ({
            single: jest.fn(() => Promise.resolve(global.testUtils.createMockDBResponse({ id: 'test-id' }))),
            data: [{ id: 'test-id' }],
            error: null
          })),
          data: [{ id: 'test-id' }],
          error: null
        }))
      })),
      delete: jest.fn(() => ({
        eq: jest.fn(() => ({
          data: [],
          error: null
        }))
      })),
      order: jest.fn(() => ({
        limit: jest.fn(() => ({
          data: [],
          error: null
        })),
        range: jest.fn(() => ({
          data: [],
          error: null
        })),
        data: [],
        error: null
      })),
      limit: jest.fn(() => ({
        data: [],
        error: null
      })),
      range: jest.fn(() => ({
        data: [],
        error: null
      })),
      data: [],
      error: null
    })),
    rpc: jest.fn(() => Promise.resolve({ data: [], error: null })),
    auth: {
      getUser: jest.fn(() => Promise.resolve({ data: { user: null }, error: null })),
      signIn: jest.fn(() => Promise.resolve({ data: { user: null }, error: null })),
      signOut: jest.fn(() => Promise.resolve({ error: null }))
    },
    storage: {
      from: jest.fn(() => ({
        upload: jest.fn(() => Promise.resolve({ data: { path: 'test-path' }, error: null })),
        getPublicUrl: jest.fn(() => ({ data: { publicUrl: 'test-url' } }))
      }))
    }
  }))
}));

// Mock Redis
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn(() => Promise.resolve(null)),
    set: jest.fn(() => Promise.resolve('OK')),
    setex: jest.fn(() => Promise.resolve('OK')),
    del: jest.fn(() => Promise.resolve(1)),
    exists: jest.fn(() => Promise.resolve(0)),
    expire: jest.fn(() => Promise.resolve(1)),
    ttl: jest.fn(() => Promise.resolve(-1)),
    incr: jest.fn(() => Promise.resolve(1)),
    incrby: jest.fn(() => Promise.resolve(1)),
    lpush: jest.fn(() => Promise.resolve(1)),
    ltrim: jest.fn(() => Promise.resolve('OK')),
    lrange: jest.fn(() => Promise.resolve([])),
    sadd: jest.fn(() => Promise.resolve(1)),
    smembers: jest.fn(() => Promise.resolve([])),
    keys: jest.fn(() => Promise.resolve([])),
    ping: jest.fn(() => Promise.resolve('PONG')),
    quit: jest.fn(() => Promise.resolve('OK')),
    on: jest.fn(),
    once: jest.fn()
  }));
});

// Mock PostgreSQL Pool
jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({
    query: jest.fn(() => Promise.resolve({ rows: [], rowCount: 0 })),
    connect: jest.fn(() => Promise.resolve({
      query: jest.fn(() => Promise.resolve({ rows: [], rowCount: 0 })),
      release: jest.fn()
    })),
    end: jest.fn(() => Promise.resolve()),
    on: jest.fn()
  }))
}));

// Mock Nodemailer
jest.mock('nodemailer', () => ({
  createTransporter: jest.fn(() => ({
    sendMail: jest.fn(() => Promise.resolve({ messageId: 'test-message-id' }))
  }))
}));

// Mock JWT
jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(() => 'mock-jwt-token'),
  verify: jest.fn(() => ({
    sub: 'test-user-id',
    email: 'test@example.com',
    role: 'admin',
    permissions: ['campaigns_read', 'campaigns_write']
  }))
}));

// Mock bcrypt
jest.mock('bcryptjs', () => ({
  hash: jest.fn(() => Promise.resolve('hashed-password')),
  compare: jest.fn(() => Promise.resolve(true)),
  genSalt: jest.fn(() => Promise.resolve('salt'))
}));

// Global test cleanup
afterEach(() => {
  jest.clearAllMocks();
});

// Increase timeout for database operations
jest.setTimeout(30000);