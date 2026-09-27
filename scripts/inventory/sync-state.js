/**
 * sync-state.js -- what the last sync saw, so the next one does not have to.
 *
 * THE PROBLEM THIS SOLVES
 * -----------------------
 * Every sync so far has been a full reconcile: fetch the whole feed, rewrite
 * every managed content file, and hope nothing changed. That is wasteful, it
 * is noisy in review, and it is a standing temptation to "just re-run it" --
 * which is exactly the full scrape the site does not want against a host that
 * is not ours to hammer.
 *
 * What a sync actually needs to do is much smaller:
 *
 *   1. ADD vehicles we have never seen.              (one new file)
 *   2. CHECK vehicles we have that the feed still lists, and mark the ones
 *      that have gone or sold.                        (one status field)
 *   3. CHANGE nothing else.
 *
 * So this file records, per vehicle key, the last time it was confirmed
 * present and what its status was. A sync then only needs the feed's current
 * list to decide what is new and what has changed, and it can say so without
 * re-fetching anything per vehicle.
 *
 * WHY THIS IS A FILE AND NOT A CACHE KEY
 * ---------------------------------------
 * The state has to survive a deploy and be readable by a person deciding whether
 * a sync is safe to run. It is a small, readable, diffable JSON file, committed
 * with the content it describes. That way "what did the last sync think?" is a
 * question with a `git log` answer.
 *
 * It is deliberately NOT authoritative. The feed is the system of record. If
 * state and feed disagree, the feed wins and the state is corrected. The state
 * only ever saves work; it is never allowed to assert a fact the feed denied.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const STATE_VERSION = 2;

function emptyState() {
  return {
    version: STATE_VERSION,
    lastSync: null,
    vehicles: {},
  };
}

/**
 * Load sync state, or a fresh empty state if it does not exist or is unusable.
 *
 * A corrupt state file is not an error worth stopping a sync for: the worst
 * case of losing it is one full reconcile, which is the behaviour we had before
 * this file existed. So it is reported and replaced rather than thrown.
 */
function loadState(filePath) {
  if (!fs.existsSync(filePath)) return { state: emptyState(), existed: false, warning: null };
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || !parsed.vehicles) {
      return {
        state: emptyState(),
        existed: true,
        warning: `${filePath} has no vehicles map; treating this as a first sync`,
      };
    }
    if (parsed.version !== STATE_VERSION) {
      // A version bump means the shape changed. The old data is not trusted;
      // the next sync is a full reconcile and repopulates it.
      return {
        state: emptyState(),
        existed: true,
        warning: `${filePath} is version ${parsed.version}, expected ${STATE_VERSION}; treating this as a first sync`,
      };
    }
    return { state: parsed, existed: true, warning: null };
  } catch (err) {
    return {
      state: emptyState(),
      existed: true,
      warning: `${filePath} is unreadable (${err.message}); treating this as a first sync`,
    };
  }
}

function saveState(filePath, state) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`);
}

/**
 * Work out what changed between the last sync and the feed we just read.
 *
 * Returns a plan -- never mutates anything. The caller decides whether to apply
 * it, which is what makes --dry-run meaningful.
 *
 *   added      keys the feed has and we have never seen
 *   changed    keys we have whose content or status differs from last time
 *   sold       keys we have that the feed no longer lists, or lists as sold
 *   unchanged  the rest
 */
function planSync(previousVehicles, currentVehicles) {
  const added = [];
  const changed = [];
  const sold = [];
  const unchanged = [];

  const currentKeys = new Set();

  for (const vehicle of currentVehicles) {
    const key = vehicle.__key;
    if (!key) continue;
    currentKeys.add(key);

    const seen = previousVehicles[key];
    if (!seen) {
      added.push({ key, vehicle });
      continue;
    }

    const status = vehicle.__available ? 'available' : vehicle.__status || 'unavailable';
    const fingerprint = fingerprintVehicle(vehicle);

    if (fingerprint !== seen.fingerprint || status !== seen.status) {
      changed.push({
        key,
        vehicle,
        from: { fingerprint: seen.fingerprint, status: seen.status },
        to: { fingerprint, status },
        // Whether the change is only availability, or also content.
        availabilityOnly: fingerprint === seen.fingerprint && status !== seen.status,
      });
    } else {
      unchanged.push({ key, vehicle });
    }
  }

  // Anything we hold that the feed no longer mentions.
  for (const key of Object.keys(previousVehicles)) {
    if (!currentKeys.has(key)) {
      sold.push({ key, previous: previousVehicles[key] });
    }
  }

  return { added, changed, sold, unchanged };
}

/**
 * A stable digest of the fields we render, so "changed" means the page would
 * actually differ.
 *
 * Deliberately excludes volatile fields -- lastSeen, scrapedAt, anything the
 * feed stamps on every response -- because a timestamp changing on every poll
 * would make every vehicle look "changed" on every sync and the whole point
 * would be lost.
 */
function fingerprintVehicle(vehicle) {
  const FIELDS = [
    'title',
    'subtitle',
    'price',
    'priceNote',
    'status',
    'vin',
    'stock',
    'year',
    'make',
    'model',
    'trim',
    'mileage',
    'exterior_color',
    'interior_color',
    'drivetrain',
    'transmission',
    'image',
    'body',
    'location',
  ];
  return FIELDS.map((f) => {
    const v = vehicle[f];
    return `${f}=${v === undefined || v === null ? '' : String(v)}`;
  }).join('|');
}

/**
 * Build the state map for the next run from what we just saw.
 *
 * Sold vehicles are retained with their status rather than dropped, so the next
 * sync can tell "sold, and still sold" from "sold, and back on the lot".
 */
function buildNextState(previousVehicles, currentVehicles, timestamp) {
  const next = {};
  const currentKeys = new Set();

  for (const vehicle of currentVehicles) {
    const key = vehicle.__key;
    if (!key) continue;
    currentKeys.add(key);
    next[key] = {
      fingerprint: fingerprintVehicle(vehicle),
      status: vehicle.__available ? 'available' : vehicle.__status || 'unavailable',
      lastSeen: timestamp,
      title: vehicle.title || null,
    };
  }

  // Carry forward anything the feed dropped, flagged as no longer listed.
  for (const [key, entry] of Object.entries(previousVehicles)) {
    if (currentKeys.has(key)) continue;
    next[key] = Object.assign({}, entry, {
      status: entry.status === 'sold' ? 'sold' : 'not-listed',
      lastSeen: entry.lastSeen || null,
    });
  }

  return next;
}

module.exports = {
  STATE_VERSION,
  loadState,
  saveState,
  planSync,
  buildNextState,
  fingerprintVehicle,
  emptyState,
};
