-- Comprehensive Customer Database Schema for Cadillac Dealership
-- This migration creates a complete customer management system

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
  phone_type VARCHAR(20) DEFAULT 'mobile', -- mobile, home, work
  
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
  source VARCHAR(50) DEFAULT 'website', -- website, phone, referral, trade_in, service, etc.
  
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
  created_by VARCHAR(100),
  updated_by VARCHAR(100),
  
  -- Consent and Compliance
  email_consent BOOLEAN DEFAULT false,
  sms_consent BOOLEAN DEFAULT false,
  phone_consent BOOLEAN DEFAULT false,
  gdpr_consent_date TIMESTAMP WITH TIME ZONE,
  do_not_contact_reason TEXT,
  
  -- Normalized fields for search and deduplication
  normalized_email VARCHAR(255),
  normalized_phone VARCHAR(20),
  normalized_name VARCHAR(255),
  
  -- Duplicate tracking
  duplicate_count INTEGER DEFAULT 0,
  merged_from UUID[] DEFAULT '{}',
  merged_into UUID
);

-- ============================================
-- LEADS TABLE - Extended lead information
-- ============================================
CREATE TABLE IF NOT EXISTS leads (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  
  -- Lead Information
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  email VARCHAR(255),
  phone VARCHAR(20),
  message TEXT,
  form_type VARCHAR(50) DEFAULT 'general', -- general, test_drive, finance, trade_in, service
  lead_source VARCHAR(50) DEFAULT 'website',
  page_url TEXT,
  
  -- Vehicle Interest
  vehicle_interest VARCHAR(255),
  vehicle_year INTEGER,
  vehicle_make VARCHAR(50),
  vehicle_model VARCHAR(50),
  vehicle_trim VARCHAR(50),
  vehicle_stock_number VARCHAR(50),
  vehicle_price DECIMAL(10,2),
  
  -- UTM Tracking
  utm_source VARCHAR(100),
  utm_medium VARCHAR(100),
  utm_campaign VARCHAR(100),
  utm_term VARCHAR(100),
  utm_content VARCHAR(100),
  
  -- Lead Status and Scoring
  status VARCHAR(20) DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'converted', 'lost', 'duplicate')),
  priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  score INTEGER DEFAULT 0,
  
  -- Assignment and Follow-up
  assigned_sales_rep_id UUID,
  assigned_sales_rep_name VARCHAR(100),
  next_follow_up_date TIMESTAMP WITH TIME ZONE,
  follow_up_count INTEGER DEFAULT 0,
  
  -- Conversion Tracking
  converted_to_customer BOOLEAN DEFAULT false,
  conversion_date TIMESTAMP WITH TIME ZONE,
  conversion_value DECIMAL(10,2),
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_contact TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Normalized fields for deduplication
  normalized_email VARCHAR(255),
  normalized_phone VARCHAR(20),
  normalized_name VARCHAR(255),
  
  -- Duplicate tracking
  duplicate_count INTEGER DEFAULT 0,
  merged_from UUID[] DEFAULT '{}',
  merged_into UUID
);

-- ============================================
-- INTERACTIONS TABLE - All customer communications
-- ============================================
CREATE TABLE IF NOT EXISTS interactions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  
  -- Relationship Information
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  
  -- Interaction Details
  interaction_type VARCHAR(50) NOT NULL CHECK (interaction_type IN (
    'phone_call', 'email', 'sms', 'in_person', 'website_visit', 'form_submission',
    'test_drive', 'service_visit', 'note', 'task', 'appointment', 'follow_up'
  )),
  direction VARCHAR(20) DEFAULT 'outbound' CHECK (direction IN ('inbound', 'outbound')),
  
  -- Communication Details
  subject VARCHAR(255),
  content TEXT,
  summary TEXT, -- Brief summary of the interaction
  
  -- Participants
  initiated_by VARCHAR(100), -- sales_rep, customer, system
  sales_rep_id UUID,
  sales_rep_name VARCHAR(100),
  
  -- Contact Information Used
  contact_method VARCHAR(20), -- email, phone, sms, in_person
  contact_details TEXT, -- email address, phone number, etc.
  
  -- Outcome and Next Steps
  outcome VARCHAR(50), -- interested, not_interested, appointment_set, sold, etc.
  next_action VARCHAR(255),
  next_action_date TIMESTAMP WITH TIME ZONE,
  
  -- Metadata
  duration_minutes INTEGER,
  tags TEXT[], -- Array of tags for categorization
  metadata JSONB DEFAULT '{}', -- Additional structured data
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- System Fields
  created_by VARCHAR(100),
  updated_by VARCHAR(100)
);

