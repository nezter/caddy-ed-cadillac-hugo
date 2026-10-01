/**
 * compare-tray.js -- the chosen cars, in the same strip as the shortlist.
 *
 * THE PROBLEM
 * -----------
 * Compare fills a table at the bottom of the page and says nothing until you
 * have scrolled there. So a shopper who has picked two cars has no idea they
 * have picked two, cannot see which ones, and cannot undo a misclick without
 * finding the card again.
 *
 * The shortlist solved this years ago and better: a fixed strip at the bottom
 * showing a chip per chosen car, a count, a clear button and the action. Two
 * fixed bottom strips cannot both exist, though -- they would sit on top of each
 * other -- and a shopper comparing three cars and shortlisting eleven is doing
 * two different errands that both want that corner of the screen.
 *
 * So it is ONE strip with two sections, shortlist and compare side by side, each
 * with its own count, its own chips, its own clear and its own master button.
 * The compare section's "Compare" button is styled identically to the
 * shortlist's "Send to Ed", because they are the same control doing the same
 * job: act on what you have chosen.
 *
 * The chosen cars STACK: each is a chip in a horizontally scrollable row, and
 * they wrap onto a second line rather than pushing the strip off the screen.
 *
 * WHAT IT DOES NOT OWN
 * --------------------
 * The comparison itself. The table, the URL, the share link and the limit live
 * in vehicleComparison.js. This is the strip that says what is currently
 * chosen, and nothing more. Two scripts touching one strip is why both address
 * it by id and neither rebuilds the other's section.
 *
 * The strip element is created once, by whoever gets there first, with BOTH
 * sections present and empty. Two scripts each building half of it would
 * produce two strips.
 */

'use strict';

