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
    'q', 'model', 'year', 'drivetrain', 'transmission', 'status', 'max_price', 'max_mileage', 'sort',
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

    // The list is paginated at build time, so `cards` is this page only.
    // pageTotals is the whole set the page belongs to, so counts read
    // "35 vehicles · 24 shown" -- one shape, the same one the server renders
    // into the quick strip and the rail count, so the two surfaces cannot
    // disagree after the first filter either.
    const pageTotals = parseInt(grid.dataset.total || '0', 10) || 0;

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

    /**
     * Is this ceiling actually filtering?
     *
     * No, when it sits at the top of its own range -- that position means
     * "any", and the readout says so. Treating it as a filter is how a page
     * with nothing filtered ends up reporting an active filter, and how a
     * shared link carries a ceiling nobody chose.
     */
    function ceilingActive(name) {
      const el = fieldEl(name);
      if (!el) return false;
      const v = parseFloat(el.value);
      const top = parseFloat(el.max);
      if (!isFinite(v)) return false;
      return !(isFinite(top) && v >= top);
    }

    function hasFacets() {
      return vals('model').length || vals('year').length || vals('drivetrain').length ||
        vals('transmission').length || vals('status').length || ceilingActive('max_price') ||
        ceilingActive('max_mileage');
    }

    let priceBand = null;

    /**
     * The quick strip above the rail carries mirrors, not duplicates.
     *
     * Each control writes the rail's field of the same name; apply() then
     * refreshes every mirror from the authoritative field. One source of
     * truth, two places to reach it -- the strip can never drift out of step
     * with the rail, and the URL keeps describing exactly what is filtering.
     *
     * A facet the rail holds several values for shows its first value in the
     * strip; choosing in the strip replaces the set with that one value, which
     * is what a quick filter is for. Multi-select stays in the rail.
     */
    const mirrors = Array.prototype.slice.call(document.querySelectorAll('[data-mirror]'));

    function bandKey(band) {
      return (band.min === undefined ? 0 : band.min) + ':' + (band.max === undefined ? '' : band.max);
    }

    function setChipsPressed() {
      const chips = document.querySelectorAll('#inventory-price-bands .chip');
      Array.prototype.slice.call(chips).forEach(function (c) {
        c.setAttribute('aria-pressed',
          c.getAttribute('data-key') === (priceBand ? priceBand.key : '') ? 'true' : 'false');
      });
    }

    function syncMirrors() {
      mirrors.forEach(function (m) {
        const name = m.getAttribute('data-mirror');
        if (name === 'price') {
          m.value = priceBand ? priceBand.key : '';
          return;
        }
        const el = fieldEl(name);
        if (!el) return;
        if (el.multiple) {
          const selected = Array.prototype.slice
            .call(el.selectedOptions)
            .map(function (o) { return o.value; })
            .filter(Boolean);
          m.value = selected.length ? selected[0] : '';
        } else {
          m.value = el.value || '';
        }
      });
    }

    function matches(card, q, model, year, drivetrain, transmission, status, maxPrice, maxMileage) {
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
      if (maxMileage !== null) {
        const m = parseFloat(card.dataset.mileage || '0');
        // A car with no mileage recorded is not a low-mileage car.
        if (!(m >= 0 && m <= maxMileage)) return false;
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
        if (key === 'max_price' || key === 'max_mileage') {
          if (ceilingActive(key)) n += 1;
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
      const maxMileage = numVal('max_mileage');
      const sort = val('sort') || 'year-desc';

      let visible = cards.filter(function (card) {
        return matches(card, q, model, year, drivetrain, transmission, status, maxPrice, maxMileage);
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

      /* One sentence on both surfaces: the count under the rail's controls
         and the quick strip above the grid. They used to be worded
         differently -- "13 vehicles of 24 on this page (35 in stock)"
         against "35 vehicles · 13 shown" -- which read like two different
         counts of the same thing. */
      const summary =
        pageTotals + (pageTotals === 1 ? ' vehicle' : ' vehicles') +
        ' \u00b7 ' + visible.length + ' shown';
      if (countEl) countEl.textContent = summary;
      if (emptyEl) emptyEl.classList.toggle('hidden', visible.length > 0);
      updateActiveFilterCount();

      const railCount = document.querySelector('[data-rail-count]');
      if (railCount) railCount.textContent = summary;
      syncMirrors();
    }

    function reset() {
      form.reset();
      priceBand = null;

      /* The multi-selects are upgraded at runtime (el.multiple = true), and a
         reset is the one moment their default state matters. Restoring them
         explicitly rather than trusting the platform keeps this reset the
         same everywhere -- including the harnesses that stand in for a
         browser, where the platform half-does it. */
      MULTI.forEach(function (name) {
        const el = fieldEl(name);
        if (!el || !el.multiple) return;
        Array.prototype.slice.call(el.options).forEach(function (o) {
          o.selected = !o.value;
        });
      });

      /* The readouts repaint from the sliders own change event, which a form
         reset does not fire -- so without this the ceiling would go back to
         Any while still reading "Up to $30,000". */
      ["f-max-price", "f-max-mileage"].forEach(function (id) {
        const el = document.getElementById(id);
        if (el) el.dispatchEvent(new Event("change"));
      });

      setChipsPressed();
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
          // The upgrade to a multiple select leaves the "All models" /
          // "Any year" option selected, and its value is the empty string.
          // Unfiltered, that wrote `model=&year=&drivetrain=...` into the
          // address bar on every interaction: a query string full of
          // parameters that filter nothing, sharing a URL that reads like
          // six filters are on.
          const selected = Array.prototype.slice
            .call(el.selectedOptions)
            .map((o) => o.value)
            .filter(Boolean);
          if (selected.length) params.set(key, selected.join(','));
        } else if (el.value && el.value !== 'year-desc') {
          // At the top of its range a ceiling changes nothing, so writing
          // it into the address bar would make every shared link claim a
          // filter that is not applied.
          if (el.type === 'range' && el.max && el.value === el.max) return;
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
        chip.setAttribute('data-key', bandKey(band));
        host.appendChild(chip);
      });

      /* The strip's price control lists the same bands, built from the same
         array, so the two surfaces cannot list different sets. */
      const stripPrice = document.querySelector('[data-mirror="price"]');
      if (stripPrice) {
        PRICE_BANDS.forEach(function (band) {
          const opt = document.createElement('option');
          opt.value = bandKey(band);
          opt.textContent = band.label;
          stripPrice.appendChild(opt);
        });
      }
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
        // `key` is the strip option value for the same band, so one click
        // moves both surfaces to the same state.
        priceBand = { lo: lo, hi: hi, key: chip.getAttribute('data-key') || '' };
        setChipsPressed();
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
      apply();
      writeUrl();
    });

    /* Controls that live OUTSIDE the form but belong to it through the form
       attribute -- the sort control in the toolbar, and the price slider -- do
       not bubble their events to the form. A form attribute makes an element a
       form owner for submission; it does not make it a DOM descendant, so a
       delegated listener on the form never sees the event.

       These two listeners were registered INSIDE the change handler above,
       which meant they did not exist until the form had already changed once.
       On a freshly loaded page the price slider therefore did nothing at all:
       dragging it fired `input`, and nothing was listening. Every change also
       added two more listeners, so they accumulated. Registered once, here. */
    document.addEventListener('change', function (e) {
      if (e.target && e.target.form === form) { apply(); writeUrl(); }
    });
    document.addEventListener('input', function (e) {
      if (e.target && e.target.form === form && e.target.type !== 'search') { apply(); writeUrl(); }
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

    /* The strip's controls, wired to the rail. A mirror writes its field and
       runs the same apply()/writeUrl() pair every other change runs; the
       syncMirrors() inside apply() then refreshes it, so a programmatic
       value and a typed one can never disagree. The price mirror drives the
       band state instead of a form field, because that is what the chips
       drive too. */
    mirrors.forEach(function (m) {
      const name = m.getAttribute('data-mirror');

      if (name === 'price') {
        m.addEventListener('change', function () {
          if (!m.value) {
            priceBand = null;
          } else {
            const parts = m.value.split(':');
            const lo = parseFloat(parts[0]);
            const hi = parts[1] === '' ? Infinity : parseFloat(parts[1]);
            priceBand = {
              lo: isNaN(lo) ? 0 : lo,
              hi: isNaN(hi) ? Infinity : hi,
              key: m.value,
            };
          }
          setChipsPressed();
          apply();
          writeUrl();
        });
        return;
      }

      const write = function () {
        const el = fieldEl(name);
        if (!el) return;
        if (el.multiple) {
          Array.prototype.slice.call(el.options).forEach(function (o) {
            o.selected = o.value === m.value || (m.value === '' && o.value === '');
          });
        } else {
          el.value = m.value;
        }
        apply();
        writeUrl();
      };

      if (m.type === 'search') {
        let debounce;
        m.addEventListener('input', function () {
          clearTimeout(debounce);
          debounce = setTimeout(write, 200);
        });
      } else {
        m.addEventListener('change', write);
      }
    });

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

  /* --- the ceilings: live readouts -------------------------------------
     The slider shipped with a readout element that nothing updated: the
     number only changed after a reload. Additive and guarded -- it reads
     the slider, writes the figure, and never touches the filter logic.
     -------------------------------------------------------------------- */
  (function () {
    try {
      /* Two ceilings, one behaviour. The price ceiling came first and was
         hard-wired to one element; a second ceiling hard-wired beside it is
         how two controls end up disagreeing, so they share one loop.

         The top of the range means "any": at that position the control is
         not filtering anything, and a readout that still names a number
         there -- "Up to $150,000" on a list that is not being filtered --
         describes something that is not happening. */
      var ceilings = [
        { id: 'f-max-price', out: '[data-price-readout]', kind: 'price' },
        { id: 'f-max-mileage', out: '[data-mileage-readout]', kind: 'mileage' }
      ];

      var money = function (n) {
        return String.fromCharCode(36) + Math.round(n).toLocaleString('en-US');
      };
      var miles = function (n) {
        return Math.round(n).toLocaleString('en-US') + ' mi';
      };

      var sync = function (c) {
        var slider = document.getElementById(c.id);
        var out = document.querySelector(c.out);
        if (!slider || !out) return;
        var v = parseFloat(slider.value);
        var top = parseFloat(slider.max);
        if (!isFinite(v)) return;
        var atTop = isFinite(top) && v >= top;
        var fmt = c.kind === 'price' ? money : miles;
        out.textContent = atTop ? 'Any ' + c.kind : 'Up to ' + fmt(v);
        slider.setAttribute('aria-valuetext', out.textContent);
      };

      var syncAll = function () { ceilings.forEach(sync); };

      ceilings.forEach(function (c) {
        var slider = document.getElementById(c.id);
        if (!slider) return;
        slider.addEventListener('input', function () { sync(c); });
        slider.addEventListener('change', function () { sync(c); });
      });

      // readUrl() sets the sliders from the query string inside init(), which
      // runs on DOMContentLoaded -- so the first paint is deferred past it.
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(syncAll, 60); });
      } else {
        setTimeout(syncAll, 60);
      }
        } catch (e) { /* a readout must never break the filter */ }
  })();

  /* --- quick-filter chips: mark the one in force ----------------------
     .inv-chip[aria-current="page"] is already styled as the active pill,
     but nothing ever set the attribute, so no chip ever looked selected.
     Additive and guarded: it only reads the URL and sets an attribute. */
  (function () {
    try {
      var chips = document.querySelectorAll(".inv-chip");
      if (!chips.length) return;
      var q = window.location.search || "";
      if (q === "?") q = "";
      Array.prototype.forEach.call(chips, function (a) {
        var href = a.getAttribute("href") || "";
        var i = href.indexOf("?");
        var qs = i === -1 ? "" : href.slice(i);
        if (qs === q) a.setAttribute("aria-current", "page");
      });
    } catch (e) { /* a chip highlight must never break the filter */ }
  })();

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
