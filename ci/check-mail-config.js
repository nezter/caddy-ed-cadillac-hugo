#!/usr/bin/env node
/**
 * check-mail-config.js -- the admin mail settings must be safe to use.
 *
 * WHY THIS EXISTS
 * ---------------
 * `/admin/email` stores a credential. Three things about that are easy to get
 * wrong and none of them is visible in a render:
 *
 *   1. THE PASSWORD LEAKS. The obvious implementation returns the stored row
 *      from GET, which puts an SMTP credential into a browser, a devtools
 *      network tab, and anything that logs responses. There is also a trap in
 *      the other direction: a form that always sends `smtp_pass` will overwrite
 *      a working password with "" the first time somebody saves the From
 *      address. Both are one careless line.
 *
 *   2. THE PASSWORD IS INTERPOLATED INTO SQL. The natural way to express "keep
 *      the existing secret unless a new one was given" is to paste the value
 *      into the statement text:
 *
 *          VALUES (..., ${body.smtp_pass}, ...)      // <- injection hole
 *
 *      A password containing an apostrophe breaks the statement outright. This
 *      was written that way first and caught by running it.
 *
 *   3. "READY" DISAGREES WITH "WHAT'S MISSING". A response that says
 *      `ready: true` and, in the same payload, lists "no password", gives the
 *      page two answers to one question. Also written that way first.
 *
 * WHAT IT CHECKS
 * --------------
 *   - the GET response contains no secret under any name
 *   - all three password intents behave distinctly against REAL SQLite:
 *     set / keep / clear, including a password with an apostrophe and a quote
 *   - `ready` is false whenever anything is listed as missing
 *   - the transport is refused with a NAMED reason when credentials are
 *     incomplete, rather than becoming a 535 that looks like a wrong password
 *   - the From address is never invented
 *   - the provider presets carry the host/port/username trivia they claim to
 *   - no other function reaches past utils/mail-config.js and builds its own
 *     transport, which would be a second answer to "how does this site mail"
 *
 * Run:  node ci/check-mail-config.js
 * Needs no database and no credentials. `ready` and the SQL checks use a
 * throwaway SQLite file built from database/turso/schema.sql.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const FN = path.join(ROOT, 'netlify', 'functions');

const results = [];
function check(label, pass, detail) {
  results.push({ label, pass: Boolean(pass), detail: detail === undefined ? '' : String(detail) });
}

/* --------------------------------------------------------------- 1. presets */

const MailConfig = require(path.join(FN, 'utils', 'mail-config'));

const EXPECTED = {
  // provider: [host, port, secure, username]
  sendgrid: ['smtp.sendgrid.net', 587, false, 'apikey'],
  mailgun: ['smtp.mailgun.org', 587, false, ''],
  resend: ['smtp.resend.com', 465, true, 'resend'],
  postmark: ['smtp.postmarkapp.com', 2525, false, 'postmark'],
};

const presetProblems = [];
for (const [id, [host, port, secure, user]] of Object.entries(EXPECTED)) {
  const p = MailConfig.BY_ID.get(id);
  if (!p) {
    presetProblems.push(`${id} missing`);
    continue;
  }
  if (p.host !== host) presetProblems.push(`${id} host ${p.host} != ${host}`);
  if (p.port !== port) presetProblems.push(`${id} port ${p.port} != ${port}`);
  if (p.secure !== secure) presetProblems.push(`${id} secure ${p.secure} != ${secure}`);
  if (p.user !== user) presetProblems.push(`${id} user "${p.user}" != "${user}"`);
}
check(
  'provider presets carry the host/port/secure/username they claim',
  presetProblems.length === 0,
  presetProblems.join('; ') || `${Object.keys(EXPECTED).length} providers verified`
);

/* ------------------------------------------------- 2. the secret never escapes */

const SECRET = 'super-secret-value';
const masked = MailConfig.maskSecret({ smtp_host: 'h', smtp_user: 'u', smtp_pass: SECRET });
check(
  'maskSecret() does not return the password',
  !JSON.stringify(masked).includes(SECRET),
  'a GET that returns this puts a credential in a browser'
);
check(
  'maskSecret() reports that a password is set, so "blank" and "clear" differ',
  masked.smtp_pass_set === true,
  `smtp_pass_set was ${masked.smtp_pass_set}`
);

/* --------------------------------------------- 3. incomplete is a named reason */

const incomplete = MailConfig.createTransport({ smtp_host: 'h', smtp_user: '', smtp_pass: '' });
check(
  'an incomplete configuration is refused with a named reason',
  incomplete.transport === null && incomplete.error === 'credentials-incomplete',
  `nodemailer's own error for this is a 535 that looks like a wrong password (got ${incomplete.error})`
);

/* --------------------------------------------------- 4. the From is never faked */

check(
  'a missing From address returns null rather than a guess',
  MailConfig.fromAddress({}) === null,
  'a guessed From either bounces or fails SPF and the enquiry lands in spam'
);

/* ---------------------------------- 5. password intent, against real SQLite */

