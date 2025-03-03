const nodemailer = require('nodemailer');

exports.handler = async function(event, context) {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ success: false, message: 'Method Not Allowed' })
    };
  }

  try {
    // Parse the JSON body
    const data = JSON.parse(event.body);
    
    // Validate required fields
    const requiredFields = ['vehicleId', 'fullName', 'email', 'phone', 'preferredDate', 'preferredTime'];
    for (const field of requiredFields) {
      if (!data[field]) {
        return {
          statusCode: 400,
          body: JSON.stringify({ 
            success: false, 
            message: `Missing required field: ${field}` 
          })
        };
      }
    }

    // Send email using nodemailer
    // Note: In production, you'd store these credentials securely
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.example.com',
      port: process.env.SMTP_PORT || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    // Format the email content
    const emailContent = `
      Test Drive Request

      Vehicle ID: ${data.vehicleId}
      Customer Name: ${data.fullName}
      Email: ${data.email}
      Phone: ${data.phone}
      Preferred Date: ${data.preferredDate}
      Preferred Time: ${data.preferredTime}
      Comments: ${data.comments || 'No comments provided'}

      This request was submitted on ${new Date().toLocaleString()}.
    `;

    // Send email
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'website@example.com',
      to: process.env.EMAIL_TO || 'sales@example.com',
      subject: 'New Test Drive Request',
      text: emailContent
    });

    // Return success
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: 'Test drive scheduled successfully' })
    };
  } catch (error) {
    console.error('Error scheduling test drive:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        success: false, 
        message: 'Failed to schedule test drive. Please try again later.' 
      })
    };
  }
};
