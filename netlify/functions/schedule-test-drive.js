const nodemailer = require('nodemailer');
const InteractionService = require('./utils/interaction-service');
const FollowupService = require('./utils/followup-service');
const DatabaseService = require('./utils/database-service');

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

    // Log the test drive request as an interaction
    try {
      // Try to find existing customer by email
      let customerId = null;
      try {
        const existingCustomers = await DatabaseService.searchCustomers({
          search: data.email,
          limit: 1
        });
        if (existingCustomers.length > 0) {
          customerId = existingCustomers[0].id;
        }
      } catch (searchError) {
        console.log('Customer search failed for test drive, will create new interaction without customer link');
      }

      // If no existing customer, create a prospect customer record
      if (!customerId) {
        try {
          const nameParts = data.fullName.split(' ');
          const customerData = {
            first_name: nameParts[0],
            last_name: nameParts.slice(1).join(' ') || '',
            email: data.email,
            phone: data.phone || '',
            customer_type: 'prospect',
            source: 'test_drive_request'
          };

          const newCustomer = await DatabaseService.createCustomer(customerData);
          customerId = newCustomer.id;
          console.log('Created new prospect customer from test drive request:', customerId);
        } catch (createError) {
          console.error('Failed to create customer from test drive request:', createError);
          // Continue without customer link
        }
      }

      // Log the interaction
      if (customerId) {
        await InteractionService.logCustomerInteraction({
          customer_id: customerId,
          interaction_type: 'test_drive',
          subject: `Test Drive Request - ${data.vehicleId}`,
          content: `Test drive requested for vehicle ${data.vehicleId}. Preferred date: ${data.preferredDate}, Time: ${data.preferredTime}. Comments: ${data.comments || 'None'}`,
          contact_method: 'website',
          contact_details: `Email: ${data.email}, Phone: ${data.phone}`,
          outcome: 'appointment_set',
          next_action: 'Schedule test drive appointment',
          next_action_date: new Date(`${data.preferredDate}T${data.preferredTime}`),
          metadata: {
            vehicle_id: data.vehicleId,
            preferred_date: data.preferredDate,
            preferred_time: data.preferredTime,
            comments: data.comments
          }
        });

        console.log('Test drive request interaction logged for customer:', customerId);

        // Schedule automated follow-ups for the test drive request
        try {
          await FollowupService.scheduleFollowups(customerId, null, 'appointment_scheduled');
          console.log(`Follow-ups scheduled for test drive request from customer ${customerId}`);
        } catch (followupError) {
          console.error('Error scheduling follow-ups for test drive:', followupError);
          // Continue with success response even if follow-up scheduling fails
        }
      }
    } catch (interactionError) {
      console.error('Error logging test drive interaction:', interactionError);
      // Continue with success response even if interaction logging fails
    }

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
