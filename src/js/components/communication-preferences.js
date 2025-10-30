/**
 * Communication Preferences Component
 * Allows customers to manage their communication preferences and opt-out
 */

class CommunicationPreferences {
  constructor(containerId, customerId = null) {
    this.container = document.getElementById(containerId);
    this.customerId = customerId || this.getCustomerIdFromSession();
    this.preferences = null;
    this.isLoading = false;

    this.init();
  }

  async init() {
    this.render();
    if (this.customerId) {
      await this.loadPreferences();
    }
    this.bindEvents();
  }

  getCustomerIdFromSession() {
    // In a real implementation, get from session/auth context
    return localStorage.getItem('customerId') || null;
  }

  render() {
    this.container.innerHTML = `
      <div class="communication-preferences">
        <div class="preferences-header">
          <h3>Communication Preferences</h3>
          <p class="preferences-subtitle">
            Manage how we communicate with you. You can opt-out at any time.
          </p>
        </div>

        ${!this.customerId ? `
          <div class="auth-required">
            <p>Please sign in to manage your communication preferences.</p>
            <button id="signin-btn" class="btn btn-primary">Sign In</button>
          </div>
        ` : ''}

        <div class="preferences-content" style="display: ${this.customerId ? 'block' : 'none'}">
          <!-- Loading State -->
          <div id="loading-state" class="loading-state" style="display: none;">
            <div class="spinner"></div>
            <p>Loading your preferences...</p>
          </div>

          <!-- Preferences Form -->
          <form id="preferences-form" class="preferences-form" style="display: none;">
            <!-- Email Preferences -->
            <div class="preference-section">
              <h4>
                <i class="fas fa-envelope"></i>
                Email Communications
              </h4>
              <div class="preference-options">
                <label class="preference-option">
                  <input type="checkbox" name="email_marketing" id="email_marketing">
                  <span class="checkmark"></span>
                  <div class="option-content">
                    <strong>Marketing & Promotions</strong>
                    <p>Special offers, new vehicle announcements, and promotional content</p>
                  </div>
                </label>

                <label class="preference-option">
                  <input type="checkbox" name="email_newsletters" id="email_newsletters">
                  <span class="checkmark"></span>
                  <div class="option-content">
                    <strong>Newsletters</strong>
                    <p>Monthly newsletters with industry news and Cadillac updates</p>
                  </div>
                </label>

                <label class="preference-option">
                  <input type="checkbox" name="email_service" id="email_service">
                  <span class="checkmark"></span>
                  <div class="option-content">
                    <strong>Service Reminders</strong>
                    <p>Maintenance reminders and service appointment notifications</p>
                  </div>
                </label>

                <label class="preference-option">
                  <input type="checkbox" name="email_product_updates" id="email_product_updates">
                  <span class="checkmark"></span>
                  <div class="option-content">
                    <strong>Product Updates</strong>
                    <p>Information about new features and product improvements</p>
                  </div>
                </label>
              </div>
            </div>

            <!-- SMS Preferences -->
            <div class="preference-section">
              <h4>
                <i class="fas fa-sms"></i>
                SMS/Text Messages
              </h4>
              <div class="preference-options">
                <label class="preference-option">
                  <input type="checkbox" name="sms_marketing" id="sms_marketing">
                  <span class="checkmark"></span>
                  <div class="option-content">
                    <strong>Marketing Messages</strong>
                    <p>Promotional offers and special announcements via text</p>
                  </div>
                </label>

                <label class="preference-option">
                  <input type="checkbox" name="sms_reminders" id="sms_reminders">
                  <span class="checkmark"></span>
                  <div class="option-content">
                    <strong>Appointment Reminders</strong>
                    <p>Test drive and service appointment reminders</p>
                  </div>
                </label>

                <label class="preference-option">
                  <input type="checkbox" name="sms_service" id="sms_service">
                  <span class="checkmark"></span>
                  <div class="option-content">
                    <strong>Service Updates</strong>
                    <p>Status updates for service appointments and repairs</p>
                  </div>
                </label>
              </div>
            </div>

            <!-- Phone Preferences -->
            <div class="preference-section">
              <h4>
                <i class="fas fa-phone"></i>
                Phone Calls
              </h4>
              <div class="preference-options">
                <label class="preference-option">
                  <input type="checkbox" name="phone_marketing" id="phone_marketing">
                  <span class="checkmark"></span>
                  <div class="option-content">
                    <strong>Marketing Calls</strong>
                    <p>Sales and promotional calls from our team</p>
                  </div>
                </label>

                <label class="preference-option">
                  <input type="checkbox" name="phone_service" id="phone_service">
                  <span class="checkmark"></span>
                  <div class="option-content">
                    <strong>Service Calls</strong>
                    <p>Calls related to your vehicle service and repairs</p>
                  </div>
                </label>

                <label class="preference-option">
                  <input type="checkbox" name="phone_surveys" id="phone_surveys">
                  <span class="checkmark"></span>
                  <div class="option-content">
                    <strong>Satisfaction Surveys</strong>
                    <p>Calls to gather feedback about your experience</p>
                  </div>
                </label>
              </div>
            </div>

            <!-- Action Buttons -->
            <div class="preferences-actions">
              <button type="submit" id="save-preferences-btn" class="btn btn-primary">
                <i class="fas fa-save"></i>
                Save Preferences
              </button>

              <button type="button" id="opt-out-all-btn" class="btn btn-danger btn-outline">
                <i class="fas fa-ban"></i>
                Opt-Out of All Communications
              </button>
            </div>
          </form>

          <!-- Success/Error Messages -->
          <div id="message-container" class="message-container" style="display: none;"></div>
        </div>

        <!-- GDPR Information -->
        <div class="gdpr-info">
          <h4>Your Privacy Rights</h4>
          <p>
            Under GDPR and other privacy laws, you have the right to control how your personal information
            is used and communicated. You can update your preferences at any time, and you can unsubscribe
            from any communication by clicking the unsubscribe link in our emails.
          </p>
          <p>
            For more information about how we protect your privacy, please review our
            <a href="/privacy-policy">Privacy Policy</a>.
          </p>
        </div>
      </div>
    `;
  }

