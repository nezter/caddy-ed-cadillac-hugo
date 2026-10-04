#!/usr/bin/env node

/**
 * inventory:sync -- pull vehicle inventory into Hugo content.
 *
 *   npm run inventory:sync                       # uses INVENTORY_SOURCE_URL
 *   npm run inventory:sync -- --dry-run          # show the plan, write nothing
 *   npm run inventory:sync -- --source file --file site/data/inventory.json
 *   npm run inventory:sync -- --validate         # check managed files only
 *   npm run inventory:sync -- --prune            # remove managed files not in the feed
 *   npm run inventory:sync -- --no-prune         # keep sold vehicles (default)
 *
 * Safety model
 * ------------
 *   - Only files carrying the `inventory_sync` marker are ever written or
 *     removed. Hand-written pages in site/content/inventory/ are untouched.
 *   - Existing prose is carried over, so a sync never wipes copy.
 *   - Unchanged vehicles are not rewritten, so a no-op sync produces no diff.
 *   - --dry-run is the default mental model; nothing lands without --write or
 *     without being the normal path.
 *
 * There is no built-in default source. The previous tooling defaulted to
 * scraping another dealership's inventory widget (which answers 403, and is not
 * ours to read). Set INVENTORY_SOURCE_URL to a feed you control, or pass a file.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { normalise, ValidationError, slugify, MANAGED_MARKER } = require('./schema');
const { fromFile, fromHttp, availabilityOf } = require('./sources');
const syncState = require('./sync-state');
const vehicleOps = require('./vehicle-ops');
const crawler = require('./crawl');
const images = require('./images');
const { ensureDir, listManaged, contentPath, render, parseFrontMatter } = require('./content');

/* ---------------------------------------------------------------- args -- */
function parseArgs(argv) {
  const args = { dryRun: false, prune: false, validate: false, source: null, file: null, write: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dry-run' || a === '-n') args.dryRun = true;
    else if (a === '--write' || a === '-w') args.write = true;
    else if (a === '--force') args.force = true;
    else if (a === '--window') args.window = true;
    else if (a === '--prune') args.prune = true;
    else if (a === '--no-prune') args.prune = false;
    else if (a === '--validate') args.validate = true;
    else if (a === '--source') args.source = argv[++i];
    else if (a === '--file' || a === '-f') args.file = argv[++i];
    // --refresh <slug|vin>  check one specific vehicle instead of a full scan
    else if (a === '--refresh') args.refresh = argv[++i];
    // --disable <slug|vin>  take a vehicle off the site by hand
    else if (a === '--disable') args.disable = argv[++i];
    // --enable <slug|vin>   put a hand-disabled vehicle back on
    else if (a === '--enable') args.enable = argv[++i];
    // --check-status         report which vehicles are available, sold or
    //                         no longer listed, without fetching the feed
    else if (a === '--check-status') args.checkStatus = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else if (!a.startsWith('-')) args.file = args.file || a;
  }
  return args;
}

const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', cyan: '\x1b[36m',
};
const log = (m = '') => console.log(m);
const ok = (m) => console.log(`  ${C.green}ok${C.reset}    ${m}`);
const warn = (m) => console.log(`  ${C.yellow}warn${C.reset}  ${m}`);
const bad = (m) => console.log(`  ${C.red}fail${C.reset}  ${m}`);
const info = (m) => console.log(`  ${C.dim}${m}${C.reset}`);

