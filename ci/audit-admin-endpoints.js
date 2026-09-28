const fs = require('fs');
const path = require('path');
const ROOT = '/site';

// The admin-reachable front end: whatever any /admin/* page loads, plus the
// partials they render.
const scripts = new Set();
for (const f of fs.readdirSync(`${ROOT}/site/content/admin`)) {
  if (!f.endsWith('.md')) continue;
  const t = fs.readFileSync(`${ROOT}/site/content/admin/${f}`, 'utf8');
  const m = t.match(/scripts:\s*\n((?:\s*-\s*\S+\s*\n?)+)/);
  if (!m) continue;
  for (const line of m[1].split('\n')) {
    const s = line.replace(/^\s*-\s*/, '').trim();
    if (s.endsWith('.js')) scripts.add(s.replace(/^components\//, ''));
  }
}

// Every endpoint any of those scripts calls.
const called = new Map(); // endpoint -> [files]
function walk(file) {
  if (called.has(file)) return;
  const p = `${ROOT}/site/assets/js/${file}`;
  if (!fs.existsSync(p)) return;
  called.set(file, []);
  const t = fs.readFileSync(p, 'utf8');
  for (const m of t.matchAll(/functions\/([a-z][a-z0-9-]*)/g)) {
    called.get(file).push(m[1]);
  }
  for (const m of t.matchAll(/from\s+['"]\.\/([\w./-]+)['"]|require\(['"]\.\/([\w./-]+)['"]\)/g)) {
    const dep = (m[1] || m[2] || '').split('/').pop();
    if (dep && dep.endsWith('.js')) walk(dep);
  }
}
for (const s of scripts) walk(s);

const all = new Set();
for (const list of called.values()) for (const e of list) all.add(e);

const exists = new Set(
  fs.readdirSync(`${ROOT}/netlify/functions`)
    .filter((f) => f.endsWith('.js'))
    .map((f) => f.replace(/\.js$/, ''))
);

const missing = [...all].filter((e) => !exists.has(e)).sort();
console.log(`  admin scripts loaded      : ${[...scripts].join(', ')}`);
console.log(`  distinct endpoints called : ${all.size}`);
console.log(`  endpoints that DO NOT EXIST: ${missing.length}`);
for (const m of missing) {
  const users = [...called.entries()].filter(([, l]) => l.includes(m)).map(([f]) => f);
  console.log(`    ${m}  <- ${users.join(', ')}`);
}
