const { Pool } = require('pg');

// Initialize the PostgreSQL connection pool
const dbConfig = {
  host: process.env.SUPABASE_PG_HOST,
  port: process.env.SUPABASE_PG_PORT,
  database: process.env.SUPABASE_PG_DATABASE,
  user: process.env.SUPABASE_PG_USER,
  password: process.env.SUPABASE_PG_PASSWORD,
  ssl: {
    rejectUnauthorized: false, // Required for Supabase PostgreSQL connections
  },
};

// Check if environment variables are configured
if (!dbConfig.host || !dbConfig.user || !dbConfig.password) {
  console.error(
    'Missing Supabase PostgreSQL environment variables. Please check your .env file.'
  );
}

// Create connection pool
const pool = new Pool(dbConfig);

/**
 * Execute a SQL query against the PostgreSQL database
 * @param {string} text - The SQL query text
 * @param {Array} params - The query parameters
 * @returns {Promise} - Query result
 */
async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text, duration, rows: res.rowCount });
    return res;
  } catch (err) {
    console.error('Query error:', err);
    throw err;
  }
}

/**
 * Get a dedicated client from the pool for transactions
 * @returns {Object} - PostgreSQL client
 */
async function getClient() {
  return pool.connect();
}

module.exports = { query, getClient, pool };
