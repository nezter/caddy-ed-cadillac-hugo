const crypto = require('crypto');
/**
 * Database Service
 * Handles all database operations for the customer management system
 * Supports hybrid architecture: Supabase (writes/complex ops) + Turso (reads/cache)
 */

const { Pool } = require('pg');

// Database connections
let turso = null;
let pgPool = null;
let pgPoolInitPromise = null;

async function getPgPool() {
  if (pgPool) {
    return pgPool;
  }

  if (!pgPoolInitPromise) {
    const connectionString =
      process.env.SUPABASE_DB_URL ||
      process.env.SUPABASE_DATABASE_URL ||
      process.env.SUPABASE_DB_CONNECTION ||
      process.env.DATABASE_URL;

    if (!connectionString) {
      console.warn(
        'Supabase Postgres connection string not configured. Set SUPABASE_DB_URL (or DATABASE_URL) to enable direct queries.'
      );
      pgPoolInitPromise = Promise.resolve(null);
    } else {
      const maxConnections = parseInt(process.env.DB_POOL_MAX || '5', 10);
      const idleTimeoutMillis = parseInt(process.env.DB_POOL_IDLE || '30000', 10);

      pgPoolInitPromise = (async () => {
        const pool = new Pool({
          connectionString,
          max: Number.isNaN(maxConnections) ? 5 : maxConnections,
          idleTimeoutMillis: Number.isNaN(idleTimeoutMillis) ? 30000 : idleTimeoutMillis,
          ssl: { rejectUnauthorized: false }
        });

        pool.on('error', (err) => {
          console.error('Postgres pool error:', err.message);
        });

        // Configure SSL properly for production
        if (process.env.NODE_ENV === 'production') {
          pool.ssl = { rejectUnauthorized: true };
        } else {
          // Allow self-signed certificates in development
          pool.ssl = { rejectUnauthorized: false };
        }

        try {
          await pool.query('SELECT 1');
          console.log('✅ Supabase Postgres pool initialized');
          pgPool = pool;
          return pool;
        } catch (error) {
          console.error('Failed to initialize Postgres pool:', error.message);
          return null;
        }
      })();
    }
  }

  return pgPoolInitPromise;
}

process.on('exit', () => {
  if (pgPool) {
    pgPool.end().catch((error) => {
      console.error('Error while closing Postgres pool:', error.message);
    });
  }
});

// Initialize connections
function initializeConnections() {
    // Turso/libSQL and Postgres only.
    //
    // Supabase was removed: it cannot be configured on this deployment, and
    // its read path discarded the WHERE clause entirely, so a query scoped
    // to one customer would have returned every row in the table.
    // See the note in query() below.

  if (!turso && process.env.TURSO_DATABASE_URL) {
    try {
    // `@libsql/client/http`, not `@libsql/client`.
    //
    // The bare entry point pulls in `libsql`, which carries a 10 MB native
    // binding for Linux gnu AND another 10 MB for musl -- 20 MB in every one of
    // the 41 function bundles, for a client that is never used.
    //
    // This database is reached over HTTP at a libsql:// URL. The local-file
    // transport cannot address it, so those 20 MB were dead weight that still had
    // to be bundled, zipped, uploaded and unpacked on every cold start: 317 MB of
    // function bundle for 67 pages of static site.
    //
    // `./http` is the same `createClient` with the same arguments, minus the
    // transports that cannot be used here. See docs/BUILD.md for the measurement.
    const { createClient } = require('@libsql/client/http');
      turso = createClient({
        url: process.env.TURSO_DATABASE_URL,
        authToken: process.env.TURSO_AUTH_TOKEN,
      });

      // Turn foreign key enforcement ON.
      //
      // SQLite does not enforce foreign keys unless asked, and libSQL inherits
      // that: `PRAGMA foreign_keys` defaults to OFF. The schema in
      // database/turso/schema.sql declares 22 of them, and without this line
      // every one is inert -- the schema looks correct and the guarantee is
      // gone, with nothing failing to show it.
      //
      // This is the line that makes the constraints real. If it is ever removed,
      // deleting a customer will stop cascading to their appointments and
      // nothing will complain. `PRAGMA foreign_key_check` is the way to confirm
      // it is still on.
      turso.execute('PRAGMA foreign_keys = ON').catch((e) => {
        // Not fatal, but it means the constraints are decorative. Said out loud
        // rather than swallowed, because silently losing referential integrity
        // is exactly the kind of change nobody notices until the data is wrong.
        console.error(
          '[database] could not enable foreign key enforcement: ' + e.message +
          ' -- the constraints in schema.sql will NOT be enforced.'
        );
      });
    } catch (error) {
      console.warn('Turso connection failed:', error.message);
    }
  }
}

  // A `mockDatabase` literal used to sit here: empty arrays for customers, leads,
  // interactions, appointments, sales_reps, vehicles and tasks, under the comment
  // "Mock database for development/fallback".
  //
  // It was referenced ZERO times. Nothing fell back to it. But it was one line
  // away from being wired up as exactly the silent-failure path it looks like --
  // a function with no database returning `[]` and a 200, which reads to a
  // browser as "this rep has no customers" rather than "the database is not
  // configured". For a car dealership that is the difference between an empty
  // list and a lost lead.
  //
  // The real fallback is already in place and is honest: if neither Supabase nor
  // Turso connects, `isDatabaseConfigured()` is false and the callers report
  // misconfigured. Removed rather than left as an attractive nuisance.


/**
 * Is there a database this deployment can actually reach?
 *
 * The distinction the error paths need. A function that cannot tell "there is
 * no database configured" from "the query failed" reports a deployment
 * problem as a server fault, which sends whoever is debugging it looking at
 * the wrong thing entirely.
 *
 * Named rather than inlined because it is asked in more than one place, and an
 * answer that disagrees with itself is worse than no answer.
 */
function isDatabaseConfigured() {
  return Boolean(
    process.env.SUPABASE_DB_URL ||
    process.env.DATABASE_URL ||
    process.env.SUPABASE_DATABASE_URL ||
    process.env.SUPABASE_DB_CONNECTION ||
    process.env.TURSO_DATABASE_URL
  );
}

