#!/usr/bin/env python3
"""
portable-search-index.py -- rewrite search-index-service.js for libSQL.

WHAT IT REWRITES, AND WHY
-------------------------
The four index builders each did three things that only exist in Postgres:

    CREATE TABLE customer_search_index (
      search_vector TSVECTOR,                                 -- a Postgres type
      last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX ... USING GIN(search_vector);                -- a Postgres index
    SELECT to_tsvector('english', <text>)                     -- a Postgres function

So the service tried to CREATE the tables itself, with Postgres types, on a
database that has neither the types nor the function. The CREATE failed, the
call was never reached, and the four search indexes have never been built. The
tables themselves are now in database/turso/schema.sql, created portably.

This script:
  1. removes the per-method CREATE TABLE, so the schema file is the only place
     the shape of a table is written down -- one answer, not five;
  2. replaces to_tsvector('english', X) with X;
  3. leaves ON CONFLICT ... DO UPDATE alone, because that IS valid SQLite and is
     the right way to write an upsert.

WHAT IS GIVEN UP, EXPLICITLY
----------------------------
Postgres full-text ranking. `to_tsvector` stemmed words -- "selling" matched
"sell" -- and `ts_rank` scored by relevance. SQLite has neither, and porting
them would mean writing a stemmer.

What it has instead is `searchable_text` with an index, matched with LIKE, which
gives substring matching rather than stemmed word matching. That is a real
difference and it is the right trade for a dealership CRM: a person searching
"escal" wants Escalade, and stemming does nothing for them. Ranking becomes
"prefix match first, then substring", which is what people expect from a search
box anyway.

Run: python3 scripts/portable-search-index.py [--write]
"""

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
TARGET = ROOT / "netlify" / "functions" / "utils" / "search-index-service.js"
WRITE = "--write" in sys.argv

NOTE = """    // NO DDL HERE.
    //
    // This used to CREATE the index table itself:
    //
    //     CREATE TABLE customer_search_index (
    //       search_vector TSVECTOR, ...
    //     );
    //     CREATE INDEX ... USING GIN(search_vector);
    //
    // TSVECTOR and USING GIN are Postgres. This database is SQLite, which has
    // neither, so the CREATE failed on every build and the index was never
    // populated -- the four search indexes have never existed.
    //
    // The tables are now in database/turso/schema.sql, created portably, and
    // that file is the only place a table's shape is written down. One answer
    // rather than five, and a change to a column reaches all of them.
    //
    // There is no to_tsvector here either. `searchable_text` is a lowercased
    // concatenation of the fields a person would type, indexed, and matched with
    // LIKE. That gives substring matching rather than stemmed word matching,
    // which is the better trade here: someone typing "escal" wants Escalade,
    // and stemming does not help them.
"""

t = TARGET.read_text()

# ---- 1. remove every `const createIndexSql = \`...\`;` and its query call ----
before = t
# The leading comment differs between the four methods ("Create or update search
# index table for customers", "...for the search", and so on), so the pattern
# matches on the code rather than the prose above it. Matching prose meant one
# of four was rewritten and three were left creating Postgres tables, which is
# exactly the kind of partial success that looks like a completed job.
t, n_create = re.subn(
    r"[ \t]*(?://[^\n]*\n)*"
    r"[ \t]*const createIndexSql = `[\s\S]*?`;\n\n"
    r"[ \t]*await DatabaseService\.query\(createIndexSql\);\n\n",
    NOTE,
    t,
)
print(f"  removed {n_create} CREATE TABLE / GIN INDEX blocks")

# ---- 2. to_tsvector('english', X) -> X -------------------------------------
def strip_tsvector(text):
    total = 0
    while True:
        m = re.search(r"to_tsvector\(\s*'english'\s*,", text)
        if not m:
            return text, total
        # the argument starts after the comma; walk to its matching ')'
        i = m.end()
        while text[i] in " \n\t":
            i += 1
        depth = 0
        start = i
        while i < len(text):
            c = text[i]
            if c == "(":
                depth += 1
            elif c == ")":
                if depth == 0:
                    break
                depth -= 1
            i += 1
        inner = text[start:i]
        # re-indent the continuation lines one level left
        dedented = re.sub(r"\n(\s+)", lambda mm: "\n" + mm.group(1)[2:], inner)
        text = text[: m.start()] + dedented.strip() + text[i:]
        total += 1


t, n_ts = strip_tsvector(t)
print(f"  rewrote {n_ts} to_tsvector() calls")

if t == before:
    print("  nothing changed")
    sys.exit(1)

TARGET.write_text(t)
print(f"  {'wrote' if WRITE else 'would write'} {TARGET.relative_to(ROOT)}")

# ---- report what is left ----------------------------------------------------
left = []
for pat, name in [
    (r"\bTSVECTOR\b", "TSVECTOR"),
    (r"\bto_tsvector\b", "to_tsvector"),
    (r"\bplainto_tsquery\b", "plainto_tsquery"),
    (r"\bts_rank\b", "ts_rank"),
    (r"\bUSING GIN\b", "USING GIN"),
    (r"@@", "@@ full-text operator"),
]:
    n = len(re.findall(pat, t))
    if n:
        left.append((name, n))
if left:
    print("\n  STILL PRESENT (excluding comments):")
    for name, n in left:
        print(f"    {n:3d}  {name}")
else:
    print("  no Postgres full-text constructs left in code")
