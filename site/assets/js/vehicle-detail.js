/**
 * vehicle-detail.js -- the vehicle page's progressive enhancement.
 *
 * Two jobs, and nothing else:
 *
 *   1. the gallery, when a vehicle actually has more than one photograph
 *   2. the test-drive booking form, which submits to
 *      /.netlify/functions/schedule-test-drive
 *
 * The page is server-rendered. Everything a shopper needs to judge a car --
 * specification, mileage, price, VIN, the photos -- is in the HTML Hugo
 * produced, and stays there with this file deleted. That is why nothing here
 * fetches vehicle data: the previous version of this file was a slideshow over
 * `.vehicle-slide` elements no layout has ever rendered, a "similar vehicles"
 * slider with no markup, and a contact form posting to `/api/inquire` -- a
 * path that resolves to nothing, since the blanket /api/* rewrite was removed
 * from netlify.toml. It was 10.7 KB of code that could not run and could not
 * succeed. The same reasoning applies to the vehicle-details function, which
 * is why nothing here calls it either -- see ci/feature-manifest.json.
 *
 * The booking form is the one part of this site that needs JavaScript, because
 * the endpoint is a JSON API. With scripting off, the form is hidden by a
 * <noscript> rule in the layout and the phone number is offered instead --
 * said plainly, rather than left as a control that posts and shows nothing.
 */

