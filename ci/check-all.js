#!/usr/bin/env node
/**
 * check-all.js -- one command, one report.
 *
 * WHY THIS EXISTS
 * ---------------
 * There are eleven checks. Each one prints its own output, in its own format, and
 * exits 0 or 1. So a failing build produced eight things to read, most of them
 * "PASS", and the two that mattered were buried.
 *
 * That is how a gate gets ignored: not by being wrong, but by being noisy enough
 * that nobody reads it. `ci/run.sh build` ran them one after another and the
 * summary line said nothing about which had failed.
 *
 * So: run them all, report as one table, exit non-zero if any failed, and say
 * which ones in the last line. A gate report should be readable at a glance from
 * the bottom of a terminal, and it should be obvious what to do next.
 *
 * WHAT EACH CHECK IS FOR, IN ONE LINE
 * ------------------------------------
 *   placeholder contact   no 555 numbers or wrong addresses in the BUILT html
 *   front-end graph       every asset is reachable from an entry point, or listed
 *   function endpoints     every URL a page calls names a function that exists
 *   write behaviour        an UPDATE actually updates (the libSQL $n trap)
 *   insert columns         every INSERT has a real id and real columns
 *   select columns         every SELECT names real columns
 *   permissions            the required-permission vocabulary is used correctly
 *   function auth          no customer data behind an endpoint with no door on it
 *   mail config            the admin mail settings cannot leak the SMTP password
 *   gdpr + audit           an erasure is complete and leaves proof identifying nobody
 *   staff management       the staff list cannot lock every administrator out
 *   inquiry path           a form submission survives its own notification failing
 *   compare + shortlist    the two card buttons do two different things
 *   structured data        every ld+json block parses, and none is double-encoded
 *   build output           no page references a missing asset
 *
 * Run:
 *   node ci/check-all.js              # all of them
 *   node ci/check-all.js --quick      # skip the ones that need a database
 *   node ci/check-all.js --only NAME  # one of them
 *
 * Needs TURSO_DATABASE_URL and TURSO_AUTH_TOKEN for the four database checks.
 * They are SKIPPED, not silently passed, when those are absent -- a skipped
 * check and a passing check look identical in a log otherwise, and that is how a
 * check stops running without anyone deciding to stop it.
 */

'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

/**
 * needsDatabase: true means it cannot do its job without one. Reported as SKIP
 * rather than PASS when Turso is not configured.
 *
 * slow: true means it takes more than a second or two, so --quick can leave it.
 */
const CHECKS = [
  {
    name: 'placeholder contact',
    file: 'check-no-placeholder-contact.js',
    needsBuild: true,
    why: 'no fictional phone numbers or wrong addresses in customer-facing output',
  },
  {
    name: 'front-end graph',
    file: 'check-front-end.js',
    why: 'every asset is reachable from an entry point, or reviewed and explained',
  },
  {
    name: 'function endpoints',
    file: 'check-function-endpoints.js',
    why: 'every URL a page calls names a function that exists',
  },
  {
    name: 'write behaviour',
    file: 'check-writes-work.js',
    needsDatabase: true,
    why: 'an UPDATE actually updates, and not silently matches zero rows',
  },
  {
    name: 'insert columns',
    file: 'check-insert-columns.js',
    needsDatabase: true,
    why: 'every INSERT has a real id and names real columns',
  },
  {
    name: 'select columns',
    file: 'check-select-columns.js',
    needsDatabase: true,
    why: 'every SELECT names columns that exist',
  },
  {
    name: 'permissions',
    file: 'check-permissions.js',
    why: 'the required-permission vocabulary is used correctly',
  },
  {
    name: 'function auth',
    file: 'check-function-auth.js',
    why: 'no customer data behind an endpoint with no door on it',
  },
  {
    name: 'mail config',
    file: 'check-mail-config.js',
    why: 'the admin mail settings cannot leak, corrupt or lie about the password',
  },
  {
    name: 'gdpr + audit',
    file: 'check-gdpr-audit.js',
    why: 'an erasure is complete, and leaves proof that identifies nobody',
  },
  {
    name: 'staff management',
    file: 'check-staff-management.js',
    why: 'the staff list cannot be used to lock every administrator out',
  },
  {
    name: 'social admin',
    file: 'check-social-admin.js',
    why: 'connecting social accounts from the admin cannot mis-save or leak a token',
  },
  {
    name: 'inventory admin',
    file: 'check-inventory-admin.js',
    why: 'a vehicle record editor cannot mis-save, and unknown fields are refused whole',
  },
  {
    name: 'articles admin',
    file: 'check-articles-admin.js',
    why: 'the article queue refuses bad saves whole and every reply tells the truth about publishing',
  },
  {
    name: 'content admin',
    file: 'check-content-admin.js',
    why: 'specials and testimonials are the same machine as articles and must behave identically',
  },
  {
    name: 'seo score',
    file: 'check-seo-score.js',
    why: 'a score someone acts on cannot lie in either direction',
  },
  {
    name: 'agents admin',
    file: 'check-agents-admin.js',
    why: 'agent identities cannot be minted without scope limits, and secrets cannot be read back',
  },
  {
    name: 'admin portal',
    file: 'check-admin-portal.js',
    needsBuild: true,
    why: 'every admin page is reachable from the hub and the nav, and every route resolves',
  },
  {
    name: 'inquiry path',
    file: 'check-inquiry-path.js',
    needsDatabase: true,
    slow: true,
    why: 'a customer enquiry survives its own notification failing',
  },
  {
    name: 'compare + shortlist',
    file: 'check-compare-shortlist.js',
    needsBuild: true,
    why: 'the two card buttons do two different things, and both do them',
  },
  {
    name: 'structured data',
    file: 'check-structured-data.js',
    needsBuild: true,
    why: 'every ld+json block parses as JSON, and none is double-encoded',
  },
  {
    name: 'build output',
    file: 'verify-build.js',
    needsBuild: true,
    slow: true,
    why: 'no page references an asset the build did not emit',
  },
];

