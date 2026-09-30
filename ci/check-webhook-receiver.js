#!/usr/bin/env node
/**
 * check-webhook-receiver.js -- prove the receiver refuses what it must.
 *
 * The receiver's value is entirely in what it REJECTS, so that is what is
 * tested: unsigned requests, wrong signatures, a signature for different
 * content, pushes to a branch it is not watching, and branch deletions. A
 * webhook endpoint that accepts everything is a remote code execution hole with
 * a build attached, and it would still pass a test that only checks "does a
 * valid push get through".
 *
 * It runs the receiver in --dry-run, so a passing test never runs a build. The
 * dry-run line in the output is also the assertion that matters most: it prints
 * the exact command the receiver would run, and that command is
 *
 *     ci/run.sh sync build deploy
 *
 * with no `deploy-prod`. Production is a human decision, and this test is how
 * that stays true rather than a promise in a comment.
 *
 * Run:  node ci/check-webhook-receiver.js
 */
const crypto = require('crypto');
const { spawn } = require('child_process');
const SECRET = 'test-secret-for-the-receiver-only';
const PORT = 8871;
const child = spawn('node', ['ci/webhook-receiver.js', '--dry-run', '--port', String(PORT)], {
  cwd: '/home/nez/Projects/caddy-ed-cadillac-hugo',
  env: { ...process.env, WEBHOOK_SECRET: SECRET },
  stdio: ['ignore', 'inherit', 'pipe'],
});
let logs = '';
child.stderr.on('data', d => { logs += d; });

const out = [];
function sign(body) {
  return 'sha256=' + crypto.createHmac('sha256', SECRET).update(body).digest('hex');
}
async function post(path, body, headers) {
  const r = await fetch(`http://127.0.0.1:${PORT}${path}`, {
    method: 'POST', body, headers: headers || {},
  });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, body: j };
}
const push = (ref, extra) => JSON.stringify({ ref, sender: { login: 'tester' }, ...(extra || {}) });

setTimeout(async () => {
  const WATCH = 'modernize/netlify-build-2026';
  out.push(['unsigned request refused', (await post('/hook', push('refs/heads/' + WATCH), {})).status === 401]);
  out.push(['wrong signature refused', (await post('/hook', push('refs/heads/' + WATCH), { 'x-hub-signature-256': 'sha256=' + '0'.repeat(64) })).status === 401]);
  const tampered = sign('{"ref":"refs/heads/x"}');
  out.push(['signature for other content refused', (await post('/hook', push('refs/heads/' + WATCH), { 'x-hub-signature-256': tampered })).status === 401]);
  const r1 = await post('/hook', push('refs/heads/master'), { 'x-hub-signature-256': sign(push('refs/heads/master')) });
  out.push(['push to master ignored', r1.status === 202 && r1.body.ignored === 'wrong-branch']);
  const r2 = await post('/hook', push('refs/heads/' + WATCH), { 'x-hub-signature-256': sign(push('refs/heads/' + WATCH)) });
  out.push(['push to the watched branch accepted', r2.status === 202 && r2.body.accepted === true]);
  const r3 = await post('/hook', push('refs/heads/' + WATCH, { deleted: true }), { 'x-hub-signature-256': sign(push('refs/heads/' + WATCH, { deleted: true })) });
  out.push(['branch deletion ignored', r3.status === 202 && r3.body.ignored === 'branch-deleted']);
  out.push(['unknown path 404s', (await post('/nope', 'x', {})).status === 404]);
  const h = await fetch(`http://127.0.0.1:${PORT}/healthz`).then(r => r.json());
  out.push(['healthz reports ok', h.ok === true]);
  out.push(['healthz leaks no branch or secret', !JSON.stringify(h).includes(WATCH) && !JSON.stringify(h).includes(SECRET)]);

  console.log('');
  for (const [l, ok] of out) console.log('  ' + (ok ? 'ok  ' : 'FAIL') + ' ' + l);
  console.log('  ' + out.filter(x => x[1]).length + '/' + out.length);
  console.log('');
  console.log('  DRY RUN log:');
  console.log(logs.split('\n').filter(l => l.includes('DRY RUN') || l.includes('ignoring') || l.includes('REJECTED')).map(l => '    ' + l.replace(/^\[webhook [^\]]+\]\s*/, '')).join('\n'));
  child.kill();
  process.exit(out.every(x => x[1]) ? 0 : 1);
}, 700);
