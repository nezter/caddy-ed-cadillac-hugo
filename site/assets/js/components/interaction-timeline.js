/**
 * interaction-timeline.js
 *
 * Customer interaction history for /admin/interactions.
 *
 * Endpoints (netlify/functions/interactions.js, all behind
 * `authenticateRequest`):
 *
 *   GET  /.netlify/functions/interactions/timeline?customer_id=<id>&limit=100&types=a,b&date_from=&date_to=&sales_rep_id=&include_leads=true
 *        -> data: { customer_id, interactions: [ ... ], total, options }
 *   GET  /.netlify/functions/interactions/types
 *        -> data: { interaction_types: [ { value, label, category } ] }
 *   POST /.netlify/functions/interactions/log
 *        { customer_id, interaction_type, direction, subject, content,
 *          contact_method, outcome, next_action, next_action_date,
 *          duration_minutes, sales_rep_id, sales_rep_name, tags }
 *        -> data: { message, interaction }
 *
 * What this rewrite fixes:
 *
 *   1. `data.interactions` was read off the body. Every success body is
 *      `{ success, message, data, timestamp }`, so the array was always
 *      undefined and the timeline always said "No interactions found" — which
 *      is a claim about the customer, not about the request. It reads
 *      `data.data.interactions` now.
 *   2. No Authorization header was ever sent, so every load was a 401 that
 *      rendered as a generic failure. A 401 now renders the sign-in state.
 *   3. The timeline was constructed with a customerId that no page supplied,
 *      and the page this shipped on had no way to choose a customer. The
 *      customer is now chosen here: from `?customer_id=` on the URL when
 *      present, otherwise from the form on the page.
 *   4. showError() rendered `<button onclick="...reloadInteractions()">` calling
 *      a method that does not exist, so the retry button threw. The retry is a
 *      bound listener now.
 *   5. "Add Interaction" was `alert('Add interaction modal would open here')`.
 *      The log endpoint exists and is called for real; the type list comes from
 *      GET /types rather than a hardcoded <input> list that had drifted from it.
 *   6. Every field in the timeline item is user-supplied text and went into
 *      innerHTML unescaped, so a lead who put `<script>` in a note subject
 *      would have run it in the staff session. All of it is escaped now.
 */

const INTERACTIONS_API = '/.netlify/functions/interactions';

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
          ? 'Your account is signed in but lacks the interactions_read permission.'
          : 'Sign in to view interaction history.'
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

/** Fallback taxonomy, used only if GET /types cannot be reached. */
const FALLBACK_TYPES = [
  { value: 'phone_call', label: 'Phone Call' },
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'SMS/Text' },
  { value: 'in_person', label: 'In-Person Visit' },
  { value: 'website_visit', label: 'Website Visit' },
  { value: 'form_submission', label: 'Form Submission' },
  { value: 'test_drive', label: 'Test Drive' },
  { value: 'service_visit', label: 'Service Visit' },
  { value: 'note', label: 'Internal Note' },
  { value: 'task', label: 'Task/Follow-up' },
  { value: 'appointment', label: 'Appointment' },
  { value: 'follow_up', label: 'Follow-up' }
];

const TYPE_ICONS = {
  phone_call: 'Call',
  email: 'Email',
  sms: 'Text',
  in_person: 'Visit',
  website_visit: 'Web',
  form_submission: 'Form',
  test_drive: 'Drive',
  service_visit: 'Service',
  note: 'Note',
  task: 'Task',
  appointment: 'Appt',
  follow_up: 'Follow-up'
};

class InteractionTimeline {
  constructor(root) {
    this.root = root;
    this.customerId = readCustomerIdFromUrl();
    this.interactions = [];
    this.filtered = [];
    this.types = FALLBACK_TYPES;
    this.signInRequired = false;
    this.error = null;
    this.filters = { types: [], dateFrom: '', dateTo: '', query: '' };
  }

