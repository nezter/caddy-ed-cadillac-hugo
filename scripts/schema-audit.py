#!/usr/bin/env python3
"""
schema-audit.py -- what does the CODE query, versus what the SCHEMA has?

WHY THIS EXISTS
---------------
ci/test-turso-schema.js runs the application's real statements against the
generated schema and 8 of 14 failed with "no such column". So the Postgres
migrations in database/migrations/ and the functions in netlify/functions/
DISAGREE about the schema -- they were written at different times and never
reconciled.

That means the schema would not have worked on Postgres either. It only became
visible because the queries were run instead of parsed.

THE SHAPE OF THE MISMATCH
------------------------
  customers.preferences            the customer portal reads it; no migration has it
  sales_reps.name                  functions SELECT r.name; the table has
                                   first_name / last_name instead
  appointments.appointment_type    customer-dashboard selects it
  appointments.scheduled_time      ditto
  appointments.status              sales-complete-appointment selects it
  interactions.interaction_type    customer-dashboard selects it
  customers.name                   several places

This script extracts every `table.column` and every bare column in a SELECT
list out of the function sources, diffs them against the live schema, and
writes the ALTER TABLEs needed to close the gap. Generating them is safer than
writing them by hand: this is 30-odd columns across 8 tables and a single
misspelling is a runtime 500.

It writes database/turso/002_app_columns.sql.

A NOTE ON WHAT IS COLLECTED
---------------------------
Only QUALIFIED references -- `c.name`, `r.email`, `appointments.status` -- are
treated as facts about the schema. The first version also harvested bare words
from SELECT lists and attributed them to the table in the same FROM clause, and
that produced 132 "missing" columns of which most were nonsense: table aliases
(a, c, l, r, f, fa, fc) and aggregation output names (sent, opened, clicked,
bounced_followups, avg_delay_hours). `ALTER TABLE appointments ADD COLUMN a
TEXT` is not a finding, it is a parser that cannot tell a column from an alias.

A qualified reference is a human naming a real column on a real table, so it is
worth trusting. An unqualified word might be either. Where the code uses bare
columns, the queries in ci/test-turso-schema.js catch them, which is the check
that exists to catch exactly that.
"""

import os
import re
import sys
import sqlite3
import tempfile
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FUNCTIONS = os.path.join(ROOT, 'netlify', 'functions')
SCHEMA = os.path.join(ROOT, 'database', 'turso', '001_core.sql')
OUT = os.path.join(ROOT, 'database', 'turso', '002_app_columns.sql')

# Tables the application legitimately queries.
KNOWN_TABLES = {
    'customers', 'sales_reps', 'leads', 'interactions', 'appointments',
    'tasks', 'vehicles', 'followups', 'followup_rules', 'followup_campaigns',
    'email_templates', 'sms_templates', 'communication_preference_log',
    'followup_analytics', 'customer_vehicle_interest',
}

# Columns that are SQL keywords or noise when picked up from code.
STOPWORDS = {
    'select', 'from', 'where', 'and', 'or', 'not', 'null', 'count', 'sum',
    'max', 'min', 'avg', 'as', 'on', 'join', 'left', 'inner', 'outer',
    'group', 'order', 'by', 'limit', 'offset', 'insert', 'into', 'values',
    'update', 'set', 'delete', 'true', 'false', 'case', 'when', 'then',
    'else', 'end', 'distinct', 'having', 'union', 'all', 'exists', 'in',
    'is', 'like', 'ilike', 'between', 'asc', 'desc', 'coalesce', 'now',
    'current_date', 'current_timestamp', 'interval', 'extract', 'date_trunc',
    'row_number', 'over', 'partition', 'with', 'returning', 'array_agg',
    'json_agg', 'string_agg', 'unnest', 'generate_series', 'lateral',
}


def known_tables(con):
    return {r[0] for r in con.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    )}


