-- Follow-up System Tables Migration
-- Adds tables for automated follow-up campaigns, rules, and templates

-- ============================================
-- FOLLOWUP_CAMPAIGNS TABLE - Campaign management
-- ============================================
CREATE TABLE IF NOT EXISTS followup_campaigns (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,

  -- Campaign Information
  name VARCHAR(255) NOT NULL,
  description TEXT,
  campaign_type VARCHAR(50) DEFAULT 'nurture' CHECK (campaign_type IN (
    'nurture', 're_engagement', 'welcome', 'birthday', 'anniversary', 'holiday', 'custom'
  )),

  -- Campaign Settings
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 1, -- Higher numbers = higher priority
  target_audience VARCHAR(50) DEFAULT 'all' CHECK (target_audience IN (
    'all', 'prospects', 'leads', 'active_customers', 'inactive_customers', 'vip_customers'
  )),

  -- Scheduling
  start_date TIMESTAMP WITH TIME ZONE,
  end_date TIMESTAMP WITH TIME ZONE,
  timezone VARCHAR(50) DEFAULT 'America/New_York',

  -- Performance Tracking
  total_sent INTEGER DEFAULT 0,
  total_opened INTEGER DEFAULT 0,
  total_clicked INTEGER DEFAULT 0,
  total_converted INTEGER DEFAULT 0,
  total_unsubscribed INTEGER DEFAULT 0,

  -- Metadata
  tags TEXT[],
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by VARCHAR(100),
  updated_by VARCHAR(100)
);

-- ============================================
-- FOLLOWUP_RULES TABLE - Automated rules engine
-- ============================================
CREATE TABLE IF NOT EXISTS followup_rules (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,

  -- Rule Information
  name VARCHAR(255) NOT NULL,
  description TEXT,
  trigger_event VARCHAR(100) NOT NULL, -- lead_created, interaction_added, appointment_completed, etc.

  -- Conditions (JSON structure for flexible rule conditions)
  conditions JSONB DEFAULT '{}',
  customer_conditions JSONB DEFAULT '{}',
  lead_conditions JSONB DEFAULT '{}',
  interaction_conditions JSONB DEFAULT '{}',

  -- Actions (JSON structure for rule actions)
  actions JSONB DEFAULT '[]',

  -- Campaign Association
  campaign_id UUID REFERENCES followup_campaigns(id) ON DELETE SET NULL,
  campaign_name VARCHAR(255),

  -- Rule Settings
  priority INTEGER DEFAULT 1,
  delay_hours INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,

  -- Scheduling Constraints
  start_date TIMESTAMP WITH TIME ZONE,
  end_date TIMESTAMP WITH TIME ZONE,
  days_of_week INTEGER[], -- 0=Sunday, 6=Saturday
  time_range_start TIME,
  time_range_end TIME,
  business_hours_only BOOLEAN DEFAULT false,

  -- Performance Tracking
  trigger_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,

  -- Metadata
  tags TEXT[],
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by VARCHAR(100),
  updated_by VARCHAR(100)
);

-- ============================================
-- FOLLOWUPS TABLE - Scheduled and sent follow-ups
-- ============================================
CREATE TABLE IF NOT EXISTS followups (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,

  -- Relationships
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES followup_campaigns(id) ON DELETE SET NULL,
  rule_id UUID REFERENCES followup_rules(id) ON DELETE SET NULL,

  -- Campaign Info
  campaign_name VARCHAR(255),

  -- Communication Details
  email BOOLEAN DEFAULT false,
  sms BOOLEAN DEFAULT false,
  email_template VARCHAR(255),
  sms_template VARCHAR(255),

  -- Scheduling
  scheduled_date TIMESTAMP WITH TIME ZONE NOT NULL,
  sent_date TIMESTAMP WITH TIME ZONE,
  priority INTEGER DEFAULT 1,

  -- Status
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN (
    'pending', 'sent', 'skipped', 'error', 'cancelled'
  )),
  skip_reason TEXT,
  error_message TEXT,

  -- Consent Tracking
  email_consent BOOLEAN DEFAULT false,
  sms_consent BOOLEAN DEFAULT false,

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by VARCHAR(100)
);

-- ============================================
-- EMAIL_TEMPLATES TABLE - Email template management
-- ============================================
CREATE TABLE IF NOT EXISTS email_templates (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,

  -- Template Information
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  subject VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,

  -- Template Settings
  template_type VARCHAR(50) DEFAULT 'general' CHECK (template_type IN (
    'welcome', 'follow_up', 'reminder', 'confirmation', 'nurture', 're_engagement', 'custom'
  )),
  is_active BOOLEAN DEFAULT true,

  -- Variables (JSON array of available personalization variables)
  variables JSONB DEFAULT '[]',

  -- Usage Tracking
  usage_count INTEGER DEFAULT 0,
  last_used TIMESTAMP WITH TIME ZONE,

  -- Preview and Testing
  preview_text TEXT, -- For email clients that show preview text
  test_email VARCHAR(255), -- Email address for testing

  -- Metadata
  tags TEXT[],
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by VARCHAR(100),
  updated_by VARCHAR(100)
);

