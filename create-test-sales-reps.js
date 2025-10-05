/**
 * Create Test Sales Representatives
 * Inserts test sales rep data for development and testing
 */

require('dotenv').config();

async function createTestSalesReps() {
  console.log('👥 Creating test sales representatives...');

  try {
    const { createClient } = require('@supabase/supabase-js');

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Test data for sales representatives
    const testSalesReps = [
      {
        first_name: 'John',
        last_name: 'Smith',
        email: 'john.smith@cadillacofsouthcharlotte.com',
        phone: '(704) 555-0101',
        role: 'sales_representative',
        status: 'active',
        permissions: ['view_customers', 'manage_leads', 'create_appointments']
      },
      {
        first_name: 'Sarah',
        last_name: 'Johnson',
        email: 'sarah.johnson@cadillacofsouthcharlotte.com',
        phone: '(704) 555-0102',
        role: 'sales_representative',
        status: 'active',
        permissions: ['view_customers', 'manage_leads', 'create_appointments']
      },
      {
        first_name: 'Mike',
        last_name: 'Davis',
        email: 'mike.davis@cadillacofsouthcharlotte.com',
        phone: '(704) 555-0103',
        role: 'sales_manager',
        status: 'active',
        permissions: ['view_customers', 'manage_leads', 'create_appointments', 'manage_team', 'view_reports']
      },
      {
        first_name: 'Lisa',
        last_name: 'Brown',
        email: 'lisa.brown@cadillacofsouthcharlotte.com',
        phone: '(704) 555-0104',
        role: 'sales_representative',
        status: 'active',
        permissions: ['view_customers', 'manage_leads', 'create_appointments']
      }
    ];

    console.log('📝 Inserting test sales representatives...');

    for (const rep of testSalesReps) {
      try {
        const { data, error } = await supabase
          .from('sales_reps')
          .upsert(rep, { onConflict: 'email' })
          .select();

        if (error) {
          console.error(`❌ Failed to create ${rep.first_name} ${rep.last_name}:`, error.message);
        } else {
          console.log(`✅ Created/Updated: ${rep.first_name} ${rep.last_name} (${rep.email})`);
        }
      } catch (error) {
        console.error(`❌ Error creating ${rep.first_name} ${rep.last_name}:`, error.message);
      }
    }

    // Verify the data was inserted
    console.log('\n🔍 Verifying sales reps were created...');
    const { data: salesReps, error: fetchError } = await supabase
      .from('sales_reps')
      .select('id, first_name, last_name, email, role')
      .order('created_at', { ascending: false })
      .limit(10);

    if (fetchError) {
      console.error('❌ Failed to fetch sales reps:', fetchError.message);
    } else {
      console.log(`✅ Found ${salesReps.length} sales representatives:`);
      salesReps.forEach(rep => {
        console.log(`   - ${rep.first_name} ${rep.last_name} (${rep.email}) - ${rep.role}`);
      });
    }

    console.log('\n🎉 Test sales representatives setup complete!');

  } catch (error) {
    console.error('❌ Failed to create test sales reps:', error.message);
    console.log('\n📋 Make sure tables are created first by following SUPABASE_TABLE_CREATION_GUIDE.md');
  }
}

// Run if called directly
if (require.main === module) {
  createTestSalesReps();
}

module.exports = { createTestSalesReps };