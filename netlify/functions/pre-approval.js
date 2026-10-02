/**
 * pre-approval -- receives a financing pre-approval application.
 *
 * WHY THIS EXISTS
 * ---------------
 * The financing calculator's pre-approval modal posts here. It used to call
 * /api/pre-approval, which did not exist, so a visitor who filled in the full
 * loan application saw either a silent failure or a fake confirmation.
 *
 * There is no lender integration yet, so this cannot actually submit an
 * application anywhere. It returns an honest "received, not processed" response
 * rather than pretending the application was sent to a lender.
 *
 * It now RECORDS the application to this site's database via utils/inquiry.js,
 * even though it still cannot submit it to a lender. Those are separate claims
 * and only the second one is currently untrue -- and an application that is
 * honestly "not processed by a lender" but has also been silently discarded is
 * not honest, it is just quieter than a 500. Someone filling in a credit
 * pre-approval is the warmest lead this site can capture.
 *
 * When a lender API lands, add the real submission and return the lender's
 * confirmation number. Keep the record here too; the dealer database should not
 * depend on a third party being reachable.
 */

'use strict';

const inquiry = require('./utils/inquiry');

/**
 * @param {Object} event - Netlify function event
 * @returns {Object} response with CORS headers and a JSON body
 */
exports.handler = async function (event) {
  let body = {};
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch {
    // A malformed body is the caller's mistake, not a server fault.
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Invalid JSON body' })
    };
  }

  // Bot gate: honeypot, minimum fill time, and reCAPTCHA when a secret is
  // configured. Shared with every public form endpoint; see utils/bot-gate.js.
  const gate = await require('./utils/bot-gate').check(body);
  if (!gate.pass) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Submission rejected' })
    };
  }

  // Validate the minimum required fields.
  const required = ['firstName', 'lastName', 'email', 'phone'];
  const missing = required.filter((f) => !body[f]);
  if (missing.length) {
    return {
      statusCode: 422,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Missing required fields', fields: missing })
    };
  }

  // RECORDED -- because "we did not submit this to a lender" and "we threw your
  // application away" are different sentences and only one of them was true.
  //
  // This handler used to return `{received: true, processed: false}` and stop.
  // Which is honest about the missing lender integration -- and then quietly
  // discarded a credit pre-approval application, with the customer's name, email
  // and phone, having written nothing anywhere. No row, no log, no admin view.
  //
  // A pre-approval is the warmest lead this site can capture. Somebody has given
  // their name, number and email on the promise of a car, and the answer to
  // "should I go through with it?" is a lead the dealership cannot see.
  //
  // So the honesty is kept exactly as it was -- there is still no lender
  // integration and this is still not a confirmation number -- and the record is
  // added through utils/inquiry.js, the same path every other form uses.
  // Built from whatever the form actually sent, and skipped when blank --
  // inquiry.summarise() drops empty values, so this does not produce a wall of
  // "Down payment: undefined".
  const finance = [
    ['Vehicle', body.vehicle || body.vehicleId],
    ['Down payment', body.downPayment],
    ['Trade in', body.tradeIn],
    ['Credit score band', body.creditRange || body.creditScore],
    ['Notes', body.notes || body.message],
  ]
    .filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '')
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');

  const outcome = await inquiry.submit('lead', {
    name: `${body.firstName} ${body.lastName}`,
    email: body.email,
    phone: body.phone,
    // The finance figures go in the message because they are the whole point of
    // the enquiry: an admin reading this lead should not have to ask why the
    // person called, or ring them back to find out.
    message: finance || body.notes || body.message || 'Pre-approval enquiry',
    formType: 'pre_approval',
    source: 'pre_approval_form',
    vehicleTitle: body.vehicle || body.vehicleId || null,
    subject: 'New pre-approval enquiry',
  });

  if (outcome.fatal) {
    // No database, so no system of record, so "received" would be a lie.
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        error: 'We could not save your application. Please call us and we will take the details.',
        received: false,
        processed: false
      })
    };
  }

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify({
      received: true,
      processed: false,
      // Unchanged and still true: no lender integration.
      message: 'Application received. There is no lender integration yet, so this has not been submitted to a lender.',
      confirmationNumber: null,
      // So the client can say "we have it" honestly, and an operator can tell a
      // working mail path from a dead one.
      leadId: outcome.id,
      notified: outcome.notified,
      notifyReason: outcome.notifyReason || null
    })
  };
};
