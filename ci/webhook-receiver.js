#!/usr/bin/env node
/**
 * webhook-receiver.js -- a git push should rebuild the site.
 *
 * WHY THIS EXISTS
 * ---------------
 * The Decap CMS commits to git. netlify.toml sets `[build] command = ""`
 * because this site deploys PREBUILT from the CI host, spending no Netlify
 * build minutes. So a CMS save produced a commit and no build, and the editor
 * saw "Saved" over an unchanged website. See docs/ADMIN.md.
 *
 * This closes that gap for the CI host: a git push to the watched branch runs
 * `ci/run.sh sync build deploy`, which rebuilds in the podman image and uploads
 * a DEPLOY PREVIEW. No Netlify build minutes, because nothing runs on Netlify.
 *
 * IT NEVER DEPLOYS TO PRODUCTION
 * ------------------------------
 * Not as a policy -- as a refusal. `deploy-prod` is not in the command this
 * process will run, and the production flag is refused if it appears in
 * configuration. Production deploys stay a deliberate human act.
 *
 * This was asked for explicitly: CMS saves should show up somewhere real, and
 * nothing should go live on its own.
 *
 * WHAT IT REFUSES
 * ---------------
 *   - a request with no valid `X-Hub-Signature-256`. Checked with
 *     timingSafeEqual before the body is parsed, so a forged push is not even
 *     distinguishable from a real one in timing.
 *   - a push to any branch but the watched one. A CMS save to `master` must not
 *     build the modernised site.
 *   - a second build while one is running. Decap commits per field save, and
 *     three saves in a minute is one build, not three.
 *   - anything containing `--prod`.
 *
 * RUN
 * ---
 *   node ci/webhook-receiver.js --dry-run          # verify, never build
 *   node ci/webhook-receiver.js --port 8801        # actually build previews
 *   node ci/webhook-receiver.js --branch NAME      # watch a different branch
 *
 * The secret is read from the environment, never from a file in the repo:
 *   WEBHOOK_SECRET   the shared secret, same value as the GitHub webhook's
 *   WEBHOOK_BRANCH   branch to watch   (default: the current one)
 *   WEBHOOK_LOG      log file          (default: stderr)
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { execFile } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const DRY_RUN = args.includes('--dry-run');
const PORT = Number(flag('--port', process.env.WEBHOOK_PORT || 8801));
const BRANCH = flag('--branch', process.env.WEBHOOK_BRANCH || 'modernize/netlify-build-2026');
const SECRET = process.env.WEBHOOK_SECRET || '';

function log(line) {
  const stamp = new Date().toISOString();
  process.stderr.write(`[webhook ${stamp}] ${line}\n`);
}

if (!SECRET) {
  log('FATAL: WEBHOOK_SECRET is not set.');
  log('With no secret, every request would be rejected -- including the real one.');
  log('Generate one:  openssl rand -hex 32');
  process.exit(1);
}

// A production deploy is refused here rather than merely not being used, so a
// future edit that adds it to the command below fails loudly at startup instead
// of quietly going live.
if (/--prod/.test(JSON.stringify(args)) || /--prod/.test(String(process.env.WEBHOOK_BRANCH || ''))) {
  log('FATAL: refusing to run with a --prod flag in the configuration.');
  process.exit(1);
}

let building = false;
let queued = false;

function verifySignature(rawBody, header) {
  if (!header || !header.startsWith('sha256=')) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', SECRET).update(rawBody).digest('hex');
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  // Length first: timingSafeEqual throws on a length mismatch, and a thrown
  // error here would be a 500, which tells a prober they got further than they did.
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function runBuild(reason) {
  if (building) {
    queued = true;
    log('a build is already running; coalescing this one into it');
    return;
  }
  building = true;
  if (DRY_RUN) {
    log(`DRY RUN: would run  ci/run.sh sync build deploy   (${reason})`);
    building = false;
    return;
  }

  log(`starting: ci/run.sh sync build deploy   (${reason})`);
  // `deploy`, never `deploy-prod`. This is the whole point of the receiver.
  const child = execFile(
    'bash',
    [path.join(ROOT, 'ci', 'run.sh'), 'sync', 'build', 'deploy'],
    { cwd: ROOT, timeout: 45 * 60 * 1000, maxBuffer: 32 * 1024 * 1024 },
    (err, stdout, stderr) => {
      building = false;
      const tail = String(stdout || '').split('\n').slice(-14).join('\n');
      if (err) {
        log(`BUILD FAILED (${err.message}). Last output:\n${tail}\n${String(stderr || '').split('\n').slice(-8).join('\n')}`);
      } else {
        log(`build finished. Last output:\n${tail}`);
      }
      if (queued) {
        queued = false;
        log('a push arrived during the build; running once more');
        runBuild('coalesced push');
      }
    }
  );
  child.on('error', (e) => {
    building = false;
    log(`could not start the build: ${e.message}`);
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/healthz') {
    // Deliberately unauthenticated and deliberately dull: it reports that the
    // receiver is up and idle. It does not reveal the branch, the secret, or
    // whether a build is in flight.
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, building }));
    return;
  }

  if (req.method !== 'POST' || req.url !== '/hook') {
    res.writeHead(404).end('not found');
    return;
  }

  const chunks = [];
  req.on('data', (c) => {
    chunks.push(c);
    // A push payload is a few hundred KB. Anything larger is not a push, and
    // buffering it would be a way to take this process down.
    if (chunks.reduce((n, x) => n + x.length, 0) > 2 * 1024 * 1024) req.destroy();
  });

  req.on('end', () => {
    const raw = Buffer.concat(chunks).toString('utf8');

    if (!verifySignature(raw, req.headers['x-hub-signature-256'])) {
      log('REJECTED: bad or missing signature');
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'bad-signature' }));
      return;
    }

    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      res.writeHead(400).end(JSON.stringify({ error: 'invalid-json' }));
      return;
    }

    // Only pushes. A ping or a pull-request event on a signed request is not a
    // reason to spend a build.
    if (!/^refs\/heads\//.test(payload.ref || '')) {
      res.writeHead(202).end(JSON.stringify({ ignored: 'not-a-branch-push' }));
      return;
    }

    const branch = String(payload.ref).replace('refs/heads/', '');
    if (branch !== BRANCH) {
      // A CMS save that lands on the wrong branch must NOT build this site. The
      // config was wrong once already -- it targeted `master`, eight months
      // stale -- and that is exactly the failure this guard exists to stop.
      log(`ignoring push to ${branch}; watching ${BRANCH}`);
      res.writeHead(202).end(JSON.stringify({ ignored: 'wrong-branch', branch, watching: BRANCH }));
      return;
    }

    // A delete of the branch is not a build.
    if (payload.deleted) {
      res.writeHead(202).end(JSON.stringify({ ignored: 'branch-deleted' }));
      return;
    }

    log(`push to ${branch} by ${(payload.sender && payload.sender.login) || 'unknown'}`);
    runBuild(`push to ${branch}`);

    res.writeHead(202, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ accepted: true, building, watch: BRANCH }));
  });
});

server.listen(PORT, '127.0.0.1', () => {
  log(`listening on 127.0.0.1:${PORT}${DRY_RUN ? '  (DRY RUN -- no build will run)' : ''}`);
  log(`watching branch: ${BRANCH}`);
  log('deploy target:   preview only. `deploy-prod` is never invoked here.');
  log('reverse-proxy this to a public URL and point the GitHub webhook at /hook');
});

process.on('SIGTERM', () => {
  log('SIGTERM; not interrupting an in-flight build, exiting when it settles');
  if (!building) process.exit(0);
  setTimeout(() => process.exit(0), 60_000).unref();
});
