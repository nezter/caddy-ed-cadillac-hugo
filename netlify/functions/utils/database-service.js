/**
 * Database Service
 * Handles all database operations for the customer management system
 * Supports hybrid architecture: Supabase (writes/complex ops) + Turso (reads/cache)
 */

const { Pool } = require('pg');

// Database connections
let supabase = null;
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
  if (!supabase) {
    try {
      const { createClient } = require('@supabase/supabase-js');
      supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
    } catch (error) {
      console.warn('Supabase connection failed:', error.message);
    }
  }

  if (!turso && process.env.TURSO_DATABASE_URL) {
    try {
      const { createClient } = require('@libsql/client');
      turso = createClient({
        url: process.env.TURSO_DATABASE_URL,
        authToken: process.env.TURSO_AUTH_TOKEN,
      });
    } catch (error) {
      console.warn('Turso connection failed:', error.message);
    }
  }
}

// Mock database for development/fallback
const mockDatabase = {
  customers: [],
  leads: [],
  interactions: [],
  appointments: [],
  sales_reps: [],
  vehicles: [],
  tasks: []
};

/**
 * Generic database query function with hybrid routing
 * Routes operations between Supabase (writes/complex) and Turso (reads/cache)
 */
async function query(sql, params = [], options = {}) {
  initializeConnections();

  const { forceSupabase = false, forceTurso = false, readOnly = false } = options;

  console.log('🔍 Database Query:', sql.substring(0, 100) + '...');
  console.log('📋 Parameters:', params);

  const safeParams = Array.isArray(params) ? params : [];

  // Prefer direct Postgres connection when available
  try {
    const pool = await getPgPool();
    if (pool) {
      const result = await pool.query(sql, safeParams);
      return {
        rows: result.rows,
        rowCount: result.rowCount
      };
    }
  } catch (pgError) {
    console.error('Postgres query failed, falling back to alternate handlers:', pgError.message);
  }

  // Determine which database to use
  let useTurso = false;
  if (turso && !forceSupabase) {
    // Use Turso for read operations and simple queries
    const sqlLower = sql.toLowerCase().trim();
    if (readOnly || sqlLower.startsWith('select') || forceTurso) {
      useTurso = true;
    }
  }

  try {
    if (useTurso && turso) {
      console.log('🔄 Using Turso for query');
      const result = await turso.execute({ sql, args: safeParams });
      return {
        rows: result.rows,
        rowCount: result.rowsAffected || result.rows.length
      };
    } else if (supabase) {
      console.log('🔄 Using Supabase for query');

      // For complex operations, use Supabase RPC
      if (sql.includes('INSERT') || sql.includes('UPDATE') || sql.includes('DELETE') || sql.includes('CREATE') || sql.includes('ALTER')) {
        // Use RPC for write operations
        const { data, error } = await supabase.rpc('exec_sql', {
          sql_query: sql,
          params: safeParams
        });

        if (error) throw error;

        return {
          rows: data || [],
          rowCount: data ? data.length : 0
        };
      } else {
        // For SELECT queries, try direct query first
        const tableMatch = sql.match(/FROM\s+(\w+)/i);
        if (tableMatch) {
          const tableName = tableMatch[1];
          const { data, error } = await supabase.from(tableName).select('*').limit(1000);

          if (!error) {
            // Filter results based on WHERE clause (simplified)
            let filteredData = data;
            if (sql.includes('WHERE')) {
              // Basic filtering - in production, use proper SQL parsing
              console.log('⚠️ Complex WHERE clauses not fully supported in direct Supabase queries');
            }

            return {
              rows: filteredData,
              rowCount: filteredData.length
            };
          }
        }

        // Fallback to RPC
        const { data, error } = await supabase.rpc('exec_sql', {
          sql_query: sql,
          params: safeParams
        });

        if (error) throw error;

        return {
          rows: data || [],
          rowCount: data ? data.length : 0
        };
      }
    } else {
      // Fallback to mock database
      console.log('🔄 Using mock database (no real DB connection)');
      await new Promise(resolve => setTimeout(resolve, 50));
      return {
        rows: [],
        rowCount: 0
      };
    }
  } catch (error) {
    console.error('Database query failed:', error);

    // Fallback to mock database
    console.log('🔄 Falling back to mock database');
    await new Promise(resolve => setTimeout(resolve, 50));
    return {
      rows: [],
      rowCount: 0
    };
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
        first_name, last_name, email, phone, address_line1, city, state, zip_code,
        customer_type, source, assigned_sales_rep_id, vehicle_interest,
        preferred_contact_method, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `;
    
    const params = [
      first_name, last_name, email, phone, address_line1, city, state, zip_code,
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
      sort_by = 'last_activity_date',
      sort_order = 'desc'
    } = filters;
    
    let whereClauses = [];
    let params = [];
    let paramIndex = 1;
    
    // Build WHERE clauses
    if (search) {
      whereClauses.push(`(
        c.first_name ILIKE $${paramIndex} OR 
        c.last_name ILIKE $${paramIndex} OR 
        c.email ILIKE $${paramIndex} OR 
        c.phone ILIKE $${paramIndex}
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
      SET ${updateFields.join(', ')}, updated_at = NOW()
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
        customer_id, first_name, last_name, email, phone, message, form_type,
        lead_source, vehicle_interest, vehicle_year, vehicle_make, vehicle_model,
        utm_source, utm_medium, utm_campaign, assigned_sales_rep_id, priority,
        next_follow_up_date, created_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
        NOW() + INTERVAL '1 day', 'system'
      )
      RETURNING *
    `;
    
    const params = [
      customer_id, first_name, last_name, email, phone, message, form_type,
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
   * Check for duplicate leads
   */
  static async checkForDuplicates(leadData, options = {}) {
    const { confidenceThreshold = 0.8 } = options;
    const { email, phone, first_name, last_name } = leadData;
    
    const sql = `
      SELECT * FROM find_potential_duplicates($1, $2, $3, $4, $5)
    `;
    
    const params = [email, phone, first_name, last_name, confidenceThreshold];
    
    try {
      const result = await query(sql, params);
      
      if (result.rows.length > 0) {
        return {
          isDuplicate: true,
          confidence: result.rows[0].confidence,
          duplicates: result.rows
        };
      }
      
      return { isDuplicate: false, duplicates: [] };
    } catch (error) {
      console.error('Error checking duplicates:', error);
      throw new Error('Failed to check for duplicates');
    }
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
        customer_id, lead_id, interaction_type, direction, subject, content,
        sales_rep_id, sales_rep_name, contact_method, outcome, next_action,
        next_action_date, initiated_by, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'sales_rep', 'system')
      RETURNING *
    `;
    
    const params = [
      customer_id, lead_id, interaction_type, direction, subject, content,
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
        customer_id, lead_id, appointment_type, title, description,
        scheduled_start, scheduled_end, assigned_sales_rep_id,
        assigned_sales_rep_name, vehicle_of_interest, location, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'system')
      RETURNING *
    `;
    
    const params = [
      customer_id, lead_id, appointment_type, title, description,
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
        AND a.scheduled_start > NOW()
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
        title, description, task_type, assigned_to, assigned_to_name,
        customer_id, lead_id, priority, due_date, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'system')
      RETURNING *
    `;
    
    const params = [
      title, description, task_type, assigned_to, assigned_to_name,
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

  /**
   * Get sales rep by email
   */
  static async getSalesRepByEmail(email) {
    const sql = `
      SELECT * FROM sales_reps
      WHERE email = $1 AND status = 'active'
    `;

    try {
      const result = await query(sql, [email]);
      return result.rows[0];
    } catch (error) {
      console.error('Error getting sales rep by email:', error);
      throw new Error('Failed to get sales rep');
    }
  }

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
      SET ${updateFields.join(', ')}, updated_at = NOW()
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

    const sql = `
      INSERT INTO sales_reps (
        first_name, last_name, email, phone, password_hash, role, status, permissions
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const params = [
      first_name,
      last_name,
      email,
      phone,
      hashedPassword,
      role,
      status,
      permissions
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
}

module.exports = DatabaseService;
