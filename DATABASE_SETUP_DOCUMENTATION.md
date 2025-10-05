# Database Setup Documentation

## Overview

This document describes the comprehensive database setup for the Cadillac Dealership Customer Management System. The system uses a hybrid architecture with Supabase (PostgreSQL) as the primary database and Turso (SQLite) as a secondary cache/edge database.

## Architecture

### Primary Database: Supabase (PostgreSQL)
- **Purpose**: Primary data storage, complex queries, transactions
- **URL**: `https://nrcltzegfbzvkkvubgnp.supabase.co`
- **Features**: Real-time subscriptions, authentication, row-level security

### Secondary Database: Turso (SQLite)
- **Purpose**: Edge caching, fast reads, offline capabilities
- **URL**: `libsql://caddyed-nezter.aws-us-east-1.turso.io`
- **Features**: Global edge distribution, SQLite compatibility

## Database Schema

### Core Tables

#### 1. `customers`
Core customer information and relationship management.

```sql
CREATE TABLE customers (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE,
  phone VARCHAR(20),
  phone_type VARCHAR(20) DEFAULT 'mobile',
  address_line1 VARCHAR(255),
  address_line2 VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(50),
  zip_code VARCHAR(20),
  country VARCHAR(50) DEFAULT 'USA',
  customer_type VARCHAR(20) DEFAULT 'prospect',
  status VARCHAR(20) DEFAULT 'active',
  source VARCHAR(50) DEFAULT 'website',
  preferred_vehicle_type VARCHAR(50),
  budget_min DECIMAL(10,2),
  budget_max DECIMAL(10,2),
  preferred_contact_method VARCHAR(20) DEFAULT 'email',
  assigned_sales_rep_id UUID,
  assigned_sales_rep_name VARCHAR(100),
  lead_score INTEGER DEFAULT 0,
  last_activity_date TIMESTAMP WITH TIME ZONE,
  email_consent BOOLEAN DEFAULT false,
  sms_consent BOOLEAN DEFAULT false,
  phone_consent BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  -- Normalized fields for search and deduplication
  normalized_email VARCHAR(255),
  normalized_phone VARCHAR(20),
  normalized_name VARCHAR(255)
);
```

#### 2. `leads`
Lead tracking and conversion pipeline management.

```sql
CREATE TABLE leads (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  customer_id UUID REFERENCES customers(id),
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  email VARCHAR(255),
  phone VARCHAR(20),
  message TEXT,
  form_type VARCHAR(50) DEFAULT 'general',
  lead_source VARCHAR(50) DEFAULT 'website',
  page_url TEXT,
  vehicle_interest VARCHAR(255),
  vehicle_year INTEGER,
  vehicle_make VARCHAR(50),
  vehicle_model VARCHAR(50),
  vehicle_trim VARCHAR(50),
  vehicle_stock_number VARCHAR(50),
  vehicle_price DECIMAL(10,2),
  utm_source VARCHAR(100),
  utm_medium VARCHAR(100),
  utm_campaign VARCHAR(100),
  status VARCHAR(20) DEFAULT 'new',
  priority VARCHAR(20) DEFAULT 'medium',
  score INTEGER DEFAULT 0,
  assigned_sales_rep_id UUID,
  assigned_sales_rep_name VARCHAR(100),
  next_follow_up_date TIMESTAMP WITH TIME ZONE,
  follow_up_count INTEGER DEFAULT 0,
  converted_to_customer BOOLEAN DEFAULT false,
  conversion_date TIMESTAMP WITH TIME ZONE,
  conversion_value DECIMAL(10,2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_contact TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### 3. `interactions`
All customer communications and touchpoints.

```sql
CREATE TABLE interactions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  customer_id UUID REFERENCES customers(id),
  lead_id UUID REFERENCES leads(id),
  interaction_type VARCHAR(50) NOT NULL,
  direction VARCHAR(20) DEFAULT 'outbound',
  subject VARCHAR(255),
  content TEXT,
  summary TEXT,
  initiated_by VARCHAR(100),
  sales_rep_id UUID,
  sales_rep_name VARCHAR(100),
  contact_method VARCHAR(20),
  contact_details TEXT,
  outcome VARCHAR(50),
  next_action VARCHAR(255),
  next_action_date TIMESTAMP WITH TIME ZONE,
  duration_minutes INTEGER,
  tags TEXT[],
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### 4. `appointments`
Customer appointment scheduling and management.

