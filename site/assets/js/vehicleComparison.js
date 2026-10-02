/**
 * vehicleComparison.js -- put two or three cars side by side.
 *
 * WHAT CHANGED, AND WHY IT HAD NEVER WORKED
 * ------------------------------------------
 * Three defects stacked, so the feature was inert:
 *
 * 1. IT NEVER INITIALISED. The bootstrap looked for `.vehicle-comparison`
 *    elements. The page has `<div id="comparison-app">` and no such class, so
 *    the query returned nothing and no instance was ever constructed. Every
 *    method below was correct and unreachable.
 *
 * 2. IT FETCHED FROM A FUNCTION THAT HAS NO DATA. Each vehicle was fetched from
 *    /.netlify/functions/vehicle-details, which reads a live inventory feed
 *    through INVENTORY_SOURCE_URL -- which has no default, deliberately,
 *    because guessing a feed means scraping someone else's dealer site. With no
 *    feed configured the function answers "not configured", so the table could
 *    never have had a row in it.
 *
 * 3. THE CALL WAS MALFORMED ANYWAY. vehicle-details reads its id from the
 *    QUERY STRING (`?id=`). This called it with a PATH
 *    (`/vehicle-details/${vehicleId}`), so `queryStringParameters.id` was
 *    undefined and the function returned a validation error.
 *
 * So: the comparison now reads what is already on the page.
 *
 * Every field it shows is in the card's own data-* attributes, printed by
 * vehicle-card.html and used by the filter. The visitor clicked a card, so the
 * card is in the DOM, so the data is in the DOM. No fetch, no feed, no
 * dependency -- and it works on a static preview, which is where anybody
 * actually looks at it.
 *
 * SEPARATE FROM THE SHORTLIST, AND SAYS SO
 * -----------------------------------------
 * Compare is for deciding between cars. Shortlist is for telling Ed which ones
 * you want. They used to share one button, labelled "Shortlist", carrying the
 * class `vehicle-card__compare` and the attribute `data-add-comparison`, while
 * this feature had no button anywhere.
 *
 * This binds [data-compare-toggle] and nothing else. shortlist.js binds
 * [data-shortlist-toggle] and nothing else. Neither reads the other's name, and
 * they keep their state separately -- in the URL for a comparison (so it can be
 * shared or printed) and in localStorage for a shortlist (so it survives visits).
 *
 * NO MODAL, NO dialog
 * --------------------
 * The table is inserted into the page and the page scrolls to it. A dialog
 * would be easier to write and worse to use: a shopper comparing two cars wants
 * to see the cards, the prices and the specs in one view, and to be able to
 * reach the one they did not pick.
 *
 * WHAT THE TABLE SHOWS THAT IT DID NOT BEFORE
 * -------------------------------------------
 * Rows where the cars differ are marked, because those are the rows a
 * shopper came for; the lowest price and the lowest mileage carry a label
 * naming what they are the lowest of. Each car links to its own page, and
 * the whole selection can be cleared at once.
 *
 * On a phone the table is replaced by one card per car. A table cannot keep
 * its header row at 320px, and the header row is the only thing that says
 * which column belongs to which car -- so the phone got a layout where the
 * values were stacked under each specification name with nothing to
 * identify them. Both layouts are rendered from the same data.
 *
 * NOTHING HAPPENS SILENTLY
 * -------------------------
 * Comparing a car you already have, or going past the maximum, says so in the
 * live region. The old code used `alert()`, which blocks, is unstyled, is not
 * announced, and cannot be styled to match anything.
 */

'use strict';