  bindEvents() {
    // Sign in button
    const signinBtn = this.container.querySelector('#signin-btn');
    if (signinBtn) {
      signinBtn.addEventListener('click', () => {
        // Redirect to sign in page or open modal
        window.location.href = '/customer-login';
      });
    }

    // Preferences form
    const form = this.container.querySelector('#preferences-form');
    if (form) {
      form.addEventListener('submit', (e) => this.handleSavePreferences(e));
    }

    // Opt-out button
    const optOutBtn = this.container.querySelector('#opt-out-all-btn');
    if (optOutBtn) {
      optOutBtn.addEventListener('click', () => this.handleOptOut());
    }
  }

  async loadPreferences() {
    if (!this.customerId) return;

    this.showLoading(true);

    try {
      const response = await fetch(`/api/communication-preferences/customer/${this.customerId}`);
      const data = await response.json();

      if (data.success) {
        this.preferences = data.preferences;
        this.populateForm();
        this.showForm(true);
      } else {
        this.showMessage('Error loading preferences. Please try again.', 'error');
      }
    } catch (error) {
      console.error('Error loading preferences:', error);
      this.showMessage('Error loading preferences. Please try again.', 'error');
    } finally {
      this.showLoading(false);
    }
  }

  populateForm() {
    if (!this.preferences) return;

    const prefs = this.preferences.communication_preferences || {};

    // Email preferences
    this.setCheckboxValue('email_marketing', prefs.email?.marketing);
    this.setCheckboxValue('email_newsletters', prefs.email?.newsletters);
    this.setCheckboxValue('email_service', prefs.email?.service_reminders);
    this.setCheckboxValue('email_product_updates', prefs.email?.product_updates);

    // SMS preferences
    this.setCheckboxValue('sms_marketing', prefs.sms?.marketing);
    this.setCheckboxValue('sms_reminders', prefs.sms?.reminders);
    this.setCheckboxValue('sms_service', prefs.sms?.service_updates);

    // Phone preferences
    this.setCheckboxValue('phone_marketing', prefs.phone?.marketing);
    this.setCheckboxValue('phone_service', prefs.phone?.service_calls);
    this.setCheckboxValue('phone_surveys', prefs.phone?.survey_calls);
  }