```sql
CREATE TABLE appointments (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  customer_id UUID REFERENCES customers(id),
  lead_id UUID REFERENCES leads(id),
  appointment_type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  scheduled_start TIMESTAMP WITH TIME ZONE NOT NULL,
  scheduled_end TIMESTAMP WITH TIME ZONE NOT NULL,
  duration_minutes INTEGER,
  timezone VARCHAR(50) DEFAULT 'America/New_York',
  status VARCHAR(20) DEFAULT 'scheduled',
  confirmation_status VARCHAR(20) DEFAULT 'pending',
  location VARCHAR(255) DEFAULT 'Cadillac of South Charlotte',
  address TEXT,
  meeting_link TEXT,
  assigned_sales_rep_id UUID,
  assigned_sales_rep_name VARCHAR(100),
  vehicle_of_interest VARCHAR(255),
  vehicle_stock_number VARCHAR(50),
  preparation_notes TEXT,
  customer_notes TEXT,
  outcome TEXT,
  follow_up_actions TEXT[],
  next_appointment_id UUID REFERENCES appointments(id),
  reminder_sent BOOLEAN DEFAULT false,
  reminder_count INTEGER DEFAULT 0,
  last_reminder_sent TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);
```

#### 5. `sales_reps`
Sales team management and permissions.

```sql
CREATE TABLE sales_reps (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(20),
  employee_id VARCHAR(50) UNIQUE,
  role VARCHAR(50) DEFAULT 'sales_representative',
  department VARCHAR(50) DEFAULT 'sales',
  status VARCHAR(20) DEFAULT 'active',
  permissions TEXT[] DEFAULT ARRAY['view_customers', 'manage_leads'],
  hire_date DATE,
  current_lead_count INTEGER DEFAULT 0,
  current_customer_count INTEGER DEFAULT 0,
  monthly_sales_target DECIMAL(10,2),
  specializations TEXT[],
  languages TEXT[] DEFAULT ARRAY['english'],
  preferred_contact_method VARCHAR(20) DEFAULT 'email',
  password_hash VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login TIMESTAMP WITH TIME ZONE
);
```

#### 6. `vehicles`
Vehicle inventory tracking.

```sql
CREATE TABLE vehicles (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  stock_number VARCHAR(50) UNIQUE NOT NULL,
  vin VARCHAR(17) UNIQUE,
  year INTEGER NOT NULL,
  make VARCHAR(50) NOT NULL,
  model VARCHAR(50) NOT NULL,
  trim VARCHAR(50),
  body_style VARCHAR(50),
  exterior_color VARCHAR(50),
  interior_color VARCHAR(50),
  engine VARCHAR(100),
  transmission VARCHAR(50),
  drivetrain VARCHAR(20),
  fuel_type VARCHAR(20),
  mileage INTEGER,
  list_price DECIMAL(10,2),
  sale_price DECIMAL(10,2),
  msrp DECIMAL(10,2),
  status VARCHAR(20) DEFAULT 'available',
  features TEXT[],
  packages TEXT[],
  image_urls TEXT[],
  video_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  date_in_stock DATE,
  date_sold DATE
);
```

#### 7. `tasks`
Sales team task management.

```sql
CREATE TABLE tasks (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  task_type VARCHAR(50) DEFAULT 'follow_up',
  assigned_to UUID REFERENCES sales_reps(id),
  assigned_to_name VARCHAR(100),
  customer_id UUID REFERENCES customers(id),
  lead_id UUID REFERENCES leads(id),
  appointment_id UUID REFERENCES appointments(id),
  priority VARCHAR(20) DEFAULT 'medium',
  status VARCHAR(20) DEFAULT 'pending',
  due_date TIMESTAMP WITH TIME ZONE,
  completed_date TIMESTAMP WITH TIME ZONE,
  estimated_duration_minutes INTEGER,
  actual_duration_minutes INTEGER,
  tags TEXT[],
  checklist JSONB DEFAULT '[]',
  attachments TEXT[],
  outcome TEXT,
  lessons_learned TEXT,
  is_recurring BOOLEAN DEFAULT false,
  recurrence_pattern JSONB,
  next_occurrence TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## Environment Configuration

### Required Environment Variables

```bash
# Supabase Configuration
SUPABASE_URL=https://nrcltzegfbzvkkvubgnp.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Turso Configuration  
TURSO_DATABASE_URL=libsql://caddyed-nezter.aws-us-east-1.turso.io
TURSO_AUTH_TOKEN=your_auth_token_here

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=8h
```

## Setup Instructions

### 1. Supabase Setup

1. Create account at [Supabase](https://supabase.com)
2. Create new project
3. Go to Settings > API
4. Copy URL and anon key
5. Go to Settings > API > Service Role
6. Copy service role key (keep secret!)

### 2. Turso Setup (Optional - for hybrid architecture)

1. Create account at [Turso](https://turso.tech)
2. Create new database
3. Copy database URL and auth token

### 3. Database Migration

```bash
# Test database connections
node scripts/setup-database-connections.js

