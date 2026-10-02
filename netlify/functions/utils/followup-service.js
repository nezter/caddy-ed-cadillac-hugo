/**
 * Automated Follow-up Service
 * Manages automated email and SMS follow-ups based on rules and campaigns
 */

const DatabaseService = require('./database-service');
const InteractionService = require('./interaction-service');

class FollowupService {
  /**
   * Process pending follow-ups
   * @returns {Object} - Processing results
   */
  static async processPendingFollowups() {
    const results = {
      processed: 0,
      sent: 0,
      skipped: 0,
      errors: 0,
      startTime: Date.now()
    };

    try {
      // Get pending follow-ups due for processing
      const pendingFollowups = await this.getPendingFollowups();

      for (const followup of pendingFollowups) {
        try {
          results.processed++;

          // Check if followup should still be sent
          if (!(await this.shouldSendFollowup(followup))) {
            results.skipped++;
            await this.markFollowupSkipped(followup.id, 'Conditions not met');
            continue;
          }

          // Send the followup
          const sent = await this.sendFollowup(followup);
          if (sent) {
            results.sent++;
            await this.markFollowupSent(followup.id);
          } else {
            results.errors++;
            await this.markFollowupError(followup.id, 'Send failed');
          }

        } catch (error) {
          console.error(`Error processing followup ${followup.id}:`, error);
          results.errors++;
          await this.markFollowupError(followup.id, error.message);
        }
      }

      results.duration = Date.now() - results.startTime;
      return results;

    } catch (error) {
      console.error('Error processing pending followups:', error);
      throw error;
    }
  }

  /**
   * Get pending follow-ups that are due
   */
  static async getPendingFollowups() {
    const sql = `
      SELECT
        fu.*,
        c.first_name,
        c.last_name,
        c.email,
        c.phone,
        l.id as lead_id,
        l.first_name as lead_first_name,
        l.last_name as lead_last_name,
        l.email as lead_email,
        l.phone as lead_phone,
        l.vehicle_interest,
        l.score as lead_score
      FROM followups fu
      JOIN customers c ON fu.customer_id = c.id
      LEFT JOIN leads l ON fu.lead_id = l.id
      WHERE fu.status = 'pending'
        AND fu.scheduled_date <= CURRENT_TIMESTAMP
        AND fu.scheduled_date > datetime('now', '-24 hours') -- Don't process very old ones
      ORDER BY fu.scheduled_date ASC, fu.priority DESC
      LIMIT 100
    `;

    try {
      const result = await DatabaseService.query(sql);
      return result.rows;
    } catch (error) {
      console.error('Error getting pending followups:', error);
      return [];
    }
  }

  /**
   * Check if a followup should still be sent
   */
  /**
   * Read a customer's communication consent.
   *
   * Normalised through hasConsent() and returned as the strings the `followups`
   * TEXT columns expect, so the value written there means the same thing as the
   * value read from `customers`.
   *
   * A missing customer or an unreadable table is treated as NO CONSENT, not as
   * an error to propagate. Two reasons, and the second is the important one:
   *
   *   1. consent defaults to the safe answer, so a transient database problem
   *      suppresses a message rather than sending it.
   *   2. A thrown error here would abort lead creation entirely, because this
   *      runs inside createFollowupFromRule, which runs inside the lead path. A
   *      customer's enquiry must not be lost because a preference lookup failed.
   *      Losing a lead is worse than missing one follow-up.
   *
   * @param {string} customerId
   * @returns {Promise<{email: string, sms: string}>}
   */
  static async consentFor(customerId) {
    const refuse = { email: 'false', sms: 'false' };
    if (!customerId) return refuse;
    try {
      const result = await DatabaseService.query(
        'SELECT email_consent, sms_consent FROM customers WHERE id = $1 LIMIT 1',
        [customerId]
      );
      const row = result.rows && result.rows[0];
      if (!row) return refuse;
      return {
        email: FollowupService.hasConsent(row.email_consent) ? 'true' : 'false',
        sms: FollowupService.hasConsent(row.sms_consent) ? 'true' : 'false'
      };
    } catch (error) {
      console.error(
        '[followup] consent lookup failed for customer ' + customerId +
          '. Treating as NO consent, so nothing is sent. The enquiry is not lost:',
        error.message
      );
      return refuse;
    }
  }

