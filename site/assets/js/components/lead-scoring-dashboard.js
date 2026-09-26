/**
 * lead-scoring-dashboard.js
 *
 * Lead scoring analytics for /admin/lead-scoring.
 *
 * Endpoint
 * --------
 *   GET  /.netlify/functions/lead-scoring?timeframe=30d
 *        -> { success, message, data: { timeframe, scoreDistribution,
 *             scoresBySource, priorityDistribution, scoringTrends,
 *             summary: { totalLeads, averageScore, hotLeadsPercentage,
 *                        conversionRateByScore } }, timestamp }
 *   POST /.netlify/functions/lead-scoring?leadId=<id>
 *        -> { success, message, data: { leadId, oldScore, newScore,
 *             priority, recommendedActions } , timestamp }
 *
 * The three defects this rewrite fixes, all of which made the page render
 * rather than break:
 *
 *   1. It fetched `/api/lead-scoring`. netlify.toml removed the blanket
 *      /api/* -> /.netlify/functions/$1 rewrite and never declared an alias
 *      for this path, so the call was a 404 and every chart was empty.
 *   2. It obtained auth headers with
 *      `await import('../utils/session-manager.js')`. That module is CommonJS
 *      (`module.exports = sessionManager`) with no default export, and
 *      partials/entry.html builds these pages as IIFE bundles, where a dynamic
 *      import is not resolvable at runtime. `sessionManager.default` was
 *      undefined, so `getAuthHeaders()` threw inside the try block and every
 *      load reported "Failed to load scoring data". The token is read straight
 *      out of localStorage under the same key session-manager writes
 *      (`auth_token`), which is what lead-management.js and salesDashboard.js do.
 *   3. A 401 was folded into the same generic error string as a 500, so an
 *      expired session looked identical to a broken server. Each now renders
 *      its own state.
 *
 * Charts: the old version called `new Chart(...)` against a global that
 * nothing in this repo loads -- Chart.js is not a dependency (package.json) and
 * no layout includes it, so the first call threw ReferenceError inside
 * renderCharts and left the summary cards at "-". The charts are therefore
 * plain markup: CSS bars sized with `inline-size`, plus a real <table> for the
 * numbers, which is also what a screen reader gets.
 *
 * Every figure is coerced with Number(): the aggregate queries behind these
 * endpoints return numerics as strings through node-postgres, so `count + 1`
 * used to concatenate and every percentage read as a digit soup.
 */

const LEAD_SCORING_API = '/.netlify/functions/lead-scoring';

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
    // Storage disabled (private mode): fall through and let the 401 handler
    // render the sign-in state.
  }
  return headers;
}

