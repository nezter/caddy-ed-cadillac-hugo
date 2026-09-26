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

  const FIELDS = ['q', 'model', 'year', 'body_style', 'status', 'max_price', 'sort'];

  function init() {
    const form = document.querySelector('[data-inventory-filters]');
    const grid = document.getElementById('vehicle-inventory');
    if (!form || !grid) return;

    const cards = Array.prototype.slice.call(grid.querySelectorAll('[data-vehicle]'));
    if (!cards.length) return;

    const countEl = document.getElementById('inventory-count');
    const emptyEl = document.getElementById('inventory-empty');
    const searchEl = form.querySelector('#f-search');

    function fieldEl(name) {
      return form.querySelector('[name="' + name + '"]');
    }

    function val(name) {
      let el = fieldEl(name);
      return el ? String(el.value || '').trim().toLowerCase() : '';
    }

    function numVal(name) {
      let n = parseFloat(val(name));
      return isNaN(n) ? null : n;
    }

    function matches(card, q, model, year, body, status, maxPrice) {
      if (q && (card.dataset.title || '').indexOf(q) === -1) return false;
      if (model && card.dataset.model !== model) return false;
      if (year && String(card.dataset.year) !== year) return false;
      if (body && card.dataset.body !== body) return false;
      if (status && (card.dataset.status || '') !== status) return false;
      if (maxPrice !== null) {
        let p = parseFloat(card.dataset.price || '0');
        if (!(p > 0 && p <= maxPrice)) return false;
      }
      return true;
    }

    function sortCards(list, mode) {
      const num = function (el, key) { return parseFloat(el.dataset[key] || '0') || 0; };
      const comparators = {
        'price-asc': function (a, b) {
          return (num(a, 'price') || Infinity) - (num(b, 'price') || Infinity);
        },
        'price-desc': function (a, b) { return num(b, 'price') - num(a, 'price'); },
        'year-desc': function (a, b) { return num(b, 'year') - num(a, 'year'); },
        'mileage-asc': function (a, b) {
          return (num(a, 'mileage') || Infinity) - (num(b, 'mileage') || Infinity);
        },
        // Default: featured first, then newest, then cheapest.
        featured: function (a, b) {
          const fa = a.dataset.featured === '1' ? 0 : 1;
          const fb = b.dataset.featured === '1' ? 0 : 1;
          if (fa !== fb) return fa - fb;
          const y = num(b, 'year') - num(a, 'year');
          if (y !== 0) return y;
          return (num(a, 'price') || Infinity) - (num(b, 'price') || Infinity);
        },
      };
      return list.slice().sort(comparators[mode] || comparators.featured);
    }

    function apply() {
      let q = val('q');
      let model = val('model');
      let year = val('year');
      let body = val('body_style');
      let status = val('status');
      let maxPrice = numVal('max_price');
      let sort = val('sort') || 'featured';

      let visible = cards.filter(function (card) {
        return matches(card, q, model, year, body, status, maxPrice);
      });
      visible = sortCards(visible, sort);

      // Re-append in sort order: simpler and more predictable than CSS
      // ordering, and it keeps DOM order aligned with reading order for
      // keyboard and screen-reader users.
      const frag = document.createDocumentFragment();
      for (let i = 0; i < visible.length; i += 1) {
        frag.appendChild(visible[i]);
      }
      grid.appendChild(frag);

      for (let j = 0; j < cards.length; j += 1) {
        cards[j].classList.toggle('hidden', visible.indexOf(cards[j]) === -1);
      }

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

    function writeUrl() {
      const params = new URLSearchParams();
      FIELDS.forEach(function (key) {
        let el = fieldEl(key);
        if (el && el.value && el.value !== 'featured') params.set(key, el.value);
      });
      let qs = params.toString();
      const url = qs ? '?' + qs : window.location.pathname;
      window.history.replaceState(null, '', url);
    }

    function readUrl() {
      const params = new URLSearchParams(window.location.search);
      FIELDS.forEach(function (key) {
        let v = params.get(key);
        let el = fieldEl(key);
        if (v && el) el.value = v;
      });
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      apply();
    });
    form.addEventListener('change', function () {
      apply();
      writeUrl();
    });
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
        writeUrl();
      }
    });

    readUrl();
    apply();
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
