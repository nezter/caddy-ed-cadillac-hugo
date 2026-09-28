#!/usr/bin/env python3
"""
migrate-dedup-2.py -- finish the deduplication-service migration.

The first pass replaced the header and the constructor, which shifted every
line below it, so the remaining five call sites no longer matched their original
text. Matching on exact indentation was the wrong approach: this file is indented
differently in different blocks, and a patch that depends on the current
indentation is a patch that breaks the next time anyone reformats.

This matches on the SHAPE of each call instead -- the `.from(` line, the
builder chain beneath it, and the terminating line -- and replaces that whole
contiguous run.
"""

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
FILE = ROOT / 'netlify/functions/utils/deduplication-service.js'

# Each entry: (human name, regex for the whole call including its chain, replacement)
# `(?s)` so the builder chain can span lines. `[ \t]*` for indentation, so it
# does not matter how deep the block sits.
CALLS = [
    (
        'recent leads for matching',
        r"[ \t]*const \{ data, error \} = await this\.supabase\s*\n"
        r"[ \t]*\.from\('leads'\)\s*\n"
        r"[ \t]*\.select\('\*'\)\s*\n"
        r"[ \t]*\.gte\('created_at', cutoffDate\.toISOString\(\)\)\s*\n"
        r"[ \t]*\.order\('created_at', \{ ascending: false \}\);",
        "        // Was: from('leads').select('*').gte('created_at', c).order('created_at')\n"
        "        const { rows: data, error } = await this.sql(\n"
        "          'SELECT * FROM leads WHERE created_at >= $1 ORDER BY created_at DESC',\n"
        "          [cutoffDate.toISOString()]\n"
        "        );",
    ),
    (
        'leads to merge',
        r"[ \t]*const \{ data: leads, error: fetchError \} = await this\.supabase\s*\n"
        r"[ \t]*\.from\('leads'\)\s*\n"
        r"[ \t]*\.select\('\*'\)\s*\n"
        r"[ \t]*\.in\('id', \[primaryLeadId, \.\.\.duplicateIds\]\);",
        "          // Was: from('leads').select('*').in('id', [primary, ...duplicates])\n"
        "          const { rows: leads, error: fetchError } = await this.sql(\n"
        "            'SELECT * FROM leads WHERE id = ANY($1)',\n"
        "            [[primaryLeadId, ...duplicateIds]]\n"
        "          );",
    ),
    (
        'merge into the primary',
        r"[ \t]*const \{ error: updateError \} = await this\.supabase\s*\n"
        r"[ \t]*\.from\('leads'\)\s*\n"
        r"[ \t]*\.update\(\{\s*\n"
        r"[ \t]*\.\.\.mergedData,\s*\n"
        r"[ \t]*merged_from: duplicateIds,\s*\n"
        r"[ \t]*updated_at: new Date\(\)\.toISOString\(\)\s*\n"
        r"[ \t]*\}\)\s*\n"
        r"[ \t]*\.eq\('id', primaryLeadId\);",
        "          // Was: from('leads').update({...}).eq('id', primary)\n"
        "          //\n"
        "          // The columns are built from an allowlist rather than from the keys of\n"
        "          // mergedData. A merge touches real customer records, and a caller\n"
        "          // passing { id: ... } or { created_at: ... } would otherwise be able to\n"
        "          // rewrite a lead's identity or its audit trail.\n"
        "          const MERGEABLE = new Set([\n"
        "            'first_name', 'last_name', 'email', 'phone', 'address_line1',\n"
        "            'address_line2', 'city', 'state', 'zip_code', 'customer_type',\n"
        "            'source', 'vehicle_interest', 'budget_min', 'budget_max',\n"
        "            'preferred_contact_method', 'notes', 'status',\n"
        "          ]);\n"
        "          const mergeColumns = Object.keys(mergedData || {}).filter(\n"
        "            (k) => MERGEABLE.has(k)\n"
        "          );\n"
        "          if (!mergeColumns.length) {\n"
        "            throw new Error('Nothing mergeable in the supplied lead data.');\n"
        "          }\n"
        "          const setClause = mergeColumns\n"
        "            .map((c, i) => '\"' + c + '\" = $' + (i + 3))\n"
        "            .concat('merged_from = $1', 'updated_at = $2')\n"
        "            .join(', ');\n"
        "          const { error: updateError } = await this.sql(\n"
        "            'UPDATE leads SET ' + setClause + ' WHERE id = ANY($4)',\n"
        "            [\n"
        "              duplicateIds,\n"
        "              new Date().toISOString(),\n"
        "              ...mergeColumns.map((c) => mergedData[c]),\n"
        "              [primaryLeadId],\n"
        "            ]\n"
        "          );",
    ),
    (
        'mark the duplicates merged',
        r"[ \t]*const \{ error: deleteError \} = await this\.supabase\s*\n"
        r"[ \t]*\.from\('leads'\)\s*\n"
        r"[ \t]*\.update\(\{\s*\n"
        r"[ \t]*status: 'merged',\s*\n"
        r"[ \t]*merged_into: primaryLeadId,\s*\n"
        r"[ \t]*updated_at: new Date\(\)\.toISOString\(\)\s*\n"
        r"[ \t]*\}\)\s*\n"
        r"[ \t]*\.in\('id', duplicateIds\);",
        "          // Was: from('leads').update({status,merged_into}).in('id',[...])\n"
        "          const { error: deleteError } = await this.sql(\n"
        "            [\n"
        "              \"UPDATE leads SET status = 'merged', merged_into = $1, updated_at = $2\",\n"
        "              'WHERE id = ANY($3)',\n"
        "            ].join(' '),\n"
        "            [primaryLeadId, new Date().toISOString(), duplicateIds]\n"
        "          );",
    ),
    (
        'duplicate stats',
        r"[ \t]*const \{ data, error \} = await this\.supabase\s*\n"
        r"[ \t]*\.from\('leads'\)\s*\n"
        r"[ \t]*\.select\('status, merged_from, duplicate_count'\)\s*\n"
        r"[ \t]*\.not\('status', 'eq', 'merged'\);",
        "          // Was: from('leads').select('status, merged_from, duplicate_count')\n"
        "          //          .not('status', 'eq', 'merged')\n"
        "          const { rows: data, error } = await this.sql(\n"
        "            [\n"
        "              'SELECT status, merged_from, duplicate_count FROM leads',\n"
        "              \"WHERE status IS DISTINCT FROM 'merged'\",\n"
        "            ].join(' ')\n"
        "          );",
    ),
]


def main():
    src = FILE.read_text(encoding='utf-8')
    ok = 0
    for name, pattern, replacement in CALLS:
        new, n = re.subn(pattern, replacement.replace('\\', '\\\\'), src)
        if n:
            src = new
            ok += 1
            print(f'  migrated: {name}')
        else:
            print(f'  MISSED:   {name}')
    FILE.write_text(src, encoding='utf-8')
    print(f'\n  {ok}/{len(CALLS)} call sites migrated')
    return 0 if ok == len(CALLS) else 1


if __name__ == '__main__':
    sys.exit(main())
