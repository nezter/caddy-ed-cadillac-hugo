const nodemailer = require('nodemailer');

exports.handler = async function(event, context) {
  // Only process POST requests
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    // Parse the incoming data
    const payload = JSON.parse(event.body);
    const { form_name, form_data } = payload;
    
    console.log(`Form submission received: ${form_name}`, form_data);
    
    // Email notification setup
    if (process.env.ENABLE_EMAIL_NOTIFICATIONS === 'true') {
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
    }
    
    // Return success
    return {
      statusCode: 200,
      body: JSON.stringify({ 
        message: 'Form submission recorded successfully' 
      })
    };
  } catch (error) {
    console.error('Error processing form submission:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        message: 'Error processing form submission' 
      })
    };
  }
};
