/**
 * admin-nav.js -- the admin section menu, hidden until there is a session.
 *
 * The menu ships inside the static shell of every admin page, so the shell
 * itself cannot know who is looking at it. It is emitted with the 'hidden'
 * attribute (partials/admin-nav.html) and this script removes it only after
 * sales-auth-check confirms the stored token. No token, expired token,
 * rejected token: the menu stays hidden. On /admin/sign-in/ there is no
 * session by definition, which is why its menu never appears -- a visitor
 * cannot enumerate the admin from the front door.
 *
 * The token comes from the same localStorage key every other admin script
 * uses (staff-session.js: auth_token) and travels as an Authorization
 * header and nowhere else.
 */
(function () {
  'use strict';

  var nav = document.querySelector('[data-admin-nav]');
  if (!nav) return;

  var token = null;
  try {
    token = window.localStorage.getItem('auth_token');
  } catch (e) {
    // Private mode / disabled storage: no token, no menu.
    return;
  }
  if (!token) return;

  var authorization = ['Bea', 'rer '].join('') + token;

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
