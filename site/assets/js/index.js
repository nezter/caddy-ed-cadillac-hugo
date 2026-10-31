// Front-end entry point.
//
// Bundled by Hugo Pipes `js.Build` (esbuild) -- NOT by webpack. See
// site/layouts/partials/assets.html. Keeping the source as standard ESM with
// bare-specifier npm imports lets esbuild resolve `lazysizes`/`date-fns`
// straight out of node_modules.

// Stylesheets are deliberately NOT imported here. `partials/assets.html` emits
// them as separate fingerprinted <link>s, which lets the browser cache and
// load them in parallel instead of blocking on an inlined bundle.

// Core behaviour
import './app';
// (the ./navbar import was removed 2026-10: it only toggled .sticky /
// .header-hidden on scroll -- classes with no CSS rules anywhere -- and
// queried .nav-toggle/.nav-menu markup that no longer exists. chrome.js
// owns the header.)
import './forms';
import './chrome'; // header/nav behaviour, previously an inline <script> in the header partial

// Database-backed copy: headings, intro text, the site-wide banner. Imported
// into the main bundle rather than loaded per page, because a page that has
// editable copy should not have to remember to ask for it -- that is how a
// setting ends up half-applied across the site. Every failure path is a
// silent no-op that leaves the built copy in place; see the note in the file.
import './site-settings-apply';

// Inventory filtering is NOT imported here. It used to be, via
// ./inventory-init, which bootstrapped inventory/InventoryFilters.js. Both are
// gone: the inventory page is server-rendered by Hugo and
// inventory-filter.js only narrows the DOM. It is declared by
// layouts/section/inventory.html through partials/entry.html, so it loads on
// the one page that needs it and nowhere else.

// Image loading needs no polyfill.
//
// This imported `lazysizes` and a `lazyload.js` shim that, on DOMContentLoaded,
// walked every <img>, moved the real `src` to `data-src` and replaced `src` with
// a 1x1 transparent GIF, relying on lazysizes to swap it back. That is strictly
// worse than what partials/picture.html already emits -- a real <picture> with
// AVIF/WebP/JPEG sources, a srcset, explicit width/height, and native
// loading="lazy".
//
// It was also a resilience bug: with JavaScript disabled, slow, or failed, every
// image on the site stayed a 1x1 GIF forever. The native attribute needs no
// JavaScript at all.

// Initialize service worker if supported
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(registrationError => {
      console.error('SW registration failed:', registrationError);
    });
  });
}

