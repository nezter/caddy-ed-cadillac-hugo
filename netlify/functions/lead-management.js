const nodemailer = require('nodemailer');

exports.handler = async function(event, context) {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ message: 'Method Not Allowed' }) };
  }
  
  try {
    // Parse the incoming JSON data
    const data = JSON.parse(event.body);
    const { name, email, phone, formType, ...additionalData } = data;
    
    // Validate required fields
    if (!name || !email) {
      return { 
        statusCode: 400, 
        body: JSON.stringify({ message: 'Name and email are required' }) 
      };
    }

    // Setup email transporter (using environment variables set in Netlify)
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
      }
    });
    
    // Construct email subject based on form type
    let subject = 'New Lead from Caddy Ed Website';
    if (formType === 'testDrive') {
      subject = 'New Test Drive Request';
    } else if (formType === 'contact') {
      subject = 'New Contact Form Submission';
    } else if (formType === 'tradeIn') {
      subject = 'New Trade-In Inquiry';
    }
    
    // Format additional data for the email body
    let additionalDataHtml = '';
    for (const [key, value] of Object.entries(additionalData)) {
      if (value) {
        const formattedKey = key.replace(/([A-Z])/g, ' $1')
          .replace(/^./, str => str.toUpperCase())
          .replace(/([a-z])(\d)/g, '$1 $2');
        additionalDataHtml += `<p><strong>${formattedKey}:</strong> ${value}</p>`;
      }
    }

    // Create email HTML content
    const emailHtml = `
      <h2>${subject}</h2>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      ${phone ? `<p><strong>Phone:</strong> ${phone}</p>` : ''}
      ${additionalDataHtml}
    `;

    // Send email
    await transporter.sendMail({
      from: `"Caddy Ed Website" <${process.env.NOTIFICATION_EMAIL_FROM}>`,
      to: process.env.NOTIFICATION_EMAIL_TO,
      cc: process.env.NOTIFICATION_EMAIL_CC,
      subject: subject,
      html: emailHtml
    });

    // Send confirmation email to customer
    await transporter.sendMail({
      from: `"Caddy Ed" <${process.env.NOTIFICATION_EMAIL_FROM}>`,
      to: email,
      subject: 'Thank you for contacting Caddy Ed',
      html: `
        <h2>Thank you for reaching out, ${name}!</h2>
        <p>I've received your ${formType === 'testDrive' ? 'test drive request' : 'inquiry'} and will get back to you shortly.</p>
        <p>In the meantime, feel free to browse more of my inventory at <a href="https://caddyed.com/inventory">caddyed.com/inventory</a>.</p>
        <p>Best regards,<br>Ed Johnson<br>Cadillac Sales Professional<br>Cadillac of South Charlotte</p>
      `
    });
    
    // Log the submission for tracking
    console.log(`New ${formType} submission received from ${name} (${email})`);
    
    // Return success response
    return {
      statusCode: 200,
      body: JSON.stringify({ 
        message: 'Thank you! Your information has been submitted successfully. I\'ll contact you shortly.' 
      })
    };
    
  } catch (error) {
    console.error('Lead management error:', error);
    
    // Return error response
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'There was a problem submitting your information. Please try again.' })
    };
  }
};
