/**
 * schedule-appointment -- a SERVICE appointment, from a signed-in customer's
 * portal.
 *
 * WHY THIS FILE HAD TO BE WRITTEN
 * -------------------------------
 * site/assets/js/customer-portal.js has posted to
 * `/.netlify/functions/schedule-appointment` since the portal was built. No such
 * function has ever existed in this repository. The call has always returned 404,
 * and the portal handled that by showing an error to a customer who had already
 * chosen a date and time.
 *
 * It was declared in ci/verify-endpoints.js as KNOWN_MISSING rather than quietly
 * deleted, which was the right call -- a visible broken promise beats an absent
 * form. But a promise that is permanently broken is still broken, and this is
 * the last customer-facing endpoint that goes nowhere. It needed a function, not
 * another note.
 *
 * WHY IT IS NOT schedule-test-drive.js
 * -----------------------------------
 * The two are different jobs and conflating them would put a service visit in
 * the same queue as a drive, where nobody can tell them apart.
 *
 *   schedule-test-drive  a customer picks a specific car off the lot
 *   schedule-appointment an EXISTING customer books work on a car they own
 *
 * schedule-test-drive.js also reads a different set of field names
 * (fullName/email/phone/preferredDate/preferredTime) because it is posted to
 * from the vehicle page, which prefills the stock number. This one receives
 * customer_id/customer_name/customer_email/scheduled_date/scheduled_time,
 * because the portal already knows who is signed in.
 *
 * So it maps its own fields and shares everything else: the record, the
 * notification, the booking id and the honest report of whether an email was
 * sent all come from utils/inquiry.js, which is the single place that knows the
 * record must not depend on the notification succeeding.
 *
 * RECORDED WHERE A REP WILL SEE IT
 * --------------------------------
 * booking_requests, with vehicle_id left blank and vehicle_title carrying the
 * service type -- "Service: oil change", not a car. That is the table
 * /admin/bookings reads and the calendar syncs from, which is the whole reason a
 * booking request has to land there and not in a mail server's memory.
 */

'use strict';

const inquiry = require('./utils/inquiry');
const errorHandler = require('./utils/error-handler');

/** A date must be real, and must not be in the past. */
function isAcceptableDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return false;
  // Midnight local, so a visit booked for today is allowed right up until the
  // day rolls over. Comparing against a bare `new Date()` would reject this
  // morning's remaining slots every morning.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return parsed >= today;
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return errorHandler.forbiddenError('Method not allowed');
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return errorHandler.validationError('Invalid JSON in request body');
  }

  const fieldErrors = {};
  if (!body.customer_id) fieldErrors.customer_id = 'Sign in again to book';
  if (!body.customer_name) fieldErrors.customer_name = 'Name is required';
  if (!body.customer_email) fieldErrors.customer_email = 'Email is required';
  if (!isAcceptableDate(body.scheduled_date)) {
    fieldErrors.scheduled_date = 'Choose today or a later date';
  }
  if (!/^\d{2}:\d{2}$/.test(String(body.scheduled_time || ''))) {
    fieldErrors.scheduled_time = 'Choose a time';
  }
  if (Object.keys(fieldErrors).length) {
    return errorHandler.validationError('Please check the highlighted fields', fieldErrors);
  }

  try {
    // Same order as every other form on this site: write the record first, then
    // notify, and let the notification fail on its own. An unreachable mail
    // server must never cost a customer their booking.
    //
    // `vehicleId` is deliberately empty -- this is service work on a car the
    // customer already owns, not a car off the lot, and putting a stock number
    // here would make the booking look like a test drive to whoever reads it.
    const outcome = await inquiry.submit('booking', {
      name: body.customer_name,
      email: body.customer_email,
      phone: body.customer_phone || '',
      vehicleId: '',
      vehicleTitle: `Service: ${body.type || 'appointment'}`,
      preferredDate: body.scheduled_date,
      preferredTime: body.scheduled_time,
      comments: body.notes || '',
      pageUrl: body.pageUrl || '/customer-portal/',
      subject: 'New service appointment request',
    });

    if (outcome.fatal) {
      // No database, so no system of record. A success here would be a lie.
      console.error('[schedule-appointment] could not record: ' + outcome.reason);
      return {
        statusCode: 503,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          message: 'We could not save that booking just now. Please call us instead.',
        }),
      };
    }

    return errorHandler.createSuccessResponse(
      {
        appointmentId: outcome.id,
        // Reported, not swallowed: the portal can show "we have it" honestly,
        // and an operator can tell a working mail path from a dead one without
        // reading logs.
        notified: outcome.notified,
        notifyReason: outcome.notifyReason || null,
      },
      'Appointment scheduled successfully!'
    );
  } catch (error) {
    console.error('Error scheduling appointment:', error);
    return errorHandler.serverError('Could not schedule the appointment. Please try again.');
  }
};