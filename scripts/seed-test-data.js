#!/usr/bin/env node

/**
 * Seed Test Data
 * Populates Supabase with representative customers, leads, and appointments
 */

require('dotenv').config();

const DatabaseService = require('../netlify/functions/utils/database-service');
const seedSalesReps = require('./seed-sales-reps');

async function ensureSalesReps() {
  await seedSalesReps();
  const reps = await DatabaseService.getAllSalesReps();
  const byEmail = new Map(
    reps.map((rep) => [rep.email.toLowerCase(), rep])
  );
  if (reps.length === 0) {
    throw new Error('No sales reps available after seeding. Check database connectivity.');
  }
  return { reps, byEmail };
}

async function ensureCustomer(definition, repLookup) {
  const emailKey = definition.email.toLowerCase();
  const existing = await DatabaseService.query(
    'SELECT id FROM customers WHERE LOWER(email) = $1 LIMIT 1',
    [emailKey]
  );

  if (existing.rows.length > 0) {
    console.log(`⚠️  Customer ${definition.email} already exists, skipping.`);
    return existing.rows[0].id;
  }

  const assignedRep = repLookup.byEmail.get(
    (definition.assignedRepEmail || '').toLowerCase()
  ) || repLookup.reps[0];

  const created = await DatabaseService.createCustomer({
    first_name: definition.firstName,
    last_name: definition.lastName,
    email: definition.email,
    phone: definition.phone,
    address_line1: definition.addressLine1,
    city: definition.city,
    state: definition.state,
    zip_code: definition.zipCode,
    customer_type: definition.customerType,
    source: definition.source,
    assigned_sales_rep_id: assignedRep?.id || null,
    vehicle_interest: definition.vehicleInterest,
    preferred_contact_method: definition.preferredContactMethod,
    email_consent: definition.emailConsent,
    sms_consent: definition.smsConsent,
    phone_consent: definition.phoneConsent
  });

  console.log(`✅ Created customer ${created.first_name} ${created.last_name}`);
  return created.id;
}

async function ensureLead(definition, repLookup, customerLookup) {
  const emailKey = definition.email.toLowerCase();
  const existing = await DatabaseService.query(
    'SELECT id FROM leads WHERE LOWER(email) = $1 LIMIT 1',
    [emailKey]
  );

  if (existing.rows.length > 0) {
    console.log(`⚠️  Lead ${definition.email} already exists, skipping.`);
    return existing.rows[0].id;
  }

  const assignedRep = repLookup.byEmail.get(
    (definition.assignedRepEmail || '').toLowerCase()
  ) || repLookup.reps[0];

  let customerId = null;
  if (definition.customerEmail) {
    const lookupKey = definition.customerEmail.toLowerCase();
    customerId = customerLookup.get(lookupKey) || null;
  }

  const created = await DatabaseService.createLead({
    customer_id: customerId,
    first_name: definition.firstName,
    last_name: definition.lastName,
    email: definition.email,
    phone: definition.phone,
    message: definition.message,
    form_type: definition.formType,
    lead_source: definition.leadSource,
    vehicle_interest: definition.vehicleInterest,
    vehicle_year: definition.vehicleYear,
    vehicle_make: definition.vehicleMake,
    vehicle_model: definition.vehicleModel,
    assigned_sales_rep_id: assignedRep?.id || null,
    priority: definition.priority,
    utm_source: definition.utmSource,
    utm_medium: definition.utmMedium,
    utm_campaign: definition.utmCampaign
  });

  console.log(`✅ Created lead ${created.first_name} ${created.last_name}`);
  return created.id;
}

async function ensureAppointment(definition, repLookup, customerLookup, leadLookup) {
  const existing = await DatabaseService.query(
    'SELECT id FROM appointments WHERE title = $1 AND scheduled_start = $2 LIMIT 1',
    [definition.title, definition.scheduledStart]
  );

  if (existing.rows.length > 0) {
    console.log(`⚠️  Appointment "${definition.title}" already exists, skipping.`);
    return existing.rows[0].id;
  }

  const assignedRep = repLookup.byEmail.get(
    (definition.assignedRepEmail || '').toLowerCase()
  ) || repLookup.reps[0];

  const customerId = definition.customerEmail
    ? customerLookup.get(definition.customerEmail.toLowerCase()) || null
    : null;

  const leadId = definition.leadEmail
    ? leadLookup.get(definition.leadEmail.toLowerCase()) || null
    : null;

  const created = await DatabaseService.createAppointment({
    customer_id: customerId,
    lead_id: leadId,
    appointment_type: definition.appointmentType,
    title: definition.title,
    description: definition.description,
    scheduled_start: definition.scheduledStart,
    scheduled_end: definition.scheduledEnd,
    assigned_sales_rep_id: assignedRep?.id || null,
    assigned_sales_rep_name: assignedRep
      ? `${assignedRep.first_name} ${assignedRep.last_name}`
      : null,
    vehicle_of_interest: definition.vehicleOfInterest,
    location: definition.location
  });

  console.log(`✅ Created appointment ${created.title}`);
  return created.id;
}