function usage() {
  log(`
${C.bold}inventory:sync${C.reset} — pull vehicle inventory into Hugo content

  --source file|http     where to read from (default: http)
  --file, -f <path>      local JSON source
  --dry-run, -n          report the plan, write nothing
  --write, -w            no-op (writing is the default; use --dry-run to skip)
  --force                bypass the once-a-day limit and the off-peak window (logged)
  --window               skip the gate check and fetch the window status only
  --prune                delete managed vehicles that left the feed
  --validate             only validate what is already on disk
  --check-status         report what is available / sold / held off, from disk
  --refresh <slug|vin>   check ONE vehicle against the feed
  --disable <slug|vin>   hold a vehicle off the site by hand
  --enable  <slug|vin>   put a hand-held vehicle back on
  --help, -h

  The --check-status / --refresh / --disable / --enable modes touch one vehicle
  (or nothing at all) and are NOT subject to the once-a-day or night-window
  gates, because they are not a full scrape of the dealer's site. --refresh
  does make one feed request; --check-status and --disable make none.

  A hand-held vehicle stays off the site until re-enabled, even if the feed
  still lists it. The feed is the record of what is in stock; it is not the
  record of what this site should show.

Source (in order of preference):
  1. default              the dealer group's own site, pulled politely
  2. --source http        INVENTORY_SOURCE_URL, a feed you control
  3. --source file        a local JSON file (fixtures, offline)

  The default source is rate-limited to one pull per 24h inside an off-peak
  window, honours robots.txt, sends conditional requests, identifies itself
  honestly, and aborts rather than retrying a failing endpoint repeatedly.
  Each family (new / certified / bargain) is PAGINATED -- the crawler follows
  the site's own ?start= links, 24 vehicles at a time, in small batches with
  a pause between batches, so a full sweep is a slow dribble, never a burst.

Env:
  INVENTORY_SOURCE_URL    feed for --source http
  INVENTORY_SOURCE_TOKEN  bearer token for that feed
  INVENTORY_CRAWL_ORIGIN  dealer site origin (default: the dealer group's site)
  INVENTORY_CRAWL_UA      user agent; put a real contact address in it
  INVENTORY_CRAWL_MIN_HOURS      minimum hours between pulls (default 24)
  INVENTORY_CRAWL_WINDOW_START   off-peak window start hour (default 1)
  INVENTORY_CRAWL_WINDOW_END     off-peak window end hour   (default 5)
  INVENTORY_CRAWL_DELAY_MS        min delay between requests (default 3000)
  INVENTORY_CRAWL_BATCH           requests per batch (default 4)
  INVENTORY_CRAWL_BATCH_PAUSE_MS  pause between batches (default 30000)
  INVENTORY_CRAWL_JITTER_MS       random extra per-request delay (default 1200)
  INVENTORY_CRAWL_MAX_PAGES       pagination guard per family (default 12)
`);
}

/**
 * Load from the dealer group's own site, through the gated crawler.
 *
 * Falls back to the last cached payload when the site is unreachable or has not
 * changed, so a flaky edge never blocks a build.
 */
async function loadFromCrawl(args) {
  const cfg = crawler.config();
  const { results, changed, aborted, completedFamilies } = await crawler.crawl(cfg, {
    force: args.force,
    log: (m) => log(m),
  });

  const usable = results.filter((r) => r.body);

  if (!usable.length) {
    const cached = crawler.readCache();
    if (cached && cached.results) {
      warn(`nothing new from the site; using the cache from ${new Date(cached.at).toLocaleString()}`);
      return shape(cached.results, 'cache', 'last good crawl');
    }
    if (aborted) throw new Error('aborted after repeated failures and no cached payload is available');
    throw new Error('no inventory data returned and no cache exists yet');
  }

  if (changed) crawler.writeCache(results, { completedFamilies });
  return shape(usable, 'crawl', cfg.origin);
}

function shape(results, source, location) {
  // The dealer's inventory pages carry schema.org JSON-LD, which is the only
  // complete server-rendered representation (the JSON API is deprecated and the
  // React widget ships skeleton placeholders). A family may arrive as several
  // pages now -- crawl.js follows the site's own ?start= pagination -- so every
  // result is parsed and the family rides along to carry the condition.
  const { parseInventoryPage, DEFAULT_PAGES } = require('./structured');
  const vehicles = results.flatMap((r) => {
    const meta = r.family
      ? { condition: r.family }
      : DEFAULT_PAGES.find((p) => p.path === r.path) || {};
    return parseInventoryPage(r.body, { condition: meta.condition }).records;
  });
  if (!vehicles.length) {
    throw new Error(
      'the site responded but the payload contained no recognisable vehicle list. ' +
      'The dealer site layout has probably changed -- dump the response and check it ' +
      'against scripts/inventory/sources.js extractList().'
    );
  }
  return { vehicles, meta: { source, location, count: vehicles.length } };
}