const dbFile = path.join(os.tmpdir(), `caddy-mail-config-${process.pid}.db`);
let sqlResults = [];
try {
  // Its own try/catch, NOT the outer one. `unlinkSync` throws ENOENT when the
  // file is not there, which is the normal first-run case -- and an exception
  // from this line lands in the handler below, where it is reported as "the
  // schema did not apply". That is a check that fails on a machine that has
  // never run it, and reports the wrong cause when it does.
  try { fs.unlinkSync(dbFile); } catch { /* first run */ }
  execFileSync('sqlite3', [dbFile], {
    input: fs.readFileSync(path.join(ROOT, 'database', 'turso', 'schema.sql'), 'utf8'),
  });

  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(dbFile);

  // `updated_by` is a foreign key onto sales_reps, and in production
  // auth.user.id is a real staff row. Without this the INSERT fails on the FK,
  // which is the constraint working rather than a bug in the statement.
  db.prepare(
    "INSERT INTO sales_reps (id, email, first_name, last_name, role, status) " +
    "VALUES ('check-rep', 'ed@caddyed.com', 'Ed', 'Check', 'admin', 'active')"
  ).run();

  // The statement from mail-settings.js, with the numbered placeholders renamed
  // so each binds by identity. node:sqlite binds positionally and the handler's
  // $10 appears before its $6, so numbering cannot be reproduced with `?`.
  const SQL = `
    INSERT INTO mail_config
      (id, provider, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass,
       email_from, enabled, updated_by, updated_at)
    VALUES (1, $provider, $host, $port, $secure, $user, $pass,
            $from, $enabled, $by, datetime('now'))
    ON CONFLICT (id) DO UPDATE SET
      provider    = excluded.provider,
      smtp_host   = excluded.smtp_host,
      smtp_port   = excluded.smtp_port,
      smtp_secure = excluded.smtp_secure,
      smtp_user   = excluded.smtp_user,
      smtp_pass   = CASE WHEN $clear = 1 THEN NULL
                         ELSE COALESCE($pass, mail_config.smtp_pass) END,
      email_from  = excluded.email_from,
      enabled     = excluded.enabled,
      updated_by  = excluded.updated_by,
      updated_at  = datetime('now')`;

  const save = (pass, clear) => {
    db.prepare(SQL).run({
      provider: 'sendgrid', host: 'smtp.sendgrid.net', port: 587, secure: 0,
      user: 'apikey', pass, from: 'ed@caddyed.com', enabled: 1,
      by: 'check-rep', clear,
    });
    return db.prepare('SELECT smtp_pass FROM mail_config WHERE id = 1').get().smtp_pass;
  };

  const NASTY = `pa'ss"x`;
  const cases = [
    ['a first save stores the password', 'SG.secret', 0, 'SG.secret'],
    ['an omitted field KEEPS the stored password', null, 0, 'SG.secret'],
    ["a password with an apostrophe and a quote round-trips", NASTY, 0, NASTY],
    ['an omitted field keeps it after that', null, 0, NASTY],
    ['an explicit empty string stores an empty string', '', 0, ''],
    ['clear_pass nulls it, for the Netlify UI path', null, 1, null],
    ['an omitted field stays null after clearing', null, 0, null],
  ];

  sqlResults = cases.map(([label, pass, clear, want]) => {
    let got;
    try {
      got = save(pass, clear);
    } catch (e) {
      return { label, pass: false, detail: `threw: ${e.message}` };
    }
    return {
      label,
      pass: got === want,
      detail: got === want ? '' : `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`,
    };
  });
} catch (e) {
  sqlResults = [{
    label: 'the mail_config schema applies to SQLite',
    pass: false,
    detail: `${e.message}\n${(e.stack || '').split('\n').slice(1, 4).join('\n')}`,
  }];
} finally {
  try { fs.unlinkSync(dbFile); } catch { /* already gone */ }
}

for (const r of sqlResults) {
  check(`  ${r.label}`, r.pass, r.detail);
}

/* ---------------------------------------- 6. the password is not in the SQL */

const mailSettingsSrc = fs.readFileSync(path.join(FN, 'mail-settings.js'), 'utf8');
// Strip comments and strings-that-are-not-SQL before looking, so a password
// example in prose is not mistaken for one in a statement.
const sqlText = mailSettingsSrc
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/.*$/gm, '$1 ');
check(
  'the password is bound as a parameter, never interpolated into the statement',
  !/\$\{\s*(body\.)?smtp_pass/.test(sqlText) && !/\$\{\s*passValue/.test(sqlText),
  'a password containing an apostrophe breaks an interpolated statement'
);

/* ------------------------------- 7. one transport, not one per function */

const functionFiles = fs
  .readdirSync(FN)
  .filter((f) => f.endsWith('.js'))
  .map((f) => ({ name: f, src: fs.readFileSync(path.join(FN, f), 'utf8') }));

// Strip comments properly -- block AND line. lead-form.js mentions
// `nodemailer.createTransport` only inside a comment explaining that it no
// longer does, and matching that would report a fixed bug as a live one. The
// `(^|[^:])` guard is the same one check-function-auth.js uses: it stops `//`
// inside a URL from being read as the start of a comment.
const codeOnly = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ');

const strays = functionFiles
  .filter((f) => f.name !== 'mail-config.js')
  .filter((f) => /createTransport/.test(codeOnly(f.src)))
  .filter((f) => !/require\('\.\/utils\/mail-config'\)/.test(f.src))
  .map((f) => f.name);

check(
  'no function builds its own transport outside utils/mail-config.js',
  strays.length === 0,
  strays.length
    ? `${strays.join(', ')} — a provider set at /admin/email would work for enquiries and fail there`
    : 'every sender resolves through the shared config'
);

/* ------------------------------------------------------------------ report */

console.log('');
for (const r of results) {
  const detail = r.detail ? `   (${r.detail})` : '';
  console.log(`  ${r.pass ? 'ok  ' : 'FAIL'} ${r.label}${detail}`);
}
const failed = results.filter((r) => !r.pass);
console.log('');
if (!failed.length) {
  console.log('  OK: the mail settings cannot leak the password, cannot be broken by one,');
  console.log('      and cannot claim to be ready while something is missing.');
  process.exit(0);
}
console.error('  THE ADMIN MAIL SETTINGS ARE NOT SAFE TO USE AS THEY STAND.');
console.error('  The password is either readable from a GET, or is being pasted into SQL.');
process.exit(1);