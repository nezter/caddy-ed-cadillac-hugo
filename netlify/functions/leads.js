const errorHandler = require('./utils/error-handler');
const nodemailer = require('nodemailer');
const DeduplicationService = require('./utils/deduplication-service');
const { createClient } = require('@supabase/supabase-js');

/**
 * Leads API
 * Handles lead submissions from various sources
 */
exports.handler = async function(event, context) {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return errorHandler.forbiddenError('Method not allowed');
  }

  try {
    // Parse the lead data
    let leadData;
    try {
      leadData = JSON.parse(event.body);
    } catch (e) {
      return errorHandler.validationError('Invalid JSON in request body');
    }

    // Validate required fields
    if (!leadData.name || !leadData.email) {
      return errorHandler.validationError('Missing required fields', {
        name: !leadData.name ? 'Name is required' : null,
        email: !leadData.email ? 'Email is required' : null
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(leadData.email)) {
      return errorHandler.validationError('Invalid email format', {
        email: 'Please provide a valid email address'
      });
    }

    // Check for duplicates
    const deduplicationService = new DeduplicationService();
    const duplicateCheck = await deduplicationService.checkForDuplicates(leadData, {
      confidenceThreshold: 0.8,
      maxResults: 5
    });

    if (duplicateCheck.isDuplicate) {
      console.log(`Duplicate lead detected. Confidence: ${duplicateCheck.confidence}`);

      // Update the existing lead's last contact time
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
      await supabase
        .from('leads')
        .update({ last_contact: new Date().toISOString() })
        .eq('id', duplicateCheck.duplicates[0].lead.id);

      return errorHandler.createSuccessResponse({
        leadId: duplicateCheck.duplicates[0].lead.id,
        status: 'duplicate',
        confidence: duplicateCheck.confidence
      }, 'Thank you for your interest. We already have your information on file and will be in touch soon.');
    }

    // Generate lead ID
    const leadId = `lead_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Prepare lead data for storage
    const processedLead = {
      id: leadId,
      firstName: leadData.name.split(' ')[0],
      lastName: leadData.name.split(' ').slice(1).join(' ') || '',
      email: leadData.email,
      phone: leadData.phone || '',
      message: leadData.message || '',
      formType: leadData.formType || 'general',
      leadSource: leadData.leadSource || 'website',
      pageUrl: leadData.pageUrl || '',
      vehicleInterest: leadData.vehicleInterest || '',
      utm: {
        source: leadData.utm_source || '',
        medium: leadData.utm_medium || '',
        campaign: leadData.utm_campaign || '',
        term: leadData.utm_term || '',
        content: leadData.utm_content || ''
      },
      consent: leadData.consent || false,
      timestamp: new Date().toISOString(),
      status: 'new',
      assignedTo: null, // Will be assigned by lead assignment system
      score: calculateLeadScore(leadData)
    };

    // Save lead to database
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    const { data, error } = await supabase
      .from('leads')
      .insert([processedLead])
      .select();

    if (error) {
      console.error('Error saving lead to database:', error);
      // Continue with email notification even if DB save fails
    } else {
      console.log('Lead saved to database:', data[0]);
    }

    // Send notification email to sales team
    try {
      // Use the send-notification function for better error handling
      const notificationResponse = await fetch(`${process.env.URL}/.netlify/functions/send-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'lead_created',
          recipient: 'sales@caddyed.com', // Primary sales email
          subject: `New Lead: ${processedLead.firstName} ${processedLead.lastName}`,
          content: `A new lead has been received from the website.`,
          metadata: {
            lead: processedLead,
            leadId: leadId,
            timestamp: new Date().toISOString()
          }
        })
      });

      if (!notificationResponse.ok) {
        console.error('Failed to send lead notification:', await notificationResponse.text());
      }
    } catch (emailError) {
      console.error('Failed to send lead notification email:', emailError);
      // Don't fail the request if email fails
    }

    // TODO: Integrate with CRM system
    // TODO: Trigger lead assignment workflow

    return errorHandler.createSuccessResponse({
      leadId: leadId,
      status: 'received',
      message: 'Thank you for your interest. A member of our sales team will contact you shortly.'
    });

  } catch (error) {
    console.error('Lead processing error:', error);
    return errorHandler.serverError('Failed to process lead submission', error);
  }
};