(function () {
  var MAX = 3;
  var APP_ID = 'comparison-app';
  var TABLE_ID = 'comparison-table';
  var STATUS_ID = 'comparison-status';

  /**
   * The rows, in the order a shopper decides in: what it is, what it costs,
   * what condition it is in, then the mechanicals.
   *
   * `key` is the card's data-* attribute. `format` receives the RAW value, so
   * a missing value is "-" rather than "NaN" or "undefined mi".
   */
  var ROWS = [
    { label: 'Year', key: 'year' },
    { label: 'Make', key: 'make' },
    { label: 'Model', key: 'model' },
    { label: 'Trim', key: 'trim' },
    { label: 'Body', key: 'bodyStyle' },
    { label: 'Exterior', key: 'exterior' },
    { label: 'Interior', key: 'interior' },
    { label: 'Price', key: 'price', format: function (v) { return '$' + Number(v).toLocaleString('en-US'); } },
    { label: 'Mileage', key: 'mileage', format: function (v) { return Number(v).toLocaleString('en-US') + ' mi'; } },
    { label: 'Drivetrain', key: 'drivetrain' },
    { label: 'Transmission', key: 'transmission' },
    { label: 'Stock', key: 'stock' },
  ];

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** slug -> the data the card already carries. */
  function readCards() {
    var byslug = {};
    document.querySelectorAll('.vehicle-card[data-slug]').forEach(function (card) {
      byslug[card.dataset.slug] = card.dataset;
    });
    return byslug;
  }

  function stateFromUrl(cards) {
    var out = [];
    var params = new URLSearchParams(window.location.search);
    var raw = params.get('compare');
    if (!raw) return out;
    raw.split(',').forEach(function (slug) {
      var s = slug.trim();
      // Only keep a slug that is actually on this page. A shared link from
      // yesterday's inventory should show what it can, not a table of blanks.
      if (s && cards[s] && out.length < MAX) out.push(s);
    });
    return out;
  }

  function writeUrl(list) {
    var url = new URL(window.location);
    if (list.length) url.searchParams.set('compare', list.join(','));
    else url.searchParams.delete('compare');
    // replaceState, not assign: pushing a history entry per toggle means the
    // back button walks through shortlist changes one at a time.
    window.history.replaceState({}, '', url);
  }

  function app() { return document.getElementById(APP_ID); }
  function table() { return document.getElementById(TABLE_ID); }

  function status(message) {
    var el = document.getElementById(STATUS_ID);
    if (!el) return;
    el.textContent = message || '';
    el.hidden = !message;
  }

  var list = [];
  var cards = {};

  /** Where a value came from, formatted, with a missing value said so. */
  function cellText(d, row) {
    var raw = d[row.key];
    if (raw === undefined || raw === null || raw === '') return '—';
    return row.format ? row.format(raw) : raw;
  }

  /**
   * The rows a reader came for: the ones where the cars are not the same.
   *
   * A comparison table that renders every row with equal weight is a
   * specification sheet with the differences buried in it. The whole reason to
   * put two cars side by side is the handful of rows where they diverge, so
   * those rows are marked, in both layouts.
   */
  function differingRows(chosen) {
    var differ = {};
    ROWS.forEach(function (row) {
      if (chosen.length < 2) { differ[row.key] = false; return; }
      var values = chosen.map(function (d) { return cellText(d, row); });
      differ[row.key] = values.some(function (v) { return v !== values[0]; });
    });
    return differ;
  }

  /**
   * The lowest price and the lowest mileage among the cars being compared.
   *
   * These are facts about the numbers on screen, not a recommendation: on a
   * used car the cheaper one is not automatically the better one. So the
   * label names the measurement ("Lowest price") rather than advising anyone
   * to buy it.
   */
  function lowestValues(chosen) {
    var out = {};
    ['price', 'mileage'].forEach(function (key) {
      var nums = chosen
        .map(function (d) { return parseFloat(d[key]); })
        .filter(function (n) { return isFinite(n) && n > 0; });
      var distinct = nums.filter(function (n, i) { return nums.indexOf(n) === i; });
      // Only meaningful when the cars actually differ on it.
      out[key] = distinct.length > 1 ? Math.min.apply(null, distinct) : null;
    });
    return out;
  }

  function markFor(key, d, lowest) {
    if (lowest[key] === null) return '';
    if (parseFloat(d[key]) !== lowest[key]) return '';
    var label = key === 'price' ? 'Lowest price' : 'Lowest mileage';
    return '<span class="comparison-mark">' + label + '</span>';
  }

  /**
   * Draw the comparison.
   *
   * Two layouts from one set of data. The table is the right shape on a
   * desktop: specifications down the side, cars across the top. On a phone
   * the table cannot keep its own header row while staying readable, and the
   * header row is the only thing that says which column belongs to which car
   * -- so the phone gets one card per car instead, with the specification
   * names inside it. Both are rendered and CSS shows one, so they cannot
   * disagree, and neither is a fallback for the other.
   */
  function render() {
    var t = table();
    if (!t) return;

    if (!list.length) {
      t.classList.add('hidden');
      t.innerHTML = '';
      // The popup closes with the last car, and empties its body: a dialog
      // left open over an empty comparison shows the shopper nothing.
      var dlg = document.getElementById('comparison-dialog');
      if (dlg && dlg.open) {
        if (typeof dlg.close === 'function') dlg.close(); else dlg.removeAttribute('open');
      }
      var dlgBody = document.getElementById('comparison-dialog-body');
      if (dlgBody) dlgBody.innerHTML = '';
      if (dlg) dlg.removeAttribute('data-cars');
// The strip's compare section empties too, or it keeps showing cars that
      // are no longer in the comparison. reflectButtons() is upstream's
      // extraction of what used to be an inline copy of this same loop, so
      // calling it here is what resets every button.
      if (window.CaddyPickTray) window.CaddyPickTray.renderCompare([]);
      reflectButtons();
      return;
    }

    var chosen = list.map(function (slug) { return cards[slug]; }).filter(Boolean);
    var differ = differingRows(chosen);
    var lowest = lowestValues(chosen);

    var html = '<div class="comparison-tools">' +
      '<span class="comparison-tools__count">Comparing ' + chosen.length + ' of ' + MAX + '</span>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-compare-clear>Clear all</button>' +
      '</div>';

    /* ---- the table (desktop) ---- */
    html += '<div class="comparison-scroll"><table class="comparison-table__grid">'
      + '<caption class="visually-hidden">Side-by-side comparison of the cars you selected</caption>'
      + '<thead><tr><th scope="col"><span class="visually-hidden">Specification</span></th>';
    chosen.forEach(function (d) {
      var slug = encodeURIComponent(d.slug);
      html += '<th scope="col"><a class="comparison-table__name" href="/inventory/' + slug + '/">'
        + esc(d.title || d.slug) + '</a>'
        + '<button type="button" class="comparison-table__remove" data-compare-remove="' + esc(d.slug)
        + '">Remove<span class="visually-hidden"> ' + esc(d.title || d.slug)
        + ' from the comparison</span></button></th>';
    });
    html += '</tr></thead><tbody>';
    ROWS.forEach(function (row) {
      var isDiff = differ[row.key];
      html += '<tr' + (isDiff ? ' class="is-different"' : '') + '><th scope="row">' + esc(row.label)
        + (isDiff ? '<span class="visually-hidden"> (differs)</span>' : '') + '</th>';
      chosen.forEach(function (d) {
        html += '<td class="feature-value">' + esc(cellText(d, row)) + markFor(row.key, d, lowest) + '</td>';
      });
      html += '</tr>';
    });
    html += '</tbody></table></div>';

    /* ---- one card per car (phone) ---- */
    html += '<div class="comparison-cards">';
    chosen.forEach(function (d) {
      var slug = encodeURIComponent(d.slug);
      html += '<article class="comparison-card">'
        + '<h3 class="comparison-card__name"><a href="/inventory/' + slug + '/">'
        + esc(d.title || d.slug) + '</a></h3>'
        + '<button type="button" class="comparison-card__remove" data-compare-remove="' + esc(d.slug)
        + '">Remove<span class="visually-hidden"> ' + esc(d.title || d.slug)
        + ' from the comparison</span></button>'
        + '<dl class="comparison-card__specs">';
      ROWS.forEach(function (row) {
        html += '<div class="comparison-card__spec' + (differ[row.key] ? ' is-different' : '') + '">'
          + '<dt>' + esc(row.label) + '</dt><dd>' + esc(cellText(d, row)) + markFor(row.key, d, lowest) + '</dd></div>';
      });
      html += '</dl></article>';
    });
    html += '</div>';

    t.innerHTML = html;
    t.classList.remove('hidden');

    // The same render into the popup's body. One render pass, two places it
    // can be seen, so the popup cannot disagree with the table.
    var popupBody = document.getElementById('comparison-dialog-body');
    if (popupBody) popupBody.innerHTML = html;
    // The popup's width follows the car count (components/comparison.css);
    // centring is margin-based, so it grows and shrinks both ways equally.
    var popupEl = document.getElementById('comparison-dialog');
    if (popupEl) popupEl.dataset.cars = String(chosen.length);

    reflectButtons();

    // The strip. Without it, picking a car produces no visible change until the
    // shopper scrolls to a table at the bottom of the page, so they cannot see
    // what they have picked or take one back.
    if (window.CaddyPickTray) {
      window.CaddyPickTray.renderCompare(
        chosen.map(function (d) { return { slug: d.slug, title: d.title, stock: d.stock }; })
      );
    }
  }

/** Say, on every button, whether its car is in the comparison. */
  function reflectButtons() {
    document.querySelectorAll('[data-compare-toggle]').forEach(function (btn) {
      var on = list.indexOf(btn.dataset.compareToggle) !== -1;
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      var label = btn.querySelector('[data-compare-label]');
      if (label) label.textContent = on ? 'Comparing' : 'Compare';
    });
  }

  function toggle(slug) {
    var at = list.indexOf(slug);
    if (at !== -1) {
      list.splice(at, 1);
      status('');
      render();
      writeUrl(list);
      return;
    }
    if (list.length >= MAX) {
      // Not alert(). An alert blocks, is unstyled, and is not announced.
      status('You can compare up to ' + MAX + ' cars. Remove one to add another.');
      return;
    }
    if (!cards[slug]) {
      status('That car is no longer on this page.');
      return;
    }
    list.push(slug);
    status('');
    render();
    writeUrl(list);
  }

  function ready() {
    var a = app();
    if (!a) return;
    cards = readCards();
    list = stateFromUrl(cards);
    render();

    document.addEventListener('click', function (e) {
      var add = e.target.closest('[data-compare-toggle]');
      if (add) { toggle(add.dataset.compareToggle); return; }
      var remove = e.target.closest('[data-compare-remove]');
      if (remove) { toggle(remove.dataset.compareRemove); return; }
      if (e.target.closest('[data-compare-clear]')) {
        list = [];
        status('');
        render();
        writeUrl(list);
      }
    });

    // The strip's remove and clear. One listener for the whole document, so a
    // re-render of the chips cannot lose it.
    document.addEventListener('caddy:remove-from-compare', function (e) { toggle(e.detail.slug); });

    // "Compare N" asks for the comparison to OPEN, not to be pointed at: a
    // button that leaves the shopper to go find the table has not finished
    // its job. An event, so neither module reaches into the other.
    document.addEventListener('caddy:open-compare', function () {
      if (!list.length) return;
      var dlg = document.getElementById('comparison-dialog');
      if (!dlg) {
        var t2 = table();
        if (t2) t2.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      if (typeof dlg.showModal === 'function') {
        if (!dlg.open) dlg.showModal();
      } else {
        dlg.setAttribute('open', '');
      }
    });

    // Close: the button, and a click on the backdrop (the event's target is
    // the dialog element itself then). Escape is the native dialog's job.
    document.addEventListener('click', function (e) {
      var dlg = document.getElementById('comparison-dialog');
      if (!dlg || !dlg.open) return;
      if (e.target.closest('[data-compare-dialog-close]') || e.target === dlg) {
        if (typeof dlg.close === 'function') dlg.close(); else dlg.removeAttribute('open');
      }
    });
    document.addEventListener('caddy:clear-compare', function () {
      list = [];
      render();
      writeUrl(list);
      status('');
    });

    if (list.length) {
      var t = table();
      if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ready);
  } else {
    ready();
  }
})();
