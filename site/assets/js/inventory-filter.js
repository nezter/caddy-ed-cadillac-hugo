/**
 * inventory-filter.js -- client-side filtering for the inventory grid.
 *
 * Design note: the entire inventory is server-rendered by Hugo from content
 * files (see site/layouts/section/inventory.html). This script only narrows
 * what is already in the DOM. It deliberately does NOT fetch from
 * /.netlify/functions/inventory-api.
 *
 * The previous setup did the opposite: inventory.js looked for
 #vehicle-inventory / #inventory-filters / #inventory-pagination and fetched
 * everything from a function, but the section layout rendered none of those
 * elements -- so the page loaded a bundle that silently did nothing, and
 * browsing inventory depended on a serverless function being reachable.
 *
 * Every vehicle card carries data-* attributes for its filter keys, so this
 * never has to parse text out of the markup.
 *
 * Consolidated from eleven competing implementations. The review is in
 * docs/inventory-consolidation.md. What survived the port, and why:
 *
 *   empty state for zero inventory   error-states.js:20-50
 *   active-filter count              FilterUI.js:549-590
 *   drivetrain / transmission facets FilterManager.js:55-70 (the data was
 *                                     already in 35 of 36 content files and
 *                                     had never been surfaced)
 *   price-band preset chips          FilterManager.js:101-124
 *   multi-select, OR within a facet  FilterManager.js:459-522
 *   favourites / shortlist           vehicle-inventory.js:112-169
 *
 * Declined: named saved searches and session memory (the URL is strictly
 * better and survives a share), range sliders (the code depended on
 * noUiSlider, which is loaded nowhere -- 99 lines never executed), pagination
 * (35 vehicles does not need it), and a mobile filter drawer (the grid
 * already stacks).
 */

