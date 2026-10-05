/**
 * site-settings.js -- the copy an admin can change during business hours.
 *
 * WHAT THIS IS FOR
 * ----------------
 * The Decap CMS commits to git. This site deploys PREBUILT -- netlify.toml sets
 * `[build] command = ""` -- so a CMS save produces a commit and NO build, and
 * the change stays unpublished until someone runs a build. An editor pressing
 * Save and seeing "Saved" is the failure mode, not a feature.
 *
 * So the values that genuinely need to change during the day live in the
 * database, and this serves them to the front end at request time. No build, no
 * Netlify build minutes, and the change is live on the next page load.
 *
 * WHAT IS NOT HERE
 * ----------------
 * Page content. Inventory and specials are the pages search traffic lands on,
 * and a value injected by JavaScript is invisible to a crawler, so those have
 * to be in the served HTML and therefore need a build. Moving them here would
 * trade a working search presence for convenience. See docs/ADMIN.md.
 *
 * READS ARE PUBLIC, WRITES ARE NOT
 * ---------------------------------
 * GET serves only `is_public = 1` rows, and only ever those. It takes no auth,
 * because the front end has no session and must be able to read the signage.
 * That is why the public flag is a column rather than a convention: the refusal
 * happens in the SQL, so a setting cannot be published by forgetting to filter
 * it in JavaScript.
 *
 * PUT and DELETE require a session and `preferences_write`.
 *
 * WHY IT FAILS LOUDLY WHEN THE DATABASE IS ABSENT
 * ------------------------------------------------
 * A missing database returns 503 with a reason, never an empty object. An empty
 * object and "there is no configuration" look identical to the caller, and the
 * page would render its built-in copy believing that was current -- which is
 * the same class of bug as a silent Blobs read, and as the CMS itself.
 */

'use strict';

const DatabaseService = require('./utils/database-service');
const { authenticateRequest, optionalAuthenticateRequest } = require('./utils/auth-middleware');
const AuditLog = require('./utils/audit-log');

const CORS = {
  'Content-Type': 'application/json',
  // Locked to the site rather than '*'.
  //
  // A write endpoint with `Access-Control-Allow-Origin: *` will accept a request
  // from any page in the world. A staff member signed into caddyed.com who visits
  // a hostile page would have that page able to post to this. The origin is
  // echoed only when it matches.
  'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Cache-Control': 'no-store',
};

const ALLOWED_ORIGINS = [
  'https://caddyed.com',
  'https://www.caddyed.com',
  // The Netlify lanes this repo runs. The shared cors-middleware already
  // accepts any *.netlify.app origin; this endpoint keeps an exact list on
  // purpose, so every lane that should be trusted is named here -- the CI
  // dev lane (deploy-dev.yml, alias `dev`) and the older deploy-preview
  // lane. Same-origin admin usage sends no Origin header and is unaffected;
  // this list is what the cross-origin paths check.
  'https://deploy-preview--vibrant-ritchie-0cef93.netlify.app',
  'https://dev--vibrant-ritchie-0cef93.netlify.app',
];

/**
 * Which keys this endpoint will write.
 *
 * An allowlist, because this is a public-origin-adjacent write path. A key that
 * is not named here is refused rather than created, so this endpoint cannot be
 * turned into a general-purpose key/value store for whatever a caller likes.
 *
 * Each key is seeded with the value it overrides, so a row is not a blank that
 * the site renders as an empty string. The seed is the CURRENTLY BUILT value --
 * so if the database is unreachable, the page keeps showing today's copy, and
 * the row is not pretending to be the source of it.
 */
const KEYS = {
  'signage.heading': {
    kind: 'text', appliesTo: 'signage', label: 'Stay-connected heading',
    seed: 'Stay connected to Ed, between visits',
  },
  'signage.intro': {
    kind: 'textarea', appliesTo: 'signage', label: 'Stay-connected intro',
    seed: 'New stock lands here as it arrives, alongside what Ed is posting on Facebook and X. Ask about any vehicle without leaving the page, or set an alert for the one you are waiting on.',
  },
  'signage.alerts_heading': {
    kind: 'text', appliesTo: 'signage', label: 'Stock-alert heading',
    seed: 'Get an email when stock lands',
  },
  'signage.alerts_body': {
    kind: 'textarea', appliesTo: 'signage', label: 'Stock-alert body',
    seed: 'Used only for stock alerts from Ed. Nothing else, ever.',
  },
  'home.hero_heading': {
    kind: 'text', appliesTo: 'home', label: 'Home hero heading',
    seed: 'Find the Cadillac you actually want.',
  },
  'footer.tagline': {
    kind: 'textarea', appliesTo: 'footer', label: 'Footer tagline',
    seed: 'Luxury Cadillac sales and factory-trained service in South Charlotte. One person, start to finish.',
  },
  'banner.text': {
    kind: 'text', appliesTo: 'global', label: 'Site-wide banner (empty = off)',
    seed: '',
  },
  'banner.tone': {
    kind: 'text', appliesTo: 'global', label: 'Banner tone (info | warn)',
    seed: 'info',
  },
};

