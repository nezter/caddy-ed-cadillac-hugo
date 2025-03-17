const nodemailer = require('nodemailer');
const errorHandler = require('./utils/error-handler');

exports.handler = async function(event, context) {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return errorHandler.forbiddenError('Method not allowed');
  }

  try {
    // Parse the incoming data
    let formData;
    try {
      formData = JSON.parse(event.body);
    } catch (e) {
      return errorHandler.validationError('Invalid JSON in request body');
    }

    // Validate required fields
    if (!formData.name || !formData.email) {
      return errorHandler.validationError('Name and email are required', {
        name: !formData.name ? 'Name is required' : null,
        email: !formData.email ? 'Email is required' : null
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      return errorHandler.validationError('Invalid email format', {
        email: 'Please provide a valid email address'
      });
    }

    // Setup email transport
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    // Build email content
    const subject = `New Contact Form Submission from ${formData.name}`;
    let htmlContent = `
      <h2>New Contact Form Submission</h2>
      <p><strong>Name:</strong> ${formData.name}</p>
      <p><strong>Email:</strong> ${formData.email}</p>
    `;
    
    if (formData.phone) {
      htmlContent += `<p><strong>Phone:</strong> ${formData.phone}</p>`;
    }
    
    if (formData.subject) {
      htmlContent += `<p><strong>Subject:</strong> ${formData.subject}</p>`;
    }
    
    if (formData.message) {
      htmlContent += `<p><strong>Message:</strong></p><p>${formData.message.replace(/\n/g, '<br>')}</p>`;
    }
    
    // Add any additional form fields
    Object.entries(formData).forEach(([key, value]) => {
      if (!['name', 'email', 'phone', 'subject', 'message'].includes(key) && value) {
        htmlContent += `<p><strong>${key}:</strong> ${value}</p>`;
      }
    });

    // Send the email
    try {
      await transporter.sendMail({
        from: `"Website Form" <${process.env.SMTP_USER}>`,
        to: process.env.NOTIFICATION_EMAIL || 'info@caddyed.com',
        subject: subject,
        html: htmlContent,
        replyTo: formData.email
      });
    } catch (emailError) {
      console.error('Email sending error:', emailError);
      return errorHandler.serverError('Failed to send email', emailError);
    }

    // Return success response
    return errorHandler.createSuccessResponse(
      { submitted: new Date().toISOString() },
      'Thank you for your message. We will get back to you as soon as possible.'
    );
  } catch (error) {
    return errorHandler.serverError('Error processing contact form submission', error);
  }
};