# Run migrations
npm run migrate

# Check migration status
npm run migrate:status
```

### 4. Schema Setup

The migrations need to be run manually in the Supabase dashboard SQL editor:

1. Go to Supabase Dashboard > SQL Editor
2. Run the migration files in order:
   - `001_create_comprehensive_schema.sql`
   - `002_create_functions_and_triggers.sql`
   - `004_add_password_hash_to_sales_reps.sql`

For Turso, run the SQLite-compatible schema:
- `003_create_turso_schema.sql`

## Database Functions

### Data Normalization

```sql
-- Normalize email addresses
CREATE OR REPLACE FUNCTION normalize_email(email TEXT)
RETURNS TEXT AS $$
BEGIN
  IF email IS NULL OR email = '' THEN
    RETURN NULL;
  END IF;
  
  RETURN LOWER(TRIM(email));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Normalize phone numbers (US format)
CREATE OR REPLACE FUNCTION normalize_phone(phone TEXT)
RETURNS TEXT AS $$
BEGIN
  IF phone IS NULL OR phone = '' THEN
    RETURN NULL;
  END IF;
  
  -- Remove all non-numeric characters
  phone := REGEXP_REPLACE(phone, '[^0-9]', '', 'g');
  
  -- Handle country code
  IF LENGTH(phone) = 11 AND LEFT(phone, 1) = '1' THEN
    phone := SUBSTRING(phone, 2);
  END IF;
  
  -- Validate US phone number length
  IF LENGTH(phone) != 10 THEN
    RETURN NULL;
  END IF;
  
  RETURN phone;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
```

### Lead Deduplication

```sql
CREATE OR REPLACE FUNCTION find_potential_duplicates(
  p_email VARCHAR(255),
  p_phone VARCHAR(20),
  p_first_name VARCHAR(100),
  p_last_name VARCHAR(100),
  p_confidence_threshold DECIMAL DEFAULT 0.8
)
RETURNS TABLE(
  lead_id UUID,
  customer_id UUID,
  confidence DECIMAL,
  match_type TEXT,
  details JSONB
) AS $$
BEGIN
  -- Implementation for finding duplicate leads
  -- Returns potential duplicates with confidence scores
END;
$$ LANGUAGE plpgsql;
```

### Lead Scoring

```sql
CREATE OR REPLACE FUNCTION calculate_lead_score(
  p_source VARCHAR(50),
  p_vehicle_interest BOOLEAN DEFAULT false,
  p_message_length INTEGER DEFAULT 0,
  p_budget_provided BOOLEAN DEFAULT false,
  p_phone_provided BOOLEAN DEFAULT false,
  p_test_drive_requested BOOLEAN DEFAULT false
)
RETURNS INTEGER AS $$
DECLARE
  score INTEGER := 0;
BEGIN
  -- Base score for all leads
  score := score + 10;
  
  -- Source scoring
  CASE p_source
    WHEN 'phone' THEN score := score + 20;
    WHEN 'referral' THEN score := score + 15;
    WHEN 'website' THEN score := score + 10;
    WHEN 'trade_in' THEN score := score + 25;
    WHEN 'service' THEN score := score + 15;
    ELSE score := score + 5;
  END CASE;
  
  -- Additional scoring factors
  IF p_vehicle_interest THEN
    score := score + 15;
  END IF;
  
  IF p_phone_provided THEN
    score := score + 10;
  END IF;
  
  IF p_test_drive_requested THEN
    score := score + 20;
  END IF;
  
  RETURN score;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
```

## API Integration

### Database Service

The `DatabaseService` class provides a unified interface for database operations:

```javascript
const DatabaseService = require('./netlify/functions/utils/database-service');

// Create a customer
const customer = await DatabaseService.createCustomer({
  first_name: 'John',
  last_name: 'Doe',
  email: 'john.doe@example.com',
  phone: '555-0123'
});

// Search customers
const customers = await DatabaseService.searchCustomers({
  search: 'john',
  customer_type: 'prospect',
  limit: 20
});

