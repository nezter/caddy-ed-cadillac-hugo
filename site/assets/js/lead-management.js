/**
 * Lead Management System
 * Handles capture and processing of sales leads from forms marked
 * `data-lead-form`, currently the manual intake form on /admin/leads-intake.
 *
 * ============================================================================
 * THE ENDPOINT
 * ============================================================================
 * This module posts to `/.netlify/functions/leads`. It used to post to
 * `/.netlify/functions/lead-management`, the loser of the two overlapping
 * lead-intake functions: `leads` is the only one that persists anything
 * (DatabaseService.createLead, interaction logging, rep assignment,
 * follow-up scheduling, notification), while `lead-management`'s storage
 * legs were a relative-URL fetch that cannot resolve inside a function and a
 * CRM client that no-ops when unconfigured. See ci/feature-manifest.json
 * ("lead-management", delete bucket) for the reason the file is still on disk.
 *
 * ============================================================================
 * THE CONTRACT (netlify/functions/leads.js + utils/error-handler.js)
 * ============================================================================
 * - Request: every named field in the form, plus `leadSource` (leads.js reads
 *   `leadSource`; the old `source` key was the dead function's contract) and
 *   any utm_* parameters in the page URL.
 * - Success: HTTP 200 `{success: true, message, data, timestamp}`. `data.status`
 *   is 'received' or 'duplicate', and the server writes a `message` for both,
 *   so the message is shown verbatim.
 * - Failure: HTTP 4xx/5xx `{success: false, message, errorCode}` -- the reason
 *   is at `message` on the TOP LEVEL. This used to read `result.error.message`,
 *   a key no response in this repo has ever had, so every server-side failure
 *   surfaced as the generic "Failed to submit form".
 */
class LeadManagement {
  constructor(options = {}) {
    this.options = Object.assign({
      apiEndpoint: '/.netlify/functions/leads',
      trackingEnabled: true,
      debug: false
    }, options);

    this.forms = document.querySelectorAll('form[data-lead-form]');

    if (this.forms.length > 0) {
      this.init();
    }
  }

  init() {
    // Add submission handling to all lead forms
    this.forms.forEach(form => {
      form.addEventListener('submit', this.handleSubmit.bind(this));

      // Set up field validation
      const requiredFields = form.querySelectorAll('[required]');
      requiredFields.forEach(field => {
        field.addEventListener('blur', () => this.validateField(field));
      });
    });

    if (this.options.debug) {
      console.log(`LeadManagement initialized: found ${this.forms.length} lead forms`);
    }
  }

  validateField(field) {
    const errorClass = 'field-error';

    // Remove any existing error messages
    const existingError = field.parentNode.querySelector(`.${errorClass}`);
    if (existingError) {
      existingError.remove();
    }

    // Skip validation if field is empty and not required
    if (!field.hasAttribute('required') && field.value.trim() === '') {
      return true;
    }

    // Check if field is valid
    if (!field.checkValidity()) {
      // Create and append error message
      const errorMessage = document.createElement('div');
      errorMessage.className = errorClass;
      errorMessage.setAttribute('aria-live', 'polite');
      errorMessage.textContent = field.validationMessage || 'This field is invalid';

      field.parentNode.appendChild(errorMessage);

      // Add error class to field
      field.classList.add('invalid');
      field.classList.remove('valid');

      return false;
    }

    // Field is valid
    field.classList.remove('invalid');
    field.classList.add('valid');
    return true;
  }

  validateForm(form) {
    let isValid = true;

    // Validate all required fields
    const requiredFields = form.querySelectorAll('[required]');
    requiredFields.forEach(field => {
      if (!this.validateField(field)) {
        isValid = false;
      }
    });

    return isValid;
  }

