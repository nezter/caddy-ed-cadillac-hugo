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

/* --- header rules: one Cache-Control per file, or none --- */
/*
 * Netlify COMBINES every matching header rule instead of picking one
 * (answers.netlify.com, Netlify staff). Two rules that can match the same
 * file and both set Cache-Control therefore ship a contradictory header --
 * which is how /img/* ended up with a duplicated rule AND a hashed-
 * derivative rule whose `immutable` could never be the only value served.
 * The glob overlap test below is deliberately conservative: static prefixes
 * that contain one another count as an overlap, because this gate's job is
 * to catch the NEXT clever pattern before a browser does.
 */
{
  const blocks = [...toml.matchAll(/\[\[headers\]\]\s*\n\s*for\s*=\s*"([^"]+)"\s*\n([\s\S]*?)(?=\n\[\[|\n?$)/g)];
  const patterns = blocks.map((b) => b[1]);
  const dupes = patterns.filter((p, i) => patterns.indexOf(p) !== i);
  check('no duplicate header rules for the same path', dupes.length === 0, dupes.join(', '));

  const withCC = blocks
    .filter((b) => /Cache-Control/.test(b[2]))
    .map((b) => {
      const star = b[1].indexOf('*');
      return { pattern: b[1], prefix: star === -1 ? b[1] : b[1].slice(0, star) };
    });
  const clashes = [];
  for (let i = 0; i < withCC.length; i++) {
    for (let j = i + 1; j < withCC.length; j++) {
      const a = withCC[i], b = withCC[j];
      if (a.prefix.startsWith(b.prefix) || b.prefix.startsWith(a.prefix)) {
        clashes.push(a.pattern + ' vs ' + b.pattern);
      }
    }
  }
  check('no two Cache-Control rules can match the same file (Netlify combines them)', clashes.length === 0, clashes.join(', '));
}

/* --- preview contexts negate every sensitive env var the code reads --- */
{
  const REQUIRED = [
    'JWT_SECRET', 'DATABASE_URL', 'TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN', 'SUPABASE_SERVICE_ROLE_KEY',
    'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET',
    'FACEBOOK_PAGE_TOKEN', 'X_BEARER_TOKEN', 'INSTAGRAM_ACCESS_TOKEN', 'RECAPTCHA_SECRET_KEY',
    'CRM_API_KEY', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_PG_HOST', 'SUPABASE_PG_PASSWORD',
    'REDIS_URL', 'UPSTASH_REDIS_REST_TOKEN', 'INVENTORY_SOURCE_TOKEN',
  ];
  for (const ctx of ['deploy-preview', 'branch-deploy']) {
    const part = toml.split('[context.' + ctx + '.environment]')[1] || '';
    const blockText = part.split(/\n\[/)[0];
    const missing = REQUIRED.filter((k) => !new RegExp('^\\s*' + k + '\\s*=', 'm').test(blockText));
    check('context ' + ctx + ' negates every sensitive env marker', missing.length === 0, missing.join(', '));
  }
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

/* --- deploy workflows: the launch path itself --- */
{
  const D = String.fromCharCode(36);
  const wf = (name) => fs.readFileSync(path.join(ROOT, '.github', 'workflows', name), 'utf8');
  const deploy = wf('deploy.yml');
  const dev = wf('deploy-dev.yml');

  // YAML validity, parsed for real (a mangled expression would fail here).
  let parsable = true;
  try {
    const yaml = require(path.join(ROOT, 'netlify', 'functions', 'node_modules', 'js-yaml'));
    yaml.load(deploy); yaml.load(dev);
  } catch (e) { parsable = false; }
  check('both deploy workflows parse as YAML', parsable);

  // The pipeline that writes files has, once, rewritten a GitHub expression
  // to three stars; the workflow then failed to parse. Nothing in a workflow
  // file is ever a secret VALUE, so three stars must never appear.
  const stars = (text) => (text.match(/\*{3}/g) || []).length;
  check('no redaction-mangled *** in workflows', stars(deploy) === 0 && stars(dev) === 0, 'deploy:' + stars(deploy) + ' dev:' + stars(dev));

  // Every env that carries the Netlify token must resolve from secrets.
  const tokenLines = deploy.split(/\r?\n/).filter((l) => l.includes('NETLIFY_AUTH_TOKEN:'));
  check('deploy.yml takes the token from secrets only',
    tokenLines.length > 0 && tokenLines.every((l) => l.split('NETLIFY_AUTH_TOKEN:')[1].trim().startsWith(D + '{')),
    tokenLines.length + ' lines');

  // Prod-only: --prod exactly once, in deploy.yml's command; the dev lane
  // must NOT carry it even in command shape.
  const cmdLines = (text) => text.split(/\r?\n/).filter((l) => /netlify deploy/.test(l) && !/^\s*#/.test(l));
  const deployCmds = cmdLines(deploy).join('\n');
  const devCmds = cmdLines(dev).join('\n');
  check('deploy.yml publishes with --prod', /--prod\b/.test(deployCmds));
  check('deploy-dev.yml never uses --prod', !/--prod\b/.test(devCmds));
  check('deploy-dev.yml keeps its stable alias', /--alias/.test(devCmds));

  // Both build the same way, on the same runner, with the same guards.
  for (const [name, text] of [['deploy.yml', deploy], ['deploy-dev.yml', dev]]) {
    check(name + ' builds via ci/run.sh on the runner', text.includes('./ci/run.sh build') && text.includes('REMOTE_WORKDIR'));
    check(name + ' runs the asset gate and cleans up', text.includes('verify-build.js site/public') && text.includes('if: always()'));
  }
  // The credential fallback restores the ORIGINAL pipeline: the netlify CLI
  // login living on the runner host (commit 52d88e8). Dropping it silently
  // would demand a second copy of a token that already exists.
  for (const [name, text] of [['deploy.yml', deploy], ['deploy-dev.yml', dev]]) {
    check(name + ' accepts the host netlify login as a credential fallback',
      text.includes('MODE=hostconfig') && text.includes('MOUNT_ARGS') && text.includes('.config/netlify/config.json'));
  }
  check('deploy.yml stays confirmation-gated', deploy.includes('inputs.confirm') || deploy.includes('inputs confirm') || /confirm/.test(deploy));
  check('only the production workflow declares the production environment',
    /environment:\s*production/.test(deploy) && !/environment:\s*production/.test(dev));
}

const failed = results.filter((x) => !x.pass);
for (const x of results) console.log('  ' + (x.pass ? 'ok  ' : 'FAIL') + '  ' + x.label + (x.pass ? '' : '  -- ' + x.detail));
console.log('\n  ' + (results.length - failed.length) + '/' + results.length + (failed.length ? ' -- FAILURES' : ' ok'));
process.exit(failed.length ? 1 : 0);
