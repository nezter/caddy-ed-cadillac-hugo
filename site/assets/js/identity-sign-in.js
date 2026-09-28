/**
 * identity-sign-in.js -- sign in with Netlify Identity.
 *
 * WHY THIS IS THE PRIMARY PATH
 * ----------------------------
 * The bespoke sign-in form posts to /.netlify/functions/sales-login, which looks
 * the rep up by email in Postgres. With no database configured that lookup
 * cannot happen, so the form could not sign anyone in -- and the admin is ten
 * pages behind that form.
 *
 * Netlify Identity is Netlify's own user store. It is already half-present on
 * this site: the Decap CMS at /admin/ uses netlify-identity-widget, so an
 * identity provider is configured and paid for while the sales tools ignore it.
 *
 * Using it means the admin door opens before any database exists, and brings
 * password reset, invitations, MFA and session revocation -- none of which a
 * hand-rolled JWT gives you.
 *
 * THE TOKEN GOES WHERE THE OTHER ONE WENT
 * ---------------------------------------
 * `auth_token`, `auth_user`, `auth_expiry` in localStorage, and the same
 * `Authorization: Bearer` header. Every admin module already reads those, so
 * signing in with Identity needs no change anywhere else. That is the whole
 * reason it is done this way rather than as a parallel system.
 *
 * IF IDENTITY IS NOT ENABLED
 * --------------------------
 * The page says so and falls back to the form. Both are shown when both are
 * available, because a sales person should not have to know which one the site
 * happens to be configured for.
 */
(function () {
  'use strict';

  const STORAGE = {
    token: 'auth_token',
    user: 'auth_user',
    expiry: 'auth_expiry',
  };

  function saveSession(jwt, user) {
    const payload = JSON.parse(
      atob(String(jwt).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))
    );
    localStorage.setItem(STORAGE.token, jwt);
    localStorage.setItem(STORAGE.user, JSON.stringify(user || payload.user_metadata || {}));
    if (payload.exp) {
      localStorage.setItem(STORAGE.expiry, String(payload.exp));
    }
  }

  function clearSession() {
    Object.values(STORAGE).forEach((k) => localStorage.removeItem(k));
  }

  function isSignedIn() {
    const expiry = Number(localStorage.getItem(STORAGE.expiry) || 0);
    // No expiry recorded means a token from the bespoke scheme, which is valid
    // until the server says otherwise. Do not evict it on a guess.
    if (expiry && Date.now() / 1000 >= expiry) return false;
    return Boolean(localStorage.getItem(STORAGE.token));
  }

  function el(id) {
    return document.getElementById(id);
  }

  function say(id, text, kind) {
    const box = el(id);
    if (!box) return;
    box.textContent = text || '';
    box.hidden = !text;
    if (kind) box.className = `sign-in-msg is-${kind}`;
  }

  function goToAdmin() {
    const next = new URLSearchParams(location.search).get('next');
    // Only same-site paths. An open redirect on a login page is how accounts
    // get phished, and this one builds the destination from a query string.
    const safe = next && /^\/[a-z0-9/_-]*$/i.test(next) ? next : '/admin/dashboard/';
    location.href = safe;
  }

  document.addEventListener('DOMContentLoaded', function () {
    const root = el('identity-sign-in');
    if (!root) return;

    const widgetScript = document.createElement('script');
    widgetScript.src = 'https://identity.netlify.com/v1/netlify-identity-widget.js';
    widgetScript.defer = true;
    document.head.appendChild(widgetScript);

    widgetScript.addEventListener('load', function () {
      const identity = window.netlifyIdentity;
      if (!identity) {
        root.hidden = true;
        return;
      }

      identity.on('init', function (user) {
        if (user) {
          identity.currentUser()
            .jwt()
            .then(function (token) {
              saveSession(token, user);
              say('identity-sign-in-status', `Signed in as ${user.email}. Opening…`, 'ok');
              goToAdmin();
            })
            .catch(function () {
              clearSession();
            });
        } else {
          say(
            'identity-sign-in-status',
            'Netlify Identity is enabled. Sign in below.',
            null
          );
        }
      });

      identity.on('login', function (user) {
        identity
          .currentUser()
          .jwt()
          .then(function (token) {
            saveSession(token, user);
            say('identity-sign-in-status', 'Signed in. Opening…', 'ok');
            goToAdmin();
          })
          .catch(function (err) {
            say('identity-sign-in-error', String(err.message || err), 'error');
          });
      });

      identity.on('error', function (err) {
        say(
          'identity-sign-in-error',
          err && err.message
            ? err.message
            : 'Sign-in failed. If you have not been invited yet, ask Ed to add you in the Netlify dashboard.',
          'error'
        );
      });

      // The modal the widget owns. Opened by a real button rather than a div so
      // it is keyboard reachable and announced.
      const open = el('identity-open');
      if (open) {
        open.addEventListener('click', function () {
          identity.open('login');
        });
      }
      const signup = el('identity-signup');
      if (signup) {
        signup.addEventListener('click', function () {
          identity.open('signup');
        });
      }
      const reset = el('identity-reset');
      if (reset) {
        reset.addEventListener('click', function () {
          identity.open('recovery');
        });
      }
    });

    widgetScript.addEventListener('error', function () {
      // No widget means Identity is not enabled for this site. That is a
      // configuration state, not a failure, and the form below still works.
      root.hidden = true;
      say(
        'sign-in-status',
        'Netlify Identity is not enabled on this site — use the form below.',
        null
      );
    });

    // A live session should not need the form at all.
    if (isSignedIn()) {
      say('identity-sign-in-status', 'You are already signed in. Opening…', 'ok');
      goToAdmin();
    }
  });

  window.addEventListener('identity:logout', clearSession);
})();
