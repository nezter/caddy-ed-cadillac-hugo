/**
 * Enhanced Database Service
 * Optimized database operations with connection pooling, caching, and retry logic
 */

const { Pool } = require('pg');
const { createClient } = require('@supabase/supabase-js');
const { createClient: createTursoClient } = require('@libsql/client');

// Enhanced connection management
class EnhancedDatabaseService {
  constructor() {
    this.supabase = null;
    this.turso = null;
    this.pgPool = null;
    this.pgPoolInitPromise = null;
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes default cache
    this.queryStats = {
      totalQueries: 0,
      cacheHits: 0,
      slowQueries: 0,
      errors: 0
    };
    this.slowQueryThreshold = 1000; // 1 second
  }

  /**
   * Initialize database connections with enhanced configuration
   */
  async initializeConnections() {
    await this.initializeSupabase();
    await this.initializeTurso();
    await this.initializePgPool();
  }

  /**
   * Initialize Supabase client
   */
  async initializeSupabase() {
    if (this.supabase) return this.supabase;

    try {
      this.supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false
          },
          db: {
            schema: 'public'
          },
          global: {
            headers: {
              'x-connection-pool': 'enhanced'
            }
          }
        }
      );
      console.log('✅ Enhanced Supabase client initialized');
      return this.supabase;
    } catch (error) {
      console.error('Failed to initialize Supabase:', error.message);
      throw error;
    }
  }

  /**
   * Initialize Turso client for read operations
   */
  async initializeTurso() {
    if (this.turso || !process.env.TURSO_DATABASE_URL) return this.turso;

    try {
      this.turso = createTursoClient({
        url: process.env.TURSO_DATABASE_URL,
        authToken: process.env.TURSO_AUTH_TOKEN,
        // Turso-specific optimizations
        fetch: (url, options) => {
          return fetch(url, {
            ...options,
            // Add connection pooling headers
            headers: {
              ...options?.headers,
              'Connection': 'keep-alive',
              'Keep-Alive': 'timeout=30'
            }
          });
        }
      });
      console.log('✅ Enhanced Turso client initialized');
      return this.turso;
    } catch (error) {
      console.warn('Turso initialization failed:', error.message);
      return null;
    }
  }

  /**
   * Initialize PostgreSQL connection pool with enhanced settings
   */
  async initializePgPool() {
    if (this.pgPool) return this.pgPool;
    if (this.pgPoolInitPromise) return this.pgPoolInitPromise;

    this.pgPoolInitPromise = (async () => {
      const connectionString = this.getDatabaseConnectionString();
      
      if (!connectionString) {
        console.warn('Database connection string not configured');
        return null;
      }

      const maxConnections = Math.min(
        parseInt(process.env.DB_POOL_MAX || '10', 10),
        20 // Safety limit
      );
      
      const minConnections = parseInt(process.env.DB_POOL_MIN || '2', 10);
      const idleTimeoutMillis = parseInt(process.env.DB_POOL_IDLE || '30000', 10);
      const connectionTimeoutMillis = parseInt(process.env.DB_CONNECTION_TIMEOUT || '10000', 10);

      this.pgPool = new Pool({
        connectionString,
        max: maxConnections,
        min: minConnections,
        idleTimeoutMillis,
        connectionTimeoutMillis,
        // Enhanced SSL configuration
        ssl: this.getSSLConfig(),
        // Connection retry settings
        retry: 3,
        retryDelay: 1000,
        // Performance optimizations
        statement_timeout: 30000, // 30 seconds
        query_timeout: 25000, // 25 seconds
        // Application name for monitoring
        application_name: 'followup_system_enhanced'
      });

      // Enhanced error handling
      this.pgPool.on('error', (err) => {
        console.error('PostgreSQL pool error:', {
          message: err.message,
          severity: err.severity,
          detail: err.detail,
          hint: err.hint
        });
        this.queryStats.errors++;
      });

      this.pgPool.on('connect', (client) => {
        console.log('New PostgreSQL connection established');
      });

      this.pgPool.on('remove', (client) => {
        console.log('PostgreSQL connection removed');
      });

      // Test connection with retry logic
      await this.testConnectionWithRetry();
      
      console.log(`✅ Enhanced PostgreSQL pool initialized (${minConnections}-${maxConnections} connections)`);
      return this.pgPool;
    })();

    return this.pgPoolInitPromise;
  }

  /**
   * Get database connection string from environment
   */
  getDatabaseConnectionString() {
    return process.env.SUPABASE_DB_URL ||
           process.env.SUPABASE_DATABASE_URL ||
           process.env.SUPABASE_DB_CONNECTION ||
           process.env.DATABASE_URL;
  }

  /**
   * Get SSL configuration based on environment
   */
  getSSLConfig() {
    if (process.env.NODE_ENV === 'production') {
      return {
        rejectUnauthorized: true,
        require: true
      };
    } else {
      return {
        rejectUnauthorized: false
      };
    }
  }

  /**
   * Test database connection with retry logic
   */
  async testConnectionWithRetry(maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.pgPool.query('SELECT 1 as test, version() as version');
        console.log('Database connection test passed:', result.rows[0].version.split(' ')[0]);
        return true;
      } catch (error) {
        console.error(`Connection test attempt ${attempt} failed:`, error.message);
        if (attempt === maxRetries) {
          throw error;
        }
        await this.delay(Math.pow(2, attempt) * 1000); // Exponential backoff
      }
    }
  }

  /**
   * Execute query with performance monitoring and caching
   */
  async query(sql, params = [], options = {}) {
    const startTime = Date.now();
    this.queryStats.totalQueries++;

    try {
      // Check cache for SELECT queries
      if (options.cache !== false && sql.trim().toUpperCase().startsWith('SELECT')) {
        const cacheKey = this.generateCacheKey(sql, params);
        const cached = this.getFromCache(cacheKey);
        if (cached) {
          this.queryStats.cacheHits++;
          return cached;
        }
      }

      const pool = await this.initializePgPool();
      if (!pool) {
        throw new Error('Database pool not available');
      }

      const result = await pool.query(sql, params);
      const executionTime = Date.now() - startTime;

      // Log slow queries
      if (executionTime > this.slowQueryThreshold) {
        this.queryStats.slowQueries++;
        console.warn('Slow query detected:', {
          sql: sql.substring(0, 100) + '...',
          executionTime: `${executionTime}ms`,
          paramCount: params.length
        });
      }

      // Cache successful SELECT queries
      if (options.cache !== false && sql.trim().toUpperCase().startsWith('SELECT')) {
        const cacheKey = this.generateCacheKey(sql, params);
        this.setCache(cacheKey, result, options.cacheTimeout || this.cacheTimeout);
      }

      return result;
    } catch (error) {
      this.queryStats.errors++;
      console.error('Query execution failed:', {
        error: error.message,
        sql: sql.substring(0, 100) + '...',
        paramCount: params.length
      });
      throw error;
    }
  }

  /**
   * Execute transaction with enhanced error handling
   */
  async transaction(callback) {
    const pool = await this.initializePgPool();
    if (!pool) {
      throw new Error('Database pool not available for transaction');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Transaction failed:', error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Batch execute multiple queries
   */
  async batchQuery(queries) {
    const pool = await this.initializePgPool();
    if (!pool) {
      throw new Error('Database pool not available for batch queries');
    }

    const results = [];
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      for (const { sql, params, options } of queries) {
        const startTime = Date.now();
        const result = await client.query(sql, params);
        const executionTime = Date.now() - startTime;
        
        results.push({
          result,
          executionTime,
          sql: sql.substring(0, 100) + '...'
        });
      }
      
      await client.query('COMMIT');
      return results;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Batch query failed:', error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get cached data
   */
  getFromCache(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.data;
    }
    this.cache.delete(key);
    return null;
  }

  /**
   * Set cache data
   */
  setCache(key, data, ttl = this.cacheTimeout) {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });

    // Clean up old cache entries periodically
    if (this.cache.size > 1000) {
      this.cleanupCache();
    }
  }

  /**
   * Clean up expired cache entries
   */
  cleanupCache() {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > value.ttl) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Generate cache key from query and parameters
   */
  generateCacheKey(sql, params) {
    return `${sql}:${JSON.stringify(params)}`;
  }

  /**
   * Clear cache for specific pattern
   */
  clearCache(pattern = null) {
    if (pattern) {
      for (const key of this.cache.keys()) {
        if (key.includes(pattern)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }

  /**
   * Get query performance statistics
   */
  getQueryStats() {
    return {
      ...this.queryStats,
      cacheHitRate: this.queryStats.totalQueries > 0 
        ? (this.queryStats.cacheHits / this.queryStats.totalQueries * 100).toFixed(2) + '%'
        : '0%',
      slowQueryRate: this.queryStats.totalQueries > 0
        ? (this.queryStats.slowQueries / this.queryStats.totalQueries * 100).toFixed(2) + '%'
        : '0%',
      errorRate: this.queryStats.totalQueries > 0
        ? (this.queryStats.errors / this.queryStats.totalQueries * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  /**
   * Health check for all database connections
   */
  async healthCheck() {
    const health = {
      supabase: false,
      turso: false,
      postgres: false,
      cache: {
        size: this.cache.size,
        maxSize: 1000
      },
      stats: this.getQueryStats()
    };

    try {
      // Test Supabase
      if (this.supabase) {
        const { data, error } = await this.supabase.from('followup_campaigns').select('count').limit(1);
        health.supabase = !error;
      }
    } catch (error) {
      console.error('Supabase health check failed:', error.message);
    }

    try {
      // Test Turso
      if (this.turso) {
        const result = await this.turso.execute('SELECT 1 as test');
        health.turso = result.rows.length > 0;
      }
    } catch (error) {
      console.error('Turso health check failed:', error.message);
    }

    try {
      // Test PostgreSQL
      const pool = await this.initializePgPool();
      if (pool) {
        const result = await pool.query('SELECT 1 as test');
        health.postgres = result.rows.length > 0;
      }
    } catch (error) {
      console.error('PostgreSQL health check failed:', error.message);
    }

    return health;
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log('Shutting down enhanced database service...');
    
    if (this.pgPool) {
      await this.pgPool.end();
      console.log('PostgreSQL pool closed');
    }
    
    this.cache.clear();
    console.log('Cache cleared');
  }

  /**
   * Utility delay function
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
const enhancedDatabaseService = new EnhancedDatabaseService();

// Initialize on module load
enhancedDatabaseService.initializeConnections().catch(error => {
  console.error('Failed to initialize enhanced database service:', error);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await enhancedDatabaseService.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await enhancedDatabaseService.shutdown();
  process.exit(0);
});

module.exports = enhancedDatabaseService;