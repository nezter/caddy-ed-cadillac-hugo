/**
 * lead-management.js
 *
 * Lead deduplication console for /admin/leads. Replaces the ~200-line inline
 * <script> that used to live inside content/admin/leads.md: same features,
 * but bundled and fingerprinted through partials/page-scripts.html (so it gets
 * minification and SRI) and linted with the rest of the front end.
 *
 * Endpoints (both exist in netlify/functions/):
 *   GET  /.netlify/functions/lead-duplicates   -> duplicate statistics
 *   POST /.netlify/functions/lead-duplicates   -> check one lead for matches
 *   POST /.netlify/functions/lead-merge        -> merge duplicate lead rows
 *
 * Both functions answer through utils/error-handler, so every success body is
 * `{ success, message, data, timestamp }` and every failure body is
 * `{ success: false, message, errorCode }`. The old inline code read `data`
 * straight off the parsed body, which meant the stat cards were always 0 --
 * the numbers live one level down, under `data`.
 *
 * Failure handling is the point of this rewrite. Every request resolves to one
 * of three rendered states -- data, a sign-in prompt (401/403), or a visible
 * error with a retry -- because "the table is empty" is indistinguishable from
 * "the request never happened", and that ambiguity is how this repo loses
 * leads quietly.
 */

const API = {
  duplicates: '/.netlify/functions/lead-duplicates',
  merge: '/.netlify/functions/lead-merge'
};

const SIGN_IN_URL = '/admin/dashboard';

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape text destined for innerHTML. Lead fields are user-supplied. */
function escapeHtml(value) {
  // A single global regex rather than String.prototype.replaceAll: entry.html
  // compiles these bundles to an es2018 target and esbuild transpiles syntax,
  // not built-ins, so replaceAll would be an undefined method on exactly the
  // browsers that target is written to still cover.
  return String(value ?? '').replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

/**
 * The admin functions authenticate with a bearer JWT. session-manager.js
 * persists it in localStorage under `auth_token`; read it from the same place
 * so an authenticated admin gets data instead of a 401.
 */
function authHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  try {
    const token = window.localStorage.getItem('auth_token');
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    // Private-mode / storage-disabled browsers: fall through unauthenticated
    // and let the 401 handler render the sign-in state.
  }
  return headers;
}

/**
 * One fetch wrapper for the whole app.
 *
 * @returns {Promise<{ ok: true, data: any } | { ok: false, kind: 'auth'|'http'|'network', message: string }>}
 */
async function callApi(url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      credentials: 'same-origin',
      ...options,
      headers: { ...authHeaders(), ...(options.headers || {}) }
    });
  } catch {
    return {
      ok: false,
      kind: 'network',
      message: 'Could not reach the server. Check your connection and try again.'
    };
  }

  if (response.status === 401 || response.status === 403) {
    return {
      ok: false,
      kind: 'auth',
      message:
        response.status === 403
          ? 'Your account does not have permission to manage leads.'
          : 'Your session has expired. Sign in again to view lead data.'
    };
  }

  let body = null;
  try {
    body = await response.json();
  } catch {
    // A non-JSON body on an error status is a proxy error page, not the API.
  }

  if (!response.ok || (body && body.success === false)) {
    return {
      ok: false,
      kind: 'http',
      message: (body && body.message) || `Request failed (HTTP ${response.status}).`
    };
  }

  return { ok: true, data: body ? body.data : null };
}

class LeadManagementApp {
  /**
   * @param {HTMLElement} root the `#lead-management-app` mount point
   */
  constructor(root) {
    this.root = root;
    this.stats = null;
    this.signInRequired = false;
    this.mount();
  }

  // --- lifecycle ----------------------------------------------------------

  async start() {
    this.setBusy(true, 'Loading lead statistics...');
    const result = await callApi(API.duplicates, { method: 'GET' });

    this.setBusy(false);

    if (result.ok) {
      this.stats = result.data || {};
      this.signInRequired = false;
      this.alertRegion.hidden = true;
    } else if (result.kind === 'auth') {
      this.signInRequired = true;
      this.alertRegion.hidden = true;
    } else {
      this.stats = null;
      this.alertRegion.hidden = false;
      this.alertRegion.className = 'admin-alert admin-alert--error';
      this.alertRegion.innerHTML = `<p><strong>Could not load lead statistics.</strong> ${escapeHtml(result.message)}</p>`;
    }

    this.render();
  }

  // --- rendering ----------------------------------------------------------

  mount() {
    this.root.innerHTML = `
      <div class="admin-alert" id="lead-alert" role="status" hidden></div>
      <div id="lead-body"></div>
    `;
    this.alertRegion = this.root.querySelector('#lead-alert');
    this.body = this.root.querySelector('#lead-body');
  }