(function () {
  var TRAY_ID = 'pick-tray';
  var MAX = 3;

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function tray() {
    var el = document.getElementById(TRAY_ID);
    if (el) return el;

    el = document.createElement('aside');
    el.id = TRAY_ID;
    // The class is the shortlist's, so it inherits the whole existing tray
    // treatment -- position, z-index, the red top border, the type scale, the
    // mobile breakpoints, and the body padding that stops it covering the
    // bottom row of vehicle cards. That padding bug ("tick one car and every
    // other one becomes untickable") was fixed once and is not being
    // reintroduced by a second, separate strip.
    el.className = 'shortlist';
    el.setAttribute('aria-live', 'polite');
    el.hidden = true;
    el.innerHTML =
      '<div class="shortlist__inner">' +
        // --- compare -------------------------------------------------------
        '<section class="pick-tray__section" data-compare-tray-section hidden>' +
          '<p class="shortlist__count">' +
            '<strong data-compare-tray-count>0</strong> ' +
            '<span data-compare-tray-noun>cars</span> to compare' +
          '</p>' +
          '<ul class="shortlist__items" data-compare-tray-items></ul>' +
          '<div class="shortlist__actions">' +
            '<button type="button" class="btn btn-primary btn-sm" data-compare-tray-go>' +
              'Compare' +
            '</button>' +
            '<button type="button" class="btn btn-ghost btn-sm" data-compare-tray-clear>' +
              'Clear' +
            '</button>' +
          '</div>' +
        '</section>' +
        // --- shortlist -----------------------------------------------------
        '<section class="pick-tray__section" data-shortlist-tray-section hidden>' +
          '<p class="shortlist__count">' +
            '<strong data-shortlist-tray-count>0</strong> ' +
            '<span data-shortlist-tray-noun>cars</span> on your shortlist' +
          '</p>' +
          '<ul class="shortlist__items" data-shortlist-tray-items></ul>' +
          '<div class="shortlist__actions">' +
            '<a class="btn btn-primary btn-sm" data-shortlist-tray-send href="#">' +
              'Send to Ed' +
            '</a>' +
            '<button type="button" class="btn btn-ghost btn-sm" data-shortlist-tray-clear>' +
              'Clear' +
            '</button>' +
          '</div>' +
        '</section>' +
      '</div>';
    document.body.appendChild(el);
    return el;
  }

  /**
   * Show the strip when either section has something in it, and hide it when
   * neither does. A strip sitting there empty says "you have chosen nothing",
   * which is noise.
   */
  function sync() {
    var t = tray();
    var compare = t.querySelector('[data-compare-tray-section]');
    var shortlist = t.querySelector('[data-shortlist-tray-section]');
    var compareN = Number(t.querySelector('[data-compare-tray-count]').textContent) || 0;
    var shortlistN = Number(t.querySelector('[data-shortlist-tray-count]').textContent) || 0;

    compare.hidden = compareN === 0;
    shortlist.hidden = shortlistN === 0;
    t.hidden = compareN === 0 && shortlistN === 0;

    // The body class is the shortlist's, and its padding is what stops the strip
    // covering the bottom row of cards. It now belongs to the STRIP, not to the
    // shortlist, so it goes by the same name rather than being renamed
    // everywhere.
    document.body.classList.toggle('has-shortlist', !t.hidden);
  }

  function chip(slug, name, meta, removeAttr, stale) {
    return '<li class="shortlist__item' + (stale ? ' is-stale' : '') + '">' +
      '<span class="shortlist__name">' + esc(name) +
        (meta ? ' <em>' + esc(meta) + '</em>' : '') +
      '</span>' +
      '<button type="button" class="shortlist__remove" ' + removeAttr + '="' + esc(slug) + '"' +
        ' aria-label="Remove ' + esc(name) + ' from ' +
        (removeAttr === 'data-compare-tray-remove' ? 'the comparison' : 'your shortlist') +
        '">&times;</button>' +
    '</li>';
  }

  /**
   * Redraw the compare section.
   *
   * `items` is [{slug, title, stock}] in the order they were chosen, because
   * the chips ARE the table's column order and a shopper comparing three cars
   * should be able to see which column is which.
   */
  function renderCompare(items) {
    var t = tray();
    t.querySelector('[data-compare-tray-count]').textContent = String(items.length);
    t.querySelector('[data-compare-tray-noun]').textContent = items.length === 1 ? 'car' : 'cars';

    var go = t.querySelector('[data-compare-tray-go]');
    // One car is not a comparison, and the button says so rather than
    // scrolling the shopper to a one-column table.
    go.disabled = items.length < 2;
    go.textContent = items.length < 2 ? 'Pick one more' : `Compare ${items.length}`;

    t.querySelector('[data-compare-tray-items]').innerHTML = items
      .map((it) => chip(it.slug, it.title || it.slug, it.stock, 'data-compare-tray-remove'))
      .join('');
    sync();
  }

  function renderShortlist(items, sendHref) {
    var t = tray();
    t.querySelector('[data-shortlist-tray-count]').textContent = String(items.length);
    t.querySelector('[data-shortlist-tray-noun]').textContent = items.length === 1 ? 'car' : 'cars';
    t.querySelector('[data-shortlist-tray-items]').innerHTML = items
      .map((it) => chip(it.slug, it.title || it.slug, it.stock, 'data-shortlist-tray-remove',
                        it.stale))
      .join('');
    // The mailto: is composed by shortlist.js, not here: the body lists the cars
    // and also names the ones that have since disappeared from the page, and only
    // that script knows which. It is passed in rather than built twice.
    if (sendHref) t.querySelector('[data-shortlist-tray-send]').setAttribute('href', sendHref);
    sync();
  }

  // A small public surface, so the two feature scripts can push their state in
  // without either of them building the other's half of the strip.
  window.CaddyPickTray = {
    MAX: MAX,
    renderCompare: renderCompare,
    renderShortlist: renderShortlist,
    sync: sync,
  };

  // One delegated listener for both sections' remove and clear buttons, so
  // re-rendering the innerHTML does not lose handlers.
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t.closest) return;
    if (t.closest('[data-compare-tray-remove]')) {
      document.dispatchEvent(new CustomEvent('caddy:remove-from-compare', {
        detail: { slug: t.closest('[data-compare-tray-remove]').dataset.compareTrayRemove },
      }));
    } else if (t.closest('[data-shortlist-tray-remove]')) {
      document.dispatchEvent(new CustomEvent('caddy:remove-from-shortlist', {
        detail: { slug: t.closest('[data-shortlist-tray-remove]').dataset.shortlistTrayRemove },
      }));
    } else if (t.closest('[data-compare-tray-clear]')) {
      document.dispatchEvent(new CustomEvent('caddy:clear-compare'));
    } else if (t.closest('[data-shortlist-tray-clear]')) {
      document.dispatchEvent(new CustomEvent('caddy:clear-shortlist'));
    } else if (t.closest('[data-compare-tray-go]')) {
      var table = document.getElementById('comparison-table');
      if (table) table.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    // [data-shortlist-tray-send] is deliberately NOT handled here. It is an <a>
    // with a real mailto: href, and an event dispatch on top of it would replace
    // the link with a click handler that has to reconstruct the body. The link
    // is the whole mechanism.
  });
})();
