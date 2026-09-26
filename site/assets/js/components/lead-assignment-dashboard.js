/**
 * lead-assignment-dashboard.js
 *
 * Rep assignment console for /admin/lead-assignment.
 *
 * Endpoints (netlify/functions/lead-assignments.js, all behind
 * `authenticateRequest`, so all four can answer 401 or 403):
 *
 *   GET  /.netlify/functions/lead-assignments/analytics?days=30
 *        -> data: { analytics: { totalAssignments, averageAssignmentScore,
 *             assignmentsByReason, repWorkloadDistribution, reassignmentRate },
 *             period }
 *   GET  /.netlify/functions/lead-assignments/unassigned?limit=50
 *        -> data: { leads: [ { id, firstName, lastName, email, phone,
 *             vehicleInterest, source, score, createdAt, priority } ], total, limit }
 *   GET  /.netlify/functions/lead-assignments/reps
 *        -> data: { reps: [ { id, name, email, role, capacity } ], total }
 *   POST /.netlify/functions/lead-assignments/assign   { leadId, salesRepId, reason }
 *        -> data: { message, leadId, assignedTo: { id, name, email }, assignmentReason }
 *   POST /.netlify/functions/lead-assignments/rebalance
 *        -> data: { message, results: { totalProcessed, reassigned, errors } }
 *
 * The contract mismatches this replaces, all of which produced a page that
 * looked like it had data and did not:
 *
 *   1. `analyticsData.analytics`, `unassignedData.leads`,
 *      `result.results.reassigned`, `result.assignedTo.name` were all read off
 *      the top level of the body. Every success body is
 *      `{ success, message, data, timestamp }`, so each of those was
 *      `undefined` and every consumer silently fell through to its `|| 0` or
 *      `?.` default. They are read from `data` now.
 *   2. `analytics.repWorkload` and `analytics.averageScore` do not exist.
 *      LeadAssignmentService.getAssignmentAnalytics renames them to
 *      `repWorkloadDistribution` and `averageAssignmentScore`
 *      (lead-assignment-service.js:356-361). The workload list therefore
 *      always rendered "No workload data available".
 *   3. Lines 41-45 replaced the rep roster with three invented people
 *      ("John Smith", "Sarah Johnson", "Mike Davis"). Those are not staff at
 *      caddyed.com; assigning a lead to them wrote a foreign `sales_rep_id`
 *      into the leads table. The roster now comes from the real
 *      `GET /reps` route, which reads sales_reps. With no reps configured the
 *      assignment controls render disabled and say so.
 *   4. `getAuthToken()` returned the literal string 'demo-token' when
 *      localStorage was empty, so the GETs went out unauthenticated and died
 *      on 401; the "Unassigned Leads (0)" that resulted was a failed request
 *      wearing a success label.
 *   5. The manual-assignment form read its fields with
 *      `new FormData(form)`, but the three <select>s have no `name`
 *      attributes, so every value came back null and the server answered
 *      "Missing required fields".
 *
 * Charts: `new Chart(...)` was called against a global nothing in this repo
 * loads (Chart.js is not a dependency and no layout includes it), so
 * renderCharts threw. The distribution is plain markup instead, with a real
 * table for the numbers.
 */

const ASSIGNMENTS_API = '/.netlify/functions/lead-assignments';

// The staff sign-in page, /admin/sign-in (content/admin/sign-in.md). One
// constant, so a rename is a one-line change in three files.
const SIGN_IN_URL = '/admin/sign-in/';

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeHtml(value) {
  return String(value === null || value === undefined ? '' : value).replace(
    /[&<>"']/g,
    (char) => ESCAPES[char]
  );
}

/** Bearer token as written by utils/session-manager.js after a staff login. */
function authHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  try {
    const token = window.localStorage.getItem('auth_token');
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    // Storage disabled: fall through, the 401 handler renders sign-in.
  }
  return headers;
}

/**
 * @returns {Promise<{ok:true,data:any}|{ok:false,kind:'auth'|'http'|'network',message:string}>}
 */