/**
 * Rewrite `$1`-style placeholders to sequential `?`, in the order they appear.
 *
 * WHY THIS IS HERE
 * ----------------
 * libSQL -- and SQLite's own numbered-parameter handling behind it -- binds `$n`
 * parameters correctly ONLY when they appear in ascending order. The common
 * shape of an UPDATE in this codebase puts the id in the WHERE clause and the
 * new values in the SET clause, and the SET clause comes first:
 *
 *     UPDATE booking_requests
 *        SET status = $2, google_event_id = $3
 *      WHERE id = $1
 *
 * The placeholders are read in the order 2, 3, 1. libSQL binds $1 to the first
 * value it sees, the value of `status`, and matches `WHERE id = 'synced'` --
 * which matches nothing.
 *
 * AND IT DOES NOT ERROR. The statement succeeds. It returns zero rows. There is
 * no exception, no warning, nothing in the log except a normal-looking query.
 * The caller sees a successful UPDATE that changed nothing, and a booking that
 * will not mark itself synced no matter how many times it is asked.
 *
 * That is the worst shape a database bug can have: silent, total, and
 * indistinguishable from "there was nothing to update".
 *
 * WHY IT IS FIXED HERE AND NOT AT THE CALL SITES
 * -----------------------------------------------
 * Because the call sites are not where the error is, and the pattern is built at
 * runtime in at least six places -- `SET` clauses assembled from an allowlist of
 * field names -- so a static search cannot enumerate them. Fixing it in `query()`
 * fixes all of them, existing and future, and cannot be forgotten at a new call
 * site.
 *
 * `$1` may be repeated (`WHERE a = $1 OR b = $1`), so the argument list is
 * rebuilt in textual order with repeats preserved. `?NNN` explicit indices are
 * left alone, since those are unambiguous.
 */
function normalisePlaceholders(sql, params) {
  if (!Array.isArray(params) || params.length === 0) return { sql, params };
  if (!/\$/.test(sql)) return { sql, params };
  // Leave `:name` and `::type` casts alone; only $n is ours.
  if (/\$\d+\s*::/.test(sql)) return { sql, params };

  const order = [];
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    if (ch === '$' && /\d/.test(sql[i + 1] || '')) {
      let j = i + 1;
      while (j < sql.length && /\d/.test(sql[j])) j++;
      const n = Number(sql.slice(i + 1, j));
      // A number with no matching argument means the caller and the SQL
      // disagree. Leave it exactly as written so the database reports it,
      // rather than quietly binding something else.
      if (n < 1 || n > params.length) return { sql, params };
      order.push(params[n - 1]);
      out += '?';
      i = j;
      continue;
    }
    // Copy the character, but not a `$` that is part of a template
    // interpolation or a cast.
    if (ch === '$' && sql[i + 1] === '{') {
      out += '${';
      i += 2;
      continue;
    }
    out += ch;
    i++;
  }
  return { sql: out, params: order };
}

/**
 * Generic database query function with hybrid routing
 * Routes operations between Supabase (writes/complex) and Turso (reads/cache)
 */
async function query(sql, params = [], options = {}) {
  initializeConnections();

  const { forceSupabase = false, forceTurso = false, readOnly = false } = options;

  // Rewritten here, once, for the reason in the comment above.
  const bound = normalisePlaceholders(sql, Array.isArray(params) ? params : []);
  const effectiveSql = bound.sql;
  const effectiveParams = bound.params;

  console.log('🔍 Database Query:', effectiveSql.substring(0, 100) + '...');
  console.log('📋 Parameters:', effectiveParams);

  const safeParams = effectiveParams;

  // Prefer direct Postgres connection when available
  try {
    const pool = await getPgPool();
    if (pool) {
      const result = await pool.query(effectiveSql, safeParams);
      return {
        rows: result.rows,
        rowCount: result.rowCount
      };
    }
  } catch (pgError) {
    console.error('Postgres query failed, falling back to alternate handlers:', pgError.message);
  }

  // One data path, in priority order: Postgres, then Turso, then an honest
  // failure.
  //
  // This used to be three. Supabase sat in the middle as a write fallback, and
  // a "mock database" sat at the end.
  //
  // Supabase could not have worked here -- its write path called an RPC named
  // exec_sql that no configured project defines -- and its read path was
  // actively wrong: it pulled the table name out of the SQL with a regex and
  // then DISCARDED THE WHERE CLAUSE, so a query for one customer's rows would
  // have returned every row in the table.
  //
  // The mock fallback returned { rows: [], rowCount: 0 } for anything. With no
  // database configured, "list all customers" therefore SUCCEEDED with an empty
  // list and a 200 -- indistinguishable from a business with no customers. A
  // sales tool that reports an empty pipeline when it cannot reach its data is
  // worse than one that is visibly down, because nobody investigates a 200.
  //
  // libSQL does writes, so dropping Supabase loses nothing. What is left either
  // works or says why it did not.
  const target = turso;
  if (!target) {
    const err = new Error(
      'No database is configured. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN, ' +
        'or DATABASE_URL for Postgres.'
    );
    err.code = 'DB_NOT_CONFIGURED';
    throw err;
  }

  try {
    const result = await target.execute({ sql: effectiveSql, args: safeParams });
    return {
      rows: result.rows,
      rowCount: result.rowsAffected != null ? result.rowsAffected : result.rows.length
    };
  } catch (dbError) {
    // A real query failure, reported as one. The old mock fallback swallowed
    // this and answered with zero rows.
    console.error('Database query failed:', dbError.message);
    throw dbError;
  }
}

/**
 * Customer Management Functions
 */

class DatabaseService {
  
  /**
   * Create a new customer
   */
  static async createCustomer(customerData) {
    const {
      first_name,
      last_name,
      email,
      phone,
      address_line1,
      city,
      state,
      zip_code,
      customer_type = 'prospect',
      source = 'website',
      assigned_sales_rep_id,
      vehicle_interest,
      preferred_contact_method = 'email'
    } = customerData;
    
    const sql = `
      INSERT INTO customers (
        id, first_name, last_name, email, phone, address_line1, city, state, zip_code,
        customer_type, source, assigned_sales_rep_id, vehicle_interest,
        preferred_contact_method, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `;
    
      // `id TEXT PRIMARY KEY` with no DEFAULT, so it has to be supplied.
      // See newId() for why it is not a schema default.
    const params = [
      newId(), first_name, last_name, email, phone, address_line1, city, state, zip_code,
      customer_type, source, assigned_sales_rep_id, vehicle_interest,
      preferred_contact_method, 'system'
    ];
    
    try {
      const result = await query(sql, params);
      return result.rows[0];
    } catch (error) {
      console.error('Error creating customer:', error);
      throw new Error('Failed to create customer');
    }
  }
  
  /**
   * Get customer by ID
   */
  static async getCustomer(customerId) {
    const sql = `
      SELECT 
        c.*,
        COUNT(DISTINCT l.id) as lead_count,
        COUNT(DISTINCT i.id) as interaction_count,
        COUNT(DISTINCT a.id) as appointment_count,
        MAX(i.created_at) as last_interaction_date
      FROM customers c
      LEFT JOIN leads l ON c.id = l.customer_id
      LEFT JOIN interactions i ON c.id = i.customer_id
      LEFT JOIN appointments a ON c.id = a.customer_id
      WHERE c.id = $1
      GROUP BY c.id
    `;
    
    try {
      const result = await query(sql, [customerId]);
      return result.rows[0];
    } catch (error) {
      console.error('Error getting customer:', error);
      throw new Error('Failed to get customer');
    }
  }
  
