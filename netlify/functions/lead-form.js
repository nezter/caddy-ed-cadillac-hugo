const nodemailer = require('nodemailer');

exports.handler = async function(event, context) {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Parse the form data
  let data;
  try {
    data = JSON.parse(event.body);
  } catch (error) {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  // Validate required fields
  const { name, email, phone, message, formType } = data;
  
  if (!name || !email || !phone) {
    return {
      statusCode: 400,
      body: JSON.stringify({ success: false, error: 'Missing required fields' })
    };
  }
  
  try {
    // Determine email recipient based on form type
    let recipient = process.env.DEFAULT_FORM_RECIPIENT || 'sales@caddyed.com';
    let subject = 'New Website Inquiry';
    
    switch (formType) {
      case 'test-drive':
        recipient = process.env.TEST_DRIVE_RECIPIENT || recipient;
        subject = 'New Test Drive Request';
        break;
      case 'contact':
        recipient = process.env.CONTACT_RECIPIENT || recipient;
        subject = 'New Contact Form Submission';
        break;
      case 'service':
        recipient = process.env.SERVICE_RECIPIENT || recipient;
        subject = 'New Service Appointment Request';
        break;
    }
    
    // Save to CRM if API key is provided
    if (process.env.CRM_API_KEY) {
      await saveToCRM(data);
    }
    
    // Send email notification
    const emailResult = await sendEmailNotification(data, recipient, subject);
    
    // Return success
    return {
      statusCode: 200,
      body: JSON.stringify({ 
        success: true, 
        message: 'Form submission successful'
      })
    };
  } catch (error) {
    console.error('Error processing form submission:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        success: false, 
        error: 'Error processing form submission' 
      })
    };
  }
};

// Helper function to send email notifications
async function sendEmailNotification(data, recipient, subject) {
  const { name, email, phone, message, ...additionalFields } = data;
  
  // Create transporter using environment variables
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USERNAME,
      pass: process.env.SMTP_PASSWORD
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
    emailContent += `<p><strong>Message:</strong> ${message}</p>`;
  }
  
  // Add any additional fields
  for (const [key, value] of Object.entries(additionalFields)) {
    if (key !== 'formType') {
      const formattedKey = key.replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase());
      emailContent += `<p><strong>${formattedKey}:</strong> ${value}</p>`;
    }
  }
  
  // Send the email
  const info = await transporter.sendMail({
    from: `"Caddy Ed Website" <${process.env.SMTP_FROM || 'noreply@caddyed.com'}>`,
    to: recipient,
    subject: subject,
    html: emailContent
  });
  
  return info;
}

// Helper function to save lead to CRM
async function saveToCRM(data) {
  const { name, email, phone, message, formType } = data;
  
  // Example CRM API integration
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
