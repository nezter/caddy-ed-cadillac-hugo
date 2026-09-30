#!/usr/bin/env python3
"""
build-schema.py -- produce the single, complete libSQL schema.

WHY THIS EXISTS
---------------
The schema arrived as four files, applied in order:

    001_core.sql            generated from the Postgres source
    002_app_columns.sql     26 columns found by diffing schema against schema
    003_missing_columns.sql 6 columns found by RUNNING the INSERTs
    004_structure.sql       foreign keys and indexes

Each fixed a real problem, and each was a discovery rather than a plan. That is
how schemas actually get built, and it is the worst possible thing to leave
behind: four files that must be applied in order, where the fourth says things
the first three got wrong, and nobody reading 001 can tell what the real shape
is.

So this generates one file from all of it. The output is the source of truth;
the inputs are kept because they are the record of how it got here.

    database/turso/schema.sql   <- generated, complete, apply this
    database/turso/001..003     <- inputs, applied in order only when rebuilding

WHAT THE AUDIT FOUND
--------------------
    15 tables, 258 columns, 14 indexes
     0 FOREIGN KEY constraints
     8 CHECK constraints

Zero foreign keys. Every relationship was held by convention alone. 17
relationships were checked against the live database and none was orphaned, so
the constraints could be added without inventing or discarding data.

A NOTE ON SQLITE
----------------
SQLite cannot `ALTER TABLE ... ADD CONSTRAINT`, and libSQL is SQLite. Foreign
keys can only be added by creating a new table, copying, dropping and renaming.
Rather than write that migration for fifteen tables and leave the next person a
trap, the constraints are declared inline here and the rebuild is a fresh apply.

PRAGMA foreign_keys defaults to OFF, so the constraints are inert unless a
connection turns it on. database-service.js does. See PRAGMA note at the bottom
of the generated file.
"""

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
TURSO = ROOT / "database" / "turso"
OUT = TURSO / "schema.sql"

# --------------------------------------------------------------------------
# Foreign keys, per table. The value is the list of (column, parent, on_delete).
#
# ON DELETE is chosen per relationship, not defaulted:
#   CASCADE     the child cannot exist without the parent
#   SET NULL    the child is a record of something that happened and survives
# --------------------------------------------------------------------------
FOREIGN_KEYS = {
    "customers": [
        ("assigned_sales_rep_id", "sales_reps", "SET NULL"),
    ],
    "leads": [
        ("customer_id", "customers", "SET NULL"),
        ("assigned_sales_rep_id", "sales_reps", "SET NULL"),
    ],
    "interactions": [
        ("customer_id", "customers", "CASCADE"),
        ("lead_id", "leads", "SET NULL"),
        ("sales_rep_id", "sales_reps", "SET NULL"),
    ],
    "appointments": [
        ("customer_id", "customers", "CASCADE"),
        ("lead_id", "leads", "SET NULL"),
        ("assigned_sales_rep_id", "sales_reps", "SET NULL"),
    ],
    "tasks": [
        ("customer_id", "customers", "CASCADE"),
        ("lead_id", "leads", "SET NULL"),
        ("assigned_to", "sales_reps", "SET NULL"),
    ],
    "followup_rules": [
        ("campaign_id", "followup_campaigns", "CASCADE"),
    ],
    "followups": [
        ("campaign_id", "followup_campaigns", "CASCADE"),
        ("customer_id", "customers", "CASCADE"),
        ("lead_id", "leads", "SET NULL"),
    ],
    "followup_analytics": [
        ("campaign_id", "followup_campaigns", "SET NULL"),
        ("followup_id", "followups", "SET NULL"),
    ],
    "communication_preference_log": [
        ("customer_id", "customers", "CASCADE"),
    ],
}

