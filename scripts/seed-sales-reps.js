/**
 * Seed Sales Representatives
 * Creates initial sales rep accounts for testing
 */

const bcrypt = require('bcryptjs');
const DatabaseService = require('../netlify/functions/utils/database-service');

async function seedSalesReps() {
  console.log('🌱 Seeding sales representatives...');

  const salesReps = [
    {
      first_name: 'John',
      last_name: 'Smith',
      email: 'john.smith@cadillacofsouthcharlotte.com',
      phone: '(704) 555-0101',
      role: 'sales_manager',
      password: 'password123',
      permissions: ['view_customers', 'manage_leads', 'manage_sales_reps', 'view_reports']
    },
    {
      first_name: 'Sarah',
      last_name: 'Johnson',
      email: 'sarah.johnson@cadillacofsouthcharlotte.com',
      phone: '(704) 555-0102',
      role: 'sales_representative',
      password: 'password123',
      permissions: ['view_customers', 'manage_leads']
    },
    {
      first_name: 'Mike',
      last_name: 'Davis',
      email: 'mike.davis@cadillacofsouthcharlotte.com',
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