-- Turso SQLite Schema for Hybrid Architecture
-- This migration creates SQLite-compatible tables for Turso
-- Optimized for fast reads and edge operations

-- ============================================
-- ENABLE REQUIRED EXTENSIONS
-- ============================================

-- Note: FTS5 is built into SQLite, no need to enable extensions

-- ============================================
-- CUSTOMERS TABLE - Core customer information (Turso)
-- ============================================

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),

  -- Basic Information
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT UNIQUE,
  phone TEXT,
  phone_type TEXT DEFAULT 'mobile' CHECK (phone_type IN ('mobile', 'home', 'work')),

  -- Address Information
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  country TEXT DEFAULT 'USA',

  -- Customer Classification
  customer_type TEXT DEFAULT 'prospect' CHECK (customer_type IN ('prospect', 'lead', 'active', 'inactive', 'vip')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived', 'do_not_contact')),
  source TEXT DEFAULT 'website',

  -- Vehicle Preferences
  preferred_vehicle_type TEXT,
  budget_min REAL,
  budget_max REAL,
  preferred_contact_method TEXT DEFAULT 'email' CHECK (preferred_contact_method IN ('email', 'phone', 'sms', 'mail')),

  -- Sales Assignment
  assigned_sales_rep_id TEXT,
  assigned_sales_rep_name TEXT,

  -- Lead Scoring
  lead_score INTEGER DEFAULT 0,
  last_activity_date DATETIME,

  -- Timestamps
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT,
  updated_by TEXT,

  -- Consent and Compliance
  email_consent BOOLEAN DEFAULT 0,
  sms_consent BOOLEAN DEFAULT 0,
  phone_consent BOOLEAN DEFAULT 0,
  gdpr_consent_date DATETIME,
  do_not_contact_reason TEXT,

  -- Normalized fields for search and deduplication
  normalized_email TEXT,
  normalized_phone TEXT,
  normalized_name TEXT,

  -- Duplicate tracking
  duplicate_count INTEGER DEFAULT 0,
  merged_from TEXT DEFAULT '[]', -- JSON array of UUIDs
  merged_into TEXT -- UUID
);

-- ============================================
-- LEADS TABLE - Extended lead information (Turso)
-- ============================================

CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,

  -- Lead Information
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  message TEXT,
  form_type TEXT DEFAULT 'general',
  lead_source TEXT DEFAULT 'website',
  page_url TEXT,

  -- Vehicle Interest
  vehicle_interest TEXT,
  vehicle_year INTEGER,
  vehicle_make TEXT,
  vehicle_model TEXT,
  vehicle_trim TEXT,
  vehicle_stock_number TEXT,
  vehicle_price REAL,

  -- UTM Tracking
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,

  -- Lead Status and Scoring
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'converted', 'lost', 'duplicate')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  score INTEGER DEFAULT 0,

  -- Assignment and Follow-up
  assigned_sales_rep_id TEXT,
  assigned_sales_rep_name TEXT,
  next_follow_up_date DATETIME,
  follow_up_count INTEGER DEFAULT 0,

  -- Conversion Tracking
  converted_to_customer BOOLEAN DEFAULT 0,
  conversion_date DATETIME,
  conversion_value REAL,

  -- Timestamps
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_contact DATETIME DEFAULT CURRENT_TIMESTAMP,

  -- Normalized fields for deduplication
  normalized_email TEXT,
  normalized_phone TEXT,
  normalized_name TEXT,

  -- Duplicate tracking
  duplicate_count INTEGER DEFAULT 0,
  merged_from TEXT DEFAULT '[]',
  merged_into TEXT
);

-- ============================================
-- ANALYTICS CACHE TABLES (Turso-only)
-- ============================================

-- Dashboard metrics cache
CREATE TABLE IF NOT EXISTS dashboard_metrics (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  metric_type TEXT NOT NULL, -- 'sales_rep_performance', 'lead_conversion', 'customer_stats'
  metric_key TEXT NOT NULL, -- sales_rep_id, 'global', etc.
  metric_data TEXT NOT NULL, -- JSON data
  calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME, -- When to recalculate

  UNIQUE(metric_type, metric_key)
);

-- Search cache for customer/lead searches
CREATE TABLE IF NOT EXISTS search_cache (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  search_query TEXT NOT NULL,
  search_type TEXT NOT NULL, -- 'customers', 'leads', 'vehicles'
  filters TEXT, -- JSON filters
  results TEXT NOT NULL, -- JSON results
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME DEFAULT (datetime('now', '+1 hour'))
);

-- ============================================
-- FULL-TEXT SEARCH INDEXES (FTS5)
-- ============================================

-- Customer search index
CREATE VIRTUAL TABLE IF NOT EXISTS customers_fts USING fts5(
  id, first_name, last_name, email, phone, city, state,
  content=customers,
  content_rowid=rowid
);

-- Lead search index
CREATE VIRTUAL TABLE IF NOT EXISTS leads_fts USING fts5(
  id, first_name, last_name, email, phone, vehicle_interest,
  content=leads,
  content_rowid=rowid
);

-- ============================================
-- INDEXES for Performance
-- ============================================

