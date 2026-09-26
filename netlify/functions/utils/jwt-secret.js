/**
 * jwt-secret -- one answer to "is this secret usable?", shared by everything
 * that signs or verifies a staff/customer token.
 *
 * WHY THIS IS A MODULE AND NOT A ONE-LINE CHECK
 * ---------------------------------------------
 * Before this existed the question was answered three different ways in three
 * different files, and all three were wrong in a different direction:
 *
 *   utils/auth-middleware.js  checked `if (!JWT_SECRET)` -- but AFTER calling
 *                             jwt.verify with it, so the guard sat downstream
 *                             of the thing it was guarding.
 *   customer-auth.js          checked `if (!process.env.JWT_SECRET)` and threw
 *   sales-login.js            at require time -- fine, but only because a
 *                             previous fix had already removed a hardcoded
 *                             'fallback-secret'.
 *
 * Three implementations of one security predicate is three places to forget.
 *
 * WHAT "UNUSABLE" MEANS
 * --------------------
 *   1. absent (undefined)
 *   2. empty or whitespace
 *   3. a context marker written by netlify.toml into deploy-preview,
 *      branch-deploy and [dev].
 *
 * (3) is the reason this is not simply `!secret`. A marker is a PUBLIC string
 * committed to netlify.toml, and it is set precisely so a context that must not
 * touch production is recognisable. If a signer treated a marker as a real
 * secret it would mint tokens that verify fine for anyone who has read this
 * repository -- reintroducing, in a more sophisticated-looking form, exactly
 * the 'fallback-secret' bug these checks were written to close. So a marker is
 * refused for signing AND for verifying.
 *
 * The result is that previews fail closed with an honest message instead of
 * quietly accepting production tokens.
 */

'use strict';

// Kept in step with netlify.toml by ci/verify-endpoints.js, which cross-checks
// the two lists and fails if they drift in EITHER direction. A marker in the
// toml but not here is a public signing key nobody refuses; a marker here but
// not in the toml is dead weight that hides the next real one being added.
//
// There is deliberately no `dev-not-configured`. `netlify dev` is the one
// context where signing a token locally is harmless and refusing would stop a
// developer testing the sign-in flow at all, so [dev.environment] blanks the
// destructive things (every database connection string) and leaves the signing
// key alone. An earlier draft added the marker anyway; the drift gate caught it
// within a minute, which is the point of having the gate.
const SECRET_MARKERS = ['deploy-preview-not-configured', 'branch-deploy-not-configured'];

/**
 * @param {string} [secret] candidate secret, usually process.env.JWT_SECRET
 * @returns {boolean} true only if the secret can safely sign or verify a token
 */
function isUsableSecret(secret) {
  if (typeof secret !== 'string') return false;
  const trimmed = secret.trim();
  if (trimmed === '') return false;
  return !SECRET_MARKERS.includes(trimmed);
}

/**
 * Throw with a message that says which of the three reasons applies.
 *
 * Used by the signers, which are the ones that must refuse to load: a function
 * that cannot produce a valid token has no reason to be up, and an honest
 * message here beats a 500 from a verifier several functions away.
 *
 * @param {string} [name] env var name, for the message
 */
function assertUsableSecret(name = 'JWT_SECRET') {
  const secret = process.env[name];
  if (isUsableSecret(secret)) return;

  if (typeof secret === 'string' && SECRET_MARKERS.includes(secret.trim())) {
    throw new Error(
      `${name} is set to the marker "${secret.trim()}", which this context uses ` +
        'to prove it cannot touch production. Signing a token here would mint ' +
        'one that anyone who has read netlify.toml could forge. Set a real ' +
        `${name} for this context, or accept that it cannot authenticate.`
    );
  }

  throw new Error(`${name} environment variable is required`);
}

/**
 * Is the current context deliberately unconfigured?
 *
 * Lets a handler answer 503 "this context has no identity provider configured"
 * rather than 401 "please sign in", which would be a false invitation: signing
 * in cannot possibly work here.
 *
 * @returns {boolean}
 */
function isUnconfiguredContext() {
  return !isUsableSecret(process.env.JWT_SECRET);
}

module.exports = {
  SECRET_MARKERS,
  isUsableSecret,
  assertUsableSecret,
  isUnconfiguredContext,
};
