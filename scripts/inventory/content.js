/**
 * content.js -- read and write Hugo content files for vehicles.
 *
 * Two rules make this safe to run on a schedule:
 *
 *   1. It only ever writes files carrying the `inventory_sync` marker in their
 *      front matter. Hand-written pages under site/content/inventory/ are
 *      never touched, moved, or deleted.
 *   2. Writes are content-aware. If the rendered body would be unchanged the
 *      file is not rewritten, so re-running produces no git churn.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { MANAGED_MARKER, slugify } = require('./schema');

const CONTENT_DIR = path.join(__dirname, '..', '..', 'site', 'content', 'inventory');

/* ------------------------------------------------------------------ *
 * A small, dependency-free front-matter writer.
 *
 * gray-matter is used by netlify/functions/inventory-sync.js but was never
 * declared as a dependency, so that function crashed on load. Rather than add a
 * dependency for two small functions, front matter is parsed and emitted here
 * directly. The format is a strict subset of YAML: scalars and simple lists,
 * which is all a vehicle record needs.
 * ------------------------------------------------------------------ */

function needsQuoting(v) {
  return /^[\s>|*&!%@`{}[\],#-]|:\s|\s$|^$|^-|^\d+[.,]\d*$|^"[^"]*"|^'[^']*'$/.test(v);
}

function yamlScalar(v) {
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  const s = String(v);
  if (/^[\d.]+$/.test(s)) return String(Number(s)); // 61500 not "61500"
  return needsQuoting(s) ? JSON.stringify(s) : s;
}

function renderFrontMatter(fields) {
  const lines = ['---'];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (!value.length) continue;
      lines.push(`${key}:`);
      for (const item of value) lines.push(`  - ${yamlScalar(item)}`);
    } else {
      lines.push(`${key}: ${yamlScalar(value)}`);
    }
  }
  lines.push('---', '');
  return lines.join('\n');
}

/** Parse the `---` front matter block of a markdown file. */
function parseFrontMatter(text) {
  if (!text.startsWith('---')) return { data: {}, body: text };
  const end = text.indexOf('\n---', 3);
  if (end === -1) return { data: {}, body: text };

  const block = text.slice(3, end);
  const body = text.slice(text.indexOf('\n', end + 1) + 1);
  const data = {};

  let currentKey = null;
  for (const rawLine of block.split('\n')) {
    if (!rawLine.trim() || rawLine.trim().startsWith('#')) continue;
    const listItem = rawLine.match(/^\s*-\s+(.*)$/);
    if (listItem && currentKey) {
      if (!Array.isArray(data[currentKey])) data[currentKey] = [];
      data[currentKey].push(unquote(listItem[1].trim()));
      continue;
    }
    const kv = rawLine.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    currentKey = kv[1];
    const raw = kv[2].trim();
    data[currentKey] = raw === '' ? '' : unquote(raw);
  }
  return { data, body };
}

function unquote(s) {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    try {
      return JSON.parse(s.startsWith("'") ? `"${s.slice(1, -1)}"` : s);
    } catch {
      return s.slice(1, -1);
    }
  }
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (s === 'true') return true;
  if (s === 'false') return false;
  return s;
}

/* ------------------------------------------------------------------ */

function ensureDir() {
  fs.mkdirSync(CONTENT_DIR, { recursive: true });
}

function contentPath(slug) {
  return path.join(CONTENT_DIR, `${slug}.md`);
}

/** All managed vehicle files, keyed by slug. */
function listManaged() {
  if (!fs.existsSync(CONTENT_DIR)) return new Map();
  const out = new Map();
  for (const file of fs.readdirSync(CONTENT_DIR)) {
    if (!file.endsWith('.md')) continue;
    const full = path.join(CONTENT_DIR, file);
    const { data } = parseFrontMatter(fs.readFileSync(full, 'utf8'));
    if (!data[MANAGED_MARKER]) continue; // hand-written: never touch
    out.set(file.replace(/\.md$/, ''), { path: full, data });
  }
  return out;
}

/**
 * Render a vehicle to markdown.
 *
 * `existing` carries over the previous body so prose written in the CMS or by
 * hand is not destroyed on every sync.
 */
function render(vehicle, existing) {
  const fields = { title: vehicle.title };
  if (vehicle.status) fields.status = vehicle.status;
  // Availability, so a sold or withdrawn car is not shoppable. The feed often
  // marks a vehicle sold rather than removing it, and a sync that only watches
  // for absence keeps publishing cars that have gone.
  //
  // `available: false` is what the templates filter on. `unavailable_reason`
  // carries the feed's own wording ("sold", "in transit", "pending") so the
  // page can say why rather than inventing a reason.
  if (vehicle.__available === false) {
    fields.available = false;
    fields.unavailable_reason = vehicle.__status || 'unavailable';
  } else if (existing && existing.available === false) {
    // Do not silently re-enable: a car that was sold and is still absent from
    // the feed stays marked until the feed says otherwise.
    fields.available = false;
    fields.unavailable_reason = existing.unavailable_reason || 'no longer listed';
  }
  if (vehicle.price !== undefined) fields.price = vehicle.price;
  if (vehicle.price_note) fields.price_note = vehicle.price_note;
  if (vehicle.subtitle) fields.subtitle = vehicle.subtitle;
  if (vehicle.image) fields.image = vehicle.image;
  if (vehicle.image_width) fields.image_width = vehicle.image_width;
  if (vehicle.image_height) fields.image_height = vehicle.image_height;
  if (vehicle.gallery && vehicle.gallery.length) fields.gallery = vehicle.gallery;
  if (vehicle.vin) fields.vin = vehicle.vin;
  if (vehicle.stock) fields.stock = vehicle.stock;
  if (vehicle.year) fields.year = vehicle.year;
  if (vehicle.make) fields.make = vehicle.make;
  if (vehicle.model) fields.model = vehicle.model;
  if (vehicle.trim) fields.trim = vehicle.trim;
  if (vehicle.mileage) fields.mileage = vehicle.mileage;
  if (vehicle.body_style) fields.body_style = vehicle.body_style;
  if (vehicle.exterior_color) fields.exterior_color = vehicle.exterior_color;
  if (vehicle.interior_color) fields.interior_color = vehicle.interior_color;
  if (vehicle.drivetrain) fields.drivetrain = vehicle.drivetrain;
  if (vehicle.transmission) fields.transmission = vehicle.transmission;
  if (vehicle.engine) fields.engine = vehicle.engine;
  if (vehicle.horsepower) fields.horsepower = vehicle.horsepower;
  if (vehicle.mpg) fields.mpg = vehicle.mpg;
  if (vehicle.tags && vehicle.tags.length) fields.tags = vehicle.tags;
  if (vehicle.categories && vehicle.categories.length) fields.categories = vehicle.categories;
  if (vehicle.featured) fields.featured = true;

  // Provenance: which source produced this, and when. Makes a surprising diff
  // explainable after the fact.
  //
  // Emitted as two scalar keys rather than a nested map: the front-matter
  // writer above is a strict YAML subset (scalars + simple lists), and a nested
  // object was serialising as the literal string "[object Object]".
  fields[MANAGED_MARKER] = vehicle.__source || 'unknown';
  fields[`${MANAGED_MARKER}_synced`] = vehicle.__synced;
  if (vehicle.draft) fields.draft = true;

  const body = existing && existing.body && existing.body.trim()
    ? existing.body.trim()
    : defaultBody(vehicle);

  return renderFrontMatter(fields) + body + '\n';
}

function defaultBody(vehicle) {
  const bits = [];
  if (vehicle.subtitle) bits.push(`${vehicle.subtitle}.`);
  const specs = [
    vehicle.drivetrain && `${vehicle.drivetrain} drivetrain`,
    vehicle.transmission,
    vehicle.engine,
    vehicle.exterior_color && `${vehicle.exterior_color} exterior`,
    vehicle.interior_color && `${vehicle.interior_color} interior`,
  ].filter(Boolean);
  if (specs.length) bits.push(specs.join(' · ') + '.');
  if (vehicle.mileage) bits.push(`${Number(vehicle.mileage).toLocaleString('en-US')} miles.`);
  bits.push('Full specification and availability on request — ask Caddy Ed for the details on this vehicle.');
  return bits.join(' ');
}

module.exports = {
  CONTENT_DIR,
  contentPath,
  ensureDir,
  listManaged,
  parseFrontMatter,
  render,
  renderFrontMatter,
  slugify,
  // Exported so a body can be regenerated from front matter without a crawl.
  // scripts/inventory/rebuild-bodies.js does exactly that; regex-patching the
  // generated prose instead left "AWD drivetrain· Engine ·" behind.
  defaultBody,
};
