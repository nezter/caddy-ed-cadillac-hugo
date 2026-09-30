const nodemailer = require('nodemailer');
const errorHandler = require('./utils/error-handler');
const InteractionService = require('./utils/interaction-service');
const FollowupService = require('./utils/followup-service');
const DatabaseService = require('./utils/database-service');

/**
 * schedule-test-drive -- a booking request from the vehicle page
 * (site/layouts/inventory/single.html) or /test-drive/.
 *
 * Reached by site/assets/js/vehicle-detail.js. The page prefills vehicleId
 * from the vehicle's stock number, so that value is never guessed by a visitor.
 *
 * Contract bugs fixed here, all of which made a booking either impossible to
 * make or invisible once made:
 *
 *   1. A body that was not JSON -- a browser's url-encoded form post, or an
 *      empty POST -- hit `JSON.parse` and was reported as a 500 "please try
 *      again later". The request was never going to work on a retry. It is a
 *      400 now, and says what it wanted.
 *   2. `if (!data[field])` accepted a whitespace-only value. "   " is truthy,
 *      so a form full of spaces booked a drive under a name of nothing.
 *      Every field is trimmed and re-checked.
 *   3. Nothing checked the email shape. contact-form.js does. A request with
 *      email "a" produced a lead nobody can answer, reported as a success.
 *   4. `new Date(data.preferredDate + "T" + data.preferredTime)` was built
 *      from unvalidated input, so "next tuesday" became an Invalid Date and
 *      was written into the CRM as the next-action date of a real follow-up
 *      task. Both parts are now shape-checked before anything is stored.
 *   5. A booking is a request for a future time. A past date is a mistake in
 *      the picker, not an appointment, and it is now rejected -- measured
 *      against the dealer's own timezone, not the function's, so a request
 *      sent at 9pm from Charlotte is not called "yesterday" by a UTC clock.
 *   6. The SMTP password was read from process.env.SMTP_PASS. The variable
 *      the project documents, and the one every other function and
 *      .env.example uses, is SMTP_PASSWORD. With SMTP configured from the
 *      documented environment, auth still failed because nothing ever set
 *      SMTP_PASS. Both spellings are accepted now.
 *   7. The recipient defaulted to 'sales@example.com' and the sender to
 *      'website@example.com'. With neither set, the function accepted the
 *      booking, mailed a dead address, and answered 200 "Test drive scheduled
 *      successfully" -- every lead lost, reported as a win. An unconfigured
 *      recipient is now a 503 with a message the page can show, instead of a
 *      silent black hole.
 */

// A booking does not have to name a car. The /test-drive/ page is a general
// scheduling page: a customer picks a date and a time and asks to come in, and
// has not chosen a vehicle yet.
//
// So vehicleId accepts one documented placeholder. That is deliberately narrow:
// the alternative -- letting vehicleId be optional -- would make every other
// field of a real vehicle booking optional too, in the sense that a bug in the
// field mapping would stop being caught here. This calendar module was posting
// { date, time, name } to a URL that did not exist; had this function been
// lenient it would have quietly accepted nothing instead of failing loudly.
const GENERAL_ENQUIRY = 'general-enquiry';

const REQUIRED_FIELDS = ['vehicleId', 'fullName', 'email', 'phone', 'preferredDate', 'preferredTime'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// The dealer is in North Carolina; appointments are made in his timezone.
const DEALER_TZ = 'America/New_York';

/** Today in the dealer's timezone, as YYYY-MM-DD. */
function dealerToday() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DEALER_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type) => (parts.find((p) => p.type === type) || {}).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Where booking notifications go. Absent means the feature is not configured. */
function recipient() {
  return process.env.EMAIL_TO || process.env.NOTIFICATION_EMAIL || '';
}

