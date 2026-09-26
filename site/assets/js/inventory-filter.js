/**
 * inventory-filter.js -- client-side filtering for the inventory grid.
 *
 * Design note: the entire inventory is server-rendered by Hugo from content
 * files (see site/layouts/section/inventory.html). This script only narrows
 * what is already in the DOM. It deliberately does NOT fetch from
 * /.netlify/functions/inventory-api.
 *
 * The previous setup did the opposite: inventory.js looked for
 * #vehicle-inventory / #inventory-filters / #inventory-pagination and fetched
 * everything from a function, but the section layout rendered none of those
 * elements -- so the page loaded a bundle that silently did nothing, and
 * browsing inventory depended on a serverless function being reachable.
 *
 * Every vehicle card carries data-* attributes for its filter keys, so this
 * never has to parse text out of the markup.
 */

(function () {
  'use strict';

  function init() {
    let form = document.querySelector('[data-inventory-filters]');
    let grid = document.getElementById('vehicle-inventory');
    if (!form || !grid) return;

    let cards = Array.prototype.slice.call(grid.querySelectorAll('[data-vehicle]'));
    if (!cards.length) return;

    let countEl = document.getElementById('inventory-count');
    let emptyEl = document.getElementById('inventory-empty');
    let searchEl = form.querySelector('#f-search');

    function val(name) {
      const el = form.querySelector('[name="' + name + '"]');
      return el ? el.value.trim().toLowerCase() : '';
    }

    function numVal(name) {
      const n = parseFloat(val(name));
      return isNaN(n) ? null : n;
    }

    function matches(card, q, model, year, body, status, maxPrice) {
      if (q) {
        const hay = card.dataset.title || '';
        if (hay.indexOf(q) === -1) return false;
      }
      if (model && card.dataset.model !== model) return false;
      if (year && String(card.dataset.year) !== year) return false;
      if (body && card.dataset.body !== body) return false;
      if (status && (card.dataset.status || '') !== status) return false;
      if (maxPrice !== null) {
        const p = parseFloat(card.dataset.price || '0');
        if (!(p > 0 && p <= maxPrice)) return false;
      }
      return true;
    }

    function sortCards(list, mode) {
      const by = {
        'price-asc': function (a, b) { return (+a.dataset.price || Infinity) - (+b.dataset.price || Infinity); },
        'price-desc': function (a, b) { return (+b.dataset.price || 0) - (+a.dataset.price || 0); },
        'year-desc': function (a, b) { return (+b.dataset.year || 0) - (+a.dataset.year || 0); },
        'mileage-asc': function (a, b) { return (+a.dataset.mileage || Infinity) - (+b.dataset.mileage || Infinity); },
        // Default: featured first, then newest, then cheapest.
        featured: function (a, b) {
          const fa = a.dataset.featured === '1' ? 0 : 1;
          const fb = b.dataset.featured === '1' ? 0 : 1;
          if (fa !== fb) return fa - fb;
          const y = (+b.dataset.year || 0) - (+a.dataset.year || 0);
          if (y !== 0) return y;
          return (+a.dataset.price || Infinity) - (+b.dataset.price || Infinity);
        },
      };
      return (by[mode] || by.featured)(list);
    }

    function apply() {
      const q = val('q');
      const model = val('model');
      const year = val('year');
      const body = val('body_style');
      const status = val('status');
      const maxPrice = numVal('max_price');
      const sort = val('sort') || 'featured';

      const visible = cards.filter(function (c) {
        return matches(c, q, model, year, body, status, maxPrice);
      });

      // Detach everything, then re-append in sort order. Simpler and more
      // predictable than juggling CSS ordering, and the list is short.
      visible = sortCards(visible, sort);
      cards.forEach(function (c) { c.classList.add('hidden'); });
      visible.forEach(function (c) { c.classList.remove('hidden'); });

      // Keep DOM order matching the visible order for keyboard/screen-reader flow.
      const frag = document.createDocumentFragment();
      visible.forEach(function (c) { frag.appendChild(c); });
      grid.appendChild(frag);

      if (countEl) {
        countEl.textContent =
          visible.length + (visible.length === 1 ? ' vehicle' : ' vehicles') +
          (visible.length === cards.length ? '' : ' of ' + cards.length);
      }
      if (emptyEl) emptyEl.classList.toggle('hidden', visible.length > 0);
    }

    function reset() {
      form.reset();
      apply();
      if (searchEl) searchEl.focus();
    }

    form.addEventListener('submit', function (e) { e.preventDefault(); apply(); });
    form.addEventListener('change', apply);
    form.addEventListener('reset', function () { setTimeout(apply, 0); });

    if (searchEl) {
      let debounce;
      searchEl.addEventListener('input', function () {
        clearTimeout(debounce);
        debounce = setTimeout(apply, 140);
      });
    }

    document.addEventListener('click', function (e) {
      if (e.target.closest('[data-inventory-reset]')) {
        e.preventDefault();
        reset();
      }
    });

    // Restore state from the URL so a filtered view is shareable and survives
    // a back/forward navigation.
    function readUrl() {
      const p = new URLSearchParams(window.location.search);
      ['q', 'model', 'year', 'body_style', 'status', 'max_price', 'sort'].forEach(function (k) {
        const v = p.get(k);
        const el = form.querySelector('[name="' + k + '"]');
        if (v && el) el.value = v;
      });
    }

    function writeUrl() {
      const p = new URLSearchParams();
      ['q', 'model', 'year', 'body_style', 'status', 'max_price', 'sort'].forEach(function (k) {
        const el = form.querySelector('[name="' + k + '"]');
        if (el && el.value && el.value !== 'featured') p.set(k, el.value);
      });
      const qs = p.toString();
      history.replaceState(null, '', qs ? '?' + qs : window.location.pathname);
    }

    readUrl();
    apply();
    form.addEventListener('change', writeUrl);
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
