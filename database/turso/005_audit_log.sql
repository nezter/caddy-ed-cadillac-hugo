-- 005_audit_log.sql
--
-- A record of who changed what, and when.
--
-- WHY THIS IS NOT ANOTHER TABLE OF DATA
-- -----------------------------------
-- Every serious defect found in this project had the same shape: something was
-- done, reported success, and left no evidence. A merge that folds two customer
-- identities together irreversibly and records nothing. An erasure that
-- removes a person's data and leaves no way to prove it happened -- which is
-- also the thing a regulator asks about first.
--
-- So the table stores the ACT of acting: who, what, which record, why, when. It
-- deliberately does NOT store a before/after snapshot of a customer's fields,
-- and the reason is a real tension rather than caution for its own sake:
--
--   Erasure wants the person gone. An audit trail that kept their name and
--   email would make the erasure incomplete and the trail the reason it failed.
--
-- So audit rows carry entity IDs and row counts. `rows_affected` on an erasure
-- says "17 rows removed" -- which is exactly what you need to prove compliance
-- -- without retaining the data that compliance was about. If you need the
-- prior state for a NON-subject change (a lead's status, a setting), put it in
-- the `detail` column for that action type and never for a customer erasure.
--
-- ON DELETE, AND WHY IT IS DELIBERATELY NOT CASCADE
-- --------------------------------------------------
-- `actor_id` is SET NULL: an audit row must outlive the staff member who wrote
-- it, or deleting a user silently erases the history of what they did. Their
-- email is copied in as text at write time precisely because that row may
-- outlive them.
--
-- NOTHING CASCADES FROM `customers` OR `leads`. That is the entire point. An
-- audit table with an ON DELETE CASCADE onto subjects is a table that empties
-- itself exactly when it is most needed.

CREATE TABLE IF NOT EXISTS audit_log (
  id           TEXT PRIMARY KEY,

  -- Who acted. SET NULL on delete, never CASCADE.
  actor_id     TEXT,
  -- Copied at write time because the actor row may not exist later.
  actor_email  TEXT,
  -- 'admin' | 'manager' | 'sales_rep' | 'system' -- what they could do, not who
  -- they are. Survives the account.
  actor_role   TEXT,

  -- What happened. A closed vocabulary, because a free-text action column
  -- cannot be filtered or asserted on.
  --   'customer.erase' | 'customer.export' | 'lead.merge' | 'lead.status_change'
  --   | 'settings.update' | 'appointment.complete' | 'auth.login' | 'seed.run'
  action       TEXT NOT NULL,

  -- Which record, in which table.
  entity_type  TEXT NOT NULL,
  entity_id    TEXT,

  -- Why, in the actor's words. Required for the destructive actions and
  -- refused without one, because "deleted a person" with no stated reason is not
  -- a decision anybody can review later.
  reason       TEXT,

  -- Action-specific extras. NEVER a customer's identifying fields for
  -- 'customer.erase' -- see the header.
  detail       TEXT,

  -- How many rows the change touched. For 'customer.erase' this is the evidence
  -- that data was actually removed.
  rows_affected INTEGER NOT NULL DEFAULT 0,

  ip           TEXT,
  user_agent   TEXT,
  created_at   TEXT DEFAULT (datetime('now')),

  FOREIGN KEY (actor_id) REFERENCES sales_reps (id) ON DELETE SET NULL
);

-- Retention queries are always "what happened to this person, newest first"
-- and "what happened on this day". Both are served by an index; a table that
-- grows without one makes the compliance question slow, which is its own
-- failure mode.
CREATE INDEX IF NOT EXISTS idx_audit_created  ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity   ON audit_log (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor    ON audit_log (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action   ON audit_log (action, created_at DESC);

-- Which tables this file creates, so a runner can report rather than assume.
-- `customer_vehicle_interest` is deliberately NOT listed here and deliberately
-- NOT given a foreign key: it holds `sales_rep_notes`, which is free text about
-- a person, and it is not reachable by CASCADE from `customers`. See
-- netlify/functions/gdpr.js, which handles it by name for exactly that reason.