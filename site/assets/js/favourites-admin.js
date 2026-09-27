/*
 * favourites-admin.js -- the admin control for "Ed's pick".
 *
 * Talks to /.netlify/functions/vehicle-features, which keeps the set in a
 * Netlify Blobs store. It is the same list the home page reads, so a change
 * here is visible on the home page on the next build with no deploy step.
 *
 * The list of vehicles itself is NOT fetched from an endpoint. The inventory is
 * build-time content, and there is no function that returns "every vehicle" --
 * deliberately, because the vehicle detail pages are server-rendered from front
 * matter and a runtime list would be a second source of truth that could drift.
 * Instead the vehicle data is embedded in the page at build time by
 * partials/favourites-data.html, and this script only toggles the flag.
 *
 * That matters: if the toggle list came from a runtime endpoint it would list
 * whatever the database happened to hold, including cars that had sold, and an
 * admin could favourite something no longer on the lot.
 */
(function () {
  'use strict';

  const ENDPOINT = '/.netlify/functions/vehicle-features';
  const MAX = 6; // matches the cap the home page applies

  const listEl = document.querySelector('[data-fav-list]');
  const statusEl = document.querySelector('[data-fav-status]');
  const filterEl = document.querySelector('[data-fav-filter]');
  const clearEl = document.querySelector('[data-fav-clear]');
  if (!listEl) return;

  // Build-time data, from partials/favourites-data.html. Read defensively: it
  // used to arrive as a quoted STRING rather than an array, and the first
  // .filter on it threw a TypeError that stopped the control rendering
  // anything. A panel that cannot start should still draw its frame and say
  // what is wrong, not throw before it has drawn anything.
  var vehicles = Array.isArray(window.FAVOURITES_VEHICLES) ? window.FAVOURITES_VEHICLES : [];

  // `featured: true` in front matter is honoured by the home page and cannot be
  // turned off here, because the next sync rewrites that field. Those are shown
  // as pinned so it is obvious why the button will not move.
  const pinned = new Set(
    vehicles.filter(function (v) { return v.pinned; }).map(function (v) { return v.slug; })
  );

  let favourites = [];

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function money(n) {
    const v = parseInt(n, 10);
    if (!v || v < 1000) return v ? '$' + v : '';
    return '$' + String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function isOn(slug) {
    return favourites.indexOf(slug) !== -1;
  }

  function say(message, kind) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = 'favourites-bar__status' + (kind ? ' is-' + kind : '');
  }

  function render() {
    const q = (filterEl && filterEl.value || '').trim().toLowerCase();
    const rows = vehicles.filter(function (v) {
      if (!q) return true;
      return (v.title + ' ' + (v.stock || '')).toLowerCase().indexOf(q) !== -1;
    });

    if (!rows.length) {
      listEl.innerHTML = '<p class="favourites-empty">No vehicles match that.</p>';
      return;
    }

    listEl.innerHTML = rows.map(function (v) {
      const on = isOn(v.slug);
      const lock = pinned.has(v.slug);
      return '<article class="fav-row' + (on ? ' is-on' : '') + '" data-slug="' + escapeHtml(v.slug) + '">' +
        '<a class="fav-row__media" href="/inventory/' + escapeHtml(v.slug) + '/" target="_blank" rel="noopener">' +
          '<img src="' + escapeHtml(v.thumb) + '" alt="" loading="lazy" width="160" height="120">' +
        '</a>' +
        '<div class="fav-row__body">' +
          '<h2 class="fav-row__title">' + escapeHtml(v.title) + '</h2>' +
          '<p class="fav-row__meta">' +
            (v.stock ? escapeHtml(v.stock) + ' · ' : '') +
            escapeHtml(v.subtitle || '') +
          '</p>' +
        '</div>' +
        '<div class="fav-row__action">' +
          '<p class="fav-row__price">' + escapeHtml(money(v.price)) + '</p>' +
          (lock
            ? '<span class="fav-row__pinned" title="Set with featured: true in the content file, so a sync will not clear it">Pinned in content</span>'
            : '<button type="button" class="btn ' + (on ? 'btn-primary' : 'btn-outline') + ' btn-sm" data-fav-toggle="' +
                escapeHtml(v.slug) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
                (on ? 'Favourited' : 'Favourite') +
              '</button>') +
        '</div>' +
      '</article>';
    }).join('');

    listEl.querySelectorAll('[data-fav-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function () { toggle(btn.dataset.favToggle, btn); });
    });

    const showing = rows.length;
    say(showing + ' vehicle' + (showing === 1 ? '' : 's') +
        (favourites.length ? ' · ' + favourites.length + ' favourited' : ''));
  }

  function toggle(slug, btn) {
    if (pinned.has(slug)) {
      say('That one is pinned in its content file and cannot be cleared here.', 'warn');
      return;
    }
    const want = !isOn(slug);
    if (want && favourites.length >= MAX) {
      say('Six is the cap the home page applies. Un-favourite one first.', 'warn');
      return;
    }

    btn.disabled = true;
    say('Saving…');

    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: slug, featured: want }),
    })
      .then(function (r) {
        return r.json().then(function (body) { return { ok: r.ok, body: body }; });
      })
      .then(function (res) {
        if (!res.ok) throw new Error(res.body && res.body.error || 'Save failed');
        favourites = res.body.favourites || [];
        render();
        say(res.body.featured
          ? 'Marked. It will be at the top of the home page on the next build.'
          : 'Removed from the top of the home page.', 'ok');
      })
      .catch(function (err) {
        btn.disabled = false;
        // An unconfigured store is the expected first-run state, so the message
        // says what to do rather than just reporting a failure.
        say(err.message === 'Favourites storage is not configured on this site.'
          ? 'No Blobs store named "vehicle-features" on this site yet — create one and this will save.'
          : 'Could not save: ' + err.message, 'warn');
        render();
      });
  }

  function clearAll() {
    if (!favourites.length) { say('Nothing is favourited.'); return; }
    if (!window.confirm('Remove all ' + favourites.length + ' favourites?')) return;
    Promise.all(favourites.map(function (slug) {
      return fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: slug, featured: false }),
      });
    }))
      .then(function () {
        favourites = [];
        render();
        say('All cleared.', 'ok');
      })
      .catch(function (e) { say('Could not clear: ' + e.message, 'warn'); });
  }

  if (filterEl) filterEl.addEventListener('input', render);
  if (clearEl) clearEl.addEventListener('click', clearAll);

  fetch(ENDPOINT)
    .then(function (r) { return r.json(); })
    .then(function (body) {
      favourites = body.favourites || [];
      render();
      if (body.source === 'unavailable' || body.source === 'absent') {
        say('No favourites store on this site yet. The home page is showing the ' +
            'most recently synced cars until one is created.', 'warn');
      }
    })
    .catch(function () {
      render();
      say('Could not reach the favourites store.', 'warn');
    });
})();
