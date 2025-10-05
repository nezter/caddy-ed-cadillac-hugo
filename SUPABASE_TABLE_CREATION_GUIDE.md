# Supabase Database Table Creation Guide

## Overview
The CRM system requires several database tables to be created in Supabase. This guide provides step-by-step instructions for creating the necessary tables.

## Prerequisites
- Supabase project created at https://supabase.com
- Project URL and service role key configured in `.env` file

## Step 1: Access Supabase SQL Editor

1. Go to https://supabase.com/dashboard
2. Select your project (should be visible in the project list)
3. Click on "SQL Editor" in the left sidebar
4. Click "New Query" to open the SQL editor

## Step 2: Create Database Tables

Copy and paste the following SQL into the SQL Editor and click "Run":

```sql
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================
-- SALES_REPS TABLE - Sales team management
-- ============================================
CREATE TABLE IF NOT EXISTS sales_reps (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(20),
  password_hash VARCHAR(255),
  role VARCHAR(50) DEFAULT 'sales_representative',
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'on_leave', 'terminated')),
  permissions TEXT[] DEFAULT ARRAY['view_customers', 'manage_leads'],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login TIMESTAMP WITH TIME ZONE
);

-- ============================================
-- LEADS TABLE - Lead information
-- ============================================
CREATE TABLE IF NOT EXISTS leads (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  email VARCHAR(255),
  phone VARCHAR(20),
  normalized_email VARCHAR(255),
  normalized_phone VARCHAR(20),
  normalized_name VARCHAR(255),
  lead_source VARCHAR(50) DEFAULT 'website',
  status VARCHAR(20) DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'converted', 'lost', 'duplicate')),
  priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  score INTEGER DEFAULT 0,
  assigned_sales_rep_id UUID,
  vehicle_interest TEXT,
  message TEXT,
  notes TEXT,
  next_follow_up_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- INDEXES for Performance
-- ============================================

-- Sales reps indexes
CREATE INDEX IF NOT EXISTS idx_sales_reps_email ON sales_reps(email);
CREATE INDEX IF NOT EXISTS idx_sales_reps_status ON sales_reps(status);

-- Leads indexes
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(normalized_email);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(normalized_phone);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_rep ON leads(assigned_sales_rep_id);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);
```

## Step 3: Verify Table Creation

After running the SQL, you should see the tables created. You can verify by:

1. Going to "Table Editor" in the Supabase dashboard
2. Checking that `sales_reps` and `leads` tables appear in the list

## Step 4: Insert Test Data

Once tables are created, run this SQL to insert test sales representatives:

```sql
-- Insert test sales representatives
INSERT INTO sales_reps (first_name, last_name, email, phone, role, status, permissions)
VALUES
  ('John', 'Smith', 'john.smith@cadillacofsouthcharlotte.com', '(704) 555-0101', 'sales_representative', 'active', ARRAY['view_customers', 'manage_leads', 'create_appointments']),
  ('Sarah', 'Johnson', 'sarah.johnson@cadillacofsouthcharlotte.com', '(704) 555-0102', 'sales_representative', 'active', ARRAY['view_customers', 'manage_leads', 'create_appointments']),
  ('Mike', 'Davis', 'mike.davis@cadillacofsouthcharlotte.com', '(704) 555-0103', 'sales_manager', 'active', ARRAY['view_customers', 'manage_leads', 'create_appointments', 'manage_team', 'view_reports']),
  ('Lisa', 'Brown', 'lisa.brown@cadillacofsouthcharlotte.com', '(704) 555-0104', 'sales_representative', 'active', ARRAY['view_customers', 'manage_leads', 'create_appointments'])
ON CONFLICT (email) DO NOTHING;
```

## Step 5: Test Database Connection

After creating tables and inserting test data, test the connection:

```bash
node test-database-connection.js
```

You should see:
- ✅ Supabase connection successful
- ✅ Test sales rep created successfully
- ✅ Test data cleaned up

## Troubleshooting

### If tables don't appear:
- Check the SQL Editor for any error messages
- Ensure you have the correct permissions in your Supabase project
- Try refreshing the Table Editor page

### If connection test fails:
- Verify SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env file
- Check that the Supabase project is active
- Ensure the service role key has the correct permissions

### Common Issues:
- **Extension not found**: Some PostgreSQL extensions might not be available in Supabase
- **Permission denied**: Make sure you're using the service role key, not the anon key
- **Table already exists**: The `IF NOT EXISTS` clauses should prevent this, but you can drop tables first if needed

## Next Steps

Once tables are created and connection is verified:
1. Run the full test suite: `npm test`
2. Test the API endpoints
3. Verify the CRM dashboard functionality

## Files Modified/Created
- `SUPABASE_TABLE_CREATION_GUIDE.md` - This guide
- Database tables created in Supabase
- Test data inserted for development