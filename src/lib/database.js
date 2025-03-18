import { Pool } from 'pg';

// Initialize the PostgreSQL connection pool
const dbConfig = {
  host: process.env.SUPABASE_PG_HOST,
  port: process.env.SUPABASE_PG_PORT,
  database: process.env.SUPABASE_PG_DATABASE,
  user: process.env.SUPABASE_PG_USER,
  password: process.env.SUPABASE_PG_PASSWORD,
  ssl: {
    rejectUnauthorized: false // Required for Supabase PostgreSQL connections
  }
};

// Check if environment variables are configured
if (!dbConfig.host || !dbConfig.user || !dbConfig.password) {
  console.error(
    'Missing Supabase PostgreSQL environment variables. Please check your .env file.'
  );
}

// Create connection pool
const pool = new Pool(dbConfig);

// Test the connection on init
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('PostgreSQL connection error:', err.message);
  } else {
    console.log('PostgreSQL connected successfully at:', res.rows[0].now);
  }
});

/**
 * Execute a SQL query against the PostgreSQL database
 * @param {string} text - The SQL query text
 * @param {Array} params - The query parameters
 * @returns {Promise} - Query result
 */
export async function query(text, params) {
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
export async function getClient() {
  const client = await pool.connect();
  return client;
}

export default {
  query,
  getClient,
  pool
};