// Create an interaction
const interaction = await DatabaseService.createInteraction({
  customer_id: customer.id,
  interaction_type: 'phone_call',
  content: 'Initial contact with customer'
});
```

### Authentication

JWT-based authentication for sales representatives:

```javascript
// Login endpoint
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'sales.rep@cadillac.com',
  password: 'password'
});

// Auth check middleware
const decodedToken = jwt.verify(authToken, JWT_SECRET);
const user = await DatabaseService.getSalesRep(decodedToken.userId);
```

## Performance Optimization

### Indexes

#### Customers Table
- `idx_customers_email` (email lookup)
- `idx_customers_phone` (phone lookup)
- `idx_customers_name` (name search with trigram)
- `idx_customers_type` (customer type filtering)
- `idx_customers_status` (status filtering)
- `idx_customers_assigned_rep` (sales rep assignment)
- `idx_customers_created_at` (time-based queries)
- `idx_customers_last_activity` (activity tracking)

#### Leads Table
- `idx_leads_customer_id` (customer relationship)
- `idx_leads_email` (email lookup)
- `idx_leads_phone` (phone lookup)
- `idx_leads_status` (status filtering)
- `idx_leads_source` (source tracking)
- `idx_leads_assigned_rep` (sales rep assignment)
- `idx_leads_created_at` (time-based queries)
- `idx_leads_next_followup` (follow-up scheduling)

### Views

#### Active Customers View
```sql
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
```

## Triggers

### Automated Timestamp Updates

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply to all tables
CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### Activity Tracking

```sql
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
  END IF;
  
  RETURN NEW;
END;
$$ language 'plpgsql';
```

## Testing

### Connection Tests

```bash
# Test database connections
node scripts/setup-database-connections.js

# Test CRUD operations
node scripts/test-database-operations.js
```

### Mock Data

For development and testing, the system includes mock data generation:

```javascript
// Generate test customers
const testCustomers = generateMockCustomers(10);

// Generate test leads
const testLeads = generateMockLeads(25);

// Generate test interactions
const testInteractions = generateMockInteractions(50);
```

## Backup and Recovery

### Supabase
- Automatic daily backups
- Point-in-time recovery (7 days)
- Physical backups (30 days)

### Turso
- Automatic snapshots
- Point-in-time recovery
- Export functionality

## Security Considerations

### Row Level Security (RLS)

```sql
-- Enable RLS on customers table
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- Sales reps can only see their assigned customers
CREATE POLICY "sales_rep_own_customers" ON customers
  FOR ALL
  TO authenticated
  USING (assigned_sales_rep_id = auth.uid());

-- Admin can see all customers
CREATE POLICY "admin_all_customers" ON customers
  FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM sales_reps 
    WHERE id = auth.uid() AND role = 'admin'
  ));
```

### Data Encryption

- Data encrypted at rest (Supabase)
- Data encrypted in transit (HTTPS)
- Sensitive fields (passwords) hashed with bcrypt

## Monitoring

### Performance Metrics

- Query execution time tracking
- Connection pool monitoring
- Index usage statistics
- Slow query identification

### Alerts

- Database connection failures
- High error rates
- Unusual activity patterns

## Troubleshooting

### Common Issues

1. **Table not found errors**
   - Run migrations: `npm run migrate`
   - Check migration status: `npm run migrate:status`

2. **Connection timeouts**
   - Verify environment variables
   - Check network connectivity
   - Review database logs

3. **Slow queries**
   - Check index usage
   - Analyze query plans
   - Consider query optimization

### Support Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Turso Documentation](https://turso.tech/docs)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)

## Migration Process

### From Legacy System

1. Export data from legacy system
2. Transform data to new schema
3. Import using staging environment
4. Validate data integrity
5. Switch to new system
6. Decommission legacy system

### Schema Updates

1. Create new migration file: `005_schema_update.sql`
2. Test on development environment
3. Deploy to staging
4. Test thoroughly
5. Deploy to production
6. Verify functionality

## Conclusion

This database setup provides a robust, scalable foundation for the Cadillac Dealership Customer Management System. The hybrid architecture ensures both data consistency (via Supabase) and performance (via Turso), while the comprehensive schema supports all business requirements from lead generation to customer relationship management.

The system is designed to handle:
- High volume of leads and customer data
- Complex queries and reporting
- Real-time updates and notifications
- Multi-user collaboration
- Data security and compliance
- Scalable growth and performance

Regular maintenance, monitoring, and updates will ensure the system continues to meet business needs as they evolve.
