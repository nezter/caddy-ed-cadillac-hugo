/**
 * schema.js -- the canonical vehicle record shape.
 *
 * Everything that enters the site passes through normalise() first, so a
 * change in an upstream feed cannot produce half-populated content files.
 * A vehicle that cannot be normalised is reported and skipped rather than
 * written out broken.
 */

'use strict';

/** Fields we manage. Anything else in the source payload is ignored. */
const MANAGED_FIELDS = [
  'title',
  'status',
  'subtitle',
  'price',
  'price_note',
  'image',
  'image_width',
  'image_height',
  'gallery',
  'year',
  'make',
  'model',
  'trim',
  'mileage',
  'vin',
  'stock',
  'body_style',
  'exterior_color',
  'interior_color',
  'drivetrain',
  'transmission',
  'engine',
  'horsepower',
  'mpg',
  'tags',
  'categories',
  'featured',
];

/** Marker written into every file this tool owns. */
const MANAGED_MARKER = 'inventory_sync';

/** Statuses we recognise, normalised to Title Case. */
const STATUS_ALIASES = {
  new: 'New',
  'brand new': 'New',
  cpo: 'Certified Pre-Owned',
  'certified pre-owned': 'Certified Pre-Owned',
  certified: 'Certified Pre-Owned',
  'pre-owned': 'Pre-Owned',
  preowned: 'Pre-Owned',
  used: 'Pre-Owned',
};

class ValidationError extends Error {
  constructor(message, record) {
    super(message);
    this.name = 'ValidationError';
    this.record = record;
  }
}

function str(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function list(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(str).filter(Boolean);
  return str(v)
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Build a title from whatever the source gives us.
 * Sources variously provide a full title, or year/make/model/trim separately.
 */
function buildTitle(src) {
  const explicit = str(src.title || src.name || src.heading);
  if (explicit) return explicit;

  const parts = [src.year, src.make, src.model, src.trim].map(str).filter(Boolean);
  if (!parts.length) return '';
  // Model alone reads better than "2024 Cadillac" with no model.
  return parts.join(' ');
}

/** A short spec line for the card: "AWD · Automatic · 45218 mi". */
function specSubtitle(raw) {
  const explicit = str(raw.subtitle);
  if (explicit) return explicit;
  const parts = [
    str(raw.drivetrain),
    str(raw.transmission),
    typeof raw.mileage === 'number' || raw.mileage
      ? `${Number(raw.mileage).toLocaleString('en-US')} mi`
      : '',
  ].filter(Boolean);
  return parts.join(' \u00b7 ');
}

/**
 * Normalise one raw record. Throws ValidationError when there is not enough to
 * identify a vehicle -- a year+make with no model is not a car you can list.
 */
function normalise(raw, index = 0) {
  if (!raw || typeof raw !== 'object') {
    throw new ValidationError(`record ${index} is not an object`, raw);
  }

  const title = buildTitle(raw);
  if (!title) {
    throw new ValidationError(`record ${index} has no title and no year/make/model`, raw);
  }
  if (!/\d{4}/.test(title) && !str(raw.vin)) {
    throw new ValidationError(`record ${index} ("${title}") has no model year`, raw);
  }

  const year = num(raw.year) || (Number((title.match(/\b(19|20)\d{2}\b/) || [])[0]) || null);
  const make = str(raw.make) || (title.match(/\b(19|20)\d{2}\s+([A-Za-z]+)/) || [])[2] || '';
  const model = str(raw.model) || (title.match(/\b(19|20)\d{2}\s+[A-Za-z]+\s+([A-Za-z0-9-]+)/) || [])[2] || '';
  // Trim = whatever follows "<year> <make> <model>". Anchoring on the already
  // extracted year/make/model keeps this from matching a stray 4-digit number
  // elsewhere in the title (it previously produced trim: "20").
  let trim = str(raw.trim);
  if (!trim && year && make && model) {
    const head = `${year} ${make} ${model}`;
    if (title.toLowerCase().startsWith(head.toLowerCase())) {
      trim = title.slice(head.length).trim();
    }
  }

  const price = num(raw.price ?? raw.msrp ?? raw.listPrice);

  const statusKey = str(raw.status || raw.condition).toLowerCase();
  const status = STATUS_ALIASES[statusKey] || (statusKey ? statusKey.replace(/\b\w/g, (c) => c.toUpperCase()) : '');

  const out = {
    title,
    status,
    // The dealer's `description` is a marketing sentence that already appears in
    // the body. A subtitle should be the spec line instead, so derive one and
    // only fall back to whatever the feed supplied.
    subtitle: specSubtitle(raw),
    price,
    price_note: str(raw.priceNote || raw.price_note),
    image: str(raw.image || raw.imageUrl || raw.photo),
    image_width: num(raw.image_width || raw.imageWidth),
    image_height: num(raw.image_height || raw.imageHeight),
    gallery: list(raw.gallery || raw.images),
    year,
    make: make || 'Cadillac',
    model,
    trim,
    mileage: num(raw.mileage),
    vin: str(raw.vin || raw.stockNumber || raw.stock),
    stock: str(raw.stockNumber || raw.stock),
    body_style: str(raw.bodyStyle || raw.body_style),
    exterior_color: str(raw.exteriorColor || raw.exterior_color),
    interior_color: str(raw.interiorColor || raw.interior_color),
    drivetrain: str(raw.drivetrain),
    transmission: str(raw.transmission),
    engine: str(raw.engine),
    horsepower: num(raw.horsepower || raw.hp),
    mpg: num(raw.mpg),
    tags: list(raw.tags),
    categories: list(raw.categories || raw.category),
    featured: raw.featured === true || str(raw.featured).toLowerCase() === 'true',
  };

  // Drop empties so content files stay readable and diffs stay small.
  for (const k of Object.keys(out)) {
    if (out[k] === '' || out[k] === null || (Array.isArray(out[k]) && !out[k].length)) {
      delete out[k];
    }
  }

  return out;
}

/** Slug for the content file name. */
function slugify(title) {
  return str(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'vehicle';
}

module.exports = { MANAGED_FIELDS, MANAGED_MARKER, ValidationError, normalise, slugify };
