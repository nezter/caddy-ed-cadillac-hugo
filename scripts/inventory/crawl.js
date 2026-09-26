/**
 * crawl.js -- a deliberately restrained fetcher for the dealership's own site.
 *
 * This is the inventory source of record for this project: the dealer group's
 * own website (INVENTORY_SOURCE_URL, defaulting to their public host) is the
 * system of record for what is in stock. Everything here exists to make
 * pulling from it a good neighbour.
 *
 * Why it is built this way
 * -----------------------
 * The first attempt at this used a spoofed desktop-Chrome User-Agent. Testing
 * against the real edge shows the opposite of what that implies:
 *
 *     browser-spoofing UA  -> 429 Too Many Requests
 *     honest, identifying UA -> 200 OK
 *
 * Their CDN (Akamai) rate-limits requests that look like an unidentifiable
 * browser hammering it, and serves an honest, self-identifying bot fine. So
 * this crawler does not disguise itself. That is both more respectful and more
 * reliable, and it is what makes the rest of the controls meaningful.
 *
 * Hard controls (all enforced here, not left to the caller):
 *
 *   1. robots.txt is fetched and obeyed for every path before it is requested.
 *   2. Once per 24 hours, maximum -- applies to scheduled AND manual runs.
 *      A manual run that has already run today is a no-op with a clear message.
 *   3. Night window only (default 01:00-05:00 server local time), so a sync
 *      can never land on a customer-facing traffic peak.
 *   4. Minimum delay between requests (default 3000ms), single concurrency,
 *      and a hard cap on requests per run.
 *   5. Conditional requests (ETag / If-Modified-Since). An unchanged site costs
 *      one conditional request and no parsing or writes.
 *   6. Circuit breaker: exponential backoff on 429/5xx, Retry-After honoured,
 *      and the run aborts after consecutive failures so a bad endpoint cannot
 *      be hammered.
 *   7. Last-good payload is cached on disk, so a failed run still builds.
 *   8. Every run is appended to an audit log.
 *
 * Overrides exist for deliberate maintenance (--force) but they are loud, and
 * they are recorded.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  origin: 'https://www.cadillacofsouthcharlotte.com',
  // Self-identifying. Overridable so you can put a real contact address in it.
  userAgent:
    'caddy-ed-inventory-sync/2.0 (+https://caddyed.com; contact: ed@caddyed.com) inventory sync; once daily, off-peak',
  // The dealer's legacy JSON inventory endpoints are deprecated and return
  // {"message":"Legacy inventory endpoints are deprecated…","inventory":[]},
  // and the listing is a client-side React widget whose server-rendered cards
  // are skeleton placeholders. What the site does publish, server-side, is
  // schema.org JSON-LD on each inventory page -- complete, machine-readable,
  // and needing no JavaScript execution.
  //
  // So we request the inventory pages themselves, three small documents, once
  // a day, off-peak. See scripts/inventory/structured.js.
  paths: [
    '/new-inventory/index.htm',
    '/certified-inventory/index.htm',
    '/bargain-inventory/index.htm',
  ],
  minDelayMs: 3000,
  maxRequestsPerRun: 3,
  minIntervalHours: 24,
  windowStartHour: 1, // 01:00 local
  windowEndHour: 5, // 05:00 local
  requestTimeoutMs: 30000,
  maxConsecutiveFailures: 2,
};

const STATE_DIR = path.join(__dirname, '..', '..', 'site', 'data');
const STATE_FILE = path.join(STATE_DIR, '.inventory-sync-state.json');
const CACHE_FILE = path.join(STATE_DIR, '.inventory-cache.json');
const ROBOTS_FILE = path.join(STATE_DIR, '.inventory-robots.json');
const AUDIT_FILE = path.join(STATE_DIR, '.inventory-audit.log');

function config(overrides = {}) {
  const env = process.env;
  return {
    ...DEFAULTS,
    origin: env.INVENTORY_CRAWL_ORIGIN || DEFAULTS.origin,
    userAgent: env.INVENTORY_CRAWL_UA || DEFAULTS.userAgent,
    minDelayMs: Number(env.INVENTORY_CRAWL_DELAY_MS || DEFAULTS.minDelayMs),
    minIntervalHours: Number(env.INVENTORY_CRAWL_MIN_HOURS || DEFAULTS.minIntervalHours),
    windowStartHour: env.INVENTORY_CRAWL_WINDOW_START !== undefined
      ? Number(env.INVENTORY_CRAWL_WINDOW_START) : DEFAULTS.windowStartHour,
    windowEndHour: env.INVENTORY_CRAWL_WINDOW_END !== undefined
      ? Number(env.INVENTORY_CRAWL_WINDOW_END) : DEFAULTS.windowEndHour,
    ...overrides,
  };
}

/* --------------------------------------------------------------- state -- */

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function loadState() {
  return readJson(STATE_FILE, { lastRunAt: null, lastSuccessAt: null, runs: 0, failures: 0 });
}