/* ------------------------------------------------------------ validate -- */
function validateOnDisk() {
  const managed = listManaged();
  log(`\n${C.bold}Validating${C.reset} ${managed.size} managed vehicle file(s) in site/content/inventory/`);
  if (!managed.size) {
    warn('no managed files yet — run a sync first');
    return false;
  }
  let badCount = 0;
  for (const [slug, entry] of managed) {
    const text = fs.readFileSync(entry.path, 'utf8');
    const { data } = parseFrontMatter(text);
    const problems = [];
    const advisories = [];
    if (!data.title) problems.push('no title');
    if (data.price !== undefined && data.price !== '' && Number.isNaN(Number(data.price))) {
      problems.push(`price "${data.price}" is not a number`);
    }
    // No image is normal for a vehicle awaiting photography -- the
    // vehicle-image partial substitutes a bundled placeholder, so this is worth
    // flagging but is not a failure.
    if (!data.image) advisories.push('no image (placeholder will be used)');
    if (!data.status) advisories.push('no status');

    if (problems.length) {
      bad(`${slug}: ${problems.join('; ')}`);
      badCount += 1;
    } else {
      ok(slug);
      for (const a of advisories) warn(`  ${slug}: ${a}`);
    }
  }
  log(badCount ? `\n  ${badCount} file(s) failed validation\n` : '\n  all managed files are valid\n');
  return badCount === 0;
}