/**
 * Calculate lead score based on various factors
 */
function calculateLeadScore(leadData) {
  let score = 50; // Base score

  // Source quality scoring
  const highQualitySources = ['website', 'phone', 'walk_in'];
  const mediumQualitySources = ['social_media', 'email', 'referral'];

  if (highQualitySources.includes(leadData.leadSource)) {
    score += 20;
  } else if (mediumQualitySources.includes(leadData.leadSource)) {
    score += 10;
  }

  // Phone number provided
  if (leadData.phone) {
    score += 15;
  }

  // Message provided (shows engagement)
  if (leadData.message && leadData.message.length > 10) {
    score += 10;
  }

  // Vehicle interest specified
  if (leadData.vehicleInterest) {
    score += 10;
  }

  // UTM parameters (paid traffic)
  if (leadData.utm_source) {
    score += 5;
  }

  // Consent given
  if (leadData.consent) {
    score += 5;
  }

  return Math.min(score, 100); // Cap at 100
}

/**
 * Send notification email to sales team
 */
async function sendLeadNotificationEmail(lead) {
  const transporter = nodemailer.createTransporter({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  const subject = `New Lead: ${lead.firstName} ${lead.lastName} - ${lead.formType}`;
  const htmlContent = `
    <h2>New Lead Received</h2>
    <div style="background: #f5f5f5; padding: 20px; margin: 20px 0;">
      <h3>Lead Details</h3>
      <p><strong>Name:</strong> ${lead.firstName} ${lead.lastName}</p>
      <p><strong>Email:</strong> <a href="mailto:${lead.email}">${lead.email}</a></p>
      ${lead.phone ? `<p><strong>Phone:</strong> <a href="tel:${lead.phone}">${lead.phone}</a></p>` : ''}
      <p><strong>Form Type:</strong> ${lead.formType}</p>
      <p><strong>Lead Source:</strong> ${lead.leadSource}</p>
      ${lead.vehicleInterest ? `<p><strong>Vehicle Interest:</strong> ${lead.vehicleInterest}</p>` : ''}
      <p><strong>Lead Score:</strong> ${lead.score}/100</p>
      <p><strong>Submitted:</strong> ${new Date(lead.timestamp).toLocaleString()}</p>
    </div>

    ${lead.message ? `
    <div style="background: #fff; border: 1px solid #ddd; padding: 15px; margin: 20px 0;">
      <h4>Customer Message:</h4>
      <p>${lead.message.replace(/\n/g, '<br>')}</p>
    </div>
    ` : ''}

    ${lead.utm.source ? `
    <div style="background: #e8f4f8; padding: 15px; margin: 20px 0;">
      <h4>UTM Tracking:</h4>
      <p><strong>Source:</strong> ${lead.utm.source}</p>
      <p><strong>Medium:</strong> ${lead.utm.medium}</p>
      <p><strong>Campaign:</strong> ${lead.utm.campaign}</p>
    </div>
    ` : ''}

    <p><a href="${process.env.ADMIN_URL || 'https://admin.caddyedcadillac.com'}/leads/${lead.id}" style="background: #007cba; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View in Admin Panel</a></p>
  `;

  await transporter.sendMail({
    from: `"Website Leads" <${process.env.SMTP_USER}>`,
    to: process.env.LEAD_NOTIFICATION_EMAIL || process.env.NOTIFICATION_EMAIL || 'leads@cadillacofsouthcharlotte.com',
    subject: subject,
    html: htmlContent,
    replyTo: lead.email
  });
}