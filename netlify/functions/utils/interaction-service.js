/**
 * Interaction Service
 * Comprehensive service for managing customer interactions and touchpoints
 */

const DatabaseService = require('./database-service');

class InteractionService {
  /**
   * Log a new customer interaction
   * @param {Object} interactionData - Interaction details
   * @returns {Object} - Created interaction
   */
  static async logInteraction(interactionData) {
    try {
      const {
        customer_id,
        lead_id,
        interaction_type,
        direction = 'outbound',
        subject,
        content,
        summary,
        initiated_by = 'system',
        sales_rep_id,
        sales_rep_name,
        contact_method,
        contact_details,
        outcome,
        next_action,
        next_action_date,
        duration_minutes,
        tags = [],
        metadata = {},
        created_by = 'system'
      } = interactionData;

      // Validate required fields
      if (!customer_id || !interaction_type) {
        throw new Error('Customer ID and interaction type are required');
      }

      // Create interaction record
      const interaction = await DatabaseService.createInteraction({
        customer_id,
        lead_id,
        interaction_type,
        direction,
        subject,
        content,
        summary,
        initiated_by,
        sales_rep_id,
        sales_rep_name,
        contact_method,
        contact_details,
        outcome,
        next_action,
        next_action_date,
        duration_minutes,
        tags,
        metadata,
        created_by
      });

      // Update customer last activity
      await this.updateCustomerLastActivity(customer_id);

      // If this is a lead-related interaction, update lead status
      if (lead_id) {
        await this.updateLeadFromInteraction(lead_id, interaction);
      }

      return interaction;

    } catch (error) {
      console.error('Error logging interaction:', error);
      throw error;
    }
  }