-- ============================================
-- APPOINTMENTS TABLE - Customer appointments
-- ============================================
CREATE TABLE IF NOT EXISTS appointments (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  
  -- Relationship Information
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  
  -- Appointment Details
  appointment_type VARCHAR(50) NOT NULL CHECK (appointment_type IN (
    'test_drive', 'sales_consultation', 'delivery', 'service', 'finance_application',
    'trade_in_evaluation', 'follow_up', 'general'
  )),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Scheduling
  scheduled_start TIMESTAMP WITH TIME ZONE NOT NULL,
  scheduled_end TIMESTAMP WITH TIME ZONE NOT NULL,
  duration_minutes INTEGER,
  timezone VARCHAR(50) DEFAULT 'America/New_York',
  
  -- Status and Confirmation
  status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN (
    'scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show', 'rescheduled'
  )),
  confirmation_status VARCHAR(20) DEFAULT 'pending' CHECK (confirmation_status IN (
    'pending', 'confirmed', 'cancelled', 'rescheduled'
  )),
  
  -- Location
  location VARCHAR(255) DEFAULT 'Cadillac of South Charlotte',
  address TEXT,
  meeting_link TEXT, -- For virtual appointments
  
  -- Participants
  assigned_sales_rep_id UUID,
  assigned_sales_rep_name VARCHAR(100),
  additional_attendees TEXT[], -- Array of attendee names
  
  -- Vehicle Information
  vehicle_of_interest VARCHAR(255),
  vehicle_stock_number VARCHAR(50),
  
  -- Preparation Notes
  preparation_notes TEXT,
  customer_notes TEXT,
  
  -- Outcome
  outcome TEXT,
  follow_up_actions TEXT[],
  next_appointment_id UUID REFERENCES appointments(id),
  
  -- Reminder Settings
  reminder_sent BOOLEAN DEFAULT false,
  reminder_count INTEGER DEFAULT 0,
  last_reminder_sent TIMESTAMP WITH TIME ZONE,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by VARCHAR(100),
  updated_by VARCHAR(100),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- ============================================
-- SALES_REPS TABLE - Sales team management
-- ============================================
CREATE TABLE IF NOT EXISTS sales_reps (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  
  -- Basic Information
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(20),

  -- Authentication
  password_hash VARCHAR(255), -- bcrypt hashed password

  -- Employment Details
  employee_id VARCHAR(50) UNIQUE,
  role VARCHAR(50) DEFAULT 'sales_representative',
  department VARCHAR(50) DEFAULT 'sales',
  
  -- Status and Permissions
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'on_leave', 'terminated')),
  permissions TEXT[] DEFAULT ARRAY['view_customers', 'manage_leads'],
  
  -- Performance Metrics
  hire_date DATE,
  current_lead_count INTEGER DEFAULT 0,
  current_customer_count INTEGER DEFAULT 0,
  monthly_sales_target DECIMAL(10,2),
  
  -- Specializations
  specializations TEXT[], -- luxury_vehicles, commercial_vehicles, certified_pre_owned, etc.
  languages TEXT[] DEFAULT ARRAY['english'],
  
  -- Contact Preferences
  preferred_contact_method VARCHAR(20) DEFAULT 'email',
  working_hours JSONB DEFAULT '{"monday": {"start": "09:00", "end": "18:00"}, "tuesday": {"start": "09:00", "end": "18:00"}, "wednesday": {"start": "09:00", "end": "18:00"}, "thursday": {"start": "09:00", "end": "18:00"}, "friday": {"start": "09:00", "end": "18:00"}, "saturday": {"start": "09:00", "end": "17:00"}, "sunday": null}',
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login TIMESTAMP WITH TIME ZONE,
  created_by VARCHAR(100),
  updated_by VARCHAR(100)
);