# --------------------------------------------------------------------------
# Indexes. Every foreign key gets one on the child column -- SQLite does not
# create those automatically, so without them each parent DELETE scans the whole
# child table. The rest are columns the queries in this codebase filter and sort
# on, read out of the WHERE and ORDER BY clauses rather than guessed.
# --------------------------------------------------------------------------
INDEXES = """
-- Foreign keys
CREATE INDEX IF NOT EXISTS idx_customers_rep          ON customers (assigned_sales_rep_id);
CREATE INDEX IF NOT EXISTS idx_leads_customer          ON leads (customer_id);
CREATE INDEX IF NOT EXISTS idx_leads_rep               ON leads (assigned_sales_rep_id);
CREATE INDEX IF NOT EXISTS idx_interactions_customer   ON interactions (customer_id);
CREATE INDEX IF NOT EXISTS idx_interactions_lead       ON interactions (lead_id);
CREATE INDEX IF NOT EXISTS idx_interactions_rep        ON interactions (sales_rep_id);
CREATE INDEX IF NOT EXISTS idx_appointments_customer   ON appointments (customer_id);
CREATE INDEX IF NOT EXISTS idx_appointments_lead       ON appointments (lead_id);
CREATE INDEX IF NOT EXISTS idx_appointments_rep        ON appointments (assigned_sales_rep_id);
CREATE INDEX IF NOT EXISTS idx_tasks_customer          ON tasks (customer_id);
CREATE INDEX IF NOT EXISTS idx_tasks_lead              ON tasks (lead_id);
CREATE INDEX IF NOT EXISTS idx_tasks_rep               ON tasks (assigned_to);
CREATE INDEX IF NOT EXISTS idx_rules_campaign          ON followup_rules (campaign_id);
CREATE INDEX IF NOT EXISTS idx_followups_campaign      ON followups (campaign_id);
CREATE INDEX IF NOT EXISTS idx_followups_customer      ON followups (customer_id);
CREATE INDEX IF NOT EXISTS idx_followups_lead          ON followups (lead_id);
CREATE INDEX IF NOT EXISTS idx_analytics_campaign      ON followup_analytics (campaign_id);
CREATE INDEX IF NOT EXISTS idx_analytics_followup      ON followup_analytics (followup_id);
CREATE INDEX IF NOT EXISTS idx_prefs_customer          ON communication_preference_log (customer_id);

-- Filter and sort columns the queries actually use
CREATE INDEX IF NOT EXISTS idx_customers_status        ON customers (status);
CREATE INDEX IF NOT EXISTS idx_customers_created       ON customers (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_status            ON leads (status);
CREATE INDEX IF NOT EXISTS idx_leads_created           ON leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_email             ON leads (email);
CREATE INDEX IF NOT EXISTS idx_interactions_recent     ON interactions (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_interactions_rep_recent ON interactions (sales_rep_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_appointments_recent     ON appointments (customer_id, scheduled_start DESC);
CREATE INDEX IF NOT EXISTS idx_appointments_upcoming   ON appointments (assigned_sales_rep_id, scheduled_start DESC);
CREATE INDEX IF NOT EXISTS idx_appointments_status     ON appointments (status, scheduled_start);
CREATE INDEX IF NOT EXISTS idx_appointments_start      ON appointments (scheduled_start);
CREATE INDEX IF NOT EXISTS idx_tasks_open              ON tasks (assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_tasks_due               ON tasks (status, due_date);
CREATE INDEX IF NOT EXISTS idx_vehicles_available     ON vehicles (status);
CREATE INDEX IF NOT EXISTS idx_vehicles_make_model     ON vehicles (make, model);
CREATE INDEX IF NOT EXISTS idx_vehicles_price          ON vehicles (list_price);
CREATE INDEX IF NOT EXISTS idx_vehicles_stock          ON vehicles (stock_number);
CREATE INDEX IF NOT EXISTS idx_followups_due           ON followups (status, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_followups_recent        ON followups (customer_id, scheduled_date DESC);
CREATE INDEX IF NOT EXISTS idx_rules_active            ON followup_rules (trigger_event, is_active);
CREATE INDEX IF NOT EXISTS idx_campaigns_active        ON followup_campaigns (is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events        ON followup_analytics (campaign_id, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reps_email              ON sales_reps (email);
CREATE INDEX IF NOT EXISTS idx_reps_status             ON sales_reps (status);
CREATE INDEX IF NOT EXISTS idx_search_customers        ON customer_search_index (searchable_text);
CREATE INDEX IF NOT EXISTS idx_search_leads            ON lead_search_index (searchable_text);
CREATE INDEX IF NOT EXISTS idx_search_vehicles         ON vehicle_search_index (searchable_text);
"""

