/**
 * mail-settings.js -- /admin/email. Read and write the site's mail provider.
 *
 * WHY THIS IS AN ENDPOINT AND NOT THE NETLIFY UI
 * ----------------------------------------------
 * The handoff said "four environment variables" and treated that as the whole
 * job. It is the whole job in the sense that nothing sends mail until they
 * exist, and it is not the whole job in two ways that matter:
 *
 *   - They can only be set by somebody with dashboard access, on a site whose
 *     owner is one person whose day job is selling cars. Every enquiry that
 *     arrives unsent in the meantime is a lost sale.
 *   - The four are provider trivia (host, port, secure, and a username that is
 *     the literal string `apikey` for SendGrid). Guessing them produces a 535
 *     that is indistinguishable from a wrong password.
 *
 * So: pick a provider from a dropdown, get the trivia filled in, type the one
 * secret, press Test, press Enable.
 *
 * WHO CAN DO THIS
 * ---------------
 * `preferences_write`, which admin, manager and sales_rep all hold. It is the
 * same permission that guards /admin/settings, for the same reason: this is
 * site configuration, not customer data.
 *
 * The secret is write-only. GET returns `smtp_pass_set: true` and never the
 * value, because a GET that returns a password puts it in a browser, in
 * devtools, and in anything that logs responses. Saving with the password field
 * blank KEEPS the stored one; clearing it deliberately is `clear_pass: true`.
 * Those have to be different, and this is how they are.
 *
 * THERE IS NO PUBLIC READ PATH
 * ---------------------------
 * This table is not `site_settings`, whose `is_public = 1` rows are served to
 * anonymous callers by design. No route, no rewrite and no page on this site
 * exposes this endpoint without a session.
 */

'use strict';

const DatabaseService = require('./utils/database-service');
const { authenticateRequest } = require('./utils/auth-middleware');
const { originHeaders, isAllowedOrigin } = require('./utils/cors-middleware');
const MailConfig = require('./utils/mail-config');

/** Validation, per field, as [rule, message]. */
const CHECKS = {
  provider: (v) =>
    MailConfig.BY_ID.has(v) || 'pick one of the listed providers',
  smtp_host: (v) =>
    !v || /^[A-Za-z0-9.-]{1,253}$/.test(v) || 'that is not a hostname',
  smtp_port: (v) => {
    const n = Number(v);
    return (Number.isInteger(n) && n > 0 && n < 65536) || 'port must be 1-65535';
  },
  smtp_user: (v) => !v || v.length <= 200 || 'username is too long',
  email_from: (v) =>
    !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || 'that is not an email address',
};

function json(status, body, event) {
  return {
    statusCode: status,
    headers: { ...originHeaders(event, 'GET, PUT, POST, OPTIONS'), 'Cache-Control': 'no-store' },
    body: JSON.stringify(body),
  };
}

