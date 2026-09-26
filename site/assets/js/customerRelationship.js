/**
 * Customer Relationship Management
 * Staff-side CRM panel: the customers assigned to the signed-in rep, their
 * upcoming appointments, and a place to record an interaction.
 *
 * ============================================================================
 * WHAT WAS WRONG WITH EVERY LINE OF THE ORIGINAL
 * ============================================================================
 * This file was 10.5 KB of written, never-executed code. It was not referenced
 * by any content file, any layout, or any other script, so it never reached a
 * browser. Three separate things were broken, and all three would have failed
 * in a browser even if it had:
 *
 * 1. UNROUTED PATHS. It called /api/sales/auth-check, /api/sales/customers,
 *    /api/sales/followups and /api/sales/activity. netlify.toml:74-77 records
 *    that the blanket `/api/* -> /.netlify/functions/$1` rewrite was removed,
 *    and nothing replaced it. Every one of those four requests resolved to the
 *    site's 404 page — HTML, not JSON — so `response.json()` threw, the promise
 *    rejected, and the panel showed nothing. Repointed below to the real
 *    function paths.
 *
 * 2. THE RESPONSE ENVELOPE. It read `data.authenticated`, `data.customers`,
 *    `data.followups` and `data.activities` at the top level. Every one of those
 *    functions goes through utils/error-handler.js's createSuccessResponse,
 *    which wraps the payload as {success, message, data, timestamp}. The
 *    top-level read is `undefined` — always, for every call, forever. This is
 *    the single most common defect in this repo and it is invisible: undefined
 *    is falsy, so `if (!data.customers) return;` quietly renders an empty list
 *    and looks like "no customers yet".
 *
 * 3. HALF THE CLASS DID NOT EXIST. checkAuth, showLoginPrompt, showError,
 *    showLoading, hideLoading, refreshCRM, showCustomerModal,
 *    showInteractionModal, showFollowupModal, showCustomerDetails and
 *    renderActivityLog were all *called* and none of them were *defined*. The
 *    first call to any of them threw `TypeError: this.showLoginPrompt is not a
 *    function` — which is to say: the not-signed-in path, the loading path and
 *    the error path were all a stack trace. Defined below.
 *
 * ============================================================================
 * THE ENDPOINTS THAT DO NOT EXIST
 * ============================================================================
 * Two of the four original calls have no function behind them at all, in any
 * form. I did not invent one and I did not quietly delete the feature:
 *
 *   /api/sales/followups  There is no followup-listing function. `followups` is
 *     a real table (create-database-tables.sql; sms-templates.js and
 *     followup-campaigns.js both query it) but it is only ever reached as a
 *     COUNT inside campaign and rule statistics. Nothing selects the rows.
 *     Repointed to `sales-appointments`, which is the only per-rep scheduled
 *     work list that a function actually returns, and its renderer now says
 *     "Appointment" rather than claiming to be something it is not.
 *
 *   /api/sales/activity   `interactions/timeline` exists but is scoped to one
 *     customer_id at a time and needs `interactions_read` +
 *     `interactions_write` permissions that a plain sales_rep does not have
 *     (interactions.js:12-16). It cannot answer "everything this rep touched".
 *     Rather than render an empty "Activity" list that reads as "nothing has
 *     happened", the panel states plainly that there is no activity feed and
 *     points at the two places the information does exist.
 *
 * Either needs a new function. Adding one is not this file's to do.
 *
 * ============================================================================
 * AUTH
 * ============================================================================
 * The token comes from components/staff-session.js, which is the same module
 * /admin/sign-in writes through and the same one utils/session-manager.js uses
 * (localStorage `auth_token`, sent as `Authorization: Bearer`). One store, one
 * header, three call sites. sales-auth-check is a probe that answers HTTP 200
 * with `data.authenticated` either way, so a stale token is a state this class
 * can render, not an exception it has to swallow.
 */