-- ============================================
-- VEHICLES TABLE - Vehicle inventory interest tracking
-- ============================================
CREATE TABLE IF NOT EXISTS vehicles (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  
  -- Vehicle Identification
  stock_number VARCHAR(50) UNIQUE NOT NULL,
  vin VARCHAR(17) UNIQUE,
  year INTEGER NOT NULL,
  make VARCHAR(50) NOT NULL,
  model VARCHAR(50) NOT NULL,
  trim VARCHAR(50),
  body_style VARCHAR(50),
  
  -- Vehicle Details
  exterior_color VARCHAR(50),
  interior_color VARCHAR(50),
  engine VARCHAR(100),
  transmission VARCHAR(50),
  drivetrain VARCHAR(20),
  fuel_type VARCHAR(20),
  mileage INTEGER,
  
  -- Pricing
  list_price DECIMAL(10,2),
  sale_price DECIMAL(10,2),
  msrp DECIMAL(10,2),
  
  -- Status
  status VARCHAR(20) DEFAULT 'available' CHECK (status IN (
    'available', 'sold', 'pending_delivery', 'in_transit', 'service', 'demo'
  )),
  
  -- Features
  features TEXT[],
  packages TEXT[],
  
  -- Images and Media
  image_urls TEXT[],
  video_url TEXT,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  date_in_stock DATE,
  date_sold DATE
);

-- ============================================
-- CUSTOMER_VEHICLE_INTEREST TABLE - Track customer vehicle preferences
-- ============================================
CREATE TABLE IF NOT EXISTS customer_vehicle_interest (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE CASCADE,
  
  -- Interest Details
  interest_level VARCHAR(20) DEFAULT 'considering' CHECK (interest_level IN (
    'just_looking', 'considering', 'seriously_interested', 'test_drive_scheduled', 'ready_to_buy'
  )),
  
  -- Customer Feedback
  notes TEXT,
  pros TEXT[],
  cons TEXT[],
  questions TEXT[],
  
  -- Financial Information
  budget_range JSONB, -- {"min": 40000, "max": 60000}
  financing_preapproved BOOLEAN DEFAULT false,
  trade_in_interest BOOLEAN DEFAULT false,
  
  -- Timeline
  purchase_timeline VARCHAR(50), -- "immediately", "within_30_days", "within_90_days", "just_researching"
  preferred_test_drive_dates DATE[],
  
  -- Sales Interaction
  last_discussed TIMESTAMP WITH TIME ZONE,
  sales_rep_notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure unique customer-vehicle combination
  UNIQUE(customer_id, vehicle_id)
);

-- ============================================
-- TASKS TABLE - Sales team task management
-- ============================================
CREATE TABLE IF NOT EXISTS tasks (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  
  -- Task Information
  title VARCHAR(255) NOT NULL,
  description TEXT,
  task_type VARCHAR(50) DEFAULT 'follow_up' CHECK (task_type IN (
    'follow_up', 'phone_call', 'email', 'meeting', 'appointment', 'research', 'admin', 'other'
  )),
  
  -- Assignment
  assigned_to UUID REFERENCES sales_reps(id) ON DELETE SET NULL,
  assigned_to_name VARCHAR(100),
  
  -- Related Records
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  
  -- Priority and Status
  priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN (
    'pending', 'in_progress', 'completed', 'cancelled', 'deferred'
  )),
  
  -- Scheduling
  due_date TIMESTAMP WITH TIME ZONE,
  completed_date TIMESTAMP WITH TIME ZONE,
  estimated_duration_minutes INTEGER,
  actual_duration_minutes INTEGER,
  
  -- Task Details
  tags TEXT[],
  checklist JSONB DEFAULT '[]', -- Array of checklist items
  attachments TEXT[], -- Array of attachment URLs or references
  
  -- Outcome
  outcome TEXT,
  lessons_learned TEXT,
  
  -- Recurrence
  is_recurring BOOLEAN DEFAULT false,
  recurrence_pattern JSONB, -- iCal-like recurrence pattern
  next_occurrence TIMESTAMP WITH TIME ZONE,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by VARCHAR(100),
  updated_by VARCHAR(100)
);