  /**
   * Is a consent flag actually consent?
   *
   * THE BUG THIS IS FOR
   * -------------------
   * The guard read `!followup.email_consent`. The column is:
   *
   *     email_consent TEXT DEFAULT false      -- database/turso/schema.sql
   *
   * So an unconsented followup carries the STRING 'false'. A non-empty string is
   * truthy in JavaScript, so `!'false'` is `false`, the guard did not fire, and
   * the message went out anyway. A control that is present, plausible and inert.
   *
   * It looked right because it reads correctly. It would have been invisible for
   * as long as SMTP was unconfigured -- and it goes live the moment SMTP is
   * configured, which is the next thing anybody does with this project.
   *
   * WHY THIS AND NOT "CHANGE THE COLUMN TO BOOLEAN"
   * ------------------------------------------------
   * Because rows already exist. Migrating the column fixes new writes and leaves
   * every stored 'false' as text unless it is rewritten too, so the migration is
   * the version that needs a backup and a verification query. This is the
   * version that is correct for old rows, new rows, SQLite and Turso, and both
   * types, with no data change at all.
   *
   * Consent is the one flag where the safe reading of ambiguity is "no". So
   * anything that is not recognisably a grant is a refusal:
   *
   *     'true', true, 1, '1', 'yes', 'y', 'on'   -> consent
   *     'false', false, 0, '0', 'no', 'n', 'off' -> refusal  (and NULL, '', 'undefined')
   *
   * @param {*} value as read from the database, or from JSON
   * @returns {boolean}
   */
  static hasConsent(value) {
    if (value === true) return true;
    if (value === false || value === null || value === undefined) return false;
    // Anything numeric: only a non-zero number is consent. SQLite has no
    // boolean type, so a BOOLEAN column arrives here as 0 or 1.
    if (typeof value === 'number') return value === 1;
    if (typeof value !== 'string') return false;
    return ['true', '1', 'yes', 'y', 'on'].includes(value.trim().toLowerCase());
  }

  static async shouldSendFollowup(followup) {
    try {
      // Check if customer has unsubscribed.
      //
      // hasConsent(), not `!`. The reasoning is above and it is the whole reason
      // this guard never worked.
      if (followup.email && !FollowupService.hasConsent(followup.email_consent)) {
        console.log(
          `[followup] suppressing email for ${followup.id}: ` +
            `email_consent is ${JSON.stringify(followup.email_consent)}, which is not consent`
        );
        return false;
      }

      if (followup.sms && !FollowupService.hasConsent(followup.sms_consent)) {
        console.log(
          `[followup] suppressing SMS for ${followup.id}: ` +
            `sms_consent is ${JSON.stringify(followup.sms_consent)}, which is not consent`
        );
        return false;
      }

      // Check if lead is still active
      if (followup.lead_id) {
        const leadSql = 'SELECT status FROM leads WHERE id = $1';
        const leadResult = await DatabaseService.query(leadSql, [followup.lead_id]);
        const leadStatus = leadResult.rows[0]?.status;

        if (leadStatus === 'converted' || leadStatus === 'lost') {
          return false;
        }
      }

      // Check for recent interactions that might make this followup redundant
      const recentInteractions = await InteractionService.getCustomerTimeline(
        followup.customer_id,
        {
          limit: 5,
          date_from: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() // Last 24 hours
        }
      );

      // If there have been recent manual interactions, skip automated followup
      const hasRecentManualInteraction = recentInteractions.some(interaction =>
        interaction.initiated_by === 'sales_rep' ||
        interaction.interaction_type === 'phone_call' ||
        interaction.interaction_type === 'in_person'
      );

      if (hasRecentManualInteraction) {
        return false;
      }

      return true;

    } catch (error) {
      console.error('Error checking followup conditions:', error);
      return false; // Err on the side of caution
    }
  }

  /**
   * Send a followup communication
   */
  static async sendFollowup(followup) {
    try {
      let sent = false;

      // Send email if specified
      if (followup.email && followup.email_template) {
        sent = await this.sendEmailFollowup(followup) || sent;
      }

      // Send SMS if specified
      if (followup.sms && followup.sms_template) {
        sent = await this.sendSMSFollowup(followup) || sent;
      }

      return sent;

    } catch (error) {
      console.error('Error sending followup:', error);
      return false;
    }
  }

