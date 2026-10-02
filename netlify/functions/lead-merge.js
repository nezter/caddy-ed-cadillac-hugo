const errorHandler = require('./utils/error-handler');
const DeduplicationService = require('./utils/deduplication-service');
const { authenticateRequest } = require('./utils/auth-middleware');
const AuditLog = require('./utils/audit-log');
const DatabaseService = require('./utils/database-service');

/**
 * Manual lead merge API
 * Allows administrators to manually merge duplicate leads
 *
 * STAFF ONLY -- and it was not, for as long as this file existed.
 *
 * There was no authentication here at all. The handler accepted a POST from
 * anyone and passed it straight to deduplicationService.mergeDuplicates():
 *
 *     { primaryLeadId: 'lead_a', duplicateIds: ['lead_b', 'lead_c'] }
 *
 * A merge is how two customer identities become one. It is destructive, it is
 * not obviously reversible, and there is no undo in this codebase. So this
 * endpoint was a button on the internet that could fold any lead into any other
 * lead -- corrupting the customer database by POST, from anywhere, with no
 * credential.
 *
 * Note the shape of it: this looked exactly like a working feature. It
 * validated its payload carefully, returned sensible field-level errors, and the
 * admin UI that calls it already sent a Bearer token -- it was the only party
 * that could not perform the merge, because the server never asked.
 *
 * site/assets/js/components/lead-management.js sends
 * `Authorization: Bearer <caddyed_admin_token>` on every call (callApi, line 54),
 * so adding the guard breaks nothing that worked.
 */
exports.handler = async function(event, context) {
  const auth = await authenticateRequest(event, {
    requireAuth: true,
    allowedRoles: ['admin', 'manager', 'sales_rep'],
  });
  if (!auth.authenticated) {
    return auth.error;
  }

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

    // A reason is required, because a merge is irreversible.
    //
    // The endpoint is now authenticated, which stopped a stranger folding any
    // lead into any other. It is still the most destructive thing in this
    // codebase and it left NO record: once mergeDuplicates() has run, the
    // duplicate lead is gone, there is no undo, and six weeks later nobody can
    // say who did it or why. A staff token turns "anyone could do this" into
    // "a staff member did this, and we cannot tell which one".
    //
    // So the merge is not recorded until an audit row exists, and the audit
    // write is refused rather than allowed to fail quietly.
    const reason = String(mergeData.reason || '').trim();
    if (!reason) {
      return errorHandler.validationError('A reason is required and is recorded permanently', {
        reason: 'Why are these leads the same person? This is kept in the audit log.'
      });
    }

    // Written BEFORE the merge, so a crash mid-merge leaves a record that it was
    // attempted rather than no record at all.
    const audit = await AuditLog.record(DatabaseService, {
      action: AuditLog.ACTIONS.LEAD_MERGE,
      entityType: 'leads',
      entityId: mergeData.primaryLeadId,
      actor: auth.user,
      reason,
      detail: {
        duplicateIds: mergeData.duplicateIds,
        duplicateCount: mergeData.duplicateIds.length,
      },
      context: event,
    });

    if (!audit.recorded) {
      // `requireAudit` in effect: an irreversible change that cannot be recorded
      // does not happen. The alternative is a merge with no evidence, which is
      // precisely the defect this row exists to close.
      return errorHandler.serverError(
        'Merge refused: the audit record could not be written, and an unrecorded ' +
          'merge cannot be reviewed or reversed. Nothing was changed.',
        new Error(audit.error)
      );
    }

    // Initialize deduplication service
    const deduplicationService = new DeduplicationService();

    // Perform the merge
    const mergeResult = await deduplicationService.mergeDuplicates(
      mergeData.primaryLeadId,
      mergeData.duplicateIds
    );

    if (!mergeResult.success) {
      // The attempt is already recorded, which is why that ordering matters: the
      // trail now shows a merge was tried and failed, rather than a gap.
      return errorHandler.serverError('Failed to merge leads', mergeResult.error);
    }

    // Return success response
    return errorHandler.createSuccessResponse(
      { ...mergeResult, auditId: audit.auditId || null, reason },
      'Leads merged successfully'
    );

  } catch (error) {
    console.error('Lead merge error:', error);
    return errorHandler.serverError('Failed to merge leads', error);
  }
};