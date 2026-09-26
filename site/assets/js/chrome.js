/**
 * chrome.js -- header behaviour.
 *
 * The previous implementation was an inline <script> inside
 * partials/header.html. It is here so it is bundled, fingerprinted and
 * cacheable, and so it can be linted.
 *
 * Also handles the sticky-header shadow, which the inline version did not.
 */

(function () {
  'use strict';

  function initNavToggle() {
    const toggle = document.getElementById('navToggle');
    const menu = document.getElementById('navMenu');
    if (!toggle || !menu) return;

    function setOpen(open) {
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Menu');
      menu.classList.toggle('is-active', open);
    }

    toggle.addEventListener('click', function () {
      setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });

    // Close on Escape and return focus to the trigger.
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        setOpen(false);
        toggle.focus();
      }
    });

    // Close when the viewport grows past the mobile breakpoint, otherwise the
    // menu stays "open" in the DOM while the desktop nav is showing.
    const mq = window.matchMedia('(min-width: 64rem)');
    const onChange = function (e) {
      if (e.matches) setOpen(false);
    };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);

    // Close after following a link (same-page anchors too).
    menu.addEventListener('click', function (e) {
      if (e.target.closest('a')) setOpen(false);
    });
  }

  function initHeaderShadow() {
    const header = document.querySelector('.site-header');
    if (!header) return;

    let ticking = false;
    function update() {
      header.classList.toggle('is-scrolled', window.scrollY > 8);
      ticking = false;
    }
    window.addEventListener(
      'scroll',
      function () {
        if (!ticking) {
          ticking = true;
          window.requestAnimationFrame(update);
        }
      },
      { passive: true }
    );
    update();
  }

  /**
   * Reveal-on-scroll. Purely decorative: if IntersectionObserver is missing or
   * the user prefers reduced motion, the content is simply visible. The CSS
   * also defaults `.reveal` to visible, so this can only ever enhance.
   */
  function initReveal() {
    const targets = document.querySelectorAll('.reveal');
    if (!targets.length) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !('IntersectionObserver' in window)) {
      targets.forEach(function (el) {
        el.classList.add('is-visible');
      });
      return;
    }

    const io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            io.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.05 }
    );

    targets.forEach(function (el) {
      io.observe(el);
    });
  }

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    initNavToggle();
    initHeaderShadow();
    initReveal();
  });
})();
