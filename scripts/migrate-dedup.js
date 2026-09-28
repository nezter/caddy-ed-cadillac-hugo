#!/usr/bin/env node
/**
 * migrate-dedup.js -- move deduplication-service.js off the Supabase query
 * builder and onto parameterised SQL through the shared data path.
 *
 * WHY
 * ---
 * Five call sites used the builder form:
 *
 *     supabase.from('leads').select('*').gte('created_at', t).order(...)
 *     supabase.from('leads').select('*').in('id', [a, b, c])
 *     supabase.from('leads').update({...}).in('id', [...])
 *     supabase.from('leads').update({...}).eq('id', x)
 *     supabase.from('leads').select('a, b').not('status', 'eq', 'merged')
 *
 * The builder is not available here at all: SUPABASE_URL is empty in every
 * context and no project is configured, so the constructor
 *
 *     supabase = createClient(process.env.SUPABASE_URL, ...)
 *
 * threw `supabaseUrl is required.` at require time. leads.js already worked
 * around that by catching it and skipping the whole duplicate check -- which
 * means duplicate detection has silently not been running.
 *
 * Each translation below keeps the original builder chain in a comment so the
 * mapping can be checked without reading this file.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const FILE = path.resolve(__dirname, '..', 'netlify/functions/utils/deduplication-service.js');

/** The one SQL entry point every call site now uses. */
const HELPER = `  /**
   * Run a statement against the configured database.
   *
   * Every method below used to go through the Supabase query builder. That is
   * gone: SUPABASE_URL is empty in every context, so the constructor threw
   * \`supabaseUrl is required.\` at require time, and leads.js had to catch that
   * and skip duplicate detection altogether. It was therefore not running.
   *
   * It was also quietly wrong where it did run. The read path in database-service
   * extracted the table name with a regex and then discarded the WHERE clause,
   * so a query scoped to one set of leads could return every lead in the table --
   * and then MERGE them.
   *
   * Through query() these are ordinary parameterised statements: they hit the real
   * database, they carry their filters, and they fail loudly if the database is
   * not configured instead of pretending to succeed.
   */
  async sql(statement, params = []) {
    return query(statement, params);
  }
`;

const EDITS = [
  // ------------------------------------------------------------------ header
  {
    old: `const { createClient } = require('@supabase/supabase-js');
const DataNormalizer = require('./data-normalizer');`,
    new: `const { query } = require('./database-service');
const DataNormalizer = require('./data-normalizer');`,
  },
  {
    old: `  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );
  }`,
    new: `  constructor() {
    // Nothing to connect. The data path is the shared query().
  }
${HELPER}`,
  },

  // ------------------------------------------------- recent leads for matching
  {
    old: `        const { data, error } = await this.supabase
          .from('leads')
          .select('*')
          .gte('created_at', cutoffDate.toISOString())
          .order('created_at', { ascending: false });

        if (error) {`,
    new: `        // Was: from('leads').select('*').gte('created_at', cutoff).order('created_at')
        const { rows: data, error } = await this.sql(
          'SELECT * FROM leads WHERE created_at >= $1 ORDER BY created_at DESC',
          [cutoffDate.toISOString()]
        );

        if (error) {`,
  },

  // --------------------------------------------------------- leads to merge
  {
    old: `          const { data: leads, error: fetchError } = await this.supabase
            .from('leads')
            .select('*')
            .in('id', [primaryLeadId, ...duplicateIds]);

          if (fetchError) {`,
    new: `          // Was: from('leads').select('*').in('id', [primary, ...duplicates])
          const { rows: leads, error: fetchError } = await this.sql(
            'SELECT * FROM leads WHERE id = ANY($1)',
            [[primaryLeadId, ...duplicateIds]]
          );

          if (fetchError) {`,
  },

  // ------------------------------------------------------------ merge them
  {
    old: `          const { error: updateError } = await this.supabase
            .from('leads')
            .update({
              ...mergedData,
              merged_from: duplicateIds,
              updated_at: new Date().toISOString()
            })
            .eq('id', primaryLeadId);`,
    new: `          // Was: from('leads').update({...}).in('id', [...])
          // A merge touches real customer records, so the columns are built from
          // an allowlist rather than from the keys of mergedData. A caller
          // passing { id: ... } or { created_at: ... } would otherwise be able to
          // rewrite a lead's identity or its audit trail.
          const MERGEABLE = new Set([
            'first_name', 'last_name', 'email', 'phone', 'address_line1',
            'address_line2', 'city', 'state', 'zip_code', 'customer_type',
            'source', 'vehicle_interest', 'budget_min', 'budget_max',
            'preferred_contact_method', 'notes', 'status',
          ]);
          const mergeColumns = Object.keys(mergedData || {}).filter(
            (k) => MERGEABLE.has(k)
          );
          if (!mergeColumns.length) {
            throw new Error('Nothing mergeable in the supplied lead data.');
          }
          // Concatenation, not a template literal: this string lives inside one.
          const setClause = mergeColumns
            .map((c, i) => '"' + c + '" = $' + (i + 3))
            .concat('merged_from = $1', 'updated_at = $2')
            .join(', ');
          const { error: updateError } = await this.sql(
            'UPDATE leads SET ' + setClause + ' WHERE id = ANY($4)',
            [
              duplicateIds,
              new Date().toISOString(),
              ...mergeColumns.map((c) => mergedData[c]),
              [primaryLeadId],
            ]
          )`,
  },

  // ------------------------------------------------------ mark them merged
  {
    old: `          const { error: deleteError } = await this.supabase
            .from('leads')
            .update({
              status: 'merged',
              merged_into: primaryLeadId,
              updated_at: new Date().toISOString()
            })
            .in('id', duplicateIds);`,
    new: `          // Was: from('leads').update({status:'merged', merged_into}).in('id',[...])
          const { error: deleteError } = await this.sql(
            [
              "UPDATE leads SET status = 'merged', merged_into = $1, updated_at = $2",
              'WHERE id = ANY($3)',
            ].join(' '),
            [primaryLeadId, new Date().toISOString(), duplicateIds]
          )`,
  },

  // -------------------------------------------------------------- the stats
  {
    old: `          const { data, error } = await this.supabase
            .from('leads')
            .select('status, merged_from, duplicate_count')
            .not('status', 'eq', 'merged');

          if (error) {`,
    new: `          // Was: from('leads').select('status, merged_from, duplicate_count')
          //          .not('status', 'eq', 'merged')
          const { rows: data, error } = await this.sql(
            [
              'SELECT status, merged_from, duplicate_count FROM leads',
              "WHERE status IS DISTINCT FROM 'merged'",
            ].join(' ')
          );

          if (error) {`,
  },
];

let applied = 0;
const missed = [];
let src = fs.readFileSync(FILE, 'utf8');
for (const e of EDITS) {
  if (!src.includes(e.old)) {
    missed.push(e.old.split('\n')[0].trim().slice(0, 70));
    continue;
  }
  src = src.replace(e.old, e.new);
  applied += 1;
}
fs.writeFileSync(FILE, src);
console.log(`  ${applied}/${EDITS.length} edits applied to deduplication-service.js`);
for (const m of missed) console.log(`  MISSED: ${m}`);