/* WHY THE LIST SHRANK (2026-10)
 *
 * It used to carry phone/email/SMS chip labels, a public email and an
 * hours note. None of those had an element carrying its data-setting
 * attribute, so every one of them was a control that changed nothing --
 * and the two chip seeds did not even match the copy on the page. They
 * are gone. A settings page is a promise; a key with no element is a
 * broken one wearing a badge.
 *
 * The email and hours are still not editable here for a mechanical reason
 * worth stating: both appear inside mailto:/tel: HREFS as well as as text
 * (the footer link, the contact-page link, the stay-connected chip). The
 * apply script only rewrites textContent, by design -- so changing the
 * text without the href would show one address and dial another. When a
 * href-aware apply exists, they come back. See docs/ADMIN.md.
 *
 * Every key above is verified: the build script checks that a non-banner
 * key has at least one [data-setting] element in the built HTML. */

function isAllowedOrigin(headers = {}) {
  const origin = headers.origin || headers.Origin;
  // No Origin header: same-origin fetch, curl, or a server-side call. Allowed --
  // a browser always sends Origin on a cross-origin request, so its absence is
  // not a way to forge one.
  if (!origin) return true;
  return ALLOWED_ORIGINS.includes(origin);
}

function json(status, body, headers = {}) {
  return { statusCode: status, headers: { ...CORS, ...headers }, body: JSON.stringify(body) };
}

/** Rows -> the shape the front end consumes. */
function toSetting(row) {
  return {
    key: row.key,
    value: row.value === null || row.value === undefined ? '' : row.value,
    kind: row.kind,
    label: row.label,
    appliesTo: row.applies_to,
    isPublic: row.is_public === 1,
    isBlank: row.is_blank === 1,
    updatedBy: row.updated_by || null,
    updatedAt: row.updated_at || null,
  };
}

/** The built-in defaults, so a caller always gets a complete set. */
function defaults() {
  return Object.entries(KEYS).map(([key, def]) => ({
    key,
    value: def.seed,
    kind: def.kind,
    label: def.label,
    appliesTo: def.appliesTo,
    isPublic: true,
    isBlank: !def.seed,
    updatedBy: null,
    updatedAt: null,
    isSeed: true,
  }));
}

async function readPublic() {
  if (!DatabaseService.isDatabaseConfigured()) {
    return { configured: false, settings: defaults() };
  }
  const result = await DatabaseService.query(
    `SELECT * FROM site_settings WHERE is_public = 1 ORDER BY applies_to, key`
  );
  const stored = result.rows.map(toSetting);
  // Merge over the defaults, so a key with no row still comes back with the
  // copy the build shipped. A partial set is the normal case on day one.
  const byKey = new Map(stored.map((s) => [s.key, s]));
  return {
    configured: true,
    settings: defaults().map((d) => byKey.get(d.key) || d),
  };
}

async function readAll() {
  const result = await DatabaseService.query('SELECT * FROM site_settings ORDER BY applies_to, key');
  const byKey = new Map(result.rows.map((r) => [toSetting(r).key, toSetting(r)]));
  return defaults().map((d) => byKey.get(d.key) || d);
}

