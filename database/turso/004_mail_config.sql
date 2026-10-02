-- 004_mail_config.sql
--
-- The table behind /admin/email: one row, so the site can be told how to send
-- mail without a redeploy and without an account holder opening the Netlify UI.
--
-- WHY ONE ROW AND NOT A site_settings ROW PER KEY
-- ----------------------------------------------
-- `site_settings` is the wrong table for this and using it would be a security
-- defect, not a shortcut. Its GET serves every row with `is_public = 1` to
-- ANONYMOUS callers -- deliberately, because the front end has no session and
-- must read the signage. An SMTP password in that table would be published to
-- the internet by a query the schema itself describes as safe.
--
-- So this is a separate table with no public read path at all. The only reader
-- is netlify/functions/mail-config.js, called from server-side code, and the
-- only writer is the authenticated /admin/email endpoint.
--
-- WHY THE SECRET IS STORED IN PLAIN TEXT
-- --------------------------------------
-- Honestly: because there is no secret store on this deployment, and a wrong
-- answer here would be worse than the honest one.
--
-- The alternatives were considered and rejected for specific reasons:
--   - Netlify env vars. Already supported as a fallback (mail-config.js prefers
--     this table but falls back to process.env). Keeping the secret there is
--     strictly better: it is not in the database and not in a backup of it.
--   - Encrypting with a key. Any key reachable by the function that must
--     decrypt it provides no protection against an attacker who can read this
--     table, because they can also read the code that holds the key. It would
--     be theatre.
--
-- So: if the operator prefers the secret to live outside the database, they
-- should leave `smtp_pass` NULL here and set SMTP_HOST/SMTP_USER/SMTP_PASS in
-- the Netlify UI instead. Both work. The admin form says which is in use.
--
-- `enabled` exists so mail can be switched OFF without deleting the row, and
-- so a half-entered configuration cannot start sending by being completed by
-- accident. It is honoured in mail-config.js, not by the caller, so the
-- database and env paths cannot disagree about whether mail is on.

CREATE TABLE IF NOT EXISTS mail_config (
  -- Always 1. A single row enforced by the application: SQLite has no
  -- "exactly one row" constraint that is cheap, and a second row would mean
  -- two functions disagreeing about which provider is live.
  id           INTEGER PRIMARY KEY CHECK (id = 1),

  -- 'sendgrid' | 'mailgun' | 'resend' | 'postmark' | 'custom'
  provider     TEXT NOT NULL DEFAULT 'custom'
               CHECK (provider IN ('sendgrid','mailgun','resend','postmark','custom')),

  smtp_host    TEXT,
  smtp_port    INTEGER NOT NULL DEFAULT 587,
  smtp_secure  INTEGER NOT NULL DEFAULT 0 CHECK (smtp_secure IN (0, 1)),
  smtp_user    TEXT,
  -- NULL means "use the Netlify UI instead", which is a real state and not an
  -- empty password: a blank password is a configuration mistake, a NULL here
  -- is a deliberate choice about where the secret lives.
  smtp_pass    TEXT,

  -- The From address. Required before anything sends, and never defaulted by
  -- code -- see fromAddress() in utils/mail-config.js for why a guessed From
  -- either bounces or fails SPF and lands the enquiry in spam.
  email_from   TEXT,

  -- 0 stops every send without deleting the credentials.
  enabled      INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),

  updated_by   TEXT,
  updated_at   TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (updated_by) REFERENCES sales_reps (id) ON DELETE SET NULL
);