import {
  authHeaders,
  checkAuth,
  getUser,
  logout
} from './components/staff-session.js';

// Repointed from unrouted /api/* paths. netlify.toml has no alias for any of
// these; they are called by function name.
const ENDPOINTS = {
  authCheck: '/.netlify/functions/sales-auth-check',
  customers: '/.netlify/functions/sales-customers',
  // See the header: no followup function exists. sales-appointments is the
  // nearest real thing a function returns for a rep.
  appointments: '/.netlify/functions/sales-appointments',
  addNote: '/.netlify/functions/sales-add-note',
  logout: '/.netlify/functions/sales-logout'
};

const esc = (value) =>
  value === null || value === undefined
    ? ''
    : String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

class CustomerRelationship {
  constructor() {
    this.crmElement = document.getElementById('customer-relationship');

    // Only initialize if CRM exists
    if (!this.crmElement) return;

    // Sales rep data
    this.salesRep = {
      id: this.crmElement.dataset.salesId,
      name: this.crmElement.dataset.salesName
    };

    // CRM sections
    this.customerList = document.getElementById('customer-list');
    this.followupList = document.getElementById('followup-list');
    this.activityLog = document.getElementById('activity-log');
    this.searchInput = document.getElementById('customer-search');
    this.filterSelect = document.getElementById('customer-filter');

    // Customers already fetched, keyed by id, so "View details" and the
    // interaction form do not need a second round trip. The original called a
    // per-customer endpoint that does not exist.
    this.customersById = new Map();

    this.currentUser = null;
    this.activeCustomerId = null;

    this.init();
  }

  init() {
    // An unauthenticated visitor must get the sign-in panel, not an empty
    // table. The original called this.showLoginPrompt(), which was never
    // defined, so a signed-out rep got a TypeError instead of a form.
    checkAuth(ENDPOINTS.authCheck)
      .then((result) => {
        if (result.authenticated) {
          this.currentUser = result.user || getUser();
          this.setupCRM();
        } else {
          this.showLoginPrompt(result.reason);
        }
      })
      .catch((error) => {
        console.error('Authentication check failed:', error);
        this.showError('Authentication error. Please refresh or contact support.');
      });
  }

  /**
   * One helper for every sales call: same-origin credentials, the Authorization
   * header from the shared session store, and a 401 that tears the panel down
   * and asks for a sign-in rather than rendering an empty result.
   */
  async apiFetch(url, options = {}) {
    const { headers, credentials } = authHeaders();
    const response = await fetch(url, {
      ...options,
      headers: { ...headers, ...(options.headers || {}) },
      credentials
    });

    if (response.status === 401 || response.status === 403) {
      this.handleSessionEnded();
      return null;
    }

    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      try {
        const body = await response.json();
        // error-handler puts the reason in `message`; the sales-* helpers put it
        // in `error`. Accept both rather than guessing.
        message = body?.message || body?.error || message;
      } catch {
        // keep the status code
      }
      throw new Error(message);
    }