  /**
   * Send an email followup
   *
   * This replaces a placeholder implementation that only console.logged and
   * called `getCustomerData()` / `renderTemplate()` -- neither of which exists
   * anywhere in this file, so it could never have run. The real body below was
   * present in the file but had lost its method header, leaving it spliced
   * outside the class body and making the whole module unparseable.
   */
  static async sendEmailFollowup(followup) {
    try {
      // Get email template
      const template = await this.getEmailTemplate(followup.email_template);
      if (!template) {
        throw new Error(`Email template ${followup.email_template} not found`);
      }

      // Personalize content
      const personalizedContent = this.personalizeContent(template.content, followup);
      const personalizedSubject = this.personalizeContent(template.subject, followup);

      // Add tracking pixel for open tracking
      const contentWithTracking = this.addTrackingPixel(personalizedContent, followup);

      // Add unsubscribe footer
      const contentWithUnsubscribe = this.addUnsubscribeFooter(contentWithTracking, followup);

      // Send email using notification service
      //
      // The emailData object that stood here -- the payload for a sibling HTTP
      // call -- is gone along with the call. Its metadata is preserved below.

      // Send in-process, not over HTTP.
      //
      // This used to fetch its own sibling function through the public internet
      // to deliver an email -- one outbound request, one TLS handshake, one
      // chance for a transient network blip to lose a follow-up -- and it did so
      // with no credential, because send-notification.js had no auth to check.
      // That function is now staff-only, which is the correct thing for it to be,
      // and the correct answer for an internal caller is to not be an HTTP caller
      // at all.
      //
      // notify() reports whether it actually sent, so `response.ok` becomes a real
      // answer instead of a 200 that meant "a string was written to a log".
      if (!followup.email) {
        // Deliberately NOT falling back to the staff address. A follow-up belongs
        // to the customer it was written for; sending a customer's name and their
        // car history to Ed instead would be a quiet data leak dressed up as
        // resilience. No address, no email, and say so.
        console.warn(
          `[followup] followup ${followup.id} has no recipient address and was not sent.`
        );
        return { sent: false, reason: 'no-recipient' };
      }

      const { notify } = require('./inquiry');
      const result = await notify(
        {
          email: followup.email,
          subject: personalizedSubject,
          // The template body carries the unsubscribe footer and the tracking
          // pixel, added above. It is markup, so it goes as html -- passing only
          // `personalizedContent` here would quietly strip the unsubscribe link
          // off marketing email.
          html: contentWithUnsubscribe,
          text: personalizedContent,
        },
        { email: followup.email, name: null, source: 'followup' }
      );

      if (result.notified) {
        // Log the email interaction
        await InteractionService.logAutomatedInteraction({
          customer_id: followup.customer_id,
          lead_id: followup.lead_id,
          type: 'email',
          subject: personalizedSubject,
          content: personalizedContent,
          template_name: followup.email_template,
          campaign_id: followup.campaign_id,
          metadata: {
            followup_id: followup.id,
            automated: true
          }
        });

        return true;
      }

      return false;

    } catch (error) {
      console.error('Error sending email followup:', error);
      return false;
    }
  }

  /**
   * Send SMS followup
   */
  static async sendSMSFollowup(followup) {
    try {
      // Get SMS template
      const template = await this.getSMSTemplate(followup.sms_template);
      if (!template) {
        throw new Error(`SMS template ${followup.sms_template} not found`);
      }

      // Personalize content
      const personalizedContent = this.personalizeContent(template.content, followup);

      // Send SMS.
      //
      // There is no SMS provider configured on this deployment -- no Twilio, no
      // Vonage, nothing in netlify.toml and nothing in the environment. The old
      // line here was:
      //
      //     console.log(`SMS to ${followup.phone}: ${personalizedContent}`);
      //     ...log an interaction of type 'sms'...
      //     return true;
      //
      // So it wrote the message to a log, recorded an interaction that reads as a
      // delivered text message in the customer's timeline, and reported success.
      // Nobody was ever texted. Worse, the message body -- which for a follow-up
      // template can contain the customer's name and what they asked about -- was
      // printed into the function log.
      //
      // That is the same defect as the enquiry forms one layer over: a success
      // that removes the evidence anything is wrong. So it refuses honestly.
      console.warn(
        `[followup] SMS followup ${followup.id} NOT sent: no SMS provider is ` +
          'configured. It was not texted and is not recorded as delivered.'
      );

      // Recorded as an ATTEMPT, flagged undelivered, rather than as a
      // conversation. The dashboard can show "queued, nothing sent yet" and the
      // customer timeline does not claim a text exists that never did.
      await InteractionService.logAutomatedInteraction({
        customer_id: followup.customer_id,
        lead_id: followup.lead_id,
        type: 'sms',
        subject: `SMS Follow-up (not sent)`,
        content: personalizedContent,
        template_name: followup.sms_template,
        campaign_id: followup.campaign_id,
        metadata: {
          followup_id: followup.id,
          automated: true,
          delivered: false,
          not_sent_reason: 'no-sms-provider-configured',
        }
      });

      return false;

    } catch (error) {
      console.error('Error sending SMS followup:', error);
      return false;
    }
  }

