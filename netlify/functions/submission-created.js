const nodemailer = require('nodemailer');
const errorHandler = require('./utils/error-handler');

exports.handler = async function(event, context) {
  // Only process POST requests
  if (event.httpMethod !== 'POST') {
    return errorHandler.forbiddenError('Method not allowed');
  }

  try {
    // Parse the incoming data
    let payload;
    try {
      payload = JSON.parse(event.body);
    } catch (e) {
      return errorHandler.validationError('Invalid JSON in request body');
    }
    
    const { form_name, form_data } = payload;
    
    if (!form_name || !form_data) {
      return errorHandler.validationError('Missing required fields: form_name or form_data');
    }
    
    console.log(`Form submission received: ${form_name}`, form_data);
    
    // Email notification setup
    if (process.env.ENABLE_EMAIL_NOTIFICATIONS === 'true') {
      try {
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: process.env.SMTP_PORT,
          secure: process.env.SMTP_SECURE === 'true',
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
          }
        });
        
        const formTypeToSubject = {
          'contact': `New Website Contact from ${form_data.name}`,
          'test-drive': `Test Drive Request from ${form_data.name}`,
          'trade-in': `Trade-In Inquiry from ${form_data.name}`,
          'financing': `Financing Inquiry from ${form_data.name}`
        };
        
        const subject = formTypeToSubject[form_name] || `New Form Submission: ${form_name}`;
        
        // Generate email content
        let text = `New form submission from ${form_data.name} (${form_data.email})\n\n`;
        
        Object.entries(form_data).forEach(([key, value]) => {
          if (key !== 'form-name') {
            text += `${key}: ${value}\n`;
          }
        });
        
        // Send email notification
        await transporter.sendMail({
          from: `"Caddy Ed Website" <${process.env.SMTP_USER}>`,
          to: process.env.NOTIFICATION_EMAIL,
          subject,
          text
        });
        
        console.log('Email notification sent successfully');
      } catch (emailError) {
        console.error('Failed to send email notification:', emailError);
        // We continue execution even if email fails
      }
    }
    
    // Return success
    return errorHandler.createSuccessResponse({ formId: Date.now() }, 'Form submission recorded successfully');
  } catch (error) {
    return errorHandler.serverError('Error processing form submission', error);
  }
};
