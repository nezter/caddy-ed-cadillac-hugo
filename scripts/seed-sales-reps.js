/**
 * Seed Sales Representatives
 * Creates initial sales rep accounts for testing
 *
 * GUARDED, AND THIS ONE MATTERS MOST.
 *
 * `sales_reps` is not an inert table. `utils/inquiry.js` `resolveRecipient()`
 * reads the first active rep with an admin or sales role and uses that address
 * as the notification recipient for every customer enquiry on the site.
 *
 * So a row added here is not just a test fixture -- it decides where a real
 * customer's name, email and phone number is emailed. Seeding this table while
 * the site is live repoints the entire enquiry path at whatever address the seed
 * invented.
 *
 * Which is exactly what happened on 2026-09-30: this script created
 * john.smith@example.com, a domain this business does not own.
 * The same domain was hardcoded as a fallback in leads.js and was deleted that
 * day as a customer-data leak waiting to happen -- and this script would have
 * put it back through the database instead of the code.
 */

const bcrypt = require('bcryptjs');
const DatabaseService = require('../netlify/functions/utils/database-service');
const { requireSeedAcknowledgement } = require('./require-seed-acknowledgement');

requireSeedAcknowledgement({
  what: 'sales representative accounts, which decide where customer enquiries are emailed',
  undo: "DELETE FROM sales_reps WHERE email LIKE '%@example.com';",
});

async function seedSalesReps() {
  console.log('🌱 Seeding sales representatives...');

  const salesReps = [
    {
      first_name: 'John',
      last_name: 'Smith',
      email: 'john.smith@example.com',
      phone: '(704) 555-0101',
      role: 'sales_manager',
      password: 'password123',
      permissions: ['view_customers', 'manage_leads', 'manage_sales_reps', 'view_reports']
    },
    {
      first_name: 'Sarah',
      last_name: 'Johnson',
      email: 'sarah.johnson@example.com',
      phone: '(704) 555-0102',
      role: 'sales_representative',
      password: 'password123',
      permissions: ['view_customers', 'manage_leads']
    },
    {
      first_name: 'Mike',
      last_name: 'Davis',
      email: 'mike.davis@example.com',
      phone: '(704) 555-0103',
      role: 'sales_representative',
      password: 'password123',
      permissions: ['view_customers', 'manage_leads']
    },
    {
      first_name: 'Test',
      last_name: 'User',
      email: 'test@example.com',
      phone: '(704) 555-0199',
      role: 'sales_representative',
      password: 'password123',
      permissions: ['view_customers', 'manage_leads']
    }
  ];

  for (const rep of salesReps) {
    try {
      // Hash the password
      const password_hash = await bcrypt.hash(rep.password, 12);

      // Check if user already exists
      const existingUser = await DatabaseService.getSalesRepByEmail(rep.email);
      if (existingUser) {
        console.log(`⚠️  Sales rep ${rep.email} already exists, skipping...`);
        continue;
      }

      // Create the sales rep
      const newRep = await DatabaseService.createSalesRep({
        first_name: rep.first_name,
        last_name: rep.last_name,
        email: rep.email,
        phone: rep.phone,
        role: rep.role,
        password_hash: password_hash,
        permissions: rep.permissions
      });

      console.log(`✅ Created sales rep: ${newRep.first_name} ${newRep.last_name} (${newRep.email})`);

    } catch (error) {
      console.error(`❌ Failed to create sales rep ${rep.email}:`, error.message);
    }
  }

  console.log('🎉 Sales rep seeding completed!');
}

// Run the seeder
if (require.main === module) {
  seedSalesReps().catch(console.error);
}

module.exports = seedSalesReps;