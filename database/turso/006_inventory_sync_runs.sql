-- 006_inventory_sync_runs.sql
--
-- The table /admin/sync reads: one row per inventory sync run, written by
-- scripts/inventory/index.js through netlify/functions/utils/sync-runs.js.
--
-- The module also creates this table lazily (CREATE TABLE IF NOT EXISTS on
-- first use), so applying this file is a record of intent rather than a
-- required deployment step. It is kept in lockstep with the module: if a
-- column changes here it changes there, in the same commit.
--
-- Counts, in the words the page uses:
--   feed_total      found:      how many vehicles the feed listed
--   existing_count  existing:   seen before, nothing to change
--   updated_count   updated:    existing, but details differ this time
--   added_count     new:        never seen before
--   retired_count   retired:    no longer listed, or listed as sold

CREATE TABLE IF NOT EXISTS inventory_sync_runs (
  id TEXT PRIMARY KEY,
  mode TEXT,
  source TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  phase TEXT,
  started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  finished_at TEXT,
  feed_total INTEGER DEFAULT 0,
  existing_count INTEGER DEFAULT 0,
  updated_count INTEGER DEFAULT 0,
  added_count INTEGER DEFAULT 0,
  retired_count INTEGER DEFAULT 0,
  processed INTEGER DEFAULT 0,
  process_total INTEGER DEFAULT 0,
  message TEXT,
  detail TEXT
);

CREATE INDEX IF NOT EXISTS idx_inventory_sync_runs_started
  ON inventory_sync_runs (started_at DESC);