function saveState(state) {
  writeJson(STATE_FILE, state);
}

function audit(entry) {
  const line = JSON.stringify({ at: new Date().toISOString(), ...entry });
  try {
    fs.mkdirSync(path.dirname(AUDIT_FILE), { recursive: true });
    fs.appendFileSync(AUDIT_FILE, line + '\n');
  } catch {
    /* auditing must never break a sync */
  }
}

/* -------------------------------------------------------------- robots -- */

/** Minimal robots.txt parser: collects the groups that could apply to us. */
function parseRobots(text, ourAgent) {
  const groups = [];
  let current = null;
  const agentToken = String(ourAgent).split('/')[0].toLowerCase();

  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();

    if (key === 'user-agent') {
      // Consecutive User-agent lines share one rule set.
      if (!current || current.disallow.length || current.allow.length) {
        current = { agents: [], disallow: [], allow: [], crawlDelay: null };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      continue;
    }
    if (!current) continue;
    if (key === 'disallow') current.disallow.push(value);
    else if (key === 'allow') current.allow.push(value);
    else if (key === 'crawl-delay') current.crawlDelay = Number(value);
  }

  // Most specific matching group wins; fall back to '*'.
  const named = groups.find((g) => g.agents.some((a) => a !== '*' && agentToken.includes(a)));
  const wildcard = groups.find((g) => g.agents.includes('*'));
  const group = named || wildcard;
  return group ? { disallow: group.disallow, allow: group.allow, crawlDelay: group.crawlDelay, matched: group.agents } : null;
}

function matchesRule(pattern, pathname) {
  // Support the * wildcard and the $ end-anchor that appear in real robots.txt.
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  const anchored = escaped.endsWith('\\$') ? `^${escaped.slice(0, -2)}$` : `^${escaped}`;
  try {
    return new RegExp(anchored).test(pathname);
  } catch {
    return false;
  }
}

function isAllowed(robots, pathname) {
  if (!robots) return true; // no rules addressed to us
  for (const rule of robots.allow) if (rule && matchesRule(rule, pathname)) return true;
  for (const rule of robots.disallow) if (rule && matchesRule(rule, pathname)) return false;
  return true;
}

async function loadRobots(cfg, { fetchImpl = fetch } = {}) {
  const cached = readJson(ROBOTS_FILE, null);
  // robots.txt is cheap and changes rarely; re-check once a day.
  if (cached && Date.now() - new Date(cached.fetchedAt).getTime() < 24 * 3600 * 1000) {
    return cached.parsed;
  }
  try {
    const res = await fetchImpl(`${cfg.origin}/robots.txt`, {
      headers: { 'user-agent': cfg.userAgent, accept: 'text/plain' },
      signal: AbortSignal.timeout(cfg.requestTimeoutMs),
    });
    if (!res.ok) return cached && cached.parsed;
    const parsed = parseRobots(await res.text(), cfg.userAgent);
    writeJson(ROBOTS_FILE, { fetchedAt: new Date().toISOString(), parsed });
    return parsed;
  } catch {
    return cached && cached.parsed;
  }
}

/* -------------------------------------------------------------- gating -- */

class GateError extends Error {
  constructor(message, hint) {
    super(message);
    this.name = 'GateError';
    this.hint = hint;
  }
}

function checkWindow(cfg, now = new Date()) {
  const h = now.getHours();
  const { windowStartHour: s, windowEndHour: e } = cfg;
  const inside = s <= e ? h >= s && h < e : h >= s || h < e;
  return { inside, hour: h };
}

