const inquiry = require('./utils/inquiry');
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

    // RECORD FIRST, THEN NOTIFY.
    //
    // This used to build a nodemailer transport and send, and on a send failure
    // `return errorHandler.serverError(...)` -- which skipped the interaction
    // logging below entirely. So with SMTP unconfigured, a contact form
    // submission was a 500 AND left no trace: no customer, no interaction, no
    // lead. The enquiry existed for about forty milliseconds and then not at all.
    //
    // The database is the system of record. /admin/customers and
    // /admin/interactions read it, and they work. The email is a convenience for
    // someone not looking at the admin, and it cannot be allowed to decide
    // whether the enquiry exists. See utils/inquiry.js.
    const outcome = await inquiry.submit('lead', {
      name: formData.name,
      email: formData.email,
      phone: formData.phone,
      message: formData.message,
      subject: formData.subject,
      formType: 'contact',
      source: 'contact_form',
    });

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
    // The customer is told it is received, which is TRUE -- the lead is in the
    // database and the sales rep can see it. `notified` is in the body so an
    // operator can tell a working mail path from a dead one without reading logs.
    return errorHandler.createSuccessResponse(
      {
        submitted: new Date().toISOString(),
        leadId: outcome.id,
        notified: outcome.notified,
        notifyReason: outcome.notifyReason || null,
      },
      'Thank you for your message. We will get back to you as soon as possible.'
    );
  } catch (error) {
    return errorHandler.serverError('Error processing contact form submission', error);
  }
};