  async start() {
    this.renderShell();
    if (this.customerId) {
      await this.loadTimeline();
    } else {
      this.showPicker('Choose a customer to load their interaction history.');
    }
  }

  // --- shell ---------------------------------------------------------------

  renderShell() {
    this.root.innerHTML = `
      <div class="timeline">
        <form class="timeline__picker" id="timeline-customer-form">
          <div class="form-field">
            <label for="timeline-customer-id">Customer ID</label>
            <input class="input" type="text" id="timeline-customer-id" name="customerId"
                   value="${escapeHtml(this.customerId)}" inputmode="numeric"
                   placeholder="The customer_id from the leads table">
            <span class="hint">A UUID or numeric id. Append <code>?customer_id=…</code> to this page's URL to preselect it.</span>
          </div>
          <button type="submit" class="btn btn-primary">Load history</button>
        </form>

        <div id="timeline-notice" role="status" aria-live="polite"></div>
        <div id="timeline-state" role="status" aria-live="polite"></div>
        <div id="timeline-body"></div>
      </div>
    `;

    this.noticeRegion = this.root.querySelector('#timeline-notice');
    this.stateRegion = this.root.querySelector('#timeline-state');
    this.bodyRegion = this.root.querySelector('#timeline-body');

    this.root.querySelector('#timeline-customer-form').addEventListener('submit', (event) => {
      event.preventDefault();
      const field = event.target.elements.customerId;
      this.customerId = field.value.trim();
      this.loadTimeline();
    });
  }

  showNotice(message, kind) {
    const cls = kind === 'success' ? 'form-message form-message--success'
      : kind === 'error' ? 'form-message form-message--error'
      : 'timeline__notice';
    this.noticeRegion.innerHTML = '<p class="' + cls + '">' + escapeHtml(message) + '</p>';
  }

  showBusy(message) {
    this.bodyRegion.innerHTML = '';
    this.stateRegion.innerHTML =
      '<div class="timeline__state"><span class="timeline__spinner" aria-hidden="true"></span><p>' +
      escapeHtml(message) +
      '</p></div>';
  }

  // --- load ----------------------------------------------------------------

  async loadTimeline() {
    if (!this.customerId) {
      this.showPicker('Enter a customer ID to load their interaction history.');
      return;
    }

    this.showBusy('Loading interaction history...');
    await this.loadTypes();

    const query = new URLSearchParams();
    query.set('customer_id', this.customerId);
    query.set('limit', '100');
    query.set('include_leads', 'true');

    const result = await callApi(INTERACTIONS_API + '/timeline?' + query.toString());

    if (!result.ok) {
      this.interactions = [];
      this.filtered = [];
      if (result.kind === 'auth') {
        this.signInRequired = true;
        this.error = result.message;
      } else {
        this.signInRequired = false;
        this.error = result.message;
      }
      this.render();
      return;
    }

    this.signInRequired = false;
    this.error = null;
    // The payload lives under `data`. The old code read `body.interactions`,
    // which is always undefined, so a customer with 40 logged calls rendered
    // as "This customer hasn't had any recorded interactions yet."
    const payload = result.data || {};
    this.interactions = Array.isArray(payload.interactions) ? payload.interactions : [];
    this.filtered = this.interactions.slice();
    this.render();
  }

  async loadTypes() {
    const result = await callApi(INTERACTIONS_API + '/types');
    if (result.ok && result.data && Array.isArray(result.data.interaction_types)) {
      this.types = result.data.interaction_types;
    }
    // A failed type list is not worth a visible error: it only labels the
    // filter checkboxes and the log form, both of which have a fallback.
  }

  // --- render --------------------------------------------------------------

