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
        title: card.dataset.title || '',
        stock: card.dataset.stock || '',
        price: card.dataset.price || ''
      };
    });
    return out;
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

    tray = document.createElement('aside');
    tray.id = TRAY_ID;
    tray.className = 'shortlist';
    tray.setAttribute('aria-live', 'polite');
    tray.hidden = true;
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
    return tray;
  }

  /**
   * Make room for the tray.
   *
   * The tray is fixed to the bottom of the viewport, so once it appears it sits
   * on top of whatever is at the bottom of the page -- which, on a grid of
   * vehicle cards, is the row of "Shortlist" buttons.
   *
   * That made the feature unusable: tick one car and the tray covers the
   * buttons of every other card, so the second tick lands on the tray instead.
   * Caught by clicking three cars in a browser and watching the count stay at 1.
   *
   * A class on <body> rather than an inline height, so the page reserves the
   * space and the last row of cards can still be scrolled clear of the tray.
   */
  function reserveSpace(visible) {
    document.body.classList.toggle('has-shortlist', visible);
  }

  function render() {
    const tray = ensureTray();
    const list = read();
    const onPage = visibleVehicles();

    tray.hidden = list.length === 0;
    reserveSpace(!tray.hidden);

    tray.querySelector('[data-shortlist-count]').textContent = String(list.length);
    tray.querySelector('[data-shortlist-noun]').textContent =
      list.length === 1 ? 'car' : 'cars';

    const items = tray.querySelector('[data-shortlist-items]');
    items.innerHTML = list.map(function (slug) {
      const v = onPage[slug];
      // An item whose car is no longer on this page is still listed, but marked,
      // so the client can see why it looks different rather than wondering.
      const stale = !v;
      return '<li class="shortlist__item' + (stale ? ' is-stale' : '') + '">' +
        '<span class="shortlist__name">' +
          escapeHtml(v ? v.title : slug) +
          (v && v.stock ? ' <em>' + escapeHtml(v.stock) + '</em>' : '') +
        '</span>' +
        '<button type="button" class="shortlist__remove" data-remove="' +
          escapeHtml(slug) + '" aria-label="Remove ' +
          escapeHtml(v ? v.title : slug) + ' from shortlist">&times;</button>' +
        '</li>';
    }).join('');

    items.querySelectorAll('[data-remove]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        toggle(btn.dataset.remove);
      });
    });

    tray.querySelector('[data-shortlist-send]').setAttribute('href', composeEmail());

    // Reflect state on every button so the page is honest about what is ticked,
    // including buttons that are not currently on screen.
    document.querySelectorAll('[data-add-comparison]').forEach(function (btn) {
      const on = has(btn.dataset.addComparison);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.classList.toggle('is-active', on);
      var label = btn.querySelector('[data-compare-label]');
      if (label) label.textContent = on ? 'Shortlisted' : 'Shortlist';
    });
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-add-comparison]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        toggle(btn.dataset.addComparison);
      });
    });
    render();
  });
})();
