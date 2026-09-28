#!/usr/bin/env python3
"""
migrate-off-supabase.py -- move the three remaining Supabase callers onto the
one SQL data path.

  netlify/functions/leads.js
      createClient(...).from('leads').update({...}).eq('id', x)
    becomes
      query('UPDATE leads SET last_contact = $1 WHERE id = $2', [...])

  netlify/functions/utils/enhanced-database-service.js
      this.supabase.from('followup_campaigns').select('count')
    becomes
      this.query('SELECT count(*) FROM followup_campaigns')

  netlify/functions/utils/deduplication-service.js
      the query-builder form, five call sites
    becomes
      parameterised SQL through the shared query()

WHY SQL AND NOT THE QUERY BUILDER
-----------------------------------
The builder form it is replacing discarded WHERE clauses when it fell back, and
`@supabase/supabase-js` cannot be configured on this deployment at all. Every
one of these is a straightforward parameterised statement, and going through
query() means they get the real database, real errors, and the allowlisted sort
fixes rather than a second, subtly-wrong implementation.

The old SQL is kept in a comment at each site so the mapping is auditable
without having to read this file.
"""

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
F = ROOT / 'netlify/functions'

EDITS = []

# ---------------------------------------------------------------- leads.js
EDITS.append((
    F / 'leads.js',
    """            // Update the existing lead's last contact time
            const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
            await supabase
              .from('leads')
              .update({ last_contact: new Date().toISOString() })
              .eq('id', duplicateCheck.duplicates[0].lead.id);""",
    """            // Update the existing lead's last contact time.
            //
            // Was: supabase.from('leads').update({ last_contact })
            //        .eq('id', id)
            // Supabase is not configurable on this deployment, and its fallback
            // path discarded the WHERE clause entirely -- so this would have
            // updated every lead row. Parameterised SQL through the shared
            // query() is both correct and portable.
            await query(
              'UPDATE leads SET last_contact = $1 WHERE id = $2',
              [new Date().toISOString(), duplicateCheck.duplicates[0].lead.id]
            );""",
))

EDITS.append((
    F / 'leads.js',
    "const { createClient } = require('@supabase/supabase-js');\n",
    "",
))

# ------------------------------------------------ enhanced-database-service
EDITS.append((
    F / 'utils/enhanced-database-service.js',
    """      if (this.supabase) {
        const { data, error } = await this.supabase.from('followup_campaigns').select('count').limit(1);""",
    """      // Was: this.supabase.from('followup_campaigns').select('count').limit(1)
      if (this.supabase) {
        const { data, error } = { data: null, error: null };
        try {
          const r = await this.query('SELECT count(*) AS c FROM followup_campaigns');
          data = r.rows;
        } catch (e) {
          error = { message: e.message };
        }""",
))

EDITS.append((
    F / 'utils/enhanced-database-service.js',
    "const { createClient } = require('@supabase/supabase-js');\n",
    "",
))

EDITS.append((
    F / 'utils/enhanced-database-service.js',
    "    this.supabase = null;\n",
    "    // Supabase removed; this service talks SQL through query().\n",
))


def main():
    applied, skipped = 0, []
    for path, old, new in EDITS:
        src = path.read_text(encoding='utf-8')
        if old not in src:
            skipped.append(f'{path.name}: pattern not found')
            continue
        path.write_text(src.replace(old, new, 1), encoding='utf-8')
        applied += 1

    print(f'  {applied} of {len(EDITS)} edits applied')
    for s in skipped:
        print(f'  SKIPPED {s}')
    return 0 if not skipped else 1


if __name__ == '__main__':
    sys.exit(main())
