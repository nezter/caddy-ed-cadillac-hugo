/**
 * Lead capture form enhancement.
 *
 * Progressively enhances .lead-capture-form on the public lead page.
 * Without JavaScript the form's native action/method remain, but a <noscript>
 * block on the page directs users to the phone/email alternatives because the
 * function expects JSON.
 */
(function () {
  'use strict';

  // /.netlify/functions/lead-form, not /api/lead.
  //
  // There is no /api/ route on this site -- a Gatsby-ism from before the Hugo
  // rewrite -- and no function called `lead` either. The form on /lead-form/
  // therefore submitted into a 404, and the visitor was told the send had
  // failed. The field names it posts were already right for lead-form.js; only
  // the URL was wrong.
  const ENDPOINT = '/.netlify/functions/lead-form';
  const MIN_FILL_MS = 2000; // basic bot/rush deterrent

  function ready(fn) {
    if (document.readyState !== 'loading') {
      fn();
    } else {
      document.addEventListener('DOMContentLoaded', fn);
    }
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function isValidPhone(phone) {
    const digits = phone.replace(/\D/g, '');
    return digits.length >= 10 && digits.length <= 15;
  }

  function clearFieldError(input) {
    input.classList.remove('input-error');
    const msg = input.parentElement.querySelector('.error-message');
    if (msg) msg.remove();
  }

  function showFieldError(input, message) {
    clearFieldError(input);
    input.classList.add('input-error');
    const error = document.createElement('div');
    error.className = 'error-message';
    error.textContent = message;
    input.parentElement.appendChild(error);
    input.addEventListener('focus', () => clearFieldError(input), { once: true });
  }

  function validateInput(input) {
    const value = input.value.trim();
    let valid = true;

    if (input.hasAttribute('required') && !value) {
      showFieldError(input, 'This field is required');
      valid = false;
    } else if (input.type === 'email' && value && !isValidEmail(value)) {
      showFieldError(input, 'Please enter a valid email address');
      valid = false;
    } else if (input.type === 'tel' && value && !isValidPhone(value)) {
      showFieldError(input, 'Please enter a valid phone number');
      valid = false;
    }

    return valid;
  }

  function setSubmitState(button, sending) {
    if (sending) {
      button.dataset.originalText = button.textContent;
      button.textContent = 'Sending…';
      button.disabled = true;
    } else {
      button.textContent = button.dataset.originalText || button.textContent;
      button.disabled = false;
    }
  }

  function showFormMessage(form, kind, html) {
    const successEl = form.querySelector('#lead-form-success');
    const errorEl = form.querySelector('#lead-form-error');
    if (successEl) successEl.classList.add('hidden');
    if (errorEl) {
      errorEl.classList.toggle('hidden', kind !== 'error');
      if (kind === 'error') errorEl.innerHTML = html;
    }
    if (kind === 'success' && successEl) {
      successEl.classList.remove('hidden');
    }
  }

  function clearServerErrors(form) {
    form.querySelectorAll('.error-message').forEach((el) => el.remove());
    form.querySelectorAll('.input-error').forEach((el) => el.classList.remove('input-error'));
  }

  function mapServerErrors(form, fieldErrors) {
    if (!fieldErrors || typeof fieldErrors !== 'object') return false;
    let mapped = false;
    Object.entries(fieldErrors).forEach(([key, message]) => {
      if (!message) return;
      const input = form.querySelector(`[name="${key}"]`);
      if (input) {
        showFieldError(input, message);
        mapped = true;
      }
    });
    return mapped;
  }

  function handleFormSubmission(form) {
    const submitButton = form.querySelector('button[type="submit"]');

    // Client-side validation
    const inputs = form.querySelectorAll('input, select, textarea');
    let isFormValid = true;
    inputs.forEach((input) => {
      if (!validateInput(input)) isFormValid = false;
    });

    if (!isFormValid) return;

    // Honeypot check (client-side pre-filter)
    const honeypot = form.querySelector('[name="website"]');
    if (honeypot && honeypot.value.trim() !== '') {
      showFormMessage(form, 'error', 'Submission rejected. Please call or email us directly.');
      return;
    }

    setSubmitState(submitButton, true);
    clearServerErrors(form);

    const formData = new FormData(form);
    const payload = {
      formType: form.dataset.formType || 'lead',
      leadSource: form.dataset.leadSource || window.location.pathname,
      pageUrl: window.location.href,
      startedAt: form.dataset.startedAt || new Date().toISOString(),
      submittedAt: new Date().toISOString()
    };
    // The honeypot is INCLUDED, not dropped: the server re-checks it (a filled
    // one is refused in utils/bot-gate.js). It was filtered out here, so the
    // server-side half of the same check could never fire.
    formData.forEach((value, key) => {
      payload[key] = value;
    });

    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(async (response) => {
        const result = await response.json().catch(() => ({}));

        if (!response.ok || result.success === false) {
          // Try to map field-level errors first
          const fieldErrors = result.validationErrors || result.fieldErrors || {};
          if (mapServerErrors(form, fieldErrors)) {
            throw new Error(result.message || 'Please check the fields above.');
          }
          throw new Error(result.message || `Submission failed (${response.status}). Please try again.`);
        }

        return result;
      })
      .then((result) => {
        const ref = result.data && (result.data.id || result.data.reference) ? result.data.id || result.data.reference : null;
        const successHtml = `
          <h3>Thank you</h3>
          <p>${result.message || 'Your details have been sent. Ed will be in touch shortly.'}</p>
          ${ref ? `<p class="hint">Reference: ${ref}</p>` : ''}
        `;
        const wrapper = document.createElement('div');
        wrapper.className = 'form-message form-message--success';
        wrapper.innerHTML = successHtml;
        wrapper.setAttribute('role', 'status');
        form.innerHTML = '';
        form.appendChild(wrapper);

        if (typeof gtag === 'function') {
          gtag('event', 'lead_submission', {
            event_category: 'Lead',
            event_label: payload.formType,
            value: 1
          });
        }
      })
      .catch((error) => {
        console.error('Lead form error:', error);
        showFormMessage(form, 'error', error.message || 'Network error. Please try again or call us directly.');
        setSubmitState(submitButton, false);
      });
  }

  function initForm(form) {
    // Stamp start time for the simple timing gate
    form.dataset.startedAt = new Date().toISOString();

    const inputs = form.querySelectorAll('input, select, textarea');
    inputs.forEach((input) => {
      input.addEventListener('blur', () => validateInput(input));
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      handleFormSubmission(form);
    });
  }

  ready(() => {
    document.querySelectorAll('.lead-capture-form').forEach(initForm);
  });
})();
