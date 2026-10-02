/**
 * submission-created -- Netlify form submissions land in the same admin the
 * rest of the enquiries do.
 *
 * WHAT THIS IS
 * ------------
 * Not an HTTP endpoint. "submission-created" is a Netlify EVENT function: the
 * platform invokes it with the verified submission whenever a Netlify Form on
 * this site is submitted, and it is never served at a URL. The stock-alerts
 * signup on the home page is the Netlify Form this site has; every other form
 * posts to a function directly and records itself.
 *
 * WHY IT EXISTS
 * -------------
 * A Netlify Form submission used to live only in Netlify's own dashboard. Ed
 * manages enquiries in /admin, and a signup that exists only somewhere else is
 * a signup he will never see. This records it into the same leads table
 * /admin/leads reads and reports the outcome in the function log.
 *
 * FAILURE POLICY
 * --------------
 * Always answers 200. A non-2xx makes Netlify retry the event, and a retry
 * would duplicate the lead; the record either happened (logged) or it did not
 * (also logged). Nothing here may fail the platform's delivery.
 */

'use strict';

const inquiry = require('./utils/inquiry');

exports.handler = async function (event) {
  let payload = null;
  try {
    const outer = JSON.parse(event.body || '{}');
    payload = outer.payload || outer;
  } catch (err) {
    console.log('[submission-created] unparseable event body:', err.message);
    return { statusCode: 200, body: 'ignored' };
  }

  const data = (payload && payload.data) || {};
  const formName = (payload && payload.form_name) || data['form-name'] || 'netlify-form';
  const email = data.email || '';
  const name = data.name || '';

  if (!email) {
    console.log('[submission-created] ' + formName + ': no email in the submission; nothing recorded.');
    return { statusCode: 200, body: 'no-email' };
  }

  const outcome = await inquiry.submit('lead', {
    name: name || 'Stock-alert subscriber',
    email,
    phone: data.phone || '',
    message: data.message || 'Submitted the "' + formName + '" form on the website.',
    formType: formName,
    source: 'netlify-form',
  });

  console.log(
    '[submission-created] ' + formName + ' from ' + email + ': ' +
    (outcome.recorded ? 'recorded as ' + outcome.id : 'NOT recorded (' + (outcome.reason || 'unknown') + ')') + '. ' +
    (outcome.notified ? 'Notified.' : 'Not emailed (' + (outcome.notifyReason || outcome.reason || 'unknown') + ').')
  );

  return { statusCode: 200, body: 'recorded' };
};
