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
 * So it is ONE strip with two sections: the shortlist in the mockup's form
 * (label, photo swatches, names, then "Compare side by side" and "Send
 * shortlist to Ed"), and the compare roll-call -- a chip per car, its count
 * and its master button -- shown underneath when cars are being compared.
 * The mockup's tray carries no per-car removes and no Clear, and neither
 * does the shortlist section: the card's own toggle and the rail's list are
 * those controls.
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
        // --- shortlist (the mockup's form) ---------------------------------
        '<section class="pick-tray__section" data-shortlist-tray-section hidden>' +
          '<p class="shortlist__label">Shortlist &middot; <strong data-shortlist-tray-count>0</strong></p>' +
          '<ul class="shortlist__thumbs" data-shortlist-tray-thumbs></ul>' +
          '<p class="shortlist__names" data-shortlist-tray-names></p>' +
          '<div class="shortlist__actions">' +
            '<button type="button" class="btn btn-ghost btn-sm" data-shortlist-tray-compare>' +
              'Compare side by side' +
            '</button>' +
            '<a class="btn btn-primary btn-sm" data-shortlist-tray-send href="#">' +
              'Send shortlist to Ed' +
            '</a>' +
          '</div>' +
        '</section>' +
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

  /**
   * Redraw the shortlist section: the mockup's form -- a swatch per car (the
   * photograph its card already fetched, so the strip costs no request), the
   * names as one line, then the two things a visitor can do next. A car this
   * page cannot show is still named; it is not called gone, because from here
   * a second-page car and a sold car look identical.
   */
  function renderShortlist(items, sendHref) {
    var t = tray();
    t.querySelector('[data-shortlist-tray-count]').textContent = String(items.length);
    t.querySelector('[data-shortlist-tray-thumbs]').innerHTML = items
      .map(function (it) {
        var label = esc(it.title || it.slug);
        if (it.stale || !it.thumb) {
          return '<li><span class="shortlist__thumb--unknown" title="' + label +
            '" aria-hidden="true"></span></li>';
        }
        return '<li><a href="/inventory/' + encodeURIComponent(it.slug) + '/" title="' + label +
          '" aria-label="' + label + '">' +
          '<img src="' + esc(it.thumb) + '" alt="" width="54" height="36" loading="lazy">' +
          '</a></li>';
      })
      .join('');
    t.querySelector('[data-shortlist-tray-names]').textContent = items
      .map(function (it) { return it.title || it.slug; })
      .join(' \u00b7 ');
    // Only where there is something to compare: without a comparison area the
    // button would scroll nowhere, and a control that scrolls nowhere lies.
    var cmp = t.querySelector('[data-shortlist-tray-compare]');
    if (cmp) cmp.hidden = !document.getElementById('comparison-app');
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
    } else if (t.closest('[data-compare-tray-clear]')) {
      document.dispatchEvent(new CustomEvent('caddy:clear-compare'));
    } else if (t.closest('[data-shortlist-tray-compare]')) {
      // The mockup's "Compare side by side": scrolls to the comparison area.
      // It never turns the shortlist into the comparison -- they are two lists.
      var host = document.getElementById('comparison-app');
      if (host) {
        var reduce = window.matchMedia &&
          window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        host.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
        var status = document.getElementById('comparison-status');
        if (status) {
          status.setAttribute('tabindex', '-1');
          status.focus({ preventScroll: true });
        }
      }
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