  /**
   * Personalize template content with customer/lead data
   */
  static personalizeContent(content, followup) {
    if (!content) return '';

    return content
      .replace(/\{\{first_name\}\}/g, followup.first_name || '')
      .replace(/\{\{last_name\}\}/g, followup.last_name || '')
      .replace(/\{\{full_name\}\}/g, `${followup.first_name || ''} ${followup.last_name || ''}`.trim())
      .replace(/\{\{email\}\}/g, followup.email || '')
      .replace(/\{\{phone\}\}/g, followup.phone || '')
      .replace(/\{\{vehicle_interest\}\}/g, followup.vehicle_interest || '')
      .replace(/\{\{lead_score\}\}/g, followup.lead_score || '')
      .replace(/\{\{campaign_name\}\}/g, followup.campaign_name || '')
      .replace(/\{\{company_name\}\}/g, 'Caddy Ed Cadillac')
      .replace(/\{\{current_date\}\}/g, new Date().toLocaleDateString());
  }

  /**
   * Add tracking pixel to email content for open tracking
   */
  static addTrackingPixel(content, followup) {
    // Create tracking ID (followup_id:customer_id encoded in base64)
    const trackingId = Buffer.from(`${followup.id}:${followup.customer_id}`).toString('base64');

    const baseUrl = process.env.URL || 'https://caddyed.com';
    const trackingPixelUrl = `${baseUrl}/api/followup-analytics/track/${trackingId}`;

    // Add invisible tracking pixel at the end of the email
    const trackingPixel = `<img src="${trackingPixelUrl}" width="1" height="1" style="display:none;" alt="" />`;

    return content + trackingPixel;
  }

  /**
   * Add unsubscribe footer to email content
   */
  static addUnsubscribeFooter(content, followup) {
    // Create unsubscribe token (customer_id:email encoded in base64)
    const token = Buffer.from(`${followup.customer_id}:${followup.email}`).toString('base64');

    const baseUrl = process.env.URL || 'https://caddyed.com';
    const unsubscribeUrl = `${baseUrl}/api/communication-preferences/unsubscribe/${token}?type=email`;

    // This footer goes into every follow-up email a customer receives, so both
    // of its contact details were load-bearing.
    //
    //   704-555-0123  -- 555 is the range reserved for fiction. A customer who
    //     dialled it reached nobody, and nothing in the email looked wrong.
    //   www.cadillacofsouthcharlotte.com -- a domain this business does NOT own.
    //     It was the address in the deleted sendLeadNotificationEmail fallback,
    //     and it survived here. Every marketing email pointed customers at
    //     somebody else's website.
    //
    // Both now match site/config.toml, which is the record for the business
    // details. calendar-invite.js carries the same two values for the same
    // reason. If the dealership's number or domain changes, change it there
    // first -- and ci/check-no-placeholder-contact.js is what catches it if
    // anybody forgets.
    const footer = `

---
This email was sent to ${followup.email} because you have expressed interest in Cadillac vehicles.

Don't want to receive these emails?
Unsubscribe from email communications: ${unsubscribeUrl}

Manage all your communication preferences: ${baseUrl}/communication-preferences

Cadillac of South Charlotte
803-431-6180
www.caddyed.com

Confidentiality Notice: This email contains confidential information intended only for the use of the individual or entity named above.
`;

    return content + footer;
  }

  /**
   * Mark followup as sent
   */
  static async markFollowupSent(followupId) {
    const sql = `
      UPDATE followups
      SET status = 'sent', sent_date = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `;

    try {
      await DatabaseService.query(sql, [followupId]);
    } catch (error) {
      console.error('Error marking followup as sent:', error);
    }
  }