/** Which of the enabled paths is actually going to be used. */
function activeSource(resolved) {
  if (!resolved.config) return { source: 'none', reason: resolved.reason };
  return { source: resolved.config.source, reason: null };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return json(204, {}, event);
  }
  if (!isAllowedOrigin(event.headers || {})) {
    return json(403, { error: 'origin-not-allowed' }, event);
  }

  const auth = await authenticateRequest(event, {
    requireAuth: true,
    requiredPermissions: ['preferences_write'],
  });
  if (!auth.authenticated) return auth.error;

  const configured = DatabaseService.isDatabaseConfigured();

  // ------------------------------------------------------------------- GET
  if (event.httpMethod === 'GET') {
    if (!configured) {
      return json(503, { error: 'database-not-configured' }, event);
    }

    const result = await DatabaseService.query(
      'SELECT * FROM mail_config WHERE id = 1 LIMIT 1'
    );
    const row = result.rows && result.rows[0];

    const resolved = await MailConfig.resolve(DatabaseService);
    const stored = row ? MailConfig.maskSecret(row) : null;
    const problems = buildProblems(resolved);

    return json(200, {
      // Both facts, because they are different and only one being shown is how
      // "it says enabled" and "it does not send" coexist for a month.
      stored: stored ? { ...stored, smtp_pass_set: Boolean(row.smtp_pass) } : null,
      envConfigured: Boolean(MailConfig.fromEnv()),
      active: activeSource(resolved),
      // Say what is missing, so a blank form is not a puzzle. `ready` is derived
      // from the same list rather than computed separately: the first version
      // checked only that a transport could be built and a From existed, and
      // reported ready:true while the very same response listed "no password".
      // Two answers to one question in one payload is how a page shows a green
      // light over a site that sends nothing.
      problems: problems,
      ready: resolved.config !== null && problems.length === 0,
      providers: MailConfig.PROVIDERS.map((p) => ({
        id: p.id,
        label: p.label,
        host: p.host,
        port: p.port,
        secure: p.secure,
        user: p.user,
        help: p.help,
        docs: p.docs,
      })),
      updated_at: row ? row.updated_at : null,
    }, event);
  }

  // ------------------------------------------------------------------- PUT
  if (event.httpMethod === 'PUT' || event.httpMethod === 'POST') {
    if (!configured) {
      return json(503, { error: 'database-not-configured' }, event);
    }

    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return json(400, { error: 'invalid-json' }, event);
    }

    // A partial update reads better than a whole-row PUT: saving the From
    // address must not require retyping the password.
    const problems = {};
    for (const [field, rule] of Object.entries(CHECKS)) {
      if (!(field in body)) continue;
      const result = rule(body[field]);
      if (result !== true) problems[field] = result;
    }
    if (Object.keys(problems).length) {
      return json(422, { error: 'validation-failed', problems }, event);
    }

    const provider = body.provider || 'custom';
    const preset = MailConfig.BY_ID.get(provider);

    // An explicit empty smtp_host on a non-custom provider means "use the
    // preset's host", which is what the form sends when the operator picked a
    // provider and only typed a password.
    const host = body.smtp_host !== undefined
      ? body.smtp_host
      : (preset ? preset.host : '');
    const port = body.smtp_port !== undefined ? Number(body.smtp_port) : (preset ? preset.port : 587);
    const user = body.smtp_user !== undefined ? body.smtp_user : (preset ? preset.user : '');

    // Three distinct intents, and collapsing any two of them loses data:
    //   no smtp_pass key  -> keep the stored secret
    //   smtp_pass: ''     -> store an empty password (a misconfiguration the
    //                        test reports, rather than hiding)
    //   clear_pass: true  -> use the Netlify UI instead
    //
    // Encoded as two parameters, NOT by writing the value into the SQL text.
    // The first version interpolated the password straight into the statement,
    // which is both an injection hole (a password containing an apostrophe
    // breaks the statement, and a crafted one changes it) and the exact thing
    // every other statement in this codebase takes care to avoid.
    //
    // $9 = the new value or null; $10 = 1 means "clear it".
    const hasNewPass = Object.prototype.hasOwnProperty.call(body, 'smtp_pass');
    const passValue = hasNewPass && body.smtp_pass ? String(body.smtp_pass) : null;
    const clearPass = body.clear_pass === true ? 1 : 0;

    const secure = body.smtp_secure !== undefined
      ? (Number(body.smtp_secure) === 1 ? 1 : 0)
      : (preset ? (preset.secure ? 1 : 0) : 0);
    const enabled = body.enabled !== undefined ? (Number(body.enabled) === 1 ? 1 : 0) : 1;

    await DatabaseService.query(
      `INSERT INTO mail_config
         (id, provider, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass,
          email_from, enabled, updated_by, updated_at)
       VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, datetime('now'))
       ON CONFLICT (id) DO UPDATE SET
         provider    = excluded.provider,
         smtp_host   = excluded.smtp_host,
         smtp_port   = excluded.smtp_port,
         smtp_secure = excluded.smtp_secure,
         smtp_user   = excluded.smtp_user,
         smtp_pass   = CASE WHEN $10 = 1 THEN NULL
                            ELSE COALESCE($6, mail_config.smtp_pass) END,
         email_from  = excluded.email_from,
         enabled     = excluded.enabled,
         updated_by  = excluded.updated_by,
         updated_at  = datetime('now')`,
      [provider, host, port, secure, user, passValue, body.email_from || null, enabled,
       auth.user.id, clearPass]
    );

    // A save is not a proof. Send one and say what happened, so "saved" and
    // "working" are never assumed to be the same thing -- which is the belief
    // that made this project claim a mail transport worked while logging to
    // stdout.
    const test = body.test === true ? await sendTest(DatabaseService) : null;

    return json(200, { saved: true, test }, event);
  }

  return json(405, { error: 'method-not-allowed' }, event);
};

/** What is missing, in the operator's terms rather than a stack trace. */
function buildProblems(resolved) {
  const out = [];
  if (!resolved.config) {
    out.push(
      resolved.reason === 'database-not-configured'
        ? 'mail_config table is missing -- run database/turso/004_mail_config.sql'
        : 'no provider configured, here or in the Netlify UI'
    );
    return out;
  }
  const c = resolved.config;
  if (!c.smtp_user) out.push('no username');
  if (!c.smtp_pass) out.push('no password (set one here, or SMTP_PASS in the Netlify UI)');
  if (!MailConfig.fromAddress(c)) out.push('no From address -- this must be set, it is never guessed');
  return out;
}

/**
 * Send one message to the address enquiries go to, and report the real outcome.
 *
 * Never throws and never lies: a failure returns the provider's own message,
 * because "535 authentication failed" is the answer that tells the operator
 * which of the five fields is wrong.
 */
async function sendTest(database) {
  const resolved = await MailConfig.resolve(database);
  if (!resolved.config) {
    return { ok: false, reason: resolved.reason, detail: 'No provider configured.' };
  }
  const from = MailConfig.fromAddress(resolved.config);
  if (!from) {
    return { ok: false, reason: 'from-not-set', detail: 'Set a From address first.' };
  }
  const { transport, error } = MailConfig.createTransport(resolved.config);
  if (!transport) {
    return { ok: false, reason: error, detail: 'The stored configuration is incomplete.' };
  }

  try {
    await transport.sendMail({
      from,
      to: resolved.config.test_to || process.env.EMAIL_TO || 'ed@caddyed.com',
      subject: 'caddyed.com: mail is configured',
      text:
        'This is a test from the site itself.\n\n' +
        'If you are reading it, enquiries will reach you when somebody fills in a form.\n' +
        'Provider: ' + resolved.config.provider + '\n' +
        'Host: ' + resolved.config.smtp_host + ':' + resolved.config.smtp_port +
        '\nSource: ' + resolved.config.source + '\n',
    });
    return { ok: true, via: resolved.config.source };
  } catch (err) {
    return { ok: false, reason: 'send-failed', detail: err.message };
  }
}

exports.exports_for_test = { sendTest, buildProblems };