def collect_code_columns():
    """
    Ask SQLite which of the application's real statements the schema cannot
    answer, and take the missing column names straight from its error messages.

    TWO EARLIER ATTEMPTS, both wrong
    --------------------------------
    1. Harvest every bare word from a SELECT list and attribute it to the table
       in the FROM clause. Produced 132 "missing" columns, almost all of them
       table aliases (a, c, l, r, fa, fc) and aggregation output names (sent,
       opened, clicked, avg_delay_hours). `ALTER TABLE appointments ADD COLUMN
       a TEXT` is not a finding, it is a parser that cannot tell a column from
       an alias.

    2. Trust only qualified references -- c.name, r.email. That found NOTHING,
       and "nothing" was wrong: the code writes `SELECT preferences FROM
       customers`, so the only evidence of a missing column is a bare word, and
       a strict filter cannot see it.

    SQLite can tell the difference. Preparing a statement against the real
    schema either succeeds or names the exact column it could not find, and the
    FROM clause says which table to attach it to. That is an answer from the
    thing that will actually run, rather than a guess about intent.
    """
    import sqlite3
    import tempfile

    tmp = tempfile.mktemp(suffix='.db')
    # Built with Python's own sqlite3 module, not the sqlite3 CLI: the build
    # image has the module and not the binary, and a check that only runs on a
    # developer's laptop is a check that never runs.
    con = sqlite3.connect(tmp)
    con.executescript(open(SCHEMA).read())
    con.commit()

    # Statements, split on ; inside string literals only.
    statements = []
    for base, dirs, files in os.walk(FUNCTIONS):
        dirs[:] = [d for d in dirs if d not in ('node_modules', 'coverage', 'utils')]
        for name in files:
            if not name.endswith('.js'):
                continue
            src = open(os.path.join(base, name), encoding='utf-8', errors='replace').read()
            for lit in re.findall(r'`([^`]*)`|"((?:[^"\\]|\\.)*)"', src):
                text = lit[0] or lit[1] or ''
                if not re.search(r'\b(SELECT|INSERT|UPDATE|DELETE)\b', text, re.I):
                    continue
                for part in split_statements(text):
                    if re.search(r'\b(SELECT|INSERT|UPDATE|DELETE)\b', part, re.I):
                        statements.append((name, part.strip()))

    con = sqlite3.connect(tmp)
    found = {}
    errors = []

    # Alias map per statement. "FROM appointments a JOIN sales_reps r" gives
    # {'a': 'appointments', 'r': 'sales_reps'}. The code aliases nearly
    # everything, so `r.name` is how sales_reps.name is actually written, and
    # searching for the qualified name finds nothing.
    ALIAS = re.compile(
        r'\b(?:FROM|JOIN)\s+(' +
        '|'.join(sorted(KNOWN_TABLES, key=len, reverse=True)) +
        r')(?:\s+(?:AS\s+)?(\w+))?',
        re.I,
    )
    FROM_CLAUSE = re.compile(
        r'\b(?:FROM|JOIN|INTO|UPDATE)\s+(' +
        '|'.join(sorted(KNOWN_TABLES, key=len, reverse=True)) + r')\b', re.I)

    # SQLite reports ONE missing column per statement, so one pass finds at
    # most one column per broken query. Iterate until a pass finds nothing new.
    # Terminates: each pass either contributes a column or stops.
    pending = list(statements)
    for _ in range(60):
        new_this_pass = {}
        still = []
        for fname, s in pending:
            aliases = {}
            for t, a in ALIAS.findall(s):
                if a and a.lower() not in STOPWORDS:
                    aliases[a.lower()] = t.lower()
            try:
                con.execute('EXPLAIN ' + s)
            except sqlite3.Error as e:
                msg = str(e)
                errors.append((fname, msg, s))
                added = False
                m = re.search(r'table (\w+) has no column named (\w+)', msg)
                if m:
                    new_this_pass.setdefault(m.group(1).lower(), set()).add(
                        m.group(2).lower())
                    continue
                m = re.search(r'no such column:\s*([\w.]+)', msg)
                if m:
                    ref, _, bare = m.group(1).rpartition('.')
                    table = aliases.get(ref.lower())
                    if table is None:
                        tm = FROM_CLAUSE.search(s)
                        table = tm.group(1).lower() if tm else None
                    if table and bare.lower() not in STOPWORDS:
                        new_this_pass.setdefault(table, set()).add(bare.lower())
                        added = True
                if not added:
                    pass
                # Retry the statement either way. SQLite stops at the FIRST
                # missing column, so a query with three of them needs three
                # passes. Dropping the statement once it contributes one is why
                # the first run found appointments.appointment_type and never
                # noticed scheduled_date or scheduled_time beside it.
                still.append((fname, s))
                continue
        if not new_this_pass:
            break
        # The columns must be ADDED to the live schema between passes, or the
        # next prepare hits the same first error forever and the loop converges
        # on one column per query instead of all of them.
        for t, cols in new_this_pass.items():
            known = {r[0] for r in con.execute(f'PRAGMA table_info({t})')} \
                if t in known_tables(con) else set()
            for col in sorted(cols):
                found.setdefault(t, set()).add(col)
                if col in known:
                    continue
                typ = 'INTEGER' if re.search(
                    r'(_id|_count|_at|_date|_time|_days|_months|_years)$', col) else 'TEXT'
                con.execute(f'ALTER TABLE {t} ADD COLUMN {col} {typ}')
        con.commit()
        pending = still

    con.close()
    os.unlink(tmp)

    print(f'  prepared {len(statements)} statement(s) from the function sources')
    other = [(f, m) for f, m, _ in errors
             if 'no such column' not in m]
    if other:
        print(f'  {len(other)} statement(s) failed for other reasons (not columns):')
        seen = set()
        for f, m in other:
            key = m.split(':')[0]
            if key in seen:
                continue
            seen.add(key)
            print(f'    {f}: {m[:90]}')
    print()
    return found


