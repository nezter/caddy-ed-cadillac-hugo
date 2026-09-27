/**
 * fleet-highlight.js -- apply Ed's favourites to the home page fleet.
 *
 * WHY THIS RUNS AT ALL
 * --------------------
 * The home page renders ten vehicles, chosen at BUILD time: favourites first,
 * then the most recently synced. A favourite toggled in the admin is a
 * runtime change -- it lives in a Netlify Blobs store, not in a content file --
 * so the page cannot know about it until it asks.
 *
 * So it asks, and reorders the ten it already has. It does NOT fetch other
 * vehicles. The ten are the ten the build chose; a car that was not in the top
 * ten stays off the home page until a build puts it there. That is deliberate:
 * a static site showing a moving target is a page that never looks the same
 * twice, and a shopper cannot describe what they saw.
 *
 * DEGRADES QUIETLY
 * ----------------
 * If the store is unconfigured, or the network fails, or the visitor is on the
 * static preview, nothing happens. The page keeps its build-time order. A
 * preferences feature failing to load must not reorder the cars.
 */
(function () {
  'use strict';

  var ENDPOINT = '/.netlify/functions/vehicle-features';
  var grid = document.getElementById('vehicle-inventory');
  if (!grid) return;

  // The static preview runs no functions, so asking would produce a 404 on every
  // home page load for no benefit. The __STATIC_PREVIEW__ flag is set by
  // ci/nginx.preview.conf; the port check is the same belt-and-braces used by
  // the scheduling calendar.
  if (window.__STATIC_PREVIEW__ || window.location.port === '8090') return;

  function slugOf(card) { return card.dataset.slug || ''; }

  fetch(ENDPOINT)
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (body) {
      var favourites = body && body.favourites;
      if (!Array.isArray(favourites) || !favourites.length) return;

      var order = {};
      favourites.forEach(function (slug, i) { order[slug] = i; });

      var cards = Array.prototype.slice.call(grid.querySelectorAll('.vehicle-card'));
      var hits = cards.filter(function (c) { return Object.prototype.hasOwnProperty.call(order, slugOf(c)); });

      if (hits.length < 2) return;   // nothing worth reordering

      var frag = document.createDocumentFragment();
      hits.forEach(function (c) { frag.appendChild(c); });
      hits.forEach(function (c) { grid.insertBefore(c, grid.firstChild); });

      // Mark them, and say so. Without a visible change, a reordered grid looks
      // like the page is broken.
      hits.forEach(function (c) {
        c.classList.add('is-ed-pick');
        var media = c.querySelector('.vehicle-card__media');
        if (media && !media.querySelector('.vehicle-card__badge--pick')) {
          var badge = document.createElement('span');
          badge.className = 'vehicle-card__badge vehicle-card__badge--pick';
          badge.textContent = "Ed's pick";
          media.appendChild(badge);
        }
      });

      var note = document.getElementById('fleet-highlight-note');
      if (note) {
        note.textContent = hits.length === 1
          ? "1 car Ed has picked out of the latest."
          : hits.length + ' cars Ed has picked out of the latest.';
      }
    })
    .catch(function () { /* preferences failing is not a reason to move anything */ });
})();
