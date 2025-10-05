-- ============================================
-- CADILLAC DEALERSHIP DATABASE SCHEMA
-- Run this in Supabase SQL Editor
-- ============================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================
-- CUSTOMERS TABLE - Core customer information
-- ============================================
CREATE TABLE IF NOT EXISTS customers (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,

  -- Basic Information
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE,
  phone VARCHAR(20),
  phone_type VARCHAR(20) DEFAULT 'mobile',

  -- Address Information
  address_line1 VARCHAR(255),
  address_line2 VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(50),
  zip_code VARCHAR(20),
  country VARCHAR(50) DEFAULT 'USA',

  -- Customer Classification
  customer_type VARCHAR(20) DEFAULT 'prospect' CHECK (customer_type IN ('prospect', 'lead', 'active', 'inactive', 'vip')),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived', 'do_not_contact')),
  source VARCHAR(50) DEFAULT 'website',

  -- Vehicle Preferences
  preferred_vehicle_type VARCHAR(50),
  budget_min DECIMAL(10,2),
  budget_max DECIMAL(10,2),
  preferred_contact_method VARCHAR(20) DEFAULT 'email' CHECK (preferred_contact_method IN ('email', 'phone', 'sms', 'mail')),

  -- Sales Assignment
  assigned_sales_rep_id UUID,
  assigned_sales_rep_name VARCHAR(100),

  -- Lead Scoring
  lead_score INTEGER DEFAULT 0,
  last_activity_date TIMESTAMP WITH TIME ZONE,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by VARCHAR(100)
);

-- ============================================
-- SALES_REPS TABLE - Sales team members
-- ============================================
CREATE TABLE IF NOT EXISTS sales_reps (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(20),
  password_hash VARCHAR(255),
  role VARCHAR(50) DEFAULT 'sales_representative',
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'terminated')),
  permissions JSONB DEFAULT '["view_customers", "manage_leads"]',
  hire_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login TIMESTAMP WITH TIME ZONE
);

-- ============================================
-- LEADS TABLE - Lead management
-- ============================================
CREATE TABLE IF NOT EXISTS leads (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,

  -- Contact Information
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  email VARCHAR(255),
  phone VARCHAR(20),

  -- Normalized data for searching
  normalized_email VARCHAR(255),
  normalized_phone VARCHAR(20),
  normalized_name VARCHAR(255),

  -- Lead Information
  lead_source VARCHAR(50) DEFAULT 'website',
  status VARCHAR(20) DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'appointment', 'sold', 'lost', 'archived')),
  priority_score INTEGER DEFAULT 0,

  -- Assignment
  assigned_sales_rep_id UUID REFERENCES sales_reps(id),

  -- Vehicle Interest
  vehicle_interest TEXT,
  preferred_vehicle_type VARCHAR(50),
  budget_range VARCHAR(50),

  -- Communication
  message TEXT,
  notes TEXT,
  next_follow_up_date TIMESTAMP WITH TIME ZONE,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- INTERACTIONS TABLE - Customer interactions
-- ============================================
CREATE TABLE IF NOT EXISTS interactions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  sales_rep_id UUID REFERENCES sales_reps(id),
  interaction_type VARCHAR(50) NOT NULL CHECK (interaction_type IN ('call', 'email', 'meeting', 'note', 'sms', 'website_visit')),
  direction VARCHAR(20) CHECK (direction IN ('inbound', 'outbound')),
  subject VARCHAR(255),
  content TEXT,
  duration_minutes INTEGER,
  outcome VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- APPOINTMENTS TABLE - Scheduled appointments
-- ============================================
CREATE TABLE IF NOT EXISTS appointments (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  lead_id UUID REFERENCES leads(id),
  customer_id UUID REFERENCES customers(id),
  assigned_sales_rep_id UUID REFERENCES sales_reps(id) NOT NULL,

  -- Appointment Details
  scheduled_start TIMESTAMP WITH TIME ZONE NOT NULL,
  scheduled_end TIMESTAMP WITH TIME ZONE,
  actual_start TIMESTAMP WITH TIME ZONE,
  actual_end TIMESTAMP WITH TIME ZONE,
  duration_minutes INTEGER,

  -- Appointment Type and Status
  type VARCHAR(50) DEFAULT 'test_drive' CHECK (type IN ('test_drive', 'meeting', 'phone_call', 'home_visit', 'trade_in_evaluation')),
  status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show')),

  -- Location and Notes
  location VARCHAR(255) DEFAULT 'dealership',
  notes TEXT,
  customer_notes TEXT,

  -- Follow-up
  follow_up_required BOOLEAN DEFAULT false,
  follow_up_date TIMESTAMP WITH TIME ZONE,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES sales_reps(id)
);

