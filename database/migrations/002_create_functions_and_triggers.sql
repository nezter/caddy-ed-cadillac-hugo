-- Database Functions, Triggers, and Utilities
-- This migration adds helper functions and additional triggers

-- ============================================
-- DATA NORMALIZATION FUNCTIONS
-- ============================================

-- Function to normalize email addresses
CREATE OR REPLACE FUNCTION normalize_email(email TEXT)
RETURNS TEXT AS $$
BEGIN
  IF email IS NULL OR email = '' THEN
    RETURN NULL;
  END IF;
  
  RETURN LOWER(TRIM(email));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to normalize phone numbers (US format)
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

-- Function to normalize names for search
CREATE OR REPLACE FUNCTION normalize_name(first_name TEXT, last_name TEXT)
RETURNS TEXT AS $$
BEGIN
  IF first_name IS NULL AND last_name IS NULL THEN
    RETURN NULL;
  END IF;
  
  RETURN LOWER(TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================
-- LEAD DEDUPLICATION FUNCTIONS
-- ============================================

-- Function to find potential duplicate leads
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
DECLARE
  normalized_email VARCHAR(255);
  normalized_phone VARCHAR(20);
  normalized_name VARCHAR(255);
BEGIN
  -- Normalize input parameters
  normalized_email := normalize_email(p_email);
  normalized_phone := normalize_phone(p_phone);
  normalized_name := normalize_name(p_first_name, p_last_name);
  
  -- Exact email match (highest confidence)
  RETURN QUERY
  SELECT 
    l.id,
    l.customer_id,
    1.0::DECIMAL as confidence,
    'exact_email'::TEXT as match_type,
    jsonb_build_object('email', l.email, 'created_at', l.created_at) as details
  FROM leads l
  WHERE l.normalized_email = normalized_email
    AND l.status != 'duplicate'
    AND l.merged_into IS NULL;
  
  -- Exact phone match
  IF normalized_phone IS NOT NULL THEN
    RETURN QUERY
    SELECT 
      l.id,
      l.customer_id,
      0.95::DECIMAL as confidence,
      'exact_phone'::TEXT as match_type,
      jsonb_build_object('phone', l.phone, 'created_at', l.created_at) as details
    FROM leads l
    WHERE l.normalized_phone = normalized_phone
      AND l.status != 'duplicate'
      AND l.merged_into IS NULL
      AND l.id NOT IN (SELECT lead_id FROM find_potential_duplicates(p_email, p_phone, p_first_name, p_last_name, p_confidence_threshold));
  END IF;
  
  -- Name similarity match
  IF normalized_name IS NOT NULL THEN
    RETURN QUERY
    SELECT 
      l.id,
      l.customer_id,
      CASE 
        WHEN SIMILARITY(l.normalized_name, normalized_name) >= 0.8 THEN 0.8::DECIMAL
        WHEN SIMILARITY(l.normalized_name, normalized_name) >= 0.6 THEN 0.6::DECIMAL
        ELSE 0.4::DECIMAL
      END as confidence,
      'name_similarity'::TEXT as match_type,
      jsonb_build_object(
        'name', l.first_name || ' ' || l.last_name,
        'similarity', SIMILARITY(l.normalized_name, normalized_name),
        'created_at', l.created_at
      ) as details
    FROM leads l
    WHERE l.normalized_name % normalized_name
      AND SIMILARITY(l.normalized_name, normalized_name) >= 0.6
      AND l.status != 'duplicate'
      AND l.merged_into IS NULL
      AND l.id NOT IN (SELECT lead_id FROM find_potential_duplicates(p_email, p_phone, p_first_name, p_last_name, p_confidence_threshold));
  END IF;
  
  -- Filter by confidence threshold
  RETURN QUERY
  SELECT * FROM find_potential_duplicates(p_email, p_phone, p_first_name, p_last_name, p_confidence_threshold)
  WHERE confidence >= p_confidence_threshold;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate lead score
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
  
  -- Vehicle interest
  IF p_vehicle_interest THEN
    score := score + 15;
  END IF;
  
  -- Message length (indicates engagement)
  IF p_message_length > 100 THEN
    score := score + 10;
  ELSIF p_message_length > 50 THEN
    score := score + 5;
  END IF;
  
  -- Budget information
  IF p_budget_provided THEN
    score := score + 15;
  END IF;
  
  -- Phone provided
  IF p_phone_provided THEN
    score := score + 10;
  END IF;
  
  -- Test drive requested
  IF p_test_drive_requested THEN
    score := score + 20;
  END IF;
  
  RETURN score;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================
-- AUTOMATION FUNCTIONS
-- ============================================

-- Function to create follow-up tasks
CREATE OR REPLACE FUNCTION create_follow_up_task(
  p_customer_id UUID,
  p_sales_rep_id UUID,
  p_task_type VARCHAR(50) DEFAULT 'follow_up',
  p_priority VARCHAR(20) DEFAULT 'medium',
  p_due_date TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '1 day',
  p_title TEXT DEFAULT 'Follow up with customer',
  p_description TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  task_id UUID;
BEGIN
  INSERT INTO tasks (
    title,
    description,
    task_type,
    assigned_to,
    customer_id,
    priority,
    due_date,
    created_by
  ) VALUES (
    p_title,
    p_description,
    p_task_type,
    p_sales_rep_id,
    p_customer_id,
    p_priority,
    p_due_date,
    'system'
  ) RETURNING id INTO task_id;
  
  RETURN task_id;
END;
$$ LANGUAGE plpgsql;

-- Function to update lead status based on interactions
CREATE OR REPLACE FUNCTION update_lead_status_from_interactions()
RETURNS TRIGGER AS $$
BEGIN
  -- If this is a successful interaction, update lead status
  IF NEW.interaction_type IN ('phone_call', 'in_person', 'test_drive') 
     AND NEW.outcome IN ('interested', 'appointment_set') THEN
    UPDATE leads 
    SET status = 'contacted',
        follow_up_count = follow_up_count + 1,
        last_contact = NEW.created_at
    WHERE id = NEW.lead_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- REPORTING FUNCTIONS
-- ============================================

-- Function to get lead conversion metrics
CREATE OR REPLACE FUNCTION get_lead_conversion_metrics(
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS TABLE(
  period DATE,
  total_leads BIGINT,
  converted_leads BIGINT,
  conversion_rate DECIMAL,
  avg_lead_score DECIMAL,
  source VARCHAR(50)
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    DATE_TRUNC('day', l.created_at)::DATE as period,
    COUNT(*) as total_leads,
    COUNT(CASE WHEN l.status = 'converted' THEN 1 END) as converted_leads,
    CASE 
      WHEN COUNT(*) > 0 THEN 
        ROUND(COUNT(CASE WHEN l.status = 'converted' THEN 1 END)::DECIMAL / COUNT(*) * 100, 2)
      ELSE 0 
    END as conversion_rate,
    ROUND(AVG(l.score), 2) as avg_lead_score,
    l.lead_source as source
  FROM leads l
  WHERE (p_start_date IS NULL OR DATE(l.created_at) >= p_start_date)
    AND (p_end_date IS NULL OR DATE(l.created_at) <= p_end_date)
  GROUP BY DATE_TRUNC('day', l.created_at)::DATE, l.lead_source
  ORDER BY period DESC, source;
END;
$$ LANGUAGE plpgsql;

-- Function to get sales rep performance
CREATE OR REPLACE FUNCTION get_sales_rep_performance(
  p_sales_rep_id UUID DEFAULT NULL,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS TABLE(
  sales_rep_id UUID,
  sales_rep_name VARCHAR,
  total_customers BIGINT,
  active_leads BIGINT,
  converted_leads BIGINT,
  appointments_scheduled BIGINT,
  appointments_completed BIGINT,
  tasks_completed BIGINT,
  conversion_rate DECIMAL,
  avg_response_time_hours DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    sr.id as sales_rep_id,
    sr.first_name || ' ' || sr.last_name as sales_rep_name,
    COUNT(DISTINCT c.id) as total_customers,
    COUNT(DISTINCT l.id) FILTER (WHERE l.status IN ('new', 'contacted', 'qualified')) as active_leads,
    COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'converted') as converted_leads,
    COUNT(DISTINCT a.id) FILTER (WHERE a.status IN ('scheduled', 'confirmed')) as appointments_scheduled,
    COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'completed') as appointments_completed,
    COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'completed') as tasks_completed,
    CASE 
      WHEN COUNT(DISTINCT l.id) > 0 THEN 
        ROUND(COUNT(DISTINCT CASE WHEN l.status = 'converted' THEN l.id END)::DECIMAL / COUNT(DISTINCT l.id) * 100, 2)
      ELSE 0 
    END as conversion_rate,
    ROUND(AVG(
      EXTRACT(EPOCH FROM (i.created_at - l.created_at)) / 3600
    ), 2) as avg_response_time_hours
  FROM sales_reps sr
  LEFT JOIN customers c ON sr.id = c.assigned_sales_rep_id
  LEFT JOIN leads l ON sr.id = l.assigned_sales_rep_id
    AND (p_start_date IS NULL OR DATE(l.created_at) >= p_start_date)
    AND (p_end_date IS NULL OR DATE(l.created_at) <= p_end_date)
  LEFT JOIN appointments a ON sr.id = a.assigned_sales_rep_id
    AND (p_start_date IS NULL OR DATE(a.created_at) >= p_start_date)
    AND (p_end_date IS NULL OR DATE(a.created_at) <= p_end_date)
  LEFT JOIN tasks t ON sr.id = t.assigned_to
    AND (p_start_date IS NULL OR DATE(t.created_at) >= p_start_date)
    AND (p_end_date IS NULL OR DATE(t.created_at) <= p_end_date)
  LEFT JOIN interactions i ON l.id = i.lead_id AND i.interaction_type = 'phone_call'
  WHERE (p_sales_rep_id IS NULL OR sr.id = p_sales_rep_id)
    AND sr.status = 'active'
  GROUP BY sr.id, sr.first_name, sr.last_name
  ORDER BY conversion_rate DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- AUTOMATED TRIGGERS
-- ============================================

-- Trigger to normalize customer data on insert/update
CREATE OR REPLACE FUNCTION normalize_customer_data()
RETURNS TRIGGER AS $$
BEGIN
  NEW.normalized_email := normalize_email(NEW.email);
  NEW.normalized_phone := normalize_phone(NEW.phone);
  NEW.normalized_name := normalize_name(NEW.first_name, NEW.last_name);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for data normalization
CREATE TRIGGER normalize_customer_on_insert
  BEFORE INSERT ON customers
  FOR EACH ROW EXECUTE FUNCTION normalize_customer_data();

CREATE TRIGGER normalize_customer_on_update
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION normalize_customer_data();

-- Trigger to normalize lead data on insert/update
CREATE OR REPLACE FUNCTION normalize_lead_data()
RETURNS TRIGGER AS $$
BEGIN
  NEW.normalized_email := normalize_email(NEW.email);
  NEW.normalized_phone := normalize_phone(NEW.phone);
  NEW.normalized_name := normalize_name(NEW.first_name, NEW.last_name);
  
  -- Auto-calculate lead score if not provided
  IF NEW.score IS NULL OR NEW.score = 0 THEN
    NEW.score := calculate_lead_score(
      NEW.lead_source,
      NEW.vehicle_interest IS NOT NULL,
      LENGTH(COALESCE(NEW.message, '')),
      FALSE, -- budget_provided (would need additional logic)
      NEW.phone IS NOT NULL,
      NEW.form_type = 'test_drive'
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for lead normalization
CREATE TRIGGER normalize_lead_on_insert
  BEFORE INSERT ON leads
  FOR EACH ROW EXECUTE FUNCTION normalize_lead_data();

CREATE TRIGGER normalize_lead_on_update
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION normalize_lead_data();

-- Trigger to automatically create follow-up tasks for new leads
CREATE OR REPLACE FUNCTION create_lead_follow_up_task()
RETURNS TRIGGER AS $$
DECLARE
  task_id UUID;
BEGIN
  -- Create follow-up task if lead is assigned to a sales rep
  IF NEW.assigned_sales_rep_id IS NOT NULL 
     AND NEW.status = 'new' 
     AND (TG_OP = 'INSERT' OR (OLD.assigned_sales_rep_id IS NULL AND NEW.assigned_sales_rep_id IS NOT NULL)) THEN
    
    task_id := create_follow_up_task(
      p_customer_id => NEW.customer_id,
      p_sales_rep_id => NEW.assigned_sales_rep_id,
      p_title => 'Follow up on new lead: ' || COALESCE(NEW.first_name || ' ' || NEW.last_name, 'Unknown'),
      p_description => 'New lead received via ' || NEW.lead_source,
      p_priority => CASE NEW.priority 
                      WHEN 'urgent' THEN 'high'
                      WHEN 'high' THEN 'medium'
                      ELSE 'low'
                    END,
      p_due_date => NOW() + CASE NEW.priority 
                              WHEN 'urgent' THEN INTERVAL '2 hours'
                              WHEN 'high' THEN INTERVAL '4 hours'
                              ELSE INTERVAL '1 day'
                            END
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER create_lead_follow_up
  AFTER INSERT OR UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION create_lead_follow_up_task();

-- Trigger to update lead status from interactions
CREATE TRIGGER update_lead_status_from_interactions_trigger
  AFTER INSERT ON interactions
  FOR EACH ROW EXECUTE FUNCTION update_lead_status_from_interactions();

-- ============================================
-- VIEWS FOR REPORTING
-- ============================================

-- Lead conversion funnel view
CREATE OR REPLACE VIEW lead_conversion_funnel AS
SELECT 
  DATE_TRUNC('month', created_at)::DATE as month,
  lead_source,
  COUNT(*) as total_leads,
  COUNT(CASE WHEN status = 'contacted' THEN 1 END) as contacted,
  COUNT(CASE WHEN status = 'qualified' THEN 1 END) as qualified,
  COUNT(CASE WHEN status = 'converted' THEN 1 END) as converted,
  ROUND(COUNT(CASE WHEN status = 'converted' THEN 1 END)::DECIMAL / COUNT(*) * 100, 2) as conversion_rate,
  AVG(score) as avg_lead_score
FROM leads
GROUP BY DATE_TRUNC('month', created_at)::DATE, lead_source
ORDER BY month DESC, lead_source;

-- Customer activity timeline view
CREATE OR REPLACE VIEW customer_activity_timeline AS
SELECT 
  c.id as customer_id,
  c.first_name,
  c.last_name,
  c.email,
  'interaction' as activity_type,
  i.interaction_type,
  i.content,
  i.created_at,
  i.sales_rep_name
FROM customers c
JOIN interactions i ON c.id = i.customer_id

UNION ALL

SELECT 
  c.id as customer_id,
  c.first_name,
  c.last_name,
  c.email,
  'appointment' as activity_type,
  a.appointment_type,
  a.title,
  a.created_at,
  a.assigned_sales_rep_name
FROM customers c
JOIN appointments a ON c.id = a.customer_id

UNION ALL

SELECT 
  c.id as customer_id,
  c.first_name,
  c.last_name,
  c.email,
  'lead' as activity_type,
  l.form_type,
  l.message,
  l.created_at,
  l.assigned_sales_rep_name
FROM customers c
JOIN leads l ON c.id = l.customer_id

ORDER BY created_at DESC;

-- Sales dashboard metrics view
CREATE OR REPLACE VIEW sales_dashboard_metrics AS
SELECT 
  -- Today's metrics
  COUNT(DISTINCT CASE WHEN DATE(l.created_at) = CURRENT_DATE THEN l.id END) as leads_today,
  COUNT(DISTINCT CASE WHEN DATE(i.created_at) = CURRENT_DATE THEN i.id END) as interactions_today,
  COUNT(DISTINCT CASE WHEN DATE(a.created_at) = CURRENT_DATE THEN a.id END) as appointments_today,
  
  -- This week's metrics
  COUNT(DISTINCT CASE WHEN DATE(l.created_at) >= DATE_TRUNC('week', CURRENT_DATE) THEN l.id END) as leads_this_week,
  COUNT(DISTINCT CASE WHEN DATE(i.created_at) >= DATE_TRUNC('week', CURRENT_DATE) THEN i.id END) as interactions_this_week,
  COUNT(DISTINCT CASE WHEN DATE(a.created_at) >= DATE_TRUNC('week', CURRENT_DATE) THEN a.id END) as appointments_this_week,
  
  -- This month's metrics
  COUNT(DISTINCT CASE WHEN DATE(l.created_at) >= DATE_TRUNC('month', CURRENT_DATE) THEN l.id END) as leads_this_month,
  COUNT(DISTINCT CASE WHEN DATE(i.created_at) >= DATE_TRUNC('month', CURRENT_DATE) THEN i.id END) as interactions_this_month,
  COUNT(DISTINCT CASE WHEN DATE(a.created_at) >= DATE_TRUNC('month', CURRENT_DATE) THEN a.id END) as appointments_this_month,
  
  -- Pipeline metrics
  COUNT(DISTINCT CASE WHEN l.status = 'new' THEN l.id END) as new_leads,
  COUNT(DISTINCT CASE WHEN l.status = 'contacted' THEN l.id END) as contacted_leads,
  COUNT(DISTINCT CASE WHEN l.status = 'qualified' THEN l.id END) as qualified_leads,
  COUNT(DISTINCT CASE WHEN a.status IN ('scheduled', 'confirmed') THEN a.id END) as upcoming_appointments,
  
  -- Performance metrics
  ROUND(AVG(l.score), 2) as avg_lead_score,
  COUNT(DISTINCT c.id) as total_customers,
  COUNT(DISTINCT sr.id) as active_sales_reps
FROM leads l
LEFT JOIN interactions i ON l.id = i.lead_id
LEFT JOIN appointments a ON l.customer_id = a.customer_id
LEFT JOIN customers c ON l.customer_id = c.id
LEFT JOIN sales_reps sr ON c.assigned_sales_rep_id = sr.id AND sr.status = 'active';
