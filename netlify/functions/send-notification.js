const nodemailer = require('nodemailer');

/**
 * Send Notification Email
 * Handles sending various types of notification emails
 */
exports.handler = async (event, context) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ success: false, error: 'Method not allowed' })
    };
  }

  try {
    const data = JSON.parse(event.body);
    const { type, recipient, subject, content, metadata } = data;

    // Create email transporter
    const transporter = createTransporter();

    // Generate email content based on type
    const emailContent = generateEmailContent(type, data);

    // Send email
    const mailOptions = {
      from: process.env.SMTP_USER || 'noreply@caddyed.com',
      to: recipient,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text
    };

    await transporter.sendMail(mailOptions);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: 'Notification sent successfully'
      })
    };

  } catch (error) {
    console.error('Email notification error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: 'Failed to send notification',
        details: error.message
      })
    };
  }
};

function createTransporter() {
  // For development/testing, we'll use a mock transporter
  // In production, this would use actual SMTP credentials
  if (process.env.NODE_ENV === 'development' || !process.env.SMTP_HOST) {
    return {
      sendMail: async (options) => {
        console.log('📧 MOCK EMAIL SENT:');
        console.log('To:', options.to);
        console.log('Subject:', options.subject);
        console.log('Content:', options.text || options.html.substring(0, 200) + '...');
        return { messageId: 'mock-' + Date.now() };
      }
    };
  }

  return nodemailer.createTransporter({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT || 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

function generateEmailContent(type, data) {
  const { recipient, subject, content, metadata } = data;

  switch (type) {
    case 'lead_created':
      return {
        subject: subject || 'New Lead Received - Cadillac Dealership',
        html: generateLeadEmailHTML(data),
        text: generateLeadEmailText(data)
      };

    case 'appointment_scheduled':
      return {
        subject: subject || 'Appointment Scheduled - Cadillac Dealership',
        html: generateAppointmentEmailHTML(data),
        text: generateAppointmentEmailText(data)
      };

    case 'customer_message':
      return {
        subject: subject || 'Message from Customer - Cadillac Dealership',
        html: generateMessageEmailHTML(data),
        text: generateMessageEmailText(data)
      };

    default:
      return {
        subject: subject || 'Notification from Cadillac Dealership',
        html: `<p>${content || 'You have a new notification.'}</p>`,
        text: content || 'You have a new notification.'
      };
  }
}

function generateLeadEmailHTML(data) {
  const { metadata } = data;
  const lead = metadata?.lead || {};

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>New Lead Received</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #007bff; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background: #f9f9f9; }
        .lead-info { background: white; padding: 15px; margin: 10px 0; border-left: 4px solid #007bff; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🚗 New Lead Received</h1>
          <p>Cadillac Dealership Customer Inquiry</p>
        </div>

        <div class="content">
          <h2>Lead Information</h2>

          <div class="lead-info">
            <p><strong>Name:</strong> ${lead.first_name || ''} ${lead.last_name || ''}</p>
            <p><strong>Email:</strong> ${lead.email || 'Not provided'}</p>
            <p><strong>Phone:</strong> ${lead.phone || 'Not provided'}</p>
            <p><strong>Source:</strong> ${lead.lead_source || 'Website'}</p>
            <p><strong>Vehicle Interest:</strong> ${lead.vehicle_interest || 'Not specified'}</p>
          </div>

          ${lead.message ? `
            <h3>Customer Message</h3>
            <div class="lead-info">
              <p>${lead.message}</p>
            </div>
          ` : ''}

          <p><strong>Next Steps:</strong></p>
          <ul>
            <li>Contact the customer within 24 hours</li>
            <li>Schedule a test drive or meeting</li>
            <li>Update lead status in the dashboard</li>
          </ul>
        </div>

        <div class="footer">
          <p>This notification was sent by the Cadillac Dealership CRM System</p>
          <p>Caddy Ed Cadillac - Your Trusted Cadillac Dealer</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

function generateLeadEmailText(data) {
  const { metadata } = data;
  const lead = metadata?.lead || {};

  return `
NEW LEAD RECEIVED
==================

Lead Information:
- Name: ${lead.first_name || ''} ${lead.last_name || ''}
- Email: ${lead.email || 'Not provided'}
- Phone: ${lead.phone || 'Not provided'}
- Source: ${lead.lead_source || 'Website'}
- Vehicle Interest: ${lead.vehicle_interest || 'Not specified'}

${lead.message ? `Customer Message:
${lead.message}

` : ''}Next Steps:
- Contact the customer within 24 hours
- Schedule a test drive or meeting
- Update lead status in the dashboard

This notification was sent by the Cadillac Dealership CRM System
Caddy Ed Cadillac - Your Trusted Cadillac Dealer
  `.trim();
}

function generateAppointmentEmailHTML(data) {
  const { metadata } = data;
  const appointment = metadata?.appointment || {};

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Appointment Scheduled</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #28a745; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background: #f9f9f9; }
        .appointment-info { background: white; padding: 15px; margin: 10px 0; border-left: 4px solid #28a745; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>📅 Appointment Scheduled</h1>
          <p>Cadillac Dealership Appointment Confirmation</p>
        </div>

        <div class="content">
          <h2>Appointment Details</h2>

          <div class="appointment-info">
            <p><strong>Type:</strong> ${appointment.type || 'Test Drive'}</p>
            <p><strong>Date & Time:</strong> ${appointment.scheduled_date || 'TBD'} at ${appointment.scheduled_time || 'TBD'}</p>
            <p><strong>Location:</strong> ${appointment.location || 'Cadillac Dealership'}</p>
            ${appointment.notes ? `<p><strong>Notes:</strong> ${appointment.notes}</p>` : ''}
          </div>

          <h3>Customer Information</h3>
          <div class="appointment-info">
            <p><strong>Name:</strong> ${appointment.customer_name || 'TBD'}</p>
            <p><strong>Phone:</strong> ${appointment.customer_phone || 'TBD'}</p>
            <p><strong>Email:</strong> ${appointment.customer_email || 'TBD'}</p>
          </div>

          <p><strong>Preparation Checklist:</strong></p>
          <ul>
            <li>Vehicle should be clean and ready for test drive</li>
            <li>All paperwork prepared</li>
            <li>Sales representative briefed on customer preferences</li>
          </ul>
        </div>

        <div class="footer">
          <p>This notification was sent by the Cadillac Dealership CRM System</p>
          <p>Caddy Ed Cadillac - Your Trusted Cadillac Dealer</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

function generateAppointmentEmailText(data) {
  const { metadata } = data;
  const appointment = metadata?.appointment || {};

  return `
APPOINTMENT SCHEDULED
=====================

Appointment Details:
- Type: ${appointment.type || 'Test Drive'}
- Date & Time: ${appointment.scheduled_date || 'TBD'} at ${appointment.scheduled_time || 'TBD'}
- Location: ${appointment.location || 'Cadillac Dealership'}
${appointment.notes ? `- Notes: ${appointment.notes}` : ''}

Customer Information:
- Name: ${appointment.customer_name || 'TBD'}
- Phone: ${appointment.customer_phone || 'TBD'}
- Email: ${appointment.customer_email || 'TBD'}

Preparation Checklist:
- Vehicle should be clean and ready for test drive
- All paperwork prepared
- Sales representative briefed on customer preferences

This notification was sent by the Cadillac Dealership CRM System
Caddy Ed Cadillac - Your Trusted Cadillac Dealer
  `.trim();
}

function generateMessageEmailHTML(data) {
  const { metadata } = data;
  const message = metadata?.message || {};

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Customer Message</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #17a2b8; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background: #f9f9f9; }
        .message-content { background: white; padding: 15px; margin: 10px 0; border-left: 4px solid #17a2b8; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>💬 Customer Message</h1>
          <p>Cadillac Dealership Customer Communication</p>
        </div>

        <div class="content">
          <h2>Message Details</h2>

          <div class="message-content">
            <p><strong>From:</strong> ${message.customer_name || 'Customer'}</p>
            <p><strong>Subject:</strong> ${message.subject || 'No subject'}</p>
            <p><strong>Received:</strong> ${new Date().toLocaleString()}</p>
          </div>

          <h3>Message Content</h3>
          <div class="message-content">
            <p>${message.content || 'No message content'}</p>
          </div>

          <p><strong>Recommended Actions:</strong></p>
          <ul>
            <li>Respond to the customer within 24 hours</li>
            <li>Update customer records with any new information</li>
            <li>Schedule follow-up if needed</li>
          </ul>
        </div>

        <div class="footer">
          <p>This notification was sent by the Cadillac Dealership CRM System</p>
          <p>Caddy Ed Cadillac - Your Trusted Cadillac Dealer</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

function generateMessageEmailText(data) {
  const { metadata } = data;
  const message = metadata?.message || {};

  return `
CUSTOMER MESSAGE RECEIVED
=========================

Message Details:
- From: ${message.customer_name || 'Customer'}
- Subject: ${message.subject || 'No subject'}
- Received: ${new Date().toLocaleString()}

Message Content:
${message.content || 'No message content'}

Recommended Actions:
- Respond to the customer within 24 hours
- Update customer records with any new information
- Schedule follow-up if needed

This notification was sent by the Cadillac Dealership CRM System
Caddy Ed Cadillac - Your Trusted Cadillac Dealer
  `.trim();
}