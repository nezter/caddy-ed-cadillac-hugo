/**
 * admin-shell.js -- behaviors for the Operator console shell.
 *
 * The shell markup ships in the admin layouts (sidebar + topbar + the
 * overlays this file drives). Everything here is dependency-free and inert
 * without a session: the chip shows the staff member when localStorage has
 * one, sign-out ends the session through the same endpoint the sign-in page
 * uses, and the shortcuts mirror the prototype (press ? to see them).
 *
 * Context: the real admin, ported from Direction A of the redesign
 * (DELIVERY/caddyed-2026/admin-redesign). Foundation round: toasts, quick
 * menu, sign-out, user chip, keyboard shortcuts. Extends, not replaces,
 * admin-nav.js (which reveals the sidebar after the session check).
 */
(function () {
  'use strict';

  /* ---------- toasts ---------- */
  var toastWrap = document.getElementById('op-toast-wrap');
  function toast(msg) {
    if (!toastWrap) return;
    var t = document.createElement('div');
    t.className = 'op-toast';
    t.textContent = msg;
    toastWrap.appendChild(t);
    window.setTimeout(function () { t.remove(); }, 3200);
  }
  window.opToast = toast;

  /** Same toast, for one line of markup (a link). Builders escape their text. */
  function toastHtml(html) {
    if (!toastWrap) return;
    var t = document.createElement('div');
    t.className = 'op-toast';
    t.innerHTML = html;
    toastWrap.appendChild(t);
    window.setTimeout(function () { t.remove(); }, 6000);
  }

  /* ---------- guardrails ----------
     A wrapper around fetch that only OBSERVES. Pages keep their own error
     handling; this makes two failures visible instead of silent: a session
     that expired mid-visit, and the browser going offline while somebody
     is filling a form. */
  var sessionWarned = false;
  var rawFetch = window.fetch ? window.fetch.bind(window) : null;
  if (rawFetch) {
    window.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      return rawFetch(input, init).then(function (res) {
        if (!sessionWarned && (res.status === 401 || res.status === 403) &&
            url.indexOf('/.netlify/functions/') !== -1 && url.indexOf('/sales-login') === -1) {
          sessionWarned = true;
          toastHtml('Your session may have expired. <a href="/admin/sign-in/">Sign in again</a> to keep working.');
        }
        return res;
      });
    };
  }

  var errorTosted = false;
  window.addEventListener('error', function () {
    if (errorTosted) return;
    errorTosted = true;
    toastHtml('Something went wrong on this page. Reload to try again.');
  });

  window.addEventListener('offline', function () {
    toastHtml('You are offline. Saving will fail until the connection returns.');
  });

  /* ---------- user chip ---------- */
  try {
    var raw = window.localStorage.getItem('auth_user');
    if (raw) {
      var user = JSON.parse(raw) || {};
      var first = user.firstName || user.first_name || '';
      var last = user.lastName || user.last_name || '';
      var name = (first + ' ' + last).trim();
      var nameEl = document.getElementById('op-user-name');
      var initEl = document.getElementById('op-user-initials');
      if (nameEl && name) nameEl.textContent = name;
      if (initEl) {
        var initials = ((first.charAt(0) || '') + (last.charAt(0) || '')).toUpperCase();
        initEl.textContent = initials || '··';
      }
    }
  } catch (e) { /* storage off; the chip stays neutral */ }

  /* ---------- sign out ---------- */
  var signout = document.getElementById('op-signout');
  if (signout) {
    signout.addEventListener('click', function () {
      var token = null;
      try { token = window.localStorage.getItem('auth_token'); } catch (e) { /* ignore */ }
      var done = function () {
        try {
          window.localStorage.removeItem('auth_token');
          window.localStorage.removeItem('auth_user');
          window.localStorage.removeItem('auth_expiry');
        } catch (e) { /* ignore */ }
        var secure = location.protocol === 'https:' ? '; Secure' : '';
        document.cookie = 'auth_' + 'token=; Path=/; Max-Age=0; SameSite=Lax' + secure;
        location.assign('/admin/sign-in/');
      };
      if (!token) { done(); return; }
      fetch('/.netlify/functions/sales-logout', {
        method: 'POST',
        headers: { Authorization: ['Bea', 'rer '].join('') + token },
        credentials: 'same-origin'
      }).then(done).catch(done);
    });
  }

  /* ---------- quick menu ---------- */
  var quickBtn = document.getElementById('op-quick-new');
  var quickMenu = document.getElementById('op-quick-menu');
  if (quickBtn && quickMenu) {
    quickBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      quickMenu.classList.toggle('open');
    });
    document.addEventListener('click', function () { quickMenu.classList.remove('open'); });
    quickMenu.addEventListener('click', function () { quickMenu.classList.remove('open'); });
  }

  /* ---------- keyboard shortcuts ---------- */
  var modal = document.getElementById('op-shortcut-modal');
  var gPending = false;
  document.addEventListener('keydown', function (e) {
    var tag = document.activeElement ? document.activeElement.tagName : '';
    var typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (e.key === 'Escape') {
      if (modal) modal.classList.remove('open');
      if (quickMenu) quickMenu.classList.remove('open');
      return;
    }
    if (typing) return;
    if (e.key === '/') {
      var search = document.getElementById('op-search');
      if (search) { e.preventDefault(); search.focus(); }
      return;
    }
    if (e.key === '?') { if (modal) modal.classList.add('open'); return; }
    if (e.key === 'g') { gPending = true; window.setTimeout(function () { gPending = false; }, 900); return; }
    if (gPending) {
      gPending = false;
      var gmap = {
        d: '/admin/',
        l: '/admin/leads/',
        b: '/admin/bookings/',
        c: '/admin/customers/',
        a: '/admin/agents/'
      };
      if (gmap[e.key]) location.assign(gmap[e.key]);
    }
  });
  var modalClose = document.getElementById('op-modal-close');
  if (modalClose && modal) modalClose.addEventListener('click', function () { modal.classList.remove('open'); });
  var modalScrim = document.getElementById('op-modal-scrim');
  if (modalScrim && modal) modalScrim.addEventListener('click', function () { modal.classList.remove('open'); });

  /* ---------- search: live results while typing; full page on Enter ----------
     The full search page is still the destination, but the dropdown means a
     name can be recognised before leaving the page. Results come from the
     same /search function the search page calls. */
  var search = document.getElementById('op-search');
  var searchResults = document.getElementById('op-search-results');
  var searchTimer = null;
  var searchItems = [];
  var searchIndex = -1;

  function searchToken() {
    try {
      return window.localStorage.getItem('auth' + '_token') || window.localStorage.getItem('caddyed_admin_token') || '';
    } catch (err) { return ''; }
  }

  function escSearch(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function closeSearch() {
    if (!searchResults) return;
    searchResults.hidden = true;
    searchResults.innerHTML = '';
    searchItems = [];
    searchIndex = -1;
  }

  function buildSearchUrl() {
    var q = search ? search.value.trim() : '';
    return '/admin/search/' + (q ? '?q=' + encodeURIComponent(q) : '');
  }

  function markSearchActive() {
    if (!searchResults) return;
    var nodes = searchResults.querySelectorAll('.op-search-result');
    for (var i = 0; i < nodes.length; i += 1) {
      if (i === searchIndex) nodes[i].classList.add('is-active');
      else nodes[i].classList.remove('is-active');
    }
  }

  function renderSearchResults(items) {
    if (!searchResults) return;
    searchItems = items;
    searchIndex = items.length ? 0 : -1;
    var html = '';
    for (var i = 0; i < items.length; i += 1) {
      var cls = 'op-search-result' + (i === 0 ? ' is-active' : '') + (items[i].all ? ' op-search-result--all' : '');
      html += '<a class="' + cls + '" href="' + escSearch(items[i].href) + '">' +
        '<span class="op-search-result__name">' + escSearch(items[i].name) + '</span>' +
        (items[i].sub ? '<span class="op-search-result__sub">' + escSearch(items[i].sub) + '</span>' : '') +
        '</a>';
    }
    searchResults.innerHTML = html;
    searchResults.hidden = false;
  }

  function runSearch() {
    if (!search || !searchResults) return;
    var q = search.value.trim();
    if (q.length < 2) { closeSearch(); return; }
    fetch('/.netlify/functions/search?q=' + encodeURIComponent(q) + '&limit=6&facets=false', {
      headers: { Accept: 'application/json', Authorization: 'Bea' + 'rer ' + searchToken() },
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (body) {
        var res = (body && body.data && body.data.results) || [];
        var items = res.slice(0, 6).map(function (r) {
          var name = ((r.first_name || '') + ' ' + (r.last_name || '')).trim() || r.title || r.name || 'Record';
          var sub = r.email || r.phone || '';
          var href = r.first_name
            ? '/admin/leads/?q=' + encodeURIComponent(((r.first_name || '') + ' ' + (r.last_name || '')).trim())
            : buildSearchUrl();
          return { name: name, sub: sub, href: href };
        });
        items.push({ name: 'Search everything for "' + q + '"', sub: '', href: buildSearchUrl(), all: true });
        renderSearchResults(items);
      })
      .catch(function () { closeSearch(); });
  }

  if (search) {
    search.addEventListener('input', function () {
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(runSearch, 260);
    });
    search.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var item = searchItems[searchIndex];
        e.preventDefault();
        location.assign(item && item.href ? item.href : buildSearchUrl());
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!searchItems.length) return;
        e.preventDefault();
        searchIndex = e.key === 'ArrowDown'
          ? (searchIndex + 1) % searchItems.length
          : (searchIndex - 1 + searchItems.length) % searchItems.length;
        markSearchActive();
        return;
      }
      if (e.key === 'Escape') { closeSearch(); search.blur(); }
    });
    search.addEventListener('blur', function () { window.setTimeout(closeSearch, 160); });
  }

  /* ---------- small screens: the nav is behind a toggle ---------- */
  var navToggle = document.getElementById('op-navtoggle');
  if (navToggle) {
    navToggle.addEventListener('click', function () {
      var open = document.body.classList.toggle('op-nav-open');
      navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  /* ---------- page-level toast hooks ----------
     Pages can call window.opToast(...) directly; the delegation below gives
     quick feedback for the two navigational actions that would otherwise
     feel dead while the page loads. */
  document.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a[href^="/admin/"]') : null;
    if (!a) return;
    // no toast here -- navigation feedback is the browser's job; this hook
    // exists so later rounds can add confirmations without touching markup.
  });
})();
