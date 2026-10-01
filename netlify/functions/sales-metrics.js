/**
 * sales-metrics -- returns performance metrics for a sales rep.
 *
 * WHY THIS EXISTS
 * ---------------
 * site/assets/js/salesTeam.js calls this to show each rep's numbers. It used
 * to call /api/sales-metrics/<id>, which did not exist, so the metrics panel
 * on each member's card was always empty.
 *
 * There is no metrics data anywhere -- no database, no analytics feed -- so
 * this returns zeros. That is the honest answer: nobody has measured anything
 * yet. When real numbers exist, replace the body with a query.
 */

'use strict';

const { authenticateRequest } = require('./utils/auth-middleware');
const { originHeaders } = require('./utils/cors-middleware');

/**
 * @param {Object} event - Netlify function event
 * @returns {Object} response with CORS headers and a JSON body
 */
exports.handler = async (event) => {
  const headers = originHeaders(event, 'GET, OPTIONS');

  // STAFF ONLY.
  //
  // This used to answer anyone, and used to be reachable from the public about
  // page via site/assets/js/salesTeam.js. That page section was removed upstream
  // (cdb8a04 -- the page's own copy says there is one person, and the team filter
  // advertised a search box for a list of one), so the only remaining caller is
  // site/assets/js/salesDashboard.js on /admin/dashboard, which already sends a
  // staff token via getAuthHeaders().
  //
  // The zeros below are why this was left open without looking like a mistake:
  // there is genuinely nothing to steal yet. That is an accident of the feature
  // being unimplemented, not a property of the endpoint. The moment anybody
  // implements this -- and "a sales rep's lead count and revenue" is the obvious
  // first thing to implement -- an unauthenticated read becomes staff performance
  // data on the open internet. So the guard goes on now, while it costs nothing.
  const auth = await authenticateRequest(event, {
    requireAuth: true,
    allowedRoles: ['admin', 'manager', 'sales_rep'],
  });
  if (!auth.authenticated) {
    return {
      statusCode: auth.error?.statusCode || 401,
      headers,
      body: JSON.stringify({ error: 'Sign in to view sales metrics' }),
    };
  }

  const memberId = event.path.split('/').pop();

  return {
    statusCode: 200,
    headers: { ...headers, 'Cache-Control': 'no-store' },
    body: JSON.stringify({
      memberId: memberId,
      // All zeros. There is no metrics data anywhere yet.
      totalLeads: 0,
      convertedLeads: 0,
      totalSales: 0,
      revenue: 0,
      source: 'none'
    })
  };
};