  async handleSubmit(event) {
    event.preventDefault();
    const form = event.target;

    // Don't submit if form is invalid
    if (!this.validateForm(form)) {
      return;
    }

    // Get form data
    const formData = new FormData(form);
    const leadData = {};

    // Convert FormData to object
    formData.forEach((value, key) => {
      leadData[key] = value;
    });

    // Add lead source information. leads.js reads `leadSource` -- only the
    // deprecated lead-management function ever read `source`. A field named
    // leadSource in the form wins; data attributes are the fallback, and the
    // server's own default ('website') covers the rest.
    if (!leadData.leadSource) {
      leadData.leadSource = form.dataset.leadSource || form.dataset.source || '';
    }
    leadData.timestamp = new Date().toISOString();

    // Add UTM parameters if present
    const urlParams = new URLSearchParams(window.location.search);
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach(param => {
      const value = urlParams.get(param);
      if (value) {
        leadData[param] = value;
      }
    });

    // Show loading state
    this.setFormState(form, 'loading');

    try {
      // Submit lead data to API
      const response = await fetch(this.options.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(leadData)
      });

      const result = await response.json();

      // utils/error-handler.js puts the reason in `message` at the top level,
      // both for failures ({success: false, message, errorCode}) and successes
      // ({success: true, message, data}). There is no `error` key on any shape.
      if (!response.ok || result.success === false) {
        throw new Error(result.message || 'Failed to submit form');
      }

      // Track successful submission
      if (this.options.trackingEnabled) {
        this.trackSubmission(leadData);
      }

      // Show success message. The server distinguishes a duplicate ('we
      // already have your information on file') from a fresh lead in its
      // message, so showing it verbatim is the whole state machine.
      this.setFormState(form, 'success', result.message || 'Thank you! We\'ll be in touch soon.');
      form.reset();

    } catch (error) {
      // Log error
      console.error('Lead submission error:', error);

      // Show error message
      this.setFormState(form, 'error', error.message || 'Unable to submit form. Please try again later.');
    }
  }

  setFormState(form, state, message = '') {
    // Remove any previous state classes
    form.classList.remove('form-loading', 'form-success', 'form-error');

    // Remove previous messages
    const previousMessages = form.querySelectorAll('.form-message');
    previousMessages.forEach(el => el.remove());

    const submitButton = form.querySelector('button[type="submit"]');

    switch (state) {
      case 'loading':
        form.classList.add('form-loading');

        // Disable submit button. The original label is stashed so success and
        // error states can put it back -- the old code left the button
        // disabled with "Sending..." in it forever after a success.
        if (submitButton) {
          if (!submitButton.dataset.label) {
            submitButton.dataset.label = submitButton.innerHTML;
          }
          submitButton.disabled = true;
          submitButton.innerHTML = '<span class="spinner" aria-hidden="true"></span> Sending...';
        }
        break;

      case 'success':
        form.classList.add('form-success');

        // Re-enable the submit button with its original label
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.innerHTML = submitButton.dataset.label || 'Submit';
        }

        // Create success message
        const successMessage = document.createElement('div');
        successMessage.className = 'form-message success-message';
        successMessage.setAttribute('role', 'alert');
        successMessage.setAttribute('aria-live', 'polite');
        successMessage.innerHTML = `
          <h3>Thank You!</h3>
          <p>${message}</p>
        `;

        form.insertAdjacentElement('afterbegin', successMessage);
        break;

      case 'error':
        form.classList.add('form-error');

        // Re-enable submit button
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.innerHTML = submitButton.dataset.label || 'Try Again';
        }

        // Create error message
        const errorMessage = document.createElement('div');
        errorMessage.className = 'form-message error-message';
        errorMessage.setAttribute('role', 'alert');
        errorMessage.setAttribute('aria-live', 'assertive');
        errorMessage.innerHTML = `
          <h3>Submission Error</h3>
          <p>${message}</p>
        `;

        form.insertAdjacentElement('afterbegin', errorMessage);
        break;
    }
  }

  trackSubmission(leadData) {
    // Google Analytics tracking
    if (typeof gtag === 'function') {
      gtag('event', 'lead_submission', {
        'event_category': leadData.leadSource || 'Website',
        'event_label': leadData.vehicleInterest || 'General'
      });
    }

    // Facebook Pixel tracking
    if (typeof fbq === 'function') {
      fbq('track', 'Lead', {
        source: leadData.leadSource || 'Website',
        vehicle: leadData.vehicleInterest || 'General'
      });
    }
  }
}

// Export for use in other files
export default LeadManagement;

// Initialize automatically when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new LeadManagement();
});
