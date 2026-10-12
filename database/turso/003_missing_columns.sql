-- 003_missing_columns.sql
--
-- Columns the application writes that the generated schema does not have.
--
-- FOUND BY RUNNING THE STATEMENTS, NOT BY READING THEM
-- ------------------------------------------------------
-- Every one of these was found by executing the real INSERT against the real
-- database and reading the error:
--
--   SQLite error: table customers has no column named vehicle_interest
--
-- A build-time check that a schema parses says nothing about whether the code
-- can write to it. `001_core.sql` creates cleanly, all 15 tables, and the
-- INSERTs still fail. The only thing that catches this is running the statement.
--
-- WHY 002_app_columns.sql DID NOT CATCH THEM
-- -------------------------------------------
-- 002 was built by diffing the Postgres source schema against the generated
-- libSQL one -- i.e. by comparing the SCHEMA to itself. These columns are named
-- by the CODE, not by the source schema, so no amount of schema-to-schema
-- comparison finds them. The code is a third source of truth and it was the one
-- nobody checked.
--
-- That is the lesson worth keeping: a gate that compares two artefacts will not
-- find a third thing that disagrees with both. The check that works is running
-- the statement.
--
-- `ci/check-insert-columns.js` is that check, and it now runs in CI.

-- customers: the vehicle a customer asked about.
ALTER TABLE customers ADD COLUMN vehicle_interest TEXT;

-- leads: who captured the lead. Distinct from `assigned_sales_rep_id`, which is
-- who owns it now.
ALTER TABLE leads ADD COLUMN created_by TEXT DEFAULT 'system';

-- tasks: what kind of task this is. The schema has `title` and `description`
-- but no type, so the INSERT's third column had nothing to write to.
ALTER TABLE tasks ADD COLUMN task_type TEXT DEFAULT 'follow_up';

-- vehicles: the lifecycle state. The whole availability filter is built on this
-- column -- getVehicles filters on `status = ?` -- so without it a vehicle can
-- never be marked sold and can never be filtered out of the inventory.
ALTER TABLE vehicles ADD COLUMN status TEXT DEFAULT 'available';

-- vehicles: who listed it.
ALTER TABLE vehicles ADD COLUMN created_by TEXT DEFAULT 'system';

-- followup_campaigns: which audience a campaign targets. The create schema
-- validates it (`Joi.string().valid('all', 'prospects', 'leads', ...)`) and the
-- INSERT writes it, so a campaign could be created only to fail at the database.
ALTER TABLE followup_campaigns ADD COLUMN target_audience TEXT DEFAULT 'all';

-- ---------------------------------------------------------------------------
-- 2026-10-12: columns the CODE has always referenced but no SQL file created.
-- Found live: /lead-assignments/analytics answered 500 on production because
-- leads.assignment_score / leads.assignment_reason do not exist in the applied
-- schema, and findAvailableReps reads sales_reps.capacity / territory /
-- source_expertise / budget_expertise (capacity only ever lived in
-- database/turso/schema.sql, which is not the applied file). Applied to
-- production via a one-shot; recorded here so a rebuild gets them too.
-- ---------------------------------------------------------------------------
ALTER TABLE leads ADD COLUMN assignment_score REAL;
ALTER TABLE leads ADD COLUMN assignment_reason TEXT;
ALTER TABLE sales_reps ADD COLUMN capacity INTEGER DEFAULT 0;
ALTER TABLE sales_reps ADD COLUMN territory TEXT;
ALTER TABLE sales_reps ADD COLUMN source_expertise TEXT;
ALTER TABLE sales_reps ADD COLUMN budget_expertise TEXT;
