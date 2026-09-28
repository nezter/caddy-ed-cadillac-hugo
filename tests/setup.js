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

/**
 * What `DatabaseService.query` returns. Defaults to the empty set.
 *
 *   testUtils.asRows([{ id: 'c1', name: 'Test' }])          one row set
 *   testUtils.asRows([{ id: 'c1' }], { total: '1' })        COUNT shape too
 *   testUtils.asRows()                                      the default
 *
 * The empty set is the default rather than a convenience row so that a test
 * which forgets to say what the table contains gets a truthful "no rows" and
 * fails on its own expectation, instead of a fabricated row that makes a broken
 * assertion look like it passed.
 */
/**
 * The jsonwebtoken that the FUNCTIONS load, with the mock applied.
 *
 * A test needing to change token verification must use this, not
 * `require('jsonwebtoken')`.
 *
 * jsonwebtoken is installed twice -- at the root, and nested under
 * netlify/functions, which has its own lockfile and so its own copy. A require
 * from tests/ gets the root one; auth-middleware.js loads the nested one. The
 * mock is keyed to the nested one, so the root copy is the REAL jsonwebtoken
 * and `verify.mockImplementation` is not a function on it.
 *
 * That is a confusing way to fail: "verify.mockImplementation is not a function"
 * says nothing about the two-install problem that caused it.
 */
global.testUtils.jsonwebtoken = () => require(
  require.resolve('jsonwebtoken', {
    paths: [require.resolve('../netlify/functions/package.json')],
  })
);

/** Make the token verifier reject, as it does for a token that is not valid. */
global.testUtils.rejectTokens = (message = 'invalid signature') => {
  const { verify } = global.testUtils.jsonwebtoken();
  const err = new Error(message);
  err.name = 'JsonWebTokenError';
  verify.mockImplementation(() => { throw err; });
  return verify;
};

global.testUtils.asRows = (rows = [], extra = {}) => {  const DatabaseService = require('../netlify/functions/utils/database-service');
  if (typeof DatabaseService.query !== 'function') return null;
  DatabaseService.query.mockResolvedValue({ rows, rowCount: rows.length, ...extra });
  return DatabaseService.query;
};

/**
 * A table a test can put rows into, and the fake answers queries against.
 *
 *   const DB = testUtils.database();
 *   DB.insert('followup_campaigns', { id: 'c1', name: 'Spring' });
 *   // SELECT * FROM followup_campaigns ... -> [{ id: 'c1', name: 'Spring' }]
 *   // SELECT COUNT(*) ...                 -> [{ count: 1 }]
 *
 * WHY NOT JUST asRows()
 * ---------------------
 * Because one request is several queries. `GET /followup-campaigns/{id}` runs
 * three: the campaign, a COUNT over followup_rules, a COUNT over followups. A
 * single `mockResolvedValue` gives all three the same answer, so the second
 * query returns a campaign row and the code reads `.followups_count` off it --
 * undefined -- and the test either fails for that reason or passes by accident.
 *
 * A flat mock forces every test to know the query order of the function under
 * test. This answers by table name, so a test says what the TABLE contains and
 * the function's query order stops mattering.
 *
 * WHAT IT IS NOT
 * --------------
 * It is not a database. It matches on the table named in the SQL, which is
 * enough for the read paths and useless for anything requiring real SQL. It
 * cannot be mistaken for one: a table that was never inserted into returns
 * EMPTY, not a plausible row. A test that wants data has to put it there, and
 * what it did not put there is genuinely absent.
 */
