const inquiry = require('./utils/inquiry');
const errorHandler = require('./utils/error-handler');

const MIN_FILL_MS = 2000; // same threshold as the front-end timing gate

exports.handler = async function(event, context) {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return errorHandler.forbiddenError('Method not allowed');
  }

  // Parse the JSON body
  let data;
  try {
    data = JSON.parse(event.body);
  } catch (error) {
    return errorHandler.validationError('Invalid JSON in request body');
  }

  // Honeypot check: a field bots usually fill but humans never see
  if (data.website && String(data.website).trim() !== '') {
    return errorHandler.validationError('Submission rejected');
  }

  // Validate required fields and build field-level errors
  const { name, email, phone, message, formType } = data;
  const fieldErrors = {};

  if (!name || String(name).trim() === '') {
    fieldErrors.name = 'Name is required';
  }

  if (!email || String(email).trim() === '') {
    fieldErrors.email = 'Email is required';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fieldErrors.email = 'Please provide a valid email address';
  }

  if (!phone || String(phone).trim() === '') {
    fieldErrors.phone = 'Phone is required';
  } else {
    const digits = String(phone).replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15) {
      fieldErrors.phone = 'Please provide a valid phone number';
    }
  }

  // Simple timing gate: reject forms completed implausibly fast
  const startedAt = data.startedAt ? new Date(data.startedAt).getTime() : null;
  const submittedAt = data.submittedAt ? new Date(data.submittedAt).getTime() : null;
  const elapsed = startedAt && submittedAt ? submittedAt - startedAt : null;
  if (elapsed !== null && elapsed < MIN_FILL_MS) {
    return errorHandler.validationError('Submission rejected');
  }

  if (Object.keys(fieldErrors).length > 0) {
    return errorHandler.validationError('Please check the highlighted fields', fieldErrors);
  }

  try {
    // RECORD FIRST, THEN NOTIFY.
    //
    // This block chose a recipient -- defaulting to 'sales@caddyed.com', which
    // is a fabricated address and is not the one on this site -- and then, if
    // CRM_API_KEY happened to be set, wrote to an external CRM. With no CRM key
    // (the deployed state) NOTHING was written anywhere, and the only remaining
    // step was sendEmailNotification, which throws without SMTP and became a 500.
    //
    // So: a lead form submission on the deployed configuration was a 500 and no
    // record. utils/inquiry.js writes to THIS site's database first, always, and
    // then notifies -- to a real recipient resolved from the staff table or the
    // environment -- with the outcome reported rather than thrown.
    const outcome = await inquiry.submit('lead', {
      name: data.name,
      email: data.email,
      phone: data.phone,
      message: data.message || data.subject || null,
      subject: data.subject,
      vehicleTitle: data.vehicle || data.vehicleId || null,
      vehicleYear: data.year || null,
      vehicleMake: data.make || null,
      formType,
      source: 'website',
    });

    // The customer is told it is received, which is TRUE: the lead is a row in
    // this site's database and /admin/leads lists it.
    return errorHandler.createSuccessResponse(
      {
        submitted: new Date().toISOString(),
        leadId: outcome.id,
        notified: outcome.notified,
        notifyReason: outcome.notifyReason || null
      },
      'Thank you — your details have been sent and Ed will be in touch shortly.'
    );
  } catch (error) {
    console.error('Error processing lead form submission:', error);
    return errorHandler.serverError('Error processing form submission', error);
  }
};

// sendEmailNotification and saveToCRM -- DELETED.
//
// Both were unreachable once the handler started calling utils/inquiry.js, and
// both were a hazard rather than dead weight:
//
//   * sendEmailNotification called `nodemailer.createTransport`, but nodemailer
//     is no longer required at module scope -- deliberately, so a function can
//     load on a deployment with no mail configured. That makes this function a
//     ReferenceError waiting to happen: it reads as working, it is referenced
//     by name in a comment above, and the moment somebody wires it back up to
//     "fix notifications" every lead 500s.
//   * It also threw `new Error('SMTP is not configured')` on a deployment with
//     no SMTP, which is the exact failure that destroyed all three enquiry
//     forms. utils/inquiry.js reports that state; this one treated it as fatal.
//   * saveToCRM posted to `process.env.CRM_API_ENDPOINT` with no guard for it
//     being undefined, and CRM_API_KEY is not configured. It swallowed its own
//     errors, so it would have looked like it worked.
//
// The notification path is now one thing, in one file, with one recipient
// resolver. See utils/inquiry.js.
