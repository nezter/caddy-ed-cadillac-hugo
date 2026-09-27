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

/**
 * @param {Object} event - Netlify function event
 * @returns {Object} response with CORS headers and a JSON body
 */
exports.handler = async (event) => {
  const memberId = event.path.split('/').pop();

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store'
    },
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
