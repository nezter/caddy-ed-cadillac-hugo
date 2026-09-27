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

// Required lazily, inside the handler. A top-level require of a module that is
// not installed would take the whole function down at load time, and this file
// is bundled independently of whether Blobs is configured.
let blobs = null;
function getBlobs() {
  if (blobs) return blobs;
  try {
    // eslint-disable-next-line global-require
    blobs = require('@netlify/blobs');
    return blobs;
  } catch (e) {
    return null;
  }
}

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store',
};

/**
 * Read the set of favourited slugs.
 *
 * A missing store, an unconfigured context, or a malformed record all return an
 * empty set. None of them is worth a 500: the feature is a preference, and a
 * failed preference read should leave the page as it would have been without
 * the feature.
 */
async function readFavourites() {
  const b = getBlobs();
  if (!b) return { slugs: [], source: 'unavailable' };
  try {
    const store = b.getStore(STORE);
    const entry = await store.get('favourites', { type: 'json' });
    const list = entry && Array.isArray(entry.slugs) ? entry.slugs : [];
    return { slugs: list, source: 'blobs' };
  } catch (e) {
    return { slugs: [], source: 'absent' };
  }
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  try {
    if (event.httpMethod === 'GET') {
      const { slugs, source } = await readFavourites();
      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({ favourites: slugs, source }),
      };
    }

    if (event.httpMethod === 'POST') {
      const b = getBlobs();
      if (!b) {
        return {
          statusCode: 503,
          headers: CORS,
          body: JSON.stringify({
            error: 'Favourites storage is not configured on this site.',
            detail: 'Create a Blobs store named "vehicle-features" to enable this.',
          }),
        };
      }

      let payload = {};
      try {
        payload = JSON.parse(event.body || '{}');
      } catch (e) {
        return {
          statusCode: 400,
          headers: CORS,
          body: JSON.stringify({ error: 'Invalid JSON body' }),
        };
      }

      const slug = String(payload.slug || '').trim();
      if (!slug) {
        return {
          statusCode: 422,
          headers: CORS,
          body: JSON.stringify({ error: 'slug is required' }),
        };
      }

      // Only allow a slug that looks like one of our content files, so this
      // endpoint cannot be used as an arbitrary-write store.
      if (!/^[a-z0-9][a-z0-9-]{0,120}$/i.test(slug)) {
        return {
          statusCode: 422,
          headers: CORS,
          body: JSON.stringify({ error: 'slug contains characters a vehicle page cannot have' }),
        };
      }

      const { slugs } = await readFavourites();
      const set = new Set(slugs);
      const on = payload.featured === undefined ? !set.has(slug) : Boolean(payload.featured);
      if (on) set.add(slug);
      else set.delete(slug);

      const next = [...set].sort();
      const store = b.getStore(STORE);
      await store.setJSON('favourites', {
        slugs: next,
        updatedAt: new Date().toISOString(),
      });

      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({ slug, featured: on, favourites: next }),
      };
    }

    return {
      statusCode: 405,
      headers: CORS,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: 'Favourites store failed', detail: String(err.message) }),
    };
  }
};