-- ============================================
-- SMS_TEMPLATES TABLE - SMS template management
-- ============================================
CREATE TABLE IF NOT EXISTS sms_templates (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,

  -- Template Information
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  content TEXT NOT NULL,

  -- Template Settings
  template_type VARCHAR(50) DEFAULT 'general' CHECK (template_type IN (
    'welcome', 'follow_up', 'reminder', 'confirmation', 'nurture', 're_engagement', 'custom'
  )),
  is_active BOOLEAN DEFAULT true,

  -- Character limits and encoding
  character_count INTEGER GENERATED ALWAYS AS (length(content)) STORED,
  message_count INTEGER GENERATED ALWAYS AS (
    CASE WHEN length(content) <= 160 THEN 1
         WHEN length(content) <= 320 THEN 2
         ELSE ceil(length(content)::decimal / 153)
    END
  ) STORED,

  -- Variables (JSON array of available personalization variables)
  variables JSONB DEFAULT '[]',

  -- Usage Tracking
  usage_count INTEGER DEFAULT 0,
  last_used TIMESTAMP WITH TIME ZONE,

  -- Testing
  test_phone VARCHAR(20),

  -- Metadata
  tags TEXT[],
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by VARCHAR(100),
  updated_by VARCHAR(100)
);

-- ============================================
-- INDEXES for Performance
-- ============================================

-- Followup campaigns indexes
CREATE INDEX IF NOT EXISTS idx_followup_campaigns_active ON followup_campaigns(is_active);
CREATE INDEX IF NOT EXISTS idx_followup_campaigns_type ON followup_campaigns(campaign_type);
CREATE INDEX IF NOT EXISTS idx_followup_campaigns_priority ON followup_campaigns(priority DESC);

-- Followup rules indexes
CREATE INDEX IF NOT EXISTS idx_followup_rules_trigger ON followup_rules(trigger_event);
CREATE INDEX IF NOT EXISTS idx_followup_rules_active ON followup_rules(is_active);
CREATE INDEX IF NOT EXISTS idx_followup_rules_campaign ON followup_rules(campaign_id);
CREATE INDEX IF NOT EXISTS idx_followup_rules_priority ON followup_rules(priority DESC);