  render() {
    this.stateRegion.innerHTML = '';

    if (this.signInRequired) {
      this.bodyRegion.innerHTML = '';
      this.stateRegion.innerHTML = `
        <div class="timeline__state timeline__state--auth">
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
        <div class="timeline__state timeline__state--error">
          <h2>Could not load interaction history</h2>
          <p>${escapeHtml(this.error)}</p>
          <button type="button" class="btn btn-primary" data-action="retry">Retry</button>
        </div>
      `;
      this.stateRegion.querySelector('[data-action="retry"]').addEventListener('click', () => this.loadTimeline());
      return;
    }

    if (this.interactions.length === 0) {
      // No filters are worth rendering against an empty set, and an empty
      // filter panel above "no interactions" invites the reader to think the
      // filters hid something.
      this.bodyRegion.innerHTML =
        '<div class="timeline__state timeline__state--empty">' +
        '<h2>No interactions recorded</h2>' +
        '<p>Customer ' +
        escapeHtml(this.customerId) +
        ' has no interaction history. Log the first one below.</p>' +
        '</div>' + this.renderLogForm();
      this.bindLogForm();
      return;
    }

    this.bodyRegion.innerHTML = `
      ${this.renderControls()}
      <div id="timeline-list">${this.renderTimeline()}</div>
      ${this.renderLogForm()}
    `;

    this.bindControls();
    this.bindLogForm();
    this.updateFilterCount();
  }

  showPicker(message) {
    this.bodyRegion.innerHTML =
      '<div class="timeline__state timeline__state--empty"><h2>No customer selected</h2><p>' +
      escapeHtml(message) +
      '</p></div>';
  }

  renderControls() {
    return `
      <section class="card timeline__panel">
        <h2 class="card__title">Filter</h2>
        <div class="timeline__filters">
          <div class="form-field">
            <label for="timeline-search">Search subject, content and summary</label>
            <input class="input" type="search" id="timeline-search" name="q"
                   value="${escapeHtml(this.filters.query)}"
                   placeholder="Words to match">
          </div>
          <div class="form-field">
            <label for="timeline-date-from">From</label>
            <input class="input" type="date" id="timeline-date-from" name="date_from"
                   value="${escapeHtml(this.filters.dateFrom)}">
          </div>
          <div class="form-field">
            <label for="timeline-date-to">To</label>
            <input class="input" type="date" id="timeline-date-to" name="date_to"
                   value="${escapeHtml(this.filters.dateTo)}">
          </div>
        </div>
        <fieldset class="timeline__types">
          <legend>Interaction types</legend>
          ${this.types
            .map(
              (type) => `
              <label class="timeline__type">
                <input type="checkbox" name="type" value="${escapeHtml(type.value)}"
                       ${this.filters.types.indexOf(type.value) !== -1 ? ' checked' : ''}>
                <span>${escapeHtml(type.label || type.value)}</span>
              </label>`
            )
            .join('')}
        </fieldset>
        <div class="timeline__filter-actions">
          <button type="button" class="btn btn-primary" data-action="apply">Apply filters</button>
          <button type="button" class="btn btn-secondary" data-action="clear">Clear</button>
          <span class="timeline__filter-count" id="timeline-filter-count"></span>
        </div>
      </section>
    `;
  }

  /** "Showing 12 of 40" — without it a filtered list is indistinguishable
   *  from a short history. */
  updateFilterCount() {
    const el = this.root.querySelector('#timeline-filter-count');
    if (!el) return;
    el.textContent =
      this.filtered.length === this.interactions.length
        ? 'Showing all ' + formatNumber(this.interactions.length) + ' recorded interactions.'
        : 'Showing ' + formatNumber(this.filtered.length) + ' of ' + formatNumber(this.interactions.length) + '.';
  }