exports.handler = async (event) => {
  const headers = event.headers || {};

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: { ...CORS, 'Access-Control-Allow-Origin': isAllowedOrigin(headers) ? headers.origin || '*' : 'null' },
      body: '',
    };
  }

  if (!isAllowedOrigin(headers)) {
    return json(403, { error: 'origin-not-allowed' });
  }

  try {
    // ------------------------------------------------------------------ GET
    if (event.httpMethod === 'GET') {
      // A signed-in staff member asking for the whole set gets the internal
      // rows too; an anonymous caller only ever gets the public ones, and that
      // decision is made by the WHERE clause rather than by filtering after.
      const auth = await optionalAuthenticateRequest(event);
      // `permissions` on the returned user, not a `.can()` method: the
      // middleware returns a plain object and no such helper exists. Inventing
      // one here would have made this branch silently false, so the internal
      // settings would never have been returned to the one caller entitled to
      // see them -- a failure that looks like "the feature just isn't there".
      const perms = (auth.user && auth.user.permissions) || [];
      if (auth.authenticated && perms.includes('preferences_read')) {
        return json(200, { configured: DatabaseService.isDatabaseConfigured(), settings: await readAll() });
      }
      const payload = await readPublic();
      if (!payload.configured) {
        // Loud, not an empty object. An empty settings object and "there is no
        // configuration" are indistinguishable to the caller, and the page
        // would render its built-in copy believing it current.
        console.error('[site-settings] no database configured; serving built-in copy');
      }
      return json(payload.configured ? 200 : 503, {
        configured: payload.configured,
        settings: payload.settings,
        ...(payload.configured ? {} : { error: 'database-not-configured' }),
      });
    }

    // ----------------------------------------------------------------- PUT
    if (event.httpMethod === 'PUT' || event.httpMethod === 'POST') {
      const auth = await authenticateRequest(event, {
        requireAuth: true,
        requiredPermissions: ['preferences_write'],
      });
      if (!auth.authenticated) return auth.error;

      let body;
      try {
        body = JSON.parse(event.body || '{}');
      } catch {
        return json(400, { error: 'invalid-json' });
      }

      const incoming = body.settings && typeof body.settings === 'object' ? body.settings : body;
      const entries = Object.entries(incoming).filter(([k]) => k !== 'settings');
      if (!entries.length) return json(422, { error: 'no settings supplied' });

      const unknown = entries.map(([k]) => k).filter((k) => !KEYS[k]);
      if (unknown.length) {
        // Refused, not created. An unlisted key would make this a general
        // key/value store reachable from a public origin.
        return json(422, { error: 'unknown-setting', unknown, allowed: Object.keys(KEYS) });
      }

      if (!DatabaseService.isDatabaseConfigured()) {
        return json(503, { error: 'database-not-configured' });
      }

      // Read the current values BEFORE the upsert. An audit row that records only
      // the new value cannot answer "what did it say before?", which is the
      // question a banner that appeared and vanished actually turns on.
      const before = {};
      for (const [key] of entries) {
        try {
          const prior = await DatabaseService.query(
            'SELECT value FROM site_settings WHERE key = $1 LIMIT 1', [key]
          );
          before[key] = prior.rows && prior.rows[0] ? prior.rows[0].value : null;
        } catch {
          // A read failure must not block a write. The audit row then records
          // `null`, which says "we do not know", rather than a wrong old value.
          before[key] = null;
        }
      }

      const saved = [];
      for (const [key, value] of entries) {
        const def = KEYS[key];
        const text = value === null || value === undefined ? '' : String(value);
        if (text.length > 2000) {
          return json(422, { error: 'value-too-long', key, max: 2000 });
        }
        await DatabaseService.query(
          `INSERT INTO site_settings
             (key, value, kind, label, applies_to, is_public, is_blank, updated_by, updated_at)
           VALUES ($1, $2, $3, $4, $5, 1, $6, $7, datetime('now'))
           ON CONFLICT (key) DO UPDATE SET
             value      = excluded.value,
             is_blank   = excluded.is_blank,
             updated_by = excluded.updated_by,
             updated_at = datetime('now')`,
          [key, text, def.kind, def.label, def.appliesTo, text.trim() === '' ? 1 : 0, auth.user.id]
        );
        saved.push(key);
      }

      // A setting changes what the public site says. That is worth a record even
      // though it is reversible -- a banner that appears and nobody remembers
      // setting it is indistinguishable from a bug.
      //
      // Keys and old/new values, no customer data: site_settings holds signage
      // and contact copy, not people.
      await AuditLog.record(DatabaseService, {
        action: AuditLog.ACTIONS.SETTINGS_UPDATE,
        entityType: 'site_settings',
        entityId: saved.join(','),
        actor: auth.user,
        detail: {
          keys: saved,
          before: Object.fromEntries(
            saved.map((k) => [k, (before[k] && before[k].value) || null])
          ),
          after: Object.fromEntries(entries.filter(([k]) => saved.includes(k))),
        },
        rowsAffected: saved.length,
        context: event,
      });

      return json(200, { saved, settings: await readAll() });
    }

    // -------------------------------------------------------------- DELETE
    if (event.httpMethod === 'DELETE') {
      const auth = await authenticateRequest(event, {
        requireAuth: true,
        requiredPermissions: ['preferences_write'],
      });
      if (!auth.authenticated) return auth.error;

      let body;
      try {
        body = JSON.parse(event.body || '{}');
      } catch {
        return json(400, { error: 'invalid-json' });
      }
      if (!KEYS[body.key]) return json(422, { error: 'unknown-setting', key: body.key });
      if (!DatabaseService.isDatabaseConfigured()) {
        return json(503, { error: 'database-not-configured' });
      }
      // A delete returns the key to its built-in copy rather than removing the
      // setting, because the front end always merges over the seeds. Deleting a
      // row and blanking a row have to mean the same thing.
      await DatabaseService.query('DELETE FROM site_settings WHERE key = $1', [body.key]);
      return json(200, { reset: body.key, settings: await readAll() });
    }

    return json(405, { error: 'method-not-allowed' });
  } catch (error) {
    console.error('[site-settings]', error && error.message);
    return json(500, { error: 'internal', detail: String(error && error.message) });
  }
};

exports.KEYS = KEYS;