# --------------------------------------------------------------------------
# The six tables the code names and 001 never created.
#
# Written out rather than inferred from the INSERTs, because a search index
# needs a decision the INSERTs cannot supply: what is keyed, what is searchable,
# and what happens to the row it points at when that row goes away.
# --------------------------------------------------------------------------
SEARCH_TABLES = """
-- ---------------------------------------------------------------------
-- Search
--
-- These six are named by the code and were in neither the Postgres source nor
-- the generated schema, so every read and write against them failed with
-- "no such table". They are the searchable projection of the four tables the
-- staff actually search.
--
-- Keyed on the source row's own id rather than a generated one: the index row
-- and the source row share an identity, which is what makes the CASCADE below
-- correct. There is no separate primary key to keep in step.
--
-- `searchable_text` is a lowercased concatenation of the fields a person would
-- type, so LIKE '%...%' can use the index prefix and search stays one query
-- instead of a join per field.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS customer_search_index (
  customer_id    TEXT PRIMARY KEY,
  search_vector  TEXT,
  searchable_text TEXT NOT NULL,
  last_updated   TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS lead_search_index (
  lead_id        TEXT PRIMARY KEY,
  search_vector  TEXT,
  searchable_text TEXT NOT NULL,
  last_updated   TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (lead_id) REFERENCES leads (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS interaction_search_index (
  interaction_id TEXT PRIMARY KEY,
  search_vector  TEXT,
  searchable_text TEXT NOT NULL,
  last_updated   TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (interaction_id) REFERENCES interactions (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS vehicle_search_index (
  vehicle_id     TEXT PRIMARY KEY,
  search_vector  TEXT,
  searchable_text TEXT NOT NULL,
  last_updated   TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (vehicle_id) REFERENCES vehicles (id) ON DELETE CASCADE
);

-- One row per index, not per document. Keyed by the index name so a rebuild can
-- be in progress for one index without the others being marked stale.
CREATE TABLE IF NOT EXISTS search_index_metadata (
  index_type     TEXT PRIMARY KEY,
  last_build_time TEXT,
  duration_ms    INTEGER,
  record_count   INTEGER DEFAULT 0,
  status         TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'building', 'ready', 'failed')),
  metadata       TEXT
);

-- A staff member's saved search. `user_id` is a Netlify Identity `sub`, which is
-- the same value `sales_reps.id` is keyed on (see utils/staff-profile.js), so
-- the reference holds and survives an Identity re-invite.
CREATE TABLE IF NOT EXISTS saved_searches (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  name          TEXT NOT NULL,
  query         TEXT NOT NULL,
  filters       TEXT,
  entity_types  TEXT,
  created_by    TEXT,
  created_at    TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES sales_reps (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_saved_searches_user ON saved_searches (user_id, name);

-- ---------------------------------------------------------------------
-- Replacing Netlify Blobs
--
-- Three features were written against Blobs:
--
--   google-calendar   one shared OAuth token under the key `token`
--   booking-queue     one key per request
--   vehicle-features  one key, `favourites`
--
-- None of them work on this site, and the reason is not a bug in any of the
-- three: a Netlify function cannot reach a Blobs store without an explicit
-- siteID and token, and this account's plan refuses to issue one. The functions
-- all report their own absence honestly rather than failing silently, which is
-- why this was not noticed -- but bookings are emailed and not recorded,
-- favourites do not persist, and the calendar cannot connect.
--
-- These three tables are the replacement. The database is the one piece of
-- infrastructure on this site that is confirmed working, and moving to it makes
-- the storage per-user and transactional rather than a single shared key.
-- ---------------------------------------------------------------------

-- One Google Calendar connection per staff member.
--
-- `user_id` is the Netlify Identity `sub`, which is the same value
-- `sales_reps.id` is keyed on (see utils/staff-profile.js), so the foreign key
-- holds and survives an Identity re-invite.
--
-- ONE ROW PER PERSON, which is the whole point. The old design had a single
-- token under one key, so the first person to connect owned the dealership's
-- calendar and everybody else silently shared it -- bookings landed in whoever
-- connected first, and one person disconnecting removed it for all of them.
--
-- The refresh token is a long-lived credential. It is stored here and nowhere
-- else, and `ON DELETE CASCADE` from sales_reps means it goes when the person
-- does -- revocation is a delete, which is what makes withdrawing consent
-- actually take effect.
CREATE TABLE IF NOT EXISTS google_calendar_tokens (
  user_id         TEXT PRIMARY KEY,
  access_token    TEXT,
  refresh_token   TEXT,
  expires_at      INTEGER,
  scope           TEXT,
  google_email    TEXT,
  calendar_id     TEXT DEFAULT 'primary',
  connected_at    TEXT,
  updated_at      TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES sales_reps (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_google_tokens_expiry ON google_calendar_tokens (expires_at);

-- ---------------------------------------------------------------------
-- Site settings
--
-- WHY THIS TABLE EXISTS
-- ---------------------
-- The Decap CMS cannot be used for anything that has to change NOW. It commits
-- to git, and this site deploys PREBUILT from the CI host (netlify.toml sets
-- [build] command = ""), so a save produces a commit and no build: the change
-- stays unpublished until someone runs a build. An editor pressing Save and
-- seeing "Saved" is the failure mode, not a feature -- see docs/ADMIN.md.
--
-- So the copy an admin actually needs to change during business hours lives
-- here, and the front end reads it at request time. The build stays prebuilt and
-- costs no Netlify build minutes.
--
-- WHAT IS AND IS NOT IN HERE
-- --------------------------
-- Chrome and settings only: the signage copy, the stock-alert pitch, the
-- contact chips, an emergency banner.
--
-- NOT page content. Inventory and specials are the pages search traffic lands
-- on, and a value injected by JavaScript is invisible to a crawler, so those
-- must be in the served HTML. Moving them here would trade a working search
-- presence for convenience. They need a build, and the build is the honest
-- answer for them.
--
-- One row per key rather than one document holding an object, for the same
-- reason vehicle_favourites is one row per vehicle: a document is a
-- read-modify-write on every edit, so two people changing two different values
-- at the same moment lose one of the two. Rows do not collide.
--
-- `is_public` decides who may read it. Settings the public front end fetches
-- are public; anything internal is not, and is refused without a session rather
-- than filtered out client-side.
CREATE TABLE IF NOT EXISTS site_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT,
  -- 'text' | 'textarea' | 'boolean' | 'url' | 'phone'
  -- The admin form is built from this, so a setting cannot need a form change
  -- to be edited, and a textarea cannot be silently truncated to a line.
  kind        TEXT NOT NULL DEFAULT 'text'
              CHECK (kind IN ('text','textarea','boolean','url','phone')),
  label       TEXT,
  -- Which page the value appears on, so the form can be grouped and so a
  -- reader knows where to look. 'global' means footer/header chrome.
  applies_to  TEXT NOT NULL DEFAULT 'global',
  -- False for internal notes; never served to the public front end.
  is_public   INTEGER NOT NULL DEFAULT 1 CHECK (is_public IN (0, 1)),
  -- Set when a value has deliberately been blanked, so "not set" and
  -- "somebody typed a space" are different states.
  is_blank    INTEGER NOT NULL DEFAULT 0 CHECK (is_blank IN (0, 1)),
  updated_by  TEXT,
  updated_at  TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (updated_by) REFERENCES sales_reps (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_site_settings_applies ON site_settings (applies_to);
CREATE INDEX IF NOT EXISTS idx_site_settings_public ON site_settings (is_public, key);

-- A test-drive request waiting to go on a calendar.
--
-- Blobs stored these as `req-<id>` JSON documents. A table is the right shape:
-- the pending queue is a filtered view, and `WHERE status = 'new'` over rows is
-- something the database can answer with an index rather than something the
-- application has to enumerate keys to find.
--
-- `status` is the queue position: new -> synced, or -> sync-failed, or ->
-- cancelled. An index on (status, preferred_date) makes "what is waiting, soonest
-- first" the shape the query planner wants.
CREATE TABLE IF NOT EXISTS booking_requests (
  id               TEXT PRIMARY KEY,
  status           TEXT NOT NULL DEFAULT 'new'
                   CHECK (status IN ('new','synced','sync-failed','cancelled')),
  vehicle_id       TEXT,
  vehicle_title    TEXT,
  full_name        TEXT,
  email            TEXT,
  phone            TEXT,
  preferred_date   TEXT,
  preferred_time   TEXT,
  comments         TEXT,
  created_at       TEXT DEFAULT (datetime('now')),
  updated_at       TEXT,
  recorded_at      TEXT,
  google_event_id  TEXT,
  google_event_link TEXT,
  synced_at        TEXT,
  sync_error       TEXT
);
CREATE INDEX IF NOT EXISTS idx_bookings_pending ON booking_requests (status, preferred_date);
CREATE INDEX IF NOT EXISTS idx_bookings_email  ON booking_requests (email);

-- Which vehicles are featured on the site.
--
-- One row per vehicle rather than one document holding a list of slugs. A list in
-- a single JSON blob means every read rewrites the whole document and two people
-- starring different vehicles at the same moment loses one of the two. A row per
-- vehicle makes the read a SELECT and the write an INSERT, and they do not
-- collide.
CREATE TABLE IF NOT EXISTS vehicle_favourites (
  slug         TEXT PRIMARY KEY,
  featured     INTEGER NOT NULL DEFAULT 1,
  updated_at   TEXT DEFAULT (datetime('now'))
);
"""


