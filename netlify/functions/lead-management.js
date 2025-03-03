const nodemailer = require('nodemailer');

exports.handler = async function(event, context) {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  
  try {
    // Parse the form data
    const formData = JSON.parse(event.body);
    const formType = formData.formType || 'contact'; // contact, testDrive, tradeIn
    
    // Basic validation
    if (!formData.name || !formData.email) {
      return {
        statusCode: 400,
        body: JSON.stringify({ 
          success: false, 
          message: 'Name and email are required fields' 
        })
      };
    }
    
    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ 
          success: false, 
          message: 'Please provide a valid email address' 
        })
      };
    }
    
    // Prepare data for CRM integration
    const leadData = {
      ...formData,
      source: 'Website Form',
      timestamp: new Date().toISOString(),
      formType,
      userAgent: event.headers['user-agent'],
      ipAddress: event.headers['x-forwarded-for'] || event.headers['client-ip']
    };
    
    console.log(`New ${formType} lead received:`, leadData);
    
    // Save to Netlify Forms for backup
    await fetch('/.netlify/functions/submission-created', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        form_name: formType,
        form_data: leadData
      })
    });
    
    // Option 1: Send email notification
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
      
      const emailSubjects = {
        contact: `New Contact Form Submission from ${formData.name}`,
        testDrive: `Test Drive Request from ${formData.name}`,
        tradeIn: `Trade-In Inquiry from ${formData.name}`
      };
      
      await transporter.sendMail({
        from: '"Caddy Ed Website" <noreply@caddyed.com>',
        to: process.env.NOTIFICATION_EMAIL,
        subject: emailSubjects[formType],
        text: generateEmailText(leadData),
        html: generateEmailHtml(leadData)
      });
      
      console.log('Notification email sent');
    }
    
    // Option 2: CRM Integration - implement with your preferred CRM
    // This is a placeholder for future CRM integration
    /*
    if (process.env.ENABLE_CRM_INTEGRATION === 'true') {
      await fetch(process.env.CRM_API_ENDPOINT, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.CRM_API_KEY}`
        },
        body: JSON.stringify(leadData)
      });
      
      console.log('Lead data sent to CRM');
    }
    */
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: getSuccessMessage(formType)
      })
    };
    
  } catch (error) {
    console.error('Error processing form submission:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: 'There was an error processing your request. Please try again later.'
      })
    };
  }
};

function generateEmailText(data) {
  let text = `
Name: ${data.name}
Email: ${data.email}
Phone: ${data.phone || 'Not provided'}
`;

  switch (data.formType) {
    case 'testDrive':
      text += `
Preferred Date: ${data.preferredDate || 'Not specified'}
Preferred Time: ${data.preferredTime || 'Not specified'}
Vehicle Interest: ${data.vehicle || 'Not specified'}
Comments: ${data.comments || 'None'}
`;
      break;
    case 'tradeIn':
      text += `
Current Vehicle: ${data.currentMake || ''} ${data.currentModel || ''} ${data.currentYear || ''}
Mileage: ${data.currentMileage || 'Not provided'}
Condition: ${data.vehicleCondition || 'Not provided'}
Vehicle Interest: ${data.vehicle || 'Not specified'}
Comments: ${data.comments || 'None'}
`;
      break;
    default:
      text += `
Message: ${data.message || 'None'}
Vehicle Interest: ${data.vehicle || 'Not specified'}
`;
  }
  
  return text;
}

function generateEmailHtml(data) {
  let html = `
<h2>New ${data.formType.charAt(0).toUpperCase() + data.formType.slice(1)} Form Submission</h2>
<p><strong>Name:</strong> ${data.name}</p>
<p><strong>Email:</strong> ${data.email}</p>
<p><strong>Phone:</strong> ${data.phone || 'Not provided'}</p>
`;

  switch (data.formType) {
    case 'testDrive':
      html += `
<p><strong>Preferred Date:</strong> ${data.preferredDate || 'Not specified'}</p>
<p><strong>Preferred Time:</strong> ${data.preferredTime || 'Not specified'}</p>
<p><strong>Vehicle Interest:</strong> ${data.vehicle || 'Not specified'}</p>
<p><strong>Comments:</strong> ${data.comments || 'None'}</p>
`;
      break;
    case 'tradeIn':
      html += `
<p><strong>Current Vehicle:</strong> ${data.currentMake || ''} ${data.currentModel || ''} ${data.currentYear || ''}</p>
<p><strong>Mileage:</strong> ${data.currentMileage || 'Not provided'}</p>
<p><strong>Condition:</strong> ${data.vehicleCondition || 'Not provided'}</p>
<p><strong>Vehicle Interest:</strong> ${data.vehicle || 'Not specified'}</p>
<p><strong>Comments:</strong> ${data.comments || 'None'}</p>
`;
      break;
    default:
      html += `
<p><strong>Message:</strong> ${data.message || 'None'}</p>
<p><strong>Vehicle Interest:</strong> ${data.vehicle || 'Not specified'}</p>
`;
  }
  
  html += `
<p><em>This submission was received on ${new Date().toLocaleString()}</em></p>
`;
  
  return html;
}

function getSuccessMessage(formType) {
  switch (formType) {
    case 'testDrive':
      return 'Thank you for scheduling a test drive. Our team will contact you shortly to confirm your appointment.';
    case 'tradeIn':
      return 'Thank you for your trade-in inquiry. We will evaluate your information and contact you with our best offer.';
    default:
      return 'Thank you for your message. We will get back to you soon.';
  }
}
