/**
 * edits.js -- apply the admin's pending vehicle edits to the content files.
 *
 * Two callers, one implementation:
 *
 *   1. The full sync (index.js). Edits are merged into the vehicle objects
 *      BEFORE the diff, so the plan, the diff and the written files all carry
 *      them -- and so a feed refresh cannot clobber an admin's change.
 *   2. `npm run inventory:sync -- --apply-edits`. Applies pending rows to the
 *      files directly: no feed, no crawl, no rate limit. This is the fast
 *      path for 'I changed a price, publish it' and it is also the only path
 *      that can reach a vehicle the feed no longer lists.
 *
 * The rows live in the `vehicle_edits` table, written by /admin/inventory
 * through netlify/functions/inventory-admin.js. The table module is shared
 * (netlify/functions/utils/vehicle-edits.js), so the two sides cannot drift.
 *
 * SAFETY
 * ------
 * - Only files carrying the inventory_sync marker are touched (listManaged).
 * - A dry run writes nothing and marks nothing.
 * - Applied rows are marked with the updated_at snapshot taken BEFORE the
 *   write, so an edit saved while this run executes stays pending.
 * - No database access: one clear line, and the sync continues untouched.
 */

'use strict';

const fs = require('fs');
const VehicleEdits = require('../../netlify/functions/utils/vehicle-edits');
const {
  listManaged, contentPath, parseFrontMatter, renderFrontMatter, defaultBody,
} = require('./content');

/* Which override lands in which front-matter field. Kept as data rather than
 * a chain of ifs so the two apply paths cannot disagree about it. */
const FIELD_MAP = [
  'price', 'price_note', 'subtitle', 'mileage', 'exterior_color',
  'interior_color', 'body_style', 'drivetrain', 'transmission', 'engine', 'mpg',
];

/** Pending rows, keyed by slug. */
function loadPending() {
  const result = VehicleEdits.list();
  if (!result || typeof result.then !== 'function') {
    return Promise.resolve({ ok: false, reason: 'unavailable', rows: [], bySlug: new Map() });
  }
  return result.then((r) => {
    if (!r.ok) return { ok: false, reason: r.reason || 'unavailable', detail: r.detail, rows: [], bySlug: new Map() };
    const rows = r.rows.filter((row) => row.status === 'pending' && row.fields && Object.keys(row.fields).length);
    const bySlug = new Map(rows.map((row) => [row.slug, row]));
    return { ok: true, rows, bySlug };
  });
}

/**
 * Merge an edit row into a vehicle object (the full-sync path).
 *
 * Availability is special: `available:false` writes the held-off state the
 * renderer already understands (__available/__status), and `available:true`
 * sets __force_available so a previously held or sold file is re-listed even
 * though its old front matter says otherwise.
 */
function mergeIntoVehicle(vehicle, fields) {
  for (const key of FIELD_MAP) {
    if (!Object.prototype.hasOwnProperty.call(fields, key)) continue;
    const value = fields[key];
    // '' means 'no override' (the admin reverted the field); it never means
    // 'delete the feed's value', which would strip real data from the page.
    if (value === '' || value === null) continue;
    vehicle[key] = value;
  }
  if (Object.prototype.hasOwnProperty.call(fields, 'status') && fields.status) {
    vehicle.status = fields.status;
  }
  if (fields.available === false) {
    vehicle.__available = false;
    vehicle.__status = fields.unavailable_reason || 'held off the site';
  } else if (fields.available === true) {
    vehicle.__force_available = true;
    vehicle.__available = true;
    vehicle.__status = 'available';
  }
  if (Object.prototype.hasOwnProperty.call(fields, 'description')) {
    vehicle.__body_override = String(fields.description || '');
  }
  return vehicle;
}

/** The body an override asks for: the description, or the generated prose. */
function bodyOverrideFor(vehicle, carried) {
  if (Object.prototype.hasOwnProperty.call(vehicle, '__body_override')) {
    const d = String(vehicle.__body_override || '').trim();
    return d || defaultBody(vehicle);
  }
  return carried;
}

/**
 * Apply pending rows to a front-matter data map (the apply-only path).
 * Returns true when the in-memory document changed.
 */
function applyFieldsToData(data, fields) {
  let changed = false;
  const before = JSON.stringify(data);
  for (const key of FIELD_MAP) {
    if (!Object.prototype.hasOwnProperty.call(fields, key)) continue;
    const value = fields[key];
    if (value === '' || value === null) continue; // no override; keep the feed's value
    data[key] = value;
  }
  if (Object.prototype.hasOwnProperty.call(fields, 'status') && fields.status) data.status = fields.status;
  if (fields.available === false) {
    data.available = false;
    data.manually_disabled = true;
    data.unavailable_reason = fields.unavailable_reason || 'held off the site';
  } else if (fields.available === true) {
    delete data.available;
    delete data.manually_disabled;
    delete data.unavailable_reason;
  }
  changed = JSON.stringify(data) !== before;
  return changed;
}

/**
 * Apply-only run: no feed. Walks the edit queue, rewrites the files it
 * changes, and marks what it satisfied. Used by --apply-edits.
 */
async function applyOnly({ dryRun = false } = {}) {
  const pending = await loadPending();
  if (!pending.ok) {
    return { ok: false, reason: pending.reason, detail: pending.detail, applied: [], skipped: [], changed: 0, total: 0 };
  }
  const rows = pending.rows;
  const managed = listManaged();
  const appliedEntries = [];
  const appliedSlugs = [];
  const skipped = [];
  let changed = 0;

  for (const row of rows) {
    const entry = managed.get(row.slug);
    if (!entry) {
      // Hand-written page, or a vehicle the sync has never managed. Editing
      // either is not this pipeline's to do.
      skipped.push({ slug: row.slug, reason: 'no managed file with that slug' });
      continue;
    }
    const file = entry.path || contentPath(row.slug);
    const raw = fs.readFileSync(file, 'utf8');
    const { data, body } = parseFrontMatter(raw);
    const dataChanged = applyFieldsToData(data, row.fields);

    let nextBody = body.trim();
    if (Object.prototype.hasOwnProperty.call(row.fields, 'description')) {
      const d = String(row.fields.description || '').trim();
      nextBody = d || defaultBody(data);
    }
    const next = renderFrontMatter(data) + nextBody + '\n';

    if (next !== raw) {
      changed += 1;
      if (!dryRun) fs.writeFileSync(file, next);
      appliedSlugs.push(row.slug);
    } else {
      // Nothing to write: the file already carries these values (a re-saved
      // identical edit, or a run after a manual fix). The row is satisfied.
      appliedSlugs.push(row.slug);
      void dataChanged;
    }
    appliedEntries.push({ slug: row.slug, upTo: row.updatedAt });
  }

  let marked = 0;
  let markReason = '';
  if (!dryRun && appliedEntries.length) {
    const m = await VehicleEdits.markApplied(appliedEntries);
    marked = m.applied || 0;
    if (!m.ok) markReason = m.reason || 'mark-failed';
  }

  return {
    ok: true,
    total: rows.length,
    changed,
    applied: appliedSlugs,
    skipped,
    marked,
    markReason,
  };
}

module.exports = {
  FIELD_MAP,
  loadPending,
  mergeIntoVehicle,
  bodyOverrideFor,
  applyFieldsToData,
  applyOnly,
};