exports.handler = async function(event, context) {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json', Allow: 'POST' },
      body: JSON.stringify({ success: false, message: 'Method Not Allowed' })
    };
  }

  try {
    // Parse the JSON body. A malformed body is the caller's mistake and is
    // reported as one; see bug 1.
    let data;
    try {
      data = JSON.parse(event.body || 'null');
    } catch (parseError) {
      return errorHandler.validationError('Request body must be JSON');
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return errorHandler.validationError('Request body must be a JSON object');
    }

    // Trim everything once, so a padded field is not a different value from
    // the same field without the spaces. See bug 2.
    const clean = {};
    for (const [key, value] of Object.entries(data)) {
      clean[key] = typeof value === 'string' ? value.trim() : value;
    }
    data = clean;

    // Validate required fields
    const missing = {};
    for (const field of REQUIRED_FIELDS) {
      // vehicleId may be the general-enquiry placeholder; see GENERAL_ENQUIRY.
      if (!data[field] || (field === 'vehicleId' && data[field] === GENERAL_ENQUIRY && !data.vehicleTitle)) {
        missing[field] = `${field} is required`;
      }
    }
    if (Object.keys(missing).length) {
      const first = REQUIRED_FIELDS.find((field) => !data[field]);
      return errorHandler.validationError(`Missing required field: ${first}`, missing);
    }

    // Email shape. See bug 3.
    if (!EMAIL_RE.test(data.email)) {
      return errorHandler.validationError('Invalid email format', {
        email: 'Please provide a valid email address',
      });
    }

    // Date and time shape, and the booking has to be in the future.
    // See bugs 4 and 5.
    if (!DATE_RE.test(data.preferredDate)) {
      return errorHandler.validationError('Invalid preferred date', {
        preferredDate: 'Use YYYY-MM-DD',
      });
    }
    if (!TIME_RE.test(data.preferredTime)) {
      return errorHandler.validationError('Invalid preferred time', {
        preferredTime: 'Use 24-hour HH:MM',
      });
    }
    const today = dealerToday();
    if (data.preferredDate < today) {
      return errorHandler.validationError('Preferred date is in the past', {
        preferredDate: `Choose ${today} or later`,
      });
    }
    // The exact timestamp the interaction is filed under, built once from
    // values that are known to parse.
    const startsAt = new Date(`${data.preferredDate}T${data.preferredTime}:00`);

    // Where does this booking actually go? See bug 7.
    const to = recipient();
    if (!to) {
      console.error(
        '[schedule-test-drive] EMAIL_TO / NOTIFICATION_EMAIL is not set. The request was ' +
        'NOT delivered and NOT booked. Set one of them in the Netlify environment.'
      );
      return {
        statusCode: 503,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          message:
            'Test-drive requests are not being received at the moment. Please call instead.',
        }),
      };
    }

    // Send email using nodemailer
    // Note: In production, you'd store these credentials securely
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.example.com',
      port: process.env.SMTP_PORT || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        // SMTP_PASSWORD is the documented name (.env.example); SMTP_PASS is
        // accepted for older deployments. See bug 6.
        pass: process.env.SMTP_PASSWORD || process.env.SMTP_PASS
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
    try {
      await transporter.sendMail({
        from: process.env.EMAIL_FROM || 'website@example.com',
        to,
        replyTo: data.email,
        subject: 'New Test Drive Request',
        text: emailContent
      });
    } catch (emailError) {
      // A mail transport failure is not a booking: saying otherwise would
      // leave the visitor believing a drive is arranged when it is not.
      console.error('Test drive notification email failed:', emailError);
      return errorHandler.serverError(
        'The request could not be delivered. Please try again, or call the dealership.'
      );
    }

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
          next_action_date: startsAt,
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

      // Record the request durably.
      //
      // Until this existed a booking was emailed and then written to Postgres.
      // With no database configured the email arrived and the request was gone:
      // nothing listed it, nothing reminded Ed, and the customer believed they
      // had booked. A Blobs-backed queue makes the record survive independently
      // of the database, and it is what the admin calendar syncs from.
      //
      // Placed AFTER the database work on purpose: failing to record must never
      // turn a request the customer successfully made into an error they see.
      try {
        const bookingQueue = require('./booking-queue');
        const id = bookingQueue.makeId(leadData);
        await bookingQueue.record({
          id,
          status: 'new',
          vehicleId: leadData.vehicleId,
          vehicleTitle: leadData.vehicleTitle,
          fullName: leadData.fullName,
          email: leadData.email,
          phone: leadData.phone,
          preferredDate: leadData.preferredDate,
          preferredTime: leadData.preferredTime,
          comments: leadData.comments,
          createdAt: new Date().toISOString(),
        });
      } catch (queueError) {
        console.error('Could not record the request in the booking queue:', queueError);
      }

    // Return success
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, message: 'Test drive scheduled successfully' })
    };
  } catch (error) {
    console.error('Error scheduling test drive:', error);

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        success: false, 
        message: 'Failed to schedule test drive. Please try again later.' 
      })
    };
  }
};