  renderTimeline() {
    if (this.filtered.length === 0) {
      return (
        '<div class="timeline__state timeline__state--empty"><h2>No matches</h2>' +
        '<p>No interaction matches the current filters. Clear them to see all ' +
        formatNumber(this.interactions.length) +
        ' recorded.</p></div>'
      );
    }

    const groups = groupByDay(this.filtered);

    return `
      <section class="card timeline__panel">
        <h2 class="card__title">Interaction history (${formatNumber(this.filtered.length)})</h2>
        ${Object.keys(groups)
          .sort((a, b) => (a < b ? 1 : -1))
          .map((day) => {
            const items = groups[day];
            return `
              <div class="timeline__group">
                <h3 class="timeline__day">
                  ${escapeHtml(formatDayHeading(day))}
                  <span class="badge">${items.length} item${items.length === 1 ? '' : 's'}</span>
                </h3>
                <ol class="timeline__items">
                  ${items.map((item) => this.renderItem(item)).join('')}
                </ol>
              </div>
            `;
          })
          .join('')}
      </section>
    `;
  }

  renderItem(item) {
    const direction = String(item.direction || 'unknown');
    const type = String(item.interaction_type || 'note');
    const who = item.sales_rep_name ||
      [item.sales_rep_first_name, item.sales_rep_last_name].filter(Boolean).join(' ') ||
      'Unattributed';

    return `
      <li class="timeline__item timeline__item--${escapeHtml(type)} timeline__item--${escapeHtml(direction)}">
        <span class="timeline__marker" aria-hidden="true">${escapeHtml(TYPE_ICONS[type] || 'Note')}</span>
        <div class="timeline__item-body">
          <p class="timeline__item-head">
            <strong>${escapeHtml(labelFor(this.types, type))}</strong>
            <span class="badge">${escapeHtml(direction)}</span>
            <span class="timeline__item-when">${escapeHtml(formatTime(item.created_at))}</span>
          </p>
          ${item.subject ? '<p class="timeline__subject">' + escapeHtml(item.subject) + '</p>' : ''}
          ${item.content || item.summary
            ? '<p class="timeline__content">' +
              escapeHtml(truncate(item.content || item.summary, 200)) +
              '</p>'
            : ''}
          <p class="timeline__meta">
            <span>${escapeHtml(who)}</span>
            ${item.contact_method ? '<span>' + escapeHtml(labelCase(item.contact_method)) + '</span>' : ''}
            ${Number(item.duration_minutes) ? '<span>' + escapeHtml(String(item.duration_minutes)) + ' min</span>' : ''}
            ${item.outcome ? '<span>' + escapeHtml(labelCase(item.outcome)) + '</span>' : ''}
          </p>
          ${item.next_action
            ? '<p class="timeline__next">Next: ' + escapeHtml(item.next_action) +
              (item.next_action_date ? ' (' + escapeHtml(formatDate(item.next_action_date)) + ')' : '') +
              '</p>'
            : ''}
          ${Array.isArray(item.tags) && item.tags.length
            ? '<p class="timeline__tags">' +
              item.tags.map((tag) => '<span class="badge">' + escapeHtml(String(tag)) + '</span>').join('') +
              '</p>'
            : ''}
        </div>
      </li>
    `;
  }

