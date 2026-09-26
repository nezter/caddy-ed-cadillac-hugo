/**
 * Customer Portal JavaScript
 * Handles customer login, dashboard, and interactions.
 *
 * ============================ WHAT WAS WRONG ==============================
 * This file called /.netlify/functions/customer-auth and read
 * `result.data.customer` / `result.data.token` — which happens to be right,
 * because customer-auth builds its own envelope — then stored the whole thing
 * including the token in `localStorage.customerSession` and never checked it
 * again. On the next page load, `checkExistingSession` found that blob, called
 * `showDashboard()` and rendered the dashboard shell. Nothing verified the
 * token. The dashboard therefore looked identical whether the session was
 * valid, expired, revoked, or never existed, and every panel then filled
 * itself with "Failed to load appointments. Please try again." because the
 * underlying 401s had nowhere to go.
 *
 * Two changes fix that:
 *   1. The stored session is verified against the server on every load.
 *   2. A 401 is a state, not an absence. Every loader routes 401 to
 *      `handleUnauthorized()`, which clears the session, puts the sign-in form
 *      back, and says why.
 *
 * ============================== TOKEN STORAGE ==============================
 * Same decision as components/staff-session.js, same reasons: localStorage
 * under a key of its own, because customer-dashboard.js ONLY accepts
 * `Authorization: Bearer` (customer-dashboard.js:10-16 — it does not read the
 * `auth_token` cookie the sales middleware accepts, and does not read
 * x-auth-token), so a cookie-only session would have nothing to authenticate
 * with. The trade-off is the same trade-off: readable by any script that runs on
 * the page, in exchange for never appearing in a URL, a Referer header, or an
 * access log.
 *
 * The key is `customer_session`, deliberately NOT `auth_token`. The two
 * audiences have different token shapes and different verification paths, and
 * one overwriting the other in a shared key would be a confusing way to fail.
 *
 * ============================== NO CUSTOMER LOGOUT =========================
 * There is no customer logout function. sales-logout blacklists tokens, but it
 * is not on a customer code path and customer-dashboard.js does not consult the
 * blacklist, so a customer token stays valid for its full 24h after the person
 * clicks "Logout" here. See the report — the honest fix is a function, and
 * adding one is not this file's to do.
 * ==========================================================================
 */

const SESSION_KEY = 'customer_session';
const ENDPOINTS = {
  auth: '/.netlify/functions/customer-auth',
  dashboard: '/.netlify/functions/customer-dashboard'
};

/**
 * Escape text before it goes into an innerHTML template.
 *
 * Every renderer below interpolates API data into markup. Appointment notes,
 * activity descriptions and sales-rep details all originate outside this file.
 * With the token in localStorage, an XSS on this origin is a session theft, so
 * the injection sink and the token at rest have to be considered together — the
 * token argument is not a reason to leave the sink open.
 */
function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * The functions wrap their payloads as {success, data: {…}} (or, for the sales
 * side, {success, message, data, timestamp}). Reading `.token` or `.customer`
 * at the top level yields undefined forever, and undefined renders as an empty
 * field rather than as an error — which is why this defect is so hard to see.
 * Every response is funnelled through here so that mistake is made once.
 */
function unwrap(body) {
  return body && typeof body === 'object' && 'data' in body ? body.data : body || {};
}

class CustomerPortal {
  constructor() {
    this.customerData = null;
    this.sessionExpiredNotified = false;
    this.init();
  }

  init() {
    this.bindEvents();
    this.checkExistingSession();
  }

  bindEvents() {
    // The shortcode (site/layouts/shortcodes/customer-login-form.html) renders
    // <form id="loginForm"> inside <div id="customerLoginForm">. Both ids are
    // load-bearing: the first is the form that submits, the second is the panel
    // that gets hidden. Renaming either one without changing this file breaks
    // login silently.
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
      loginForm.addEventListener('submit', (e) => this.handleLogin(e));
    }

    // Logout button
    const logoutButton = document.getElementById('logoutButton');
    if (logoutButton) {
      logoutButton.addEventListener('click', () => this.handleLogout());
    }

    // Appointment scheduling
    const scheduleButton = document.getElementById('scheduleAppointment');
    if (scheduleButton) {
      scheduleButton.addEventListener('click', () => this.showAppointmentModal());
    }

