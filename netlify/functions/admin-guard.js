/**
 * admin-guard.js -- the gate in front of /admin/*.
 *
 * THE PROBLEM
 * -----------
 * Hugo builds every admin page to the public directory. There is no server-side
 * gate. So anyone can load the dashboard, the lead list, the customer list and
 * the search page: the markup, the page title, the empty states, the CSS that
 * says "Sales Dashboard".
 *
 * The pages are all marked noindex, which keeps them out of search results and is
 * the only thing standing between a stranger and the shape of the business. The
 * sign-in page says so itself, in a blockquote, and has for some time.
 *
 * The data was always behind the functions -- every one of them returns 401
 * without a valid token -- so the exposure was the shell, not the records. That is
 * better than it sounds and worse than it should be: a shell is enough to
 * confirm the dealership uses this software, to enumerate what is tracked, and to
 * see a page's structure. And "the data is safe" is an argument that decays the
 * moment someone adds a server-rendered page.
 *
 * WHAT THIS DOES
 * --------------
 * netlify.toml routes /admin/* through here with a rewrite. This function:
 *
 *   - allows /admin/sign-in/ and the assets it needs, always -- a gate that
 *     locks you out of the door is not a gate
 *   - reads the session the same way every other authenticated path does, from
 *     the Authorization header OR the auth_token cookie
 *   - redirects a valid session to the real page, where Netlify serves the
 *     static file
 *   - redirects anyone else to /admin/sign-in/?next=<where they were going>
 *
 * The `next` parameter is validated against a strict same-site path pattern
 * before it is used. A login page that forwards to an arbitrary URL is an open
 * redirect, and this one builds the destination from a query string.
 *
 * WHAT IT IS NOT
 * --------------
 * Not a substitute for Netlify's own /admin/* password protection, which is a
 * dashboard toggle and happens before this function ever runs. This is the
 * version that works in the repository, with no dashboard access and no
 * assumption about which plan is active. Turn both on if the plan allows it:
 * defence in depth costs nothing here and the inner one is a 200.
 */

'use strict';

const { verifyIdentityToken, rolesFrom } = require('./utils/netlify-identity');
const { isUsableSecret } = require('./utils/jwt-secret');

const JWT_SECRET = process.env.JWT_SECRET || '';

// Never gated. The sign-in page, and anything it loads.
const OPEN = [
  '/admin/sign-in/',
  '/admin/sign-in/index.html',
];

// The gate is a 302, not a 200 rewrite, so Netlify still serves the static file
// itself. The build's caching headers, compression and CDN rules all still apply
// to the real page, rather than the function streaming a file it would have to
// read out of the bundle.
const PAGE = 'text/html; charset=utf-8';

function redirect(location, status) {
  return {
    statusCode: status || 302,
    headers: { Location: location, 'Cache-Control': 'no-store' },
    body: '',
  };
}

function notFound() {
  return {
    statusCode: 404,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    body:
      '<!doctype html><meta charset="utf-8"><title>Not found</title>' +
      '<style>body{font:16px/1.6 system-ui,sans-serif;max-width:34rem;margin:4rem auto;padding:0 1.5rem}' +
      'h1{font-size:1.4rem}</style>' +
      '<h1>Not found</h1><p>That page does not exist.</p>',
  };
}

/** Is this a path the site may serve without a session? */
function isOpen(path) {
  return OPEN.some((p) => path === p || path === p.replace(/\/$/, ''));
}

function readToken(event) {
  const headers = event.headers || {};
  const find = (name) => {
    const wanted = name.toLowerCase();
    for (const k of Object.keys(headers)) {
      if (k.toLowerCase() === wanted) return headers[k];
    }
    return undefined;
  };
  const auth = find('authorization');
  if (auth) return String(auth).replace(/^\s*bearer\s+/i, '').trim();
  const cookie = String(find('cookie') || '');
  const m = cookie.match(/(?:^|;\s*)auth_token=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

async function authenticated(token) {
  if (!token) return false;

  // Netlify Identity first -- it is the path that works with no database.
  try {
    const claims = await verifyIdentityToken(token);
    if (claims) return true;
  } catch (e) {
    // A key-fetch failure is not a decision. Fall through and let the bespoke
    // check try, rather than locking staff out.
    console.error('[admin-guard] identity check failed:', e.message);
  }

  if (!isUsableSecret(JWT_SECRET)) return false;
  try {
    // eslint-disable-next-line global-require
    const jwt = require('jsonwebtoken');
    jwt.verify(token, JWT_SECRET);
    return true;
  } catch (e) {
    return false;
  }
}

exports.handler = async function (event) {
  const raw = event.path || '/';
  // A rewrite arrives as the original path; a direct invocation may not have
  // one. Either way, this only ever guards a known prefix.
  const path = raw.split('?')[0];

  if (isOpen(path)) {
    return redirect(path, 200);
  }

  // Anything that is not under /admin is not this function's business. It
  // should not be reachable here at all, and a 404 says so more honestly than a
  // redirect to a login page.
  if (!path.startsWith('/admin')) {
    return notFound();
  }

  const token = readToken(event);

  if (await authenticated(token)) {
    /*
     * Release the browser to the real page.
     *
     * Not a 200 from this function. A 200 rewrite means the FUNCTION's response
     * IS the response, so returning an empty body here would serve a blank page
     * with a 200 -- the worst possible outcome, because it looks like the page
     * is simply empty.
     *
     * And not a 302 back to the same path, because that path is what got
     * rewritten here in the first place: the guard would redirect the browser to
     * /admin/dashboard/, the rewrite would send it straight back, and the
     * browser would spin.
     *
     * So it goes to /.__admin/<path>, which netlify.toml rewrites back to the
     * real static file and which is NOT itself guarded. One extra hop, no loop, and
     * Netlify still serves the page -- so the build's caching, compression and
     * CDN rules all still apply to the real HTML.
     */
    return redirect(path.replace(/^\/admin/, '/.__admin'), 302);
  }

  // Where were they going? Validated, because this becomes a Location header
  // built from a query string.
  const next = path.startsWith('/admin') ? path : '/admin/dashboard/';
  return redirect(`/admin/sign-in/?next=${encodeURIComponent(next)}`);
};

module.exports.READ = { isOpen, readToken };
