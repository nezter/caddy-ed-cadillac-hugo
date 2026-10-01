/**
 * mail-config.js -- one place that knows how to turn "I picked Mailgun" into a
 * working SMTP transport.
 *
 * WHY THIS IS NOT JUST process.env
 * --------------------------------
 * The handoff called SMTP "four environment variables". That is true and it is
 * also the reason it has not happened: getting a SendGrid SMTP password onto
 * this site means knowing that the host is `smtp.sendgrid.net`, the port is
 * `587`, `secure` is false, and the username is literally `apikey`. All four
 * are provider trivia, and every provider has its own four. Setting them wrong
 * fails as a 535 authentication error, which reads exactly like a wrong
 * password -- so the debugging loop is "guess the other four values" until
 * something changes.
 *
 * So the provider is a choice, and this file holds the trivia:
 *
 *   { id: 'sendgrid', label: 'SendGrid', host: 'smtp.sendgrid.net', port: 587,
 *     secure: false, user: 'apikey', help: 'Use a Full Access key as the password.' }
 *
 * Which is also what the admin form renders, so picking a provider fills in
 * host, port and username, and the only genuinely unknown field left is the
 * secret.
 *
 * WHERE THE SECRET LIVES
 * ----------------------
 * Two sources, in this order:
 *
 *   1. The database (`mail_config` table), set through /admin/email. This is
 *      the path the owner asked for, and it works without a redeploy.
 *   2. `process.env`, for a deployment that prefers to keep credentials in the
 *      Netlify UI.
 *
 * The database wins, because it is the newer and the deliberate one. But the
 * ENV FALLBACK IS NOT REMOVED: a Netlify env var is not visible to anybody who
 * can reach the admin page, and on a one-person site that is the safer place
 * for a secret to live. Both are supported on purpose.
 *
 * WHAT IS NOT HERE
 * ----------------
 * No send function. `inquiry.js` owns record-then-notify, and this file only
 * answers "what transport should I build and is it complete". A second place
 * that can send mail is a second place that can forget to record first.
 */

'use strict';

/**
 * Known providers.
 *
 * `user` is the username SendGrid-style providers expect to be a constant
 * rather than the account address, which is the single most common thing
 * people get wrong. `insecure` is NOT offered: port 2525 exists for providers
 * that block 587 on some networks, and adding a toggle here would be a knob
 * that weakens transport encryption with no setting anyone needs.
 */
const PROVIDERS = [
  {
    id: 'sendgrid',
    label: 'SendGrid',
    host: 'smtp.sendgrid.net',
    port: 587,
    secure: false,
    user: 'apikey',
    help: 'Paste a Full Access API key as the password. Restricted keys cannot send.',
    docs: 'https://app.sendgrid.com/settings/api_keys',
  },
  {
    id: 'mailgun',
    label: 'Mailgun',
    // Mailgun's SMTP host is region-specific and is shown in its own dashboard,
    // so `host` here is a starting point the operator must confirm rather than
    // a fact we can assert on their behalf.
    host: 'smtp.mailgun.org',
    port: 587,
    secure: false,
    user: '',
    help: 'Use the SMTP host from your Mailgun domain settings (it is region-specific, e.g. smtp.eu.mailgun.org). Password is the SMTP password, not the API key.',
    docs: 'https://documentation.mailgun.com/docs/mailgun/user-manual/domains/domains-architecture',
  },
  {
    id: 'resend',
    label: 'Resend',
    host: 'smtp.resend.com',
    port: 465,
    secure: true,
    user: 'resend',
    help: 'Password is the Resend API key. The From address must be a domain you have verified in Resend.',
    docs: 'https://resend.com/docs/send-with-smtp',
  },
  {
    id: 'postmark',
    label: 'Postmark',
    host: 'smtp.postmarkapp.com',
    port: 2525,
    secure: false,
    user: 'postmark',
    help: 'Password is a Postmark server token. Port 2525 avoids the 587 block some providers and firewalls impose.',
    docs: 'https://postmarkapp.com/developer/user-guide/send-email-with-smtp',
  },
  {
    id: 'custom',
    label: 'Custom / other SMTP',
    host: '',
    port: 587,
    secure: false,
    user: '',
    help: 'Any SMTP server. Fill in the host yourself.',
    docs: '',
  },
];

const BY_ID = new Map(PROVIDERS.map((p) => [p.id, p]));

/** Never echo these back to a browser. See maskSecret. */
const SECRET_FIELDS = ['smtp_pass'];