  renderLogForm() {
    return `
      <section class="card timeline__panel">
        <h2 class="card__title">Log an interaction</h2>
        <p class="timeline__hint">
          Writes through <code>POST /.netlify/functions/interactions/log</code> and schedules
          any follow-up rules that match. Customer and type are required; everything
          else is optional.
        </p>
        <form class="timeline__form" id="timeline-log-form">
          <div class="form-field">
            <label for="timeline-log-type">Interaction type</label>
            <select class="select" id="timeline-log-type" name="interaction_type" required>
              ${this.types
                .map(
                  (type) =>
                    '<option value="' + escapeHtml(type.value) + '">' +
                    escapeHtml(type.label || type.value) +
                    '</option>'
                )
                .join('')}
            </select>
          </div>
          <div class="form-field">
            <label for="timeline-log-direction">Direction</label>
            <select class="select" id="timeline-log-direction" name="direction">
              <option value="outbound">Outbound (we contacted them)</option>
              <option value="inbound">Inbound (they contacted us)</option>
            </select>
          </div>
          <div class="form-field">
            <label for="timeline-log-subject">Subject</label>
            <input class="input" type="text" id="timeline-log-subject" name="subject"
                   maxlength="200" placeholder="e.g. Confirmed Saturday test drive">
          </div>
          <div class="form-field">
            <label for="timeline-log-content">Detail</label>
            <textarea class="textarea" id="timeline-log-content" name="content" rows="4"
                      placeholder="What was said, what was agreed."></textarea>
          </div>
          <div class="form-field">
            <label for="timeline-log-outcome">Outcome</label>
            <select class="select" id="timeline-log-outcome" name="outcome">
              <option value="">Not recorded</option>
              <option value="interested">Interested</option>
              <option value="not_interested">Not interested</option>
              <option value="appointment_set">Appointment set</option>
              <option value="sold">Sold</option>
              <option value="no_answer">No answer</option>
            </select>
          </div>
          <div class="form-field">
            <label for="timeline-log-duration">Duration in minutes</label>
            <input class="input" type="number" id="timeline-log-duration" name="duration_minutes"
                   min="0" max="600" step="1" placeholder="15">
          </div>
          <button type="submit" class="btn btn-primary"${this.customerId ? '' : ' disabled aria-disabled="true"'}>Log interaction</button>
          ${
            this.customerId
              ? ''
              : '<span class="timeline__hint">Choose a customer above first.</span>'
          }
        </form>
      </section>
    `;
  }

  // --- events --------------------------------------------------------------

  bindControls() {
    const form = this.root.querySelector('#timeline-search');
    if (form) {
      // Debounced so typing does not re-filter on every keystroke.
      let handle = null;
      form.addEventListener('input', (event) => {
        this.filters.query = event.target.value;
        if (handle) window.clearTimeout(handle);
        handle = window.setTimeout(() => this.applyFilters(), 180);
      });
    }

    this.root.querySelectorAll('.timeline__types input[type="checkbox"]').forEach((box) => {
      box.addEventListener('change', () => {
        this.filters.types = Array.from(
          this.root.querySelectorAll('.timeline__types input[type="checkbox"]:checked')
        ).map((checked) => checked.value);
        this.applyFilters();
      });
    });

    ['#timeline-date-from', '#timeline-date-to'].forEach((selector) => {
      const field = this.root.querySelector(selector);
      if (!field) return;
      field.addEventListener('change', (event) => {
        if (selector === '#timeline-date-from') this.filters.dateFrom = event.target.value;
        else this.filters.dateTo = event.target.value;
        this.applyFilters();
      });
    });

    const applyBtn = this.root.querySelector('[data-action="apply"]');
    if (applyBtn) applyBtn.addEventListener('click', () => this.applyFilters());

    const clearBtn = this.root.querySelector('[data-action="clear"]');
    if (clearBtn) clearBtn.addEventListener('click', () => this.clearFilters());
  }

  bindLogForm() {
    const form = this.root.querySelector('#timeline-log-form');
    if (form) form.addEventListener('submit', (event) => this.logInteraction(event));
  }

  // --- filtering -----------------------------------------------------------

  applyFilters() {
    const query = this.filters.query.trim().toLowerCase();
    const from = this.filters.dateFrom ? new Date(this.filters.dateFrom + 'T00:00:00') : null;
    // A `to` date is inclusive, so run to the end of that day.
    const to = this.filters.dateTo ? new Date(this.filters.dateTo + 'T23:59:59.999') : null;

    this.filtered = this.interactions.filter((item) => {
      if (this.filters.types.length && this.filters.types.indexOf(String(item.interaction_type)) === -1) {
        return false;
      }

      const when = new Date(item.created_at);
      if (from && (Number.isNaN(when.getTime()) || when < from)) return false;
      if (to && (Number.isNaN(when.getTime()) || when > to)) return false;

      if (query) {
        const haystack = [item.subject, item.content, item.summary, item.sales_rep_name]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (haystack.indexOf(query) === -1) return false;
      }

      return true;
    });

    // Only the list is redrawn. Re-rendering the whole body would tear the
    // search <input> out of the document mid-keystroke and drop focus.
    const list = this.root.querySelector('#timeline-list');
    if (list) list.innerHTML = this.renderTimeline();
    this.updateFilterCount();
  }