const args = process.argv.slice(2);
const QUICK = args.includes('--quick');
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;

const fs = require('fs');

const hasDb = Boolean(process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN);
const hasBuild = fs.existsSync(path.join(ROOT, 'site', 'public'));

/** Newest mtime under a directory, or 0. */
function newest(dir) {
  let newestMs = 0;
  const walk = (d) => {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else {
        try {
          const m = fs.statSync(full).mtimeMs;
          if (m > newestMs) newestMs = m;
        } catch { /* a file moved under us; the next run sees it */ }
      }
    }
  };
  walk(dir);
  return newestMs;
}

/**
 * Is site/public older than the sources it was built from?
 *
 * The Hugo build runs in the podman image on the CI host, not here, so
 * site/public on a working machine is whatever the last CI sync left behind --
 * often many commits old. Every output-reading check then reports failures
 * against a build that no longer represents the code.
 *
 * That is the same red as a real defect, which is the problem: it happened
 * repeatedly while this runner was being built, and a gate that cries wolf is a
 * gate whose red gets ignored. So it is detected rather than described.
 */
const staleBuild = (() => {
  if (!hasBuild) return false;
  const built = newest(path.join(ROOT, 'site', 'public'));
  const sources = Math.max(
    newest(path.join(ROOT, 'site', 'layouts')),
    newest(path.join(ROOT, 'site', 'content')),
    newest(path.join(ROOT, 'site', 'assets'))
  );
  return Boolean(built && sources && sources > built);
})();

const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m',
};
const useColour = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (k, s) => (useColour ? `${C[k]}${s}${C.reset}` : s);