async function callApi(url, options) {
  const opts = options || {};
  let response;
  try {
    response = await fetch(url, {
      credentials: 'same-origin',
      method: opts.method || 'GET',
      headers: Object.assign(authHeaders(), opts.headers || {}),
      body: opts.body
    });
  } catch {
    return {
      ok: false,
      kind: 'network',
      message: 'Could not reach the server. Check your connection, then retry.'
    };
  }

  if (response.status === 401 || response.status === 403) {
    return {
      ok: false,
      kind: 'auth',
      message:
        response.status === 403
          ? 'Your account is signed in but lacks the assignments_read permission.'
          : 'Sign in to manage lead assignments.'
    };
  }

  let body = null;
  try {
    body = await response.json();
  } catch {
    // Non-JSON on an error status is a proxy page, not this function.
  }

  if (!response.ok || (body && body.success === false)) {
    return {
      ok: false,
      kind: 'http',
      message: (body && body.message) || 'Request failed (HTTP ' + response.status + ').'
    };
  }

  // { success, message, data, timestamp } -- payload is one level down.
  return { ok: true, data: body ? body.data : null };
}

const REASONS = [
  { value: 'manual_assignment', label: 'Manual assignment' },
  { value: 'specialist_request', label: 'Specialist request' },
  { value: 'territory_realignment', label: 'Territory realignment' },
  { value: 'workload_balance', label: 'Workload balance' }
];

class LeadAssignmentDashboard {
  constructor(root) {
    this.root = root;
    this.analytics = null;
    this.leads = [];
    this.reps = [];
    this.periodDays = 30;
    this.signInRequired = false;
    this.error = null;
    this.notice = null;
  }

  async start() {
    this.renderShell();
    await this.load();
  }

  // --- shell ---------------------------------------------------------------

  renderShell() {
    this.root.innerHTML = `
      <div class="lead-assign">
        <div class="lead-assign__toolbar">
          <div class="lead-assign__timeframe">
            <label for="lead-assign-days">Period</label>
            <select id="lead-assign-days" class="select">
              <option value="7">Last 7 days</option>
              <option value="30" selected>Last 30 days</option>
              <option value="90">Last 90 days</option>
            </select>
          </div>
          <div class="lead-assign__toolbar-actions">
            <button type="button" class="btn btn-secondary" data-action="refresh">Refresh</button>
            <button type="button" class="btn btn-primary" data-action="rebalance">Rebalance assignments</button>
          </div>
        </div>
        <div id="lead-assign-notice" role="status" aria-live="polite"></div>
        <div id="lead-assign-state" role="status" aria-live="polite"></div>
        <div id="lead-assign-body"></div>
      </div>
    `;

    this.noticeRegion = this.root.querySelector('#lead-assign-notice');
    this.stateRegion = this.root.querySelector('#lead-assign-state');
    this.bodyRegion = this.root.querySelector('#lead-assign-body');

    this.root.querySelector('#lead-assign-days').addEventListener('change', (event) => {
      this.periodDays = Number(event.target.value) || 30;
      this.load();
    });

    this.root.querySelector('[data-action="refresh"]').addEventListener('click', () => this.load());

    this.root
      .querySelector('[data-action="rebalance"]')
      .addEventListener('click', () => this.rebalance());
  }

  // --- load ----------------------------------------------------------------

  async load() {
    this.setBusy('Loading assignments...');

    const [analytics, unassigned, reps] = await Promise.all([
      callApi(ASSIGNMENTS_API + '/analytics?days=' + encodeURIComponent(this.periodDays)),
      callApi(ASSIGNMENTS_API + '/unassigned?limit=50'),
      callApi(ASSIGNMENTS_API + '/reps')
    ]);

    // Any 401/403 anywhere means the whole page is behind the wall; there is no
    // partial-unauthenticated view to fall back to.
    const authFailure = [analytics, unassigned, reps].find((r) => !r.ok && r.kind === 'auth');
    if (authFailure) {
      this.analytics = null;
      this.leads = [];
      this.reps = [];
      this.signInRequired = true;
      this.error = authFailure.message;
      this.render();
      return;
    }

    const failure = [analytics, unassigned, reps].find((r) => !r.ok);
    if (failure) {
      this.analytics = null;
      this.leads = [];
      this.reps = [];
      this.signInRequired = false;
      this.error = failure.message;
      this.render();
      return;
    }

    this.analytics = (analytics.data && analytics.data.analytics) || {};
    this.leads = (unassigned.data && unassigned.data.leads) || [];
    this.reps = (reps.data && reps.data.reps) || [];
    this.signInRequired = false;
    this.error = null;
    this.render();
  }

  setBusy(message) {
    this.stateRegion.innerHTML =
      '<div class="lead-assign__state"><span class="lead-assign__spinner" aria-hidden="true"></span><p>' +
      escapeHtml(message) +
      '</p></div>';
    this.bodyRegion.innerHTML = '';
  }

  // --- render --------------------------------------------------------------