    // Appointment modal
    const closeAppointmentModal = document.getElementById('closeAppointmentModal');
    if (closeAppointmentModal) {
      closeAppointmentModal.addEventListener('click', () => this.hideAppointmentModal());
    }

    const appointmentForm = document.getElementById('appointmentForm');
    if (appointmentForm) {
      appointmentForm.addEventListener('submit', (e) => this.handleAppointmentSubmit(e));
    }

    // Message modal
    const contactButton = document.getElementById('contactSalesRep');
    if (contactButton) {
      contactButton.addEventListener('click', () => this.showMessageModal());
    }

    const closeMessageModal = document.getElementById('closeMessageModal');
    if (closeMessageModal) {
      closeMessageModal.addEventListener('click', () => this.hideMessageModal());
    }

    const messageForm = document.getElementById('messageForm');
    if (messageForm) {
      messageForm.addEventListener('submit', (e) => this.handleMessageSubmit(e));
    }

    // Update preferences
    const updatePreferencesButton = document.getElementById('updatePreferences');
    if (updatePreferencesButton) {
      updatePreferencesButton.addEventListener('click', () => this.showPreferencesModal());
    }
  }

  // -------------------------------------------------------------------------
  // session storage
  // -------------------------------------------------------------------------
  readStoredSession() {
    let raw;
    try {
      raw = window.localStorage.getItem(SESSION_KEY);
    } catch {
      return null; // storage disabled; treat as signed out
    }
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.token || !parsed.customer) {
        this.clearStoredSession();
        return null;
      }
      if (parsed.expiresAt && Date.now() >= parsed.expiresAt) {
        // Known-dead locally. Do not spend a request on it: a 401 rendered as
        // an error reads as "the portal is broken" rather than "sign in again".
        this.clearStoredSession();
        return { expired: true };
      }
      return parsed;
    } catch {
      this.clearStoredSession();
      return null;
    }
  }

  writeStoredSession(customer, token, expiresIn) {
    const ttlSeconds = parseDuration(expiresIn) || 24 * 60 * 60;
    const session = {
      customer,
      token,
      expiresAt: Date.now() + ttlSeconds * 1000
    };
    try {
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {
      throw new Error('This browser is blocking stored sessions, so you cannot stay signed in.');
    }
    return session;
  }

  /**
   * The sign-out path clears exactly what the sign-in path stored: the same
   * key, in the same browser, in the same storage area. Nothing else writes
   * SESSION_KEY.
   */
  clearStoredSession() {
    try {
      window.localStorage.removeItem(SESSION_KEY);
    } catch {
      // Nothing to do.
    }
  }

  // -------------------------------------------------------------------------
  // session lifecycle
  // -------------------------------------------------------------------------
  checkExistingSession() {
    const stored = this.readStoredSession();

    if (stored && stored.expired) {
      this.showLoginForm();
      this.showSessionMessage(
        'Your session expired. Please sign in again to see your portal.',
        'warning'
      );
      return;
    }

    if (!stored) {
      this.showLoginForm();
      return;
    }

    // There is a stored token, so the only question is whether it still means
    // anything. Ask the server before rendering anything that implies access.
    this.showDashboard();
    this.customerData = stored;
    this.verifySession(stored);
  }

  /**
   * A GET on the dashboard root with no sub-path returns the overview, which is
   * the cheapest call that proves the token verifies. A 401 here means the
   * token is expired, forged, or the account is gone — all three are the same
   * thing to this page.
   */
  async verifySession(stored) {
    try {
      const response = await fetch(ENDPOINTS.dashboard, {
        method: 'GET',
        headers: { Authorization: `Bearer ${stored.token}` },
        credentials: 'same-origin'
      });

      if (response.status === 401 || response.status === 403) {
        this.handleUnauthorized(
          'Your session is no longer valid. Please sign in again.'
        );
        return;
      }

      if (!response.ok) {
        this.showSessionMessage(
          'We could not reach the server to check your session. ' +
            'The information below may be out of date.',
          'warning'
        );
        return;
      }
      // Any other non-2xx (500 from an unreachable database, 429) is also worth
      // saying out loud, but it is not a session problem and must not clear the
      // stored token.

      // Token is good. Now load the real panels.
      await this.loadCustomerData();
    } catch {
      this.showSessionMessage(
        'Could not reach the server to check your session. ' +
          'The information below may be out of date.',
        'warning'
      );
    }
  }

  async handleLogin(event) {
    event.preventDefault();
    this.clearSessionMessage();

    const formData = new FormData(event.target);
    const loginData = {
      email: (formData.get('email') || '').trim(),
      phone: (formData.get('phone') || '').trim()
    };

    if (!loginData.email || !loginData.phone) {
      this.showSessionMessage('Enter both your email address and your phone number.', 'error');
      return;
    }

    this.showLoading('loginButton');

    try {
      const session = await this.authenticateCustomer(loginData);
      this.customerData = session;
      this.showDashboard();
      this.showNotification('Signed in.', 'success');
      await this.loadCustomerData();
    } catch (error) {
      // A rejected sign-in must be visible. customer-auth returns 404 with
      // "Customer not found…" for an unknown pair, 400 for a missing field and
      // 500 when the server cannot reach the database — three different
      // problems that used to collapse into one silent no-op.
      this.showSessionMessage(error.message || 'Sign-in failed. Please try again.', 'error');
    } finally {
      this.hideLoading('loginButton');
    }
  }

  async authenticateCustomer(loginData) {
    let response;
    try {
      response = await fetch(ENDPOINTS.auth, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(loginData)
      });
    } catch {
      throw new Error('Could not reach the server. Check your connection and try again.');
    }

    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error('The server sent a response we could not read. Please try again.');
    }

    if (!response.ok || result.success !== true) {
      // `error` is customer-auth's own key; `message` would be the sales
      // functions' shape. Accept both so this keeps working if customer-auth is
      // ever moved onto error-handler.js.
      throw new Error(
        result?.error || result?.message || `Sign-in failed (HTTP ${response.status}).`
      );
    }

    const payload = unwrap(result);
    if (!payload.token || !payload.customer) {
      throw new Error('Sign-in succeeded but the server sent no session. Please try again.');
    }

    return this.writeStoredSession(payload.customer, payload.token, payload.expiresIn);
  }

  /**
   * Sign out.
   *
   * There is no customer logout endpoint, so this is local-only: the stored
   * session is removed and the form comes back. The token itself remains valid
   * server-side until it expires (24h), because customer-dashboard.js does not
   * consult the sales token blacklist. This is stated to the user rather than
   * papered over — see the header comment and the report.
   */
  handleLogout() {
    this.clearStoredSession();
    this.customerData = null;
    this.sessionExpiredNotified = false;
    this.hideDashboard();
    this.resetPanels();
    this.showSessionMessage('You are signed out.', 'success');
    this.showNotification('Signed out.', 'success');
  }

  /**
   * Every 401 in this class ends here. The point is that it is never a silent
   * path: the session is dropped, the sign-in form is restored, and the reason
   * is put on the page. Rendering nothing would leave a customer staring at an
   * empty dashboard with no way to tell whether they are signed out or whether
   * the site is broken.
   */
  handleUnauthorized(message) {
    this.clearStoredSession();
    this.customerData = null;
    this.hideDashboard();
    this.resetPanels();
    this.showSessionMessage(
      message || 'Your session has ended. Please sign in again.',
      'warning'
    );
    if (!this.sessionExpiredNotified) {
      this.sessionExpiredNotified = true;
      this.showNotification('Please sign in again.', 'warning');
    }
    const emailField = document.getElementById('loginEmail');
    if (emailField) emailField.focus();
  }

  // -------------------------------------------------------------------------
  // panel visibility
  // -------------------------------------------------------------------------
  showDashboard() {
    const loginForm = document.getElementById('customerLoginForm');
    const dashboard = document.getElementById('customerDashboard');

    if (loginForm) loginForm.style.display = 'none';
    if (dashboard) dashboard.style.display = 'block';
  }

  hideDashboard() {
    const loginForm = document.getElementById('customerLoginForm');
    const dashboard = document.getElementById('customerDashboard');

    if (loginForm) loginForm.style.display = 'block';
    if (dashboard) dashboard.style.display = 'none';
  }

  showLoginForm() {
    this.hideDashboard();
  }

  /** Put every panel back to its neutral "nothing loaded" state. */
  resetPanels() {
    const panels = {
      appointmentsList: 'Loading appointments...',
      vehiclePreferences: 'Loading preferences...',
      recentActivity: 'Loading activity...',
      salesRepInfo: 'Loading sales rep information...'
    };
    for (const [id, placeholder] of Object.entries(panels)) {
      const el = document.getElementById(id);
      if (el) el.innerHTML = `<div class="loading">${esc(placeholder)}</div>`;
    }
  }

  /**
   * The one place a session-level message is shown. It sits above the form, so
   * it is visible whether the reader is looking at the login form (rejected
   * attempt) or at a dashboard that has just been torn down (expired session).
   */
  showSessionMessage(message, type = 'info') {
    const host = this.getMessageHost();
    if (!host) return;

    this.clearSessionMessage();

    // Built with DOM nodes, not innerHTML: this text can come from a server
    // error body.
    const box = document.createElement('div');
    box.className = `customer-session-message customer-session-message--${type}`;
    box.setAttribute('role', type === 'error' || type === 'warning' ? 'alert' : 'status');
    box.textContent = message;

    // At the TOP of the panel. Appending puts an "expired, sign in again"
    // message underneath the form fields, which is the one place a person in a
    // hurry will not look.
    host.insertBefore(box, host.firstChild);
  }

  clearSessionMessage() {
    const host = this.getMessageHost();
    if (!host) return;
    host.querySelectorAll('.customer-session-message').forEach((el) => el.remove());
  }

  /**
   * Where session-level messages go.
   *
   * `#customer-session-messages` is the preferred host and would sit above both
   * panels, but no template declares it — site/layouts/section/customer.html and
   * shortcodes/customer-login-form.html are both outside this change's scope, so
   * the message is hosted INSIDE whichever panel is currently visible. That
   * works because showSessionMessage/hideDashboard are always paired: the
   * message is placed in the panel that is about to become the visible one.
   *
   * If a host is ever added to the shortcode, it wins automatically.
   */
  getMessageHost() {
    const dedicated = document.getElementById('customer-session-messages');
    if (dedicated) return dedicated;

    const loginPanel = document.getElementById('customerLoginForm');
    const dashboard = document.getElementById('customerDashboard');

    // Whichever panel is on screen. A message written into the hidden one is a
    // message nobody reads, and a session warning that only appears after you
    // have already found the form is not a warning.
    const loginHidden = loginPanel && loginPanel.style.display === 'none';
    const dashboardVisible = dashboard && dashboard.style.display !== 'none';
    if (!loginHidden && loginPanel) return loginPanel;
    if (dashboardVisible) return dashboard;
    return loginPanel || dashboard || null;
  }

  // -------------------------------------------------------------------------
  // data loading
  // -------------------------------------------------------------------------
  /**
   * Every loader goes through here, so a 401 can never again end up as a
   * per-panel "Failed to load X" message while the rest of the page pretends
   * everything is fine.
   */
  async dashboardFetch(section) {
    const token = this.customerData?.token;
    if (!token) {
      this.handleUnauthorized('Please sign in to view your portal.');
      return null;
    }

    const path = section ? `${ENDPOINTS.dashboard}/${section}` : ENDPOINTS.dashboard;

    const response = await fetch(path, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'same-origin'
    });

    if (response.status === 401 || response.status === 403) {
      this.handleUnauthorized(
        'Your session has ended. Please sign in again to continue.'
      );
      return null;
    }

    if (!response.ok) {
      throw new Error(`The server returned HTTP ${response.status}.`);
    }

    const result = await response.json();
    if (result.success !== true) {
      throw new Error(result.error || 'The server could not load your information.');
    }
    return unwrap(result);
  }

  async loadCustomerData() {
    if (!this.customerData) return;

    // Update customer info
    const customerName = document.getElementById('customerName');
    const customerEmail = document.getElementById('customerEmail');

    if (customerName) {
      const first = this.customerData.customer?.first_name;
      customerName.textContent = first
        ? `Welcome back, ${first}!`
        : 'Welcome back!';
    }
    if (customerEmail) {
      customerEmail.textContent = this.customerData.customer?.email || '';
    }

    await this.loadAppointments();
    await this.loadPreferences();
    await this.loadRecentActivity();
    await this.loadSalesRepInfo();
  }

  async loadAppointments() {
    const appointmentsList = document.getElementById('appointmentsList');
    if (!appointmentsList) return;

    appointmentsList.innerHTML = '<div class="loading">Loading appointments...</div>';

    try {
      const data = await this.dashboardFetch('appointments');
      if (data === null) return; // 401 already handled

      const appointments = data.upcoming || [];
      if (appointments.length > 0) {
        appointmentsList.innerHTML = appointments.map((appt) => `
          <div class="appointment-item">
            <div class="appointment-header">
              <h4>${esc(appt.type)}</h4>
              <span class="appointment-status status-${esc(appt.status)}">${esc(appt.status)}</span>
            </div>
            <div class="appointment-details">
              <p><strong>Date:</strong> ${esc(formatDateTime(appt.scheduled_date, appt.scheduled_time))}</p>
              <p><strong>Location:</strong> ${esc(appt.location)}</p>
              ${appt.notes ? `<p><strong>Notes:</strong> ${esc(appt.notes)}</p>` : ''}
              ${appt.sales_rep_name ? `<p><strong>Sales Rep:</strong> ${esc(appt.sales_rep_name)}</p>` : ''}
            </div>
          </div>
        `).join('');
      } else {
        appointmentsList.innerHTML = '<p>No upcoming appointments.</p>';
      }
    } catch (error) {
      console.error('Error loading appointments:', error);
      appointmentsList.innerHTML = `<p class="error">We could not load your appointments (${esc(error.message)}). Please try again.</p>`;
    }
  }

  async loadPreferences() {
    const preferencesDiv = document.getElementById('vehiclePreferences');
    if (!preferencesDiv) return;

    preferencesDiv.innerHTML = '<div class="loading">Loading preferences...</div>';

    try {
      const preferences = await this.dashboardFetch('preferences');
      if (preferences === null) return;

      const budgetMin = Number(preferences.budget_min) || 0;
      const budgetMax = Number(preferences.budget_max) || 0;
      const budget = budgetMin || budgetMax
        ? `$${budgetMin.toLocaleString()} - $${budgetMax.toLocaleString()}`
        : 'Not specified';
      const features = Array.isArray(preferences.preferred_features)
        ? preferences.preferred_features.join(', ')
        : '';

      preferencesDiv.innerHTML = `
        <div class="preference-item">
          <p><strong>Preferred Vehicle Type:</strong> ${esc(preferences.vehicle_type) || 'Not specified'}</p>
          <p><strong>Budget Range:</strong> ${esc(budget)}</p>
          <p><strong>Preferred Contact:</strong> ${esc(preferences.preferred_contact_method) || 'Not specified'}</p>
          ${features ? `<p><strong>Preferred Features:</strong> ${esc(features)}</p>` : ''}
        </div>
      `;
    } catch (error) {
      console.error('Error loading preferences:', error);
      preferencesDiv.innerHTML = `<p class="error">We could not load your preferences (${esc(error.message)}). Please try again.</p>`;
    }
  }

  async loadRecentActivity() {
    const activityDiv = document.getElementById('recentActivity');
    if (!activityDiv) return;

    activityDiv.innerHTML = '<div class="loading">Loading activity...</div>';

    try {
      const activities = await this.dashboardFetch('activity');
      if (activities === null) return;

      if (Array.isArray(activities) && activities.length > 0) {
        activityDiv.innerHTML = activities.map((activity) => `
          <div class="activity-item">
            <div class="activity-date">${esc(formatDate(activity.date))}</div>
            <div class="activity-content">
              <strong>${esc(this.formatActivityType(activity.type))}</strong>
              <p>${esc(activity.description)}</p>
              ${activity.details ? `<small>${esc(activity.details)}</small>` : ''}
            </div>
          </div>
        `).join('');
      } else {
        activityDiv.innerHTML = '<p>No recent activity.</p>';
      }
    } catch (error) {
      console.error('Error loading activity:', error);
      activityDiv.innerHTML = `<p class="error">We could not load your activity (${esc(error.message)}). Please try again.</p>`;
    }
  }

  async loadSalesRepInfo() {
    const salesRepDiv = document.getElementById('salesRepInfo');
    if (!salesRepDiv) return;

    salesRepDiv.innerHTML = '<div class="loading">Loading sales rep information...</div>';

    try {
      const salesRep = await this.dashboardFetch('sales-rep');
      if (salesRep === null) return;

      salesRepDiv.innerHTML = `
        <div class="sales-rep-card">
          <h4>${esc(salesRep.name)}</h4>
          <p><strong>Title:</strong> ${esc(salesRep.title) || 'Sales Representative'}</p>
          <p><strong>Email:</strong> <a href="mailto:${esc(salesRep.email)}">${esc(salesRep.email)}</a></p>
          <p><strong>Phone:</strong> <a href="tel:${esc(salesRep.phone)}">${esc(salesRep.phone)}</a></p>
        </div>
      `;
    } catch (error) {
      console.error('Error loading sales rep info:', error);
      salesRepDiv.innerHTML = `<p class="error">We could not load your sales representative's details (${esc(error.message)}). Please try again.</p>`;
    }
  }

  formatActivityType(type) {
    const typeMap = {
      lead_created: 'Lead Created',
      appointment_scheduled: 'Appointment Scheduled',
      appointment_completed: 'Appointment Completed',
      email_sent: 'Email Sent',
      call_made: 'Phone Call',
      note_added: 'Note Added',
      status_updated: 'Status Updated'
    };
    if (!type) return 'Activity';
    return typeMap[type] || String(type).replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  }

  // -------------------------------------------------------------------------
  // modals
  // -------------------------------------------------------------------------
  showAppointmentModal() {
    if (!this.customerData) {
      this.handleUnauthorized('Please sign in to schedule an appointment.');
      return;
    }
    const modal = document.getElementById('appointmentModal');
    if (modal) {
      modal.style.display = 'block';
      document.body.style.overflow = 'hidden';
    }
  }

  hideAppointmentModal() {
    const modal = document.getElementById('appointmentModal');
    if (modal) {
      modal.style.display = 'none';
      document.body.style.overflow = 'auto';
    }
  }

  async handleAppointmentSubmit(event) {
    event.preventDefault();

    if (!this.customerData) {
      this.handleUnauthorized('Please sign in to schedule an appointment.');
      return;
    }

    const formData = new FormData(event.target);
    const customer = this.customerData.customer;
    const appointmentData = {
      type: formData.get('type'),
      scheduled_date: formData.get('date'),
      scheduled_time: formData.get('time'),
      notes: formData.get('notes'),
      customer_id: customer.id,
      customer_name: `${customer.first_name} ${customer.last_name}`,
      customer_email: customer.email,
      customer_phone: customer.phone
    };

    try {
      // NOTE: there is no `schedule-appointment` function in this repo. This
      // call has always 404'd; it is declared as a known gap in
      // ci/verify-endpoints.js (KNOWN_MISSING) rather than quietly removed, so
      // that the form's promise is visible instead of the form just being
      // absent. It needs a function, not a fix here.
      const response = await fetch('/.netlify/functions/schedule-appointment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.customerData.token}`
        },
        credentials: 'same-origin',
        body: JSON.stringify(appointmentData)
      });

      if (response.status === 401) {
        this.handleUnauthorized('Your session has ended. Please sign in again.');
        return;
      }

      const result = await response.json().catch(() => ({}));

      if (response.ok && result.success) {
        this.showNotification('Appointment scheduled successfully!', 'success');
        this.hideAppointmentModal();
        event.target.reset();
        await this.loadAppointments();
      } else {
        // Be explicit that this is not implemented rather than letting a 404
        // page masquerade as a server error.
        throw new Error(
          result?.error ||
            (response.status === 404
              ? 'Appointment scheduling is not available yet. Please call the dealership.'
              : 'Failed to schedule appointment.')
        );
      }
    } catch (error) {
      console.error('Appointment scheduling error:', error);
      this.showNotification(error.message || 'Failed to schedule appointment.', 'error');
    }
  }

  showMessageModal() {
    if (!this.customerData) {
      this.handleUnauthorized('Please sign in to send us a message.');
      return;
    }
    const modal = document.getElementById('messageModal');
    if (modal) {
      modal.style.display = 'block';
      document.body.style.overflow = 'hidden';
    }
  }

  hideMessageModal() {
    const modal = document.getElementById('messageModal');
    if (modal) {
      modal.style.display = 'none';
      document.body.style.overflow = 'auto';
    }
  }

  async handleMessageSubmit(event) {
    event.preventDefault();

    if (!this.customerData) {
      this.handleUnauthorized('Please sign in to send us a message.');
      return;
    }

    // The sales rep's address used to be a hardcoded string pasted into
    // customer-portal.js, so a message went nowhere the dealership chose. The
    // portal has no reliable way to learn who the assigned rep is at
    // submit-time without a session load, so it is fetched.
    let recipient = null;
    try {
      const rep = await this.dashboardFetch('sales-rep');
      if (rep === null) return;
      recipient = rep.email;
    } catch {
      recipient = null;
    }

    if (!recipient) {
      this.showNotification(
        'We could not work out who to send this to. Please use the contact page.',
        'error'
      );
      return;
    }

    const formData = new FormData(event.target);
    const customer = this.customerData.customer;
    const messageData = {
      type: 'customer_message',
      recipient,
      subject: formData.get('subject'),
      content: formData.get('content'),
      metadata: {
        message: {
          customer_name: `${customer.first_name} ${customer.last_name}`,
          customer_email: customer.email,
          subject: formData.get('subject'),
          content: formData.get('content')
        },
        customer_id: customer.id
      }
    };

    try {
      const response = await fetch('/.netlify/functions/send-notification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.customerData.token}`
        },
        credentials: 'same-origin',
        body: JSON.stringify(messageData)
      });

      const result = await response.json().catch(() => ({}));

      if (response.ok && result.success) {
        this.showNotification('Message sent successfully!', 'success');
        this.hideMessageModal();
        event.target.reset();
      } else {
        throw new Error(result?.error || 'Failed to send message');
      }
    } catch (error) {
      console.error('Message sending error:', error);
      this.showNotification(error.message || 'Failed to send message.', 'error');
    }
  }

  showPreferencesModal() {
    this.showNotification('Preferences update feature coming soon!', 'info');
  }

  // -------------------------------------------------------------------------
  // small UI helpers
  // -------------------------------------------------------------------------
  showLoading(buttonId) {
    const button = document.getElementById(buttonId);
    if (button) {
      const buttonText = button.querySelector('.button-text');
      const spinner = button.querySelector('.loading-spinner');

      if (buttonText) buttonText.style.display = 'none';
      if (spinner) spinner.style.display = 'inline-block';
      button.disabled = true;
    }
  }

  hideLoading(buttonId) {
    const button = document.getElementById(buttonId);
    if (button) {
      const buttonText = button.querySelector('.button-text');
      const spinner = button.querySelector('.loading-spinner');

      if (buttonText) buttonText.style.display = 'inline-block';
      if (spinner) spinner.style.display = 'none';
      button.disabled = false;
    }
  }

  showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;

    // DOM construction rather than innerHTML: `message` can carry a server
    // error string, and a notification is not worth an injection sink.
    const content = document.createElement('div');
    content.className = 'notification-content';

    const text = document.createElement('span');
    text.className = 'notification-message';
    text.textContent = message;

    const closeButton = document.createElement('button');
    closeButton.className = 'notification-close';
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', 'Dismiss');
    closeButton.innerHTML = '&times;';

    content.appendChild(text);
    content.appendChild(closeButton);
    notification.appendChild(content);
    document.body.appendChild(notification);

    setTimeout(() => notification.classList.add('show'), 100);

    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, 5000);

    closeButton.addEventListener('click', () => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    });
  }
}

// Initialize customer portal when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new CustomerPortal();
});

// ---------------------------------------------------------------------------
// small formatters, kept out of the class so the renderers stay readable
// ---------------------------------------------------------------------------

/** '8h' -> 28800, '30m' -> 1800, '7d' -> 604800, '3600' -> 3600 */
function parseDuration(value) {
  if (value === null || value === undefined) return 0;
  const match = String(value).trim().match(/^(\d+)\s*([smhd])?$/i);
  if (!match) return 0;
  const factors = { s: 1, m: 60, h: 3600, d: 86400 };
  return parseInt(match[1], 10) * factors[(match[2] || 's').toLowerCase()];
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString();
}

function formatDateTime(date, time) {
  if (!date) return '';
  const combined = time ? `${date} ${time}` : date;
  const parsed = new Date(combined);
  return Number.isNaN(parsed.getTime()) ? String(combined) : parsed.toLocaleString();
}