function checkInterval(cfg, state, now = new Date()) {
  if (!state.lastRunAt) return { ok: true, waitedMs: 0 };
  const elapsed = now.getTime() - new Date(state.lastRunAt).getTime();
  const requiredMs = cfg.minIntervalHours * 3600 * 1000;
  return { ok: elapsed >= requiredMs, elapsedMs: elapsed, remainingMs: Math.max(0, requiredMs - elapsed) };
}

/**
 * Decide whether a run may proceed. Returns { allowed, reason, waitMs }.
 * Never throws, so callers can present the situation clearly.
 */
function gate(cfg, { force = false, now = new Date() } = {}) {
  const state = loadState();

  const interval = checkInterval(cfg, state, now);
  if (!interval.ok && !force) {
    return {
      allowed: false,
      code: 'RATE_LIMIT',
      reason: `already ran ${humanAgo(interval.elapsedMs)} ago; the minimum interval is ${cfg.minIntervalHours}h`,
      waitMs: interval.remainingMs,
      state,
    };
  }

  const win = checkWindow(cfg, now);
  if (!win.inside && !force) {
    return {
      allowed: false,
      code: 'OUTSIDE_WINDOW',
      reason:
        `outside the off-peak window (${pad(cfg.windowStartHour)}:00-${pad(cfg.windowEndHour)}:00 local); ` +
        `it is ${pad(win.hour)}:${pad(new Date().getMinutes())} local`,
      waitMs: msUntilWindow(cfg, now),
      state,
    };
  }

  return { allowed: true, forced: !interval.ok || !win.inside, state, interval, window: win };
}

function msUntilWindow(cfg, now) {
  const target = new Date(now);
  target.setMinutes(0, 0, 0);
  const { windowStartHour: s, windowEndHour: e } = cfg;
  if (now.getHours() < s) target.setHours(s);
  else if (now.getHours() >= e) { target.setHours(s); target.setDate(target.getDate() + 1); }
  return Math.max(0, target.getTime() - now.getTime());
}

/* ------------------------------------------------------------- fetching -- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CircuitBreaker {
  constructor(max) {
    this.max = max;
    this.consecutive = 0;
  }
  get tripped() { return this.consecutive >= this.max; }
  recordFailure() { this.consecutive += 1; }
  recordSuccess() { this.consecutive = 0; }
}

/**
 * Fetch the configured paths politely.
 * @returns {{results: Array, changed: boolean}}
 */