-- ============================================
-- INDEXES for Performance
-- ============================================

-- Customers indexes
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers USING gin(normalized_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customers_type ON customers(customer_type);
CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);
CREATE INDEX IF NOT EXISTS idx_customers_assigned_rep ON customers(assigned_sales_rep_id);
CREATE INDEX IF NOT EXISTS idx_customers_created_at ON customers(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customers_last_activity ON customers(last_activity_date DESC);

-- Leads indexes
CREATE INDEX IF NOT EXISTS idx_leads_customer_id ON leads(customer_id);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(normalized_email);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(normalized_phone);
CREATE INDEX IF NOT EXISTS idx_leads_name ON leads USING gin(normalized_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(lead_source);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_rep ON leads(assigned_sales_rep_id);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_next_followup ON leads(next_follow_up_date);

-- Interactions indexes
CREATE INDEX IF NOT EXISTS idx_interactions_customer_id ON interactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_interactions_lead_id ON interactions(lead_id);
CREATE INDEX IF NOT EXISTS idx_interactions_type ON interactions(interaction_type);
CREATE INDEX IF NOT EXISTS idx_interactions_sales_rep ON interactions(sales_rep_id);
CREATE INDEX IF NOT EXISTS idx_interactions_created_at ON interactions(created_at DESC);

-- Appointments indexes
CREATE INDEX IF NOT EXISTS idx_appointments_customer_id ON appointments(customer_id);
CREATE INDEX IF NOT EXISTS idx_appointments_lead_id ON appointments(lead_id);
CREATE INDEX IF NOT EXISTS idx_appointments_sales_rep ON appointments(assigned_sales_rep_id);
CREATE INDEX IF NOT EXISTS idx_appointments_start_time ON appointments(scheduled_start);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(scheduled_start::date);

-- Sales reps indexes
CREATE INDEX IF NOT EXISTS idx_sales_reps_email ON sales_reps(email);
CREATE INDEX IF NOT EXISTS idx_sales_reps_status ON sales_reps(status);
CREATE INDEX IF NOT EXISTS idx_sales_reps_role ON sales_reps(role);

-- Vehicles indexes
CREATE INDEX IF NOT EXISTS idx_vehicles_stock ON vehicles(stock_number);
CREATE INDEX IF NOT EXISTS idx_vehicles_vin ON vehicles(vin);
CREATE INDEX IF NOT EXISTS idx_vehicles_make_model ON vehicles(make, model);
CREATE INDEX IF NOT EXISTS idx_vehicles_year ON vehicles(year);
CREATE INDEX IF NOT EXISTS idx_vehicles_status ON vehicles(status);
CREATE INDEX IF NOT EXISTS idx_vehicles_price ON vehicles(list_price);

-- Tasks indexes
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_customer_id ON tasks(customer_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(task_type);

-- ============================================
-- VIEWS for Common Queries
-- ============================================

-- Active customers view
CREATE OR REPLACE VIEW active_customers AS
SELECT 
  c.*,
  COALESCE(latest_interaction.last_interaction_date, c.created_at) as last_contact_date,
  COALESCE(open_tasks.open_task_count, 0) as open_task_count,
  COALESCE(upcoming_appointments.upcoming_appointment_count, 0) as upcoming_appointment_count
FROM customers c
LEFT JOIN (
  SELECT DISTINCT ON (customer_id) 
    customer_id, 
    created_at as last_interaction_date
  FROM interactions 
  ORDER BY customer_id, created_at DESC
) latest_interaction ON c.id = latest_interaction.customer_id
LEFT JOIN (
  SELECT 
    customer_id, 
    COUNT(*) as open_task_count
  FROM tasks 
  WHERE status IN ('pending', 'in_progress')
  GROUP BY customer_id
) open_tasks ON c.id = open_tasks.customer_id
LEFT JOIN (
  SELECT 
    customer_id, 
    COUNT(*) as upcoming_appointment_count
  FROM appointments 
  WHERE status IN ('scheduled', 'confirmed') 
    AND scheduled_start > NOW()
  GROUP BY customer_id
) upcoming_appointments ON c.id = upcoming_appointments.customer_id
WHERE c.status = 'active'
ORDER BY c.last_activity_date DESC NULLS LAST;

-- Lead pipeline view
CREATE OR REPLACE VIEW lead_pipeline AS
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

-- Sales rep performance view
CREATE OR REPLACE VIEW sales_rep_performance AS
SELECT 
  sr.*,
  COUNT(DISTINCT c.id) as total_customers,
  COUNT(DISTINCT l.id) as total_leads,
  COUNT(DISTINCT CASE WHEN l.status = 'converted' THEN l.id END) as converted_leads,
  COUNT(DISTINCT CASE WHEN a.status = 'completed' THEN a.id END) as completed_appointments,
  COUNT(DISTINCT CASE WHEN t.status = 'pending' OR t.status = 'in_progress' THEN t.id END) as active_tasks
FROM sales_reps sr
LEFT JOIN customers c ON sr.id = c.assigned_sales_rep_id
LEFT JOIN leads l ON sr.id = l.assigned_sales_rep_id
LEFT JOIN appointments a ON sr.id = a.assigned_sales_rep_id
LEFT JOIN tasks t ON sr.id = t.assigned_to
WHERE sr.status = 'active'
GROUP BY sr.id;

-- ============================================
-- TRIGGERS for Automatic Updates
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_interactions_updated_at
  BEFORE UPDATE ON interactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_appointments_updated_at
  BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sales_reps_updated_at
  BEFORE UPDATE ON sales_reps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_vehicles_updated_at
  BEFORE UPDATE ON vehicles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to update customer last_activity_date
CREATE OR REPLACE FUNCTION update_customer_last_activity()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_TABLE_NAME = 'interactions' THEN
    UPDATE customers 
    SET last_activity_date = NEW.created_at 
    WHERE id = NEW.customer_id;
  ELSIF TG_TABLE_NAME = 'appointments' THEN
    UPDATE customers 
    SET last_activity_date = NEW.created_at 
    WHERE id = NEW.customer_id;
  ELSIF TG_TABLE_NAME = 'leads' THEN
    UPDATE customers 
    SET last_activity_date = NEW.created_at 
    WHERE id = NEW.customer_id;
  END IF;
  
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for customer activity updates
CREATE TRIGGER update_customer_activity_from_interactions
  AFTER INSERT ON interactions
  FOR EACH ROW EXECUTE FUNCTION update_customer_last_activity();

CREATE TRIGGER update_customer_activity_from_appointments
  AFTER INSERT ON appointments
  FOR EACH ROW EXECUTE FUNCTION update_customer_last_activity();

CREATE TRIGGER update_customer_activity_from_leads
  AFTER INSERT ON leads
  FOR EACH ROW EXECUTE FUNCTION update_customer_last_activity();

-- ============================================
-- INITIAL DATA
-- ============================================

-- Insert default sales rep if none exists
INSERT INTO sales_reps (first_name, last_name, email, employee_id, role)
SELECT 'John', 'Smith', 'john.smith@cadillacofsouthcharlotte.com', 'SR001', 'sales_representative'
WHERE NOT EXISTS (SELECT 1 FROM sales_reps WHERE email = 'john.smith@cadillacofsouthcharlotte.com');
