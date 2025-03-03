const nodemailer = require('nodemailer');

exports.handler = async function(event, context) {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Parse the form data
  const formData = JSON.parse(event.body);
  
  // Validate form data
  if (!formData.name || !formData.email || !formData.message) {
    return {
      statusCode: 400,
      body: JSON.stringify({ success: false, message: 'Please fill out all required fields' })
    };
  }

  try {
    // Set up nodemailer transport
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    // Email content
    const mailOptions = {
      from: `"Caddy Ed Website" <${process.env.SMTP_USER}>`,
      to: process.env.NOTIFICATION_EMAIL,
      replyTo: formData.email,
      subject: `New Contact Form Submission from ${formData.name}`,
      text: `
        Name: ${formData.name}
        Email: ${formData.email}
        Phone: ${formData.phone || 'Not provided'}
        
        Message:
        ${formData.message}
      `,
      html: `
        <h2>New Contact Form Submission</h2>
        <p><strong>Name:</strong> ${formData.name}</p>
        <p><strong>Email:</strong> ${formData.email}</p>
        <p><strong>Phone:</strong> ${formData.phone || 'Not provided'}</p>
        <h3>Message:</h3>
        <p>${formData.message.replace(/\n/g, '<br>')}</p>
      `
    };

    // Send email
    await transporter.sendMail(mailOptions);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: 'Thank you for your message! I will get back to you soon.' })
    };
  } catch (error) {
    console.error('Error sending email:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, message: 'Something went wrong. Please try again later.' })
    };
  }
};