global.testUtils.database = () => {
  const DatabaseService = require('../netlify/functions/utils/database-service');
  const tables = new Map();

  const api = {
    /** Put rows in a table. Replaces whatever was there. */
    insert(table, rows) {
      tables.set(table, Array.isArray(rows) ? rows : [rows]);
      return api;
    },

    /** The rows currently in a table, for a test to assert against. */
    rowsOf(table) {
      return tables.get(table) || [];
    },

    /** Forget everything. Called automatically between tests. */
    reset() {
      tables.clear();
      return api;
    },
  };

  // A suite may replace the whole database-service module (auth-middleware.test.js
  // mocks getSalesRep and spreads the real module over it). Then `query` is the
  // REAL function, with no mockImplementation to call, and the re-arm in
  // afterEach would throw inside teardown -- which jest reports as a failure in
  // whichever test happened to run next, nowhere near the cause.
  //
  // So: only install the fake where there is a mock to install it on, and say so
  // rather than pretending. A suite that has replaced the module is managing its
  // own data layer and does not need this.
  if (typeof DatabaseService.query !== 'function' || !DatabaseService.query.mockImplementation) {
    return api;
  }

  DatabaseService.query.mockImplementation((sql, params) => {
    const text = String(sql);

    // Writes are applied, not just answered.
    //
    // `UPDATE ... RETURNING *` is how every write in this codebase reads the row
    // back. A read-only fake answers it with the row as it was BEFORE the
    // update, so `PUT /{id}` returned the old name and the test read as "the
    // update did not happen" when in fact the fake had quietly discarded the
    // write. An UPDATE that changes nothing is exactly the bug this is meant to
    // be able to catch, so the fake has to change things.
    if (/^\s*update\s+/i.test(text)) {
      const rows = applyIdFilter(tables.get(tableIn(text, params)) || [], text, params);
      const assignments = parseAssignments(text);
      const updated = rows.map((row) => {
        const next = { ...row };
        assignments.forEach(({ column, index, literal }) => {
          if (literal !== undefined) {
            next[column] = literal;
          } else if (index >= 1 && index <= (params || []).length) {
            next[column] = params[index - 1];
          }
        });
        return next;
      });
      // RETURNING is the contract; without it the function checks rows.length.
      const table = tableIn(text, params);
      if (updated.length && tables.has(table)) tables.set(table, updated);
      return Promise.resolve({ rows: updated, rowCount: updated.length });
    }

    if (/^\s*insert\s+/i.test(text)) {
      const table = tableIn(text, params);
      const existing = tables.get(table) || [];
      const values = parseInsertValues(text, params);
      tables.set(table, existing.concat([values]));
      return Promise.resolve({ rows: [values], rowCount: 1 });
    }

    if (/^\s*delete\s+/i.test(text)) {
      const table = tableIn(text, params);
      const existing = tables.get(table) || [];
      const doomed = applyIdFilter(existing, text, params);
      tables.set(table, existing.filter((r) => !doomed.includes(r)));
      return Promise.resolve({ rows: doomed, rowCount: doomed.length });
    }

    // Aggregates, before the single-COUNT shortcut below.
    //
    // Order matters: the stats query is `COUNT(*) as a, COUNT(CASE...) as b,
    // SUM(x) as c, ...` and it CONTAINS `COUNT(*)`, so the shortcut matched it
    // first and answered with one column. Every other aggregate then read
    // `undefined`, which reads as "the statistics are missing" rather than "the
    // fake only knows how to count one thing".
    //
    // What the value IS depends on the aggregate, and only COUNT is computed for
    // real. The rest are `null` -- which is what SQL itself returns for SUM over
    // no rows, so "no data" is reported as no data rather than as a plausible
    // number. A test needing a real SUM must put that column in the row it
    // inserts.
    if (isAggregate(text)) {
      const source = applyIdFilter(tables.get(tableIn(text, params)) || [], text, params);
      const row = {};
      for (const { alias, fn } of aggregateColumns(text)) {
        row[alias] = /^count/i.test(fn) ? String(source.length) : null;
      }
      return Promise.resolve({ rows: [row], rowCount: 1 });
    }

    // A COUNT is a COUNT whatever table it counts, and the column name varies
    // (`count`, `total`, `rules_count`), so read it back out of the SQL.
    if (/\bcount\s*\(\s*\*\s*\)/i.test(text)) {
      const alias = (text.match(/\bas\s+(\w+)/i) || [])[1] || 'count';
      const count = tables.get(tableIn(text, params)) || [];
      // A WHERE with a parameter that matches nothing means zero, which is what
      // a real COUNT over a filtered query returns.
      const filtered = applyIdFilter(count, text, params);
      return Promise.resolve({ rows: [{ [alias]: String(filtered.length) }], rowCount: 1 });
    }

    const rows = applyIdFilter(tables.get(tableIn(text, params)) || [], text, params);
    return Promise.resolve({ rows, rowCount: rows.length });
  });

  return api;
};

/** The table named in a FROM or UPDATE or INTO clause. */
function tableIn(sql) {
  const m = String(sql).match(/\b(?:from|update|into)\s+([a-z_][a-z0-9_]*)/i);
  return m ? m[1].toLowerCase() : '';
}

/**
 * `SET col = $1, flag = false, other = $2` -> [{ column, value }].
 *
 * Both parameterised and literal assignments are read, because both are used:
 * `UPDATE followup_campaigns SET name = $1, updated_at = CURRENT_TIMESTAMP` and
 * `SET is_active = false`. A fake that handled only the first left
 * deactivateCampaign returning the row unchanged, so the test read "deactivate
 * does not deactivate" -- which is exactly the bug the fake exists to catch.
 *
 * `CURRENT_TIMESTAMP` is skipped rather than guessed at, since nothing asserts
 * on a timestamp and inventing one would be a fabricated value.
 */