  clearFilters() {
    this.filters = { types: [], dateFrom: '', dateTo: '', query: '' };

    // Reset the controls in place; they survive because only the list redraws.
    const search = this.root.querySelector('#timeline-search');
    if (search) search.value = '';
    const from = this.root.querySelector('#timeline-date-from');
    if (from) from.value = '';
    const to = this.root.querySelector('#timeline-date-to');
    if (to) to.value = '';
    this.root.querySelectorAll('.timeline__types input[type="checkbox"]').forEach((box) => {
      box.checked = false;
    });

    this.filtered = this.interactions.slice();
    const list = this.root.querySelector('#timeline-list');
    if (list) list.innerHTML = this.renderTimeline();
    this.updateFilterCount();
  }

  // --- log -----------------------------------------------------------------

  async logInteraction(event) {
    event.preventDefault();

    if (!this.customerId) {
      this.showNotice('Choose a customer before logging an interaction.', 'error');
      return;
    }

    const form = event.target;
    const submit = form.querySelector('button[type="submit"]');
    const fields = form.elements;

    const payload = {
      customer_id: this.customerId,
      interaction_type: fields.interaction_type.value,
      direction: fields.direction.value,
      subject: fields.subject.value.trim() || null,
      content: fields.content.value.trim() || null,
      outcome: fields.outcome.value || null
    };

    const duration = Number(fields.duration_minutes.value);
    if (Number.isFinite(duration) && duration > 0) payload.duration_minutes = duration;

    submit.disabled = true;
    this.showNotice('Logging interaction...', 'info');

    const result = await callApi(INTERACTIONS_API + '/log', {
      method: 'POST',
      body: JSON.stringify(payload)
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

    this.showNotice(
      (result.data && result.data.message) || 'Interaction logged.',
      'success'
    );
    // Reload so the new entry comes from the server rather than being
    // optimistically spliced into the local array.
    await this.loadTimeline();
  }
}

// --- helpers ---------------------------------------------------------------

function readCustomerIdFromUrl() {
  try {
    return new URLSearchParams(window.location.search).get('customer_id') || '';
  } catch {
    return '';
  }
}

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value) {
  return num(value).toLocaleString('en-US');
}

function truncate(text, max) {
  const value = String(text || '');
  return value.length <= max ? value : value.slice(0, max) + '…';
}

function labelCase(value) {
  return String(value || '')
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function labelFor(types, value) {
  const found = (types || []).find((type) => type.value === value);
  return found ? found.label || found.value : labelCase(value);
}

function groupByDay(items) {
  const groups = {};
  items.forEach((item) => {
    const when = new Date(item.created_at);
    // An unparseable timestamp goes into its own bucket rather than into
    // "Invalid Date", which is not sortable.
    const key = Number.isNaN(when.getTime()) ? 'unknown' : when.toDateString();
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  });
  Object.keys(groups).forEach((key) => {
    groups[key].sort(
      (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );
  });
  return groups;
}

function formatDayHeading(day) {
  if (day === 'unknown') return 'Date not recorded';
  const date = new Date(day);
  if (Number.isNaN(date.getTime())) return String(day);

  const today = new Date();
  const yesterday = new Date(today.getTime() - 86400000);

  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';

  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// --- boot ------------------------------------------------------------------

function init() {
  const root = document.getElementById('interaction-timeline-app');
  if (!root) {
    console.error('[interaction-timeline] #interaction-timeline-app mount point not found; skipping init.');
    return;
  }
  new InteractionTimeline(root).start();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
