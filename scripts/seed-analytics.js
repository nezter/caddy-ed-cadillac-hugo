#!/usr/bin/env node

/**
 * Seed Analytics Data
 * Populates the database with sample sales performance and analytics data
 */

require('dotenv').config();

const DatabaseService = require('../netlify/functions/utils/database-service');

async function seedAnalyticsData() {
  console.log('📊 Seeding analytics and performance data...');

  // First, get all sales reps to associate data with them
  const salesReps = await DatabaseService.getAllSalesReps();
  if (salesReps.length === 0) {
    console.log('⚠️  No sales reps found. Please run seed-sales-reps.js first.');
    return;
  }

  console.log(`Found ${salesReps.length} sales reps for analytics data`);

  // Create sample sales performance data for the past 6 months
  const now = new Date();
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);

  // Generate monthly performance data for each rep
  for (const rep of salesReps) {
    console.log(`📈 Generating analytics data for ${rep.first_name} ${rep.last_name}...`);

    for (let i = 0; i < 6; i++) {
      const monthDate = new Date(sixMonthsAgo.getFullYear(), sixMonthsAgo.getMonth() + i, 1);

      // Generate realistic performance metrics
      const baseLeads = Math.floor(Math.random() * 20) + 10; // 10-30 leads per month
      const conversionRate = 0.15 + Math.random() * 0.25; // 15-40% conversion rate
      const convertedLeads = Math.floor(baseLeads * conversionRate);
      const avgDealSize = 45000 + Math.random() * 30000; // $45k-$75k average deal
      const totalSales = convertedLeads * avgDealSize;

      // Insert performance metrics (this would typically go into a performance_metrics table)
      // For now, we'll create sample interactions and appointments to demonstrate the data

      // Create sample leads for this rep in this month
      for (let j = 0; j < baseLeads; j++) {
        const leadDate = new Date(monthDate.getTime() + Math.random() * 30 * 24 * 60 * 60 * 1000); // Random day in month

        try {
          const leadData = {
            first_name: ['John', 'Jane', 'Michael', 'Sarah', 'David', 'Lisa', 'Robert', 'Maria'][Math.floor(Math.random() * 8)],
            last_name: ['Smith', 'Johnson', 'Brown', 'Williams', 'Jones', 'Garcia', 'Miller', 'Davis'][Math.floor(Math.random() * 8)],
            email: `lead${j + i * 100}@example.com`,
            phone: `(704) 555-${String(Math.floor(Math.random() * 9000) + 1000).padStart(4, '0')}`,
            message: 'Interested in learning more about Cadillac vehicles',
            form_type: 'general',
            lead_source: ['website', 'phone', 'email', 'event', 'referral'][Math.floor(Math.random() * 5)],
            vehicle_interest: ['XT5', 'Escalade', 'LYRIQ', 'CT5'][Math.floor(Math.random() * 4)],
            assigned_sales_rep_id: rep.id,
            priority: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)],
            utm_source: ['google', 'facebook', 'email', 'direct'][Math.floor(Math.random() * 4)],
            utm_medium: ['cpc', 'organic', 'social', 'referral'][Math.floor(Math.random() * 4)]
          };

          const lead = await DatabaseService.createLead(leadData);

          // Create some interactions for this lead
          const interactionCount = Math.floor(Math.random() * 3) + 1; // 1-3 interactions per lead
          for (let k = 0; k < interactionCount; k++) {
            const interactionDate = new Date(leadDate.getTime() + k * 2 * 24 * 60 * 60 * 1000); // Spread over days

            const interactionData = {
              customer_id: null, // No customer yet for leads
              lead_id: lead.id,
              interaction_type: ['phone_call', 'email', 'sms', 'in_person'][Math.floor(Math.random() * 4)],
              direction: ['inbound', 'outbound'][Math.floor(Math.random() * 2)],
              subject: ['Initial inquiry', 'Follow-up call', 'Price discussion', 'Test drive scheduling'][Math.floor(Math.random() * 4)],
              content: 'Discussion about vehicle features and pricing options.',
              sales_rep_id: rep.id,
              sales_rep_name: `${rep.first_name} ${rep.last_name}`,
              contact_method: ['phone', 'email', 'sms'][Math.floor(Math.random() * 3)],
              outcome: ['interested', 'follow_up_needed', 'appointment_set', 'not_interested'][Math.floor(Math.random() * 4)],
              next_action: 'Schedule follow-up call',
              next_action_date: new Date(interactionDate.getTime() + 3 * 24 * 60 * 60 * 1000),
              date: interactionDate.toISOString()
            };

            await DatabaseService.createInteraction(interactionData);
          }

          // Convert some leads to customers (simulate sales)
          if (Math.random() < conversionRate) {
            const customerData = {
              first_name: lead.first_name,
              last_name: lead.last_name,
              email: lead.email,
              phone: lead.phone,
              customer_type: 'active',
              source: lead.lead_source,
              assigned_sales_rep_id: rep.id,
              vehicle_interest: lead.vehicle_interest,
              preferred_contact_method: 'email',
              email_consent: true,
              sms_consent: Math.random() > 0.5,
              phone_consent: Math.random() > 0.5
            };

            const customer = await DatabaseService.createCustomer(customerData);

            // Update the lead to mark it as converted
            await DatabaseService.query(
              'UPDATE leads SET customer_id = $1, status = $2, converted_to_customer = $3, conversion_date = $4 WHERE id = $5',
              [customer.id, 'converted', true, leadDate, lead.id]
            );

            // Create a sale appointment
            const appointmentData = {
              customer_id: customer.id,
              lead_id: lead.id,
              appointment_type: 'sales_consultation',
              title: 'Vehicle Purchase Consultation',
              description: 'Final consultation and vehicle delivery',
              scheduled_start: new Date(leadDate.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
              scheduled_end: new Date(leadDate.getTime() + 7 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000).toISOString(),
              assigned_sales_rep_id: rep.id,
              assigned_sales_rep_name: `${rep.first_name} ${rep.last_name}`,
              vehicle_of_interest: lead.vehicle_interest,
              location: 'Cadillac of South Charlotte - Sales Department',
              status: 'completed',
              outcome: `Sold ${lead.vehicle_interest} for $${Math.floor(avgDealSize).toLocaleString()}`
            };

            await DatabaseService.createAppointment(appointmentData);
          }

        } catch (error) {
          console.error(`❌ Error creating lead data for ${rep.email}:`, error.message);
        }
      }
    }
  }

  // Create some additional sample tasks to demonstrate task management
  console.log('📋 Creating sample tasks...');
  for (const rep of salesReps) {
    const sampleTasks = [
      {
        title: 'Follow up with high-priority lead',
        description: 'Contact lead interested in XT5 Premium Luxury',
        task_type: 'follow_up',
        assigned_to: rep.id,
        priority: 'high',
        due_date: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'pending'
      },
      {
        title: 'Schedule test drive for Escalade inquiry',
        description: 'Coordinate test drive appointment for interested customer',
        task_type: 'appointment',
        assigned_to: rep.id,
        priority: 'medium',
        due_date: new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'pending'
      },
      {
        title: 'Prepare financing options presentation',
        description: 'Research and prepare financing options for customer consultation',
        task_type: 'research',
        assigned_to: rep.id,
        priority: 'medium',
        due_date: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'in_progress'
      }
    ];

    for (const taskData of sampleTasks) {
      try {
        await DatabaseService.query(`
          INSERT INTO tasks (
            title, description, task_type, assigned_to, priority, due_date, status, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          taskData.title,
          taskData.description,
          taskData.task_type,
          taskData.assigned_to,
          taskData.priority,
          taskData.due_date,
          taskData.status,
          'system'
        ]);
      } catch (error) {
        console.error(`❌ Error creating task:`, error.message);
      }
    }
  }

  console.log('🎉 Analytics and performance data seeding completed!');
  console.log('📊 Generated sample data includes:');
  console.log('   - Historical leads and conversions');
  console.log('   - Customer interactions and appointments');
  console.log('   - Sales performance metrics');
  console.log('   - Task management examples');
}

// Run the seeder
if (require.main === module) {
  seedAnalyticsData().catch(console.error);
}

module.exports = seedAnalyticsData;