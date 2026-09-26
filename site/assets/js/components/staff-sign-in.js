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
    if (this.form) this.form.reset();
    if (this.emailInput) this.emailInput.focus();
  }

  showSignedIn(user) {
    if (this.form) this.form.style.display = 'none';
    if (this.statusBox) this.statusBox.textContent = '';
    if (this.successBox) this.successBox.style.display = 'block';

    const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ');
    const who = name || user?.email || 'a valid session';
    if (this.whoBox) {
      // textContent: `who` originates in the login response body.
      this.whoBox.textContent = `Signed in as ${who}.`;
    }
    this.setBusy(false);
  }

  showForm() {
    if (this.successBox) this.successBox.style.display = 'none';
    if (this.form) this.form.style.display = '';
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