(function () {
  'use strict';

  // Kept in a constant so the endpoint is greppable in one place. The endpoint
  // gate in ci/verify-endpoints.js scans for this literal and fails the build
  // if the function is renamed or the call is deleted.
  const ENDPOINT = '/.netlify/functions/schedule-test-drive';

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const PHONE_RE = /^[0-9+().\-\s]{7,20}$/;
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  // Fallback names for the validation messages, for the one control with no
  // visible label of its own: the prefilled vehicle id.
  const LABELS = {
    vehicleId: 'Vehicle',
    fullName: 'Full name',
    email: 'Email',
    phone: 'Phone',
    preferredDate: 'Preferred date',
    preferredTime: 'Preferred time',
  };

  /* ------------------------------------------------------------------ utils */

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  /** Today in the visitor's own timezone, as YYYY-MM-DD. */
  function today() {
    const d = new Date();
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  /* ---------------------------------------------------------------- gallery */

  /**
   * Swap the featured photograph when a thumbnail is activated.
   *
   * The layout renders one <picture> for the hero and one per thumbnail, so
   * the srcset of the chosen thumbnail is copied onto the hero <img>. No
   * markup is moved or cloned, and with scripting off every photograph is
   * simply visible -- which is the right fallback for a car, not a degraded
   * one.
   */
  function initGallery() {
    const root = document.querySelector('[data-vehicle-gallery]');
    const thumbs = document.querySelector('[data-gallery-thumbs]');
    if (!root || !thumbs) return;

    const hero = root.querySelector('img');
    if (!hero) return;

    const buttons = Array.prototype.slice.call(thumbs.querySelectorAll('[data-gallery-thumb]'));
    if (!buttons.length) return;

    function show(button) {
      const candidate = button.querySelector('img');
      if (!candidate) return;

      const src = candidate.getAttribute('src');
      const srcset = candidate.getAttribute('srcset');
      const sizes = candidate.getAttribute('sizes');

      // The hero <img> is the last-resort source in its <picture>, so src is
      // always set; srcset and sizes are replaced (or removed) so a narrow
      // thumbnail's 1x candidate cannot linger on the hero.
      if (src) hero.setAttribute('src', src);
      if (srcset) hero.setAttribute('srcset', srcset); else hero.removeAttribute('srcset');
      if (sizes) hero.setAttribute('sizes', sizes); else hero.removeAttribute('sizes');

      buttons.forEach((b) => {
        const active = b === button;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-current', active ? 'true' : 'false');
      });
    }

    buttons.forEach((button, i) => {
      button.addEventListener('click', () => show(button));
      // Arrow keys move between thumbnails, the way a tablist behaves.
      button.addEventListener('keydown', (event) => {
        let next = null;
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
          next = buttons[(i + 1) % buttons.length];
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
          next = buttons[(i - 1 + buttons.length) % buttons.length];
        }
        if (next) {
          event.preventDefault();
          next.focus();
          show(next);
        }
      });
    });

    show(buttons[0]);
  }

  /* ----------------------------------------------------------- booking form */

  function fieldWrap(input) {
    return input.closest('.form-field') || input.parentNode;
  }

  function clearError(input) {
    input.removeAttribute('aria-invalid');
    input.classList.remove('is-invalid');
    const wrap = fieldWrap(input);
    const msg = wrap && wrap.querySelector('[data-field-error]');
    if (msg) msg.remove();
  }

  function showError(input, text) {
    clearError(input);
    input.setAttribute('aria-invalid', 'true');
    input.classList.add('is-invalid');
    const wrap = fieldWrap(input);
    if (!wrap) return;
    const msg = document.createElement('p');
    msg.className = 'field-error';
    msg.setAttribute('data-field-error', '');
    msg.textContent = text;
    wrap.appendChild(msg);
  }

  /**
   * Validate one control. Returns '' when the value is acceptable, otherwise
   * the message to show under the field.
   */
  function checkField(input) {
    const value = String(input.value || '').trim();
    const label = input.getAttribute('data-label') || LABELS[input.name] || 'This field';

    if (!value) {
      return input.tagName === 'SELECT'
        ? `Choose a ${label.toLowerCase()}.`
        : `${label} is required.`;
    }
    if (input.name === 'email' && !EMAIL_RE.test(value)) {
      return 'That does not look like an email address.';
    }
    if (input.name === 'phone' && !PHONE_RE.test(value)) {
      return 'That does not look like a phone number.';
    }
    if (input.name === 'preferredDate') {
      if (!DATE_RE.test(value)) return 'Use the date picker, in YYYY-MM-DD form.';
      if (value < today()) return 'Pick a date from today onwards.';
    }
    return '';
  }

  function initBookingForm() {
    const form = document.querySelector('[data-test-drive-form]');
    if (!form) return;

    const status = form.querySelector('[data-test-drive-status]');
    const button = form.querySelector('[type="submit"]');
    const dateInput = form.querySelector('[name="preferredDate"]');
    const controls = Array.prototype.slice.call(
      form.querySelectorAll('input[name], select[name], textarea[name]')
    );
    const phone = form.dataset.phone || 'the dealership';

    // A date input will happily accept a past date, and the browser's own
    // validation bubbles are suppressed by `novalidate` so this form can show
    // its own messages. The floor has to be set here, or the picker happily
    // offers yesterday.
    if (dateInput) dateInput.min = today();

    // Read the visible label once instead of parsing it per error message.
    controls.forEach((input) => {
      if (input.type === 'hidden' && input.name !== 'vehicleId') return;
      const wrap = input.closest('.form-field');
      const label = wrap && wrap.querySelector('label');
      input.setAttribute(
        'data-label',
        label ? label.textContent.trim() : (LABELS[input.name] || input.name)
      );
    });

    function setStatus(state, message) {
      if (!status) return;
      status.textContent = message;
      status.className = `vehicle-booking__status is-${state}`;
      if (message) status.removeAttribute('hidden');
      else status.setAttribute('hidden', '');
    }

    function validate() {
      let firstBad = null;
      controls.forEach((input) => {
        if (input.type === 'hidden' && input.name !== 'vehicleId') return;
        const message = checkField(input);
        if (message) {
          showError(input, message);
          if (!firstBad) firstBad = input;
        } else {
          clearError(input);
        }
      });
      if (firstBad) {
        setStatus('error', 'Please fix the highlighted field above.');
        firstBad.focus();
      }
      return !firstBad;
    }

    controls.forEach((input) => {
      if (input.type === 'hidden') return;
      input.addEventListener('blur', () => {
        if (!checkField(input)) clearError(input);
      });
      input.addEventListener('input', () => {
        if (input.getAttribute('aria-invalid') === 'true' && !checkField(input)) clearError(input);
      });
    });

    function setBusy(busy, label) {
      if (!button) return;
      if (busy) {
        button.dataset.idleLabel = button.textContent.trim();
        button.textContent = label;
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
      } else {
        button.disabled = false;
        button.removeAttribute('aria-busy');
        button.textContent = label || button.dataset.idleLabel || 'Try again';
      }
    }

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!validate()) return;

      const payload = {};
      controls.forEach((input) => {
        payload[input.name] = String(input.value || '').trim();
      });

      setBusy(true, 'Sending…');
      setStatus('pending', 'Sending your request…');

      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload)
      })
        .then((response) =>
          response.json()
            .catch(() => ({}))
            .then((body) => ({ ok: response.ok, body }))
        )
        .then((result) => {
          if (result.ok && result.body && result.body.success) {
            const when = payload.preferredDate
              ? ` for ${payload.preferredDate} at ${String(payload.preferredTime || '').replace(/^0/, '')}`
              : '';
            form.reset();
            setStatus(
              'success',
              `Request sent${when}. I'll confirm the exact time shortly — usually the same day.`
            );
            setBusy(false, 'Send another request');
            return;
          }
          // The function's own message is the most specific thing available
          // ("Missing required field: email"), so it is shown verbatim rather
          // than replaced with something vaguer. A dropped network is
          // different: nothing was booked, and saying so matters.
          const message = (result.body && result.body.message) ||
            `The request could not be sent. Please try again, or call ${phone}.`;
          setStatus('error', message);
          setBusy(false, 'Try again');
        })
        .catch(() => {
          setStatus(
            'error',
            `The request could not be sent — the connection dropped. Nothing was ` +
            `booked. Please try again, or call ${phone}.`
          );
          setBusy(false, 'Try again');
        });
    });
  }

  ready(() => {
    initGallery();
    initBookingForm();
  });
})();
