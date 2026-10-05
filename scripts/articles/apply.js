#!/usr/bin/env node

/**
 * articles:apply -- turn queued article rows into site/content/articles/*.md.
 *
 *   npm run articles:apply             apply pending rows, mark them applied
 *   npm run articles:apply -- --dry-run   report, write nothing, mark nothing
 *
 * The rows are written by /admin/articles (or by an agent through
 * articles-admin; see docs/CONTENT-API.md). This script is the only thing
 * that touches the content files, which keeps one rule true: files in
 * site/content/articles/ are either hand-written (no marker; never touched)
 * or managed by this tool (article_queue: true; rewritten from the row).
 *
 * The same snapshot rule as vehicle edits: rows are marked applied with the
 * updated_at they carried when read, so an article saved WHILE this runs
 * stays pending for the next apply.
 *
 * No database access: one clear line, exit 0. Applying is a step a human
 * runs where the credentials live; it must never be a step that fails a
 * build.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ArticleQueue = require('../../netlify/functions/utils/article-queue');

const CONTENT_DIR = process.env.ARTICLES_CONTENT_DIR
  ? path.resolve(process.env.ARTICLES_CONTENT_DIR)
  : path.join(__dirname, '..', '..', 'site', 'content', 'articles');

const MARKER = 'article_queue';

const C = { reset: '\x1b[0m', dim: '\x1b[2m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', bold: '\x1b[1m' };

function yamlScalar(v) {
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  const s = String(v);
  if (/^[\d.]+$/.test(s)) return String(Number(s));
  return /^[\s>|*&!%@`{}\[\],#-]|:\s|\s$|^$/.test(s) ? JSON.stringify(s) : s;
}

function renderArticle(slug, fields, syncedAt) {
  const lines = ['---'];
  lines.push('title: ' + JSON.stringify(String(fields.title)));
  if (fields.description) lines.push('description: ' + JSON.stringify(String(fields.description)));
  lines.push('date: ' + (fields.date || syncedAt || new Date().toISOString().slice(0, 10)));
  if (fields.author) lines.push('author: ' + JSON.stringify(String(fields.author)));
  if (fields.image) lines.push('image: ' + String(fields.image));
  if (Array.isArray(fields.tags) && fields.tags.length) {
    lines.push('tags:');
    for (const t of fields.tags) lines.push('  - ' + yamlScalar(t));
  }
  if (fields.published === false) lines.push('draft: true');
  lines.push(MARKER + ': true');
  lines.push(MARKER + '_synced: ' + syncedAt);
  lines.push('---', '');
  return lines.join('\n') + String(fields.body || '').replace(/\s+$/, '') + '\n';
}

function managedFiles() {
  if (!fs.existsSync(CONTENT_DIR)) return new Map();
  const out = new Map();
  for (const f of fs.readdirSync(CONTENT_DIR)) {
    if (!f.endsWith('.md') || f === '_index.md') continue;
    const text = fs.readFileSync(path.join(CONTENT_DIR, f), 'utf8');
    out.set(f.replace(/\.md$/, ''), text.includes(MARKER + ': true'));
  }
  return out;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run') || process.argv.includes('-n');
  console.log('\n' + C.bold + 'Applying article queue' + C.reset);

  const listed = await ArticleQueue.list();
  if (!listed.ok) {
    console.log('  ' + C.yellow + 'skip' + C.reset + '  queue unavailable (' + listed.reason + ') -- nothing to apply');
    return;
  }
  const pending = listed.rows.filter((r) => r.status === 'pending' && r.fields && Object.keys(r.fields).length);
  if (!pending.length) {
    console.log('  ' + C.dim + 'no pending articles' + C.reset);
    return;
  }

  const existing = managedFiles();
  fs.mkdirSync(CONTENT_DIR, { recursive: true });

  const syncedAt = new Date().toISOString().slice(0, 10);
  const appliedEntries = [];
  let changed = 0;
  let skipped = 0;

  for (const row of pending) {
    const hasFile = existing.has(row.slug);
    if (hasFile && existing.get(row.slug) === false) {
      console.log('  ' + C.red + 'skip' + C.reset + '  ' + row.slug + ' -- a hand-written article owns that slug');
      skipped += 1;
      continue;
    }
    const file = path.join(CONTENT_DIR, row.slug + '.md');
    const next = renderArticle(row.slug, row.fields, syncedAt);
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== next) {
      changed += 1;
      if (!dryRun) fs.writeFileSync(file, next);
      console.log('  ' + C.green + (dryRun ? 'would write' : 'wrote') + C.reset + '  ' + row.slug + '.md');
    } else {
      console.log('  ' + C.dim + 'unchanged' + C.reset + '  ' + row.slug + '.md');
    }
    appliedEntries.push({ slug: row.slug, upTo: row.updatedAt });
  }

  if (dryRun) {
    console.log('\n  ' + C.yellow + 'Dry run -- nothing written, nothing marked.' + C.reset + '\n');
    return;
  }
  if (appliedEntries.length) {
    const m = await ArticleQueue.markApplied(appliedEntries);
    if (m.ok) console.log('  ' + C.green + m.applied + ' row(s) marked applied' + C.reset);
    else console.log('  ' + C.yellow + 'rows could not be marked applied (' + m.reason + ')' + C.reset);
  }
  console.log('\n  ' + C.green + 'Done.' + C.reset + ' ' + changed + ' file(s) written, ' + skipped + ' skipped. Commit, then build and deploy.\n');
}

main().catch((err) => {
  console.error('\n  articles:apply crashed: ' + (err.stack || err.message) + '\n');
  process.exit(1);
});
