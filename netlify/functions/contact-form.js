const nodemailer = require('nodemailer');

exports.handler = async function(event, context) {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  
  try {
    // Parse the form data
    const formData = JSON.parse(event.body);
    
    // Basic validation
    if (!formData.name || !formData.email || !formData.message) {
      return {
        statusCode: 400,
        body: JSON.stringify({ 
          success: false, 
          message: 'Please fill out all required fields' 
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
    
    // Log submission for debugging
    console.log('Form submission:', formData);
    
    // Record form submission in Netlify Forms
    await fetch('/.netlify/functions/submission-created', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        form_name: 'contact',
        form_data: formData
      })
    });
    
    // Optional: Send email notification
    // Uncomment and configure if email sending is needed
    /*
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
    
    await transporter.sendMail({
      from: '"Caddy Ed Website" <noreply@caddyed.com>',
      to: 'sales@caddyed.com',
      subject: `New Contact Form Submission from ${formData.name}`,
      text: `
        Name: ${formData.name}
        Email: ${formData.email}
        Phone: ${formData.phone || 'Not provided'}
        Message: ${formData.message}
        Vehicle Interest: ${formData.vehicle || 'Not specified'}
      `,
      html: `
        <h2>New Contact Form Submission</h2>
        <p><strong>Name:</strong> ${formData.name}</p>
        <p><strong>Email:</strong> ${formData.email}</p>
        <p><strong>Phone:</strong> ${formData.phone || 'Not provided'}</p>
        <p><strong>Message:</strong> ${formData.message}</p>
        <p><strong>Vehicle Interest:</strong> ${formData.vehicle || 'Not specified'}</p>
      `
    });
    */
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: 'Thank you for your message. We will get back to you soon.'
      })
    };
    
  } catch (error) {
    console.error('Error processing form submission:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: 'There was an error submitting the form. Please try again later.'
      })
    };
  }
};