(function () {
  'use strict';

  const FIELDS = [
    'q', 'model', 'year', 'drivetrain', 'transmission', 'status', 'max_price', 'sort',
  ];
  // Facets that accept more than one value. OR within a facet, AND across
  // facets -- the convention every faceted search uses, and what
  // FilterManager.js:459-522 got right.
  const MULTI = ['model', 'year', 'drivetrain', 'transmission', 'status'];
  const PRICE_BANDS = [
    { label: 'Under $40k', max: 40000 },
    { label: '$40k-$55k', min: 40000, max: 55000 },
    { label: '$55k-$70k', min: 55000, max: 70000 },
    { label: '$70k-$90k', min: 70000, max: 90000 },
    { label: '$90k+', min: 90000 },
  ];
  const STORE_KEY = 'caddy-ed:favourites';

  function init() {
    const form = document.querySelector('[data-inventory-filters]');
    const grid = document.getElementById('vehicle-inventory');
    if (!form || !grid) return;

    const cards = Array.prototype.slice.call(grid.querySelectorAll('[data-vehicle]'));
    const countEl = document.getElementById('inventory-count');
    const emptyEl = document.getElementById('inventory-empty');
    const searchEl = form.querySelector('#f-search');
    const badgeEl = document.getElementById('inventory-active-filters');

    // The list is paginated at build time (24 per page), so `cards` is this
    // page only. Filtering narrows within the page; pageTotals is the whole
    // inventory, so the count can say "4 of 24 shown, 35 in stock" rather than
    // implying the page is the whole set.
    const pageTotals = parseInt(grid.dataset.total || '0', 10) || 0;
    const pageSize = parseInt(grid.dataset.pageSize || '0', 10) || 0;
    const paginated = pageTotals > cards.length;

    // Zero inventory is a different situation from zero matches. A filter that
    // matches nothing can be undone; an empty dealership cannot, and the page
    // used to render blank with no explanation and no way forward.
    if (!cards.length) {
      if (emptyEl) {
        emptyEl.classList.remove('hidden');
        const msg = emptyEl.querySelector('[data-empty-message]');
        if (msg) {
          msg.textContent =
            'There are no vehicles in stock right now. New stock arrives regularly — ' +
            'get in touch and we will let you know first.';
        }
        // "Clear filters" is meaningless with nothing to clear.
        const resetBtn = emptyEl.querySelector('[data-inventory-reset]');
        if (resetBtn) resetBtn.remove();
      }
      if (countEl) countEl.textContent = 'No vehicles in stock';
      return;
    }

    /* Fields are resolved inside the form first, then anywhere in the document
       that is associated with it by the form attribute. That second lookup is
       what lets the quick-filter toolbar above the grid carry its own copy of
       the controls without a second JavaScript path: one field of each name is
       authoritative, and a control bound with form="inventory-filters" is the
       same control as far as the form is concerned. */
    function fieldEl(name) {
      return form.querySelector('[name="' + name + '"]') ||
             document.querySelector('[form="' + form.id + '"][name="' + name + '"]');
    }

    function val(name) {
      const el = fieldEl(name);
      return el ? String(el.value || '').trim().toLowerCase() : '';
    }

    function numVal(name) {
      const n = parseFloat(val(name));
      return isNaN(n) ? null : n;
    }

    /** Selected values for a facet. A multiple <select> returns an array. */
    function vals(name) {
      const el = fieldEl(name);
      if (!el) return [];
      if (el.multiple) {
        return Array.prototype.slice
          .call(el.selectedOptions)
          .map((o) => String(o.value).trim().toLowerCase())
          .filter(Boolean);
      }
      const v = String(el.value || '').trim().toLowerCase();
      return v ? [v] : [];
    }

    function hasFacets() {
      return vals('model').length || vals('year').length || vals('drivetrain').length ||
        vals('transmission').length || vals('status').length || numVal('max_price') !== null;
    }

    let priceBand = null;

    function matches(card, q, model, year, drivetrain, transmission, status, maxPrice) {
      if (q && (card.dataset.title || '').indexOf(q) === -1) return false;
      if (model.length && model.indexOf(card.dataset.model || '') === -1) return false;
      if (year.length && year.indexOf(String(card.dataset.year || '')) === -1) return false;
      if (drivetrain.length && drivetrain.indexOf(card.dataset.drivetrain || '') === -1) return false;
      if (transmission.length && transmission.indexOf(card.dataset.transmission || '') === -1) return false;
      if (status.length && status.indexOf(card.dataset.status || '') === -1) return false;
      if (maxPrice !== null) {
        const p = parseFloat(card.dataset.price || '0');
        if (!(p > 0 && p <= maxPrice)) return false;
      }
      if (priceBand) {
        const p = parseFloat(card.dataset.price || '0');
        if (!(p > 0 && p >= priceBand.lo && p <= priceBand.hi)) return false;
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
        'year-desc': function (a, b) {
          return num(b, 'year') - num(a, 'year') || (num(a, 'price') || Infinity) - (num(b, 'price') || Infinity);
        },
        'mileage-asc': function (a, b) {
          return (num(a, 'mileage') || Infinity) - (num(b, 'mileage') || Infinity);
        },
      };
      // No `featured` comparator: the feed never sets `featured`, so it was a
      // no-op that silently fell through to year-desc. The option is gone from
      // the select too.
      return list.slice().sort(comparators[mode] || comparators['year-desc']);
    }

    function updateActiveFilterCount() {
      if (!badgeEl) return;
      let n = 0;
      FIELDS.forEach(function (key) {
        if (key === 'sort') return;
        if (key === 'max_price') {
          if (numVal('max_price') !== null) n += 1;
        } else if (key === 'q') {
          if (val('q')) n += 1;
        } else {
          n += vals(key).length;
        }
      });
      badgeEl.textContent = n ? n + ' active' : '';
      badgeEl.classList.toggle('hidden', n === 0);
      updateAccordionSummary(n);
    }

    /**
     * Keep the accordion honest about the filters inside it.
     *
     * The controls live in a <details>, collapsed on the home page. That is the
     * right default -- it stops ~200px of form sitting between the fleet heading
     * and the cars -- but it creates a new way to be misleading: a visitor
     * filters, closes the accordion, and the list below is no longer the whole
     * list, with nothing on screen to say so.
     *
     * So the summary carries the count and reads differently once filters are on.
     * Closing the accordion then hides the controls, never the fact that
     * filtering is active.
     */
    function updateAccordionSummary(n) {
      var summary = document.querySelector('[data-filter-summary]');
      var details = summary && summary.closest('details');
      if (!summary || !details) return;
      summary.textContent = n ? n + (n === 1 ? ' filter on' : ' filters on') : '';
      details.classList.toggle('has-active-filters', n > 0);
    }

    function apply() {
      const q = val('q');
      const model = vals('model');
      const year = vals('year');
      const drivetrain = vals('drivetrain');
      const transmission = vals('transmission');
      const status = vals('status');
      const maxPrice = numVal('max_price');
      const sort = val('sort') || 'year-desc';

      let visible = cards.filter(function (card) {
        return matches(card, q, model, year, drivetrain, transmission, status, maxPrice);
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
        let text =
          visible.length + (visible.length === 1 ? ' vehicle' : ' vehicles');
        if (visible.length !== cards.length) {
          text += ' of ' + cards.length + ' on this page';
        }
        if (paginated) {
          text += ' (' + pageTotals + ' in stock)';
        }
        countEl.textContent = text;
      }
      if (emptyEl) emptyEl.classList.toggle('hidden', visible.length > 0);
      updateActiveFilterCount();
    }

    function reset() {
      form.reset();
      priceBand = null;
      const host = document.getElementById('inventory-price-bands');
      if (host) {
        Array.prototype.slice.call(host.querySelectorAll('.chip')).forEach(function (c) {
          c.setAttribute('aria-pressed', 'false');
        });
      }
      apply();
      writeUrl();
      if (searchEl) searchEl.focus();
    }

    function writeUrl() {
      const params = new URLSearchParams();
      FIELDS.forEach(function (key) {
        const el = fieldEl(key);
        if (!el) return;
        if (el.multiple) {
          const selected = Array.prototype.slice.call(el.selectedOptions).map((o) => o.value);
          if (selected.length) params.set(key, selected.join(','));
        } else if (el.value && el.value !== 'year-desc') {
          params.set(key, el.value);
        }
      });
      const qs = params.toString();
      const url = qs ? '?' + qs : window.location.pathname;
      window.history.replaceState(null, '', url);
    }

    function readUrl() {
      const params = new URLSearchParams(window.location.search);
      FIELDS.forEach(function (key) {
        const v = params.get(key);
        if (!v) return;
        const el = fieldEl(key);
        if (!el) return;
        if (el.multiple) {
          // A multiple select cannot be assigned a comma string; set options.
          const wanted = v.split(',').map((s) => s.trim()).filter(Boolean);
          Array.prototype.slice.call(el.options).forEach(function (o) {
            o.selected = wanted.indexOf(String(o.value).trim()) !== -1;
          });
        } else {
          el.value = v;
        }
      });
    }

    // --- favourites ---------------------------------------------------------
    // localStorage, deliberately. "Save this car" has no server to live on and
    // no account system to hang off; pretending otherwise would mean either a
    // dead button or a new auth surface.
    function loadFavourites() {
      try {
        const raw = window.localStorage.getItem(STORE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        // Private mode, disabled storage, or corrupt JSON. Not worth a
        // console error; the feature just starts empty.
        return [];
      }
    }

    function saveFavourites(list) {
      try {
        window.localStorage.setItem(STORE_KEY, JSON.stringify(list));
      } catch { /* nothing to do; the session still works */ }
    }

    function initFavourites() {
      let favs = loadFavourites();
      cards.forEach(function (card) {
        const link = card.querySelector('a[href]');
        if (!link) return;
        const href = link.getAttribute('href');
        if (!href || href === '#') return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'vehicle-card__fav';
        btn.setAttribute('data-fav', href);
        btn.setAttribute('aria-pressed', favs.indexOf(href) !== -1 ? 'true' : 'false');
        btn.setAttribute('aria-label', 'Save this vehicle');
        btn.textContent = favs.indexOf(href) !== -1 ? '★' : '☆';
        btn.title = 'Save this vehicle';
        card.querySelector('.vehicle-card__media')?.appendChild(btn);
      });

      document.addEventListener('click', function (e) {
        const btn = e.target.closest('[data-fav]');
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        const href = btn.getAttribute('data-fav');
        const i = favs.indexOf(href);
        if (i === -1) {
          favs.push(href);
        } else {
          favs.splice(i, 1);
        }
        saveFavourites(favs);
        const on = favs.indexOf(href) !== -1;
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        btn.textContent = on ? '★' : '☆';
      });
    }

    // --- price band chips ---------------------------------------------------
    function initPriceBands() {
      const host = document.getElementById('inventory-price-bands');
      if (!host) return;
      PRICE_BANDS.forEach(function (band) {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'chip';
        chip.textContent = band.label;
        chip.setAttribute('data-min', band.min === undefined ? '' : String(band.min));
        chip.setAttribute('data-max', band.max === undefined ? '' : String(band.max));
        chip.setAttribute('aria-pressed', 'false');
        host.appendChild(chip);
      });
      host.addEventListener('click', function (e) {
        const chip = e.target.closest('.chip');
        if (!chip) return;
        const wasOn = chip.getAttribute('aria-pressed') === 'true';
        Array.prototype.slice.call(host.querySelectorAll('.chip')).forEach(function (c) {
          c.setAttribute('aria-pressed', 'false');
        });
        if (wasOn) {
          apply();
          return;
        }
        chip.setAttribute('aria-pressed', 'true');
        const min = parseFloat(chip.getAttribute('data-min'));
        const max = parseFloat(chip.getAttribute('data-max'));
        const lo = isNaN(min) ? 0 : min;
        const hi = isNaN(max) ? Infinity : max;
        // Bands are an AND with the other filters, and they compose with the
        // sort and the count rather than reimplementing them -- the first
        // version of this handler had its own copy of the counting logic and
        // disagreed with apply() about pagination.
        priceBand = { lo: lo, hi: hi };
        apply();
      });
    }

    // --- wiring -------------------------------------------------------------
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      apply();
      // The search field is the most-used control on the page; it was excluded
      // from the URL, so a filtered result could not be shared or reloaded.
      writeUrl();
    });
    form.addEventListener('change', function () {

    /* Controls that live OUTSIDE the form but belong to it via the form
       attribute -- the sort control in the toolbar above the grid -- do not
       bubble their events to the form. A form attribute makes an element a form
       owner for submission; it does not make it a DOM descendant, so a
       delegated listener on the form never sees the event.

       That is why moving the sort control stopped the sort working. fieldEl
       already resolves such controls, so the value was readable and the control
       appeared wired; it simply never triggered anything.

       This listener catches them by asking the same question fieldEl asks. */
    document.addEventListener('change', function (e) {
      if (e.target && e.target.form === form) { apply(); writeUrl(); }
    });
    document.addEventListener('input', function (e) {
      if (e.target && e.target.form === form && e.target.type !== 'search') { apply(); writeUrl(); }
    });
      apply();
      writeUrl();
    });
    form.addEventListener('reset', function () { setTimeout(apply, 0); });

    if (searchEl) {
      let debounce;
      searchEl.addEventListener('input', function () {
        clearTimeout(debounce);
        debounce = setTimeout(function () {
          apply();
          writeUrl();
        }, 200);
      });
    }

    document.addEventListener('click', function (e) {
      // The Clear filters button in the filter bar had only an id while this
      // matched an attribute, and `type="button"` fires no native reset -- so
      // the page's primary control was inert. Both selectors are accepted, and
      // the native reset event is handled too, so a future button of either
      // shape works.
      if (e.target.closest('#f-reset, [data-inventory-reset]')) {
        e.preventDefault();
        reset();
      }
    });

    // Enable the multi-selects. A bare `multiple` select is a bad control --
    // a 40-item list box with no hint that ctrl-click is required -- so the
    // markup gets a real affordance instead.
    MULTI.forEach(function (name) {
      const el = fieldEl(name);
      if (el) el.multiple = true;
    });

    initFavourites();
    initPriceBands();
    readUrl();
    apply();
  }

  /* --- price ceiling: live readout -------------------------------------
     The slider shipped with a readout element that nothing updated: the
     number only changed after a reload. Additive and guarded -- it reads
     the slider, writes the figure, and never touches the filter logic.
     -------------------------------------------------------------------- */
  (function () {
    try {
      var slider = document.getElementById('f-max-price');
      var out = document.querySelector('[data-price-readout]');
      if (!slider || !out) return;

      var money = function (n) {
        return String.fromCharCode(36) + Math.round(n).toLocaleString('en-US');
      };

      var sync = function () {
        var v = parseFloat(slider.value);
        var top = parseFloat(slider.max);
        if (!isFinite(v)) return;
        out.textContent = (isFinite(top) && v >= top) ? 'Up to ' + money(top) : 'Up to ' + money(v);
      };

      slider.addEventListener('input', sync);
      slider.addEventListener('change', sync);

      // readUrl() sets the slider from the query string inside init(), which
      // runs on DOMContentLoaded -- so the first paint is deferred past it.
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(sync, 60); });
      } else {
        setTimeout(sync, 60);
      }
    } catch (e) { /* a readout must never break the filter */ }
  })();

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