-- Followups indexes
CREATE INDEX IF NOT EXISTS idx_followups_customer ON followups(customer_id);
CREATE INDEX IF NOT EXISTS idx_followups_lead ON followups(lead_id);
CREATE INDEX IF NOT EXISTS idx_followups_campaign ON followups(campaign_id);
CREATE INDEX IF NOT EXISTS idx_followups_rule ON followups(rule_id);
CREATE INDEX IF NOT EXISTS idx_followups_status ON followups(status);
CREATE INDEX IF NOT EXISTS idx_followups_scheduled ON followups(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_followups_sent ON followups(sent_date);
CREATE INDEX IF NOT EXISTS idx_followups_priority ON followups(priority DESC);

-- Email templates indexes
CREATE INDEX IF NOT EXISTS idx_email_templates_name ON email_templates(name);
CREATE INDEX IF NOT EXISTS idx_email_templates_type ON email_templates(template_type);
CREATE INDEX IF NOT EXISTS idx_email_templates_active ON email_templates(is_active);

-- SMS templates indexes
CREATE INDEX IF NOT EXISTS idx_sms_templates_name ON sms_templates(name);
CREATE INDEX IF NOT EXISTS idx_sms_templates_type ON sms_templates(template_type);
CREATE INDEX IF NOT EXISTS idx_sms_templates_active ON sms_templates(is_active);

-- ============================================
-- TRIGGERS for Automatic Updates
-- ============================================

-- Create triggers for updated_at
CREATE TRIGGER update_followup_campaigns_updated_at
  BEFORE UPDATE ON followup_campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_followup_rules_updated_at
  BEFORE UPDATE ON followup_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_followups_updated_at
  BEFORE UPDATE ON followups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_email_templates_updated_at
  BEFORE UPDATE ON email_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sms_templates_updated_at
  BEFORE UPDATE ON sms_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- INITIAL DATA - Sample Templates and Campaigns
-- ============================================

-- Insert default email templates
INSERT INTO email_templates (name, description, subject, content, template_type, variables, created_by) VALUES
('welcome_new_lead', 'Welcome email for new leads', 'Welcome to Cadillac of South Charlotte - {{first_name}}!',
'Dear {{first_name}},

Thank you for your interest in Cadillac vehicles! We''re excited to help you find the perfect Cadillac for your needs.

Our team of expert sales representatives is here to assist you with:
- Vehicle selection and customization
- Test drive scheduling
- Financing options and incentives
- Trade-in evaluation

Please don''t hesitate to reach out if you have any questions. We look forward to working with you!

Best regards,
The Cadillac of South Charlotte Team
{{company_name}}

Contact us: (704) 555-0123
www.cadillacofsouthcharlotte.com',
'welcome',
'["first_name", "last_name", "email", "phone", "vehicle_interest", "company_name"]',
'system'),

('follow_up_general', 'General follow-up email', 'Following up on your Cadillac inquiry - {{first_name}}',
'Hi {{first_name}},

I wanted to follow up on your recent interest in Cadillac vehicles. We have several {{vehicle_interest}} models in stock that might interest you.

Would you like to schedule a test drive or discuss financing options?

Best regards,
{{sales_rep_name}}
Cadillac of South Charlotte
{{company_name}}',
'follow_up',
'["first_name", "last_name", "vehicle_interest", "sales_rep_name", "company_name"]',
'system'),

('appointment_reminder', 'Appointment reminder email', 'Reminder: Your Cadillac appointment tomorrow - {{first_name}}',
'Dear {{first_name}},

This is a friendly reminder about your upcoming appointment with Cadillac of South Charlotte.

Appointment Details:
- Date & Time: {{appointment_date}}
- Type: {{appointment_type}}
- Sales Representative: {{sales_rep_name}}

We''re looking forward to seeing you! If you need to reschedule or have any questions, please call us at (704) 555-0123.

Best regards,
The Cadillac of South Charlotte Team
{{company_name}}',
'reminder',
'["first_name", "last_name", "appointment_date", "appointment_type", "sales_rep_name", "company_name"]',
'system')
ON CONFLICT (name) DO NOTHING;

-- Insert default SMS templates
INSERT INTO sms_templates (name, description, content, template_type, variables, created_by) VALUES
('welcome_sms', 'Welcome SMS for new leads', 'Welcome to Cadillac of South Charlotte, {{first_name}}! Thanks for your interest. We''ll be in touch soon to help find your perfect Cadillac.',
'welcome',
'["first_name"]',
'system'),

('follow_up_sms', 'General follow-up SMS', 'Hi {{first_name}}, following up on your Cadillac interest. Ready to schedule a test drive? Reply YES or call (704) 555-0123.',
'follow_up',
'["first_name"]',
'system'),

('appointment_reminder_sms', 'Appointment reminder SMS', 'Reminder: Your Cadillac appointment is {{appointment_date}}. See you then! Call (704) 555-0123 if you need to reschedule.',
'reminder',
'["appointment_date"]',
'system')
ON CONFLICT (name) DO NOTHING;

-- Insert default followup campaign
INSERT INTO followup_campaigns (name, description, campaign_type, target_audience, is_active, created_by) VALUES
('New Lead Nurture', 'Automated nurturing campaign for new leads', 'nurture', 'leads', true, 'system')
ON CONFLICT DO NOTHING;

-- Insert default followup rules
INSERT INTO followup_rules (
  name, description, trigger_event, conditions, actions, priority, delay_hours, is_active, created_by
) VALUES
('Welcome Email - New Lead', 'Send welcome email 1 hour after lead creation', 'lead_created',
 '{}',
 '[{"type": "schedule_followup", "email": true, "email_template": "welcome_new_lead", "delay": "1 hour", "priority": 1}]',
 10, 1, true, 'system'),

('Follow-up SMS - New Lead', 'Send follow-up SMS 24 hours after lead creation', 'lead_created',
 '{}',
 '[{"type": "schedule_followup", "sms": true, "sms_template": "follow_up_sms", "delay": "24 hours", "priority": 2}]',
 9, 24, true, 'system'),

('Appointment Reminder Email', 'Send email reminder 24 hours before appointment', 'appointment_scheduled',
 '{"appointment_type": "test_drive"}',
 '[{"type": "schedule_followup", "email": true, "email_template": "appointment_reminder", "delay": "-24 hours", "priority": 5}]',
 8, -24, true, 'system'),

('Appointment Reminder SMS', 'Send SMS reminder 2 hours before appointment', 'appointment_scheduled',
 '{"appointment_type": "test_drive"}',
 '[{"type": "schedule_followup", "sms": true, "sms_template": "appointment_reminder_sms", "delay": "-2 hours", "priority": 5}]',
 8, -2, true, 'system')
ON CONFLICT DO NOTHING;