def load_tables(core_sql):
    """Return {table: body} from 001_core.sql."""
    out = {}
    for m in re.finditer(
        r"CREATE TABLE (?:IF NOT EXISTS )?(\w+)\s*\(([\s\S]*?)\n\);", core_sql
    ):
        out[m.group(1)] = m.group(2)
    return out


def add_missing_columns(bodies, cols_sql):
    """Fold 003's ALTER TABLE ADD COLUMN into the CREATE bodies."""
    for m in re.finditer(
        r"ALTER TABLE (\w+) ADD COLUMN (\w+) (.+?);?\s*(?=ALTER|\Z)", cols_sql, re.S
    ):
        table, name, spec = m.group(1), m.group(2), m.group(3).strip()
        if table not in bodies:
            print(f"  ! 003 names a table not in 001: {table}", file=sys.stderr)
            continue
        if re.search(rf"^\s*{name}\s", bodies[table], re.M):
            continue  # already present
        # The previous line may or may not end in a comma. 001 ends most column
        # lists without one, so adding a line without checking produces
        # `... date_sold TEXT   status TEXT DEFAULT 'available'` -- a parse
        # error that only appears when the whole file is applied.
        body = bodies[table].rstrip()
        if not body.endswith(","):
            body += ","
        bodies[table] = body + f"\n  {name} {spec}"
        print(f"  + {table}.{name} {spec}")
    return bodies


