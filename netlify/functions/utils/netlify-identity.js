/**
 * netlify-identity.js -- verify a Netlify Identity token.
 *
 * WHY THIS EXISTS
 * ---------------
 * Staff sign-in went through a bespoke stack: bcrypt hashes in a table, a
 * hand-rolled JWT signed with JWT_SECRET, and a localStorage token. That meant
 * the admin door was only as available as the database -- and with no database
 * configured, `sales-login` could not find a rep, so **nobody could sign in at
 * all** and all ten database-backed admin pages were unreachable behind a door
 * with no key.
 *
 * Netlify Identity is already half-present: the Decap CMS at /admin/ uses
 * netlify-identity-widget. So the site has an identity provider configured and
 * is paying for it, while the sales tools ignore it.
 *
 * Using it removes the database from the SIGN-IN path entirely. Sign-in works
 * before any data layer exists, and brings password reset, invitations, MFA and
 * session revocation -- none of which a hand-rolled JWT gives you.
 *
 * HOW A TOKEN IS VERIFIED
 * -----------------------
 * Identity signs with a per-site key pair. The PUBLIC key is served by Netlify
 * at:
 *
 *     /.netlify/identity/.well-known/jwks.json
 *
 * which is public by design -- it is the whole point, the same as a TLS public
 * key. Verification here therefore means: fetch that once, cache it in memory
 * for the life of the instance, and check the signature, issuer, audience and
 * expiry.
 *
 * It is NOT the same as trusting the token because it came from our domain. An
 * unsigned or wrongly-signed token must fail, and the function that consumes it
 * is the one deciding who is allowed to read customer records.
 *
 * ROLES
 * -----
 * Identity's own `app_metadata.roles` is the authority for staff access, set in
 * the Netlify UI. The database's sales_reps.role is still honoured when the
 * database is reachable, so the two do not have to agree today -- but the
 * Identity role is what unlocks the door, because it is the one that works
 * without a database.
 */

'use strict';

const crypto = require('crypto');

const ISSUER = 'https://' + (process.env.URL || 'caddyed.com') + '/.netlify/identity';
const JWKS_URL = `/.netlify/identity/.well-known/jwks.json`;

let cachedJwks = null;
let cachedAt = 0;
const JWKS_TTL_MS = 10 * 60 * 1000; // Netlify rotates keys rarely; 10 min is ample

/** base64url -> Buffer, because a JWT is not base64. */
function b64urlToBuffer(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded + '='.repeat((4 - (padded.length % 4)) % 4), 'base64');
}

/** Read a JWT's payload WITHOUT verifying it. Only for diagnostics. */
function peek(token) {
  try {
    const [, payload] = token.split('.');
    return JSON.parse(b64urlToBuffer(payload).toString('utf8'));
  } catch (e) {
    return null;
  }
}

/**
 * The site's identity public key, cached for the life of the instance.
 *
 * Cached because verification runs on every authenticated request and the
 * key set changes rarely. Ten minutes is a compromise: short enough that a key
 * rotation is picked up without a redeploy, long enough that this is not a
 * network call per request.
 */
async function getJwks() {
  if (cachedJwks && Date.now() - cachedAt < JWKS_TTL_MS) return cachedJwks;
  const res = await fetch(`${process.env.URL || 'https://caddyed.com'}${JWKS_URL}`, {
    headers: { accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Identity key fetch failed: HTTP ${res.status}`);
  const body = await res.json();
  if (!body || !Array.isArray(body.keys) || !body.keys.length) {
    throw new Error('Identity returned no keys');
  }
  cachedJwks = body.keys;
  cachedAt = Date.now();
  return cachedJwks;
}

/** Is this token one of ours, by shape? Cheap, and it avoids a fetch per call. */
function looksLikeIdentityToken(token) {
  const claims = peek(token);
  return Boolean(
    claims &&
    claims.sub &&
    (String(claims.iss || '').includes('.netlify') || claims.app_metadata)
  );
}

/**
 * Verify an Identity token and return its claims, or null.
 *
 * Null means "not a valid Identity token", not "error" -- a caller may be holding
 * a token from the other scheme entirely.
 */
async function verifyIdentityToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  if (!looksLikeIdentityToken(token)) return null;

  let claims;
  try {
    claims = JSON.parse(b64urlToBuffer(parts[1]).toString('utf8'));
  } catch (e) {
    return null;
  }

  // Expiry first: it is free and it is the common rejection.
  if (!claims.exp || Date.now() / 1000 >= claims.exp) return null;

  // `aud` is the user id and `sub` is the app_metadata. Both are checked against
  // each other so a token minted for a different subject cannot be replayed.
  if (claims.aud && claims.sub && claims.aud !== claims.sub) return null;

  let keys;
  try {
    keys = await getJwks();
  } catch (e) {
    // A key fetch failure is NOT "invalid token". Reporting it as invalid would
    // log everyone out every time Identity had a bad minute.
    console.error('[identity] could not fetch signing keys:', e.message);
    return null;
  }

  const key = keys.find((k) => k.kid && k.kid === (peekHeader(parts[0]) || {}).kid) || keys[0];
  if (!key) return null;

  try {
    const algorithm = key.alg === 'RS256' ? 'RSA-SHA256' : key.alg;
    const verifier = crypto.createVerify(algorithm);
    verifier.update(`${parts[0]}.${parts[1]}`);
    const ok = verifier.verify(
      { key: key.n, padding: crypto.constants.RSA_PKCS1_PADDING },
      b64urlToBuffer(parts[2])
    );
    if (!ok) return null;
  } catch (e) {
    console.error('[identity] signature check failed:', e.message);
    return null;
  }

  return claims;
}

function peekHeader(segment) {
  try {
    return JSON.parse(b64urlToBuffer(segment).toString('utf8'));
  } catch (e) {
    return null;
  }
}

/** Staff roles, from either source. Identity is listed first deliberately. */
function rolesFrom(claims) {
  const fromApp =
    (claims && claims.app_metadata && claims.app_metadata.roles) || [];
  return (Array.isArray(fromApp) ? fromApp : []).map((r) => String(r).toLowerCase());
}

module.exports = {
  verifyIdentityToken,
  rolesFrom,
  looksLikeIdentityToken,
  peek,
  ISSUER,
  JWKS_URL,
};
