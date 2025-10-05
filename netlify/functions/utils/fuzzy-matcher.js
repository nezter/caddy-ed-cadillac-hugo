const Fuse = require('fuse.js');
const levenshtein = require('fast-levenshtein');

/**
 * Fuzzy matching utilities for lead deduplication
 */
class FuzzyMatcher {
  /**
   * Calculate similarity score between two strings using Levenshtein distance
   * @param {string} str1 - First string
   * @param {string} str2 - Second string
   * @returns {number} Similarity score (0-1, where 1 is identical)
   */
  static calculateSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    if (str1 === str2) return 1;

    const maxLength = Math.max(str1.length, str2.length);
    if (maxLength === 0) return 1;

    const distance = levenshtein.get(str1, str2);
    return 1 - (distance / maxLength);
  }

  /**
   * Check if two names are similar
   * @param {string} name1 - First name
   * @param {string} name2 - Second name
   * @param {number} threshold - Similarity threshold (0-1)
   * @returns {boolean} True if names are similar
   */
  static areNamesSimilar(name1, name2, threshold = 0.8) {
    if (!name1 || !name2) return false;

    const similarity = this.calculateSimilarity(name1, name2);
    return similarity >= threshold;
  }

  /**
   * Find potential duplicate leads using fuzzy matching
   * @param {Array} existingLeads - Array of existing leads
   * @param {Object} newLead - New lead to check
   * @param {Object} options - Matching options
   * @returns {Array} Array of potential duplicates with confidence scores
   */
  static findPotentialDuplicates(existingLeads, newLead, options = {}) {
    const {
      emailThreshold = 1.0, // Exact match for email
      phoneThreshold = 1.0, // Exact match for phone
      nameThreshold = 0.8, // Fuzzy match for name
      minConfidence = 0.7 // Minimum overall confidence
    } = options;

    const duplicates = [];

    for (const existing of existingLeads) {
      let confidence = 0;
      let matchReasons = [];

      // Email matching (exact)
      if (newLead.normalizedEmail && existing.normalizedEmail) {
        if (newLead.normalizedEmail === existing.normalizedEmail) {
          confidence += 0.4;
          matchReasons.push('email');
        }
      }

      // Phone matching (exact)
      if (newLead.normalizedPhone && existing.normalizedPhone) {
        if (newLead.normalizedPhone === existing.normalizedPhone) {
          confidence += 0.4;
          matchReasons.push('phone');
        }
      }

      // Name matching (fuzzy)
      if (newLead.normalizedName && existing.normalizedName) {
        const nameSimilarity = this.calculateSimilarity(
          newLead.normalizedName,
          existing.normalizedName
        );
        if (nameSimilarity >= nameThreshold) {
          confidence += 0.2 * nameSimilarity;
          matchReasons.push(`name (${Math.round(nameSimilarity * 100)}%)`);
        }
      }

      // Check if confidence meets minimum threshold
      if (confidence >= minConfidence && matchReasons.length > 0) {
        duplicates.push({
          lead: existing,
          confidence: Math.min(confidence, 1.0),
          matchReasons
        });
      }
    }

    // Sort by confidence (highest first)
    return duplicates.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Perform fuzzy search on leads using Fuse.js
   * @param {Array} leads - Array of leads to search
   * @param {string} query - Search query
   * @param {Object} options - Fuse.js options
   * @returns {Array} Search results
   */
  static fuzzySearch(leads, query, options = {}) {
    const defaultOptions = {
      keys: ['normalizedName', 'normalizedEmail', 'normalizedPhone'],
      threshold: 0.4,
      includeScore: true,
      ...options
    };

    const fuse = new Fuse(leads, defaultOptions);
    return fuse.search(query);
  }
}

module.exports = FuzzyMatcher;