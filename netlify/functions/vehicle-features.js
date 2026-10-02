/**
 * vehicle-features -- which vehicles are favourites.
 *
 * WHAT THIS IS FOR
 * ----------------
 * Ed wants to mark the cars he wants to push -- a fresh arrival, something with
 * an unusual price, a trade he wants to move. Those should be what a visitor
 * sees first on the home page, badged "Ed's pick", and the rest of the fleet
 * should be a click away rather than a scroll.
 *
 * WHY BLOBS AND NOT THE CONTENT FILES
 * -----------------------------------
 * The obvious implementation is to set `featured: true` in the vehicle's front
 * matter. That was the first one, and it is wrong for an admin control:
 *
 *   - A Netlify Function has no way to edit the repository. Writing front
 *     matter means committing from a function, which needs a deploy key or a
 *     GitHub App, and then a rebuild before anything appears on the site. A
 *     click in an admin panel that takes a build to show up is not a control,
 *     it is a deploy.
 *   - The content files are owned by the sync. A favourite written into them
 *     would be clobbered the next time that vehicle is re-normalised, because
 *     `featured` is one of the fields the sync rewrites wholesale.
 *
 * Blobs is Netlify's own key-value store, needs no connection string, and is
 * shared across deploy contexts. The front-matter flag is still honoured and
 * still wins, so a vehicle can be pinned in the repository (for something
 * seasonal) as well as toggled at runtime.
 *
 * REQUIRES A STORE
 * ---------------
 * One store, named `vehicle-features`, has to exist. Until it does, every call
 * returns an empty list and the site behaves exactly as it does with no
 * favourites set -- it degrades to the front-matter flags rather than erroring,
 * so an unconfigured store is a no-op and never a broken page.
 */

'use strict';

const STORE = 'vehicle-features';

const DatabaseService = require('./utils/database-service');
const { authenticateRequest } = require('./utils/auth-middleware');
// Was a module-level constant with `Access-Control-Allow-Origin: '*'`, shared by
// both halves of this endpoint. GET is genuinely public -- it returns vehicle
// slugs, not people -- but POST is staff-only, and one wildcard for both meant
// the admin half answered any origin too.
//
// Built per request from the caller's Origin instead. GET still works for every
// visitor because site/assets/js/ed-picks.js runs on our own pages.
const { originHeaders } = require('./utils/cors-middleware');

const corsFor = (event) => ({
  ...originHeaders(event, 'GET, POST, OPTIONS'),
  'Cache-Control': 'no-store',
});

/**
 * Read the set of favourited slugs.
 *
 * A missing store, an unconfigured context, or a malformed record all return an
 * empty set. None of them is worth a 500: the feature is a preference, and a
 * failed preference read should leave the page as it would have been without
 * the feature.
 */
async function readFavourites() {
  if (!DatabaseService.isDatabaseConfigured()) return { slugs: [], source: 'unavailable' };
  try {
    // A row per vehicle rather than one document holding a list.
    //
    // The list-in-one-document shape is a read-modify-write on every toggle, so
    // two people starring different vehicles at the same moment lost one of the
    // two. A row per vehicle makes the read a SELECT and the write an INSERT,
    // and they do not collide.
    const result = await DatabaseService.query(
      'SELECT slug FROM vehicle_favourites WHERE featured = 1 ORDER BY slug'
    );
    return { slugs: result.rows.map((r) => r.slug), source: 'database' };
  } catch (e) {
    console.error('[vehicle-features] read failed:', e.message);
    return { slugs: [], source: 'absent' };
  }
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsFor(event), body: '' };
  }

  try {
    if (event.httpMethod === 'GET') {
      const { slugs, source } = await readFavourites();
      return {
        statusCode: 200,
        headers: corsFor(event),
        body: JSON.stringify({ favourites: slugs, source }),
      };
    }

    if (event.httpMethod === 'POST') {
      // STAFF ONLY. GET above deliberately stays public -- site/assets/js/ed-picks.js
      // reads this on every inventory page for every visitor, and the whole point
      // of it is to be public.
      //
      // But POST is the other half of the same table, and it was open. That
      // endpoint is the admin's control over what the site calls "Ed's pick":
      // site/assets/js/favourites-admin.js is the only legitimate writer, and it
      // sends a staff token. Without the check, anyone could POST a slug and add
      // or remove cars from the dealership's own editorial list -- badge every car
      // on the lot as a recommendation, or empty the list.
      //
      // The slug regex just below was clearly written with the threat in mind --
      // "cannot be used as an arbitrary-write store" -- so the author was thinking
      // about who could write here. What was missed is that it was anyone.
      const auth = await authenticateRequest(event, {
        requireAuth: true,
        allowedRoles: ['admin', 'manager', 'sales_rep'],
      });
      if (!auth.authenticated) {
        return {
          statusCode: auth.error?.statusCode || 401,
          headers: corsFor(event),
          body: JSON.stringify({
            error: 'Sign in to change the vehicle picks',
            code: 'unauthenticated',
          }),
        };
      }

      if (!DatabaseService.isDatabaseConfigured()) {
        return {
          statusCode: 503,
          headers: corsFor(event),
          body: JSON.stringify({
            error: 'Favourites storage is not configured on this site.',
            detail: 'Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN to enable this.',
          }),
        };
      }

      let payload = {};
      try {
        payload = JSON.parse(event.body || '{}');
      } catch (e) {
        return {
          statusCode: 400,
          headers: corsFor(event),
          body: JSON.stringify({ error: 'Invalid JSON body' }),
        };
      }

      const slug = String(payload.slug || '').trim();
      if (!slug) {
        return {
          statusCode: 422,
          headers: corsFor(event),
          body: JSON.stringify({ error: 'slug is required' }),
        };
      }

      // Only allow a slug that looks like one of our content files, so this
      // endpoint cannot be used as an arbitrary-write store.
      if (!/^[a-z0-9][a-z0-9-]{0,120}$/i.test(slug)) {
        return {
          statusCode: 422,
          headers: corsFor(event),
          body: JSON.stringify({ error: 'slug contains characters a vehicle page cannot have' }),
        };
      }

      // Read-then-write, but on a ROW rather than a document, so two people
      // toggling different vehicles cannot lose one another's change.
      const { slugs } = await readFavourites();
      const on = payload.featured === undefined ? !slugs.includes(slug) : Boolean(payload.featured);

      if (on) {
        await DatabaseService.query(
          `INSERT INTO vehicle_favourites (slug, featured, updated_at)
           VALUES ($1, 1, datetime('now'))
           ON CONFLICT (slug) DO UPDATE SET featured = 1, updated_at = datetime('now')`,
          [slug]
        );
      } else {
        await DatabaseService.query(
          `INSERT INTO vehicle_favourites (slug, featured, updated_at)
           VALUES ($1, 0, datetime('now'))
           ON CONFLICT (slug) DO UPDATE SET featured = 0, updated_at = datetime('now')`,
          [slug]
        );
      }

      const { slugs: next } = await readFavourites();

      return {
        statusCode: 200,
        headers: corsFor(event),
        body: JSON.stringify({ slug, featured: on, favourites: next }),
      };
    }

    return {
      statusCode: 405,
      headers: corsFor(event),
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: corsFor(event),
      body: JSON.stringify({ error: 'Favourites store failed', detail: String(err.message) }),
    };
  }
};