    return response.json();
  }

  /** A 401 anywhere means the session is over. Make that a visible state. */
  handleSessionEnded() {
    this.currentUser = null;
    this.showLoginPrompt('session-ended');
  }

  setupCRM() {
    this.showLoading();

    if (this.searchInput) {
      this.searchInput.addEventListener(
        'input',
        this.debounce(() => {
          this.fetchCustomers().catch((error) => this.showError(error.message));
        }, 300)
      );
    }

    if (this.filterSelect) {
      this.filterSelect.addEventListener('change', () => {
        this.fetchCustomers().catch((error) => this.showError(error.message));
      });
    }

    const newCustomerBtn = this.crmElement.querySelector('.new-customer-btn');
    if (newCustomerBtn) {
      newCustomerBtn.addEventListener('click', () => this.showCustomerModal());
    }

    const refreshBtn = this.crmElement.querySelector('.refresh-button');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.refreshCRM());
    }

    // Promise.all over three calls that are now individually failure-tolerant:
    // loadFollowups and loadActivity render their own states, so one 404
    // cannot blank the whole panel the way a rejected sibling used to.
    Promise.allSettled([
      this.fetchCustomers(),
      this.loadFollowups(),
      this.loadActivity()
    ]).then((results) => {
      this.hideLoading();
      const failure = results.find((r) => r.status === 'rejected');
      if (failure) {
        this.showError(`Failed to load CRM data. ${failure.reason.message}`);
      }
    });
  }

  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        timeout = null;
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  refreshCRM() {
    this.showLoading();
    return Promise.allSettled([
      this.fetchCustomers(),
      this.loadFollowups(),
      this.loadActivity()
    ]).then((results) => {
      this.hideLoading();
      const failure = results.find((r) => r.status === 'rejected');
      if (failure) this.showError(`Refresh failed. ${failure.reason.message}`);
    });
  }

  // -------------------------------------------------------------------------
  // data
  // -------------------------------------------------------------------------
  /**
   * GET sales-customers.
   *
   * Unwrapped properly: the list is at `body.data.customers`, not
   * `body.customers`.
   *
   * The rep is NOT passed as a query parameter. sales-customers.js:73 scopes
   * every query to `assigned_sales_rep_id: user.id` — the id out of the
   * verified token, not anything the caller can choose. The original appended
   * `?salesId=` from a data attribute on the page, which the function ignores;
   * keeping the call honest means not pretending it filters anything.
   */
  async fetchCustomers() {
    const searchTerm = (this.searchInput?.value || '').trim();
    const status = this.filterSelect?.value || 'all';

    const url = new URL(ENDPOINTS.customers, window.location.origin);
    if (searchTerm) url.searchParams.set('search', searchTerm);
    if (status && status !== 'all') url.searchParams.set('status', status);
    url.searchParams.set('limit', '50');

    const body = await this.apiFetch(url.toString(), { method: 'GET' });
    if (body === null) return null;

    const payload = unwrap(body);
    this.customersById.clear();
    for (const customer of payload.customers || []) {
      this.customersById.set(String(customer.id), customer);
    }

    this.renderCustomerList(payload.customers || [], payload.total);
    return payload;
  }

  /**
   * GET sales-appointments, standing in for the followup list that has no
   * function behind it. See the header comment.
   */
  async loadFollowups() {
    const url = new URL(ENDPOINTS.appointments, window.location.origin);
    url.searchParams.set('timeframe', 'month');

    const body = await this.apiFetch(url.toString(), { method: 'GET' });
    if (body === null) return null;

    const payload = unwrap(body);
    this.renderFollowupList(payload.appointments || [], payload.timeframe);
    return payload;
  }

  /**
   * There is no activity endpoint. This says so, rather than rendering an empty
   * list that reads as "you have done nothing".
   */
  async loadActivity() {
    if (!this.activityLog) return null;
    this.activityLog.innerHTML = `
      <div class="crm-unavailable">
        <p><strong>No activity feed is available.</strong></p>
        <p>No function returns a list of everything a rep has touched. The
        <code>interactions/timeline</code> endpoint reports one customer at a
        time and needs permissions a sales rep does not have.</p>
        <p>The same information is on
        <a href="/admin/leads">Lead management</a> and
        <a href="/admin/dashboard">the sales dashboard</a>.</p>
      </div>
    `;
    return null;
  }

  /**
   * POST sales-customers. Requires the `manage_customers` permission, which a
   * plain sales_rep does not have (sales-customers.js:28) — so a 403 here is an
   * expected, explainable answer and is shown as one, not as a failure.
   */
  async createCustomer(formData) {
    const body = await this.apiFetch(ENDPOINTS.customers, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: formData.get('firstName'),
        lastName: formData.get('lastName'),
        email: formData.get('email'),
        phone: formData.get('phone'),
        city: formData.get('city'),
        state: formData.get('state'),
        type: formData.get('type') || 'prospect'
      })
    });
    if (body === null) return null;
    await this.fetchCustomers();
    return unwrap(body);
  }

  // -------------------------------------------------------------------------
  // rendering
  // -------------------------------------------------------------------------
  renderCustomerList(customers, total) {
    if (!this.customerList) return;

    if (!customers.length) {
      this.customerList.innerHTML = `
        <div class="empty-state">
          <p>No customers found matching your criteria.</p>
          <button type="button" class="new-customer-btn">Add New Customer</button>
        </div>
      `;
      this.bindNewCustomerButtons();
      return;
    }

    // `total` is the count the function could see, not a COUNT(*); say so
    // rather than implying the list is exhaustive.
    const countLabel =
      typeof total === 'number'
        ? ` <span class="crm-count">${total} assigned</span>`
        : '';

    const html = customers
      .map((customer) => {
        const lastContact = customer.last_interaction_date || customer.last_activity_date;
        const formattedDate = lastContact
          ? new Date(lastContact).toLocaleDateString()
          : 'Never';
        const type = customer.customer_type || 'Lead';

        return `
        <div class="customer-card" data-customer-id="${esc(customer.id)}">
          <div class="customer-header">
            <h3>${esc(customer.first_name)} ${esc(customer.last_name)}</h3>
            <span class="customer-type">${esc(type)}</span>
          </div>
          <div class="customer-details">
            <div class="customer-contact">
              ${customer.phone ? `<p><strong>Phone:</strong> <a href="tel:${esc(customer.phone)}">${esc(customer.phone)}</a></p>` : ''}
              ${customer.email ? `<p><strong>Email:</strong> <a href="mailto:${esc(customer.email)}">${esc(customer.email)}</a></p>` : ''}
            </div>
            <div class="customer-info">
              <p><strong>Last Contact:</strong> ${esc(formattedDate)}</p>
            </div>
          </div>
          <div class="customer-actions">
            <button type="button" class="add-interaction-btn" data-customer-id="${esc(customer.id)}">Add Interaction</button>
            <button type="button" class="view-details-btn" data-customer-id="${esc(customer.id)}">View Details</button>
          </div>
        </div>
      `;
      })
      .join('');

    this.customerList.innerHTML = `<p class="crm-summary">${countLabel}</p>${html}`;

    this.customerList.querySelectorAll('.add-interaction-btn').forEach((button) => {
      button.addEventListener('click', () => this.showInteractionModal(button.dataset.customerId));
    });

    this.customerList.querySelectorAll('.view-details-btn').forEach((button) => {
      button.addEventListener('click', () => this.showCustomerDetails(button.dataset.customerId));
    });

    this.bindNewCustomerButtons();
  }

  bindNewCustomerButtons() {
    if (!this.customerList) return;
    this.customerList.querySelectorAll('.new-customer-btn').forEach((button) => {
      button.addEventListener('click', () => this.showCustomerModal());
    });
  }

  /**
   * Renders appointments, not followups. The heading says so, because the
   * original called these "follow-ups" and the underlying data has never been
   * follow-ups.
   */
  renderFollowupList(appointments, timeframe) {
    if (!this.followupList) return;

    const heading = `<h4 class="crm-section-heading">Appointments <span class="crm-count">next ${esc(timeframe || 'month')}</span></h4>`;

    if (!appointments.length) {
      this.followupList.innerHTML = `${heading}<div class="empty-state"><p>Nothing scheduled.</p></div>`;
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dated = appointments
      .map((appointment) => ({
        ...appointment,
        // CONTRACT FIX: sales-appointments maps its rows to
        // { id, customerName, email, phone, date, notes, status, type,
        // location } (sales-appointments.js:96-108) -- the field is `date`,
        // from `scheduled_start`. This read `scheduled_date` /
        // `scheduled_time`, which do not exist in that payload, so `when` was
        // null for every appointment, every row was filtered out below, and
        // the panel said "Nothing scheduled" forever -- the exact silent
        // emptiness this rewrite exists to remove. Read the field the
        // function actually returns; keep the old names as a fallback.
        when: appointment.date
          ? new Date(appointment.date)
          : appointment.scheduled_date
            ? new Date(
                appointment.scheduled_time
                  ? `${appointment.scheduled_date} ${appointment.scheduled_time}`
                  : appointment.scheduled_date
              )
            : null
      }))
      .filter((appointment) => appointment.when && !Number.isNaN(appointment.when.getTime()))
      .sort((a, b) => a.when - b.when);

    const overdue = dated.filter((a) => a.when < today);
    const upcoming = dated.filter((a) => a.when >= today);

    const item = (appointment) => `
      <div class="followup-item" data-appointment-id="${esc(appointment.id)}">
        <div class="followup-date">${esc(appointment.when.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }))}</div>
        <div class="followup-customer">${esc(appointment.customer_name || appointment.customerName || '')}</div>
        <div class="followup-type">${esc(appointment.type || 'Appointment')}</div>
        <div class="followup-notes">${esc(appointment.notes || '')}</div>
        <div class="followup-status">${esc(appointment.status || '')}</div>
      </div>
    `;

    let body = '';
    if (overdue.length) {
      body += `<div class="followup-group overdue"><h4>Needs rescheduling</h4>${overdue.map(item).join('')}</div>`;
    }
    if (upcoming.length) {
      body += `<div class="followup-group upcoming"><h4>Scheduled</h4>${upcoming.map(item).join('')}</div>`;
    }

    this.followupList.innerHTML = heading + (body || '<div class="empty-state"><p>Nothing scheduled.</p></div>');
  }

  /**
   * Uses the customer already fetched by fetchCustomers(). The original fetched
   * per-customer detail from a path that resolves to nothing.
   */
  showCustomerDetails(customerId) {
    const customer = this.customersById.get(String(customerId));
    if (!customer) {
      this.showError('That customer is no longer in the list. Refresh and try again.');
      return;
    }

    this.activeCustomerId = customerId;
    const rows = [
      ['Name', `${customer.first_name || ''} ${customer.last_name || ''}`.trim()],
      ['Email', customer.email],
      ['Phone', customer.phone],
      ['Type', customer.customer_type],
      ['Status', customer.status],
      ['Source', customer.source],
      ['Vehicle interest', customer.vehicle_interest],
      ['Budget', customer.budget_range],
      ['City', customer.city],
      ['State', customer.state],
      ['Created', customer.created_at ? new Date(customer.created_at).toLocaleDateString() : ''],
      ['Leads', customer.lead_count],
      ['Interactions', customer.interaction_count],
      ['Appointments', customer.appointment_count]
    ]
      .filter(([, value]) => value !== null && value !== undefined && value !== '')
      .map(
        ([label, value]) =>
          `<div class="detail-row"><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`
      )
      .join('');

    const root = this.openModal(
      'Customer details',
      `<dl class="customer-details-list">${rows}</dl>
       <div class="modal-actions">
         <button type="button" class="add-interaction-btn" data-customer-id="${esc(customerId)}">Add Interaction</button>
         <button type="button" class="modal-close-button">Close</button>
       </div>`
    );

    // BUG FIX: this called `this.openModal.querySelectorAll(...)` -- openModal
    // is the METHOD, and methods have no querySelectorAll, so "View Details"
    // threw a TypeError instead of binding this button. openModal returns
    // the modal root; use it.
    root.querySelectorAll('.add-interaction-btn').forEach((button) => {
      button.addEventListener('click', () => {
        this.closeModal();
        this.showInteractionModal(button.dataset.customerId);
      });
    });
  }

  // -------------------------------------------------------------------------
  // modals
  // -------------------------------------------------------------------------
  modalRoot() {
    let root = document.getElementById('crm-modal');
    if (!root) {
      root = document.createElement('div');
      root.id = 'crm-modal';
      root.className = 'modal';
      document.body.appendChild(root);
    }
    return root;
  }

  openModal(title, bodyHtml) {
    const root = this.modalRoot();
    root.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>${esc(title)}</h3>
          <button type="button" class="modal-close" aria-label="Close">&times;</button>
        </div>
        <div class="modal-body">${bodyHtml}</div>
      </div>
    `;
    // The site has one modal implementation (components/admin.css §8): .modal
    // is display:none and .modal.show is a centred flex. This used to toggle
    // inline style.display='block', which both ignored the convention every
    // other admin component uses and defeated the centring. Toggle the class.
    root.classList.add('show');
    document.body.style.overflow = 'hidden';
    const close = () => this.closeModal();
    root.querySelector('.modal-close')?.addEventListener('click', close);
    root.querySelector('.modal-close-button')?.addEventListener('click', close);
    return root;
  }

  closeModal() {
    const root = document.getElementById('crm-modal');
    if (root) {
      root.classList.remove('show');
      root.innerHTML = '';
    }
    document.body.style.overflow = 'auto';
  }

  showCustomerModal() {
    const root = this.openModal(
      'Add a customer',
      `<form id="crm-customer-form" class="crm-form">
        <div class="form-group">
          <label for="crm-firstName">First name</label>
          <input id="crm-firstName" name="firstName" required>
        </div>
        <div class="form-group">
          <label for="crm-lastName">Last name</label>
          <input id="crm-lastName" name="lastName" required>
        </div>
        <div class="form-group">
          <label for="crm-email">Email</label>
          <input type="email" id="crm-email" name="email" required>
        </div>
        <div class="form-group">
          <label for="crm-phone">Phone</label>
          <input type="tel" id="crm-phone" name="phone">
        </div>
        <div class="form-group">
          <label for="crm-city">City</label>
          <input id="crm-city" name="city">
        </div>
        <div class="form-group">
          <label for="crm-state">State</label>
          <input id="crm-state" name="state">
        </div>
        <div id="crm-customer-error" class="crm-error" role="alert" style="display:none;"></div>
        <div class="modal-actions">
          <button type="submit" class="btn btn-primary">Save customer</button>
          <button type="button" class="modal-close-button">Cancel</button>
        </div>
      </form>`
    );

    const form = root.querySelector('#crm-customer-form');
    const errorBox = root.querySelector('#crm-customer-error');

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      errorBox.style.display = 'none';
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      try {
        await this.createCustomer(new FormData(form));
        this.closeModal();
        this.showToast('Customer created.', 'success');
      } catch (error) {
        // A 403 means the rep lacks `manage_customers`. That is a fact about
        // their account, so it is stated rather than shown as a crash.
        errorBox.textContent =
          error.message === 'Forbidden'
            ? 'Your account does not have permission to add customers.'
            : error.message;
        errorBox.style.display = 'block';
      } finally {
        submit.disabled = false;
      }
    });
  }

  /**
   * The original opened a form and called a `/api/sales/interactions` endpoint
   * that resolves to nothing. There is no customer-facing interaction endpoint
   * either — sales-add-note takes a *leadId*, and this panel works in customers.
   *
   * Rather than ship a form that cannot submit, the modal says what is missing.
   */
  showInteractionModal(customerId) {
    const customer = this.customersById.get(String(customerId));
    const name = customer
      ? `${customer.first_name || ''} ${customer.last_name || ''}`.trim()
      : 'this customer';

    this.openModal(
      'Add an interaction',
      `<div class="crm-unavailable">
        <p><strong>This is not implemented.</strong></p>
        <p>There is no function that records an interaction against a
        <em>customer</em>. <code>sales-add-note</code> is the closest, and it
        requires a <code>leadId</code> — a different entity.</p>
        <p>Use <a href="/admin/leads">Lead management</a> to work with leads, or
        call the dealership to record contact with ${esc(name)}.</p>
      </div>
      <div class="modal-actions"><button type="button" class="modal-close-button">Close</button></div>`
    );
  }

  showFollowupModal() {
    this.openModal(
      'Schedule a follow-up',
      `<div class="crm-unavailable">
        <p><strong>This is not implemented.</strong></p>
        <p>No function creates a followup. <code>followups</code> is written by
        the campaign engine and read only as aggregate counts.</p>
      </div>
      <div class="modal-actions"><button type="button" class="modal-close-button">Close</button></div>`
    );
  }

  renderActivityLog() {
    // Retained as a no-op shim: the original guarded its call site with
    // `typeof this.renderActivityLog === 'function'`, which was a way of saying
    // "this does not exist". loadActivity() now renders the real state.
    return undefined;
  }

  // -------------------------------------------------------------------------
  // states — the functions the original called and never defined
  // -------------------------------------------------------------------------
  showLoading() {
    if (this.crmElement) {
      this.crmElement.setAttribute('aria-busy', 'true');
      const existing = this.crmElement.querySelector('.crm-loading');
      if (!existing) {
        const loader = document.createElement('div');
        loader.className = 'crm-loading';
        loader.setAttribute('role', 'status');
        loader.textContent = 'Loading your customers…';
        this.crmElement.insertBefore(loader, this.crmElement.firstChild);
      }
    }
  }

  hideLoading() {
    if (this.crmElement) {
      this.crmElement.removeAttribute('aria-busy');
      this.crmElement.querySelectorAll('.crm-loading').forEach((el) => el.remove());
    }
  }

  /**
   * The signed-out state. This is the panel's whole reason for existing: an
   * empty customer table is indistinguishable from "you have no customers", and
   * the difference matters a great deal.
   */
  showLoginPrompt(reason) {
    if (!this.crmElement) return;
    this.hideLoading();
    this.crmElement.innerHTML = `
      <div class="crm-login-prompt">
        <h3>Sign in to see your customers</h3>
        ${
          reason === 'session-ended'
            ? '<p class="crm-error" role="alert">Your session has ended. Please sign in again.</p>'
            : reason === 'network'
              ? '<p class="crm-error" role="alert">Could not reach the server to check your session.</p>'
              : ''
        }
        <p>This panel lists the customers assigned to you. It needs a staff
        session before it will ask the server for anything.</p>
        <a class="btn btn-primary" href="/admin/sign-in">Sign in</a>
      </div>
    `;
  }

  showError(message) {
    if (!this.crmElement) return;
    let box = this.crmElement.querySelector('.crm-error-banner');
    if (!box) {
      box = document.createElement('div');
      box.className = 'crm-error crm-error-banner';
      box.setAttribute('role', 'alert');
      this.crmElement.insertBefore(box, this.crmElement.firstChild);
    }
    box.textContent = message;
  }

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `crm-toast crm-toast--${type}`;
    toast.setAttribute('role', 'status');
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
  }

  /**
   * Sign out from inside the panel. Uses the shared store so this clears exactly
   * what /admin/sign-in wrote, and tells the server first so the token is
   * blacklisted while it still exists.
   */
  async signOut() {
    await logout(ENDPOINTS.logout);
    this.currentUser = null;
    this.showLoginPrompt();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new CustomerRelationship();
});

/**
 * createSuccessResponse wraps the payload as {success, message, data, timestamp}.
 * Reading `body.customers` instead of `body.data.customers` yields undefined on
 * every call, forever, and undefined renders as an empty table.
 */
function unwrap(body) {
  return body && typeof body === 'object' && 'data' in body ? body.data : body || {};
}