  setBusy(isBusy, message) {
    this.body.innerHTML = isBusy
      ? `<div class="loading" role="status">${escapeHtml(message || 'Loading...')}</div>`
      : '';
  }

  render() {
    if (this.signInRequired) {
      this.renderSignIn();
      return;
    }
    this.renderStats();
    this.renderControls();
  }

  renderSignIn() {
    this.body.innerHTML = `
      <div class="login-prompt">
        <h3>Sign in required</h3>
        <p>Lead records and merge actions are restricted to authenticated sales staff.</p>
        <a class="login-button" href="${SIGN_IN_URL}">Go to sign in</a>
      </div>
    `;
  }

  renderStats() {
    const stats = this.stats || {};
    const total = Number(stats.totalLeads) || 0;
    const merged = Number(stats.mergedLeads) || 0;
    const potential = Number(stats.potentialDuplicates) || 0;
    const average = Number(stats.averageDuplicatesPerLead) || 0;

    this.body.innerHTML = `
      <h2>Deduplication overview</h2>
      <div class="stats-grid">
        <div class="stat-card">
          <h3>Total Leads</h3>
          <div class="stat-number">${total}</div>
        </div>
        <div class="stat-card">
          <h3>Merged Leads</h3>
          <div class="stat-number">${merged}</div>
        </div>
        <div class="stat-card">
          <h3>Potential Duplicates</h3>
          <div class="stat-number">${potential}</div>
        </div>
        <div class="stat-card">
          <h3>Avg Duplicates/Lead</h3>
          <div class="stat-number">${average.toFixed(1)}</div>
        </div>
      </div>

      <div class="actions">
        <button type="button" class="btn btn-primary" data-action="open-check">Check for Duplicates</button>
        <button type="button" class="btn btn-secondary" data-action="open-merge">Manual Merge</button>
      </div>

      <section id="duplicate-results" hidden>
        <h3>Check a lead for duplicates</h3>
        <p class="admin-hint">
          Matches an inbound lead against the last 12 months of submissions on
          exact email, exact phone and fuzzy name. The server decides what counts
          as a match; this form only collects the candidate.
        </p>
        <form id="duplicate-form">
          <div class="form-row">
            <div class="form-group">
              <label for="check-name">Full name</label>
              <input type="text" id="check-name" name="name" autocomplete="name">
            </div>
            <div class="form-group">
              <label for="check-email">Email</label>
              <input type="email" id="check-email" name="email" autocomplete="email">
            </div>
            <div class="form-group">
              <label for="check-phone">Phone</label>
              <input type="tel" id="check-phone" name="phone" autocomplete="tel">
            </div>
          </div>
          <p class="admin-hint">At least one of name, email or phone is required.</p>
          <button type="submit" class="btn btn-primary">Run duplicate check</button>
        </form>
        <div id="duplicate-list"></div>
      </section>

      <section id="merge-interface" hidden>
        <h3>Manual lead merge</h3>
        <p class="admin-hint">
          Merging is permanent: the duplicate rows are folded into the primary
          lead and their IDs stop resolving.
        </p>
        <form id="merge-form">
          <div class="form-group">
            <label for="primary-lead-id">Primary lead ID</label>
            <input type="text" id="primary-lead-id" name="primaryLeadId" required>
            <span class="admin-field-hint">The record that survives the merge.</span>
          </div>
          <div class="form-group">
            <label for="duplicate-ids">Duplicate lead IDs</label>
            <input type="text" id="duplicate-ids" name="duplicateIds" required>
            <span class="admin-field-hint">Comma-separated, e.g. 812, 813, 1044.</span>
          </div>
          <button type="submit" class="btn btn-primary">Merge leads</button>
        </form>
      </section>
    `;

    this.alertRegion.hidden = true;

    this.root.querySelector('[data-action="open-check"]').addEventListener('click', () => {
      this.toggleSection('duplicate-results', true);
    });

    this.root.querySelector('[data-action="open-merge"]').addEventListener('click', () => {
      this.toggleSection('merge-interface', true);
    });

    this.root.querySelector('#duplicate-form').addEventListener('submit', (event) => {
      event.preventDefault();
      this.checkDuplicates();
    });

    this.root.querySelector('#merge-form').addEventListener('submit', (event) => {
      event.preventDefault();
      this.mergeLeads();
    });
  }

  toggleSection(id, open) {
    const section = this.root.querySelector(`#${id}`);
    if (!section) return;
    section.hidden = !open;
    if (open) {
      const firstField = section.querySelector('input');
      if (firstField) firstField.focus();
    }
  }

  showAlert(kind, message) {
    this.alertRegion.hidden = false;
    this.alertRegion.className = `admin-alert admin-alert--${kind}`;
    this.alertRegion.innerHTML = `<p>${escapeHtml(message)}</p>`;
  }

  // --- actions ------------------------------------------------------------