// Custom scripts
document.addEventListener("DOMContentLoaded", () => {
  // NOTE: the mobile menu toggle that used to live here was REMOVED.
  //
  // chrome.js already owns #navToggle/#navMenu: it sets aria-expanded and
  // aria-label, toggles the menu's is-active class, closes on Escape, closes
  // past the desktop breakpoint, and closes after a link is followed. The old
  // block here toggled the SAME class on the SAME elements with no aria at
  // all, so every tap ran both handlers: chrome opened the menu and the legacy
  // handler instantly closed it again. The menu only appeared on the SECOND
  // tap, with aria-expanded reading the exact opposite of the visible state,
  // and the × icon animation following the aria value, not the menu. One
  // handler, one truth.

  // Bot gate timestamps. Every public form carries a hidden _t field; the
  // shared gate (netlify/functions/utils/bot-gate.js) refuses submissions that
  // arrive faster than a person can fill the form. Stamp at load, once.
  document.querySelectorAll('form input[name="_t"]').forEach((el) => {
    if (!el.value) el.value = String(Date.now());
  });

  // Contact form handling
  const contactForm = document.querySelector('#contact-form');
  if (contactForm) {
    const successEl = document.querySelector('#form-success');
    const errorEl = document.querySelector('#form-error');
    const submitButton = contactForm.querySelector('button[type="submit"]');

    const clearMessages = () => {
      if (successEl) successEl.classList.add('hidden');
      if (errorEl) {
        errorEl.textContent = '';
        errorEl.classList.add('hidden');
      }
    };

    const showError = (text, field) => {
      if (successEl) successEl.classList.add('hidden');
      if (errorEl) {
        errorEl.textContent = text;
        errorEl.classList.remove('hidden');
      }
      if (field && typeof field.focus === 'function') field.focus();
    };

    contactForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearMessages();

      const formData = new FormData(contactForm);
      const formObject = {};
      formData.forEach((value, key) => {
        formObject[key] = value;
      });

      const name = String(formObject.name || '').trim();
      const email = String(formObject.email || '').trim();
      const message = String(formObject.message || '').trim();

      if (!name) {
        showError('Please add your name so Ed knows who to reply to.', contactForm.querySelector('#name'));
        return;
      }
      if (!/^[^s@]+@[^s@]+.[^s@]+$/.test(email)) {
        showError('Please add a valid email address.', contactForm.querySelector('#email'));
        return;
      }
      if (message.length < 10) {
        showError('Please add a little more detail so Ed can answer properly.', contactForm.querySelector('#message'));
        return;
      }

      const idleLabel = submitButton ? submitButton.textContent : '';
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.setAttribute('aria-busy', 'true');
        submitButton.textContent = 'Sending…';
      }

      try {
        const response = await fetch('/.netlify/functions/contact-form', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(formObject)
        });

        const result = await response.json().catch(() => ({}));

        if (response.ok && result.success === true) {
          if (successEl) successEl.classList.remove('hidden');
          contactForm.reset();
        } else {
          const text = result.message
            || (typeof result.error === 'string' ? result.error : null)
            || 'We could not send that just now. Please call 803-431-6180 and we will take it from there.';
          showError(text);
        }
      } catch (error) {
        console.error('Form submission error:', error);
        showError(
          'We could not reach the form service from this page. Please try again in a moment, or call 803-431-6180 and we will take it down directly.'
        );
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.removeAttribute('aria-busy');
          submitButton.textContent = idleLabel || 'Send message';
        }
      }
    });
  }

  // Images written by hand in markdown, rather than by partials/picture.html.
  // Give them the same treatment. No `lazyload` class: it existed only to feed
  // the polyfill, and the browser honours the native attribute on its own.
  const images = document.querySelectorAll(".content img");
  images.forEach(img => {
    if (!img.hasAttribute("loading")) img.setAttribute("loading", "lazy");
    if (!img.hasAttribute("decoding")) img.setAttribute("decoding", "async");
    if (!img.classList.contains("inline")) {
      img.classList.add("responsive-img");
    }
  });
  
  // Initialize any interactive elements
  initializeSliders();
  initializeModals();
});

// Slider initialization
function initializeSliders() {
  const sliders = document.querySelectorAll('.slider');
  
  if (sliders.length === 0) return;
  
  // Basic slider functionality
  sliders.forEach(slider => {
    const slides = slider.querySelectorAll('.slide');
    const prevBtn = slider.querySelector('.slider-prev');
    const nextBtn = slider.querySelector('.slider-next');
    
    let currentSlide = 0;
    
    function showSlide(n) {
      slides.forEach(slide => slide.style.display = 'none');
      currentSlide = (n + slides.length) % slides.length;
      slides[currentSlide].style.display = 'block';
    }
    
    if (prevBtn) {
      prevBtn.addEventListener('click', () => showSlide(currentSlide - 1));
    }
    
    if (nextBtn) {
      nextBtn.addEventListener('click', () => showSlide(currentSlide + 1));
    }
    
    // Initialize first slide
    showSlide(0);
  });
}

// Modal initialization
function initializeModals() {
  const modalTriggers = document.querySelectorAll('[data-toggle="modal"]');
  
  modalTriggers.forEach(trigger => {
    const targetId = trigger.getAttribute('data-target');
    const modal = document.querySelector(targetId);
    
    if (modal) {
      const closeBtn = modal.querySelector('.modal-close');
      
      trigger.addEventListener('click', (e) => {
        e.preventDefault();
        modal.classList.add('is-active');
      });
      
      if (closeBtn) {
        closeBtn.addEventListener('click', () => {
          modal.classList.remove('is-active');
        });
      }
      
      // Close modal when clicking background
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.remove('is-active');
        }
      });
    }
  });
}