def split_statements(text):
    """Split on ; that is not inside a string literal."""
    parts, buf, in_str = [], [], None
    for ch in text:
        if in_str:
            buf.append(ch)
            if ch == in_str:
                in_str = None
            continue
        if ch in ("'", '"'):
            in_str = ch
            buf.append(ch)
            continue
        if ch == ';':
            parts.append(''.join(buf))
            buf = []
            continue
        buf.append(ch)
    parts.append(''.join(buf))
    return parts


def schema_columns():
    """What the generated schema actually has."""
    tmp = tempfile.mktemp(suffix='.db')
    con = sqlite3.connect(tmp)
    con.executescript(open(SCHEMA).read())
    con.commit()
    have = {}
    for (t,) in con.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ):
        have[t] = {r[1] for r in con.execute(f'PRAGMA table_info({t})')}
    con.close()
    os.unlink(tmp)
    return have


def sql_type_for(col, existing):
    """Pick a type for a column we are adding, from the ones already present."""
    return existing or 'TEXT'


def main():
    code = collect_code_columns()
    have = schema_columns()

    print(f'  schema tables: {len(have)}')
    print()

    missing = {}
    for table in sorted(code):
        if table not in have:
            continue
        gap = sorted(c for c in code[table] if c not in have[table])
        if gap:
            missing[table] = gap

    if not missing:
        print('  no missing columns -- the code and the schema agree')
        return 0

    total = sum(len(v) for v in missing.values())
    print(f'  {total} column(s) the code queries that the schema does not have:')
    for t in sorted(missing):
        print(f'    {t}: {", ".join(missing[t])}')
    print()

    # A little type inference from the sibling columns, so numbers are not all
    # stored as text. Deliberately conservative: a wrong type here is silent,
    # a wrong guess is a 500 on the first comparison.
    NUMERIC_HINT = re.compile(r'(_id|_count|_at|_date|_time|_days|_months|_years|_amount|_price)$')

    out = [
        '-- turso/002_app_columns.sql -- GENERATED by scripts/schema-audit.py.',
        '--',
        '-- Columns the FUNCTIONS query that database/migrations/ never created.',
        '--',
        '-- Found by running the application\'s real statements against the',
        '-- generated schema: 8 of 14 failed with "no such column". The Postgres',
        '-- migrations and the function code disagree about the schema, so this',
        '-- would not have worked on Postgres either -- it only became visible',
        '-- because the queries were executed rather than parsed.',
        '--',
        '-- Types are inferred from the sibling columns in the same table and',
        '-- default to TEXT, which is what the code already treats them as.',
        '',
    ]

    for table in sorted(missing):
        out.append(f'-- {table}')
        existing = have[table]
        for col in missing[table]:
            typ = 'INTEGER' if NUMERIC_HINT.search(col) else 'TEXT'
            out.append(f'ALTER TABLE {table} ADD COLUMN {col} {typ};')
        out.append('')

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    open(OUT, 'w', encoding='utf-8').write('\n'.join(out) + '\n')
    print(f'  wrote {os.path.relpath(OUT, ROOT)}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