  render() {
    this.stateRegion.innerHTML = '';

    if (this.signInRequired) {
      this.bodyRegion.innerHTML = '';
      this.stateRegion.innerHTML = `
        <div class="lead-assign__state lead-assign__state--auth">
          <h2>Sign in required</h2>
          <p>${escapeHtml(this.error)}</p>
          <a class="btn btn-primary" href="${SIGN_IN_URL}">Go to sign in</a>
        </div>
      `;
      return;
    }

    if (this.error) {
      this.bodyRegion.innerHTML = '';
      this.stateRegion.innerHTML = `
        <div class="lead-assign__state lead-assign__state--error">
          <h2>Could not load lead assignments</h2>
          <p>${escapeHtml(this.error)}</p>
          <button type="button" class="btn btn-primary" data-action="retry">Retry</button>
        </div>
      `;
      this.stateRegion.querySelector('[data-action="retry"]').addEventListener('click', () => this.load());
      return;
    }

    const analytics = this.analytics || {};
    const reasons = Array.isArray(analytics.assignmentsByReason) ? analytics.assignmentsByReason : [];
    const workload = Array.isArray(analytics.repWorkloadDistribution)
      ? analytics.repWorkloadDistribution
      : [];

    this.bodyRegion.innerHTML = `
      <div class="lead-assign__stats">
        ${this.renderStat('Assignments', formatNumber(analytics.totalAssignments))}
        ${this.renderStat('Avg assignment score', formatNumber(analytics.averageAssignmentScore))}
        ${this.renderStat('Reassignment rate', num(analytics.reassignmentRate) + '%')}
        ${this.renderStat('Awaiting assignment', formatNumber(this.leads.length))}
      </div>

      <div class="lead-assign__grid">
        <section class="card lead-assign__panel">
          <h2 class="card__title">Sales rep workload</h2>
          ${this.renderWorkload(workload)}
        </section>

        <section class="card lead-assign__panel">
          <h2 class="card__title">Assignments by reason</h2>
          ${
            reasons.length === 0
              ? '<p class="lead-assign__empty">No assignment reasons recorded in this period.</p>'
              : this.renderReasonTable(reasons)
          }
        </section>
      </div>

      <section class="card lead-assign__panel">
        <h2 class="card__title">Leads awaiting assignment (${this.leads.length})</h2>
        ${this.renderUnassigned()}
      </section>

      <section class="card lead-assign__panel">
        <h2 class="card__title">Assign a lead manually</h2>
        ${this.renderAssignForm()}
      </section>
    `;

    this.bindBody();
  }

  renderStat(label, value) {
    return `
      <div class="lead-assign__stat">
        <span class="lead-assign__stat-value">${escapeHtml(value)}</span>
        <span class="lead-assign__stat-label">${escapeHtml(label)}</span>
      </div>
    `;
  }

  renderWorkload(rows) {
    if (rows.length === 0) {
      return '<p class="lead-assign__empty">No active sales reps are on file, so there is no workload to show.</p>';
    }

    return `
      <ul class="lead-assign__workload">
        ${rows
          .map((row) => {
            const leadCount = num(row.lead_count);
            const capacity = num(row.capacity) || 10;
            const pct = Math.max(0, Math.min(100, (leadCount / capacity) * 100));
            return `
              <li class="lead-assign__workload-row">
                <span class="lead-assign__workload-name">${escapeHtml(String(row.rep_name || 'Unnamed rep'))}</span>
                <span class="lead-assign__workload-track">
                  <span class="lead-assign__workload-fill" style="inline-size:${pct.toFixed(1)}%"></span>
                </span>
                <span class="lead-assign__workload-value">${formatNumber(leadCount)} / ${formatNumber(capacity)}</span>
              </li>
            `;
          })
          .join('')}
      </ul>
    `;
  }

  renderReasonTable(rows) {
    const peak = rows.reduce((max, row) => Math.max(max, num(row.count)), 0) || 1;

    return `
      <ul class="lead-assign__reasons">
        ${rows
          .map((row) => {
            const count = num(row.count);
            const pct = (count / peak) * 100;
            return `
              <li class="lead-assign__reason">
                <span class="lead-assign__reason-label">${escapeHtml(String(row.assignment_reason || 'unspecified'))}</span>
                <span class="lead-assign__reason-track">
                  <span class="lead-assign__reason-fill" style="inline-size:${pct.toFixed(1)}%"></span>
                </span>
                <span class="lead-assign__reason-value">${formatNumber(count)}</span>
              </li>
            `;
          })
          .join('')}
      </ul>
    `;
  }

