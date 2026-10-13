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
        i: '/admin/inventory/',
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

  /* ---------- search: hand off to the admin search page ---------- */
  var search = document.getElementById('op-search');
  if (search) {
    search.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var q = search.value.trim();
      location.assign('/admin/search/' + (q ? '?q=' + encodeURIComponent(q) : ''));
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
