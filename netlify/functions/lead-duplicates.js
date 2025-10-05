const errorHandler = require('./utils/error-handler');
const DeduplicationService = require('./utils/deduplication-service');
const FuzzyMatcher = require('./utils/fuzzy-matcher');
const DataNormalizer = require('./data-normalizer');

/**
 * Lead duplicates API
 * Provides duplicate detection and statistics for admin interface
 */
exports.handler = async function(event, context) {
  // Allow GET and POST requests
  if (!['GET', 'POST'].includes(event.httpMethod)) {
    return errorHandler.forbiddenError('Method not allowed');
  }

  try {
    const deduplicationService = new DeduplicationService();

    if (event.httpMethod === 'GET') {
      // Get duplicate statistics
      const stats = await deduplicationService.getDuplicateStats();
      return errorHandler.createSuccessResponse(stats);

    } else if (event.httpMethod === 'POST') {
      // Check for duplicates of a specific lead
      let requestData;
      try {
        requestData = JSON.parse(event.body);
      } catch (e) {
        return errorHandler.validationError('Invalid JSON in request body');
      }

      if (!requestData.leadData) {
        return errorHandler.validationError('leadData is required');
      }

      const duplicateCheck = await deduplicationService.checkForDuplicates(
        requestData.leadData,
        {
          confidenceThreshold: 0.6, // Lower threshold for manual review
          maxResults: 20
        }
      );

      return errorHandler.createSuccessResponse({
        isDuplicate: duplicateCheck.isDuplicate,
        duplicates: duplicateCheck.duplicates,
        confidence: duplicateCheck.confidence,
        normalizedLead: duplicateCheck.normalizedLead
      });
    }

  } catch (error) {
    console.error('Lead duplicates API error:', error);
    return errorHandler.serverError('Failed to process duplicate check', error);
  }
};