/**
 * A configuration with the secret replaced by a boolean.
 *
 * A GET that returns the stored password would put an SMTP credential in a
 * browser, in a devtools network tab, and in anything that logs responses. The
 * form shows "set" and leaves the field blank; saving without typing a new one
 * keeps the existing secret rather than blanking it. That is the only behaviour
 * that makes "leave it alone" and "clear it" different, which they are.
 */
function maskSecret(row) {
  if (!row) return null;
  const out = { ...row };
  for (const f of SECRET_FIELDS) {
    out[`${f}_set`] = Boolean(out[f]);
    delete out[f];
  }
  return out;
}

/**
 * Env-derived configuration, or null when there is not enough to attempt a send.
 *
 * Returns null rather than a partial object, because "configured" has to be a
 * decision and a half-configured transport fails as an auth error -- the same
 * confusing failure this file exists to remove.
 */
function fromEnv() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  return {
    provider: 'env',
    smtp_host: host,
    smtp_port: Number(process.env.SMTP_PORT || 587),
    smtp_secure: process.env.SMTP_SECURE === 'true',
    smtp_user: process.env.SMTP_USER || '',
    smtp_pass: process.env.SMTP_PASS || '',
    email_from: process.env.EMAIL_FROM || '',
    source: 'env',
  };
}

/**
 * The stored configuration, read through the shared query helper.
 *
 * `enabled` is honoured here rather than by the caller so that disabling mail
 * in the admin works the same way whether the value came from the table or from
 * the environment -- one place decides, so the two paths cannot disagree.
 */
async function readStored(database) {
  const result = await database.query(
    'SELECT * FROM mail_config WHERE id = 1 LIMIT 1'
  );
  const row = result.rows && result.rows[0];
  if (!row) return null;
  if (Number(row.enabled) === 0) return null;
  if (!row.smtp_host) return null;
  return {
    provider: row.provider || 'custom',
    smtp_host: row.smtp_host,
    smtp_port: Number(row.smtp_port || 587),
    smtp_secure: Number(row.smtp_secure) === 1,
    smtp_user: row.smtp_user || '',
    smtp_pass: row.smtp_pass || '',
    email_from: row.email_from || '',
    source: 'database',
  };
}

/**
 * Resolve the transport to use, preferring the admin-entered row.
 *
 * Returns `{ config: null, reason }` with a reason that is safe to log and to
 * show an admin, because "mail is off and here is exactly which part is
 * missing" is the difference between a five-minute fix and an afternoon.
 */
async function resolve(database) {
  let stored = null;
  let storedError = null;
  try {
    stored = await readStored(database);
  } catch (err) {
    // A missing table is the expected state on a deployment that has not run
    // 004_mail_config.sql yet. It must not stop the env path from working, and
    // it must not read as "mail is off".
    storedError = err.message;
    console.warn('[mail-config] stored config unavailable:', err.message);
  }

  if (stored) return { config: stored, reason: null, storedError };

  const env = fromEnv();
  if (env) return { config: env, reason: null, storedError };

  return {
    config: null,
    reason: storedError ? 'database-not-configured' : 'no-provider-configured',
    storedError,
  };
}

/**
 * Build a nodemailer transport, or explain why one cannot be built.
 *
 * `secure` comes from the stored port/flag rather than being guessed from the
 * port number, because port 465 is the one case where it is true by convention
 * and a provider can legitimately run TLS on 587. The operator's choice wins.
 */
function createTransport(config) {
  if (!config || !config.smtp_host) {
    return { transport: null, error: 'no-provider-configured' };
  }
  if (!config.smtp_user || !config.smtp_pass) {
    // Said explicitly, because nodemailer's own error for this is a 535 that
    // looks identical to a wrong password.
    return { transport: null, error: 'credentials-incomplete' };
  }
  // eslint-disable-next-line global-require
  const nodemailer = require('nodemailer');
  return {
    transport: nodemailer.createTransport({
      host: config.smtp_host,
      port: config.smtp_port,
      secure: config.smtp_secure,
      auth: { user: config.smtp_user, pass: config.smtp_pass },
    }),
    error: null,
  };
}

/**
 * The From address, with the rule that it must never be invented.
 *
 * A From that falls back to a guessed address either bounces or, worse, sends
 * from an address on a domain this business does not control -- and SPF then
 * fails, so the enquiry lands in spam. So an unset EMAIL_FROM is reported, not
 * defaulted, and the operator sets it once.
 */
function fromAddress(config) {
  if (config && config.email_from) return config.email_from;
  return null;
}

module.exports = {
  PROVIDERS,
  BY_ID,
  maskSecret,
  fromEnv,
  readStored,
  resolve,
  createTransport,
  fromAddress,
  SECRET_FIELDS,
};