/**
 * One fetch wrapper for the page.
 *
 * @returns {Promise<{ok:true,data:any}|{ok:false,kind:'auth'|'http'|'network',message:string,status?:number}>}
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
      status: response.status,
      message:
        response.status === 403
          ? 'Your account is signed in but lacks the manage_leads permission these analytics require.'
          : 'Sign in to view lead scoring analytics.'
    };
  }

  let body = null;
  try {
    body = await response.json();
  } catch {
    // A non-JSON body on an error status is a proxy page, not this function.
  }

  if (!response.ok || (body && body.success === false)) {
    return {
      ok: false,
      kind: 'http',
      status: response.status,
      message:
        (body && body.message) ||
        'The lead scoring service returned an unexpected response (HTTP ' + response.status + ').'
    };
  }

  // The wrapper is { success, message, data, timestamp } -- the payload is
  // always one level down. Reading `.scoreDistribution` off the body itself is
  // how the whole dashboard used to be permanently empty.
  return { ok: true, data: body ? body.data : null };
}

const TIMEFRAMES = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: '1y', label: 'Last year' }
];

class LeadScoringDashboard {
  constructor(root) {
    this.root = root;
    this.timeframe = '30d';
    this.data = null;
    this.signInRequired = false;
    this.error = null;
  }

  async start() {
    this.renderShell();
    await this.load();
  }

  // --- shell ---------------------------------------------------------------

  renderShell() {
    this.root.innerHTML = `
      <div class="lead-scoring">
        <div class="lead-scoring__toolbar">
          <div class="lead-scoring__timeframe">
            <label for="lead-scoring-timeframe">Timeframe</label>
            <select id="lead-scoring-timeframe" class="select">
              ${TIMEFRAMES.map(
                (f) => `<option value="${f.value}"${f.value === this.timeframe ? ' selected' : ''}>${f.label}</option>`
              ).join('')}
            </select>
          </div>
          <div class="lead-scoring__toolbar-actions">
            <button type="button" class="btn btn-secondary" data-action="refresh">Refresh</button>
            <button type="button" class="btn btn-secondary" data-action="export">Export JSON</button>
          </div>
        </div>
        <div id="lead-scoring-state" role="status" aria-live="polite"></div>
        <div id="lead-scoring-body"></div>
      </div>
    `;

    this.stateRegion = this.root.querySelector('#lead-scoring-state');
    this.bodyRegion = this.root.querySelector('#lead-scoring-body');

    this.root.querySelector('#lead-scoring-timeframe').addEventListener('change', (event) => {
      this.timeframe = event.target.value;
      this.load();
    });

    this.root.querySelector('[data-action="refresh"]').addEventListener('click', () => this.load());

    this.root.querySelector('[data-action="export"]').addEventListener('click', () => this.exportJson());
  }

  setBusy(message) {
    this.stateRegion.innerHTML =
      '<div class="lead-scoring__state"><span class="lead-scoring__spinner" aria-hidden="true"></span><p>' +
      escapeHtml(message) +
      '</p></div>';
  }

  // --- load ----------------------------------------------------------------

  async load() {
    this.setBusy('Loading lead scoring analytics...');

    const result = await callApi(LEAD_SCORING_API + '?timeframe=' + encodeURIComponent(this.timeframe));

    if (result.ok) {
      this.data = result.data || {};
      this.signInRequired = false;
      this.error = null;
    } else if (result.kind === 'auth') {
      this.data = null;
      this.signInRequired = true;
      this.error = result.message;
    } else {
      this.data = null;
      this.signInRequired = false;
      this.error = result.message;
    }

    this.render();
  }

  // --- render --------------------------------------------------------------

  render() {
    this.stateRegion.innerHTML = '';

    if (this.signInRequired) {
      this.bodyRegion.innerHTML = '';
      this.stateRegion.innerHTML = `
        <div class="lead-scoring__state lead-scoring__state--auth">
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
        <div class="lead-scoring__state lead-scoring__state--error">
          <h2>Could not load lead scoring analytics</h2>
          <p>${escapeHtml(this.error)}</p>
          <button type="button" class="btn btn-primary" data-action="retry">Retry</button>
        </div>
      `;
      this.stateRegion.querySelector('[data-action="retry"]').addEventListener('click', () => this.load());
      return;
    }

    const data = this.data || {};
    const summary = data.summary || {};
    const totalLeads = Number(summary.totalLeads) || 0;
    const distribution = toNumberArray(data.scoreDistribution, 'count');

    if (totalLeads === 0 && distribution.length === 0) {
      this.bodyRegion.innerHTML = '';
      this.stateRegion.innerHTML = `
        <div class="lead-scoring__state lead-scoring__state--empty">
          <h2>No scored leads in this window</h2>
          <p>Nothing was scored in the last ${escapeHtml(this.timeframeLabel())}. Widen the timeframe,
             or score a lead below to record its first score.</p>
        </div>
      `;
      this.bodyRegion.innerHTML = this.renderRecalculateCard();
      this.bindRecalculate();
      return;
    }

    const conversionRows = toNumberArray(summary.conversionRateByScore, 'conversion_rate');

    this.bodyRegion.innerHTML = `
      <div class="lead-scoring__stats">
        ${this.renderStat('Total leads scored', num(totalLeads))}
        ${this.renderStat('Average score', num(summary.averageScore))}
        ${this.renderStat('Hot leads', percent(summary.hotLeadsPercentage))}
        ${this.renderStat('Score bands tracked', num(conversionRows.length))}
      </div>

      <div class="lead-scoring__grid">
        <section class="card lead-scoring__panel">
          <h2 class="card__title">Score distribution</h2>
          ${this.renderBarList(
            distribution.map((row) => ({ label: String(row.score_range), value: row.count })),
            'leads'
          )}
        </section>

        <section class="card lead-scoring__panel">
          <h2 class="card__title">Leads by priority</h2>
          ${this.renderBarList(
            toNumberArray(data.priorityDistribution, 'count').map((row) => ({
              label: String(row.priority || 'unknown'),
              value: row.count
            })),
            'leads'
          )}
        </section>

        <section class="card lead-scoring__panel">
          <h2 class="card__title">Average score by source</h2>
          ${this.renderBarList(
            toNumberArray(data.scoresBySource, 'avg_score').map((row) => ({
              label: String(row.source || 'unknown').replace(/_/g, ' '),
              value: row.avg_score,
              max: 100
            })),
            'pts'
          )}
        </section>

        <section class="card lead-scoring__panel">
          <h2 class="card__title">Scoring trend</h2>
          ${this.renderBarList(
            toNumberArray(data.scoringTrends, 'avg_score').map((row) => ({
              label: formatDate(row.date),
              value: row.avg_score,
              max: 100,
              note: num(row.lead_count) + ' leads'
            })),
            'pts'
          )}
        </section>
      </div>

      <section class="card lead-scoring__panel">
        <h2 class="card__title">Conversion by score band</h2>
        ${
          conversionRows.length === 0
            ? '<p class="lead-scoring__empty">No closed outcomes recorded yet, so no conversion rate can be computed.</p>'
            : `<div class="table-wrap">
                 <table>
                   <caption class="visually-hidden">Conversion rate for each lead score band</caption>
                   <thead><tr><th scope="col">Score band</th><th scope="col">Conversion rate</th></tr></thead>
                   <tbody>
                     ${conversionRows
                       .map(
                         (row) =>
                           '<tr><th scope="row">' +
                           escapeHtml(row.score_range) +
                           '</th><td>' +
                           percent(row.conversion_rate) +
                           '</td></tr>'
                       )
                       .join('')}
                   </tbody>
                 </table>
               </div>`
        }
      </section>

      ${this.renderRecalculateCard()}
    `;

    this.bindRecalculate();
  }

  renderStat(label, value) {
    return `
      <div class="lead-scoring__stat">
        <span class="lead-scoring__stat-value">${escapeHtml(value)}</span>
        <span class="lead-scoring__stat-label">${escapeHtml(label)}</span>
      </div>
    `;
  }

  /**
   * A horizontal bar list. `inline-size` is a percentage computed from the data
   * here, so the value is always a number and never user text.
   */
  renderBarList(rows, unit) {
    if (!rows.length) {
      return '<p class="lead-scoring__empty">No data for this timeframe.</p>';
    }

    const peak = rows.reduce((max, row) => Math.max(max, Number(row.value) || 0), 0) || 1;

    return `
      <ul class="lead-scoring__bars">
        ${rows
          .map((row) => {
            const value = Number(row.value) || 0;
            const ceiling = row.max || peak;
            const width = Math.max(0, Math.min(100, (value / ceiling) * 100));
            return `
              <li class="lead-scoring__bar">
                <span class="lead-scoring__bar-label">${escapeHtml(row.label)}</span>
                <span class="lead-scoring__bar-track">
                  <span class="lead-scoring__bar-fill" style="inline-size:${width.toFixed(1)}%"></span>
                </span>
                <span class="lead-scoring__bar-value">${escapeHtml(formatNumber(value))}${unit ? ' ' + unit : ''}${
                  row.note ? '<span class="lead-scoring__bar-note">' + escapeHtml(row.note) + '</span>' : ''
                }</span>
              </li>
            `;
          })
          .join('')}
      </ul>
    `;
  }

  /**
   * The function's POST half is a single-lead recalculation
   * (`POST ?leadId=`). The old page shipped a "Recalculate All Scores" button
   * that only re-ran the GET and reported success, so it claimed a batch job
   * that does not exist. This form calls the endpoint that does.
   */
  renderRecalculateCard() {
    return `
      <section class="card lead-scoring__panel">
        <h2 class="card__title">Recalculate one lead</h2>
        <p class="lead-scoring__hint">
          Recomputes a single lead's score from its last 30 days of interactions and
          stores the result. There is no batch endpoint, so bulk recalculation is
          deliberately not offered here.
        </p>
        <form class="lead-scoring__recalc" id="lead-scoring-recalc">
          <div class="form-field">
            <label for="lead-scoring-lead-id">Lead ID</label>
            <input class="input" type="text" id="lead-scoring-lead-id" name="leadId" required
                   inputmode="numeric" placeholder="e.g. 1044">
          </div>
          <button type="submit" class="btn btn-primary">Recalculate score</button>
        </form>
        <div id="lead-scoring-recalc-result" role="status" aria-live="polite"></div>
      </section>
    `;
  }

  bindRecalculate() {
    const form = this.root.querySelector('#lead-scoring-recalc');
    if (form) form.addEventListener('submit', (event) => this.recalculate(event));
  }

  async recalculate(event) {
    event.preventDefault();

    const form = event.target;
    const result = this.root.querySelector('#lead-scoring-recalc-result');
    const submit = form.querySelector('button[type="submit"]');
    const leadId = form.elements.leadId.value.trim();

    if (!leadId) return;

    submit.disabled = true;
    result.innerHTML = '<p class="lead-scoring__hint">Recalculating...</p>';

    const response = await callApi(LEAD_SCORING_API + '?leadId=' + encodeURIComponent(leadId), {
      method: 'POST'
    });

    submit.disabled = false;

    if (!response.ok) {
      if (response.kind === 'auth') {
        this.signInRequired = true;
        this.error = response.message;
        this.render();
        return;
      }
      result.innerHTML = '<p class="form-message form-message--error">' + escapeHtml(response.message) + '</p>';
      return;
    }

    const payload = response.data || {};
    const actions = Array.isArray(payload.recommendedActions) ? payload.recommendedActions : [];

    result.innerHTML = `
      <div class="form-message form-message--success">
        <p>Lead ${escapeHtml(payload.leadId)}: ${escapeHtml(num(payload.oldScore))} &rarr;
           <strong>${escapeHtml(num(payload.newScore))}</strong>
           (${escapeHtml(String(payload.priority || 'unclassified'))}).</p>
      </div>
      ${
        actions.length
          ? '<ul class="lead-scoring__actions-list">' +
            actions.map((a) => '<li>' + escapeHtml(String(a)) + '</li>').join('') +
            '</ul>'
          : ''
      }
    `;
  }

  // --- export --------------------------------------------------------------

  exportJson() {
    if (!this.data) {
      this.flash('Nothing to export yet — load the analytics first.');
      return;
    }
    try {
      const payload = JSON.stringify(this.data, null, 2);
      const href = 'data:application/json;charset=utf-8,' + encodeURIComponent(payload);
      const link = document.createElement('a');
      link.href = href;
      link.download = 'lead-scoring-' + this.timeframe + '-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('[lead-scoring] export failed', error);
      this.flash('Export failed. The analytics are still on screen.');
    }
  }

  flash(message) {
    this.stateRegion.innerHTML =
      '<div class="lead-scoring__state"><p>' + escapeHtml(message) + '</p></div>';
  }

  timeframeLabel() {
    const found = TIMEFRAMES.find((f) => f.value === this.timeframe);
    return found ? found.label.toLowerCase() : this.timeframe;
  }
}

// --- small formatting helpers ---------------------------------------------

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function percent(value) {
  return num(value) + '%';
}

function formatNumber(value) {
  return num(value).toLocaleString('en-US');
}

function formatDate(value) {
  if (!value) return 'unknown date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

/**
 * Coerce an aggregate result set into real numbers. node-postgres returns
 * `count`, `avg_score` and friends as strings, and a missing value arrives as
 * null, so every read goes through here before it reaches arithmetic or text.
 */
function toNumberArray(rows, valueKey) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    const copy = Object.assign({}, row);
    copy[valueKey] = num(row[valueKey]);
    return copy;
  });
}

// --- boot ------------------------------------------------------------------

function init() {
  const root = document.getElementById('lead-scoring-app');
  if (!root) {
    console.error('[lead-scoring] #lead-scoring-app mount point not found; skipping init.');
    return;
  }
  new LeadScoringDashboard(root).start();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