  /**
   * POST one candidate lead to the duplicate checker.
   *
   * The old inline version of this button rendered a hardcoded placeholder
   * string ("Duplicate checking would be implemented here"); the endpoint it
   * needed has existed the whole time, so this actually calls it.
   */
  async checkDuplicates() {
    const list = this.root.querySelector('#duplicate-list');
    const submit = this.root.querySelector('#duplicate-form button[type="submit"]');
    if (!list || !submit) return;

    const leadData = {
      name: this.value('#check-name'),
      email: this.value('#check-email'),
      phone: this.value('#check-phone')
    };

    if (!leadData.name && !leadData.email && !leadData.phone) {
      this.showAlert('error', 'Enter a name, an email or a phone number to check.');
      return;
    }

    submit.disabled = true;
    list.innerHTML = '<div class="loading" role="status">Checking for duplicates...</div>';

    const result = await callApi(API.duplicates, {
      method: 'POST',
      body: JSON.stringify({ leadData })
    });

    submit.disabled = false;

    if (!result.ok) {
      list.innerHTML = '';
      if (result.kind === 'auth') {
        this.signInRequired = true;
        this.render();
        return;
      }
      this.showAlert('error', result.message);
      return;
    }

    const check = result.data || {};
    this.renderDuplicateMatches(list, check);
  }

  renderDuplicateMatches(list, check) {
    const duplicates = Array.isArray(check.duplicates) ? check.duplicates : [];

    if (duplicates.length === 0) {
      list.innerHTML = '<div class="empty-state"><p>No existing leads match this contact.</p></div>';
      return;
    }

    const rows = duplicates
      .map((entry) => {
        const lead = entry.lead || {};
        const confidence = Math.round((Number(entry.confidence) || 0) * 100);
        const reasons = Array.isArray(entry.matchReasons) ? entry.matchReasons : [];
        const identity = escapeHtml(lead.name || [lead.firstName, lead.lastName].filter(Boolean).join(' ') || 'Unnamed lead');

        return `
          <div class="duplicate-row">
            <div>
              <strong>${identity}</strong>
              ${lead.email ? `<div>${escapeHtml(lead.email)}</div>` : ''}
              ${lead.phone ? `<div>${escapeHtml(lead.phone)}</div>` : ''}
              <div class="duplicate-reasons">${reasons.map((r) => escapeHtml(r)).join(' &middot; ')}</div>
            </div>
            <div class="confidence">
              <span class="confidence__track" aria-hidden="true"><span class="confidence__fill" style="inline-size: ${confidence}%"></span></span>
              <span>${confidence}%</span>
            </div>
          </div>
        `;
      })
      .join('');

    const verdict = check.isDuplicate
      ? `<p class="admin-hint"><strong>Likely a duplicate.</strong> Resolve it with a manual merge.</p>`
      : `<p class="admin-hint">No match cleared the server's confidence threshold.</p>`;

    list.innerHTML = `<div class="duplicate-list">${verdict}${rows}</div>`;
  }

  /** POST a merge request, then reload the stats so the cards stay truthful. */
  async mergeLeads() {
    const form = this.root.querySelector('#merge-form');
    const submit = form ? form.querySelector('button[type="submit"]') : null;
    if (!form || !submit) return;

    const primaryLeadId = this.value('#primary-lead-id');
    const duplicateIds = this.value('#duplicate-ids')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);

    if (duplicateIds.length === 0) {
      this.showAlert('error', 'Enter at least one duplicate lead ID to merge.');
      return;
    }

    submit.disabled = true;
    this.setBusy(true, 'Merging leads...');
    this.alertRegion.hidden = true;

    const result = await callApi(API.merge, {
      method: 'POST',
      body: JSON.stringify({ primaryLeadId, duplicateIds })
    });

    this.setBusy(false);
    submit.disabled = false;

    if (!result.ok) {
      if (result.kind === 'auth') {
        this.signInRequired = true;
        this.render();
        return;
      }
      this.render();
      this.showAlert('error', result.message);
      return;
    }

    this.render();
    this.showAlert('success', (result.data && result.data.message) || 'Leads merged successfully.');
  }

  value(selector) {
    const field = this.root.querySelector(selector);
    return field ? field.value.trim() : '';
  }
}

/**
 * Boot.
 *
 * The mount point is required. If the page was rendered without it -- a
 * content typo, a partial include that changed shape -- bail loudly in the
 * console instead of throwing inside a DOMContentLoaded handler where nothing
 * would surface it.
 */
function init() {
  const root = document.getElementById('lead-management-app');
  if (!root) {
    console.error('[lead-management] #lead-management-app mount point not found; skipping init.');
    return;
  }
  // Deliberately not on `window`: the inline version exported a global `app`
  // purely so its own `onclick=` attributes could reach it, and nothing else
  // references it.
  new LeadManagementApp(root).start();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
