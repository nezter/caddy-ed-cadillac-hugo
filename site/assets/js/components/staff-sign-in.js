/**
 * Staff Sign-In — the page driver for /admin/sign-in.
 *
 * This is the first thing on this site that has ever been able to produce a
 * sales session. All credential handling lives in components/staff-session.js
 * so that /admin/dashboard's session-manager.js and this page agree on the
 * same three localStorage keys (`auth_token`, `auth_user`, `auth_expiry`) and
 * the same `Authorization: Bearer` header. Two implementations of "log in" is
 * how this repo ended up with a login form that could not log anyone in.
 *
 * WHAT IT DOES NOT DO, and this matters more than what it does:
 * it does not treat a successful sign-in as permission to render the page. The
 * admin pages are all built to the public directory and served to every
 * visitor today; they each fetch their own data, and their functions return 401
 * without a valid token. Signing in here makes those fetches succeed. It does
 * not, by itself, make /admin/* private. See the report — closing that needs
 * Netlify's /admin/* password protection or a build-time split of the section.
 */
import {
  checkAuth,
  getUser,
  login,
  logout
} from './staff-session.js';

// The endpoint URLs live HERE, in the entry file, rather than in
// staff-session.js. ci/verify-endpoints.js proves a function is `wired` by
// scanning the reachable bundle graph, and it resolves relative imports with
// `importer = null` (verify-endpoints.js:126) — always relative to
// site/assets/js/, never to the importing file. A helper one directory down is
// therefore never scanned, so an endpoint literal inside it is invisible to the
// gate whose entire job is to prove the endpoint is reachable. That is a bug in
// the checker; ci/ is not this change's to edit, so the literals are kept where
// the gate can see them.
//
// netlify.toml has no alias for any of these (the blanket /api/* rewrite was
// removed — netlify.toml:74-77), so they are called by function name.
const ENDPOINTS = {
  login: '/.netlify/functions/sales-login',
  logout: '/.netlify/functions/sales-logout',
  authCheck: '/.netlify/functions/sales-auth-check'
};

/**
 * Where a fresh sign-in should land: the `next` the admin-guard added when
 * it bounced the visitor here, provided it is a same-site path (an absolute
 * URL would make this an open redirect), else the hub. Owner, 2026-10-12:
 * after signing in, the page just sat on /admin/sign-in -- the password path
 * never navigated anywhere, while the identity path always jumped. \u0024
 */
function nextTarget() {
  try {
    const raw = new URLSearchParams(window.location.search).get('next') || '';
    if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  } catch (err) { /* fall through to the hub */ }
  return '/admin/';
}

class StaffSignIn {
  constructor() {
    this.root = document.getElementById('staff-sign-in');
    if (!this.root) return;

    this.form = document.getElementById('staff-sign-in-form');
    this.emailInput = document.getElementById('sign-in-email');
    this.passwordInput = document.getElementById('sign-in-password');
    this.submitButton = document.getElementById('sign-in-submit');
    this.errorBox = document.getElementById('sign-in-error');
    this.statusBox = document.getElementById('sign-in-status');
    this.successBox = document.getElementById('sign-in-success');
    this.whoBox = document.getElementById('sign-in-who');
    this.detailsBox = document.getElementById('sign-in-details');
    // Elements hidden while a session exists; see hideOptions().
    this.hiddenOptions = [];
    this.signOutButton = document.getElementById('sign-in-signout');

    this.init();
  }

  init() {
    if (this.form) {
      this.form.addEventListener('submit', (event) => this.handleSubmit(event));
    }
    if (this.signOutButton) {
      this.signOutButton.addEventListener('click', () => this.handleSignOut());
    }

    // On load: is there already a session? Probing is the whole point. A form
    // shown to someone who is already signed in is not wrong, but a form shown
    // to someone whose token expired 3 seconds ago is an empty panel with a
    // sign-in box nobody can see, which is the bug this page exists to end.
    this.setStatus('Checking for an existing session…');
    checkAuth(ENDPOINTS.authCheck)
      .then((result) => {
        if (result.authenticated) {
          this.showSignedIn(result.user || getUser());
        } else {
          this.showForm();
          // Clear the checking line on THIS outcome too -- it used to stay on
          // screen forever for a signed-out visitor (owner found it live).
          this.setStatus('');
          if (result.reason && result.reason !== 'no-token') {
            // A stored token the server rejected: say so, rather than presenting
            // a blank form as though nothing had happened.
            this.showError(
              result.reason === 'network'
                ? 'Could not reach the server to check your session. You can still sign in below.'
                : `Your previous session is no longer valid (${result.reason}). Please sign in again.`
            );
          }
        }
      });
  }

