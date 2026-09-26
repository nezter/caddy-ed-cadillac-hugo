/**
 * Staff Session — the one place a sales token is read and written.
 *
 * Transport-agnostic on purpose: the endpoint URLs are passed IN by the caller
 * rather than hardcoded here. Two reasons, one of them a build gate:
 *
 *   1. Different callers need different functions. /admin/sign-in needs
 *      login + logout + auth-check; customerRelationship.js needs only
 *      auth-check. Baking a table in here would have this module claiming
 *      endpoints its consumer never calls.
 *   2. ci/verify-endpoints.js decides whether a function is `wired` by scanning
 *      the REACHABLE bundle graph, and it resolves relative imports with
 *      `importer = null` (verify-endpoints.js:126) -- i.e. always relative to
 *      site/assets/js/, never to the importing file. A helper one directory
 *      down is therefore never scanned, and an endpoint literal that lives in
 *      it is invisible to the gate that exists to prove the endpoint is wired.
 *      It is a bug in that script, but ci/ is not this change's to edit, so
 *      the URLs live in the entry files where the gate can see them.
 *
 * ============================== WHY localStorage ==============================
 * This is the third implementation of "log a rep in" in this repo. The other
 * two (site/assets/js/utils/session-manager.js and, before it, inline scripts
 * in admin content) both used localStorage under the key `auth_token`, and two
 * other components — components/lead-management.js:53 and
 * components/advanced-search.js:193 — read that exact key with no fallback of
 * their own. Storing the token anywhere else would silently break those three,
 * and the failure mode would be a 401 on a page that looks signed in.
 *
 * The alternative, an HttpOnly cookie, is genuinely better against XSS — that
 * is why it is the usual answer — but it only works if the FUNCTION sets the
 * cookie. sales-login.js does not set one. It is doable (the middleware already
 * reads an `auth_token` cookie, auth-middleware.js:31, and sales-logout now
 * expires it), but on this codebase it buys nothing while the localStorage
 * copies remain, and it is a second mechanism to keep in step.
 *
 * The mitigation that matters, and that this module implements, is that
 * NOTHING here is ever put in a URL. A token in localStorage is readable by any
 * script that runs on the page; a token in `?token=…` is readable by the
 * browser history, by the Referer header of every outbound link, by every
 * analytics script, and by the access log. localStorage is the lesser evil, and
 * the lesser evil is only acceptable if the greater one is not merely renamed.
 *
 * The real XSS defence is the Content-Security-Policy in netlify.toml, and it
 * currently allows `script-src 'unsafe-inline'`, which defeats it. That is
 * netlify.toml, which is not this change's file to edit — see the report.
 * ============================================================================
 *
 * KEY NAMES ARE THE CONTRACT. utils/session-manager.js writes the same three
 * keys, so a sign-in here and a sign-in there are interchangeable, and signing
 * out here clears a session that was created there.
 */

export const TOKEN_KEY = 'auth_token';
export const USER_KEY = 'auth_user';
export const EXPIRY_KEY = 'auth_expiry';

// Must match the paths in netlify.toml. The blanket /api/* rewrite was removed
// (netlify.toml:74-77) and nothing replaced it, so a call to /api/sales/*
// resolves to nothing and returns an HTML 404 page, which is not JSON and
// throws in every caller.

// Matches JWT_EXPIRES_IN in sales-login.js (default '8h'). Only a client-side
// hint to avoid making a doomed request; the server's `exp` claim decides.
const DEFAULT_TTL_SECONDS = 8 * 60 * 60;

/**
 * Read the stored token. Returns null when absent, unparseable or past its
 * recorded expiry.
 */
export function getToken() {
  let token;
  try {
    token = window.localStorage.getItem(TOKEN_KEY);
  } catch {
    // Private browsing / disabled storage. Not an error worth throwing over;
    // the caller gets null and shows the sign-in form.
    return null;
  }
  if (!token) return null;

  const expiry = Number(window.localStorage.getItem(EXPIRY_KEY) || 0);
  if (expiry && Date.now() >= expiry) {
    // Expired locally. Clear rather than send it: a request with a known-dead
    // token is a 401 that renders as an error instead of as the sign-in form.
    clearSession();
    return null;
  }

  return token;
}

