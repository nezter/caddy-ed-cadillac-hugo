/**
 * admin-nav.js -- the section menu: a real accordion, hidden until there
 * is a session.
 *
 * THE ACCORDION. Each group is one open/closed section; opening one
 * closes the others (that is what makes it an accordion and not a pile of
 * toggles), the group for the page you are on opens itself, and the open
 * group is remembered in localStorage as you move around. Sub-items are
 * indented under their group label by the stylesheet. The links stay in
 * the DOM whether or not a group is open, so the menu is always the same
 * list of pages to anything that reads the HTML.
 *
 * THE HIDING. The menu ships inside the static shell of every admin page,
 * so the shell itself cannot know who is looking at it. It is emitted
 * with the 'hidden' attribute and this script removes it only after
 * sales-auth-check confirms the stored token. No token, expired token,
 * rejected token: the menu stays hidden. On /admin/sign-in/ there is no
 * session by definition, which is why its menu never appears -- a visitor
 * cannot enumerate the admin from the front door.
 *
 * The token comes from the same localStorage key every other admin script
 * uses (staff-session.js: auth_token; caddyed_admin_token is read as a
 * fallback for sessions stored by older builds) and travels as an
 * Authorization header and nowhere else.
 */
(function () {
  'use strict';

  var nav = document.querySelector('[data-admin-nav]');
  if (!nav) return;

  /* ---------- accordion ---------- */

  var STORE = 'op-nav-open';
  var groups = Array.prototype.slice.call(nav.querySelectorAll('.admin-nav__group'));

  function slugOf(group) { return group.getAttribute('data-nav-group') || ''; }

  function apply(openSlug) {
    for (var i = 0; i < groups.length; i += 1) {
      var group = groups[i];
      var open = slugOf(group) === openSlug && openSlug !== '';
      group.classList.toggle('is-open', open);
      var btn = group.querySelector('.admin-nav__toggle');
      if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
  }

  var stored = null;
  try { stored = window.localStorage.getItem(STORE); } catch (e) { stored = null; }

  var currentGroup = null;
  for (var g = 0; g < groups.length; g += 1) {
    if (groups[g].classList.contains('is-current-group')) { currentGroup = groups[g]; break; }
  }

  var initial = stored !== null && stored !== undefined && stored !== ''
    ? stored
    : (currentGroup ? slugOf(currentGroup) : (groups[0] ? slugOf(groups[0]) : ''));
  apply(initial);

  nav.addEventListener('click', function (ev) {
    var target = ev.target;
    var btn = target && target.closest ? target.closest('.admin-nav__toggle') : null;
    if (!btn || !nav.contains(btn)) return;
    var group = btn.parentNode;
    var open = group.classList.contains('is-open');
    var next = open ? '' : slugOf(group);
    apply(next);
    try { window.localStorage.setItem(STORE, next); } catch (e) { /* private mode */ }
  });

  /* ---------- reveal, once a session is confirmed ---------- */

  var token = null;
  try {
    token = window.localStorage.getItem('auth_token')
      || window.localStorage.getItem('caddyed_admin_token');
  } catch (e) {
    // Private mode / disabled storage: no token, no menu.
    return;
  }
  if (!token) return;

  var authorization = 'Bearer ' + token;

  fetch('/.netlify/functions/sales-auth-check', {
    headers: { Authorization: authorization },
    credentials: 'same-origin'
  })
    .then(function (response) { return response.json(); })
    .then(function (body) {
      var ok = Boolean(body && body.success === true && body.data && body.data.authenticated === true);
      if (ok) nav.hidden = false;
    })
    .catch(function () {
      // Network problem: keep it hidden; the page's own fetches surface
      // their state in their own status areas.
    });
})();
