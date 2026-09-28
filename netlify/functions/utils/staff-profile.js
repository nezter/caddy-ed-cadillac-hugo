/**
 * staff-profile.js -- the application profile for a signed-in staff member.
 *
 * WHY THIS EXISTS
 * ---------------
 * Netlify Identity answers "who is this?" and nothing else. It is a good answer
 * and it works with no database, which is the reason the admin door opens at all
 * on a site that has no data layer.
 *
 * But the rest of this application needs a person in it. `lead-assignments`
 * looks up `getSalesRep(id)` to assign a lead to somebody. Google Calendar sync
 * needs to know whose calendar. Email sync needs an address and a name to put on
 * a message. A JWT with claims in it is not a record anybody can join against.
 *
 * So the first time somebody signs in, a row is written. After that the row is
 * the record and the token is only the proof. That split is deliberate: Identity
 * can revoke a session instantly, and the row survives, because a person's record
 * should not evaporate when they sign out.
 *
 * WHAT IS NOT STORED
 * ------------------
 * No password. Identity owns authentication, so there is no password to keep, no
 * hash to leak, and nothing for `sales-login` to compare against. The
 * `password_hash` column is left NULL, and `sales-login` already refuses an
 * account that has none rather than letting anyone through.
 *
 * THE ID IS THE IDENTITY `sub`
 * ----------------------------
 * `sub` is a uuid Netlify assigns and never reissues. Keying the row on it means
 * the same person keeps the same `sales_reps.id` for the life of the account, so
 * leads assigned to them stay assigned and their calendar ownership does not
 * change. Generating a fresh uuid per sign-in would quietly orphan both.
 *
 * `sales_reps.email` is UNIQUE, so provisioning also matches on email. That
 * matters when an account is re-created: a new `sub`, the same human, and the
 * existing row is adopted rather than a second one created.
 */

'use strict';

const DatabaseService = require('./database-service');

/**
 * Every permission any function in this project checks for.
 *
 * The schema's own default for `sales_reps.permissions` is
 * `'view_customers,manage_leads'` -- two of these eighteen, from a different
 * vocabulary. So a rep created with the default has no access to campaigns,
 * rules, analytics, search, templates, interactions, assignments or
 * preferences, and the functions return 403 with no obvious reason.
 *
 * This list is derived from the `requiredPermissions` of every function, and the
 * test suite asserts that it still matches. That assertion is the point: a
 * function that grows a new required permission and a list that does not gain it
 * will fail CI, rather than quietly locking the staff out of the feature.
 */
const ALL_PERMISSIONS = [
  'view_customers', 'view_leads', 'manage_leads',
  'campaigns_read', 'campaigns_write',
  'rules_read', 'rules_write',
  'analytics_read',
  'search_read',
  'templates_read', 'templates_write',
  'interactions_read', 'interactions_write',
  'assignments_read', 'assignments_write',
  'preferences_read', 'preferences_write',
];

/**
 * Permissions granted by Identity role.
 *
 * An admin gets everything, which is spelled out here rather than left implicit,
 * so adding a permission to ALL_PERMISSIONS cannot accidentally leave an admin
 * without it. Every other role is additive from a named set: least privilege by
 * default, and a role that is not in this map gets nothing rather than
 * everything.
 */
const PERMISSIONS_BY_ROLE = {
  admin: () => ALL_PERMISSIONS.slice(),
  manager: () => [
    'view_customers', 'view_leads', 'manage_leads',
    'campaigns_read', 'campaigns_write',
    'rules_read', 'rules_write',
    'analytics_read', 'search_read',
    'templates_read', 'templates_write',
    'interactions_read', 'interactions_write',
    'assignments_read', 'assignments_write',
  ],
  sales_rep: () => [
    'view_customers', 'view_leads',
    'campaigns_read', 'campaigns_write',
    'interactions_read', 'interactions_write',
    'preferences_read', 'preferences_write',
  ],
};

/**
 * Split a name that Identity may hold in one place.
 *
 * `app_metadata.full_name` is a free-text field a person typed. Splitting on
 * whitespace is not clever, but the alternative -- a single `name` column and a
 * regex at every display site -- is worse, and `sales_reps` has
 * `first_name`/`last_name` NOT NULL, so something has to fill both.
 */
function splitName(fullName, email) {
  const raw = String(fullName || '').trim();
  if (!raw) {
    // No name given. Fall back to the local part of the address rather than
    // writing an empty string into two NOT NULL columns.
    const local = String(email || '').split('@')[0] || 'Staff';
    return { first_name: local, last_name: '' };
  }
  const parts = raw.split(/\s+/);
  if (parts.length === 1) return { first_name: parts[0], last_name: '' };
  return { first_name: parts[0], last_name: parts.slice(1).join(' ') };
}

/** Lower-cased roles from an Identity claim set, as `netlify-identity` does. */
function rolesOf(claims) {
  const fromApp = (claims && claims.app_metadata && claims.app_metadata.roles) || [];
  return (Array.isArray(fromApp) ? fromApp : []).map((r) => String(r).toLowerCase());
}

/**
 * The permissions a claim set grants, most-privileged role winning.
 */
function permissionsFor(claims) {
  const roles = rolesOf(claims);
  if (roles.includes('admin')) return ALL_PERMISSIONS.slice();
  for (const role of roles) {
    if (PERMISSIONS_BY_ROLE[role]) return PERMISSIONS_BY_ROLE[role]();
  }
  return [];
}

/**
 * Make sure a `sales_reps` row exists for an Identity claim set, and return it.
 *
 * Idempotent: calling it on every authenticated request writes nothing after the
 * first. It looks up by `sub` and then by email, creates only if neither matches,
 * and never overwrites an existing row's role or permissions -- those belong to
 * whoever administers the Identity account, and a token that has gone stale in
 * a browser tab must not quietly demote somebody.
 *
 * Returns null when the database is not reachable. That is deliberate: the caller
 * has already authenticated, so a database problem must not turn into a 401 and
 * lock a signed-in staff member out of the site. It degrades to "no profile",
 * which the caller can report honestly.
 */
async function ensureStaffProfile(claims) {
  if (!claims || !claims.sub || !claims.email) return null;

  try {
    const existing =
      (await DatabaseService.getSalesRep(claims.sub)) ||
      (await DatabaseService.getSalesRepByEmail(claims.email));
    if (existing) return existing;

    const { first_name, last_name } = splitName(
      (claims.user_metadata && claims.user_metadata.full_name) || claims.name,
      claims.email
    );
    const roles = rolesOf(claims);

    return await DatabaseService.createSalesRep({
      // The Identity subject, so the id is stable for the life of the account.
      id: claims.sub,
      first_name,
      last_name,
      email: claims.email,
      role: roles[0] || 'viewer',
      status: 'active',
      permissions: permissionsFor(claims),
      // No password. Identity owns authentication; there is nothing to hash.
    });
  } catch (error) {
    // A profile that cannot be written is a degraded feature, not a failed
    // login. The claim set is already verified, so the caller is signed in.
    console.error('[staff-profile] could not provision profile:', error.message);
    return null;
  }
}

module.exports = {
  ensureStaffProfile,
  permissionsFor,
  splitName,
  rolesOf,
  ALL_PERMISSIONS,
  PERMISSIONS_BY_ROLE,
};
