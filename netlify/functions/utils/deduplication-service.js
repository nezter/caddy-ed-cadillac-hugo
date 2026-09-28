const { query } = require('./database-service');
const DataNormalizer = require('./data-normalizer');
const FuzzyMatcher = require('./fuzzy-matcher');

/**
 * Lead deduplication service
 */
class DeduplicationService {
  constructor() {
    // Nothing to connect. The data path is the shared query().
  }
  /**
   * Run a statement against the configured database.
   *
   * Every method below used to go through the Supabase query builder. That is
   * gone: SUPABASE_URL is empty in every context, so the constructor threw
   * `supabaseUrl is required.` at require time, and leads.js had to catch that
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


  /**
   * Check for duplicate leads
   * @param {Object} newLead - New lead data
   * @param {Object} options - Deduplication options
   * @returns {Object} { isDuplicate: boolean, duplicates: Array, confidence: number }
   */
  async checkForDuplicates(newLead, options = {}) {
    const {
      maxResults = 10,
      confidenceThreshold = 0.7,
      timeWindowDays = 365 // Check leads from last year
    } = options;

    try {
      // Normalize the new lead data
      const normalizedLead = DataNormalizer.normalizeLeadData(newLead);

      // Query existing leads from database
      const existingLeads = await this.getExistingLeads(timeWindowDays);

      // Find potential duplicates
      const potentialDuplicates = FuzzyMatcher.findPotentialDuplicates(
        existingLeads,
        normalizedLead,
        { minConfidence: confidenceThreshold }
      );

      // Limit results
      const duplicates = potentialDuplicates.slice(0, maxResults);

      // Determine if it's a duplicate (highest confidence >= threshold)
      const isDuplicate = duplicates.length > 0 && duplicates[0].confidence >= confidenceThreshold;

      return {
        isDuplicate,
        duplicates,
        confidence: duplicates.length > 0 ? duplicates[0].confidence : 0,
        normalizedLead
      };

    } catch (error) {
      console.error('Error checking for duplicates:', error);
      // In case of error, assume not duplicate to avoid blocking lead submission
      return {
        isDuplicate: false,
        duplicates: [],
        confidence: 0,
        normalizedLead: newLead,
        error: error.message
      };
    }
  }

  /**
   * Get existing leads from database
   * @param {number} days - Number of days to look back
   * @returns {Array} Array of existing leads
   */
  async getExistingLeads(days = 365) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

        // Was: from('leads').select('*').gte('created_at', c).order('created_at')
        const { rows: data, error } = await this.sql(
          'SELECT * FROM leads WHERE created_at >= $1 ORDER BY created_at DESC',
          [cutoffDate.toISOString()]
        );

    if (error) {
      console.error('Error fetching existing leads:', error);
      return [];
    }

    // Normalize existing leads for comparison
    return data.map(lead => DataNormalizer.normalizeLeadData(lead));
  }

  /**
   * Merge duplicate leads
   * @param {string} primaryLeadId - ID of the primary lead to keep
   * @param {Array} duplicateIds - IDs of duplicate leads to merge
   * @returns {Object} Merge result
   */
  async mergeDuplicates(primaryLeadId, duplicateIds) {
    try {
      // Get all leads involved
          // Was: from('leads').select('*').in('id', [primary, ...duplicates])
          const { rows: leads, error: fetchError } = await this.sql(
            'SELECT * FROM leads WHERE id = ANY($1)',
            [[primaryLeadId, ...duplicateIds]]
          );

      if (fetchError) {
        throw new Error(`Failed to fetch leads: ${fetchError.message}`);
      }

      if (leads.length === 0) {
        throw new Error('No leads found with provided IDs');
      }

      // Find primary lead
      const primaryLead = leads.find(lead => lead.id === primaryLeadId);
      if (!primaryLead) {
        throw new Error('Primary lead not found');
      }

      // Merge data from duplicates into primary
      const mergedData = this.mergeLeadData(primaryLead, leads.filter(l => l.id !== primaryLeadId));

      // Update primary lead with merged data
          // Was: from('leads').update({...}).eq('id', primary)
          //
          // The columns are built from an allowlist rather than from the keys of
          // mergedData. A merge touches real customer records, and a caller
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
          );

      if (updateError) {
        throw new Error(`Failed to update primary lead: ${updateError.message}`);
      }

      // Mark duplicates as merged
          // Was: from('leads').update({status,merged_into}).in('id',[...])
          const { error: deleteError } = await this.sql(
            [
              "UPDATE leads SET status = 'merged', merged_into = $1, updated_at = $2",
              'WHERE id = ANY($3)',
            ].join(' '),
            [primaryLeadId, new Date().toISOString(), duplicateIds]
          );

      if (deleteError) {
        console.error('Failed to mark duplicates as merged:', deleteError);
        // Don't throw here as primary update succeeded
      }

      return {
        success: true,
        primaryLeadId,
        mergedIds: duplicateIds,
        mergedData
      };

    } catch (error) {
      console.error('Error merging duplicates:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Merge lead data from multiple leads
   * @param {Object} primary - Primary lead
   * @param {Array} duplicates - Duplicate leads
   * @returns {Object} Merged lead data
   */
  mergeLeadData(primary, duplicates) {
    const merged = { ...primary };

    // Merge messages (combine all messages)
    const allMessages = [primary.message, ...duplicates.map(d => d.message)]
      .filter(msg => msg && msg.trim())
      .join('\n\n--- Additional Message ---\n');

    if (allMessages) {
      merged.message = allMessages;
    }

    // Update timestamps to most recent
    const allTimestamps = [primary.created_at, ...duplicates.map(d => d.created_at)];
    merged.last_contact = new Date(Math.max(...allTimestamps.map(t => new Date(t)))).toISOString();

    // Merge UTM data (prefer non-empty values)
    merged.utm = { ...primary.utm };
    for (const dup of duplicates) {
      if (dup.utm) {
        Object.keys(dup.utm).forEach(key => {
          if (!merged.utm[key] && dup.utm[key]) {
            merged.utm[key] = dup.utm[key];
          }
        });
      }
    }

    // Update metadata
    merged.duplicate_count = (primary.duplicate_count || 0) + duplicates.length;

    return merged;
  }

  /**
   * Get duplicate statistics
   * @returns {Object} Statistics about duplicates
   */
  async getDuplicateStats() {
    try {
          // Was: from('leads').select('status, merged_from, duplicate_count')
          //          .not('status', 'eq', 'merged')
          const { rows: data, error } = await this.sql(
            [
              'SELECT status, merged_from, duplicate_count FROM leads',
              "WHERE status IS DISTINCT FROM 'merged'",
            ].join(' ')
          );

      if (error) {
        throw error;
      }

      const stats = {
        totalLeads: data.length,
        mergedLeads: 0,
        potentialDuplicates: 0,
        averageDuplicatesPerLead: 0
      };

      let totalDuplicates = 0;

      data.forEach(lead => {
        if (lead.merged_from && lead.merged_from.length > 0) {
          stats.mergedLeads += lead.merged_from.length;
        }
        if (lead.duplicate_count && lead.duplicate_count > 0) {
          stats.potentialDuplicates++;
          totalDuplicates += lead.duplicate_count;
        }
      });

      stats.averageDuplicatesPerLead = stats.potentialDuplicates > 0
        ? totalDuplicates / stats.potentialDuplicates
        : 0;

      return stats;

    } catch (error) {
      console.error('Error getting duplicate stats:', error);
      return { error: error.message };
    }
  }
}

module.exports = DeduplicationService;