  setCheckboxValue(name, value) {
    const checkbox = this.container.querySelector(`#${name}`);
    if (checkbox) {
      checkbox.checked = value || false;
    }
  }

  async handleSavePreferences(e) {
    e.preventDefault();

    const preferences = {
      email: {
        marketing: this.getCheckboxValue('email_marketing'),
        newsletters: this.getCheckboxValue('email_newsletters'),
        service_reminders: this.getCheckboxValue('email_service'),
        product_updates: this.getCheckboxValue('email_product_updates')
      },
      sms: {
        marketing: this.getCheckboxValue('sms_marketing'),
        reminders: this.getCheckboxValue('sms_reminders'),
        service_updates: this.getCheckboxValue('sms_service')
      },
      phone: {
        marketing: this.getCheckboxValue('phone_marketing'),
        service_calls: this.getCheckboxValue('phone_service'),
        survey_calls: this.getCheckboxValue('phone_surveys')
      }
    };

    this.showLoading(true);

    try {
      const response = await fetch('/api/communication-preferences/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          customerId: this.customerId,
          preferences,
          consentSource: 'customer_portal'
        })
      });

      const data = await response.json();

      if (data.success) {
        this.showMessage('Your communication preferences have been updated successfully.', 'success');
        this.preferences.communication_preferences = preferences;
      } else {
        this.showMessage('Error updating preferences. Please try again.', 'error');
      }
    } catch (error) {
      console.error('Error saving preferences:', error);
      this.showMessage('Error updating preferences. Please try again.', 'error');
    } finally {
      this.showLoading(false);
    }
  }

  async handleOptOut() {
    if (!confirm('Are you sure you want to opt-out of all communications? This action cannot be undone.')) {
      return;
    }

    this.showLoading(true);

    try {
      const response = await fetch('/api/communication-preferences/opt-out', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          customerId: this.customerId,
          reason: 'Customer requested complete opt-out',
          source: 'customer_portal'
        })
      });

      const data = await response.json();

      if (data.success) {
        this.showMessage('You have been successfully opted out of all communications.', 'success');
        // Reload preferences to show updated state
        setTimeout(() => this.loadPreferences(), 2000);
      } else {
        this.showMessage('Error processing opt-out request. Please try again.', 'error');
      }
    } catch (error) {
      console.error('Error opting out:', error);
      this.showMessage('Error processing opt-out request. Please try again.', 'error');
    } finally {
      this.showLoading(false);
    }
  }

  getCheckboxValue(name) {
    const checkbox = this.container.querySelector(`#${name}`);
    return checkbox ? checkbox.checked : false;
  }

  showLoading(show) {
    const loadingState = this.container.querySelector('#loading-state');
    const form = this.container.querySelector('#preferences-form');

    if (loadingState) loadingState.style.display = show ? 'block' : 'none';
    if (form) form.style.display = show ? 'none' : 'block';
  }

  showForm(show) {
    const form = this.container.querySelector('#preferences-form');
    if (form) form.style.display = show ? 'block' : 'none';
  }

  showMessage(message, type) {
    const container = this.container.querySelector('#message-container');
    if (container) {
      container.innerHTML = `
        <div class="message message-${type}">
          <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-triangle'}"></i>
          ${message}
        </div>
      `;
      container.style.display = 'block';

      // Auto-hide after 5 seconds
      setTimeout(() => {
        container.style.display = 'none';
      }, 5000);
    }
  }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CommunicationPreferences;
}