  /**
   * Mark followup as skipped
   */
  static async markFollowupSkipped(followupId, reason) {
    const sql = `
      UPDATE followups
      SET status = 'skipped', skip_reason = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `;

    try {
      await DatabaseService.query(sql, [followupId, reason]);
    } catch (error) {
      console.error('Error marking followup as skipped:', error);
    }
  }

  /**
   * Mark followup as error
   */
  static async markFollowupError(followupId, errorMessage) {
    const sql = `
      UPDATE followups
      SET status = 'error', error_message = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `;

    try {
      await DatabaseService.query(sql, [followupId, errorMessage]);
    } catch (error) {
      console.error('Error marking followup as error:', error);
    }
  }

  /**
   * Schedule follow-ups based on rules
   */
  static async scheduleFollowups(customerId, leadId = null, trigger = 'lead_created') {
    try {
      // Get applicable rules for this trigger
      const rules = await this.getFollowupRules(trigger);

      for (const rule of rules) {
        if (await this.shouldApplyRule(rule, customerId, leadId)) {
          await this.createFollowupFromRule(rule, customerId, leadId);
        }
      }

    } catch (error) {
      console.error('Error scheduling followups:', error);
    }
  }

  /**
   * Get followup rules for a trigger
   */
  static async getFollowupRules(trigger) {
    const sql = `
      SELECT * FROM followup_rules
      WHERE trigger_event = $1 AND is_active = true
      ORDER BY priority DESC, created_at ASC
    `;

    try {
      const result = await DatabaseService.query(sql, [trigger]);
      return result.rows;
    } catch (error) {
      console.error('Error getting followup rules:', error);
      return [];
    }
  }

  /**
   * Check if a rule should be applied
   */
  static async shouldApplyRule(rule, customerId, leadId) {
    try {
      // Check customer conditions
      if (rule.customer_conditions) {
        const conditions = typeof rule.customer_conditions === 'string' ?
          JSON.parse(rule.customer_conditions) : rule.customer_conditions;

        if (!(await this.checkCustomerConditions(customerId, conditions))) {
          return false;
        }
      }

      // Check lead conditions
      if (leadId && rule.lead_conditions) {
        const conditions = typeof rule.lead_conditions === 'string' ?
          JSON.parse(rule.lead_conditions) : rule.lead_conditions;

        if (!(await this.checkLeadConditions(leadId, conditions))) {
          return false;
        }
      }

      return true;

    } catch (error) {
      console.error('Error checking rule conditions:', error);
      return false;
    }
  }

  /**
   * Check customer conditions
   */
  static async checkCustomerConditions(customerId, conditions) {
    if (!conditions || Object.keys(conditions).length === 0) return true;

    const customer = await DatabaseService.getCustomer(customerId);
    if (!customer) return false;

    for (const [field, expectedValue] of Object.entries(conditions)) {
      const actualValue = customer[field];

      if (field === 'customer_type' && actualValue !== expectedValue) return false;
      if (field === 'source' && actualValue !== expectedValue) return false;
      // Add more condition checks as needed
    }

    return true;
  }

  /**
   * Check lead conditions
   */
  static async checkLeadConditions(leadId, conditions) {
    if (!conditions || Object.keys(conditions).length === 0) return true;

    const lead = await DatabaseService.getLead(leadId);
    if (!lead) return false;

    for (const [field, expectedValue] of Object.entries(conditions)) {
      const actualValue = lead[field];

      if (field === 'score' && actualValue < expectedValue) return false;
      if (field === 'priority' && actualValue !== expectedValue) return false;
      if (field === 'lead_source' && actualValue !== expectedValue) return false;
      // Add more condition checks as needed
    }

    return true;
  }