export function getUser() {
  try {
    const raw = window.localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Headers for an authenticated call. The token goes in the Authorization
 * header and nowhere else.
 */
export function authHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return {
    headers,
    // Same-origin, so an `auth_token` cookie would travel if one were ever set
    // and a proxy in front of the function sees the real client IP for the rate
    // limiter. (fetch already defaults to 'same-origin'; this states it.)
    credentials: 'same-origin'
  };
}

/**
 * Persist a session.
 *
 * RESPONSE SHAPE — the single most common defect in this repo:
 * createSuccessResponse (utils/error-handler.js:122) wraps every payload as
 * {success, message, data, timestamp}. The token is therefore at
 * `data.token`, NOT `token`. Reading the top level yields undefined, which then
 * gets stored as the "token", and every later call sends
 * `Authorization: Bearer undefined` and gets a 401 that looks like bad
 * credentials rather than like a parsing bug.
 */
export function saveSession(data) {
  if (!data || !data.token) {
    throw new Error('Login response had no data.token');
  }

  // The server tells us the TTL as a string like '8h' (JWT_EXPIRES_IN in
  // sales-login.js:13). If it is missing or unparseable, fall back to the
  // documented default — never to 0, which would store an expiry that reads as
  // "already expired" on the very next page load.
  const ttlSeconds = parseTtl(data.expiresIn) || DEFAULT_TTL_SECONDS;
  const expiry = Date.now() + ttlSeconds * 1000;

  try {
    window.localStorage.setItem(TOKEN_KEY, data.token);
    window.localStorage.setItem(USER_KEY, JSON.stringify(data.user || null));
    window.localStorage.setItem(EXPIRY_KEY, String(expiry));
  } catch {
    throw new Error('Could not save the session in this browser, so you cannot stay signed in.');
  }

  return { user: data.user || null, expiry };
}

// '8h' -> 28800, '30m' -> 1800, '7d' -> 604800, '3600' -> 3600
function parseTtl(value) {
  if (value == null) return 0;
  const match = String(value).trim().match(/^(\d+)\s*([smhd])?$/i);
  if (!match) return 0;
  const factors = { s: 1, m: 60, h: 3600, d: 86400 };
  return parseInt(match[1], 10) * factors[(match[2] || 's').toLowerCase()];
}

export function clearSession() {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(USER_KEY);
    window.localStorage.removeItem(EXPIRY_KEY);
  } catch {
    // Nothing to do; the in-memory state the caller holds is what the page uses.
  }
}

/**
 * Ask the server whether the stored token is still good.
 *
 * This is a PROBE, not a gate: sales-auth-check answers HTTP 200 either way,
 * with `data.authenticated` true or false, because "am I signed in?" is a
 * question with a negative answer rather than an error. The flag is at
 * `data.authenticated` for the wrapping reason above.
 */
export async function checkAuth(endpoint) {
  const token = getToken();
  if (!token) {
    return { authenticated: false, user: null, reason: 'no-token' };
  }

  let response;
  try {
    const { headers, credentials } = authHeaders();
    response = await fetch(endpoint, { method: 'GET', headers, credentials });
  } catch (error) {
    // Network failure, DNS, offline. Distinct from "your session is over": the
    // session may well still be valid, so it is NOT cleared here.
    return { authenticated: false, user: null, reason: 'network', error };
  }

  let body = null;
  try {
    body = await response.json();
  } catch {
    return { authenticated: false, user: null, reason: 'bad-response' };
  }

  const payload = (body && body.data) || {};
  if (response.ok && payload.authenticated === true) {
    return { authenticated: true, user: payload.user || getUser(), reason: 'ok' };
  }

  // Expired, revoked, or the rep's account is no longer active. All three mean
  // the stored token is worthless, so clear it and make the caller show a
  // sign-in state rather than an empty table.
  clearSession();
  return {
    authenticated: false,
    user: null,
    reason: payload.message || body?.message || 'rejected'
  };
}

/**
 * Sign in. Throws an Error whose message is safe to show to a person.
 */
export async function login(endpoint, email, password) {
  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Same-origin so any cookie the function sets is accepted, and so a proxy
      // in front of the function sees the real client IP for the rate limiter.
      credentials: 'same-origin',
      body: JSON.stringify({ email, password })
    });
  } catch {
    throw new Error('Could not reach the server. Check your connection and try again.');
  }

  let body = null;
  try {
    body = await response.json();
  } catch {
    throw new Error('The server sent a response that was not JSON. Nothing was signed in.');
  }

  if (!response.ok) {
    // 429 is the rate limiter (fixed in sales-login.js: it used to answer HTTP
    // 200 with success:true, which no client could detect). 401 is a rejected
    // credential. Both put their reason in `message`.
    throw new Error(body?.message || `Sign-in failed (HTTP ${response.status}).`);
  }

  if (body?.success !== true) {
    throw new Error(body?.message || 'Sign-in failed.');
  }

  // Wrapped payload. See saveSession().
  return saveSession(body.data);
}

/**
 * Sign out.
 *
 * Order matters and it is the reverse of sign-in: tell the server FIRST (so the
 * token is blacklisted while it still exists), and clear the local copy
 * regardless of what the server says. A logout that fails to reach the server
 * and then keeps the token is not a logout.
 */
export async function logout(endpoint) {
  const token = getToken();

  if (token) {
    try {
      await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'same-origin'
      });
    } catch {
      // Network failure. The local session is still cleared below, which is
      // the half that protects the person at this browser; the token simply
      // stays valid server-side until it expires.
    }
  }

  clearSession();
}
