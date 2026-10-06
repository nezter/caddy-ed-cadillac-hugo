#!/usr/bin/env python3
"""
strip-supabase.py -- remove the dead Supabase path from database-service.js.

WHY
---
`query()` used to try three databases in order:

  1. a Postgres pool                        (primary)
  2. Supabase, for writes                   (fallback)
  3. a "mock database"                      (last resort)

None of steps 2 and 3 can ever run on this deployment, and both are worse than
dead -- they are WRONG in ways that look like success.

Step 2 parsed SQL with a regex to find the table and then THREW THE WHERE CLAUSE
AWAY:

    const tableMatch = sql.match(/FROM\s+(\w+)/i);
    if (tableMatch) {
      const { data, error } = await supabase.from(tableName).select('*').limit(1000);
      // "Basic filtering - in production, use proper SQL parsing"
      if (sql.includes('WHERE')) {
        console.log('⚠️ Complex WHERE clauses not fully supported');
      }
      return { rows: filteredData, ... };
    }

A query for one customer's appointments would have returned every row in the
table. Writes went through an RPC named `exec_sql` that no Supabase project here
defines.

Step 3 returned `{ rows: [], rowCount: 0 }` for ANY query. So with no database
configured, "list all customers" succeeded with an empty list and a 200 --
indistinguishable from "you have no customers". A sales tool that reports an empty
pipeline when it simply cannot reach its data is worse than one that is down.

The replacement is one path: Postgres, else Turso, else an error that says a
database is not configured. libSQL does writes, so nothing is lost by dropping
Supabase -- and the generated libSQL schema has already been proven against the
application's real queries (14/14).

This script is deliberately surgical: it replaces one contiguous region and
touches nothing else.
"""

import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
TARGET = ROOT / 'netlify/functions/utils/database-service.js'

START_MARK = '  // Determine which database to use'
END_MARK = """  } catch (error) {
    console.error('Database query failed:', error);

    // Fallback to mock database
    console.log('🔄 Falling back to mock database');
    await new Promise(resolve => setTimeout(resolve, 50));
    return {
      rows: [],
      rowCount: 0
    };
  }
}"""

REPLACEMENT = """  // One data path, in priority order: Postgres, then Turso, then an honest
  // failure.
  //
  // This used to be three. Supabase sat in the middle as a write fallback, and
  // a "mock database" sat at the end.
  //
  // Supabase could not have worked here -- its write path called an RPC named
  // exec_sql that no configured project defines -- and its read path was
  // actively wrong: it pulled the table name out of the SQL with a regex and
  // then DISCARDED THE WHERE CLAUSE, so a query for one customer's rows would
  // have returned every row in the table.
  //
  // The mock fallback returned { rows: [], rowCount: 0 } for anything. With no
  // database configured, "list all customers" therefore SUCCEEDED with an empty
  // list and a 200 -- indistinguishable from a business with no customers. A
  // sales tool that reports an empty pipeline when it cannot reach its data is
  // worse than one that is visibly down, because nobody investigates a 200.
  //
  // libSQL does writes, so dropping Supabase loses nothing. What is left either
  // works or says why it did not.
  const target = turso;
  if (!target) {
    const err = new Error(
      'No database is configured. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN, ' +
        'or DATABASE_URL for Postgres.'
    );
    err.code = 'DB_NOT_CONFIGURED';
    throw err;
  }

  try {
    const result = await target.execute({ sql, args: safeParams });
    return {
      rows: result.rows,
      rowCount: result.rowsAffected != null ? result.rowsAffected : result.rows.length
    };
  } catch (dbError) {
    // A real query failure, reported as one. The old mock fallback swallowed
    // this and answered with zero rows.
    console.error('Database query failed:', dbError.message);
    throw dbError;
  }
}"""


def main():
    src = TARGET.read_text(encoding='utf-8')

    if 'mock database' not in src:
        print('  already stripped; nothing to do')
        return 0

    start = src.find(START_MARK)
    if start == -1:
        print('  FAIL: start marker not found', file=sys.stderr)
        return 1
    end = src.find(END_MARK)
    if end == -1:
        print('  FAIL: end marker not found', file=sys.stderr)
        return 1
    end += len(END_MARK)

    out = src[:start] + REPLACEMENT + src[end:]
    TARGET.write_text(out, encoding='utf-8')
    removed = end - start - len(REPLACEMENT)
    print(f'  database-service.js: replaced {removed} characters of Supabase + mock fallback')
    return 0


if __name__ == '__main__':
    sys.exit(main())