/* ---------------------------------------------------------------- main -- */
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return usage();

  if (args.validate) {
    process.exitCode = validateOnDisk() ? 0 : 1;
    return;
  }

  // Targeted, per-vehicle modes. These bypass the full sync entirely: they
  // touch one vehicle, or read what is already on disk, so they are safe to
  // run at any time -- including during the day, which the crawl gate
  // deliberately forbids for a full sync.
  if (args.checkStatus || args.disable || args.enable || args.refresh) {
    vehicleOps.setArgs(args);
    log(`\n${C.bold}Targeted inventory operation${C.reset}`);

    if (args.checkStatus) {
      const r = vehicleOps.reportStatus();
      ok(`${r.total} published vehicle(s)`);
      log(`  ${C.green}${r.available.length} available${C.reset}`);
      if (r.unavailable.length) {
        log(`  ${C.yellow}${r.unavailable.length} sold / unavailable${C.reset}`);
        for (const v of r.unavailable) log(`    ${v.slug} — ${v.status || 'unavailable'}`);
      }
      if (r.manual.length) {
        log(`  ${C.dim}${r.manual.length} disabled by hand${C.reset}`);
        for (const v of r.manual) log(`    ${v.slug}`);
      }
      return;
    }

    if (args.disable || args.enable) {
      const enable = Boolean(args.enable);
      const r = vehicleOps.setManual(args.disable || args.enable, enable, { dryRun: args.dryRun });
      if (r.ok) {
        if (args.dryRun) log(`  ${C.yellow}dry run:${C.reset} ${r.message}`);
        else ok(r.message);
      } else {
        warn(r.message);
        process.exitCode = 1;
      }
      return;
    }

    if (args.refresh) {
      const r = await vehicleOps.refreshOne(args.refresh, { dryRun: args.dryRun });
      (r.ok ? ok : warn)(r.message);
      return;
    }
  }

  // 0. Gate (crawl source only) --------------------------------------------
  // Checked before anything else so a rate-limited or out-of-window run says so
  // immediately instead of appearing to work.
  const useCrawl = !args.file && args.source !== 'file' && args.source !== 'http';
  if (useCrawl && !args.window) {
    const cfg = crawler.config();
    const g = crawler.gate(cfg, { force: args.force });
    if (!g.allowed) {
      log(`\n${C.bold}Inventory sync${C.reset}`);
      warn(`${g.reason}`);
      if (g.waitMs > 0) {
        const when = new Date(Date.now() + g.waitMs);
        const hours = g.waitMs / 3600000;
        const whenText = hours >= 1
          ? `${when.toLocaleString()} (in ${hours.toFixed(1)}h)`
          : `${when.toLocaleTimeString()} (in ${Math.ceil(g.waitMs / 60000)} min)`;
        log(`\n  Next permitted run: ${whenText}`);
      }
      log(`\n  ${C.dim}This is a deliberate limit: one pull per ${cfg.minIntervalHours}h,`);
      log(`  off-peak only, so this never competes with the live site.${C.reset}`);
      log(`  ${C.dim}Use --force for a deliberate out-of-band run (it is logged).${C.reset}\n`);
      process.exitCode = 0;
      return;
    }
  }

  // 1. Load ---------------------------------------------------------------
  log(`\n${C.bold}Reading inventory${C.reset}`);
  let loaded;
  try {
    if (args.source === 'file' || (args.file && args.source !== 'http')) {
      if (!args.file) throw new Error('--source file requires --file <path>');
      loaded = fromFile(args.file);
    } else if (args.source === 'http') {
      const headers = {};
      if (process.env.INVENTORY_SOURCE_TOKEN) {
        headers.authorization = `Bearer ${process.env.INVENTORY_SOURCE_TOKEN}`;
      }
      loaded = await fromHttp(process.env.INVENTORY_SOURCE_URL, { headers });
    } else {
      // Default: a restrained pull from the dealer group's own site.
      loaded = await loadFromCrawl(args);
    }
    ok(`${loaded.vehicles.length} record(s) from ${loaded.meta.source}: ${loaded.meta.location}`);
  } catch (err) {
    if (err instanceof crawler.GateError) {
      warn(err.message);
      process.exitCode = 0;
      return;
    }
    bad(err.message);
    process.exitCode = 1;
    return;
  }

  // 2. Normalise ----------------------------------------------------------
  log(`\n${C.bold}Normalising${C.reset}`);
  const syncedAt = new Date().toISOString().slice(0, 10);
  // Map<identityKey, {slug, vehicle}>. The identity is the VIN when present
  // (one physical car, possibly listed on several dealer pages), otherwise
  // the title. The filename is always slugified from the title, so it stays
  // readable even when the key is a VIN.
  const byKey = new Map();
  const skipped = [];
  const usedSlugs = new Set();
  let duplicates = 0;

  loaded.vehicles.forEach((raw, index) => {
    const i = index;
    try {
      const v = normalise(raw, i);
      v.__source = loaded.meta.location;
      v.__synced = syncedAt;
      // Dedupe by VIN, not slug. The same physical car is listed on more than
      // one dealer page (new stock also appears under bargain inventory), and
      // two different cars can share a marketing title ("2026 CADILLAC XT5
      // Luxury" appears repeatedly with different trims and prices).
      // VIN is the only stable identity the feed gives us.
      const key = v.vin ? `vin:${v.vin}` : `title:${v.title.toLowerCase()}`;
      // Distinct cars routinely share a marketing title ("2026 CADILLAC XT5
      // Luxury" appears several times with different trims and prices), so a
      // slug collision is expected. Disambiguate with the last six of the VIN --
      // stable, unique, and still recognisable.
      let slug = slugify(v.title);
      if (usedSlugs.has(slug)) {
        slug = `${slug}-${(v.vin || String(index)).slice(-6).toLowerCase()}`;
      }
      const existing = byKey.get(key);
      if (existing) {
        duplicates += 1;
        // Prefer the more complete record; break ties toward New.
        const score = (x) => Object.keys(x).length + (x.status === 'New' ? 100 : 0);
        if (score(v) > score(existing.vehicle)) byKey.set(key, { slug: existing.slug, vehicle: v });
        return;
      }
      usedSlugs.add(slug);
      // Availability is a per-vehicle fact read from the feed's own status
      // field. A dealer feed often carries "sold" rather than removing the
      // vehicle, so a sync that only looks for absence keeps publishing cars
      // that have gone. availabilityOf() understands the shapes feeds use.
      const availability = availabilityOf(v);
      v.__available = availability.available;
      v.__status = availability.status;
      byKey.set(key, { slug, vehicle: v });
    } catch (err) {
      if (err instanceof ValidationError) {
        skipped.push({ reason: err.message, raw });
      } else {
        throw err;
      }
    }
  });

  ok(`${byKey.size} valid vehicle(s)` +
     (duplicates ? `, ${duplicates} duplicate listing(s) merged by VIN` : ''));

  // 2b. Mirror photography locally.
  //
  // The feed points at pictures.web.dealer.com. Serving those directly would
  // send every visitor to this site to the dealer group's CDN -- load on their
  // edge, a third party in our LCP path. One polite daily batch instead, then
  // Hugo derives AVIF/WebP/JPEG at build time.
  const remote = [...byKey.values()].filter((e) => /^https?:\/\//i.test(e.vehicle.image || ''));
  if (remote.length && !args.noImages) {
    log(`\n${C.bold}Mirroring images${C.reset}`);
    const stats = await images.mirror(
      remote.map((e) => e.vehicle),
      { log: (m) => log(m) }
    );
    for (const entry of byKey.values()) {
      entry.vehicle = stats.apply(entry.vehicle);
    }
    const kb = (n) => `${(n / 1024).toFixed(0)}KB`;
    ok(`${stats.mirrored} mirrored, ${stats.cached} unchanged, ${stats.failed} failed (${kb(stats.bytes)} new)`);
    if (stats.failed) {
      warn(`${stats.failed} vehicle(s) keep the placeholder — a missing photo must never mean a missing vehicle`);
    }
  } else if (remote.length) {
    log(`\n${C.dim}  --no-images: skipping the image mirror${C.reset}`);
  }
  for (const s of skipped) warn(`skipped — ${s.reason}${s.title ? ` (${s.title})` : ''}`);

  // 2c. Availability, and what actually changed since the last sync.
  //
  // This is the part that makes a sync a targeted check rather than a full
  // reconcile. The feed has been read; now we compare it against what the last
  // sync saw, so we can say precisely:
  //
  //   new       vehicles we have never published
  //   changed   vehicles whose details differ from last time
  //   sold      vehicles we hold that the feed no longer lists, or lists as sold
  //   same      everything else -- no work, no write
  //
  // The state file is advisory. The feed is the system of record; where they
  // disagree the feed wins. Losing the state costs one full reconcile, which
  // is what every sync did before this existed.
  const stateFile = path.join(__dirname, '..', '..', 'site', 'data', 'inventory-sync-state.json');
  const { state, warning: stateWarning } = syncState.loadState(stateFile);
  if (stateWarning) warn(stateWarning);

  const feedVehicles = [...byKey.values()].map((e) => e.vehicle);
  const incremental = syncState.planSync(state.vehicles || {}, feedVehicles);

  const nowSold = incremental.sold.map((s) => s.key);
  const markedSold = incremental.changed.filter((c) => c.to.status !== 'available').map((c) => c.key);

  log(`\n${C.bold}Sync plan${C.reset}`);
  ok(`${incremental.added.length} new, ${incremental.changed.length} changed, ` +
     `${nowSold.length + markedSold.length} sold, ${incremental.unchanged.length} unchanged`);
  if (incremental.unchanged.length) {
    log(`  ${C.dim}${incremental.unchanged.length} vehicle(s) need no action -- not rewritten${C.reset}`);
  }

  // Sold and unavailable vehicles are marked, not deleted. A sold car should
  // not be shoppable, but leaving the file on disk means a car that comes back
  // (a trade returned to stock) is recognised rather than republished as new.
  const unavailable = new Set([...nowSold, ...markedSold]);

  // 3. Diff ---------------------------------------------------------------
  const existing = listManaged();
  const plan = { create: [], update: [], unchanged: [], remove: [] };

  for (const { slug, vehicle } of byKey.values()) {
    const file = contentPath(slug);
    if (!fs.existsSync(file)) {
      plan.create.push({ slug, vehicle });
      continue;
    }
    const { data, body } = parseFrontMatter(fs.readFileSync(file, 'utf8'));
    if (!data[MANAGED_MARKER]) {
      // A hand-written file is using this slug. Do not clobber it.
      warn(`skipping ${slug} — a hand-written page already owns that slug`);
      continue;
    }
    const next = render(vehicle, { body });
    if (next === fs.readFileSync(file, 'utf8')) plan.unchanged.push(slug);
    else plan.update.push({ slug, vehicle, previous: data });
  }

  if (args.prune) {
    for (const slug of existing.keys()) {
      if (!new Set([...byKey.values()].map((e) => e.slug)).has(slug)) plan.remove.push(slug);
    }
  }

  // 4. Report -------------------------------------------------------------
  log(`\n${C.bold}Plan${C.reset}`);
  for (const s of plan.create) log(`  ${C.green}+${C.reset} ${s.slug}`);
  for (const u of plan.update) {
    const changes = diffFields(u.previous, u.vehicle);
    log(`  ${C.yellow}~${C.reset} ${u.slug}  ${C.dim}${changes}${C.reset}`);
  }
  for (const slug of plan.unchanged) log(`  ${C.dim}= ${slug}${C.reset}`);
  for (const r of plan.remove) log(`  ${C.red}-${C.reset} ${r}`);

  const writeCount = plan.create.length + plan.update.length + plan.remove.length;
  log(
    `\n  ${plan.create.length} new · ${plan.update.length} updated · ` +
      `${plan.unchanged.length} unchanged · ${plan.remove.length} removed`
  );

  if (!writeCount) {
    log(`\n  ${C.green}Nothing to do.${C.reset} Inventory is already in sync.\n`);
    return;
  }

  // Dry run is opt-in. An earlier version of this script defaulted to
  // NOT writing unless --write was passed, so a plain `npm run inventory:sync`
  // silently did nothing and still printed a plan.
  if (args.dryRun) {
    log(`\n  ${C.yellow}Dry run — nothing written.${C.reset}`);
    log(`  Re-run without --dry-run to apply, then commit the result.\n`);
    return;
  }

  // 5. Write --------------------------------------------------------------
  log(`\n${C.bold}Writing${C.reset}`);
  ensureDir();
  for (const c of plan.create) {
    fs.writeFileSync(contentPath(c.slug), render(c.vehicle));
    ok(`created ${c.slug}.md`);
  }
  for (const u of plan.update) {
    fs.writeFileSync(contentPath(u.slug), render(u.vehicle, { body: parseFrontMatter(fs.readFileSync(contentPath(u.slug), 'utf8')).body }));
    ok(`updated ${u.slug}.md`);
  }
  for (const r of plan.remove) {
    fs.unlinkSync(contentPath(r));
    ok(`removed ${r}.md`);
  }

  // Persist what this sync saw, so the next one is a targeted check rather
  // than a full reconcile. Only written when --write actually ran: a dry run
  // must not claim to have seen anything.
  syncState.saveState(stateFile, {
    version: syncState.STATE_VERSION,
    lastSync: new Date().toISOString(),
    vehicles: syncState.buildNextState(state.vehicles || {}, feedVehicles, new Date().toISOString()),
  });
  ok(`sync state written to ${path.relative(process.cwd(), stateFile)}`);

  log(`\n  ${C.green}Done.${C.reset} Next: ./ci/run.sh verify && ./ci/preview.sh up\n`);
}

function diffFields(prev, next) {
  const changed = [];
  for (const k of Object.keys(next)) {
    if (k.startsWith('__')) continue;
    const a = prev[k];
    const b = next[k];
    const same = Array.isArray(a) && Array.isArray(b) ? a.join() === b.join() : String(a ?? '') === String(b ?? '');
    if (!same) changed.push(k);
  }
  return changed.join(', ') || 'metadata';
}

main().catch((err) => {
  console.error(`\n  ${C.red}inventory:sync crashed${C.reset} ${err.stack || err.message}\n`);
  process.exit(1);
});
