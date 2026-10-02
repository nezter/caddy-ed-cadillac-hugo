/**
 * shortlist.js -- let a visitor build a shortlist of cars and send it to Ed.
 *
 * WHAT THIS IS FOR
 * ----------------
 * Caddy Ed is one salesperson. The most common thing that happens on a site
 * like this is that a client looks at eleven cars, likes three, and gives up
 * because there is no way to say "these three" without writing a message.
 *
 * So this is not a wishlist and it is not a save-for-later feature. It is the
 * end of a sales conversation: the visitor ticks the cars they are interested
 * in, and the page hands Ed an email containing exactly those cars, with their
 * stock numbers, so he can walk into the next call knowing what they want.
 *
 * That is the whole point. A shortlist you cannot act on is a bookmark; a
 * shortlist that arrives as a written list is a lead.
 *
 * DESIGN NOTES
 * ------------
 * - State lives in localStorage under `caddy_shortlist`, so a client can build
 *   it over several visits and it is still there. A car that sells in the
 *   meantime is dropped on load rather than sent to Ed as a 404.
 *
 * - The tray is a real element, not a dialog. It is a small fixed strip at the
 *   bottom of the viewport, which is the one place a control can live without
 *   covering the content the visitor is reading. It only appears once there is
 *   something in it, so an unengaged visitor never sees it at all.
 *
 * - Every button is a real <button> with aria-pressed. It is a toggle, and
 *   assistive technology should be told its state.
 *
 * - The email is a mailto: link, not a form. There is no back end to receive
 *   it, and a form that silently goes nowhere is worse than an email client
 *   opening with the list already written. It works with no server at all.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'caddy_shortlist';
  const TRAY_ID = 'shortlist-tray';
  const ED_EMAIL = 'ed@caddyed.com';

  /** Read the shortlist, tolerating a corrupt or absent store. */
  function read() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function write(list) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      /* private browsing, quota, or disabled storage. The page still works;
         the shortlist just will not survive a reload. */
    }
  }

  function has(slug) {
    return read().indexOf(slug) !== -1;
  }

  function toggle(slug) {
    const list = read();
    const i = list.indexOf(slug);
    if (i === -1) {
      list.push(slug);
    } else {
      list.splice(i, 1);
    }
    write(list);
    render();
    return i === -1;
  }

  function clear() {
    write([]);
    render();
  }

  /**
   * The cards currently on the page, keyed by slug.
   *
   * Read from the DOM rather than cached, so the shortlist can be labelled with
   * real titles and stock numbers without a second copy of the inventory.
   */
  function visibleVehicles() {
    const out = {};
    document.querySelectorAll('.vehicle-card[data-slug]').forEach(function (card) {
      out[card.dataset.slug] = {
        slug: card.dataset.slug,
        // The card's own heading, not data-title.
        //
        // data-title is lowercased on purpose -- it exists so that a search
        // for "xt5" matches a title that reads "XT5" -- and that is fine for
        // matching. It is not fine to hand back: a shortlist that reads
        // "2026 cadillac xt5 luxury" looks like a data dump rather than a
        // list of cars the client chose.
        title: headingText(card) || card.dataset.title || '',
        stock: card.dataset.stock || '',
        price: card.dataset.price || '',
        // The card's own photograph, for the tray swatch: already fetched,
        // already decoded, so the tray costs the visitor nothing new.
        thumb: thumbOf(card)
      };
    });
    return out;
  }

  /** The visible title of a card, collapsed to one line. */
  function headingText(card) {
    const h = card.querySelector('.vehicle-card__title a') || card.querySelector('.vehicle-card__title');
    return h ? h.textContent.replace(/\s+/g, ' ').trim() : '';
  }

  /** The card's own photograph, for the tray swatch. */
  function thumbOf(card) {
    const img = card.querySelector('.vehicle-card__media img');
    return img ? (img.currentSrc || img.getAttribute('src') || '') : '';
  }

  function money(n) {
    const v = parseInt(n, 10);
    if (!v || v < 1000) return v ? '$' + v : '';
    return '$' + String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /** Build the mailto: body. Plain text, because it lands in an email client. */
  function composeEmail() {
    const onPage = visibleVehicles();
    const list = read();

    // A car that has sold since the client last visited is still in their
    // shortlist. Sending it to Ed as though it were available would be worse
    // than useless -- it would make Ed look careless on the phone.
    const gone = [];
    const lines = list.map(function (slug) {
      const v = onPage[slug];
      if (!v) {
        gone.push(slug);
        return null;
      }
      const bits = [v.title];
      if (v.stock) bits.push('stock ' + v.stock);
      if (v.price) bits.push(money(v.price));
      return '- ' + bits.join('  |  ');
    }).filter(Boolean);

    let body = 'Hi Ed,\n\nI am interested in these:\n\n' +
      (lines.length ? lines.join('\n') : '(none)') + '\n\n' +
      'Could you let me know which are still available and set up a time?\n\n';

    if (gone.length) {
      body += 'Also, these were on my list but I could not find them any more:\n' +
        gone.map(function (s) { return '- ' + s; }).join('\n') + '\n\n';
    }
    body += 'Thanks,';

    return 'mailto:' + ED_EMAIL +
      '?subject=' + encodeURIComponent('Shortlist from caddyed.com') +
      '&body=' + encodeURIComponent(body);
  }

function ensureTray() {
    let tray = document.getElementById(TRAY_ID);
    if (tray) return tray;

    // When the SHARED strip is on the page, do not build a second one.
    //
    // compare-tray.js owns one fixed strip with a section each for compare and
    // shortlist, precisely so two bars cannot sit on top of each other and the
    // top one takes every click. Upstream's mockup tray (36c3771) rebuilt the
    // standalone bar inside this script, which on a page loading both scripts
    // means two fixed strips at the bottom of the window -- and the one on top
    // is whichever was appended last.
    //
    // So when the shared strip exists, publish into it (render() already does,
    // via CaddyPickTray.renderShortlist) and build nothing here.
    if (window.CaddyPickTray) return null;

    tray = document.createElement('aside');
    tray.id = TRAY_ID;
    tray.className = 'shortlist';
    tray.setAttribute('aria-live', 'polite');
    tray.hidden = true;
    tray.innerHTML =
      '<div class="shortlist__inner">' +
        '<p class="shortlist__label">Shortlist &middot; <strong data-shortlist-count>0</strong></p>' +
        '<ul class="shortlist__thumbs" data-shortlist-thumbs></ul>' +
        '<p class="shortlist__names" data-shortlist-names></p>' +
        '<div class="shortlist__actions">' +
          '<button type="button" class="btn btn-ghost btn-sm" data-shortlist-compare>Compare side by side</button>' +
          '<a class="btn btn-primary btn-sm" data-shortlist-send href="#">Send shortlist to Ed</a>' +
        '</div>' +
      '</div>';
    document.body.appendChild(tray);

    /* Compare side by side: the second thing the mockup's tray offers. It
       scrolls to the comparison area rather than opening anything of its own
       -- the shortlist and the comparison are two lists, and this button
       should not silently turn one into the other. To empty the list there
       are the per-car toggles and the rail's Clear; the mockup's tray
       carries neither, and neither does this one. */
    const compareBtn = tray.querySelector('[data-shortlist-compare]');
    if (compareBtn) {
      compareBtn.addEventListener('click', function () {
        const host = document.getElementById('comparison-app');
        if (!host) return;
        const reduce = window.matchMedia &&
          window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        host.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
        const status = document.getElementById('comparison-status');
        if (status) {
          status.setAttribute('tabindex', '-1');
          status.focus({ preventScroll: true });
        }
      });
    }
    return tray;
  }

  /**
   * The strip.
   *
   * It used to build its own fixed bar at the bottom of the screen, and
   * vehicleComparison.js is now sharing that bar so a shopper can see what they
   * have chosen to COMPARE as well as what they have shortlisted. Two fixed bars
   * would sit on top of each other, so there is one, with a section each --
   * compare-tray.js owns it, and this script pushes its state in.
   *
   * It is rendered, not rebuilt, from here: shortlist.js never touches the
   * compare section and compare-tray.js never touches this one, so neither can
   * lose the other's work. The one thing this script still owns is the mailto:
   * href, because the message body depends on which cars are no longer on the
   * page, and only this script knows that.
   */
function reserveSpace(visible) {
    document.body.classList.toggle('has-shortlist', visible);
  }

  /**
   * The same shortlist, in the filter rail.
   *
   * The mockup keeps it in two places, and the duplication earns itself: the
   * strip at the bottom of the window does not exist until something is
   * saved, so it can never tell anyone the feature is there. The rail is
   * where a visitor is already reading controls, so it is where the shortlist
   * becomes visible before it is used.
   *
   * Both surfaces read the same store and are rendered by the same call, so
   * they cannot disagree about what is saved.
   */
  function renderRail() {
    const host = document.querySelector('[data-shortlist-rail-items]');
    if (!host) return;

    const list = read();
    const onPage = visibleVehicles();

    const empty = document.querySelector('[data-shortlist-rail-empty]');
    const actions = document.querySelector('[data-shortlist-rail-actions]');
    const send = document.querySelector('[data-shortlist-rail-send]');

    host.hidden = list.length === 0;
    if (empty) empty.hidden = list.length > 0;
    if (actions) actions.hidden = list.length === 0;
    if (send) send.setAttribute('href', composeEmail());

    host.innerHTML = list.map(function (slug) {
      const v = onPage[slug];
      // Linked when the car is on this page, named but not linked when it is
      // not. It is NOT called gone: a car on the second page of the inventory
      // is indistinguishable from here, and claiming it sold would be a
      // statement this page cannot support.
      const name = v
        ? '<a href="/inventory/' + encodeURIComponent(slug) + '/">' + escapeHtml(v.title) + '</a>'
        : '<span class="is-unknown">' + escapeHtml(slug) + '</span>';
      return '<li class="inv-shortlist__item">' +
        name +
        (v && v.stock ? ' <em>' + escapeHtml(v.stock) + '</em>' : '') +
        '<button type="button" class="inv-shortlist__remove" data-rail-remove="' +
          escapeHtml(slug) + '" aria-label="Remove ' +
          escapeHtml(v ? v.title : slug) + ' from shortlist">&times;</button>' +
        '</li>';
    }).join('');

    host.querySelectorAll('[data-rail-remove]').forEach(function (btn) {
      btn.addEventListener('click', function () { toggle(btn.dataset.railRemove); });
    });
  }

function render() {
    // ensureTray() first, so the tray exists before anything reads from it.
    // This line was lost resolving the rebase conflict with 36c3771, and its
    // absence is a ReferenceError on the first render -- which is why every
    // shortlist assertion failed at once while the compare ones passed.
    const tray = ensureTray();
    const list = read();
    const onPage = visibleVehicles();

    // Only when this script owns the strip. With the shared strip present the
    // mockup's swatches/names are not rendered here at all -- compare-tray.js
    // renders the section, and rendering it twice is how two surfaces end up
    // showing different things.
    if (tray) {
      tray.hidden = list.length === 0;
      reserveSpace(!tray.hidden);

      tray.querySelector('[data-shortlist-count]').textContent = String(list.length);

      /* The mockup's tray: the cars as swatches, their names as one line, and
       the two things a visitor can do next. A swatch links to its car and
       uses the photograph the page has already fetched, so the strip costs
       no new request. A car this page cannot show -- second page, or sold --
       is still named, because the name is the one true thing the store
       holds; it is not called gone, because from here those look identical. */
    const thumbs = tray.querySelector('[data-shortlist-thumbs]');
    const names = tray.querySelector('[data-shortlist-names]');
    const thumbItems = list.map(function (slug) {
      const v = onPage[slug];
      const label = escapeHtml(v ? v.title : slug);
      if (!v) {
        return '<li><span class="shortlist__thumb--unknown" title="' + label +
          '" aria-hidden="true"></span></li>';
      }
      return '<li><a href="/inventory/' + encodeURIComponent(slug) + '/" title="' + label +
        '" aria-label="' + label + '">' +
        (v.thumb ? '<img src="' + escapeHtml(v.thumb) + '" alt="" width="54" height="36" loading="lazy">' : '') +
        '</a></li>';
    }).join('');
    thumbs.innerHTML = thumbItems;
    names.textContent = list.map(function (slug) {
      const v = onPage[slug];
      return v ? v.title : slug;
    }).join(' \u00b7 ');

    // Only where there is something to compare: the home page has no
    // comparison area, and a control that scrolls nowhere is a control that lies.
    const compareBtn = tray.querySelector('[data-shortlist-compare]');
    if (compareBtn) compareBtn.hidden = !document.getElementById('comparison-app');
    } // end `if (tray)` -- this script does not own the strip here

    // The shared strip. Upstream rebuilt the standalone tray above into the
    // mockup's swatch+names form; this is the other half, which the tray needs
    // in order to keep the rail and the strip reading one store. Without it the
    // rail would show what is saved while the strip showed something else --
    // the exact drift ci/check-compare-shortlist.js asserts against.
    const items = list.map(function (slug) {
      const v = onPage[slug];
      // A car whose page is no longer on this page is still listed, but marked,
      // so the client can see why it looks different rather than wondering.
      return {
        slug: slug,
        title: v ? v.title : slug,
        stock: v && v.stock,
        stale: !v,
      };
    });

    if (window.CaddyPickTray) {
      window.CaddyPickTray.renderShortlist(items, composeEmail());
    } else {
      // The strip script is not on this page. Keep the old standalone bar rather
      // than losing the feature: a script that cannot find its strip must still
      // function.
      renderStandaloneTray(items);
    }

    // Reflect state on every button so the page is honest about what is ticked,
    // including buttons that are not currently on screen.
    // [data-shortlist-toggle], NOT [data-add-comparison].
    //
    // This script bound a button labelled "Shortlist" through an attribute called
    // `data-add-comparison`, in a class called `vehicle-card__compare`, next to a
    // Compare feature that had no button on any card. The markup, the label and
    // the behaviour were three different names for one control, which is how a
    // reader of the template cannot tell which feature they are looking at.
    //
    // The attribute now says shortlist because that is what this is, and it is
    // not the one vehicleComparison.js listens for.
    document.querySelectorAll('[data-shortlist-toggle]').forEach(function (btn) {
      const on = has(btn.dataset.shortlistToggle);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.classList.toggle('is-active', on);
      var label = btn.querySelector('[data-shortlist-label]');
      if (label) label.textContent = on ? 'Shortlisted' : 'Shortlist';
    });

    renderRail();
  }

  /**
   * The fallback strip, for a page that loads this script without the shared
   * one. Same look, same class, same behaviour, one section instead of two.
   */
  function renderStandaloneTray(items) {
    let tray = document.getElementById(TRAY_ID);
    if (!tray) {
      tray = document.createElement('aside');
      tray.id = TRAY_ID;
      tray.className = 'shortlist';
      tray.setAttribute('aria-live', 'polite');
      tray.innerHTML =
        '<div class="shortlist__inner">' +
          '<p class="shortlist__count"><strong data-shortlist-count>0</strong> ' +
            '<span data-shortlist-noun>cars</span> on your shortlist</p>' +
          '<ul class="shortlist__items" data-shortlist-items></ul>' +
          '<div class="shortlist__actions">' +
            '<a class="btn btn-primary btn-sm" data-shortlist-send href="#">Send to Ed</a>' +
            '<button type="button" class="btn btn-ghost btn-sm" data-shortlist-clear>Clear</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(tray);
      tray.querySelector('[data-shortlist-clear]').addEventListener('click', clear);
    }

    tray.hidden = items.length === 0;
    // Reserve room for the strip. It is fixed to the bottom of the viewport, so
    // without this it covers the bottom row of vehicle cards -- specifically
    // their Shortlist buttons -- and ticking one car makes every other one
    // untickable. The class is on <body> rather than an inline height so the
    // page reserves the space and the last row can be scrolled clear of it.
    document.body.classList.toggle('has-shortlist', !tray.hidden);

    tray.querySelector('[data-shortlist-count]').textContent = String(items.length);
    tray.querySelector('[data-shortlist-noun]').textContent =
      items.length === 1 ? 'car' : 'cars';
    tray.querySelector('[data-shortlist-items]').innerHTML = items
      .map(function (it) {
        return '<li class="shortlist__item' + (it.stale ? ' is-stale' : '') + '">' +
          '<span class="shortlist__name">' + escapeHtml(it.title) +
            (it.stock ? ' <em>' + escapeHtml(it.stock) + '</em>' : '') +
          '</span>' +
          '<button type="button" class="shortlist__remove" data-remove="' +
            escapeHtml(it.slug) + '" aria-label="Remove ' + escapeHtml(it.title) +
            ' from shortlist">&times;</button>' +
          '</li>';
      })
      .join('');
    tray.querySelectorAll('[data-shortlist-items] [data-remove]').forEach(function (btn) {
      btn.addEventListener('click', function () { toggle(btn.dataset.remove); });
    });
    tray.querySelector('[data-shortlist-send]').setAttribute('href', composeEmail());
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // The shared strip's controls, delegated on the document so re-rendering the
  // chips cannot lose the handlers.
  document.addEventListener('caddy:remove-from-shortlist', function (e) {
    toggle(e.detail.slug);
  });
  document.addEventListener('caddy:clear-shortlist', clear);

  document.addEventListener('DOMContentLoaded', function () {
    // The rail's own Clear. Bound once, here, rather than inside
    // renderRail(), which runs on every toggle and would stack a new
    // listener on the same button each time.
    var railClear = document.querySelector('[data-shortlist-rail-clear]');
    if (railClear) railClear.addEventListener('click', clear);
    document.querySelectorAll('[data-shortlist-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        toggle(btn.dataset.shortlistToggle);
      });
    });
    render();
  });
})();