  /**
   * Get customer interaction timeline
   * @param {string} customerId - Customer ID
   * @param {Object} options - Query options
   * @returns {Array} - Customer interactions
   */
  static async getCustomerTimeline(customerId, options = {}) {
    try {
      const {
        limit = 50,
        offset = 0,
        interaction_types = [],
        date_from,
        date_to,
        sales_rep_id,
        include_lead_interactions = true
      } = options;

      let sql = `
        SELECT
          i.*,
          l.first_name as lead_first_name,
          l.last_name as lead_last_name,
          l.email as lead_email,
          sr.first_name as sales_rep_first_name,
          sr.last_name as sales_rep_last_name
        FROM interactions i
        LEFT JOIN leads l ON i.lead_id = l.id
        LEFT JOIN sales_reps sr ON i.sales_rep_id = sr.id
        WHERE i.customer_id = $1
      `;

      const params = [customerId];
      let paramIndex = 2;

      // Add filters
      if (interaction_types.length > 0) {
        sql += ` AND i.interaction_type = ANY($${paramIndex})`;
        params.push(interaction_types);
        paramIndex++;
      }

      if (date_from) {
        sql += ` AND i.created_at >= $${paramIndex}`;
        params.push(date_from);
        paramIndex++;
      }

      if (date_to) {
        sql += ` AND i.created_at <= $${paramIndex}`;
        params.push(date_to);
        paramIndex++;
      }

      if (sales_rep_id) {
        sql += ` AND i.sales_rep_id = $${paramIndex}`;
        params.push(sales_rep_id);
        paramIndex++;
      }

      // Include lead interactions if requested
      if (include_lead_interactions) {
        sql += `
          UNION ALL
          SELECT
            i.*,
            l.first_name as lead_first_name,
            l.last_name as lead_last_name,
            l.email as lead_email,
            sr.first_name as sales_rep_first_name,
            sr.last_name as sales_rep_last_name
          FROM interactions i
          JOIN leads l ON i.lead_id = l.id
          LEFT JOIN sales_reps sr ON i.sales_rep_id = sr.id
          WHERE l.customer_id = $1
        `;
      }

      sql += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit, offset);

      const result = await DatabaseService.query(sql, params);
      return result.rows;

    } catch (error) {
      console.error('Error getting customer timeline:', error);
      return [];
    }
  }

  /**
   * Get interaction statistics for a customer
   * @param {string} customerId - Customer ID
   * @param {number} days - Number of days to analyze
   * @returns {Object} - Interaction statistics
   */
  static async getCustomerInteractionStats(customerId, days = 30) {
    try {
      const sql = `
        SELECT
          COUNT(*) as total_interactions,
          COUNT(CASE WHEN interaction_type = 'phone_call' THEN 1 END) as phone_calls,
          COUNT(CASE WHEN interaction_type = 'email' THEN 1 END) as emails,
          COUNT(CASE WHEN interaction_type = 'sms' THEN 1 END) as sms_messages,
          COUNT(CASE WHEN interaction_type = 'in_person' THEN 1 END) as in_person_visits,
          COUNT(CASE WHEN direction = 'inbound' THEN 1 END) as inbound_interactions,
          COUNT(CASE WHEN direction = 'outbound' THEN 1 END) as outbound_interactions,
          COUNT(DISTINCT DATE(created_at)) as active_days,
          MAX(created_at) as last_interaction_date,
          AVG(duration_minutes) as avg_call_duration,
          COUNT(DISTINCT sales_rep_id) as unique_sales_reps
        FROM interactions
        WHERE customer_id = $1
          AND created_at >= NOW() - INTERVAL '${days} days'
      `;

      const result = await DatabaseService.query(sql, [customerId]);
      return result.rows[0] || {};

    } catch (error) {
      console.error('Error getting customer interaction stats:', error);
      return {};
    }
  }

  /**
   * Log automated system interactions (emails, SMS, etc.)
   * @param {Object} automatedInteraction - Automated interaction data
   * @returns {Object} - Created interaction
   */
  static async logAutomatedInteraction(automatedInteraction) {
    const {
      customer_id,
      lead_id,
      type, // 'email', 'sms', 'notification'
      subject,
      content,
      template_name,
      campaign_id,
      metadata = {}
    } = automatedInteraction;

    return this.logInteraction({
      customer_id,
      lead_id,
      interaction_type: type,
      direction: 'outbound',
      subject,
      content,
      initiated_by: 'system',
      contact_method: type,
      outcome: 'delivered',
      tags: ['automated', template_name].filter(Boolean),
      metadata: {
        ...metadata,
        template_name,
        campaign_id,
        automated: true
      },
      created_by: 'system'
    });
  }

  /**
   * Log sales rep interactions
   * @param {Object} salesInteraction - Sales interaction data
   * @returns {Object} - Created interaction
   */
  static async logSalesInteraction(salesInteraction) {
    const {
      customer_id,
      lead_id,
      sales_rep_id,
      sales_rep_name,
      interaction_type,
      direction = 'outbound',
      subject,
      content,
      contact_method,
      outcome,
      next_action,
      next_action_date,
      duration_minutes,
      tags = []
    } = salesInteraction;

    return this.logInteraction({
      customer_id,
      lead_id,
      interaction_type,
      direction,
      subject,
      content,
      initiated_by: 'sales_rep',
      sales_rep_id,
      sales_rep_name,
      contact_method,
      outcome,
      next_action,
      next_action_date,
      duration_minutes,
      tags: ['sales', ...tags],
      created_by: sales_rep_name || 'sales_rep'
    });
  }

  /**
   * Log customer-initiated interactions
   * @param {Object} customerInteraction - Customer interaction data
   * @returns {Object} - Created interaction
   */
  static async logCustomerInteraction(customerInteraction) {
    const {
      customer_id,
      lead_id,
      interaction_type,
      subject,
      content,
      contact_method,
      contact_details,
      metadata = {}
    } = customerInteraction;

    return this.logInteraction({
      customer_id,
      lead_id,
      interaction_type,
      direction: 'inbound',
      subject,
      content,
      initiated_by: 'customer',
      contact_method,
      contact_details,
      tags: ['customer_initiated'],
      metadata,
      created_by: 'customer'
    });
  }

  /**
   * Update customer last activity timestamp
   * @param {string} customerId - Customer ID
   */
  static async updateCustomerLastActivity(customerId) {
    try {
      await DatabaseService.updateCustomer(customerId, {
        last_activity_date: new Date()
      });
    } catch (error) {
      console.error('Error updating customer last activity:', error);
    }
  }

  /**
   * Update lead status based on interaction
   * @param {string} leadId - Lead ID
   * @param {Object} interaction - Interaction data
   */
  static async updateLeadFromInteraction(leadId, interaction) {
    try {
      const updates = {};

      // Update status based on interaction outcome
      if (interaction.outcome === 'interested' || interaction.outcome === 'appointment_set') {
        updates.status = 'qualified';
      } else if (interaction.outcome === 'not_interested') {
        updates.status = 'disqualified';
      } else if (interaction.outcome === 'sold') {
        updates.status = 'converted';
      }

      // Update last contact
      updates.last_contact = new Date();

      // Update next follow-up if specified
      if (interaction.next_action_date) {
        updates.next_follow_up_date = interaction.next_action_date;
      }

      if (Object.keys(updates).length > 0) {
        await DatabaseService.updateLead(leadId, updates);
      }

    } catch (error) {
      console.error('Error updating lead from interaction:', error);
    }
  }

  /**
   * Get interaction summary for dashboard
   * @param {number} days - Number of days to analyze
   * @returns {Object} - Interaction summary
   */
  static async getInteractionSummary(days = 30) {
    try {
      const sql = `
        SELECT
          COUNT(*) as total_interactions,
          COUNT(DISTINCT customer_id) as unique_customers,
          COUNT(DISTINCT lead_id) as unique_leads,
          COUNT(CASE WHEN interaction_type = 'phone_call' THEN 1 END) as phone_calls,
          COUNT(CASE WHEN interaction_type = 'email' THEN 1 END) as emails,
          COUNT(CASE WHEN interaction_type = 'sms' THEN 1 END) as sms_messages,
          COUNT(CASE WHEN direction = 'inbound' THEN 1 END) as inbound_interactions,
          COUNT(CASE WHEN direction = 'outbound' THEN 1 END) as outbound_interactions,
          AVG(duration_minutes) as avg_call_duration,
          COUNT(DISTINCT sales_rep_id) as active_sales_reps
        FROM interactions
        WHERE created_at >= NOW() - INTERVAL '${days} days'
      `;

      const result = await DatabaseService.query(sql);
      return result.rows[0] || {};

    } catch (error) {
      console.error('Error getting interaction summary:', error);
      return {};
    }
  }

  /**
   * Get interactions by type and time period
   * @param {string} type - Interaction type
   * @param {number} days - Number of days
   * @returns {Array} - Interactions
   */
  static async getInteractionsByType(type, days = 30) {
    try {
      const sql = `
        SELECT
          i.*,
          c.first_name,
          c.last_name,
          c.email as customer_email,
          sr.first_name as sales_rep_first_name,
          sr.last_name as sales_rep_last_name
        FROM interactions i
        JOIN customers c ON i.customer_id = c.id
        LEFT JOIN sales_reps sr ON i.sales_rep_id = sr.id
        WHERE i.interaction_type = $1
          AND i.created_at >= NOW() - INTERVAL '${days} days'
        ORDER BY i.created_at DESC
        LIMIT 100
      `;

      const result = await DatabaseService.query(sql, [type]);
      return result.rows;

    } catch (error) {
      console.error('Error getting interactions by type:', error);
      return [];
    }
  }

  /**
   * Search interactions
   * @param {Object} searchCriteria - Search parameters
   * @returns {Array} - Matching interactions
   */
  static async searchInteractions(searchCriteria) {
    try {
      const {
        query = '',
        interaction_type,
        customer_id,
        sales_rep_id,
        date_from,
        date_to,
        limit = 50,
        offset = 0
      } = searchCriteria;

      let sql = `
        SELECT
          i.*,
          c.first_name,
          c.last_name,
          c.email as customer_email,
          sr.first_name as sales_rep_first_name,
          sr.last_name as sales_rep_last_name
        FROM interactions i
        JOIN customers c ON i.customer_id = c.id
        LEFT JOIN sales_reps sr ON i.sales_rep_id = sr.id
        WHERE 1=1
      `;

      const params = [];
      let paramIndex = 1;

      // Add search query
      if (query) {
        sql += ` AND (
          i.subject ILIKE $${paramIndex} OR
          i.content ILIKE $${paramIndex} OR
          i.summary ILIKE $${paramIndex} OR
          c.first_name ILIKE $${paramIndex} OR
          c.last_name ILIKE $${paramIndex}
        )`;
        params.push(`%${query}%`);
        paramIndex++;
      }

      // Add filters
      if (interaction_type) {
        sql += ` AND i.interaction_type = $${paramIndex}`;
        params.push(interaction_type);
        paramIndex++;
      }

      if (customer_id) {
        sql += ` AND i.customer_id = $${paramIndex}`;
        params.push(customer_id);
        paramIndex++;
      }

      if (sales_rep_id) {
        sql += ` AND i.sales_rep_id = $${paramIndex}`;
        params.push(sales_rep_id);
        paramIndex++;
      }

      if (date_from) {
        sql += ` AND i.created_at >= $${paramIndex}`;
        params.push(date_from);
        paramIndex++;
      }

      if (date_to) {
        sql += ` AND i.created_at <= $${paramIndex}`;
        params.push(date_to);
        paramIndex++;
      }

      sql += ` ORDER BY i.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit, offset);

      const result = await DatabaseService.query(sql, params);
      return result.rows;

    } catch (error) {
      console.error('Error searching interactions:', error);
      return [];
    }
  }
}

module.exports = InteractionService;