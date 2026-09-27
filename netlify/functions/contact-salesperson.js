/**
 * contact-salesperson -- returns the sales team directory.
 *
 * WHY THIS EXISTS
 * ---------------
 * site/assets/js/salesTeam.js calls this to list who works here. It used to
 * call /api/contact-salesperson, which did not exist, so the contact form on
 * each team member's card had nobody to submit to.
 *
 * There is one sales specialist, not a team, so the directory has one entry.
 * The phone and email are read from site params by the caller; this returns
 * only the identity of the person and the channels that reach them.
 *
 * When there is more than one person, replace the single entry with a query
 * against whatever stores the directory.
 */

'use strict';

/**
 * @param {Object} event - Netlify function event
 * @returns {Object} response with CORS headers and a JSON body
 */
exports.handler = async function () {
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
          phone: '+17045557890',
          email: 'ed@caddyed.com'
        }
      ],
      source: 'static'
    })
  };
};