function parseAssignments(sql) {
  const set = String(sql).match(/\bset\b([\s\S]*?)\bwhere\b/i);
  if (!set) return [];
  const out = [];
  // Split on commas that are not inside parentheses.
  const parts = set[1].split(/,(?![^(]*\))/);
  for (const part of parts) {
    const param = part.match(/(\w+)\s*=\s*\$(\d+)/);
    if (param) {
      out.push({ column: param[1], index: Number(param[2]) });
      continue;
    }
    const literal = part.match(/(\w+)\s*=\s*(true|false|null|-?\d+(?:\.\d+)?|'[^']*')/i);
    if (literal) out.push({ column: literal[1], literal: parseLiteral(literal[2]) });
  }
  return out;
}

function parseLiteral(text) {
  const v = String(text).trim();
  if (/^true$/i.test(v)) return true;
  if (/^false$/i.test(v)) return false;
  if (/^null$/i.test(v)) return null;
  if (/^'.*'$/.test(v)) return v.slice(1, -1);
  return Number(v);
}

/** Does this SELECT compute aggregates rather than list rows? */
function isAggregate(sql) {
  const select = String(sql).match(/\bselect\b([\s\S]*?)\bfrom\b/i);
  if (!select) return false;
  return /\b(count|sum|avg|min|max|total|round)\s*\(/i.test(select[1]);
}

/** `COUNT(*) as total_campaigns, SUM(x) as total_sent` -> [{alias, fn}] */
function aggregateColumns(sql) {
  const select = String(sql).match(/\bselect\b([\s\S]*?)\bfrom\b/i);
  if (!select) return [];
  const out = [];
  const parts = select[1].split(/,(?![^(]*\))/);
  for (const part of parts) {
    const text = part.trim();
    // `as alias` or a bare alias, but the word `as` must never become the
    // alias -- an earlier version of this regex did exactly that, and every
    // aggregate came back named "as".
    const aliased = text.match(/\bas\s+(\w+)\s*$/i);
    if (aliased) {
      const fn = (text.match(/^\s*(\w+)\s*\(/) || [])[1];
      if (fn) out.push({ fn, alias: aliased[1] });
      continue;
    }
    const bare = text.match(/^\s*(\w+)\s*\([^)]*\)\s*(\w+)\s*$/i);
    if (bare) out.push({ fn: bare[1], alias: bare[2] });
  }
  return out;
}

/** `INSERT INTO t (a, b) VALUES ($1, $2)` -> { a: params[0], b: params[1] } */function parseInsertValues(sql, params) {
  const cols = String(sql).match(/\(([^)]*)\)\s*values/i);
  const names = cols ? cols[1].split(',').map((c) => c.trim()) : [];
  const row = {};
  names.forEach((name, i) => {
    row[name] = (params || [])[i];
  });
  return row;
}

/**
 * Apply a `WHERE id = $n` filter, so a request for an id that was never
 * inserted comes back empty rather than returning everything.
 */
function applyIdFilter(rows, sql, params) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  if (!params || !params.length) return rows;
  const m = String(sql).match(/\bwhere\s+(\w+)\s*=\s*\$(\d+)/i);
  if (!m) return rows;
  const [, column, index] = m;
  const wanted = params[Number(index) - 1];
  if (wanted === undefined) return rows;
  const filtered = rows.filter((r) => String(r[column]) === String(wanted));
  return filtered.length ? filtered : [];
}

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
    // The single query path, defaulting to an empty result set.
    //
    // The real `query` needs a configured database, so unmocked it rejects with
    // "No database is configured" -- and every function that reads a table
    // returned 500 for that reason. Which is honest, and useless: a suite
    // testing pagination or validation should not need a live Postgres to find
    // out whether its arithmetic is right.
    //
    // The default is `{ rows: [] }` -- deliberately the EMPTY SET, not a
    // fabricated row. Empty is the truthful answer to a query against a table
    // nothing has been inserted into, and it keeps the shape honest: a test
    // that needs rows has to say what they are, in one obvious place, via
    // testUtils.asRows(). Nothing here can make an empty result look populated.
    query: jest.fn(() => Promise.resolve({ rows: [], rowCount: 0 })),
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