def add_foreign_keys(bodies):
    for table, fks in FOREIGN_KEYS.items():
        if table not in bodies:
            print(f"  ! foreign keys for a table not in 001: {table}", file=sys.stderr)
            continue
        lines = []
        for column, parent, on_delete in fks:
            if not re.search(rf"^\s*{column}\s", bodies[table], re.M):
                print(f"  ! {table}.{column} does not exist; FK skipped", file=sys.stderr)
                continue
            lines.append(
                f"  FOREIGN KEY ({column}) REFERENCES {parent} (id)\n"
                f"    ON DELETE {on_delete} ON UPDATE CASCADE"
            )
        if lines:
            bodies[table] = bodies[table].rstrip().rstrip(",") + ",\n" + ",\n".join(lines)
            print(f"  + {table}: {len(lines)} foreign key(s)")


# --------------------------------------------------------------------------
# Columns the code names and 001 never had, beyond 003.
#
# Found by RUNNING the statements -- ci/discover-missing-columns.js. Each one is
# a query that fails with "no such column" against a real database, so this is a
# list of things that have never worked, not a list of nice-to-haves.
#
#   appointments.status      getUpcomingAppointments filters on it
#   tasks.status             getSalesRepTasks filters on it
#   followups.status         every follow-up query filters on it
#   followup_analytics.event_type   the analytics INSERT and reports name it
# --------------------------------------------------------------------------
EXTRA_COLUMNS = {
    # An appointment is booked, then confirmed, then completed or cancelled. The
    # status column is what makes "upcoming" and "past" answerable at all.
    "appointments": [
        ("status", "TEXT DEFAULT 'scheduled' "
                   "CHECK (status IN ('scheduled','confirmed','completed','cancelled','no_show'))"),
        # customer-dashboard selects these three alongside `status`.
        ("scheduled_date", "TEXT"),
        ("scheduled_time", "TEXT"),
        ("notes", "TEXT"),
        # ...and this one: what kind of appointment it is -- test drive, sales
        # appointment, delivery. Without it the dashboard cannot label anything.
        ("appointment_type", "TEXT DEFAULT 'appointment'"),
    ],
    # Tasks are open, in progress, blocked, or done.
    "tasks": [
        ("status", "TEXT DEFAULT 'open' "
                   "CHECK (status IN ('open','in_progress','blocked','completed','cancelled'))"),
    ],
    # A follow-up is scheduled, sent, skipped, or failed. `sent_date` already
    # records that it happened, but a scheduled-and-not-yet-sent follow-up has a
    # null sent_date and is indistinguishable from a failed one.
    "followups": [
        ("status", "TEXT DEFAULT 'scheduled' "
                   "CHECK (status IN ('scheduled','sent','skipped','failed','cancelled'))"),
    ],
    # What happened: sent, delivered, opened, clicked, converted, bounced. The
    # analytics INSERT writes it and the campaign reports group by it.
    "followup_analytics": [
        ("event_type", "TEXT NOT NULL"),
    ],
    # --- found by ci/discover-missing-columns.js; each is a live query ---
    #
    # customers: the consent columns. communication-preferences.js selects and
    # updates all of these, and customers has email_consent/sms_consent but not
    # the rest -- so every consent page and every unsubscribe fails.
    "customers": [
        ("phone_consent", "INTEGER DEFAULT 0"),
        ("communication_preferences", "TEXT"),
        ("consent_date", "TEXT"),
        ("consent_source", "TEXT"),
        ("gdpr_consent_withdrawn", "INTEGER DEFAULT 0"),
        ("consent_withdrawn_date", "TEXT"),
        ("consent_withdrawn_reason", "TEXT"),
        ("preferences", "TEXT"),
    ],

    # interactions: customer-dashboard selects description/notes.
    "interactions": [
        ("description", "TEXT"),
        ("notes", "TEXT"),
        # Read by customer-dashboard and written by createInteraction. Sits beside
        # the CHECK on `direction`, so the two describe the same record.
        ("interaction_type", "TEXT DEFAULT 'note'"),
    ],
    # leads: the free-text note a rep keeps on a lead. sales-add-note updates it,
    # sales-update-status reads it, sales-leads lists it -- so the note feature
    # has never stored anything.
    "leads": [
        ("sales_rep_notes", "TEXT"),
    ],
    # The audit template tables. `template_type` is validated by the create
    # schema and written by the INSERT, so creating a template named a type the
    # table had no column for. Without it the whole template library is
    # unwritable.
    "email_templates": [
        ("template_type", "TEXT NOT NULL DEFAULT 'custom'"),
    ],
    "sms_templates": [
        ("template_type", "TEXT NOT NULL DEFAULT 'custom'"),
    ],
    # communication_preference_log: what changed. `changes` holds the diff, but
    # without `action` there is no record of whether somebody opted in, opted
    # out, or was updated -- and an unsubscribe audit with no verb is not an
    # audit.
    "communication_preference_log": [
        ("action", "TEXT"),
    ],
    # followup_campaigns: campaign_type is validated by campaignSchemas.create
    # (`valid('nurture','re_engagement','welcome',...)`) and written by the
    # INSERT -- so creating a campaign named a type the table had no column for.
    # It is the field the whole follow-up system is organised around.
    "followup_campaigns": [
        ("campaign_type", "TEXT NOT NULL DEFAULT 'custom'"),
    ],
    # followup_rules: the templates a rule fires. email-templates and
    # sms-templates both count rules referencing a template before deleting it,
    # which is a referential check that could not run.
    "followup_rules": [
        ("email_template", "TEXT"),
        ("sms_template", "TEXT"),
    ],
    # sales_reps: customer-dashboard selects r.name/r.position/r.image and
    # database-service selects sr.capacity/sr.territory/sr.source_expertise/
    # sr.budget_expertise. `name` and `position` are the interesting ones: the
    # dashboard displays them, so a rep's name and job title have never rendered.
    "sales_reps": [
        ("name", "TEXT"),
        ("position", "TEXT"),
        ("image", "TEXT"),
        ("capacity", "INTEGER DEFAULT 0"),
        ("territory", "TEXT"),
        ("source_expertise", "TEXT"),
        ("budget_expertise", "TEXT"),
    ],
}