-- ============================================
-- VEHICLES TABLE - Inventory management
-- ============================================
CREATE TABLE IF NOT EXISTS vehicles (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  vin VARCHAR(17) UNIQUE NOT NULL,
  stock_number VARCHAR(50) UNIQUE,

  -- Vehicle Details
  make VARCHAR(50) NOT NULL,
  model VARCHAR(50) NOT NULL,
  year INTEGER NOT NULL,
  trim VARCHAR(100),
  body_style VARCHAR(50),
  transmission VARCHAR(50),
  drivetrain VARCHAR(50),
  engine VARCHAR(100),
  fuel_type VARCHAR(20),

  -- Physical Details
  exterior_color VARCHAR(50),
  interior_color VARCHAR(50),
  mileage INTEGER DEFAULT 0,

  -- Pricing
  msrp DECIMAL(10,2),
  selling_price DECIMAL(10,2),
  dealer_price DECIMAL(10,2),

  -- Status and Location
  status VARCHAR(20) DEFAULT 'available' CHECK (status IN ('available', 'sold', 'pending', 'in_transit', 'maintenance')),
  location VARCHAR(100) DEFAULT 'dealership',

  -- Images and Description
  images JSONB,
  description TEXT,
  features JSONB,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- TASKS TABLE - Task management system
-- ============================================
CREATE TABLE IF NOT EXISTS tasks (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  task_type VARCHAR(50) DEFAULT 'follow_up' CHECK (task_type IN ('follow_up', 'call', 'email', 'meeting', 'research', 'documentation')),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled', 'overdue')),
  priority VARCHAR(10) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),

  -- Assignment
  assigned_to UUID REFERENCES sales_reps(id),
  assigned_by UUID REFERENCES sales_reps(id),

  -- Related Records
  customer_id UUID REFERENCES customers(id),
  lead_id UUID REFERENCES leads(id),
  appointment_id UUID REFERENCES appointments(id),

  -- Scheduling
  due_date TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- DASHBOARD_METRICS TABLE - Cached metrics
-- ============================================
CREATE TABLE IF NOT EXISTS dashboard_metrics (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  sales_rep_id UUID REFERENCES sales_reps(id),
  metric_type VARCHAR(50) NOT NULL,
  metric_value JSONB,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- SEARCH_CACHE TABLE - Search optimization
-- ============================================
CREATE TABLE IF NOT EXISTS search_cache (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  search_query TEXT NOT NULL,
  search_type VARCHAR(50) NOT NULL,
  results JSONB,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- SCHEMA_MIGRATIONS TABLE - Migration tracking
-- ============================================
CREATE TABLE IF NOT EXISTS schema_migrations (
  id SERIAL PRIMARY KEY,
  filename VARCHAR(255) UNIQUE NOT NULL,
  checksum VARCHAR(255),
  executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

-- Customer indexes
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers USING gin((first_name || ' ' || last_name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customers_type ON customers(customer_type);
CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);
CREATE INDEX IF NOT EXISTS idx_customers_assigned_rep ON customers(assigned_sales_rep_id);
CREATE INDEX IF NOT EXISTS idx_customers_created_at ON customers(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customers_last_activity ON customers(last_activity_date DESC);

-- Lead indexes
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone);
CREATE INDEX IF NOT EXISTS idx_leads_name ON leads USING gin(normalized_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(lead_source);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_rep ON leads(assigned_sales_rep_id);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_next_followup ON leads(next_follow_up_date);

-- Interaction indexes
CREATE INDEX IF NOT EXISTS idx_interactions_lead_id ON interactions(lead_id);
CREATE INDEX IF NOT EXISTS idx_interactions_customer_id ON interactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_interactions_type ON interactions(interaction_type);
CREATE INDEX IF NOT EXISTS idx_interactions_sales_rep ON interactions(sales_rep_id);
CREATE INDEX IF NOT EXISTS idx_interactions_created_at ON interactions(created_at DESC);

-- Appointment indexes
CREATE INDEX IF NOT EXISTS idx_appointments_lead_id ON appointments(lead_id);
CREATE INDEX IF NOT EXISTS idx_appointments_customer_id ON appointments(customer_id);
CREATE INDEX IF NOT EXISTS idx_appointments_sales_rep ON appointments(assigned_sales_rep_id);
CREATE INDEX IF NOT EXISTS idx_appointments_start_time ON appointments(scheduled_start);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(scheduled_start::date);

-- Vehicle indexes
CREATE INDEX IF NOT EXISTS idx_vehicles_vin ON vehicles(vin);
CREATE INDEX IF NOT EXISTS idx_vehicles_make_model ON vehicles(make, model);
CREATE INDEX IF NOT EXISTS idx_vehicles_year ON vehicles(year);
CREATE INDEX IF NOT EXISTS idx_vehicles_status ON vehicles(status);
CREATE INDEX IF NOT EXISTS idx_vehicles_price ON vehicles(selling_price);

-- Task indexes
CREATE INDEX IF NOT EXISTS idx_tasks_customer_id ON tasks(customer_id);
CREATE INDEX IF NOT EXISTS idx_tasks_lead_id ON tasks(lead_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(task_type);

-- ============================================
-- TRIGGERS FOR AUTOMATIC UPDATES
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers to all tables
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_sales_reps_updated_at BEFORE UPDATE ON sales_reps FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_interactions_updated_at BEFORE UPDATE ON interactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_appointments_updated_at BEFORE UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_vehicles_updated_at BEFORE UPDATE ON vehicles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_reps ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboard_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_cache ENABLE ROW LEVEL SECURITY;

-- ============================================
-- INITIAL TEST DATA
-- ============================================

-- Insert test sales representatives
INSERT INTO sales_reps (first_name, last_name, email, phone, role, status, permissions) VALUES
('John', 'Smith', 'john.smith@cadillacofsouthcharlotte.com', '(704) 555-0101', 'sales_manager', 'active', '["view_customers", "manage_leads", "manage_sales_reps", "view_reports"]'),
('Sarah', 'Johnson', 'sarah.johnson@cadillacofsouthcharlotte.com', '(704) 555-0102', 'sales_representative', 'active', '["view_customers", "manage_leads"]'),
('Mike', 'Davis', 'mike.davis@cadillacofsouthcharlotte.com', '(704) 555-0103', 'sales_representative', 'active', '["view_customers", "manage_leads"]'),
('Test', 'User', 'test@caddyed.com', '(704) 555-0199', 'sales_representative', 'active', '["view_customers", "manage_leads"]')
ON CONFLICT (email) DO NOTHING;

-- Insert test vehicles
INSERT INTO vehicles (vin, stock_number, make, model, year, trim, body_style, transmission, exterior_color, interior_color, mileage, msrp, selling_price, status) VALUES
('1G6AB5RA1F0123456', 'C12345', 'Cadillac', 'Escalade', 2024, 'Premium Luxury', 'SUV', 'Automatic', 'Black Raven', 'Jet Black', 0, 65000.00, 62000.00, 'available'),
('1G6AA5RA2F0789012', 'C12346', 'Cadillac', 'Escalade', 2024, 'Platinum', 'SUV', 'Automatic', 'Stellar Black Metallic', 'Shale with Jet Black accents', 0, 75000.00, 72000.00, 'available'),
('1GYS4BKJ4FR123456', 'C12347', 'Cadillac', 'XT5', 2024, 'Premium Luxury', 'SUV', 'Automatic', 'Radiant Silver Metallic', 'Jet Black', 0, 45000.00, 43000.00, 'available'),
('1GYKNDRS0HZ123456', 'C12348', 'Cadillac', 'XT6', 2024, 'Premium Luxury', 'SUV', 'Automatic', 'Crystal White Tricoat', 'Sedona Sauvage', 0, 55000.00, 52000.00, 'available')
ON CONFLICT (vin) DO NOTHING;

-- Mark migration as complete
INSERT INTO schema_migrations (filename, checksum) VALUES
('create_database_tables.sql', 'manual_creation_' || extract(epoch from now())::text)
ON CONFLICT (filename) DO NOTHING;

-- ============================================
-- SUCCESS MESSAGE
-- ============================================

-- This will show in the query results
SELECT 'Database schema created successfully! Tables, indexes, and test data are ready.' as status;