// ioredis is deliberately NOT mocked here.
//
// It used to be, with a full fake client. Then ioredis was removed from the
// project as a dead dependency, and this mock became the thing standing between
// the suite and any result at all.
//
// `jest.mock()` on a module that cannot be resolved throws at setup time, not
// at use time, and this file is `setupFilesAfterEach` for every suite. So the
// one stale mock took down all 8 suites: "8 failed, 8 total" with `Tests: 0
// total`. Read as a red suite it looks like broken code. It was a red harness.
// A mock for a dependency that no longer exists is not a safety net; it is a
// load-bearing lie about what the code imports.
//
// If a future change reintroduces a cache, mock it then, with the module
// present.

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
//
// The path is load-bearing, and getting it wrong is invisible.
//
// `jsonwebtoken` is installed TWICE: once at the repository root, and once
// nested under netlify/functions (which has its own package.json and its own
// lockfile, so npm installs a private copy rather than hoisting). Two physical
// copies means two module instances.
//
// A bare `jest.mock('jsonwebtoken')` from THIS file is keyed to the copy that
// resolves from tests/ -- the root one. The code under test does not use that
// copy. auth-middleware.js sits in netlify/functions/utils/, so its
// `require('jsonwebtoken')` resolves to the NESTED one, and the mock is silently
// never applied to it.
//
// The observable effect was the worst kind: the real `verify` ran against the
// literal string 'mock-jwt-token', threw `JsonWebTokenError: jwt malformed`, and
// auth-middleware's catch-all reported "Invalid authentication token". Every
// success-path test in the auth suite failed, and every rejection test passed --
// 24 failures that read as broken authentication and were actually a mock aimed
// at the wrong copy of a module.
//
// So: resolve the specifier the way the CODE resolves it, and mock that. If the
// two ever agree again this still works.
jest.mock(
  require.resolve('jsonwebtoken', { paths: [require.resolve('../netlify/functions/package.json')] }),
  () => ({
    sign: jest.fn(() => 'mock-jwt-token'),
    verify: jest.fn(() => ({
      sub: 'test-user-id',
      email: 'test@example.com',
      role: 'admin',
      permissions: ['campaigns_read', 'campaigns_write']
    }))
  }),
  { virtual: false }
);

// Mock bcrypt
jest.mock('bcryptjs', () => ({
  hash: jest.fn(() => Promise.resolve('hashed-password')),
  compare: jest.fn(() => Promise.resolve(true)),
  genSalt: jest.fn(() => Promise.resolve('salt'))
}));

// Global test cleanup
//
// `jest.clearAllMocks()` clears mock IMPLEMENTATIONS as well as call history,
// which is almost never what a suite wants from a teardown: any mock that was
// given behaviour rather than only a call log loses that behaviour after the
// first test and quietly reverts to returning undefined.
//
// Two of those are re-armed below, and the re-arms are the point. Without them:
//
//   - testUtils.database()'s SQL fake survives exactly one test, so every test
//     after the first one saw a database returning undefined -- which reads as
//     "the data layer broke", not "the mock was cleared".
//   - the jsonwebtoken mock's `verify` reverts to undefined, so `jwt.verify(...)`
//     yields undefined and the middleware refuses every token with a 401. A suite
//     that makes one test's token invalid would then have EVERY subsequent test
//     authenticated as invalid, and the failures would land on whichever tests
//     happened to run next.
//
// `resetMocks: true` in jest.config.js would clear implementations between tests
// too, which is a reasonable default and would have the same effect by another
// route. The re-arms are here instead of there so the behaviour is visible in
// one place with a reason attached.
afterEach(() => {
  jest.clearAllMocks();
  if (global.testUtils && global.testUtils.database) global.testUtils.database();
  rearmDefaultAccount();
  rearmDefaultTokenVerifier();
});

/**
 * Restore the default account lookup.
 *
 * `testUtils.asRep()` installs a row with `mockResolvedValue`, and
 * `clearAllMocks` takes the resolved value with it -- leaving `getSalesRep`
 * returning undefined, so `authenticateRequest` saw "no such account" and
 * answered 401. Every test after the one that called asRep() was then
 * authenticated as a stranger, and the failures landed on tests that had
 * nothing to do with accounts.
 */
function rearmDefaultAccount() {
  const DatabaseService = require('../netlify/functions/utils/database-service');
  if (DatabaseService && typeof DatabaseService.getSalesRep === 'function' &&
      DatabaseService.getSalesRep.mockImplementation) {
    DatabaseService.getSalesRep.mockImplementation(() => Promise.resolve({ ...global.testUtils.DEFAULT_REP }));
  }
}

/** Restore the default "this token is fine" verifier after a test changed it. */
function rearmDefaultTokenVerifier() {
  const jwt = global.testUtils && global.testUtils.jsonwebtoken ? global.testUtils.jsonwebtoken() : null;
  if (jwt && typeof jwt.verify === 'function' && jwt.verify.mockImplementation) {
    jwt.verify.mockImplementation(defaultVerify);
  }
}

function defaultVerify() {
  return {
    sub: 'test-user-id',
    email: 'test@example.com',
    role: 'admin',
    permissions: ['campaigns_read', 'campaigns_write'],
  };
}

// Increase timeout for database operations
jest.setTimeout(30000);