#!/usr/bin/env node

/**
 * Setup Test Database
 * Creates a mock database environment for local testing
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

async function setupTestDatabase() {
  console.log('🚀 Setting up test database environment...');

  try {
    // Create test data directory
    const testDataDir = path.join(__dirname, '../test-data');
    if (!fs.existsSync(testDataDir)) {
      fs.mkdirSync(testDataDir, { recursive: true });
    }

    // Mock database for testing
    const mockDatabase = {
      sales_reps: [
        {
          id: '1',
          first_name: 'Edward',
          last_name: 'Johnson',
          email: 'ed@caddyed.com',
          phone: '(704) 555-0123',
          role: 'sales_manager',
          status: 'active',
          created_at: new Date().toISOString()
        },
        {
          id: '2', 
          first_name: 'Sarah',
          last_name: 'Williams',
          email: 'sarah@caddyed.com',
          phone: '(704) 555-0124',
          role: 'sales_representative',
          status: 'active',
          created_at: new Date().toISOString()
        }
      ],
      leads: [
        {
          id: '1',
          first_name: 'John',
          last_name: 'Smith',
          email: 'john.smith@email.com',
          phone: '(704) 555-9876',
          status: 'new',
          source: 'website',
          created_at: new Date().toISOString()
        },
        {
          id: '2',
          first_name: 'Emily',
          last_name: 'Davis',
          email: 'emily.davis@email.com', 
          phone: '(704) 555-5432',
          status: 'contacted',
          source: 'referral',
          created_at: new Date().toISOString()
        }
      ],
      followup_campaigns: [
        {
          id: '1',
          name: 'Welcome Series',
          description: 'Automated welcome emails for new leads',
          campaign_type: 'welcome',
          is_active: true,
          created_at: new Date().toISOString()
        },
        {
          id: '2',
          name: 'Test Drive Follow-up',
          description: 'Reminders after test drive appointments',
          campaign_type: 'nurture',
          is_active: true,
          created_at: new Date().toISOString()
        }
      ],
      followup_rules: [
        {
          id: '1',
          campaign_id: '1',
          name: 'New Lead Welcome',
          conditions: {
            lead_status: 'new',
            time_since_creation: '1 hour'
          },
          actions: {
            send_email: 'welcome-template',
            wait: '24 hours'
          },
          created_at: new Date().toISOString()
        }
      ],
      email_templates: [
        {
          id: '1',
          name: 'Welcome Template',
          subject: 'Welcome to Caddy Ed Cadillac!',
          content: 'Hello {{first_name}}, thank you for your interest in Cadillac.',
          template_type: 'welcome',
          created_at: new Date().toISOString()
        }
      ]
    };

    // Save mock database to file
    fs.writeFileSync(
      path.join(testDataDir, 'mock-database.json'),
      JSON.stringify(mockDatabase, null, 2)
    );

    console.log('✅ Test database setup complete!');
    console.log('📁 Mock data saved to:', testDataDir);
    console.log('');
    console.log('📊 Created mock data:');
    console.log(`  - Sales Reps: ${mockDatabase.sales_reps.length}`);
    console.log(`  - Leads: ${mockDatabase.leads.length}`);
    console.log(`  - Campaigns: ${mockDatabase.followup_campaigns.length}`);
    console.log(`  - Rules: ${mockDatabase.followup_rules.length}`);
    console.log(`  - Email Templates: ${mockDatabase.email_templates.length}`);
    console.log('');
    console.log('🎯 You can now test the follow-up system with this mock data!');

    return true;

  } catch (error) {
    console.error('❌ Failed to setup test database:', error.message);
    return false;
  }
}

// Run the setup
setupTestDatabase().then(success => {
  process.exit(success ? 0 : 1);
});
