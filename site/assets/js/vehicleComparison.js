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

  function render() {
    var t = table();
    if (!t) return;

    if (!list.length) {
      t.classList.add('hidden');
      t.innerHTML = '';
      document.querySelectorAll('[data-compare-toggle]').forEach(function (btn) {
        btn.setAttribute('aria-pressed', 'false');
        var label = btn.querySelector('[data-compare-label]');
        if (label) label.textContent = 'Compare';
      });
      return;
    }

    var chosen = list.map(function (slug) { return cards[slug]; }).filter(Boolean);

    var html = '<table class="comparison-table__grid"><caption class="visually-hidden">'
      + 'Side-by-side comparison of the cars you selected</caption><thead><tr><th scope="col">'
      + '<span class="visually-hidden">Specification</span></th>';
    chosen.forEach(function (d) {
      html += '<th scope="col"><span class="comparison-table__name">' + esc(d.title || d.slug) + '</span>'
        + '<button type="button" class="comparison-table__remove" data-compare-remove="' + esc(d.slug)
        + '">Remove<span class="visually-hidden"> ' + esc(d.title || d.slug) + ' from the comparison</span></button>'
        + '</th>';
    });
    html += '</tr></thead><tbody>';

    ROWS.forEach(function (row) {
      html += '<tr><th scope="row">' + esc(row.label) + '</th>';
      chosen.forEach(function (d) {
        var raw = d[row.key];
        var text = raw === undefined || raw === null || raw === '' ? '—' : (row.format ? row.format(raw) : raw);
        html += '<td class="feature-value">' + esc(text) + '</td>';
      });
      html += '</tr>';
    });
    html += '</tbody></table>';

    t.innerHTML = html;
    t.classList.remove('hidden');

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
      if (remove) { toggle(remove.dataset.compareRemove); }
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
