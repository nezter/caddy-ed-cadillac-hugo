/**
 * request-path.js -- work out which route a function invocation is asking for.
 *
 * THE BUG THIS FIXES
 * ------------------
 * Seven functions routed like this:
 *
 *     const path = event.path.replace('/.netlify/functions/followup-campaigns', '');
 *     switch (`${event.httpMethod} ${path}`) {
 *       case 'GET /':  ...
 *
 * The bare function path is `/.netlify/functions/followup-campaigns`. Strip the
 * function's own name off the front and what is left is the EMPTY STRING, not
 * `/`. So the switch was asked about `"GET "` and fell through to `default:`,
 * which returns 404.
 *
 * `case 'GET /'` was unreachable. Not "rarely reached" -- unreachable. The
 * collection endpoints (list campaigns, search customers, list interactions) had
 * no working URL, and the tests for them were failing on exactly that 404 while
 * the sub-resource tests, which set an explicit path like `.../stats`, passed.
 *
 * That is the shape of a bug that gets blamed on the tests. It is not a test
 * bug: on Netlify, invoking a function with no sub-path gives you exactly this
 * path, so `GET /.netlify/functions/followup-campaigns` really did 404 in
 * production. The function was deployed and could not be listed from.
 *
 * WHAT THIS DOES
 * --------------
 * One place that answers "what is the route" for every function, so the answer
 * cannot drift between them again.
 *
 * `route(event, 'followup-campaigns')` returns a sub-path that is either `/` or
 * starts with `/`, so `${method} ${route}` produces `GET /`, `GET /stats`,
 * `POST /abc/activate` -- every form the switches already had cases for.
 */

/**
 * The sub-path a function was invoked on.
 *
 * @param {object} event   the Netlify function event
 * @param {string} name    the function's own directory name
 * @returns {string} '/' for the bare function, otherwise '/a/b/c'
 */
function route(event, name) {
  // `event.path` is not always present -- a direct invoke may only set
  // `rawUrl` or `rawQuery`. Fall back through the shapes rather than trusting
  // one, and treat "nothing usable" as the root route, which is what a bare
  // invocation is.
  const raw = (event && (event.path || event.rawUrl || event.rawPath)) || '/';

  // Strip the query string if one arrived glued to the path.
  const withoutQuery = String(raw).split('?')[0];

  const mount = `/.netlify/functions/${name}`;
  let sub;
  if (withoutQuery === mount || withoutQuery === mount + '/') {
    sub = '';
  } else if (withoutQuery.startsWith(mount + '/')) {
    sub = withoutQuery.slice(mount.length);
  } else if (withoutQuery.startsWith('/.netlify/functions/')) {
    // Invoked through a path that is not this function's own mount point --
    // a redirect or a rewrite. Anything after the function segment is the route.
    const rest = withoutQuery.slice('/.netlify/functions/'.length);
    const slash = rest.indexOf('/');
    sub = slash === -1 ? '' : rest.slice(slash);
  } else {
    // No function segment at all. Treat the whole thing as the route.
    sub = withoutQuery;
  }

  if (!sub || sub === '/') return '/';
  return sub.startsWith('/') ? sub : `/${sub}`;
}

/** The path split into non-empty segments, for `{id}` style lookups. */
function segments(subPath) {
  return String(subPath || '')
    .split('/')
    .filter(Boolean);
}

module.exports = { route, segments };