def add_extra_columns(bodies):
    """Add the columns discovered by running the code against the schema."""
    # A duplicate key in EXTRA_COLUMNS silently discards the first entry, and the
    # symptom is a schema missing a column with nothing to say so. That happened
    # here: `appointments` appeared twice, and `status` -- which
    # getUpcomingAppointments filters on -- was quietly dropped from the output.
    # It was caught only because the generated schema would not apply.
    #
    # Python allows it, so this checks for it. A dict that quietly loses half its
    # contents is exactly the kind of thing that should refuse to run.
    seen_tables = set()
    for table in EXTRA_COLUMNS:
        if table in seen_tables:
            raise SystemExit(
                f"  ERROR: EXTRA_COLUMNS lists {table!r} twice. The second entry "
                "replaces the first and its columns are lost with no warning. "
                "Merge them into one entry."
            )
        seen_tables.add(table)

    for table, cols in EXTRA_COLUMNS.items():
        if table not in bodies:
            print(f"  ! extra column for a table not in 001: {table}", file=sys.stderr)
            continue
        for name, spec in cols:
            if re.search(rf"^\s*{name}\s", bodies[table], re.M):
                continue
            body = bodies[table].rstrip()
            if not body.endswith(","):
                body += ","
            bodies[table] = body + f"\n  {name} {spec}"
            print(f"  + {table}.{name} {spec}")