  async handleSubmit(event) {
    event.preventDefault();
    this.clearError();

    const email = (this.emailInput?.value || '').trim();
    const password = this.passwordInput?.value || '';

    if (!email || !password) {
      this.showError('Enter both your work email and your password.');
      return;
    }

    this.setBusy(true);
    this.setStatus('Signing in…');

    try {
      const session = await login(ENDPOINTS.login, email, password);
      this.setStatus('');
      this.showSignedIn(session.user);
      // The password is not retained anywhere, including in this component.
      if (this.passwordInput) this.passwordInput.value = '';
      // And go where the guard was sending them all along. The transform
      // above is what a RETURN visitor sees; a fresh sign-in should not sit
      // on the sign-in URL (owner: "stuck on .../sign-in").
      window.location.assign(nextTarget());
    } catch (error) {
      // A rejected sign-in is a first-class visible state, and it is the single
      // most important thing on this page. The alternative — clear the form,
      // render nothing — is indistinguishable from a page that has not loaded,
      // and it is how a sign-in that never worked shipped unnoticed.
      this.setStatus('');
      this.showError(error.message || 'Sign-in failed.');
      this.setBusy(false);
      if (this.passwordInput) {
        this.passwordInput.focus();
        this.passwordInput.select();
      }
    }
  }

  async handleSignOut() {
    this.setBusy(true);
    await logout(ENDPOINTS.logout);
    this.setBusy(false);
    this.showForm();
    this.setStatus('You are signed out.');
    const navEl = document.querySelector('[data-admin-nav]');
    if (navEl) navEl.hidden = true;
    if (this.form) this.form.reset();
    if (this.emailInput) this.emailInput.focus();
  }

  showSignedIn(user) {
    // A session exists: every OFFER TO SIGN IN disappears -- both cards,
    // their headings and all the explanatory notes -- leaving the profile
    // panel and (revealed here, too) the section menu at the top.
    this.hideOptions();
    const navEl = document.querySelector('[data-admin-nav]');
    if (navEl) navEl.hidden = false;

    if (this.form) this.form.style.display = 'none';
    if (this.statusBox) this.statusBox.textContent = '';
    if (this.successBox) this.successBox.style.display = 'block';

    const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ');
    const who = name || user?.email || 'a valid session';
    if (this.detailsBox) {
      const bits = [user && user.email, user && user.role ? String(user.role).replace(/_/g, ' ') : ''].filter(Boolean);
      this.detailsBox.textContent = bits.join(' \u00b7 ');
      if (bits.length) this.detailsBox.removeAttribute('hidden');
      else this.detailsBox.setAttribute('hidden', '');
    }
    if (this.whoBox) {
      // textContent: `who` originates in the login response body.
      this.whoBox.textContent = `Signed in as ${who}.`;
    }
    this.setBusy(false);
  }

  showForm() {
    // Signed-out state: the offers return and the menu hides again.
    this.restoreOptions();
    if (this.successBox) this.successBox.style.display = 'none';
    if (this.form) this.form.style.display = '';
  }

  /*
   * Hide / restore the offers to sign in.
   *
   * The options are not one element: the identity card with its heading and
   * paragraphs, the password card's heading, and the notes in between -- all
   * siblings of the component root inside .admin-content. Hide every child
   * of the content column except the one that contains this component.
   * Inline display rather than the hidden attribute: some of these carry a
   * stylesheet display (the nav had exactly this bug), and an author
   * display beats the UA [hidden] rule.
   */
  hideOptions() {
    const content = this.root && this.root.closest('.admin-content');
    if (!content) return;
    this.hiddenOptions = [];
    Array.prototype.forEach.call(content.children, (el) => {
      if (el === this.root || el.contains(this.root)) return;
      this.hiddenOptions.push(el);
      el.style.display = 'none';
    });
  }

  restoreOptions() {
    if (this.hiddenOptions) {
      this.hiddenOptions.forEach((el) => { el.style.display = ''; });
    }
    this.hiddenOptions = [];
  }

  showError(message) {
    if (!this.errorBox) return;
    // textContent, never innerHTML: this string can come from the server (a
    // 429's message, a 401's, a network failure's).
    this.errorBox.textContent = message;
    this.errorBox.style.display = 'block';
  }

  clearError() {
    if (!this.errorBox) return;
    this.errorBox.textContent = '';
    this.errorBox.style.display = 'none';
  }

  setStatus(message) {
    if (this.statusBox) this.statusBox.textContent = message;
  }

  setBusy(busy) {
    if (!this.submitButton) return;
    this.submitButton.disabled = busy;
    const text = this.submitButton.querySelector('.button-text');
    const spinner = this.submitButton.querySelector('.loading-spinner');
    if (text) text.style.display = busy ? 'none' : '';
    if (spinner) spinner.style.display = busy ? 'inline-block' : 'none';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new StaffSignIn();
});
