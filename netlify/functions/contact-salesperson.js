/**
 * contact-salesperson -- the sales directory, and the form on each person's card.
 *
 * WHY THIS EXISTS
 * ---------------
 * site/assets/js/salesTeam.js calls this to list who works here. It used to call
 * /api/contact-salesperson, which did not exist, so the contact form on each team
 * member's card had nobody to submit to.
 *
 * There is one sales specialist, not a team, so the directory has one entry.
 * The phone and email are read from site params by the caller; this returns
 * only the identity of the person and the channels that reach them.
 *
 * When there is more than one person, replace the single entry with a query
 * against whatever stores the directory.
 *
 * IT ALSO ANSWERED THE FORM WITH THE DIRECTORY. READ THIS.
 * ------------------------------------------------------
 * The old handler took no arguments. It did not look at `event.httpMethod` and it
 * never read `event.body`. So:
 *
 *     fetch('/.netlify/functions/contact-salesperson', { method: 'POST', body: formData })
 *
 * was answered, with a 200, by a function that returns a hardcoded array. The
 * client did not check the status -- it rendered on any 200 -- and told the
 * customer:
 *
 *     Thank you for contacting Caddy Ed. They will get back to you shortly.
 *
 * Nothing was sent. Nothing was stored. No email, no lead, no row, no log. The
 * message was a hardcoded string in the browser.
 *
 * This is the worst version of the defect the rest of this project has been
 * fixing, because the other ones at least involved an email that failed to send.
 * Here there was no channel to fail. A customer who used the form on the person
 * card -- the most personal contact path on the site -- believed they had left a
 * message, and the business had received nothing at all.
 *
 * So it does both jobs now, and says which one it is doing.
 */

'use strict';

const inquiry = require('./utils/inquiry');

// The one telephone number for this business.
//
// It used to be '+17045557890' -- (704) 555-7890, a fiction number. The
// placeholder-contact sweep caught that string in the header and footer of all
// 67 pages and replaced 244 tel: links with one partial, but it reads the BUILT
// HTML, and this value is produced at runtime by a function. So it survived the
// fix that was meant to remove it, and the team card would have dialled a number
// that belongs to nobody while every other page on the site dialled correctly.
//
// Same class as `sales@caddyed.com`, `info@caddyed.com` and
// `leads@cadillacofsouthcharlotte.com`: a value that looks configured, and is
// not. The gate cannot see this one; the value has to be right.
const SALES_PHONE = '+18034316180';

/** The directory. Public by design -- it is the "contact us" page. */
function directory(event) {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify({
      members: [
        {
          id: 'caddy-ed',
          name: 'Caddy Ed',
          position: 'Sales Specialist',
          // The website has one sales specialist. The contact form on each
          // member's card submits here; until there are more people this is
          // the only entry.
          phone: SALES_PHONE,
          email: 'ed@caddyed.com'
        }
      ],
      source: 'static'
    })
  };
}

exports.handler = async function (event) {
  // OPTIONS, so a cross-origin form POST is not blocked in the browser before it
  // ever reaches the handler below.
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: ''
    };
  }

  if (event.httpMethod === 'GET') return directory(event);

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: 'Method not allowed' })
    };
  }

  // Parse the body. The client sends multipart FormData, which is what it
  // always sent, so fall back to a lenient read rather than a JSON.parse that
  // would throw on the first submission and lose the enquiry for a formatting
  // reason.
  let body = {};
  const raw = event.body || '';
  const isFormData = (event.headers && event.headers['content-type'] || '').includes('multipart/form-data');
  const isUrlEncoded = (event.headers && event.headers['content-type'] || '').includes('application/x-www-form-urlencoded');

  if (isFormData || isUrlEncoded) {
    try {
      const params = new URLSearchParams(isUrlEncoded ? raw : '');
      if (isUrlEncoded) params.forEach((v, k) => { body[k] = v; });
      if (isFormData) {
        // No multipart parser available without a dependency. Pull the fields out
        // of the raw body instead: they arrive as name="value" parts, and the
        // enquiry only needs a handful of short fields.
        const re = /name="([^"]+)"\r?\n\r?\n([\s\S]*?)\r?\n--/g;
        let m;
        while ((m = re.exec(raw)) !== null) body[m[1]] = m[2];
      }
    } catch (parseError) {
      console.error('[contact-salesperson] could not parse the submitted form:', parseError.message);
    }
  } else {
    try {
      body = JSON.parse(raw || '{}');
    } catch (e) {
      body = {};
    }
  }

  const name = body.name || body.member_name || '';
  const email = body.email || '';
  const message = body.message || body.comment || '';
  const memberName = body.memberName || body.member_name_display || 'Caddy Ed';

  if (!name || !email) {
    // Refusing is correct, and saying so is correct: an enquiry with no name and
    // no email cannot be followed up, so pretending to accept it would recreate
    // the original problem in a new place.
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: 'Name and email are required',
        fieldErrors: { name: !name ? 'Name is required' : undefined, email: !email ? 'Email is required' : undefined }
      })
    };
  }

  try {
    // Record first, notify second -- the same order as every other form on this
    // site. See utils/inquiry.js.
    const outcome = await inquiry.submit('lead', {
      name: name,
      email: email,
      phone: body.phone || '',
      message: message,
      formType: 'contact_salesperson',
      source: 'team_card',
      subject: `Website enquiry for ${memberName}`,
    });

    if (outcome.fatal) {
      console.error('[contact-salesperson] could not record: ' + outcome.reason);
      return {
        statusCode: 503,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          message: 'We could not send that just now. Please call us on the number on this page.'
        })
      };
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: true,
        // Real id, from the row that was actually written.
        leadId: outcome.id,
        notified: outcome.notified,
        notifyReason: outcome.notifyReason || null,
        message: 'Thank you. Your message has been recorded and someone will be in touch.'
      })
    };
  } catch (error) {
    console.error('[contact-salesperson] failed:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        message: 'We could not send that just now. Please call us on the number on this page.'
      })
    };
  }
};