  /**
   * Create followup from rule
   */
  static async createFollowupFromRule(rule, customerId, leadId) {
    const scheduledDate = new Date();
    scheduledDate.setHours(scheduledDate.getHours() + rule.delay_hours);

    // Consent is copied ONTO the followup row here, which it never was.
    //
    // This INSERT listed thirteen columns and neither `email_consent` nor
    // `sms_consent` was among them. So every follow-up created from a rule took
    // the column default:
    //
    //     email_consent TEXT DEFAULT false        -- the STRING 'false'
    //
    // Which is inert twice over. `!followup.email_consent` is `!'false'`, and a
    // non-empty string is truthy, so shouldSendFollowup() saw consent where
    // there was none. Fixing only the comparison would then have flipped the
    // failure the other way: every follow-up suppressed, because no row would
    // ever carry a grant.
    //
    // So the flag is read from the customer at creation and written explicitly.
    // That is task 17.3 in the taskmaster database -- "integrate preference
    // checking into lead creation and appointment workflows" -- which had been
    // pending, and which this makes real rather than theoretical.
    //
    // Consent is snapshotted at creation on purpose: if someone opts out an hour
    // after a follow-up is queued, the queued row must not still say yes.
    const consent = await FollowupService.consentFor(customerId);

    const followupData = {
      customer_id: customerId,
      lead_id: leadId,
      campaign_id: rule.campaign_id,
      campaign_name: rule.campaign_name,
      email: rule.email,
      sms: rule.sms,
      email_template: rule.email_template,
      sms_template: rule.sms_template,
      scheduled_date: scheduledDate.toISOString(),
      priority: rule.priority,
      status: 'pending',
      email_consent: consent.email,
      sms_consent: consent.sms
    };

    const sql = `
      INSERT INTO followups (
        id, customer_id, lead_id, campaign_id, campaign_name,
        email, sms, email_template, sms_template,
        scheduled_date, priority, status, created_by,
        email_consent, sms_consent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `;

    const params = [
      DatabaseService.newId(),
      followupData.customer_id,
      followupData.lead_id,
      followupData.campaign_id,
      followupData.campaign_name,
      followupData.email,
      followupData.sms,
      followupData.email_template,
      followupData.sms_template,
      followupData.scheduled_date,
      followupData.priority,
      followupData.status,
      'system',
      // $14, $15. Written as the grant-or-refusal strings the schema's TEXT
      // column expects, rather than as booleans, so the stored value and the
      // comparison in hasConsent() agree.
      FollowupService.hasConsent(followupData.email_consent) ? 'true' : 'false',
      FollowupService.hasConsent(followupData.sms_consent) ? 'true' : 'false'
    ];

    try {
      const result = await DatabaseService.query(sql, params);
      return result.rows[0];
    } catch (error) {
      console.error('Error creating followup from rule:', error);
      throw error;
    }
  }

  /**
   * Get email template
   */
  static async getEmailTemplate(templateName) {
    const sql = 'SELECT * FROM email_templates WHERE name = $1 AND is_active = true';

    try {
      const result = await DatabaseService.query(sql, [templateName]);
      return result.rows[0];
    } catch (error) {
      console.error('Error getting email template:', error);
      return null;
    }
  }

  /**
   * Get SMS template
   */
  static async getSMSTemplate(templateName) {
    const sql = 'SELECT * FROM sms_templates WHERE name = $1 AND is_active = true';

    try {
      const result = await DatabaseService.query(sql, [templateName]);
      return result.rows[0];
    } catch (error) {
      console.error('Error getting SMS template:', error);
      return null;
    }
  }

  /**
   * Get followup statistics
   */
  static async getFollowupStats(days = 30) {
    const sql = `
      SELECT
        COUNT(*) as total_followups,
        COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent_followups,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_followups,
        COUNT(CASE WHEN status = 'skipped' THEN 1 END) as skipped_followups,
        COUNT(CASE WHEN status = 'error' THEN 1 END) as error_followups,
        COUNT(CASE WHEN email = true THEN 1 END) as email_followups,
        COUNT(CASE WHEN sms = true THEN 1 END) as sms_followups,
        AVG(EXTRACT(EPOCH FROM (sent_date - scheduled_date))/3600) as avg_delay_hours
      FROM followups
      WHERE created_at >= datetime('now', '-${days} days')
    `;

    try {
      const result = await DatabaseService.query(sql);
      return result.rows[0] || {};
    } catch (error) {
      console.error('Error getting followup stats:', error);
      return {};
    }
  }

  /**
   * Cancel pending followups for a customer/lead
   */
  static async cancelPendingFollowups(customerId, leadId = null) {
    let sql = 'UPDATE followups SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE customer_id = $2 AND status = $3';
    let params = ['cancelled', customerId, 'pending'];

    if (leadId) {
      sql += ' AND lead_id = $4';
      params.push(leadId);
    }

    try {
      const result = await DatabaseService.query(sql, params);
      return result.rowCount;
    } catch (error) {
      console.error('Error cancelling pending followups:', error);
      return 0;
    }
  }
}

module.exports = FollowupService;