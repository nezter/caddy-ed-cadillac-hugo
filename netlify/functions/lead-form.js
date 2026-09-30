const inquiry = require('./utils/inquiry');
const errorHandler = require('./utils/error-handler');

const MIN_FILL_MS = 2000; // same threshold as the front-end timing gate

exports.handler = async function(event, context) {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return errorHandler.forbiddenError('Method not allowed');
  }

  // Parse the JSON body
  let data;
  try {
    data = JSON.parse(event.body);
  } catch (error) {
    return errorHandler.validationError('Invalid JSON in request body');
  }

  // Honeypot check: a field bots usually fill but humans never see
  if (data.website && String(data.website).trim() !== '') {
    return errorHandler.validationError('Submission rejected');
  }

  // Validate required fields and build field-level errors
  const { name, email, phone, message, formType } = data;
  const fieldErrors = {};

  if (!name || String(name).trim() === '') {
    fieldErrors.name = 'Name is required';
  }

  if (!email || String(email).trim() === '') {
    fieldErrors.email = 'Email is required';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fieldErrors.email = 'Please provide a valid email address';
  }

  if (!phone || String(phone).trim() === '') {
    fieldErrors.phone = 'Phone is required';
  } else {
    const digits = String(phone).replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15) {
      fieldErrors.phone = 'Please provide a valid phone number';
    }
  }

  // Simple timing gate: reject forms completed implausibly fast
  const startedAt = data.startedAt ? new Date(data.startedAt).getTime() : null;
  const submittedAt = data.submittedAt ? new Date(data.submittedAt).getTime() : null;
  const elapsed = startedAt && submittedAt ? submittedAt - startedAt : null;
  if (elapsed !== null && elapsed < MIN_FILL_MS) {
    return errorHandler.validationError('Submission rejected');
  }

  if (Object.keys(fieldErrors).length > 0) {
    return errorHandler.validationError('Please check the highlighted fields', fieldErrors);
  }

  try {
    // RECORD FIRST, THEN NOTIFY.
    //
    // This block chose a recipient -- defaulting to 'sales@caddyed.com', which
    // is a fabricated address and is not the one on this site -- and then, if
    // CRM_API_KEY happened to be set, wrote to an external CRM. With no CRM key
    // (the deployed state) NOTHING was written anywhere, and the only remaining
    // step was sendEmailNotification, which throws without SMTP and became a 500.
    //
    // So: a lead form submission on the deployed configuration was a 500 and no
    // record. utils/inquiry.js writes to THIS site's database first, always, and
    // then notifies -- to a real recipient resolved from the staff table or the
    // environment -- with the outcome reported rather than thrown.
    const outcome = await inquiry.submit('lead', {
      name: data.name,
      email: data.email,
      phone: data.phone,
      message: data.message || data.subject || null,
      subject: data.subject,
      vehicleTitle: data.vehicle || data.vehicleId || null,
      vehicleYear: data.year || null,
      vehicleMake: data.make || null,
      formType,
      source: 'website',
    });

    // The customer is told it is received, which is TRUE: the lead is a row in
    // this site's database and /admin/leads lists it.
    return errorHandler.createSuccessResponse(
      {
        submitted: new Date().toISOString(),
        leadId: outcome.id,
        notified: outcome.notified,
        notifyReason: outcome.notifyReason || null
      },
      'Thank you — your details have been sent and Ed will be in touch shortly.'
    );
  } catch (error) {
    console.error('Error processing lead form submission:', error);
    return errorHandler.serverError('Error processing form submission', error);
  }
};

// Helper function to send email notifications
async function sendEmailNotification(data, recipient, subject) {
  const { name, email, phone, message, ...additionalFields } = data;

  // Align SMTP variable names with the rest of the repo.
  // .env.example documents SMTP_USER/SMTP_PASSWORD; other functions also accept SMTP_PASS.
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASSWORD || process.env.SMTP_PASS;

  if (!process.env.SMTP_HOST || !smtpUser || !smtpPass) {
    throw new Error('SMTP is not configured');
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: smtpUser,
      pass: smtpPass
    }
  });

  // Build email content
  let emailContent = `
    <h2>${subject}</h2>
    <p><strong>Name:</strong> ${name}</p>
    <p><strong>Email:</strong> ${email}</p>
    <p><strong>Phone:</strong> ${phone}</p>
  `;

  if (message) {
    emailContent += `<p><strong>Message:</strong> ${message.replace(/\n/g, '<br>')}</p>`;
  }

  // Add any additional fields
  for (const [key, value] of Object.entries(additionalFields)) {
    if (key !== 'formType' && key !== 'leadSource' && key !== 'pageUrl' && key !== 'startedAt' && key !== 'submittedAt') {
      const formattedKey = key.replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase());
      emailContent += `<p><strong>${formattedKey}:</strong> ${value}</p>`;
    }
  }

  // Send the email
  const info = await transporter.sendMail({
    from: `"Caddy Ed Website" <${process.env.SMTP_FROM || smtpUser || 'noreply@caddyed.com'}>`,
    to: recipient,
    subject: subject,
    html: emailContent,
    replyTo: email
  });

  return info;
}

// Helper function to save lead to CRM
async function saveToCRM(data) {
  const { name, email, phone, message, formType } = data;

  try {
    const response = await fetch(process.env.CRM_API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.CRM_API_KEY}`
      },
      body: JSON.stringify({
        leadSource: 'Website',
        leadType: formType || 'General',
        contact: {
          name,
          email,
          phone
        },
        message,
        additionalData: data
      })
    });

    if (!response.ok) {
      throw new Error(`CRM API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error saving to CRM:', error);
    // Don't throw so the form submission can still complete
    return null;
  }
}
