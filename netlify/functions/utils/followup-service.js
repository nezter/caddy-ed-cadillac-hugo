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
        AND fu.scheduled_date <= NOW()
        AND fu.scheduled_date > NOW() - INTERVAL '24 hours' -- Don't process very old ones
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
  static async shouldSendFollowup(followup) {
    try {
      // Check if customer has unsubscribed
      if (followup.email && !followup.email_consent) {
        return false;
      }

      if (followup.sms && !followup.sms_consent) {
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
   */
  static async sendEmailFollowup(followup) {
    try {
      // Get email template
      const template = await this.getEmailTemplate(followup.email_template);
      if (!template) {
        throw new Error(`Email template ${followup.email_template} not found`);
      }

      // Get customer data
      const customer = await this.getCustomerData(followup.customer_id);
      if (!customer) {
        throw new Error(`Customer ${followup.customer_id} not found`);
      }

      // Check if customer has consented to email
      if (!customer.email_consent) {
        console.log('⚠️ Customer has not consented to email communications');
        return false;
      }

      // Render template
      const renderedContent = this.renderTemplate(template.content, customer);
      const renderedSubject = this.renderTemplate(template.subject, customer);

      // Add unsubscribe footer to email content
      const unsubscribeContent = this.addUnsubscribeFooter(renderedContent, customer);

      // Send email (placeholder - integrate with email service)
      console.log('📧 Sending email to:', customer.email);
      console.log('📧 Subject:', renderedSubject);
      console.log('📧 Content length:', unsubscribeContent.length);

      return true;
    } catch (error) {
      console.error('Error sending email followup:', error);
      throw error;
    }
  }

      // Personalize content
      const personalizedContent = this.personalizeContent(template.content, followup);
      const personalizedSubject = this.personalizeContent(template.subject, followup);

      // Add tracking pixel for open tracking
      const contentWithTracking = this.addTrackingPixel(personalizedContent, followup);

      // Add unsubscribe footer
      const contentWithUnsubscribe = this.addUnsubscribeFooter(contentWithTracking, followup);

      // Send email using notification service
      const emailData = {
        type: 'followup_email',
        recipient: followup.email,
        subject: personalizedSubject,
        content: contentWithUnsubscribe,
        metadata: {
          followup_id: followup.id,
          customer_id: followup.customer_id,
          lead_id: followup.lead_id,
          campaign_id: followup.campaign_id,
          template_name: followup.email_template
        }
      };

      const response = await fetch(`${process.env.URL}/.netlify/functions/send-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(emailData)
      });

      if (response.ok) {
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

      // Send SMS (placeholder - would integrate with SMS service)
      console.log(`SMS to ${followup.phone}: ${personalizedContent}`);

      // Log the SMS interaction
      await InteractionService.logAutomatedInteraction({
        customer_id: followup.customer_id,
        lead_id: followup.lead_id,
        type: 'sms',
        subject: `SMS Follow-up`,
        content: personalizedContent,
        template_name: followup.sms_template,
        campaign_id: followup.campaign_id,
        metadata: {
          followup_id: followup.id,
          automated: true
        }
      });

      return true;

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

    const footer = `

---
This email was sent to ${followup.email} because you have expressed interest in Cadillac vehicles.

Don't want to receive these emails?
Unsubscribe from email communications: ${unsubscribeUrl}

Manage all your communication preferences: ${baseUrl}/communication-preferences

Cadillac of South Charlotte
704-555-0123
www.cadillacofsouthcharlotte.com

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
      SET status = 'sent', sent_date = NOW(), updated_at = NOW()
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
      SET status = 'skipped', skip_reason = $2, updated_at = NOW()
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
      SET status = 'error', error_message = $2, updated_at = NOW()
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
      status: 'pending'
    };

    const sql = `
      INSERT INTO followups (
        customer_id, lead_id, campaign_id, campaign_name,
        email, sms, email_template, sms_template,
        scheduled_date, priority, status, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `;

    const params = [
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
      'system'
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
      WHERE created_at >= NOW() - INTERVAL '${days} days'
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
    let sql = 'UPDATE followups SET status = $1, updated_at = NOW() WHERE customer_id = $2 AND status = $3';
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