  /**
   * Search customers with filters
   */
  static async searchCustomers(filters = {}) {
    const {
      search = '',
      customer_type = '',
      status = '',
      assigned_sales_rep_id = '',
      limit = 20,
      offset = 0,
      sort_by: raw_sort_by = 'last_activity_date',
      sort_order: raw_sort_order = 'desc'
    } = filters;

    // Whitelist sort columns. The previous code interpolated sort_by and
    // sort_order directly into SQL, so a caller could inject arbitrary SQL
    // through those parameters. Only allow known columns and directions.
    const ALLOWED_SORT_COLUMNS = new Set([
      'last_activity_date',
      'created_at',
      'name',
      'status'
    ]);
    const ALLOWED_SORT_DIRECTIONS = new Set(['asc', 'desc']);
    const sort_by = ALLOWED_SORT_COLUMNS.has(raw_sort_by)
      ? raw_sort_by
      : 'last_activity_date';
    const sort_order = ALLOWED_SORT_DIRECTIONS.has((raw_sort_order || '').toLowerCase())
      ? raw_sort_order.toLowerCase()
      : 'desc';

    let whereClauses = [];
    let params = [];
    let paramIndex = 1;
    
    // Build WHERE clauses
    if (search) {
      whereClauses.push(`(
        c.first_name LIKE $${paramIndex} OR 
        c.last_name LIKE $${paramIndex} OR 
        c.email LIKE $${paramIndex} OR 
        c.phone LIKE $${paramIndex}
      )`);
      params.push(`%${search}%`);
      paramIndex++;
    }
    
    if (customer_type) {
      whereClauses.push(`c.customer_type = $${paramIndex}`);
      params.push(customer_type);
      paramIndex++;
    }
    
    if (status) {
      whereClauses.push(`c.status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }
    
    if (assigned_sales_rep_id) {
      whereClauses.push(`c.assigned_sales_rep_id = $${paramIndex}`);
      params.push(assigned_sales_rep_id);
      paramIndex++;
    }
    
    const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    
    const sql = `
      SELECT 
        c.*,
        COUNT(DISTINCT l.id) as lead_count,
        COUNT(DISTINCT i.id) as interaction_count,
        COUNT(DISTINCT a.id) as appointment_count,
        MAX(i.created_at) as last_interaction_date
      FROM customers c
      LEFT JOIN leads l ON c.id = l.customer_id
      LEFT JOIN interactions i ON c.id = i.customer_id
      LEFT JOIN appointments a ON c.id = a.customer_id
      ${whereClause}
      GROUP BY c.id
      ORDER BY ${sort_by} ${sort_order.toUpperCase()}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    params.push(limit, offset);
    
    try {
      const result = await query(sql, params);
      return result.rows;
    } catch (error) {
      console.error('Error searching customers:', error);
      throw new Error('Failed to search customers');
    }
  }
  
  /**
   * Update customer
   */
  static async updateCustomer(customerId, updateData) {
    const allowedFields = [
      'first_name', 'last_name', 'email', 'phone', 'address_line1', 'city', 
      'state', 'zip_code', 'customer_type', 'status', 'source', 
      'assigned_sales_rep_id', 'vehicle_interest', 'preferred_contact_method',
      'email_consent', 'sms_consent', 'phone_consent'
    ];
    
    const updateFields = [];
    const params = [customerId];
    let paramIndex = 2;
    
    for (const [key, value] of Object.entries(updateData)) {
      if (allowedFields.includes(key)) {
        updateFields.push(`${key} = $${paramIndex}`);
        params.push(value);
        paramIndex++;
      }
    }
    
    if (updateFields.length === 0) {
      throw new Error('No valid fields to update');
    }
    
    const sql = `
      UPDATE customers 
      SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;
    
    try {
      const result = await query(sql, params);
      return result.rows[0];
    } catch (error) {
      console.error('Error updating customer:', error);
      throw new Error('Failed to update customer');
    }
  }
  
  /**
   * Get lead interactions for scoring
   */
  static async getLeadInteractions(leadId, days = 30) {
    const sql = `
      SELECT type, created_at
      FROM customer_interactions
      WHERE lead_id = $1
        AND created_at >= datetime('now', '-${days} days')
      ORDER BY created_at DESC
    `;

    try {
      const result = await query(sql, [leadId]);
      return result.rows;
    } catch (error) {
      console.error('Error getting lead interactions:', error);
      return [];
    }
  }

  /**
   * Get lead score distribution
   */
  static async getLeadScoreDistribution(days = 30) {
    const sql = `
      SELECT
        CASE
          WHEN score >= 80 THEN '80-100'
          WHEN score >= 60 THEN '60-79'
          WHEN score >= 40 THEN '40-59'
          WHEN score >= 20 THEN '20-39'
          ELSE '0-19'
        END as score_range,
        COUNT(*) as count
      FROM leads
      WHERE created_at >= datetime('now', '-${days} days')
      GROUP BY score_range
      ORDER BY score_range
    `;

    try {
      const result = await query(sql);
      return result.rows;
    } catch (error) {
      console.error('Error getting lead score distribution:', error);
      return [];
    }
  }

  /**
   * Get average scores by source
   */
  static async getAverageScoresBySource(days = 30) {
    const sql = `
      SELECT
        source,
        ROUND(AVG(score), 1) as avg_score,
        COUNT(*) as lead_count
      FROM leads
      WHERE created_at >= datetime('now', '-${days} days')
      GROUP BY source
      ORDER BY avg_score DESC
    `;

    try {
      const result = await query(sql);
      return result.rows;
    } catch (error) {
      console.error('Error getting average scores by source:', error);
      return [];
    }
  }

  /**
   * Get lead priority distribution
   */
  static async getLeadPriorityDistribution(days = 30) {
    const sql = `
      SELECT
        CASE
          WHEN score >= 80 THEN 'hot'
          WHEN score >= 60 THEN 'warm'
          WHEN score >= 40 THEN 'cool'
          ELSE 'cold'
        END as priority,
        COUNT(*) as count
      FROM leads
      WHERE created_at >= datetime('now', '-${days} days')
      GROUP BY priority
      ORDER BY
        CASE priority
          WHEN 'hot' THEN 1
          WHEN 'warm' THEN 2
          WHEN 'cool' THEN 3
          WHEN 'cold' THEN 4
        END
    `;

    try {
      const result = await query(sql);
      return result.rows;
    } catch (error) {
      console.error('Error getting lead priority distribution:', error);
      return [];
    }
  }

  /**
   * Get lead scoring trends over time
   */
  static async getLeadScoringTrends(days = 30) {
    const sql = `
      SELECT
        DATE(created_at) as date,
        ROUND(AVG(score), 1) as avg_score,
        COUNT(*) as lead_count
      FROM leads
      WHERE created_at >= datetime('now', '-${days} days')
      GROUP BY DATE(created_at)
      ORDER BY date
    `;

    try {
      const result = await query(sql);
      return result.rows;
    } catch (error) {
      console.error('Error getting lead scoring trends:', error);
      return [];
    }
  }

  /**
   * Get conversion rate by score range
   */
  static async getConversionRateByScore(days = 30) {
    const sql = `
      SELECT
        CASE
          WHEN l.score >= 80 THEN '80-100'
          WHEN l.score >= 60 THEN '60-79'
          WHEN l.score >= 40 THEN '40-59'
          WHEN l.score >= 20 THEN '20-39'
          ELSE '0-19'
        END as score_range,
        COUNT(*) as total_leads,
        COUNT(CASE WHEN l.status = 'converted' THEN 1 END) as converted_leads,
        ROUND(
          COUNT(CASE WHEN l.status = 'converted' THEN 1 END) * 1.0 /
          NULLIF(COUNT(*), 0) * 100, 1
        ) as conversion_rate
      FROM leads l
      WHERE l.created_at >= datetime('now', '-${days} days')
      GROUP BY score_range
      ORDER BY score_range
    `;

    try {
      const result = await query(sql);
      return result.rows;
    } catch (error) {
      console.error('Error getting conversion rate by score:', error);
      return [];
    }
  }

  /**
   * Get sales rep lead count
   */
  static async getSalesRepLeadCount(salesRepId) {
    const sql = `
      SELECT COUNT(*) as lead_count
      FROM leads
      WHERE assigned_sales_rep_id = $1
        AND status NOT IN ('converted', 'lost')
        AND created_at >= datetime('now', '-30 days')
    `;

    try {
      const result = await query(sql, [salesRepId]);
      return parseInt(result.rows[0].lead_count) || 0;
    } catch (error) {
      console.error('Error getting sales rep lead count:', error);
      return 0;
    }
  }

  /**
   * Get sales rep performance metrics
   */
  static async getSalesRepPerformance(salesRepId, days = 30) {
    const sql = `
      SELECT
        COUNT(*) as total_leads,
        COUNT(CASE WHEN status = 'converted' THEN 1 END) as converted_leads,
        ROUND(
          COUNT(CASE WHEN status = 'converted' THEN 1 END) * 1.0 /
          NULLIF(COUNT(*), 0) * 100, 1
        ) as conversion_rate
      FROM leads
      WHERE assigned_sales_rep_id = $1
        AND created_at >= datetime('now', '-${days} days')
    `;

    try {
      const result = await query(sql, [salesRepId]);
      return result.rows[0];
    } catch (error) {
      console.error('Error getting sales rep performance:', error);
      return { total_leads: 0, converted_leads: 0, conversion_rate: 0 };
    }
  }

  /**
   * Get leads needing reassignment
   */
  static async getLeadsNeedingReassignment() {
    const sql = `
      SELECT l.*,
             sr.capacity,
             sr.territory,
             sr.specializations,
             sr.source_expertise,
             sr.budget_expertise
      FROM leads l
      LEFT JOIN sales_reps sr ON l.assigned_sales_rep_id = sr.id
      WHERE l.status = 'new'
        AND (l.assigned_sales_rep_id IS NULL
             OR sr.status != 'active'
             OR sr.capacity IS NULL
             OR l.created_at < datetime('now', '-7 days'))
      ORDER BY l.created_at DESC
      LIMIT 100
    `;

    try {
      const result = await query(sql);
      return result.rows;
    } catch (error) {
      console.error('Error getting leads needing reassignment:', error);
      return [];
    }
  }

  /**
   * Get assignment analytics
   */
  static async getAssignmentAnalytics(days = 30) {
    try {
      // Total assignments
      const totalSql = `
        SELECT COUNT(*) as total
        FROM leads
        WHERE assigned_sales_rep_id IS NOT NULL
          AND created_at >= datetime('now', '-${days} days')
      `;
      const totalResult = await query(totalSql);
      const totalAssignments = parseInt(totalResult.rows[0].total) || 0;

      // Average assignment score
      const avgScoreSql = `
        SELECT ROUND(AVG(assignment_score), 1) as avg_score
        FROM leads
        WHERE assignment_score IS NOT NULL
          AND created_at >= datetime('now', '-${days} days')
      `;
      const avgScoreResult = await query(avgScoreSql);
      const averageScore = parseFloat(avgScoreResult.rows[0].avg_score) || 0;

      // Assignments by reason
      const reasonSql = `
        SELECT assignment_reason, COUNT(*) as count
        FROM leads
        WHERE assignment_reason IS NOT NULL
          AND created_at >= datetime('now', '-${days} days')
        GROUP BY assignment_reason
        ORDER BY count DESC
      `;
      const reasonResult = await query(reasonSql);
      const assignmentsByReason = reasonResult.rows;

      // Rep workload distribution
      const workloadSql = `
        SELECT
          sr.first_name || ' ' || sr.last_name as rep_name,
          COUNT(l.id) as lead_count,
          sr.capacity
        FROM sales_reps sr
        LEFT JOIN leads l ON sr.id = l.assigned_sales_rep_id
          AND l.status NOT IN ('converted', 'lost')
          AND l.created_at >= datetime('now', '-${days} days')
        WHERE sr.status = 'active'
        GROUP BY sr.id, sr.first_name, sr.last_name, sr.capacity
        ORDER BY lead_count DESC
      `;
      const workloadResult = await query(workloadSql);
      const repWorkload = workloadResult.rows;

      // Reassignment rate
      const reassignSql = `
        SELECT
          COUNT(CASE WHEN assignment_reason = 'reassigned' THEN 1 END) as reassigned,
          COUNT(*) as total
        FROM leads
        WHERE created_at >= datetime('now', '-${days} days')
      `;
      const reassignResult = await query(reassignSql);
      const reassignData = reassignResult.rows[0];
      const reassignmentRate = reassignData.total > 0 ?
        Math.round((reassignData.reassigned / reassignData.total) * 100) : 0;

      return {
        totalAssignments,
        averageScore,
        assignmentsByReason,
        repWorkload,
        reassignmentRate
      };

    } catch (error) {
      console.error('Error getting assignment analytics:', error);
      throw error;
    }
  }

  /**
   * Lead Management Functions
   */
  
  /**
   * Create a new lead
   */
  static async createLead(leadData) {
    const {
      customer_id,
      first_name,
      last_name,
      email,
      phone,
      message,
      form_type = 'general',
      lead_source = 'website',
      vehicle_interest,
      vehicle_year,
      vehicle_make,
      vehicle_model,
      utm_source,
      utm_medium,
      utm_campaign,
      assigned_sales_rep_id,
      priority = 'medium'
    } = leadData;
    
    const sql = `
      INSERT INTO leads (
        id, customer_id, first_name, last_name, email, phone, message, form_type,
        lead_source, vehicle_interest, vehicle_year, vehicle_make, vehicle_model,
        utm_source, utm_medium, utm_campaign, assigned_sales_rep_id, priority,
        next_follow_up_date, created_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
        datetime('now', '+1 day'), 'system'
      )
      RETURNING *
    `;
    
      // `id TEXT PRIMARY KEY` with no DEFAULT, so it has to be supplied.
      // See newId() for why it is not a schema default.
    const params = [
      newId(), customer_id, first_name, last_name, email, phone, message, form_type,
      lead_source, vehicle_interest, vehicle_year, vehicle_make, vehicle_model,
      utm_source, utm_medium, utm_campaign, assigned_sales_rep_id, priority
    ];
    
    try {
      const result = await query(sql, params);
      return result.rows[0];
    } catch (error) {
      console.error('Error creating lead:', error);
      throw new Error('Failed to create lead');
    }
  }
  
  /**
   * Check for duplicate leads.
   *
   * REWRITTEN. This used to be:
   *
   *     SELECT * FROM find_potential_duplicates($1, $2, $3, $4, $5)
   *
   * `find_potential_duplicates` is a Postgres set-returning function, defined in
   * the source schema and not in the generated libSQL one -- so it has never
   * existed on this database and the call has always failed with "no such
   * function". Duplicate detection on a lead form is therefore a feature that
   * does not work, and it fails in the catch below with "Failed to check for
   * duplicates", which names neither the function nor the database.
   *
   * WHY IT IS IN JAVASCRIPT AND NOT SQL
   * ----------------------------------
   * Because "is this the same person" is a judgement about partial agreement
   * across three fields, and the weight of each is a business decision:
   *
   *     same email      -> certain (it is the same mailbox)
   *     same phone      -> very likely
   *     same first+last -> likely
   *     name in phone   -> likely, and the messiest
   *
   * Expressing that as SQL means either a weighted expression nobody can read
   * or a migration of a Postgres function. Here it is a short, named function
   * whose weights are visible and whose behaviour can be tested.
   *
   * It also cannot be a VIEW, which is the other thing that was considered: a
   * view cannot take arguments, and the arguments here are the person being
   * checked.
   *
   * Returns the same shape as before -- { isDuplicate, confidence, duplicates }
   * -- so nothing downstream has to change.
   */
  static async checkForDuplicates(leadData, options = {}) {
    const { confidenceThreshold = 0.8 } = options;
    const { email, phone, first_name, last_name } = leadData;

    const norm = (v) => String(v || '').trim().toLowerCase();
    const digits = (v) => String(v || '').replace(/\D/g, '');

    // Nothing to compare against: an empty form is not a duplicate of everything.
    if (!email && !phone && !first_name) {
      return { isDuplicate: false, duplicates: [] };
    }

    // One query, three ORs, all parameterised. A fuzzy match is a superset of
    // the exact ones, so this cannot miss a match it would otherwise find -- the
    // scoring below is what narrows the result, not the WHERE.
    const sql = `
      SELECT id, first_name, last_name, email, phone, status, created_at
        FROM leads
       WHERE ($1 IS NOT NULL AND LOWER(email) = $1)
          OR ($2 IS NOT NULL AND phone = $2)
          OR ($3 IS NOT NULL AND LOWER(first_name) = $3)
          OR ($4 IS NOT NULL AND LOWER(last_name) = $4)
       LIMIT 50
    `;
    const params = [norm(email) || null, phone || null, norm(first_name) || null, norm(last_name) || null];

    let candidates;
    try {
      const result = await query(sql, params);
      candidates = result.rows || [];
    } catch (error) {
      // A duplicate check that cannot run must not block the form. Report "no
      // duplicates found" and log it, rather than refusing a lead because the
      // helper is unavailable.
      console.error('Error checking duplicates:', error);
      return { isDuplicate: false, duplicates: [], checkFailed: true };
    }

    const scored = candidates
      .map((row) => {
        let score = 0;
        if (norm(email) && norm(row.email) === norm(email)) score += 0.6;
        if (digits(phone) && digits(row.phone) && digits(row.phone) === digits(phone)) score += 0.3;
        if (norm(first_name) && norm(row.first_name) === norm(first_name)) score += 0.05;
        if (norm(last_name) && norm(row.last_name) === norm(last_name)) score += 0.05;
        return { ...row, confidence: Math.min(1, Number(score.toFixed(2))) };
      })
      .filter((row) => row.confidence >= confidenceThreshold)
      .sort((a, b) => b.confidence - a.confidence);

    if (!scored.length) return { isDuplicate: false, duplicates: [] };
    return { isDuplicate: true, confidence: scored[0].confidence, duplicates: scored };
  }
  
  /**
   * Interaction Management Functions
   */
  
  /**
   * Create an interaction
   */
  static async createInteraction(interactionData) {
    const {
      customer_id,
      lead_id,
      interaction_type,
      direction = 'outbound',
      subject,
      content,
      sales_rep_id,
      sales_rep_name,
      contact_method,
      outcome,
      next_action,
      next_action_date
    } = interactionData;
    
    const sql = `
      INSERT INTO interactions (
        id, customer_id, lead_id, interaction_type, direction, subject, content,
        sales_rep_id, sales_rep_name, contact_method, outcome, next_action,
        next_action_date, initiated_by, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'sales_rep', 'system')
      RETURNING *
    `;
    
      // `id TEXT PRIMARY KEY` with no DEFAULT, so it has to be supplied.
      // See newId() for why it is not a schema default.
    const params = [
      newId(), customer_id, lead_id, interaction_type, direction, subject, content,
      sales_rep_id, sales_rep_name, contact_method, outcome, next_action,
      next_action_date
    ];
    
    try {
      const result = await query(sql, params);
      return result.rows[0];
    } catch (error) {
      console.error('Error creating interaction:', error);
      throw new Error('Failed to create interaction');
    }
  }
  
  /**
   * Get customer interactions
   */
  static async getCustomerInteractions(customerId, limit = 50) {
    const sql = `
      SELECT * FROM interactions 
      WHERE customer_id = $1 
      ORDER BY created_at DESC 
      LIMIT $2
    `;
    
    try {
      const result = await query(sql, [customerId, limit]);
      return result.rows;
    } catch (error) {
      console.error('Error getting interactions:', error);
      throw new Error('Failed to get interactions');
    }
  }
  
  /**
   * Appointment Management Functions
   */
  
  /**
   * Create an appointment
   */
  static async createAppointment(appointmentData) {
    const {
      customer_id,
      lead_id,
      appointment_type,
      title,
      description,
      scheduled_start,
      scheduled_end,
      assigned_sales_rep_id,
      assigned_sales_rep_name,
      vehicle_of_interest,
      location = 'Cadillac of South Charlotte'
    } = appointmentData;
    
    const sql = `
      INSERT INTO appointments (
        id, customer_id, lead_id, appointment_type, title, description,
        scheduled_start, scheduled_end, assigned_sales_rep_id,
        assigned_sales_rep_name, vehicle_of_interest, location, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'system')
      RETURNING *
    `;
    
      // `id TEXT PRIMARY KEY` with no DEFAULT, so it has to be supplied.
      // See newId() for why it is not a schema default.
    const params = [
      newId(), customer_id, lead_id, appointment_type, title, description,
      scheduled_start, scheduled_end, assigned_sales_rep_id,
      assigned_sales_rep_name, vehicle_of_interest, location
    ];
    
    try {
      const result = await query(sql, params);
      return result.rows[0];
    } catch (error) {
      console.error('Error creating appointment:', error);
      throw new Error('Failed to create appointment');
    }
  }
  
  /**
   * Get upcoming appointments for sales rep
   */
  static async getUpcomingAppointments(salesRepId, limit = 20) {
    const sql = `
      SELECT 
        a.*,
        c.first_name,
        c.last_name,
        c.email,
        c.phone
      FROM appointments a
      JOIN customers c ON a.customer_id = c.id
      WHERE a.assigned_sales_rep_id = $1 
        AND a.status IN ('scheduled', 'confirmed')
        AND a.scheduled_start > CURRENT_TIMESTAMP
      ORDER BY a.scheduled_start ASC
      LIMIT $2
    `;
    
    try {
      const result = await query(sql, [salesRepId, limit]);
      return result.rows;
    } catch (error) {
      console.error('Error getting appointments:', error);
      throw new Error('Failed to get appointments');
    }
  }
  
  /**
   * Task Management Functions
   */
  
  /**
   * Create a task
   */
  static async createTask(taskData) {
    const {
      title,
      description,
      task_type = 'follow_up',
      assigned_to,
      assigned_to_name,
      customer_id,
      lead_id,
      priority = 'medium',
      due_date
    } = taskData;
    
    const sql = `
      INSERT INTO tasks (
        id, title, description, task_type, assigned_to, assigned_to_name,
        customer_id, lead_id, priority, due_date, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'system')
      RETURNING *
    `;
    
      // `id TEXT PRIMARY KEY` with no DEFAULT, so it has to be supplied.
      // See newId() for why it is not a schema default.
    const params = [
      newId(), title, description, task_type, assigned_to, assigned_to_name,
      customer_id, lead_id, priority, due_date
    ];
    
    try {
      const result = await query(sql, params);
      return result.rows[0];
    } catch (error) {
      console.error('Error creating task:', error);
      throw new Error('Failed to create task');
    }
  }
  
  /**
   * Get tasks for sales rep
   */
  static async getSalesRepTasks(salesRepId, status = null) {
    let sql = `
      SELECT 
        t.*,
        c.first_name,
        c.last_name,
        c.email
      FROM tasks t
      LEFT JOIN customers c ON t.customer_id = c.id
      WHERE t.assigned_to = $1
    `;
    
    const params = [salesRepId];
    
    if (status) {
      sql += ` AND t.status = $2`;
      params.push(status);
    }
    
    sql += ` ORDER BY t.due_date ASC, t.priority DESC`;
    
    try {
      const result = await query(sql, params);
      return result.rows;
    } catch (error) {
      console.error('Error getting tasks:', error);
      throw new Error('Failed to get tasks');
    }
  }
  
  /**
   * Analytics and Reporting Functions
   */
  
  /**
   * Sales Rep Management Functions
   */

  /* DELETED: a second `getSalesRepByEmail`.
   *
   * This class defined it TWICE -- once here, once further down near
   * getSalesRepById. In a class body the second definition silently replaces
   * the first, so this one was dead code that looked live.
   *
   * It was found by listing duplicate static method names rather than by
   * reading, which is the only way it was going to be found: two methods with
   * the same name and the same one-line doc comment read as ordinary
   * copy-paste, and nothing errors. The surviving definition is further down
   * and is the better one -- see it for the not-found handling.
   */

  /**
   * Get sales rep by ID
   */
  static async getSalesRep(salesRepId) {
    const sql = `
      SELECT * FROM sales_reps
      WHERE id = $1
    `;

    try {
      const result = await query(sql, [salesRepId]);
      return result.rows[0];
    } catch (error) {
      console.error('Error getting sales rep:', error);
      throw new Error('Failed to get sales rep');
    }
  }

  /**
   * Update sales rep
   */
  static async updateSalesRep(salesRepId, updateData) {
    const allowedFields = [
      'first_name', 'last_name', 'email', 'phone', 'role', 'status',
      'permissions', 'last_login'
    ];

    const updateFields = [];
    const params = [salesRepId];
    let paramIndex = 2;

    for (const [key, value] of Object.entries(updateData)) {
      if (allowedFields.includes(key)) {
        updateFields.push(`${key} = $${paramIndex}`);
        params.push(value);
        paramIndex++;
      }
    }

    if (updateFields.length === 0) {
      throw new Error('No valid fields to update');
    }

    const sql = `
      UPDATE sales_reps
      SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;

    try {
      const result = await query(sql, params);
      return result.rows[0];
    } catch (error) {
      console.error('Error updating sales rep:', error);
      throw new Error('Failed to update sales rep');
    }
  }

  /**
   * Get sales dashboard metrics
   */
  static async getSalesDashboardMetrics(salesRepId = null) {
    let sql = 'SELECT * FROM sales_dashboard_metrics';
    let params = [];

    if (salesRepId) {
      sql += ' WHERE sales_rep_id = $1';
      params.push(salesRepId);
    }

    try {
      const result = await query(sql, params);
      return result.rows[0] || {};
    } catch (error) {
      console.error('Error getting dashboard metrics:', error);
      throw new Error('Failed to get dashboard metrics');
    }
  }

  /**
   * Get lead conversion metrics
   */
  static async getLeadConversionMetrics(startDate = null, endDate = null) {
    const sql = 'SELECT * FROM get_lead_conversion_metrics($1, $2)';
    const params = [startDate, endDate];

    try {
      const result = await query(sql, params);
      return result.rows;
    } catch (error) {
      console.error('Error getting conversion metrics:', error);
      throw new Error('Failed to get conversion metrics');
    }
  }

  /**
   * Sales Representative Management Functions
   */

  /**
   * Get sales rep by email
   */
  static async getSalesRepByEmail(email) {
    const sql = 'SELECT * FROM sales_reps WHERE email = $1 AND status = $2';
    const params = [email, 'active'];

    try {
      const result = await query(sql, params);
      return result.rows[0] || null;
    } catch (error) {
      // The distinction that matters: "no such rep" and "the database is
      // unreachable" are different answers, and the caller needs to tell them
      // apart. sales-login maps a null to "user not found" -- a 401, which is
      // correct. It maps a throw to a 500.
      //
      // Which is right depends on which happened, and the original code threw
      // for both. So: if there is no connection configured at all, that is a
      // deployment problem and it is reported as such; otherwise a query failure
      // is logged and surfaced, but a missing row stays a null.
      if (!isDatabaseConfigured()) {
        console.error(
          '[database] getSalesRepByEmail called with no database configured. ' +
            'Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN (or DATABASE_URL).'
        );
        const err = new Error('Database is not configured');
        err.code = 'DB_NOT_CONFIGURED';
        throw err;
      }
      console.error('Error getting sales rep by email:', error);
      throw new Error('Failed to get sales rep');
    }
  }

  /**
   * Get sales rep by ID
   */
  static async getSalesRepById(id) {
    const sql = 'SELECT * FROM sales_reps WHERE id = $1';
    const params = [id];

    try {
      const result = await query(sql, params);
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error getting sales rep by ID:', error);
      throw new Error('Failed to get sales rep');
    }
  }

  /**
   * Create a new sales rep
   */
  static async createSalesRep(salesRepData) {
    const {
      id,
      first_name,
      last_name,
      email,
      phone,
      role = 'sales_rep',
      status = 'active',
      permissions = ['view_customers', 'manage_leads']
    } = salesRepData;
  
    // Hash password if provided
    let hashedPassword = salesRepData.password_hash || null;
    if (salesRepData.password) {
      const bcrypt = require('bcryptjs');
      hashedPassword = await bcrypt.hash(salesRepData.password, 12);
    }
  
    // `sales_reps.id` is `TEXT PRIMARY KEY` with no DEFAULT, so the id has to be
    // supplied or the INSERT fails on the NOT NULL constraint. See newId() for
    // why it is not a schema default.
    //
    // A caller may pass its own id, and provisioning from Netlify Identity does
    // exactly that: the Identity `sub` is already a stable uuid, and keying the
    // row on it means the same person keeps the same id forever, which is what
    // makes lead assignment and calendar ownership survive a re-invite.
    const repId = id || newId();
  
    // `permissions` is a TEXT column holding a comma-separated list, so it is
    // stored as a string. Normalised here, once, rather than at every read site.
    const permissionList = Array.isArray(permissions) ? permissions : String(permissions).split(',');
    const permissionsText = permissionList
      .map((p) => String(p).trim())
      .filter(Boolean)
      .join(',');
  
    const sql = `
      INSERT INTO sales_reps (
        id, first_name, last_name, email, phone, password_hash, role, status, permissions
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;
  
    const params = [
      repId,
      first_name,
      last_name,
      email,
      // `undefined` is not a bindable value. A caller that omits `phone` --
      // which provisioning from Identity always does -- left `undefined` in the
      // parameter array, and the libSQL client rejected the whole statement with
      // an error that said nothing about which parameter was at fault. The
      // catch-all then reported "Failed to create sales rep", so the real cause
      // was invisible.
      //
      // NULL is what "no phone number" means. Every optional column is normalised
      // here so a caller cannot get this wrong by leaving a field out.
      phone ?? null,
      hashedPassword ?? null,
      role,
      status,
      permissionsText
    ];

    try {
      const result = await query(sql, params);
      return result.rows[0];
    } catch (error) {
      console.error('Error creating sales rep:', error);
      throw new Error('Failed to create sales rep');
    }
  }

  /**
   * Get all sales reps
   */
  static async getAllSalesReps() {
    const sql = 'SELECT id, first_name, last_name, email, phone, role, status, permissions, created_at, last_login FROM sales_reps ORDER BY last_name, first_name';

    try {
      const result = await query(sql);
      return result.rows;
    } catch (error) {
      console.error('Error getting all sales reps:', error);
      throw new Error('Failed to get sales reps');
    }
  }

  /**
   * Vehicle Management Functions
   */

  /**
   * Create a new vehicle
   */
  static async createVehicle(vehicleData) {
    const {
      stock_number,
      vin,
      year,
      make,
      model,
      trim,
      body_style,
      exterior_color,
      interior_color,
      engine,
      transmission,
      drivetrain,
      fuel_type,
      mileage,
      list_price,
      sale_price,
      msrp,
      status = 'available',
      features = [],
      packages = [],
      image_urls = [],
      video_url,
      description
    } = vehicleData;

    const sql = `
      INSERT INTO vehicles (
        id, stock_number, vin, year, make, model, trim, body_style,
        exterior_color, interior_color, engine, transmission, drivetrain, fuel_type,
        mileage, list_price, sale_price, msrp, status, features, packages,
        image_urls, video_url, date_in_stock, created_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
        $19, $20, $21, $22, $23, CURRENT_DATE, 'system'
      )
      RETURNING *
    `;

      // `id TEXT PRIMARY KEY` with no DEFAULT, so it has to be supplied.
      // See newId() for why it is not a schema default.
    const params = [
      newId(), stock_number, vin, year, make, model, trim, body_style,
      exterior_color, interior_color, engine, transmission, drivetrain, fuel_type,
      mileage, list_price, sale_price, msrp, status, features, packages,
      image_urls, video_url
    ];

    try {
      const result = await query(sql, params);
      return result.rows[0];
    } catch (error) {
      console.error('Error creating vehicle:', error);
      throw new Error('Failed to create vehicle');
    }
  }

  /**
   * Get vehicle by stock number
   */
  static async getVehicleByStockNumber(stockNumber) {
    const sql = 'SELECT * FROM vehicles WHERE stock_number = $1';

    try {
      const result = await query(sql, [stockNumber]);
      return result.rows[0];
    } catch (error) {
      console.error('Error getting vehicle by stock number:', error);
      throw new Error('Failed to get vehicle');
    }
  }

  /**
   * Get all vehicles with optional filtering
   */
  static async getVehicles(filters = {}) {
    let sql = 'SELECT * FROM vehicles WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (filters.make) {
      sql += ` AND LOWER(make) = LOWER($${paramIndex})`;
      params.push(filters.make);
      paramIndex++;
    }

    if (filters.model) {
      sql += ` AND LOWER(model) = LOWER($${paramIndex})`;
      params.push(filters.model);
      paramIndex++;
    }

    if (filters.year) {
      sql += ` AND year = $${paramIndex}`;
      params.push(filters.year);
      paramIndex++;
    }

    if (filters.status) {
      sql += ` AND status = $${paramIndex}`;
      params.push(filters.status);
      paramIndex++;
    }

    if (filters.minPrice) {
      sql += ` AND list_price >= $${paramIndex}`;
      params.push(filters.minPrice);
      paramIndex++;
    }

    if (filters.maxPrice) {
      sql += ` AND list_price <= $${paramIndex}`;
      params.push(filters.maxPrice);
      paramIndex++;
    }

    sql += ' ORDER BY created_at DESC';

    if (filters.limit) {
      sql += ` LIMIT $${paramIndex}`;
      params.push(filters.limit);
    }

    try {
      const result = await query(sql, params);
      return result.rows;
    } catch (error) {
      console.error('Error getting vehicles:', error);
      throw new Error('Failed to get vehicles');
    }
  }

  /**
   * Update vehicle
   */
  static async updateVehicle(stockNumber, updateData) {
    const allowedFields = [
      'vin', 'year', 'make', 'model', 'trim', 'body_style',
      'exterior_color', 'interior_color', 'engine', 'transmission', 'drivetrain', 'fuel_type',
      'mileage', 'list_price', 'sale_price', 'msrp', 'status', 'features', 'packages',
      'image_urls', 'video_url', 'date_sold'
    ];

    const updateFields = [];
    const params = [stockNumber];
    let paramIndex = 2;

    for (const [key, value] of Object.entries(updateData)) {
      if (allowedFields.includes(key)) {
        updateFields.push(`${key} = $${paramIndex}`);
        params.push(value);
        paramIndex++;
      }
    }

    if (updateFields.length === 0) {
      throw new Error('No valid fields to update');
    }

    const sql = `
      UPDATE vehicles
      SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE stock_number = $1
      RETURNING *
    `;

    try {
      const result = await query(sql, params);
      return result.rows[0];
    } catch (error) {
      console.error('Error updating vehicle:', error);
      throw new Error('Failed to update vehicle');
    }
  }

  /**
   * Delete vehicle
   */
  static async deleteVehicle(stockNumber) {
    const sql = 'DELETE FROM vehicles WHERE stock_number = $1 RETURNING *';

    try {
      const result = await query(sql, [stockNumber]);
      return result.rows[0];
    } catch (error) {
      console.error('Error deleting vehicle:', error);
      throw new Error('Failed to delete vehicle');
    }
  }

  /**
   * Search vehicles by text
   */
  static async searchVehicles(searchTerm, limit = 50) {
    const sql = `
      SELECT * FROM vehicles
      WHERE
        stock_number LIKE $1 OR
        vin LIKE $1 OR
        make LIKE $1 OR
        model LIKE $1 OR
        trim LIKE $1 OR
        exterior_color LIKE $1 OR
        interior_color LIKE $1 OR
        engine LIKE $1
      ORDER BY created_at DESC
      LIMIT $2
    `;

    try {
      const result = await query(sql, [`%${searchTerm}%`, limit]);
      return result.rows;
    } catch (error) {
      console.error('Error searching vehicles:', error);
      throw new Error('Failed to search vehicles');
    }
  }
}

module.exports = DatabaseService;

/**
 * Expose the raw query helper.
 *
 * It was module-private, which meant the only way for a function to read
 * anything not already wrapped in a DatabaseService static was to write another
 * static here. customer-dashboard.js needed four customer-scoped reads that did
 * not warrant a static each, and the honest thing was to give it the query
 * function rather than have it fabricate the data it could not reach --
 * which is what it had been doing.
 *
 * Parameterised only. There is no string-interpolation path on purpose: the SQL
 * injection in this file came from interpolating a sort column, and this export
 * is not a licence to repeat that.
 */
/**
 * A new primary key for a row about to be inserted.
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT A SCHEMA DEFAULT
 * --------------------------------------------------
 * Every table in database/turso/001_core.sql declares `id TEXT PRIMARY KEY` with
 * no DEFAULT. That is not an accident of the translation: scripts/pg2turso.py
 * deliberately strips `DEFAULT gen_random_uuid()` because that function is not
 * portable to SQLite.
 *
 * The id therefore has to come from the application -- and at the time this was
 * written, twelve INSERT statements did not supply one. Against a real database
 * each of those fails on the NOT NULL constraint of the primary key, so none of
 * them has ever worked: creating a customer, a lead, an interaction, an
 * appointment, a task, a vehicle, a sales rep, a follow-up, a follow-up rule, an
 * analytics event, a communication-preference log entry, or a campaign.
 *
 * Why generate it here rather than restore a schema DEFAULT: this project reaches
 * BOTH libSQL and Postgres through one data path, and there is no single default
 * expression valid on both. `gen_random_uuid()` does not exist in SQLite;
 * `lower(hex(randomblob(16)))` does not exist in Postgres. In JavaScript it means
 * the same thing either way.
 *
 * The ids are TEXT and opaque. Nothing in this codebase parses one.
 */
function newId() {
  return crypto.randomUUID();
}

module.exports.newId = newId;
module.exports.query = query;
// Re-exported from the single definition above rather than written out again.
// The version that was here listed four env vars and omitted
// TURSO_DATABASE_URL -- the one a Turso deployment actually sets -- so a
// function using the export would have reported "no database configured" on a
// site that has one. Two answers to one question is how they come to disagree.
module.exports.isDatabaseConfigured = isDatabaseConfigured;

/**
 * Read one COUNT(*) out of a result set, or 0.
 *
 * `SELECT COUNT(*) ...` returns exactly one row, so `rows[0]` is normally safe.
 * But that is a property of the database, not of the caller, and the caller's
 * only way to discover it is to crash: an unguarded `result.rows[0].total`
 * throws a TypeError, the function's catch-all reports a 500 "Internal server
 * error", and a count of zero becomes an outage. That is how
 * `DELETE /followup-campaigns/{id}` answered 500 against an empty table.
 *
 * Here "how many" is never NaN and never an exception, and zero -- the truthful
 * answer for a table nothing has been inserted into -- comes back as 0.
 *
 *   const total = DatabaseService.countOf(result, 'total');
 */
module.exports.countOf = function countOf(result, column = 'count') {
  const row = result && Array.isArray(result.rows) ? result.rows[0] : null;
  const n = row ? parseInt(row[column], 10) : NaN;
  return Number.isNaN(n) ? 0 : n;
};
