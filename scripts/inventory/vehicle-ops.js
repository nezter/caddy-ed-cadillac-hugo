/**
 * vehicle-ops.js -- targeted, per-vehicle operations on the inventory.
 *
 * WHY THIS EXISTS
 * ---------------
 * A sync is a bulk operation over a whole feed. Sometimes that is the wrong tool:
 *
 *   - one car's price changed and you want to confirm it, without a full
 *     reconcile of 36 vehicles;
 *   - a car sold on the dealer site but is still published here, and you want
 *     it off the site today rather than at the next nightly sync;
 *   - you want to know, right now, which published vehicles the feed no longer
 *     lists, without fetching anything.
 *
 * None of those should require a full scrape. This module does each of them by
 * touching only the vehicle named.
 *
 * IDENTITY
 * --------
 * A vehicle can be named by its slug (`2026-cadillac-xt5-luxury`), its VIN
 * (`1G6DU5RK7T0109862`), or its stock number (`NT0109862`). Slugs are what a
 * person reads off the site, VINs are what a DMS gives you, and both should
 * work -- guessing which one a caller has is friction for no benefit.
 *
 * MANUAL OVERRIDE
 * ----------------
 * A vehicle can be disabled by hand. That override is stored in front matter
 * (`available: false` plus `manually_disabled: true`) and deliberately OUTRANKS
 * what the feed says.
 *
 * That is the opposite of how a feed normally works, and it is intentional. The
 * feed is the system of record for what is in stock, but it is not the system of
 * record for what this site should show. A car can be wrong-listed upstream, a
 * photo can be wrong, a price can be a placeholder. When a person has taken a
 * car off the site, the next sync must not put it straight back.
 *
 * The override is a separate field rather than an overwrite of the feed's own
 * status, so re-enabling is honest: the vehicle comes back with whatever the
 * feed currently says about it, not with a stale cached status.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { vehicleKey, availabilityOf, extractList } = require('./sources');
const { parseFrontMatter, renderFrontMatter, contentPath, listManaged } = require('./content');

/**
 * Find the content file for a vehicle named by slug, VIN or stock number.
 *
 * @param {string} needle - slug, VIN, or stock number
 * @returns {{file: string, data: object, body: string}|null}
 */
function findVehicle(needle) {
  if (!needle) return null;
  const wanted = String(needle).trim().toLowerCase();
  const base = path.basename(String(needle)).replace(/\.md$/, '');

  for (const [slug, entry] of listManaged()) {
    const data = entry.data || {};
    if (
      slug === base ||
      String(data.vin || '').toLowerCase() === wanted ||
      String(data.stock || '').toLowerCase() === wanted
    ) {
      const file = entry.path;
      return { file, slug, data, body: parseFrontMatter(fs.readFileSync(file, 'utf8')).body };
    }
  }
  return null;
}

/**
 * Fetch one vehicle from the feed and return it, or null if the feed does not
 * list it.
 *
 * The feed only supports whole-list fetches, so this reads the feed and picks
 * the one vehicle out of it. That is still fewer requests than a full reconcile
 * of everything else, and it is the only thing a key/value feed can do.
 */
async function fetchOne(needle) {
  const fromFile = require('./sources').fromFile;
  const fromHttp = require('./sources').fromHttp;
  const args = parseLocalArgs();
  const raw = args.file
    ? fromFile(args.file)
    : await fromHttp(process.env.INVENTORY_SOURCE_URL, {});

  const wanted = String(needle).trim().toLowerCase();
  for (const v of raw.vehicles) {
    if (
      vehicleKey(v) === wanted ||
      vehicleKey(v) === `vin:${wanted}` ||
      vehicleKey(v) === `stock:${wanted}` ||
      (v.url && String(v.url).toLowerCase().includes(wanted))
    ) {
      return { vehicle: v, meta: raw.meta, count: raw.vehicles.length };
    }
  }
  return { vehicle: null, meta: raw.meta, count: raw.vehicles.length };
}

// The helpers above need the same CLI args main() already parsed, without
// re-parsing process.argv into a second object that could disagree.
let _args = {};
function setArgs(args) { _args = args; }
function parseLocalArgs() { return _args; }

/**
 * Set (or clear) the manual override on one vehicle.
 *
 * @param {string} needle - slug, VIN or stock number
 * @param {boolean} enabled - true to re-enable, false to disable
 * @param {object} opts - {dryRun, log, ok, warn}
 */
function setManual(needle, enabled, opts = {}) {
  const found = findVehicle(needle);
  if (!found) {
    return { ok: false, message: `no published vehicle matches "${needle}"` };
  }

  const { file, data, body } = found;
  const next = Object.assign({}, data);
  next.manually_disabled = !enabled;
  if (enabled) {
    delete next.available;
    delete next.unavailable_reason;
    // Remove the override entirely rather than setting it false, so a vehicle
    // that was never disabled and one that was disabled then re-enabled are
    // byte-identical. Otherwise every disable/enable cycle leaves a permanent
    // `manually_disabled: false` line in the front matter and the file never
    // returns to its committed state.
    delete next.manually_disabled;
  } else {
    next.available = false;
    next.unavailable_reason = 'held off the site by hand';
  }

  if (opts.dryRun) {
    return { ok: true, file, data: next, message: `would ${enabled ? 'enable' : 'disable'} ${found.slug}` };
  }

  const order = ['title', 'available', 'unavailable_reason', 'manually_disabled'];
  const ordered = {};
  for (const k of order) if (k in next) ordered[k] = next[k];
  for (const k of Object.keys(next)) if (!(k in ordered)) ordered[k] = next[k];

  fs.writeFileSync(file, renderFrontMatter(ordered) + body);
  return {
    ok: true,
    file,
    message: enabled
      ? `re-enabled ${found.slug} — it will reappear on the next build`
      : `disabled ${found.slug} — hidden from the site immediately`,
  };
}

/**
 * Report the availability of every published vehicle, reading only what is
 * already on disk. No network call.
 */
function reportStatus(opts = {}) {
  const all = listManaged();
  const available = [];
  const unavailable = [];
  const manual = [];
  for (const [slug, entry] of all) {
    const data = entry.data || {};
    const record = { slug, vin: data.vin, stock: data.stock, price: data.price, status: data.status };
    if (data.manually_disabled) manual.push(record);
    else if (data.available === false) unavailable.push(record);
    else available.push(record);
  }
  return { available, unavailable, manual, total: all.size };
}

/**
 * Check one vehicle against the feed and report what changed, without writing
 * anything unless explicitly asked.
 */
async function refreshOne(needle, opts = {}) {
  const found = findVehicle(needle);
  const fetched = await fetchOne(needle);
  if (!fetched.vehicle) {
    return {
      ok: true,
      changed: false,
      message: found
        ? `${found.slug} is published here but the feed no longer lists it — run --disable to take it down`
        : `feed does not list "${needle}"`,
    };
  }
  const availability = availabilityOf(fetched.vehicle);
  if (!found) {
    return { ok: true, changed: true, message: `"${needle}" is in the feed but not published here` };
  }
  return {
    ok: true,
    changed: true,
    published: found.slug,
    available: availability.available,
    status: availability.status,
    message: `${found.slug}: feed says ${availability.status}`,
  };
}

module.exports = { findVehicle, setManual, reportStatus, refreshOne, setArgs, fetchOne };
