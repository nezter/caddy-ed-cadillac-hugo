const errorHandler = require('./utils/error-handler');
const DeduplicationService = require('./utils/deduplication-service');
const FuzzyMatcher = require('./utils/fuzzy-matcher');
const DataNormalizer = require('./utils/data-normalizer');
const { authenticateRequest } = require('./utils/auth-middleware');

/**
 * Lead duplicates API
 * Provides duplicate detection and statistics for admin interface
 *
 * STAFF ONLY.
 *
 * There was no authentication here, and both verbs return customer records:
 *
 *   GET  duplicate statistics across the whole lead table
 *   POST check one name/email/phone against the table and return up to TWENTY
 *        matching leads, with a confidence score
 *
 * That POST is a search interface over the customer database, given to anyone
 * who sends a POST. It is the same oracle lead-management.js leaked through its
 * duplicate branch, except wider: it answers for a query you supply rather than
 * one you submit, it returns twenty rows, and it returns them to anyone at all.
 *
 * There is no public caller to preserve. site/assets/js/components/lead-management.js
 * is the only client and it already sends `Authorization: Bearer <token>` via its
 * callApi helper, so the guard costs the admin nothing.
 */
exports.handler = async function(event, context) {
  const auth = await authenticateRequest(event, {
    requireAuth: true,
    allowedRoles: ['admin', 'manager', 'sales_rep'],
  });
  if (!auth.authenticated) {
    return auth.error;
  }

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