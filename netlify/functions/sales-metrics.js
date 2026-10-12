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
const DatabaseService = require('./utils/database-service');
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

  // The dashboard calls this with ?salesId=<rep id>&timeframe=... ; older
  // callers read the path. Both are honoured.
  const memberId =
    (event.queryStringParameters && event.queryStringParameters.salesId) ||
    event.path.split('/').pop();
  const timeframe = (event.queryStringParameters && event.queryStringParameters.timeframe) || 'week';
  const windowDays = timeframe === 'month' ? 30 : timeframe === 'all' ? 0 : 7;

  const metrics = {
    memberId,
    // Fields the dashboard renders (salesDashboard.js renderSalesMetrics).
    newLeads: 0,
    appointments: 0,
    sales: 0,
    conversionRate: '0%',
    // Kept for callers that read the earlier names.
    totalLeads: 0,
    convertedLeads: 0,
    totalSales: 0,
    revenue: 0,
    source: 'unconfigured',
  };

  if (DatabaseService.isDatabaseConfigured()) {
    const cutoff = windowDays > 0 ? ` AND created_at >= datetime('now', '-${windowDays} days')` : '';
    const scoped = memberId && memberId !== 'sales-metrics' && memberId !== 'overview';

    try {
      const leadSql =
        'SELECT COUNT(*) AS n,' +
        " SUM(CASE WHEN status = 'converted' THEN 1 ELSE 0 END) AS c," +
        " SUM(CASE WHEN status = 'converted' THEN COALESCE(CAST(conversion_value AS REAL), 0) ELSE 0 END) AS v" +
        ' FROM leads WHERE 1=1' +
        (scoped ? ' AND assigned_sales_rep_id = $1' : '') +
        cutoff;
      const leadRes = await DatabaseService.query(leadSql, scoped ? [String(memberId)] : []);
      const n = Number(leadRes.rows[0].n) || 0;
      const cCount = Number(leadRes.rows[0].c) || 0;
      const v = Number(leadRes.rows[0].v) || 0;
      metrics.newLeads = n;
      metrics.totalLeads = n;
      metrics.sales = cCount;
      metrics.totalSales = cCount;
      metrics.convertedLeads = cCount;
      metrics.revenue = v;
      metrics.conversionRate = n > 0 ? Math.round((cCount / n) * 100) + '%' : '0%';
      metrics.source = 'live';
    } catch (error) {
      console.error('[sales-metrics] lead query failed:', error.message);
      metrics.source = 'error';
    }

    try {
      const apptSql =
        'SELECT COUNT(*) AS n FROM appointments WHERE 1=1' +
        (scoped ? ' AND assigned_sales_rep_id = $1' : '') +
        cutoff;
      const apptRes = await DatabaseService.query(apptSql, scoped ? [String(memberId)] : []);
      metrics.appointments = Number(apptRes.rows[0].n) || 0;
    } catch (error) {
      // Appointments stay 0; the leads numbers above are still real.
      console.error('[sales-metrics] appointment query failed:', error.message);
    }
  }

  return {
    statusCode: 200,
    headers: { ...headers, 'Cache-Control': 'no-store' },
    body: JSON.stringify(metrics)
  };
};
