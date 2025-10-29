const nodemailer = require('nodemailer');
const errorHandler = require('./utils/error-handler');
const InteractionService = require('./utils/interaction-service');
const DatabaseService = require('./utils/database-service');

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

    // Log the contact form submission as an interaction
    try {
      // Try to find existing customer by email
      let customerId = null;
      try {
        const existingCustomers = await DatabaseService.searchCustomers({
          search: formData.email,
          limit: 1
        });
        if (existingCustomers.length > 0) {
          customerId = existingCustomers[0].id;
        }
      } catch (searchError) {
        console.log('Customer search failed, will create new interaction without customer link');
      }

      // If no existing customer, create a prospect customer record
      if (!customerId) {
        try {
          const nameParts = formData.name.split(' ');
          const customerData = {
            first_name: nameParts[0],
            last_name: nameParts.slice(1).join(' ') || '',
            email: formData.email,
            phone: formData.phone || '',
            customer_type: 'prospect',
            source: 'contact_form'
          };

          const newCustomer = await DatabaseService.createCustomer(customerData);
          customerId = newCustomer.id;
          console.log('Created new prospect customer from contact form:', customerId);
        } catch (createError) {
          console.error('Failed to create customer from contact form:', createError);
          // Continue without customer link
        }
      }

      // Log the interaction
      if (customerId) {
        await InteractionService.logCustomerInteraction({
          customer_id: customerId,
          interaction_type: 'form_submission',
          subject: formData.subject || 'Contact Form Submission',
          content: formData.message || 'Contact form submitted via website',
          contact_method: 'website',
          contact_details: `Email: ${formData.email}${formData.phone ? `, Phone: ${formData.phone}` : ''}`,
          metadata: {
            form_type: 'contact',
            form_data: formData
          }
        });

        console.log('Contact form interaction logged for customer:', customerId);
      }
    } catch (interactionError) {
      console.error('Error logging contact form interaction:', interactionError);
      // Continue with success response even if interaction logging fails
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
