const { createClient } = require('@supabase/supabase-js');
const DataNormalizer = require('./data-normalizer');
const FuzzyMatcher = require('./fuzzy-matcher');

/**
 * Lead deduplication service
 */
class DeduplicationService {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );
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

    const { data, error } = await this.supabase
      .from('leads')
      .select('*')
      .gte('created_at', cutoffDate.toISOString())
      .order('created_at', { ascending: false });

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
      const { data: leads, error: fetchError } = await this.supabase
        .from('leads')
        .select('*')
        .in('id', [primaryLeadId, ...duplicateIds]);

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
      const { error: updateError } = await this.supabase
        .from('leads')
        .update({
          ...mergedData,
          merged_from: duplicateIds,
          updated_at: new Date().toISOString()
        })
        .eq('id', primaryLeadId);

      if (updateError) {
        throw new Error(`Failed to update primary lead: ${updateError.message}`);
      }

      // Mark duplicates as merged
      const { error: deleteError } = await this.supabase
        .from('leads')
        .update({
          status: 'merged',
          merged_into: primaryLeadId,
          updated_at: new Date().toISOString()
        })
        .in('id', duplicateIds);

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
      const { data, error } = await this.supabase
        .from('leads')
        .select('status, merged_from, duplicate_count')
        .not('status', 'eq', 'merged');

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