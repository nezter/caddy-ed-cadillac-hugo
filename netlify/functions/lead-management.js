const errorHandler = require('./utils/error-handler');
const crmService = require('./utils/crm-service');
const DeduplicationService = require('./utils/deduplication-service');
const inquiry = require('./utils/inquiry');

// nodemailer was required here for a mail path that no longer exists. Notification
// is utils/inquiry.js's job, and it requires nodemailer lazily on purpose: a
// function has to load on a deployment with no SMTP configured, or it 500s before
// it can record the lead.

exports.handler = async function(event, context) {
  // Only allow POST requests for lead submission
  if (event.httpMethod !== 'POST') {
    return errorHandler.forbiddenError('Method not allowed');
  }
  
  try {
    // Parse the lead data
    let leadData;
    try {
      leadData = JSON.parse(event.body);
    } catch (e) {
      return errorHandler.validationError('Invalid JSON in request body');
    }
    
    // Bot gate: honeypot, minimum fill time, and reCAPTCHA when a secret is
    // configured. Shared with every public form endpoint; see utils/bot-gate.js.
    const gate = await require('./utils/bot-gate').check(leadData);
    if (!gate.pass) {
      return errorHandler.validationError('Submission rejected');
    }

    // Basic validation
    if (!leadData.name || !leadData.email || !leadData.phone) {
      return errorHandler.validationError('Missing required fields', {
        name: !leadData.name ? 'Name is required' : null,
        email: !leadData.email ? 'Email is required' : null,
        phone: !leadData.phone ? 'Phone is required' : null
      });
    }

    // RECORD FIRST, THEN NOTIFY -- into THIS site's database.
    //
    // What used to be here, in order:
    //
    //   1. checkForDuplicates(), and on a match return
    //        { leadId: duplicateCheck.duplicates[0].lead.id }
    //   2. a CRM submission, to a CRM with no API key configured
    //   3. fetch('/.netlify/functions/submission-created', ...)
    //   4. return { leadId: Date.now().toString() }
    //
    // None of those write to this site's database. There is no DatabaseService in
    // this file. Step 2 returns `{success: false, reason: 'CRM not configured'}`
    // rather than throwing, so it was logged and shrugged at. Step 3 is a
    // RELATIVE URL inside a serverless function, which has no origin to resolve
    // against -- it throws "Failed to parse URL" and is caught, so the "backup"
    // never happened and looked like it had. Step 4 then returned a made-up id
    // built from the clock.
    //
    // So this endpoint answered "Thank you for your interest. A member of our
    // sales team will contact you shortly." with a plausible leadId, and the lead
    // existed nowhere. site/assets/js/forms.js posts here. This is the same
    // defect as lead-form.js -- fixed there, never fixed here, in the sibling
    // endpoint that does the identical job.
    //
    // It also leaked. Step 1 returned the real internal lead id for an existing
    // customer's match, so submitting any name, email and phone told you whether
    // that person was on file and handed you their record id. A customer-
    // enumeration oracle, on a live dealership, one POST per guess.
    //
    // The duplicate check itself is kept -- it is useful -- but it now only
    // decides the WORDING. It no longer returns an identifier, and it no longer
    // skips the write: a person who is already on file still gets a row, so the
    // enquiry is never the thing that gets lost.
    const deduplicationService = new DeduplicationService();
    let isDuplicate = false;
    try {
      const duplicateCheck = await deduplicationService.checkForDuplicates(leadData, {
        confidenceThreshold: 0.8,
        maxResults: 5
      });
      isDuplicate = Boolean(duplicateCheck.isDuplicate);
    } catch (duplicateError) {
      // A failed duplicate check must not cost the lead. Record it anyway.
      console.error('Duplicate check failed, recording the lead anyway:', duplicateError);
    }

    const outcome = await inquiry.submit('lead', {
      name: leadData.name,
      email: leadData.email,
      phone: leadData.phone,
      message: leadData.message || '',
      vehicleTitle: leadData.vehicleId || leadData.vehicleModel || null,
      formType: leadData.formType || 'general',
      source: leadData.source || 'Website',
      subject: 'New website enquiry',
    });

    if (outcome.fatal) {
      // No database, so no system of record, so a success would be a lie.
      console.error('[lead-management] could not record: ' + outcome.reason);
      return {
        statusCode: 503,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          message: 'We could not record that just now. Please call us and we will take the details.',
        }),
      };
    }

    // The CRM is now genuinely optional: the record exists before this runs, so
    // a missing CRM key cannot lose the lead. It is a second copy, not the
    // system of record.
    if (crmService.apiKey && crmService.apiUrl) {
      try {
        const crmResult = await crmService.submitLead({
          firstName: leadData.name.split(' ')[0],
          lastName: leadData.name.split(' ').slice(1).join(' '),
          email: leadData.email,
          phone: leadData.phone,
          message: leadData.message || '',
          source: leadData.source || 'Website',
        });
        if (!crmResult.success) {
          console.warn(
            `[lead-management] CRM copy failed (${crmResult.reason || crmResult.error}). ` +
              'The lead is recorded in the database and visible in /admin/leads.'
          );
        }
      } catch (crmError) {
        console.warn('[lead-management] CRM copy threw. The lead is recorded.', crmError);
      }
    }

    return errorHandler.createSuccessResponse(
      {
        // A real id, from the row that was actually written.
        leadId: outcome.id,
        // The duplicate signal stays internal. It shapes the sentence we say to
        // the customer; it is not something the submitter gets to read back.
        notified: outcome.notified,
        notifyReason: outcome.notifyReason || null,
      },
      isDuplicate
        ? 'Thank you for your interest. We already have your information on file and will be in touch soon.'
        : 'Thank you for your interest. A member of our sales team will contact you shortly.'
    );
  } catch (error) {
    return errorHandler.serverError('Error processing lead submission', error);
  }
};