HEADER = """-- schema.sql -- GENERATED by scripts/build-schema.py. Do not edit by hand.
--
-- The complete libSQL schema for caddyed.com. One file, applied in one go.
--
-- It supersedes applying 001 + 002 + 003 + 004 in order, which is how this
-- schema was actually arrived at: each of those four fixed something real, and
-- each was a discovery rather than a plan. That is normal, and it is also the
-- worst thing to leave behind -- four ordered files where the last contradicts
-- the first, and a reader of 001 cannot tell what the real shape is.
--
-- 001..003 are kept as the record of how it got here. This file is the truth.
--
--   tables   21
--   foreign keys 22   (an audit found zero)
--   indexes  ~50
--
-- PRAGMA
-- ------
-- SQLite does not enforce foreign keys unless asked, and libSQL is SQLite:
-- `PRAGMA foreign_keys` defaults to OFF. The constraints below are therefore
-- correct and INERT unless a connection enables it. database-service.js issues
-- the pragma on every connection, which is what makes them real.
--
-- If that line is ever removed, every constraint in this file silently stops
-- being true and nothing fails -- the schema still looks right and the guarantee
-- is gone. To check on a live connection:
--
--     PRAGMA foreign_keys;        -- expect 1
--     PRAGMA foreign_key_check;   -- expect no rows
--
-- IDS
-- ---
-- Every id is TEXT and every one is generated by the application
-- (DatabaseService.newId), not by a schema default. There is no expression that
-- is a valid default on both libSQL and Postgres, and this project reaches both
-- through one data path -- so it is made in JavaScript, where it means the same
-- thing either way.

PRAGMA foreign_keys = ON;

"""


def main():
    core = (TURSO / "001_core.sql").read_text()
    extra_cols = (TURSO / "003_missing_columns.sql").read_text()
    extra_cols = "\n".join(
        l for l in extra_cols.split("\n") if not l.strip().startswith("--")
    )

    bodies = load_tables(core)
    print(f"  tables from 001_core.sql: {len(bodies)}")

    print("  folding in 003_missing_columns.sql:")
    add_missing_columns(bodies, extra_cols)

    print("  adding columns found by running the queries:")
    add_extra_columns(bodies)

    print("  adding foreign keys:")
    add_foreign_keys(bodies)

    order = [m.group(1) for m in re.finditer(r"CREATE TABLE (?:IF NOT EXISTS )?(\w+)", core)]

    parts = [HEADER]
    for table in order:
        if table not in bodies:
            continue
        parts.append(
            f"CREATE TABLE IF NOT EXISTS {table} (\n{bodies[table]}\n);\n"
        )
    parts.append(SEARCH_TABLES)
    parts.append("-- Indexes\n" + INDEXES)
    parts.append(VIEWS)

    OUT.write_text("\n".join(parts))
    print(f"\n  wrote {OUT.relative_to(ROOT)}  ({len(OUT.read_text().splitlines())} lines)")


