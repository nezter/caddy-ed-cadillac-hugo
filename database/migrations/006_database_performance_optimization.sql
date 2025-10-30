-- Database Performance Optimization Migration
-- Adds missing indexes, optimizes queries, and improves performance

-- ============================================
-- PERFORMANCE INDEXES FOR HIGH-TRAFFIC TABLES
-- ============================================

-- Composite indexes for common query patterns in followups table
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_followups_status_scheduled_priority 
ON followups(status, scheduled_date, priority DESC) 
WHERE status IN ('pending', 'scheduled');

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_followups_customer_status_scheduled 
ON followups(customer_id, status, scheduled_date) 
WHERE status IN ('pending', 'sent');

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_followups_campaign_status_created 
ON followups(campaign_id, status, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_followups_email_sms_consent 
ON followups(customer_id) 
WHERE (email = true AND email_consent = true) OR (sms = true AND sms_consent = true);

-- Performance indexes for followup_analytics table
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_followup_analytics_event_timestamp_customer 
ON followup_analytics(event_type, event_timestamp DESC, customer_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_followup_analytics_campaign_event_timestamp 
ON followup_analytics(campaign_id, event_type, event_timestamp DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_followup_analytics_followup_event_timestamp 
ON followup_analytics(followup_id, event_type, event_timestamp DESC);

-- Composite indexes for followup_rules table
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_followup_rules_active_trigger_priority 
ON followup_rules(is_active, trigger_event, priority DESC) 
WHERE is_active = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_followup_rules_campaign_active_priority 
ON followup_rules(campaign_id, is_active, priority DESC) 
WHERE is_active = true;

-- Performance indexes for followup_campaigns table
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_followup_campaigns_active_priority_dates 
ON followup_campaigns(is_active, priority DESC, start_date, end_date) 
WHERE is_active = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_followup_campaigns_type_audience_active 
ON followup_campaigns(campaign_type, target_audience, is_active) 
WHERE is_active = true;

-- ============================================
-- CUSTOMER TABLE PERFORMANCE OPTIMIZATIONS
-- ============================================

-- Add indexes for customer communication preferences (if not exists)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_email_consent 
ON customers(email_consent) 
WHERE email_consent = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_sms_consent 
ON customers(sms_consent) 
WHERE sms_consent = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_gdpr_status 
ON customers(gdpr_consent_withdrawn, email_consent, sms_consent);

-- Index for customer status and created_at for common queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_status_created 
ON customers(status, created_at DESC);

-- ============================================
-- LEADS TABLE PERFORMANCE OPTIMIZATIONS
-- ============================================

-- Composite index for lead assignment and status
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_assigned_status_created 
ON leads(assigned_to, status, created_at DESC) 
WHERE status IN ('new', 'contacted', 'qualified');

-- Index for lead source and status tracking
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_source_status_created 
ON leads(lead_source, status, created_at DESC);

-- ============================================
-- COMMUNICATION PREFERENCE LOG OPTIMIZATIONS
-- ============================================

-- Composite index for audit queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_communication_log_customer_action_created 
ON communication_preference_log(customer_id, action, created_at DESC);

-- Index for recent changes monitoring
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_communication_log_created_action 
ON communication_preference_log(created_at DESC, action) 
WHERE created_at > NOW() - INTERVAL '30 days';

-- ============================================
-- PARTIAL INDEXES FOR COMMON FILTERS
-- ============================================

-- Partial indexes for active campaigns only
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_campaigns_active_performance 
ON followup_campaigns(id, total_sent, total_opened, total_clicked, total_converted) 
WHERE is_active = true AND total_sent > 0;

-- Partial indexes for pending followups (most frequently queried)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_followups_pending_scheduled 
ON followups(scheduled_date, customer_id) 
WHERE status = 'pending' AND scheduled_date <= NOW() + INTERVAL '7 days';

-- Partial indexes for recent analytics
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analytics_recent_events 
ON followup_analytics(event_timestamp DESC, followup_id, event_type) 
WHERE event_timestamp >= NOW() - INTERVAL '30 days';

-- ============================================
-- JSONB INDEXES FOR EFFICIENT JSON QUERIES
-- ============================================

-- GIN indexes for JSONB fields in followup_rules
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_followup_rules_conditions_gin 
ON followup_rules USING GIN(conditions);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_followup_rules_actions_gin 
ON followup_rules USING GIN(actions);

-- GIN indexes for customer communication preferences
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_communication_preferences_gin 
ON customers USING GIN(communication_preferences);

-- GIN indexes for metadata fields
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_followup_campaigns_metadata_gin 
ON followup_campaigns USING GIN(metadata);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_followups_metadata_gin 
ON followups USING GIN(metadata);

-- ============================================
-- TEXT SEARCH INDEXES
-- ============================================

-- Full-text search indexes for campaign and template names
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_followup_campaigns_name_fts 
ON followup_campaigns USING GIN(to_tsvector('english', name || ' ' || COALESCE(description, '')));

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_email_templates_name_subject_fts 
ON email_templates USING GIN(to_tsvector('english', name || ' ' || subject || ' ' || COALESCE(description, '')));

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sms_templates_name_content_fts 
ON sms_templates USING GIN(to_tsvector('english', name || ' ' || content || ' ' || COALESCE(description, '')));

-- ============================================
-- PERFORMANCE MONITORING VIEWS
-- ============================================

-- View for campaign performance summary
CREATE OR REPLACE VIEW campaign_performance_summary AS
SELECT 
  fc.id,
  fc.name,
  fc.campaign_type,
  fc.is_active,
  fc.total_sent,
  fc.total_opened,
  fc.total_clicked,
  fc.total_converted,
  CASE 
    WHEN fc.total_sent > 0 THEN ROUND((fc.total_opened::decimal / fc.total_sent) * 100, 2)
    ELSE 0 
  END as open_rate,
  CASE 
    WHEN fc.total_sent > 0 THEN ROUND((fc.total_clicked::decimal / fc.total_sent) * 100, 2)
    ELSE 0 
  END as click_rate,
  CASE 
    WHEN fc.total_sent > 0 THEN ROUND((fc.total_converted::decimal / fc.total_sent) * 100, 2)
    ELSE 0 
  END as conversion_rate,
  fc.created_at,
  fc.updated_at
FROM followup_campaigns fc;

-- View for pending followups queue
CREATE OR REPLACE VIEW pending_followups_queue AS
SELECT 
  f.id,
  f.customer_id,
  f.lead_id,
  f.campaign_id,
  f.campaign_name,
  f.email,
  f.sms,
  f.email_template,
  f.sms_template,
  f.scheduled_date,
  f.priority,
  c.first_name,
  c.last_name,
  c.email as customer_email,
  c.phone as customer_phone,
  c.email_consent,
  c.sms_consent,
  fr.name as rule_name,
  fr.trigger_event
FROM followups f
LEFT JOIN customers c ON f.customer_id = c.id
LEFT JOIN followup_rules fr ON f.rule_id = fr.id
WHERE f.status = 'pending'
  AND f.scheduled_date <= NOW()
ORDER BY f.priority DESC, f.scheduled_date ASC;

-- View for recent analytics summary
CREATE OR REPLACE VIEW recent_analytics_summary AS
SELECT 
  fa.campaign_id,
  fc.name as campaign_name,
  fa.event_type,
  COUNT(*) as event_count,
  DATE_TRUNC('day', fa.event_timestamp) as event_date
FROM followup_analytics fa
LEFT JOIN followup_campaigns fc ON fa.campaign_id = fc.id
WHERE fa.event_timestamp >= NOW() - INTERVAL '30 days'
GROUP BY fa.campaign_id, fc.name, fa.event_type, DATE_TRUNC('day', fa.event_timestamp)
ORDER BY event_date DESC, event_count DESC;

-- ============================================
-- PERFORMANCE OPTIMIZATION FUNCTIONS
-- ============================================

-- Function to clean up old analytics data (keep last 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_analytics_data()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM followup_analytics 
  WHERE event_timestamp < NOW() - INTERVAL '90 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to update campaign statistics
CREATE OR REPLACE FUNCTION update_campaign_statistics()
RETURNS VOID AS $$
BEGIN
  UPDATE followup_campaigns fc
  SET 
    total_sent = (
      SELECT COUNT(*) 
      FROM followups f 
      WHERE f.campaign_id = fc.id AND f.status = 'sent'
    ),
    total_opened = (
      SELECT COUNT(DISTINCT f.id) 
      FROM followups f
      JOIN followup_analytics fa ON f.id = fa.followup_id
      WHERE f.campaign_id = fc.id AND fa.event_type = 'opened'
    ),
    total_clicked = (
      SELECT COUNT(DISTINCT f.id) 
      FROM followups f
      JOIN followup_analytics fa ON f.id = fa.followup_id
      WHERE f.campaign_id = fc.id AND fa.event_type = 'clicked'
    ),
    total_converted = (
      SELECT COUNT(DISTINCT f.id) 
      FROM followups f
      JOIN followup_analytics fa ON f.id = fa.followup_id
      WHERE f.campaign_id = fc.id AND fa.event_type = 'clicked'
      AND EXISTS (
        SELECT 1 FROM followup_analytics fa2 
        WHERE fa2.followup_id = f.id AND fa2.event_type = 'clicked'
        AND fa2.event_timestamp > fa.event_timestamp - INTERVAL '24 hours'
      )
    ),
    updated_at = NOW()
  WHERE fc.id IN (
    SELECT DISTINCT campaign_id 
    FROM followups 
    WHERE campaign_id IS NOT NULL 
    AND updated_at < NOW() - INTERVAL '1 hour'
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- AUTO-VACUUM AND STATISTICS CONFIGURATION
-- ============================================

-- Enable auto-vacuum for high-traffic tables
ALTER TABLE followups SET (
  autovacuum_vacuum_scale_factor = 0.1,
  autovacuum_analyze_scale_factor = 0.05,
  autovacuum_vacuum_cost_delay = '10ms'
);

ALTER TABLE followup_analytics SET (
  autovacuum_vacuum_scale_factor = 0.1,
  autovacuum_analyze_scale_factor = 0.05,
  autovacuum_vacuum_cost_delay = '10ms'
);

ALTER TABLE communication_preference_log SET (
  autovacuum_vacuum_scale_factor = 0.1,
  autovacuum_analyze_scale_factor = 0.05,
  autovacuum_vacuum_cost_delay = '10ms'
);

-- Update table statistics
ANALYZE followup_campaigns;
ANALYZE followup_rules;
ANALYZE followups;
ANALYZE followup_analytics;
ANALYZE email_templates;
ANALYZE sms_templates;
ANALYZE customers;
ANALYZE leads;
ANALYZE communication_preference_log;

-- ============================================
-- PERFORMANCE MONITORING QUERIES
-- ============================================

-- Create a table to track slow queries (optional)
CREATE TABLE IF NOT EXISTS slow_query_log (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  query_text TEXT,
  execution_time_ms INTEGER,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  table_name VARCHAR(100),
  operation VARCHAR(50)
);

-- Index for slow query log
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_slow_query_log_timestamp 
ON slow_query_log(timestamp DESC);

-- ============================================
-- COMPLETION MESSAGE
-- ============================================

-- Log migration completion
DO $$
BEGIN
  RAISE NOTICE 'Database Performance Optimization Migration Completed Successfully';
  RAISE NOTICE 'Added % indexes for improved query performance', (
    SELECT COUNT(*) 
    FROM pg_indexes 
    WHERE schemaname = 'public' 
    AND indexname LIKE 'idx_%'
    AND indexname NOT IN (
      SELECT indexname FROM pg_indexes 
      WHERE schemaname = 'public' 
      AND indexname LIKE 'idx_%'
      LIMIT 20  -- Exclude existing indexes
    )
  );
  RAISE NOTICE 'Created performance views: campaign_performance_summary, pending_followups_queue, recent_analytics_summary';
  RAISE NOTICE 'Added maintenance functions: cleanup_old_analytics_data(), update_campaign_statistics()';
  RAISE NOTICE 'Configured auto-vacuum settings for high-traffic tables';
END $$;