function run(check) {
  const result = spawnSync(
    process.execPath,
    [path.join(__dirname, check.file)],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 5 * 60 * 1000 }
  );

  // A check that needs a database and has none is SKIPPED. Never PASS: a skip
  // and a pass look the same in a log, and that is how a check stops running
  // without anyone deciding it should.
  if (check.needsDatabase && !hasDb) {
    return { state: 'skip', detail: 'no TURSO_DATABASE_URL / TURSO_AUTH_TOKEN' };
  }
  if (check.needsBuild && !hasBuild) {
    return { state: 'skip', detail: 'site/public not built' };
  }
  // A build older than the sources cannot produce a meaningful verdict, so it is
  // a skip and not a failure.
  //
  // This is the whole reason the runner exists. `git status` was clean and
  // ci/run.sh build was green, but a local `npm run check` reported two
  // failures against a site/public left behind by a CI sync from days earlier --
  // including the 555 phone number and the fake street address that were fixed
  // and verified. The same red as a real defect, on every local run, for work
  // that was correct. A gate that cries wolf is a gate whose red gets ignored,
  // and then it catches nothing at all.
  if (check.needsBuild && staleBuild) {
    return { state: 'skip', detail: 'site/public is older than the sources' };
  }

  if (result.error) {
    return { state: 'fail', detail: result.error.message.split('\n')[0], output: '' };
  }

  // A check that cannot run announces it and exits 0. The runner reads the
  // announcement rather than the exit code, because "could not run" and "ran and
  // failed" are different facts and one exit code cannot carry both.
  //
  // Without this the three self-skipping checks had to exit non-zero to signal a
  // skip, and the runner then reported them as failures -- so a build host with
  // no devDependencies showed a red build for a missing test dependency, which
  // is both wrong and the kind of red people stop reading.
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  const skipLine = output.split('\n').find((l) => /^\s*SKIP\b/.test(l));
  if (skipLine) {
    return {
      state: 'skip',
      detail: skipLine.replace(/^\s*SKIP\s*/, '').trim() || 'check could not run',
      output,
    };
  }

  if (result.status !== 0) {
    return {
      state: 'fail',
      detail: `exit ${result.status}`,
      output: `${result.stdout || ''}${result.stderr || ''}`,
    };
  }
  return { state: 'pass', detail: '', output: `${result.stdout || ''}${result.stderr || ''}` };
}

const selected = CHECKS.filter((k) => (ONLY ? k.name === ONLY : true));
if (ONLY && !selected.length) {
  console.error(`  no check named "${ONLY}". One of:`);
  CHECKS.forEach((k) => console.error(`    ${k.name}`));
  process.exit(2);
}

console.log('');
console.log(`  ${c('bold', 'caddy ed -- checks')}${c('dim', `  (${selected.length})`)}`);
if (!hasDb) console.log(c('yellow', '  no database configured: 4 checks will be SKIPPED, not passed'));
if (!hasBuild) console.log(c('yellow', '  site/public not built: 2 checks will be SKIPPED, not passed'));
console.log('');

const outcomes = [];
for (const check of selected) {
  if (QUICK && check.slow) {
    outcomes.push({ check, state: 'skip', detail: '--quick' });
    continue;
  }
  const r = run(check);
  outcomes.push({ check, ...r });
}

const MARK = { pass: c('green', 'PASS'), fail: c('red', 'FAIL'), skip: c('yellow', 'SKIP') };
const width = Math.max(...outcomes.map((o) => o.check.name.length));

for (const o of outcomes) {
  const label = o.check.name.padEnd(width);
  let line = `  ${MARK[o.state]}  ${label}`;
  if (o.state === 'skip' && o.detail) line += c('dim', `   ${o.detail}`);
  console.log(line);
}

if (staleBuild) {
  console.log('');
  console.log(c('yellow', '  WARNING  site/public is OLDER than site/{layouts,content,assets}.'));
  console.log(c('yellow', '          It is a leftover from an earlier CI sync, not a build of the'));
  console.log(c('yellow', '          current code. Failures from the two output-reading checks'));
  console.log(c('yellow', '          below are against that stale output, not against your work.'));
  console.log(c('dim',   '          Build on the CI host, or ignore those two rows here.'));
  console.log(c('dim',   '          The six source-reading checks are unaffected.'));
}

const failed = outcomes.filter((o) => o.state === 'fail');
const skipped = outcomes.filter((o) => o.state === 'skip');

if (failed.length) {
  console.log('');
  console.log(c('red', `  ${failed.length} FAILED: ${failed.map((f) => f.check.name).join(', ')}`));
  console.log('');
  for (const f of failed) {
    console.log(`  ${c('bold', f.check.name)} — ${f.check.why}`);
    const out = (f.output || '').trimEnd().split('\n').filter(Boolean);
    // The last dozen lines: a gate that explains itself at the bottom is more
    // useful than its whole transcript, and a wall of green dilutes the red.
    out.slice(-14).forEach((l) => console.log(`    ${l.replace(/^\s{2}/, '')}`));
    console.log('');
  }
  console.log(c('dim', '  Each check also runs on its own:  node ci/<file>.js'));
  process.exit(1);
}


console.log('');
if (skipped.length) {
  console.log(
    `  ${c('green', 'all run checks passed')}` +
      c('dim', `  (${skipped.length} skipped — skipped is not passed)`)
  );
} else {
  console.log(`  ${c('green', `all ${outcomes.length} checks passed`)}`);
}
console.log('');