  renderUnassigned() {
    if (this.leads.length === 0) {
      return '<p class="lead-assign__empty lead-assign__empty--good">Every lead in the queue has a rep. Nothing is waiting.</p>';
    }

    return `
      <ul class="lead-assign__leads">
        ${this.leads
          .map((lead) => {
            const name = [lead.firstName, lead.lastName].filter(Boolean).join(' ') || 'Unnamed lead';
            const details = [lead.email, lead.phone].filter(Boolean).join(' · ');
            return `
              <li class="lead-assign__lead">
                <div class="lead-assign__lead-main">
                  <p class="lead-assign__lead-name">${escapeHtml(name)}</p>
                  <p class="lead-assign__lead-meta">${escapeHtml(details || 'No contact details on file')}</p>
                  <p class="lead-assign__lead-tags">
                    <span class="badge">Score ${escapeHtml(num(lead.score))}</span>
                    ${lead.source ? '<span class="badge">' + escapeHtml(String(lead.source)) + '</span>' : ''}
                    ${lead.priority ? '<span class="badge badge--accent">' + escapeHtml(String(lead.priority)) + '</span>' : ''}
                    ${lead.vehicleInterest ? '<span class="badge">' + escapeHtml(String(lead.vehicleInterest)) + '</span>' : ''}
                  </p>
                </div>
                <button type="button" class="btn btn-secondary btn-sm" data-action="quick-assign"
                        data-lead-id="${escapeHtml(lead.id)}">Assign to least-loaded rep</button>
              </li>
            `;
          })
          .join('')}
      </ul>
    `;
  }

  renderAssignForm() {
    const disabled = this.reps.length === 0;

    return `
      ${
        disabled
          ? '<p class="lead-assign__empty lead-assign__empty--warn">No active sales reps exist in the system, so there is nobody to assign a lead to. Add a rep (npm run seed:sales-reps, or the sales_reps table) and reload.</p>'
          : ''
      }
      <form class="lead-assign__form" id="lead-assign-form">
        <div class="form-field">
          <label for="lead-assign-lead">Lead</label>
          <select class="select" id="lead-assign-lead" name="leadId" required>
            <option value="">Choose a lead...</option>
            ${this.leads
              .map((lead) => {
                const name =
                  [lead.firstName, lead.lastName].filter(Boolean).join(' ') || 'Unnamed lead';
                return '<option value="' + escapeHtml(lead.id) + '">' + escapeHtml(name) + '</option>';
              })
              .join('')}
          </select>
          <span class="hint">Only leads awaiting assignment are listed.</span>
        </div>
        <div class="form-field">
          <label for="lead-assign-rep">Sales rep</label>
          <select class="select" id="lead-assign-rep" name="salesRepId" required>
            <option value="">Choose a sales rep...</option>
            ${this.reps
              .map(
                (rep) =>
                  '<option value="' +
                  escapeHtml(rep.id) +
                  '">' +
                  escapeHtml(rep.name) +
                  (rep.role ? ' (' + escapeHtml(String(rep.role)) + ')' : '') +
                  '</option>'
              )
              .join('')}
          </select>
        </div>
        <div class="form-field">
          <label for="lead-assign-reason">Reason</label>
          <select class="select" id="lead-assign-reason" name="reason">
            ${REASONS.map((r) => '<option value="' + r.value + '">' + r.label + '</option>').join('')}
          </select>
        </div>
        <button type="submit" class="btn btn-primary"${
          disabled ? ' disabled aria-disabled="true"' : ''
        }>Assign lead</button>
      </form>
    `;
  }

  bindBody() {
    const form = this.root.querySelector('#lead-assign-form');
    if (form) {
      form.addEventListener('submit', (event) => this.submitAssignment(event));
    }

    this.root.querySelectorAll('[data-action="quick-assign"]').forEach((button) => {
      button.addEventListener('click', () => this.quickAssign(button.dataset.leadId, button));
    });
  }

  // --- actions -------------------------------------------------------------

  async submitAssignment(event) {
    event.preventDefault();

    const form = event.target;
    const leadId = form.elements.leadId.value;
    const salesRepId = form.elements.salesRepId.value;
    const reason = form.elements.reason.value;

    if (!leadId || !salesRepId) {
      this.showNotice('Choose both a lead and a sales rep.', 'error');
      return;
    }

    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    this.showNotice('Assigning lead...', 'info');

    const result = await callApi(ASSIGNMENTS_API + '/assign', {
      method: 'POST',
      body: JSON.stringify({ leadId, salesRepId, reason })
    });

    submit.disabled = false;

    if (!result.ok) {
      if (result.kind === 'auth') {
        this.signInRequired = true;
        this.error = result.message;
        this.render();
        return;
      }
      this.showNotice(result.message, 'error');
      return;
    }

    const assignedTo = (result.data && result.data.assignedTo) || {};
    this.showNotice(
      'Lead assigned to ' + (assignedTo.name || 'the selected rep') + '.',
      'success'
    );
    await this.load();
  }

