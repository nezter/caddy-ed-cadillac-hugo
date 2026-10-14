-- 007_sync_runs_lineage.sql
--
-- Adds the lineage columns /admin/sync shows for every run: who (or what)
-- asked for it, and when. 006 created the counts; this turns one row per
-- run into the whole story: a queued request (status 'requested',
-- requested_by + requested_at set by inventory-sync-trigger.js) is adopted
-- by the next live script run, which records phases and change lists in
-- the detail JSON and finishes the same row.
--
--   trigger       'manual' | 'scheduled' | 'local' -- how the run started
--   requested_by  who queued it (email or agent name), null for local runs
--   requested_at  when it was queued, null for runs that were not queued
--
-- The module also adds these lazily (ALTER TABLE, once per process), so
-- applying this file is a record of intent rather than a required step.
-- Kept in lockstep with netlify/functions/utils/sync-runs.js.

ALTER TABLE inventory_sync_runs ADD COLUMN trigger TEXT;
ALTER TABLE inventory_sync_runs ADD COLUMN requested_by TEXT;
ALTER TABLE inventory_sync_runs ADD COLUMN requested_at TEXT;
