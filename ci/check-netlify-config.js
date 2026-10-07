#!/usr/bin/env node
/**
 * check-netlify-config.js -- one platform policy, enforced.
 *
 * WHY THIS EXISTS
 * ---------------
 * netlify.toml is the deploy contract, and the rules that matter had been
 * living in comments: the CSP was copied into netlify.toml, nginx.preview,
 * and two strings in security-middleware, and it had already drifted --
 * origins nobody used (unpkg, Google Fonts, Supabase, cdnjs) sat in policies
 * next to the two origins the site actually needs (Identity for the CMS
 * login, Google for the forms' reCAPTCHA). A policy nobody checks is a
 * policy that rots. This gate is the check.
 *
 * WHAT IT CHECKS
 * --------------
 *   - [build]: publish dir, deliberately empty command; [functions] dir exists
 *   - Node pin is ONE number across netlify.toml, .nvmrc, .tool-versions,
 *     ci/Containerfile
 *   - preview/branch contexts exist and still carry the marker credentials
 *   - every redirect target resolves (a function file, or a static file)
 *   - the global header block carries HSTS, nosniff and a CSP
 *   - the two CSP copies (netlify.toml, nginx.preview.conf) are identical
 *     after normalisation, and no BCSP copy anywhere still names a stale
 *     origin (unpkg, fonts.googleapis, cdnjs, jsdelivr, supabase)
 *   - no legacy _headers/_redirects files shadow the toml
 *   - the articles feed is configured (outputs RSS) and advertised in the head
 *
 * Run:  node ci/check-netlify-config.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const results = [];
const check = (label, pass, detail) =>
  results.push({ label, pass: Boolean(pass), detail: detail === undefined ? '' : String(detail) });

const toml = fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8');

/* --- build + functions --- */
check('publish dir is site/public', /publish\s*=\s*"site\/public"/.test(toml));
check('build command is deliberately empty', /command\s*=\s*""/.test(toml));
check('functions directory declared and present',
  /directory\s*=\s*"netlify\/functions"/.test(toml) && fs.existsSync(path.join(ROOT, 'netlify', 'functions')));

/* --- one Node number everywhere --- */
{
  const m = toml.match(/NODE_VERSION\s*=\s*"(\d+)/);
  const fromToml = m ? m[1] : '';
  const nvmrc = fs.readFileSync(path.join(ROOT, '.nvmrc'), 'utf8').trim();
  const toolVersions = fs.readFileSync(path.join(ROOT, '.tool-versions'), 'utf8').match(/nodejs\s+(\d+)/);
  const container = fs.readFileSync(path.join(ROOT, 'ci', 'Containerfile'), 'utf8').match(/ARG NODE_TAG=(\d+)/);
  const all = [fromToml, nvmrc, toolVersions && toolVersions[1], container && container[1]];
  check('Node pin identical across toml/.nvmrc/.tool-versions/Containerfile',
    all[0] && all.every((x) => x === all[0]), all.join(' vs '));
}

/* --- contexts --- */
for (const ctx of ['deploy-preview', 'branch-deploy']) {
  const block = toml.split('[context.' + ctx + '.environment]')[1];
  check('context "' + ctx + '" exists with marker credentials',
    Boolean(block) && /JWT_SECRET/.test(block.split('\n[')[0]) && /TURSO_DATABASE_URL/.test(block.split('\n[')[0]));
}

/* --- redirects resolve --- */
{
  const targets = [...toml.matchAll(/to\s*=\s*"([^"]+)"/g)].map((m) => m[1]);
  const bad = [];
  for (const t of targets) {
    const fn = t.match(/^\/\.netlify\/functions\/([a-z0-9-]+)/);
    if (fn) {
      if (!fs.existsSync(path.join(ROOT, 'netlify', 'functions', fn[1] + '.js'))) bad.push(t);
      continue;
    }
    const plain = t.match(/^\/([a-z0-9._-]+)$/i);
    if (plain && plain[1].includes('.')) {
      if (!fs.existsSync(path.join(ROOT, 'site', 'static', plain[1]))) bad.push(t);
    }
  }
  check('every redirect target resolves', bad.length === 0, bad.join(', '));
}

/* --- global headers --- */
{
  const hasGlobal = /\[\[headers\]\][\s\S]*?for\s*=\s*"\/\*"[\s\S]*?Strict-Transport-Security/.test(toml);
  check('global headers carry HSTS', hasGlobal);
  check('global headers carry nosniff', /X-Content-Type-Options\s*=\s*"nosniff"/.test(toml));
  check('global headers carry a CSP', /Content-Security-Policy\s*=\s*"/.test(toml));
}

/* --- CSP copies agree + no stale origins anywhere --- */
{
  const norm = (s) => s.replace(/\s+/g, ' ').replace(/;\s*/g, '; ').trim();
  const tomlCsp = (toml.match(/Content-Security-Policy\s*=\s*"([^"]+)"/) || [])[1] || '';
  const nginx = fs.readFileSync(path.join(ROOT, 'ci', 'nginx.preview.conf'), 'utf8');
  const nginxCsp = (nginx.match(/Content-Security-Policy "([^"]+)"/) || [])[1] || '';
  check('both CSP copies exist', Boolean(tomlCsp) && Boolean(nginxCsp));
  check('the two CSP copies are identical (normalised)', norm(tomlCsp) === norm(nginxCsp || '').replace(/ always$/, ''), (tomlCsp ? '' : 'toml ') + (nginxCsp ? '' : 'nginx '));

  const middleware = fs.readFileSync(path.join(ROOT, 'netlify', 'functions', 'utils', 'security-middleware.js'), 'utf8');
  const stale = ['unpkg.com', 'fonts.googleapis.com', 'cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'supabase.co'];
  const offenders = [];
  const haystacks = { 'netlify.toml': tomlCsp, 'nginx.preview.conf': nginxCsp, 'security-middleware': middleware };
  for (const [name, text] of Object.entries(haystacks)) {
    for (const origin of stale) if (text.includes(origin)) offenders.push(name + ':' + origin);
  }
  check('no CSP copy names a stale origin', offenders.length === 0, offenders.join(', '));
  check('CSP keeps the origins the site actually needs',
    tomlCsp.includes('identity.netlify.com') && tomlCsp.includes('www.google.com') && tomlCsp.includes('www.gstatic.com'));
}

/* --- legacy files must not shadow the toml --- */
check('no legacy _headers/_redirects in site/static',
  !fs.existsSync(path.join(ROOT, 'site', 'static', '_headers')) && !fs.existsSync(path.join(ROOT, 'site', 'static', '_redirects')));

/* --- feed --- */
{
  const idx = fs.readFileSync(path.join(ROOT, 'site', 'content', 'articles', '_index.md'), 'utf8');
  check('articles feed is configured (outputs RSS)', /outputs:\s*\[[^\]]*RSS/.test(idx));
  const head = fs.readFileSync(path.join(ROOT, 'site', 'layouts', 'partials', 'head-meta.html'), 'utf8');
  check('feed discovery link in head', /application\/rss\+xml/.test(head));
}

const failed = results.filter((x) => !x.pass);
for (const x of results) console.log('  ' + (x.pass ? 'ok  ' : 'FAIL') + '  ' + x.label + (x.pass ? '' : '  -- ' + x.detail));
console.log('\n  ' + (results.length - failed.length) + '/' + results.length + (failed.length ? ' -- FAILURES' : ' ok'));
process.exit(failed.length ? 1 : 0);