async function crawl(cfg, { force = false, fetchImpl = fetch, log = () => {} } = {}) {
  const g = gate(cfg, { force });
  if (!g.allowed) {
    const err = new GateError(`sync not run: ${g.reason}`, g);
    err.gate = g;
    throw err;
  }
  if (g.forced) {
    log(`  ${'!'.padEnd(6)} ${g.interval && !g.interval.ok
      ? `FORCED: overriding the ${cfg.minIntervalHours}h interval`
      : 'FORCED: running outside the off-peak window'}`);
    audit({ event: 'forced', reason: g.reason, intervalOk: g.interval && g.interval.ok, inWindow: g.window && g.window.inside });
  }

  const state = g.state;
  state.runs = (state.runs || 0) + 1;
  state.lastRunAt = new Date().toISOString();
  saveState(state); // claim the slot BEFORE any request, so a crash cannot
  // allow a second run in the same window.

  const robots = await loadRobots(cfg, { fetchImpl });
  if (robots) {
    log(`  robots: matched [${robots.matched.join(', ')}] — ${robots.disallow.length} disallow rule(s), ` +
        `crawl-delay ${robots.crawlDelay ?? 'unset'}`);
  } else {
    log('  robots: no rules addressed to this user-agent');
  }
  // Honour a server-declared crawl-delay if it is stricter than ours.
  const delay = Math.max(cfg.minDelayMs, (robots && robots.crawlDelay ? robots.crawlDelay * 1000 : 0));
  if (delay > cfg.minDelayMs) log(`  crawl-delay raised to ${delay}ms by robots.txt`);

  const breaker = new CircuitBreaker(cfg.maxConsecutiveFailures);
  const results = [];
  let changed = false;
  let anySuccess = false;

  for (const p of cfg.paths.slice(0, cfg.maxRequestsPerRun)) {
    const url = `${cfg.origin}${p}`;

    if (!isAllowed(robots, p)) {
      log(`  SKIP   ${p} — disallowed by robots.txt`);
      audit({ event: 'robots-disallow', path: p });
      continue;
    }

    if (results.length) await sleep(delay); // never burst

    let attempt = 0;
    for (;;) {
      try {
        const headers = { 'user-agent': cfg.userAgent, accept: 'application/json' };
        // Conditional request: an unchanged site costs one cheap 304.
        const cachedEntry = state.etags && state.etags[p];
        if (cachedEntry) {
          if (cachedEntry.etag) headers['if-none-match'] = cachedEntry.etag;
          if (cachedEntry.lastModified) headers['if-modified-since'] = cachedEntry.lastModified;
        }

        const res = await fetchImpl(url, {
          headers,
          signal: AbortSignal.timeout(cfg.requestTimeoutMs),
          redirect: 'follow',
        });

        if (res.status === 304) {
          log(`  304    ${p} — unchanged since last run`);
          audit({ event: 'not-modified', path: p });
          anySuccess = true;
          breaker.recordSuccess();
          results.push({ path: p, notModified: true });
          break;
        }

        if (res.status === 429 || res.status >= 500) {
          breaker.recordFailure();
          state.failures = (state.failures || 0) + 1;
          saveState(state);
          const retryAfter = Number(res.headers.get('retry-after')) * 1000 || 0;
          const backoff = Math.min(30000, cfg.minDelayMs * 2 ** attempt);
          const waitMs = Math.max(retryAfter, backoff);
          if (breaker.tripped) {
            log(`  BREAK  ${p} — ${res.status} and ${breaker.consecutive} consecutive failures; aborting run`);
            audit({ event: 'circuit-open', path: p, status: res.status, consecutive: breaker.consecutive });
            saveState(state);
            return { results, changed, aborted: true };
          }
          log(`  ${res.status}   ${p} — backing off ${waitMs}ms (attempt ${attempt + 1})`);
          await sleep(waitMs);
          attempt += 1;
          continue;
        }

        if (!res.ok) {
          breaker.recordFailure();
          log(`  ${res.status}   ${p} — giving up on this path`);
          audit({ event: 'http-error', path: p, status: res.status });
          results.push({ path: p, error: `HTTP ${res.status}` });
          break;
        }

        // Inventory pages are HTML, not JSON. Text is stored verbatim and parsed
        // by scripts/inventory/structured.js, so a malformed page does not throw
        // inside the rate-limited fetch loop.
        const body = await res.text();
        state.etags = state.etags || {};
        state.etags[p] = {
          etag: res.headers.get('etag') || null,
          lastModified: res.headers.get('last-modified') || null,
        };
        saveState(state);
        changed = true;
        anySuccess = true;
        breaker.recordSuccess();
        results.push({ path: p, body });
        log(`  ok     ${p} — ${res.headers.get('content-length') || '?'} bytes`);
        audit({ event: 'fetched', path: p, status: res.status });
        break;
      } catch (err) {
        breaker.recordFailure();
        state.failures = (state.failures || 0) + 1;
        saveState(state);
        if (breaker.tripped) {
          log(`  BREAK  ${p} — ${err.message}; aborting run`);
          audit({ event: 'network-error', path: p, error: err.message });
          return { results, changed, aborted: true };
        }
        const backoff = Math.min(30000, cfg.minDelayMs * 2 ** attempt);
        log(`  ERR    ${p} — ${err.message}; retrying in ${backoff}ms`);
        await sleep(backoff);
        attempt += 1;
      }
    }
  }

  if (anySuccess) {
    state.lastSuccessAt = new Date().toISOString();
    saveState(state);
  }
  return { results, changed, aborted: false };
}

/* ---------------------------------------------------------------- cache -- */

function readCache() {
  return readJson(CACHE_FILE, null);
}

function writeCache(results) {
  const usable = results.filter((r) => r.body);
  if (!usable.length) return false;
  writeJson(CACHE_FILE, { at: new Date().toISOString(), results: usable });
  return true;
}

module.exports = {
  DEFAULTS,
  GateError,
  audit,
  cacheFile: CACHE_FILE,
  config,
  crawl,
  gate,
  isAllowed,
  loadState,
  parseRobots,
  readCache,
  stateFile: STATE_FILE,
  writeCache,
};

/* ---------------------------------------------------------- utilities -- */
function pad(n) { return String(n).padStart(2, '0'); }
function humanAgo(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h >= 1) return `${h}h ${m}m`;
  if (m >= 1) return `${m}m`;
  return 'moments';
}
