const errorHandler = require('./utils/error-handler');
const LeadScoringService = require('./utils/lead-scoring-service');
const LeadAssignmentService = require('./utils/lead-assignment-service');
const InteractionService = require('./utils/interaction-service');
const FollowupService = require('./utils/followup-service');
const DatabaseService = require('./utils/database-service');
// The shared parameterised query, for the one statement here that is not worth
// a DatabaseService static. database-service exports `query` alongside the class.
const { query } = require('./utils/database-service');
// nodemailer was required here for sendLeadNotificationEmail, which is now
// deleted. It is deliberately NOT required at module load: a function must load
// on a deployment with no mail configured, or every lead 500s before it can
// record anything. That was the original bug -- see utils/inquiry.js.
const DeduplicationService = require('./utils/deduplication-service');

/**
 * Leads API
 * Handles lead submissions from various sources
 */
exports.handler = async function(event, context) {
  // Only allow POST requests
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

    // Validate required fields
    if (!leadData.name || !leadData.email) {
      return errorHandler.validationError('Missing required fields', {
        name: !leadData.name ? 'Name is required' : null,
        email: !leadData.email ? 'Email is required' : null
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(leadData.email)) {
      return errorHandler.validationError('Invalid email format', {
        email: 'Please provide a valid email address'
      });
    }

    // Check for duplicates.
    //
    // CONTRACT FIX: DeduplicationService's documented behaviour is fail-open
    // ("In case of error, assume not duplicate to avoid blocking lead
    // submission" -- utils/deduplication-service.js), but its CONSTRUCTOR
    // calls supabase's createClient(process.env.SUPABASE_URL, ...) with no
    // guard, and supabase-js throws `supabaseUrl is required.` when the env
    // var is unset. That throw happens *before* checkForDuplicates' own
    // try/catch can help, so an unconfigured Supabase turned every submission
    // into a 500 -- from a caller's point of view, the endpoint did not
    // exist. Guard the whole leg instead: if the dedup service cannot be
    // built or queried, accept the lead without a duplicate check, which is
    // exactly what the service already promises on its own failure path.
    let duplicateCheck = { isDuplicate: false, duplicates: [], confidence: 0 };
    try {
      const deduplicationService = new DeduplicationService();
      duplicateCheck = await deduplicationService.checkForDuplicates(leadData, {
        confidenceThreshold: 0.8,
        maxResults: 5
      });
    } catch (dedupError) {
      console.error(
        'Deduplication unavailable; accepting lead without a duplicate check:',
        dedupError.message
      );
    }

    if (duplicateCheck.isDuplicate) {
      console.log(`Duplicate lead detected. Confidence: ${duplicateCheck.confidence}`);

      // Update the existing lead's last contact time.
      //
      // Was: supabase.from('leads').update({ last_contact }).eq('id', id)
      // Supabase is not configurable on this deployment, and its fallback path
      // discarded the WHERE clause entirely -- so this would have updated
      // EVERY lead row rather than the one duplicate. Parameterised SQL
      // through the shared query() is both correct and portable.
      await query(
        'UPDATE leads SET last_contact = $1 WHERE id = $2',
        [new Date().toISOString(), duplicateCheck.duplicates[0].lead.id]
      );

      return errorHandler.createSuccessResponse({
        leadId: duplicateCheck.duplicates[0].lead.id,
        status: 'duplicate',
        confidence: duplicateCheck.confidence
      }, 'Thank you for your interest. We already have your information on file and will be in touch soon.');
    }

    // Generate lead ID
    const leadId = `lead_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Prepare lead data for storage
    const processedLead = {
      id: leadId,
      firstName: leadData.name.split(' ')[0],
      lastName: leadData.name.split(' ').slice(1).join(' ') || '',
      email: leadData.email,
      phone: leadData.phone || '',
      message: leadData.message || '',
      formType: leadData.formType || 'general',
      leadSource: leadData.leadSource || 'website',
      pageUrl: leadData.pageUrl || '',
      vehicleInterest: leadData.vehicleInterest || '',
      utm: {
        source: leadData.utm_source || '',
        medium: leadData.utm_medium || '',
        campaign: leadData.utm_campaign || '',
        term: leadData.utm_term || '',
        content: leadData.utm_content || ''
      },
      consent: leadData.consent || false,
      timestamp: new Date().toISOString(),
      status: 'new',
      assignedTo: null, // Will be assigned by lead assignment system
      score: LeadScoringService.calculateInitialScore(leadData)
    };

    // Save lead to database using DatabaseService
    const leadRecord = await DatabaseService.createLead({
      first_name: processedLead.firstName,
      last_name: processedLead.lastName,
      email: processedLead.email,
      phone: processedLead.phone,
      message: processedLead.message,
      form_type: processedLead.formType,
      lead_source: processedLead.leadSource,
      vehicle_interest: processedLead.vehicleInterest,
      utm_source: processedLead.utm.source,
      utm_medium: processedLead.utm.medium,
      utm_campaign: processedLead.utm.campaign,
      priority: LeadScoringService.getPriorityLevel(processedLead.score)
    });

    if (!leadRecord) {
      console.error('Error saving lead to database');
      // Continue with email notification even if DB save fails
    } else {
      console.log('Lead saved to database:', leadRecord);
      processedLead.id = leadRecord.id;

      // Log the lead submission as an interaction
      try {
        await InteractionService.logCustomerInteraction({
          customer_id: leadRecord.customer_id || leadRecord.id, // Use customer_id if available, otherwise lead id
          lead_id: leadRecord.id,
          interaction_type: 'form_submission',
          subject: `Lead Form Submission: ${processedLead.formType}`,
          content: processedLead.message || 'Lead submitted via website form',
          contact_method: 'website',
          contact_details: `Form: ${processedLead.formType}, Source: ${processedLead.leadSource}`,
          metadata: {
            form_type: processedLead.formType,
            lead_source: processedLead.leadSource,
            page_url: processedLead.pageUrl,
            utm: processedLead.utm,
            vehicle_interest: processedLead.vehicleInterest
          }
        });

        console.log('Lead submission interaction logged');
      } catch (interactionError) {
        console.error('Error logging lead submission interaction:', interactionError);
        // Continue with processing even if interaction logging fails
      }

      // Assign lead to sales representative
      try {
        const assignmentResult = await LeadAssignmentService.assignLead({
          id: leadRecord.id,
          first_name: processedLead.firstName,
          last_name: processedLead.lastName,
          email: processedLead.email,
          phone: processedLead.phone,
          vehicle_interest: processedLead.vehicleInterest,
          source: processedLead.leadSource,
          city: leadData.city || '',
          state: leadData.state || '',
          address_line1: leadData.address || '',
          budget_min: leadData.budgetMin || null,
          message: processedLead.message
        });

        if (assignmentResult && assignmentResult.assignedRep) {
          // Update lead with assignment information
          await DatabaseService.updateLead(leadRecord.id, {
            assigned_sales_rep_id: assignmentResult.assignedRep.id,
            assignment_reason: assignmentResult.assignmentReason,
            assignment_score: assignmentResult.assignmentScore
          });

          processedLead.assignedTo = assignmentResult.assignedRep.id;
          processedLead.assignmentReason = assignmentResult.assignmentReason;
          processedLead.assignmentScore = assignmentResult.assignmentScore;

          console.log(`Lead ${leadRecord.id} assigned to ${assignmentResult.assignedRep.first_name} ${assignmentResult.assignedRep.last_name} (${assignmentResult.assignmentReason})`);
        }
      } catch (assignmentError) {
        console.error('Error assigning lead:', assignmentError);
        // Continue with processing even if assignment fails
      }

      // Schedule automated follow-ups for the new lead
      try {
        await FollowupService.scheduleFollowups(leadRecord.customer_id, leadRecord.id, 'lead_created');
        console.log(`Follow-ups scheduled for lead ${leadRecord.id}`);
      } catch (followupError) {
        console.error('Error scheduling follow-ups for lead:', followupError);
        // Continue with processing even if follow-up scheduling fails
      }
    }

    // Send notification email to sales team
    try {
      // Who to notify is ONE question with ONE answer.
      //
      // This had 'sales@caddyed.com' inline, which is a fabricated mailbox: the
      // addresses on this site are ed@ and info@, and nobody has ever confirmed
      // that sales@ exists. It was hardcoded in four places, none of which
      // agreed -- leads.js said sales@caddyed.com, lead-form.js defaulted to the
      // same string, contact-form.js defaulted to info@caddyed.com, and
      // utils/inquiry.js resolves from the staff table. Four answers to "where
      // does a lead go", and a form that picks the wrong one loses the lead.
      //
      // Resolved through the shared helper, so a rep who has signed in through
      // Identity is found in the staff table, and the response says which source
      // was used. If there is nobody to notify, say so -- do not invent an
      // address, because inventing one sends a customer's name, email and phone
      // to a mailbox that may belong to somebody else entirely.
      const { resolveRecipient, notify } = require('./utils/inquiry');
      const recipient = await resolveRecipient();
      if (!recipient.email) {
        console.warn(
          '[leads] no notification address configured. The lead IS recorded and ' +
            'visible in /admin/leads; it was simply not emailed.'
        );
      }

      // In-process, not over HTTP.
      //
      // This fetched send-notification.js -- its own sibling, in the same
      // deployment, through the public internet -- with no credential, because
      // that endpoint had no auth to check. It is now staff-only, which is right
      // for a thing a human presses a button on and wrong for a function calling
      // its neighbour. So this calls notify() directly.
      //
      // The consequence is that the answer is real. `notificationResponse.ok`
      // used to be a 200 from a function that logged the mail to stdout and
      // reported success; now `result.notified` is true only if nodemailer
      // accepted the message.
      const result = await notify(
        {
          email: processedLead.email,
          name: `${processedLead.firstName || ''} ${processedLead.lastName || ''}`.trim(),
          phone: processedLead.phone,
          subject: `New Lead: ${processedLead.firstName} ${processedLead.lastName}`,
          text: 'A new lead has been received from the website.',
        },
        recipient
      );

      if (!result.notified) {
        console.warn(
          `[leads] lead ${leadId} recorded but NOT emailed (${result.reason}). ` +
            'It is in the database and in /admin/leads.'
        );
      }
    } catch (emailError) {
      console.error('Failed to send lead notification email:', emailError);
      // Don't fail the request if email fails
    }

    // TODO: Integrate with CRM system
    // TODO: Trigger lead assignment workflow

    return errorHandler.createSuccessResponse({
      leadId: leadId,
      status: 'received',
      message: 'Thank you for your interest. A member of our sales team will contact you shortly.'
    });

  } catch (error) {
    console.error('Lead processing error:', error);
    return errorHandler.serverError('Failed to process lead submission', error);
  }
};

/**
 * Update lead score based on new interactions or data changes
 */
async function updateLeadScore(leadId) {
  try {
    // Get lead data and recent interactions
    const lead = await DatabaseService.getLead(leadId);
    if (!lead) return null;

    // Get recent interactions (last 30 days)
    const interactions = await DatabaseService.getLeadInteractions(leadId, 30);

    // Calculate updated score
    const newScore = await LeadScoringService.updateDynamicScore(leadId, interactions);

    // Update lead score in database
    await DatabaseService.updateLead(leadId, { score: newScore });

    return {
      leadId,
      oldScore: lead.score,
      newScore,
      priority: LeadScoringService.getPriorityLevel(newScore),
      recommendedActions: LeadScoringService.getRecommendedActions(newScore, interactions)
    };

  } catch (error) {
    console.error('Error updating lead score:', error);
    throw error;
  }
}

/**
 * sendLeadNotificationEmail -- DELETED, and it was a loaded gun.
 *
 * This function was never called. It was unreachable from every code path in
 * this file, which is the only reason the following had not already leaked:
 *
 *     to: process.env.LEAD_NOTIFICATION_EMAIL
 *         || process.env.NOTIFICATION_EMAIL
 *         || 'leads@cadillacofsouthcharlotte.com',
 *
 * `cadillacofsouthcharlotte.com` is not a domain this business owns. The moment
 * somebody configured SMTP without also setting LEAD_NOTIFICATION_EMAIL -- which
 * is the obvious thing to do, since SMTP_HOST alone is what you go looking for
 * -- every customer's name, email address, phone number and message would have
 * been delivered to a stranger's mailbox. One missing environment variable, and
 * the customer list leaves the building.
 *
 * The body also linked to a second unowned domain,
 * `ADMIN_URL || 'https://admin.caddyedcadillac.com'`, and interpolated the
 * customer's own message into HTML with no escaping, so a name or message
 * containing markup would render in the notification.
 *
 * Deleted rather than repaired. It duplicates what utils/inquiry.js now does
 * everywhere else -- record first, then notify through a recipient resolved from
 * the staff table, with the outcome reported rather than invented -- and the
 * live notification path in this file calls the send-notification function
 * instead. Keeping a second, unreached mail path in a repository is a liability
 * with no offsetting value: the next person to wire up "the obvious missing
 * piece" gets the data leak back with a straight face.
 */