  async quickAssign(leadId, button) {
    // The roster is real now, so "least loaded" needs a real lead count per
    // rep. The workload analytics carry it; fall back to the roster order.
    const target = this.leastLoadedRep();
    if (!target) {
      this.showNotice('There are no active sales reps to assign to.', 'error');
      return;
    }

    button.disabled = true;
    const result = await callApi(ASSIGNMENTS_API + '/assign', {
      method: 'POST',
      body: JSON.stringify({
        leadId: leadId,
        salesRepId: target.rep.id,
        reason: 'workload_balance'
      })
    });

    button.disabled = false;

    if (!result.ok) {
      if (result.kind === 'auth') {
        this.signInRequired = true;
        this.error = result.message;
        this.render();
        return;
      }
      this.showNotice(result.message, 'error');
      return;
    }

    const assignedTo = (result.data && result.data.assignedTo) || {};
    this.showNotice('Lead assigned to ' + (assignedTo.name || 'the selected rep') + '.', 'success');
    await this.load();
  }

  /**
   * The rep with the fewest open leads.
   *
   * The workload analytics name reps but not by ID, so this matches on the
   * display name LeadAssignmentService builds the same way on both sides
   * (`first_name || ' ' || last_name`, database-service.js:722). A rep the
   * analytics do not cover counts as unknown, and unknowns sort first -- a rep
   * with no recorded load is a better bet than the busiest one.
   */
  leastLoadedRep() {
    if (!this.reps.length) return null;

    const counts = new Map();
    const workload = (this.analytics && this.analytics.repWorkloadDistribution) || [];
    workload.forEach((row) => {
      if (row.rep_name) counts.set(String(row.rep_name), num(row.lead_count));
    });

    return this.reps.reduce((best, rep) => {
      const load = counts.has(rep.name) ? counts.get(rep.name) : -1;
      if (!best) return { rep, load };
      return load < best.load ? { rep, load } : best;
    }, null).rep;
  }

  async rebalance() {
    const confirmed = window.confirm(
      'Rebalancing re-runs automatic assignment across every lead that is unassigned, ' +
        'inactive-rep assigned, over capacity, or more than seven days old. Continue?'
    );
    if (!confirmed) return;

    this.showNotice('Rebalancing assignments...', 'info');
    this.root.querySelector('[data-action="rebalance"]').disabled = true;

    const result = await callApi(ASSIGNMENTS_API + '/rebalance', { method: 'POST' });

    this.root.querySelector('[data-action="rebalance"]').disabled = false;

    if (!result.ok) {
      if (result.kind === 'auth') {
        this.signInRequired = true;
        this.error = result.message;
        this.render();
        return;
      }
      this.showNotice(result.message, 'error');
      return;
    }

    // data.results.reassigned -- the old code read .results off the body.
    const summary = (result.data && result.data.results) || {};
    const reassigned = num(summary.reassigned);
    const errors = num(summary.errors);
    this.showNotice(
      'Rebalanced ' +
        formatNumber(reassigned) +
        ' of ' +
        formatNumber(summary.totalProcessed) +
        ' leads' +
        (errors ? ', ' + formatNumber(errors) + ' failed' : '') +
        '.',
      errors ? 'error' : 'success'
    );
    await this.load();
  }

  showNotice(message, kind) {
    // main.css ships .form-message--success/--error but no --info, so the
    // in-progress state gets its own class rather than borrowing an error one.
    const cls = kind === 'success' ? 'form-message form-message--success'
      : kind === 'error' ? 'form-message form-message--error'
      : 'lead-assign__notice';
    this.noticeRegion.innerHTML = '<p class="' + cls + '">' + escapeHtml(message) + '</p>';
  }
}

// --- small formatting helpers ---------------------------------------------

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value) {
  return num(value).toLocaleString('en-US');
}

// --- boot ------------------------------------------------------------------

function init() {
  const root = document.getElementById('lead-assignment-app');
  if (!root) {
    console.error('[lead-assignment] #lead-assignment-app mount point not found; skipping init.');
    return;
  }
  new LeadAssignmentDashboard(root).start();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
