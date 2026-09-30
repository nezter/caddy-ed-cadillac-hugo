/**
 * ed-picks.js -- "Ed's pick" comes from the database, on every page that shows cars.
 *
 * THE PROBLEM THIS SOLVES
 * -----------------------
 * There were three things called favourites, and two of them claimed to be
 * "Ed's pick":
 *
 *   1. Ed's picks          database, admin-toggled      (vehicle_favourites)
 *   2. the visitor's shortlist   localStorage, per browser   (a customer's own cars)
 *   3. `featured` in front matter   build time
 *
 * The home page used (1). The inventory page used (3). So pinning a car in the
 * admin moved it on the home page and did nothing on the inventory page, while
 * the inventory page showed a "Ed's pick" badge for something nobody had
 * picked. One idea, two sources, and they disagreed.
 *
 * (2) is a different thing and is left alone: a customer's saved cars are
 * theirs, not Ed's, and they live in their own browser.
 *
 * WHAT IT DOES
 * ------------
 *   - BADGES every card whose slug Ed has picked, on any page.
 *   - REORDERS the picks to the front -- but ONLY when the visitor has not
 *     chosen a sort. On the inventory page that means the default order is
 *     "Ed's picks first, then everything else"; pick a sort and that is what
 *     they asked for. Reordering under someone who just chose "price, low to
 *     high" is not helpful, it is the page ignoring them.
 *
 * WHAT IT DOES NOT DO
 * -------------------
 * It does not fetch cars. The build chose which cards exist; this only reorders
 * and labels the ones already on the page. A car that was not rendered stays
 * off until a build puts it there, and that is deliberate: a page whose contents
 * move under a visitor is a page they cannot describe afterwards.
 *
 * DEGRADES SILENTLY
 * -----------------
 * No function, no database, no network -- the page keeps its build-time order
 * and its build-time badges. A preference failing to load must not reorder the
 * cars, and must certainly not error on a page somebody is shopping from.
 */

'use strict';

(function () {
  var ENDPOINT = '/.netlify/functions/vehicle-features';
  var GRID_ID = 'vehicle-inventory';

  function badge(card) {
    // The build already badged it from front matter. Leave it: it is the same
    // badge, and duplicating it would read as "picked twice".
    if (card.querySelector('.vehicle-card__badge--pick')) return;
    var media = card.querySelector('.vehicle-card__media');
    if (!media) return;
    var el = document.createElement('span');
    el.className = 'vehicle-card__badge vehicle-card__badge--pick';
    el.textContent = "Ed's pick";
    media.appendChild(el);
  }

  /** Has the visitor chosen a sort? The inventory page writes this on the form. */
  function visitorChoseSort() {
    var form = document.querySelector('[data-inventory-filters]');
    if (!form) return false;
    var el = form.querySelector('[name="sort"]');
    if (!el) return false;
    // The value Hugo renders as the default is declared in the markup as
    // data-default; `selected` on the option is not readable from JS. Anything
    // else is a choice the visitor actually made.
    var def = el.getAttribute('data-default');
    if (!def) return false;
    return Boolean(el.value) && el.value !== def;
  }

  function run() {
    var grid = document.getElementById(GRID_ID);
    if (!grid) return;

    fetch(ENDPOINT)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (body) {
        var picks = body && body.favourites;
        if (!Array.isArray(picks) || !picks.length) return;

        var order = {};
        picks.forEach(function (slug, i) { order[slug] = i; });

        var cards = Array.prototype.slice.call(grid.querySelectorAll('.vehicle-card'));
        var hits = cards.filter(function (c) {
          var slug = c.dataset.slug || '';
          return Object.prototype.hasOwnProperty.call(order, slug);
        });
        if (!hits.length) return;

        // Badge first, and always. A pinned car should say so even if the
        // visitor has chosen a sort that keeps it where it is.
        hits.forEach(function (c) {
          c.classList.add('is-ed-pick');
          badge(c);
        });

        if (visitorChoseSort()) {
          var n = document.getElementById('fleet-highlight-note');
          if (n) {
            n.textContent = hits.length === 1
              ? "1 car Ed has picked out of the latest."
              : hits.length + ' cars Ed has picked out of the latest.';
          }
          return;
        }

        var frag = document.createDocumentFragment();
        hits.forEach(function (c) { frag.appendChild(c); });
        hits.forEach(function (c) { grid.insertBefore(c, grid.firstChild); });

        var note = document.getElementById('fleet-highlight-note');
        if (note) {
          note.textContent = hits.length === 1
            ? "1 car Ed has picked out of the latest."
            : hits.length + ' cars Ed has picked out of the latest.';
        }
      })
      .catch(function () { /* preferences failing is not a reason to move anything */ });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
