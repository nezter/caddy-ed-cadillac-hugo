#!/usr/bin/env node

/**
 * content:apply -- turn queued rows into site content files, for any type.
 *
 *   node scripts/content/apply.js --type articles|specials|testimonials
 *   ... --dry-run      report, write nothing, mark nothing
 *
 * One applier for every content type, driven by utils/content-types.js, so
 * the file-format rules and the applied-snapshot rule exist once. This is
 * the script that replaced scripts/articles/apply.js when specials and
 * testimonials moved onto the same machine.
 *
 * Rules (unchanged from the articles original):
 *  - only files carrying the type's marker are managed; hand-written files
 *    are never touched;
 *  - rows are marked applied with the updated_at they carried when read, so
 *    a save mid-run stays pending;
 *  - no database access: one line, exit 0 -- applying is a step a human runs
 *    where the credentials live, never something that fails a build.
 *
 * npm aliases: articles:apply, specials:apply, testimonials:apply.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { TYPES } = require('../../netlify/functions/utils/content-types');

const C = { reset: '\x1b[0m', dim: '\x1b[2m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', bold: '\x1b[1m' };

function parseArgs(argv) {
  const args = { type: null, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--type' || a === '-t') args.type = argv[++i];
    else if (a === '--dry-run' || a === '-n') args.dryRun = true;
  }
  return args;
}

function contentDir(def) {
  const envName = def.section.toUpperCase() + '_CONTENT_DIR';
  if (process.env[envName]) return path.resolve(process.env[envName]);
  return path.join(__dirname, '..', '..', 'site', 'content', def.section);
}

function yamlScalar(v) {
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  const s = String(v);
  if (/^[\d.]+$/.test(s)) return String(Number(s));
  return /^[\s>|*&!%@`{}\[\],#-]|:\s|\s$|^$/.test(s) ? JSON.stringify(s) : s;
}

/**
 * Render one row to markdown. Field order follows the type definition, so
 * a re-apply of unchanged content is byte-identical and produces no churn.
 * kind text quotes (except image paths), dates and image paths are raw,
 * tags are a list, published:false becomes draft:true, featured:true is
 * written as itself, and the `main` field becomes the body.
 */
function renderContent(def, fields, syncedAt) {
  const lines = ['---'];
  let haveTitle = false;
  for (const f of def.fields) {
    const v = fields[f.key];
    if (f.kind === 'bool') {
      if (f.key === 'published') { if (v === false) lines.push('draft: true'); }
      else if (v === true) lines.push(f.key + ': true');
      continue;
    }
    if (f.main) continue;
    if (f.kind === 'tags') {
      if (Array.isArray(v) && v.length) {
        lines.push(f.key + ':');
        for (const t of v) lines.push('  - ' + yamlScalar(t));
      }
      continue;
    }
    if (v === undefined || v === null || v === '') continue;
    if (f.kind === 'date' || f.key === 'image') lines.push(f.key + ': ' + String(v));
    else lines.push(f.key + ': ' + JSON.stringify(String(v)));
    if (f.key === 'title') haveTitle = true;
  }
  void haveTitle;
  lines.push(def.marker + ': true');
  lines.push(def.marker + '_synced: ' + syncedAt);
  lines.push('---', '');
  const main = def.fields.find((f) => f.main);
  const body = main ? String(fields[main.key] || '') : '';
  return lines.join('\n') + body.replace(/\s+$/, '') + '\n';
}

function managedFiles(def, dir) {
  if (!fs.existsSync(dir)) return new Map();
  const out = new Map();
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.md') || f === '_index.md') continue;
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    out.set(f.replace(/\.md$/, ''), text.includes(def.marker + ': true'));
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const def = TYPES[args.type];
  if (!def) {
    console.error('\n  usage: node scripts/content/apply.js --type ' + Object.keys(TYPES).join('|'));
    process.exit(2);
  }
  // Require via the same module name the endpoint uses, so the file and
  // the API can never disagree about which queue they mean.
  const queueFile = { articles: 'article-queue', specials: 'specials-queue', testimonials: 'testimonials-queue' }[args.type];
  const queue = require('../../netlify/functions/utils/' + queueFile);

  const dir = contentDir(def);
  console.log('\n' + C.bold + 'Applying ' + def.label + ' queue' + C.reset);

  const listed = await queue.list();
  if (!listed.ok) {
    console.log('  ' + C.yellow + 'skip' + C.reset + '  queue unavailable (' + listed.reason + ') -- nothing to apply');
    return;
  }
  const pending = listed.rows.filter((r) => r.status === 'pending' && r.fields && Object.keys(r.fields).length);
  if (!pending.length) {
    console.log('  ' + C.dim + 'no pending ' + def.label + C.reset);
    return;
  }

  const existing = managedFiles(def, dir);
  fs.mkdirSync(dir, { recursive: true });

  const syncedAt = new Date().toISOString().slice(0, 10);
  const appliedEntries = [];
  let changed = 0;
  let skipped = 0;

  for (const row of pending) {
    const hasFile = existing.has(row.slug);
    if (hasFile && existing.get(row.slug) === false) {
      console.log('  ' + C.red + 'skip' + C.reset + '  ' + row.slug + ' -- a hand-written file owns that slug');
      skipped += 1;
      continue;
    }
    const file = path.join(dir, row.slug + '.md');
    const next = renderContent(def, row.fields, syncedAt);
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== next) {
      changed += 1;
      if (!args.dryRun) fs.writeFileSync(file, next);
      console.log('  ' + C.green + (args.dryRun ? 'would write' : 'wrote') + C.reset + '  ' + row.slug + '.md');
    } else {
      console.log('  ' + C.dim + 'unchanged' + C.reset + '  ' + row.slug + '.md');
    }
    appliedEntries.push({ slug: row.slug, upTo: row.updatedAt });
  }

  if (args.dryRun) {
    console.log('\n  ' + C.yellow + 'Dry run -- nothing written, nothing marked.' + C.reset + '\n');
    return;
  }
  if (appliedEntries.length) {
    const m = await queue.markApplied(appliedEntries);
    if (m.ok) console.log('  ' + C.green + m.applied + ' row(s) marked applied' + C.reset);
    else console.log('  ' + C.yellow + 'rows could not be marked applied (' + m.reason + ')' + C.reset);
  }
  console.log('\n  ' + C.green + 'Done.' + C.reset + ' ' + changed + ' file(s) written, ' + skipped + ' skipped. Commit, then build and deploy.\n');
}

main().catch((err) => {
  console.error('\n  content:apply crashed: ' + (err.stack || err.message) + '\n');
  process.exit(1);
});