async function ensureInteraction(definition, repLookup, customerLookup, leadLookup) {
  const assignedRep = repLookup.byEmail.get(
    (definition.assignedRepEmail || '').toLowerCase()
  ) || repLookup.reps[0];

  const customerId = definition.customerEmail
    ? customerLookup.get(definition.customerEmail.toLowerCase()) || null
    : null;

  const leadId = definition.leadEmail
    ? leadLookup.get(definition.leadEmail.toLowerCase()) || null
    : definition.leadId || null;

  const existing = await DatabaseService.query(
    `SELECT id FROM interactions WHERE interaction_type = $1 AND subject = $2
      AND (($3 IS NULL AND lead_id IS NULL) OR lead_id = $3)
      AND created_at::date = $4::date LIMIT 1`,
    [definition.interactionType, definition.subject, leadId, definition.date]
  );

  if (existing.rows.length > 0) {
    console.log(`⚠️  Interaction for ${definition.interactionType} already exists, skipping.`);
    return existing.rows[0].id;
  }

  const created = await DatabaseService.createInteraction({
    customer_id: customerId,
    lead_id: leadId,
    interaction_type: definition.interactionType,
    direction: definition.direction,
    subject: definition.subject,
    content: definition.content,
    sales_rep_id: assignedRep?.id || null,
    sales_rep_name: assignedRep
      ? `${assignedRep.first_name} ${assignedRep.last_name}`
      : null,
    contact_method: definition.contactMethod,
    outcome: definition.outcome,
    next_action: definition.nextAction,
    next_action_date: definition.nextActionDate
  });

  console.log(`✅ Logged interaction ${created.interaction_type}`);
  return created.id;
}

