const errorHandler = require('./utils/error-handler');
const DeduplicationService = require('./utils/deduplication-service');

/**
 * Manual lead merge API
 * Allows administrators to manually merge duplicate leads
 */
exports.handler = async function(event, context) {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return errorHandler.forbiddenError('Method not allowed');
  }

  try {
    // Parse the merge data
    let mergeData;
    try {
      mergeData = JSON.parse(event.body);
    } catch (e) {
      return errorHandler.validationError('Invalid JSON in request body');
    }

    // Validate required fields
    if (!mergeData.primaryLeadId || !mergeData.duplicateIds || !Array.isArray(mergeData.duplicateIds)) {
      return errorHandler.validationError('Missing required fields', {
        primaryLeadId: !mergeData.primaryLeadId ? 'Primary lead ID is required' : null,
        duplicateIds: !mergeData.duplicateIds || !Array.isArray(mergeData.duplicateIds) ? 'Duplicate IDs array is required' : null
      });
    }

    // Initialize deduplication service
    const deduplicationService = new DeduplicationService();

    // Perform the merge
    const mergeResult = await deduplicationService.mergeDuplicates(
      mergeData.primaryLeadId,
      mergeData.duplicateIds
    );

    if (!mergeResult.success) {
      return errorHandler.serverError('Failed to merge leads', mergeResult.error);
    }

    // Return success response
    return errorHandler.createSuccessResponse(mergeResult, 'Leads merged successfully');

  } catch (error) {
    console.error('Lead merge error:', error);
    return errorHandler.serverError('Failed to merge leads', error);
  }
};