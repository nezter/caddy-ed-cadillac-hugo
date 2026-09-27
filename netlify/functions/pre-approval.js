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
 * When a lender API lands, replace the body with a real submission and return
 * the lender's confirmation number.
 */

'use strict';

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

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify({
      // There is no lender integration yet, so this is NOT a real confirmation
      // number. The modal must not display it as one.
      received: true,
      processed: false,
      message: 'Application received. There is no lender integration yet, so this has not been submitted to a lender.',
      confirmationNumber: null
    })
  };
};