async function main() {
  console.log('🌱 Seeding test data...');

  const repLookup = await ensureSalesReps();
  const customerLookup = new Map();
  const leadLookup = new Map();

  const customers = [
    {
      firstName: 'Emily',
      lastName: 'Clark',
      email: 'emily.clark@example.com',
      phone: '(704) 555-0111',
      addressLine1: '7425 Fairview Rd',
      city: 'Charlotte',
      state: 'NC',
      zipCode: '28226',
      customerType: 'active',
      source: 'website',
      assignedRepEmail: 'sarah.johnson@cadillacofsouthcharlotte.com',
      vehicleInterest: '2024 Cadillac XT5 Premium Luxury',
      preferredContactMethod: 'email',
      emailConsent: true,
      smsConsent: true,
      phoneConsent: false
    },
    {
      firstName: 'Michael',
      lastName: 'Thompson',
      email: 'michael.thompson@example.com',
      phone: '(704) 555-0122',
      addressLine1: '1120 Pine Ridge Dr',
      city: 'Fort Mill',
      state: 'SC',
      zipCode: '29708',
      customerType: 'prospect',
      source: 'phone',
      assignedRepEmail: 'john.smith@cadillacofsouthcharlotte.com',
      vehicleInterest: '2023 Cadillac Escalade Sport',
      preferredContactMethod: 'phone',
      emailConsent: true,
      smsConsent: false,
      phoneConsent: true
    },
    {
      firstName: 'Avery',
      lastName: 'Nguyen',
      email: 'avery.nguyen@example.com',
      phone: '(980) 555-0133',
      addressLine1: '980 Trade St',
      city: 'Charlotte',
      state: 'NC',
      zipCode: '28202',
      customerType: 'lead',
      source: 'event',
      assignedRepEmail: 'mike.davis@cadillacofsouthcharlotte.com',
      vehicleInterest: '2024 Cadillac LYRIQ AWD',
      preferredContactMethod: 'sms',
      emailConsent: true,
      smsConsent: true,
      phoneConsent: false
    }
  ];

  for (const customer of customers) {
    const customerId = await ensureCustomer(customer, repLookup);
    customerLookup.set(customer.email.toLowerCase(), customerId);
  }

  const leads = [
    {
      firstName: 'Olivia',
      lastName: 'Bennett',
      email: 'olivia.bennett@example.com',
      phone: '(704) 555-0222',
      message: 'Interested in scheduling a weekend test drive.',
      formType: 'test_drive',
      leadSource: 'website',
      vehicleInterest: '2024 Cadillac XT5 Premium Luxury',
      vehicleYear: 2024,
      vehicleMake: 'Cadillac',
      vehicleModel: 'XT5',
      priority: 'high',
      assignedRepEmail: 'sarah.johnson@cadillacofsouthcharlotte.com',
      customerEmail: 'emily.clark@example.com'
    },
    {
      firstName: 'Noah',
      lastName: 'Ramirez',
      email: 'noah.ramirez@example.com',
      phone: '(704) 555-0333',
      message: 'Looking for a luxury SUV with captain chairs.',
      formType: 'general',
      leadSource: 'social_media',
      vehicleInterest: '2023 Cadillac Escalade Sport',
      vehicleYear: 2023,
      vehicleMake: 'Cadillac',
      vehicleModel: 'Escalade',
      priority: 'medium',
      assignedRepEmail: 'john.smith@cadillacofsouthcharlotte.com',
      customerEmail: 'michael.thompson@example.com'
    },
    {
      firstName: 'Harper',
      lastName: 'Singh',
      email: 'harper.singh@example.com',
      phone: '(980) 555-0444',
      message: 'Curious about availability for LYRIQ AWD trims.',
      formType: 'general',
      leadSource: 'event',
      vehicleInterest: '2024 Cadillac LYRIQ AWD',
      vehicleYear: 2024,
      vehicleMake: 'Cadillac',
      vehicleModel: 'LYRIQ',
      priority: 'high',
      assignedRepEmail: 'mike.davis@cadillacofsouthcharlotte.com',
      customerEmail: 'avery.nguyen@example.com'
    }
  ];

  for (const lead of leads) {
    const leadId = await ensureLead(lead, repLookup, customerLookup);
    leadLookup.set(lead.email.toLowerCase(), leadId);
  }

  const now = new Date();
  const appointments = [
    {
      title: 'Test Drive - XT5 Premium Luxury',
      appointmentType: 'test_drive',
      description: 'Weekend test drive for XT5 with technology package walkthrough.',
      scheduledStart: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2, 10, 30).toISOString(),
      scheduledEnd: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2, 11, 30).toISOString(),
      assignedRepEmail: 'sarah.johnson@cadillacofsouthcharlotte.com',
      vehicleOfInterest: '2024 Cadillac XT5 Premium Luxury',
      customerEmail: 'emily.clark@example.com',
      leadEmail: 'olivia.bennett@example.com',
      location: 'Cadillac of South Charlotte - Test Drive Center'
    },
    {
      title: 'Escalade Feature Consultation',
      appointmentType: 'sales_consultation',
      description: 'In-person consultation covering Escalade trims and financing.',
      scheduledStart: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3, 15, 0).toISOString(),
      scheduledEnd: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3, 16, 0).toISOString(),
      assignedRepEmail: 'john.smith@cadillacofsouthcharlotte.com',
      vehicleOfInterest: '2023 Cadillac Escalade Sport',
      customerEmail: 'michael.thompson@example.com',
      leadEmail: 'noah.ramirez@example.com',
      location: 'Cadillac of South Charlotte - Delivery Bay'
    }
  ];

  for (const appointment of appointments) {
    await ensureAppointment(appointment, repLookup, customerLookup, leadLookup);
  }

  const interactions = [
    {
      interactionType: 'phone_call',
      direction: 'outbound',
      subject: 'Pre-test drive confirmation',
      content: 'Confirmed availability and discussed preferred color options prior to test drive.',
      contactMethod: 'phone',
      outcome: 'appointment_confirmed',
      nextAction: 'Prepare XT5 for Saturday slot',
      nextActionDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0).toISOString(),
      assignedRepEmail: 'sarah.johnson@cadillacofsouthcharlotte.com',
      customerEmail: 'emily.clark@example.com',
      leadEmail: 'olivia.bennett@example.com',
      date: new Date().toISOString()
    },
    {
      interactionType: 'email',
      direction: 'outbound',
      subject: 'Financing options follow-up',
      content: 'Shared tailored financing scenarios and trade-in estimate links.',
      contactMethod: 'email',
      outcome: 'interested',
      nextAction: 'Schedule finance application review',
      nextActionDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 4, 10, 0).toISOString(),
      assignedRepEmail: 'john.smith@cadillacofsouthcharlotte.com',
      customerEmail: 'michael.thompson@example.com',
      leadEmail: 'noah.ramirez@example.com',
      date: new Date().toISOString()
    }
  ];

  for (const interaction of interactions) {
    await ensureInteraction(interaction, repLookup, customerLookup, leadLookup);
  }

  console.log('\n🎉 Test data seeding completed successfully!');
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Test data seeding failed:', error);
    process.exit(1);
  });