-- Customers indexes
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_type ON customers(customer_type);
CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);
CREATE INDEX IF NOT EXISTS idx_customers_assigned_rep ON customers(assigned_sales_rep_id);
CREATE INDEX IF NOT EXISTS idx_customers_created_at ON customers(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customers_last_activity ON customers(last_activity_date DESC);

-- Leads indexes
CREATE INDEX IF NOT EXISTS idx_leads_customer_id ON leads(customer_id);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(normalized_email);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(normalized_phone);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(lead_source);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_rep ON leads(assigned_sales_rep_id);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_next_followup ON leads(next_follow_up_date);

-- Cache indexes
CREATE INDEX IF NOT EXISTS idx_dashboard_metrics_type_key ON dashboard_metrics(metric_type, metric_key);
CREATE INDEX IF NOT EXISTS idx_dashboard_metrics_expires ON dashboard_metrics(expires_at);
CREATE INDEX IF NOT EXISTS idx_search_cache_expires ON search_cache(expires_at);

-- ============================================
-- TRIGGERS for FTS and Cache Management
-- ============================================

-- Function to update updated_at timestamp
CREATE TRIGGER IF NOT EXISTS update_customers_updated_at
  AFTER UPDATE ON customers
  BEGIN
    UPDATE customers SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
  END;

CREATE TRIGGER IF NOT EXISTS update_leads_updated_at
  AFTER UPDATE ON leads
  BEGIN
    UPDATE leads SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
  END;

-- FTS triggers for customers
CREATE TRIGGER IF NOT EXISTS customers_fts_insert
  AFTER INSERT ON customers
  BEGIN
    INSERT INTO customers_fts(rowid, id, first_name, last_name, email, phone, city, state)
    VALUES (NEW.rowid, NEW.id, NEW.first_name, NEW.last_name, NEW.email, NEW.phone, NEW.city, NEW.state);
  END;

CREATE TRIGGER IF NOT EXISTS customers_fts_delete
  AFTER DELETE ON customers
  BEGIN
    DELETE FROM customers_fts WHERE rowid = OLD.rowid;
  END;

CREATE TRIGGER IF NOT EXISTS customers_fts_update
  AFTER UPDATE ON customers
  BEGIN
    UPDATE customers_fts SET
      first_name = NEW.first_name,
      last_name = NEW.last_name,
      email = NEW.email,
      phone = NEW.phone,
      city = NEW.city,
      state = NEW.state
    WHERE rowid = NEW.rowid;
  END;

-- FTS triggers for leads
CREATE TRIGGER IF NOT EXISTS leads_fts_insert
  AFTER INSERT ON leads
  BEGIN
    INSERT INTO leads_fts(rowid, id, first_name, last_name, email, phone, vehicle_interest)
    VALUES (NEW.rowid, NEW.id, NEW.first_name, NEW.last_name, NEW.email, NEW.phone, NEW.vehicle_interest);
  END;

CREATE TRIGGER IF NOT EXISTS leads_fts_delete
  AFTER DELETE ON leads
  BEGIN
    DELETE FROM leads_fts WHERE rowid = OLD.rowid;
  END;

CREATE TRIGGER IF NOT EXISTS leads_fts_update
  AFTER UPDATE ON leads
  BEGIN
    UPDATE leads_fts SET
      first_name = NEW.first_name,
      last_name = NEW.last_name,
      email = NEW.email,
      phone = NEW.phone,
      vehicle_interest = NEW.vehicle_interest
    WHERE rowid = NEW.rowid;
  END;

-- ============================================
-- VIEWS for Common Queries
-- ============================================

-- Active customers view
CREATE VIEW IF NOT EXISTS active_customers AS
SELECT
  c.*,
  COALESCE(latest_interaction.last_interaction_date, c.created_at) as last_contact_date,
  COALESCE(open_tasks.open_task_count, 0) as open_task_count,
  COALESCE(upcoming_appointments.upcoming_appointment_count, 0) as upcoming_appointment_count
FROM customers c
LEFT JOIN (
  SELECT DISTINCT customer_id,
         MAX(created_at) as last_interaction_date
  FROM interactions
  GROUP BY customer_id
) latest_interaction ON c.id = latest_interaction.customer_id
LEFT JOIN (
  SELECT customer_id,
         COUNT(*) as open_task_count
  FROM tasks
  WHERE status IN ('pending', 'in_progress')
  GROUP BY customer_id
) open_tasks ON c.id = open_tasks.customer_id
LEFT JOIN (
  SELECT customer_id,
         COUNT(*) as upcoming_appointment_count
  FROM appointments
  WHERE status IN ('scheduled', 'confirmed')
    AND scheduled_start > datetime('now')
  GROUP BY customer_id
) upcoming_appointments ON c.id = upcoming_appointments.customer_id
WHERE c.status = 'active'
ORDER BY c.last_activity_date DESC;

-- Lead pipeline view
CREATE VIEW IF NOT EXISTS lead_pipeline AS
SELECT
  l.*,
  c.first_name as customer_first_name,
  c.last_name as customer_last_name,
  c.email as customer_email,
  c.phone as customer_phone,
  sr.first_name as sales_rep_first_name,
  sr.last_name as sales_rep_last_name
FROM leads l
LEFT JOIN customers c ON l.customer_id = c.id
LEFT JOIN sales_reps sr ON l.assigned_sales_rep_id = sr.id
WHERE l.status != 'converted'
ORDER BY l.created_at DESC;