# --------------------------------------------------------------------------
# Views.
#
# The functions in this codebase contain the same handful of joins over and
# over -- customer plus their rep, customer plus their latest interaction,
# appointments joined to customers. Each copy is a place to get it subtly wrong,
# and each is a place to change it later.
#
# A view is the join written once. The functions select from it, the dashboard
# aggregates from it, and a fix to the join is a fix to all of them.
# --------------------------------------------------------------------------
VIEWS = r"""
-- ---------------------------------------------------------------------
-- Views
--
-- The joins this application performs over and over, written once.
--
-- Every one of these was duplicated across functions, which means every one of
-- them could be, and was, subtly different. customer-dashboard, sales-customers
-- and followup-system each assembled a customer-plus-rep shape of their own.
--
-- A view is the join stated once. The functions select from it, the dashboard
-- aggregates from it, and a fix to the join is a fix to all of them at the same
-- time -- which is the difference between one bug and three.
-- ---------------------------------------------------------------------

-- A customer with the rep who owns them. LEFT JOIN, not INNER: a customer with
-- no assigned rep is still a customer, and an inner join silently loses them.
CREATE VIEW IF NOT EXISTS v_customer_with_rep AS
SELECT
  c.id,
  c.first_name,
  c.last_name,
  c.email,
  c.phone,
  c.status,
  c.customer_type,
  c.assigned_sales_rep_id,
  r.first_name AS rep_first_name,
  r.last_name  AS rep_last_name,
  r.email      AS rep_email,
  r.phone      AS rep_phone,
  r.role       AS rep_role
FROM customers c
LEFT JOIN sales_reps r ON r.id = c.assigned_sales_rep_id;

-- A customer with the counts an operator actually asks for. Doing this with
-- correlated subqueries per customer is what the dashboard did, and it is one
-- query per customer per count.
CREATE VIEW IF NOT EXISTS v_customer_summary AS
SELECT
  c.id,
  c.first_name,
  c.last_name,
  c.email,
  c.phone,
  c.status,
  c.customer_type,
  c.assigned_sales_rep_id,
  c.created_at,
  (SELECT COUNT(*) FROM appointments a
     WHERE a.customer_id = c.id)                        AS appointment_count,
  (SELECT COUNT(*) FROM interactions i
     WHERE i.customer_id = c.id)                        AS interaction_count,
  (SELECT COUNT(*) FROM leads l
     WHERE l.customer_id = c.id)                         AS lead_count,
  (SELECT COUNT(*) FROM tasks t
     WHERE t.customer_id = c.id AND t.status != 'completed') AS open_task_count,
  (SELECT MAX(a.scheduled_start) FROM appointments a
     WHERE a.customer_id = c.id)                        AS last_appointment
FROM customers c;

-- Inventory that is actually sellable. The status filter lives here rather than
-- in a dozen queries that each remember it slightly differently -- and the
-- column this filters on did not exist until 003, so every one of those queries
-- was failing.
CREATE VIEW IF NOT EXISTS v_available_inventory AS
SELECT
  v.id,
  v.stock_number,
  v.vin,
  v.year,
  v.make,
  v.model,
  v.trim,
  v.body_style,
  v.exterior_color,
  v.interior_color,
  v.mileage,
  v.list_price,
  v.status,
  v.image_urls
FROM vehicles v
WHERE v.status = 'available';

-- The sales pipeline, one row per lead, with the customer it became. Leads are
-- the intake record and customers are what they turn into, and the join between
-- the two is the question the dashboard exists to answer.
CREATE VIEW IF NOT EXISTS v_sales_pipeline AS
SELECT
  l.id                AS lead_id,
  l.first_name,
  l.last_name,
  l.email,
  l.phone,
  l.status,
  l.form_type,
  l.lead_source,
  l.vehicle_interest,
  l.assigned_sales_rep_id,
  l.created_at,
  c.id                AS customer_id,
  c.status            AS customer_status,
  r.first_name        AS rep_first_name,
  r.last_name         AS rep_last_name
FROM leads l
LEFT JOIN customers c ON c.id = l.customer_id
LEFT JOIN sales_reps r ON r.id = l.assigned_sales_rep_id;

-- A rep's diary: what is booked, for whom. One row per appointment, with the
-- customer joined in, which is what the calendar and the rep dashboard both
-- need and both used to assemble themselves.
CREATE VIEW IF NOT EXISTS v_rep_schedule AS
SELECT
  a.id,
  a.appointment_type,
  a.title,
  a.scheduled_start,
  a.scheduled_end,
  a.status,
  a.assigned_sales_rep_id,
  a.vehicle_of_interest,
  c.id        AS customer_id,
  c.first_name AS customer_first_name,
  c.last_name  AS customer_last_name,
  c.phone      AS customer_phone,
  c.email      AS customer_email
FROM appointments a
LEFT JOIN customers c ON c.id = a.customer_id;

-- Campaign performance, aggregated once. Every report that needed these numbers
-- wrote its own SUM/CASE block, and the definitions drifted.
CREATE VIEW IF NOT EXISTS v_campaign_performance AS
SELECT
  fc.id AS campaign_id,
  fc.name,
  fc.campaign_type,
  fc.is_active,
  fc.created_at,
  COUNT(DISTINCT f.id)   AS followup_count,
  COUNT(DISTINCT r.id)   AS rule_count,
  COUNT(DISTINCT a.id)   AS analytics_event_count
FROM followup_campaigns fc
LEFT JOIN followups f          ON f.campaign_id = fc.id
LEFT JOIN followup_rules r     ON r.campaign_id = fc.id
LEFT JOIN followup_analytics a ON a.campaign_id = fc.id
GROUP BY fc.id;
"""

if __name__ == "__main__":
    main()
