/**
 * CORS middleware for Netlify functions
 *
 * WHY THIS FILE HAS TWO SETS OF HEADERS
 * -------------------------------------
 * `corsHeaders` is the original: one fixed origin, credentials on. Two functions
 * still use it and it is correct for them, because both are sign-in endpoints
 * where the browser is always on the site itself.
 *
 * `originHeaders(event)` is for everything else, and it exists because three
 * functions answered `Access-Control-Allow-Origin: *` while reading tables of
 * customer names, emails and phone numbers. A wildcard is not an accident
 * waiting to happen there -- it is a public read of that table to any page on
 * the internet that cares to ask, and authentication does not help, because the
 * wildcard is what lets the *response* be read back.
 *
 * So the origin is reflected only when it is one of ours, and refused
 * otherwise. An absent Origin header is allowed deliberately: a browser always
 * sends one cross-origin, so its absence means curl, a same-origin fetch, or a
 * server-side call -- none of which is a forged cross-site request.
 */
const ALLOWED_ORIGINS = [
  'https://caddyed.com',
  'https://www.caddyed.com',
  // Deploy previews and branch deploys. Suffix match, not exact: every preview
  // gets a unique subdomain, and an exact list would break all of them on the
  // first push. Safe because a preview of THIS repository is this code and this
  // data -- an attacker cannot get a deploy of somebody else's fork onto our
  // account's domain.
];

const ORIGIN_SUFFIXES = ['.netlify.app'];

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://caddyed.com',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Auth-Token',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Max-Age': '86400'
};

/**
 * Handle CORS preflight requests
 * @param {Object} event - Netlify function event
 * @returns {Object|null} - CORS response or null if not a preflight
 */
function handleCors(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }
  return null;
}

/**
 * Add CORS headers to a response
 * @param {Object} response - Netlify function response
 * @returns {Object} - Response with CORS headers
 */
function addCorsHeaders(response) {
  return {
    ...response,
    headers: {
      ...response.headers,
      ...corsHeaders
    }
  };
}

/**
 * Is this request from an origin we answer to?
 *
 * A browser sets Origin on every cross-origin request, so a missing one is not
 * an attacker forging anything -- it is curl, a same-origin fetch, or a
 * server-side call, and all three are fine.
 */
function isAllowedOrigin(headers = {}) {
  const origin = headers.origin || headers.Origin;
  if (!origin) return true;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  try {
    const host = new URL(origin).hostname;
    return ORIGIN_SUFFIXES.some((suffix) => host.endsWith(suffix));
  } catch {
    return false;
  }
}

/**
 * CORS headers for an endpoint that may return private data.
 *
 * The origin is echoed only if we recognise it. Otherwise it is the string
 * `null`, which a browser treats as "no cross-origin access allowed" -- the
 * response is still delivered, it just cannot be read by the other page.
 *
 * `methods` defaults to what most of these endpoints need; pass a narrower list
 * where the endpoint does fewer things.
 */
function originHeaders(event, methods = 'GET, POST, PUT, DELETE, OPTIONS') {
  const headers = event && event.headers ? event.headers : {};
  return {
    'Access-Control-Allow-Origin': isAllowedOrigin(headers)
      ? headers.origin || headers.Origin || 'https://caddyed.com'
      : 'null',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json',
  };
}

module.exports = {
  handleCors,
  addCorsHeaders,
  corsHeaders,
  originHeaders,
  isAllowedOrigin,
};