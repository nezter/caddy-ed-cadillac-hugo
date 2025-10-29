/**
 * Follow-up Rules Engine
 * Manages automated follow-up rules, campaigns, and conditional logic
 */

const DatabaseService = require('./database-service');
const FollowupService = require('./followup-service');

class FollowupRulesEngine {
  /**
   * Evaluate and trigger follow-ups for an event
   * @param {string} eventType - Type of event (lead_created, interaction_added, etc.)
   * @param {Object} eventData - Event-specific data
   * @returns {Object} - Processing results
   */
  static async processEvent(eventType, eventData) {
    const results = {
      eventType,
      rulesEvaluated: 0,
      rulesTriggered: 0,
      followupsCreated: 0,
      errors: []
    };

    try {
      // Get active rules for this event type
      const rules = await this.getActiveRules(eventType);

      for (const rule of rules) {
        try {
          results.rulesEvaluated++;

          // Evaluate rule conditions
          const shouldTrigger = await this.evaluateRule(rule, eventData);

          if (shouldTrigger) {
            results.rulesTriggered++;

            // Create follow-ups based on rule
            const followupsCreated = await this.executeRule(rule, eventData);
            results.followupsCreated += followupsCreated;
          }

        } catch (error) {
          console.error(`Error processing rule ${rule.id}:`, error);
          results.errors.push({
            ruleId: rule.id,
            error: error.message
          });
        }
      }

      return results;

    } catch (error) {
      console.error('Error processing followup event:', error);
      throw error;
    }
  }

  /**
   * Get active rules for an event type
   */
  static async getActiveRules(eventType) {
    const sql = `
      SELECT * FROM followup_rules
      WHERE trigger_event = $1
        AND is_active = true
        AND (start_date IS NULL OR start_date <= NOW())
        AND (end_date IS NULL OR end_date >= NOW())
      ORDER BY priority DESC, created_at ASC
    `;

    try {
      const result = await DatabaseService.query(sql, [eventType]);
      return result.rows.map(rule => ({
        ...rule,
        conditions: rule.conditions ? JSON.parse(rule.conditions) : {},
        actions: rule.actions ? JSON.parse(rule.actions) : []
      }));
    } catch (error) {
      console.error('Error getting active rules:', error);
      return [];
    }
  }

  /**
   * Evaluate if a rule should trigger based on conditions
   */
  static async evaluateRule(rule, eventData) {
    try {
      const conditions = rule.conditions || {};

      // Check basic conditions
      if (!(await this.checkBasicConditions(conditions, eventData))) {
        return false;
      }

      // Check customer-specific conditions
      if (eventData.customer_id && conditions.customer) {
        if (!(await this.checkCustomerConditions(conditions.customer, eventData.customer_id))) {
          return false;
        }
      }

      // Check lead-specific conditions
      if (eventData.lead_id && conditions.lead) {
        if (!(await this.checkLeadConditions(conditions.lead, eventData.lead_id))) {
          return false;
        }
      }

      // Check interaction-specific conditions
      if (eventData.interaction_id && conditions.interaction) {
        if (!(await this.checkInteractionConditions(conditions.interaction, eventData.interaction_id))) {
          return false;
        }
      }

      // Check time-based conditions
      if (conditions.time) {
        if (!(await this.checkTimeConditions(conditions.time, eventData))) {
          return false;
        }
      }

      return true;

    } catch (error) {
      console.error('Error evaluating rule:', error);
      return false;
    }
  }

  /**
   * Check basic rule conditions
   */
  static async checkBasicConditions(conditions, eventData) {
    // Check if rule is enabled
    if (conditions.enabled === false) return false;

    // Check environment conditions
    if (conditions.environments && !conditions.environments.includes(process.env.NODE_ENV || 'development')) {
      return false;
    }

    // Check custom logic conditions
    if (conditions.custom_logic) {
      return await this.evaluateCustomLogic(conditions.custom_logic, eventData);
    }

    return true;
  }

  /**
   * Check customer-specific conditions
   */
  static async checkCustomerConditions(customerConditions, customerId) {
    const customer = await DatabaseService.getCustomer(customerId);
    if (!customer) return false;

    for (const [field, condition] of Object.entries(customerConditions)) {
      const value = customer[field];

      if (!(await this.evaluateCondition(value, condition))) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check lead-specific conditions
   */
  static async checkLeadConditions(leadConditions, leadId) {
    const lead = await DatabaseService.getLead(leadId);
    if (!lead) return false;

    for (const [field, condition] of Object.entries(leadConditions)) {
      const value = lead[field];

      if (!(await this.evaluateCondition(value, condition))) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check interaction-specific conditions
   */
  static async checkInteractionConditions(interactionConditions, interactionId) {
    // Get interaction details
    const interactions = await DatabaseService.getCustomerInteractions(null, 1, interactionId);
    const interaction = interactions[0];
    if (!interaction) return false;

    for (const [field, condition] of Object.entries(interactionConditions)) {
      const value = interaction[field];

      if (!(await this.evaluateCondition(value, condition))) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check time-based conditions
   */
  static async checkTimeConditions(timeConditions, eventData) {
    const now = new Date();

    // Check day of week
    if (timeConditions.days_of_week) {
      const currentDay = now.getDay(); // 0 = Sunday, 6 = Saturday
      if (!timeConditions.days_of_week.includes(currentDay)) {
        return false;
      }
    }

    // Check time of day
    if (timeConditions.time_range) {
      const currentTime = now.getHours() * 100 + now.getMinutes();
      const startTime = this.timeToMinutes(timeConditions.time_range.start);
      const endTime = this.timeToMinutes(timeConditions.time_range.end);

      if (currentTime < startTime || currentTime > endTime) {
        return false;
      }
    }

    // Check business hours
    if (timeConditions.business_hours_only) {
      const currentHour = now.getHours();
      const currentDay = now.getDay();

      // Assume business hours are 9 AM - 6 PM, Monday-Friday
      if (currentHour < 9 || currentHour > 18 || currentDay === 0 || currentDay === 6) {
        return false;
      }
    }

    return true;
  }

  /**
   * Evaluate a single condition
   */
  static async evaluateCondition(value, condition) {
    if (typeof condition === 'object') {
      const { operator, value: expectedValue } = condition;

      switch (operator) {
        case 'equals':
          return value === expectedValue;
        case 'not_equals':
          return value !== expectedValue;
        case 'contains':
          return String(value).toLowerCase().includes(String(expectedValue).toLowerCase());
        case 'not_contains':
          return !String(value).toLowerCase().includes(String(expectedValue).toLowerCase());
        case 'greater_than':
          return Number(value) > Number(expectedValue);
        case 'less_than':
          return Number(value) < Number(expectedValue);
        case 'in':
          return Array.isArray(expectedValue) && expectedValue.includes(value);
        case 'not_in':
          return !Array.isArray(expectedValue) || !expectedValue.includes(value);
        default:
          return true;
      }
    } else {
      // Simple equality check
      return value === condition;
    }
  }

  /**
   * Evaluate custom logic conditions
   */
  static async evaluateCustomLogic(logic, eventData) {
    // This would implement a simple expression evaluator
    // For now, just return true for basic implementation
    try {
      // Example: "lead.score > 50 AND customer.customer_type == 'prospect'"
      // Would need a proper expression parser for full implementation
      return true;
    } catch (error) {
      console.error('Error evaluating custom logic:', error);
      return false;
    }
  }

  /**
   * Execute a rule's actions
   */
  static async executeRule(rule, eventData) {
    let followupsCreated = 0;

    try {
      const actions = rule.actions || [];

      for (const action of actions) {
        switch (action.type) {
          case 'schedule_followup':
            followupsCreated += await this.executeScheduleFollowup(action, eventData);
            break;

          case 'send_immediate':
            await this.executeSendImmediate(action, eventData);
            break;

          case 'update_customer':
            await this.executeUpdateCustomer(action, eventData);
            break;

          case 'update_lead':
            await this.executeUpdateLead(action, eventData);
            break;

          case 'create_task':
            await this.executeCreateTask(action, eventData);
            break;

          default:
            console.warn(`Unknown action type: ${action.type}`);
        }
      }

      return followupsCreated;

    } catch (error) {
      console.error('Error executing rule actions:', error);
      return followupsCreated;
    }
  }

  /**
   * Execute schedule followup action
   */
  static async executeScheduleFollowup(action, eventData) {
    const followupData = {
      customer_id: eventData.customer_id,
      lead_id: eventData.lead_id,
      campaign_id: action.campaign_id,
      campaign_name: action.campaign_name,
      email: action.email,
      sms: action.sms,
      email_template: action.email_template,
      sms_template: action.sms_template,
      scheduled_date: this.calculateScheduledDate(action.delay),
      priority: action.priority || 1,
      status: 'pending'
    };

    const sql = `
      INSERT INTO followups (
        customer_id, lead_id, campaign_id, campaign_name,
        email, sms, email_template, sms_template,
        scheduled_date, priority, status, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id
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
      'rules_engine'
    ];

    try {
      const result = await DatabaseService.query(sql, params);
      return result.rows.length;
    } catch (error) {
      console.error('Error scheduling followup:', error);
      return 0;
    }
  }

  /**
   * Execute send immediate action
   */
  static async executeSendImmediate(action, eventData) {
    // Send immediate communication (email/SMS)
    const followup = {
      customer_id: eventData.customer_id,
      lead_id: eventData.lead_id,
      email: action.email,
      sms: action.sms,
      email_template: action.email_template,
      sms_template: action.sms_template,
      scheduled_date: new Date().toISOString(),
      priority: 1,
      status: 'pending'
    };

    await FollowupService.sendFollowup(followup);
  }

  /**
   * Execute update customer action
   */
  static async executeUpdateCustomer(action, eventData) {
    if (!eventData.customer_id || !action.updates) return;

    try {
      await DatabaseService.updateCustomer(eventData.customer_id, action.updates);
    } catch (error) {
      console.error('Error updating customer:', error);
    }
  }

  /**
   * Execute update lead action
   */
  static async executeUpdateLead(action, eventData) {
    if (!eventData.lead_id || !action.updates) return;

    try {
      await DatabaseService.updateLead(eventData.lead_id, action.updates);
    } catch (error) {
      console.error('Error updating lead:', error);
    }
  }

  /**
   * Execute create task action
   */
  static async executeCreateTask(action, eventData) {
    try {
      await DatabaseService.createTask({
        title: action.title,
        description: action.description,
        task_type: action.task_type || 'follow_up',
        assigned_to: action.assigned_to,
        customer_id: eventData.customer_id,
        lead_id: eventData.lead_id,
        priority: action.priority || 'medium',
        due_date: action.due_date ? this.calculateScheduledDate(action.due_date_delay) : null
      });
    } catch (error) {
      console.error('Error creating task:', error);
    }
  }

  /**
   * Calculate scheduled date based on delay
   */
  static calculateScheduledDate(delay) {
    const scheduledDate = new Date();

    if (typeof delay === 'number') {
      // Delay in hours
      scheduledDate.setHours(scheduledDate.getHours() + delay);
    } else if (typeof delay === 'string') {
      // Delay expression like "2 days", "1 week", etc.
      const match = delay.match(/(\d+)\s*(hour|day|week)s?/);
      if (match) {
        const value = parseInt(match[1]);
        const unit = match[2];

        switch (unit) {
          case 'hour':
            scheduledDate.setHours(scheduledDate.getHours() + value);
            break;
          case 'day':
            scheduledDate.setDate(scheduledDate.getDate() + value);
            break;
          case 'week':
            scheduledDate.setDate(scheduledDate.getDate() + (value * 7));
            break;
        }
      }
    }

    return scheduledDate.toISOString();
  }

  /**
   * Convert time string to minutes
   */
  static timeToMinutes(timeString) {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Create a new followup rule
   */
  static async createRule(ruleData) {
    const sql = `
      INSERT INTO followup_rules (
        name, description, trigger_event, conditions, actions,
        priority, delay_hours, is_active, start_date, end_date, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;

    const params = [
      ruleData.name,
      ruleData.description,
      ruleData.trigger_event,
      JSON.stringify(ruleData.conditions || {}),
      JSON.stringify(ruleData.actions || []),
      ruleData.priority || 1,
      ruleData.delay_hours || 0,
      ruleData.is_active !== false,
      ruleData.start_date,
      ruleData.end_date,
      ruleData.created_by || 'system'
    ];

    try {
      const result = await DatabaseService.query(sql, params);
      return result.rows[0];
    } catch (error) {
      console.error('Error creating followup rule:', error);
      throw error;
    }
  }

  /**
   * Update an existing rule
   */
  static async updateRule(ruleId, updates) {
    const allowedFields = [
      'name', 'description', 'trigger_event', 'conditions', 'actions',
      'priority', 'delay_hours', 'is_active', 'start_date', 'end_date'
    ];

    const updateFields = [];
    const params = [ruleId];
    let paramIndex = 2;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        if (key === 'conditions' || key === 'actions') {
          updateFields.push(`${key} = $${paramIndex}`);
          params.push(JSON.stringify(value));
        } else {
          updateFields.push(`${key} = $${paramIndex}`);
          params.push(value);
        }
        paramIndex++;
      }
    }

    if (updateFields.length === 0) {
      throw new Error('No valid fields to update');
    }

    updateFields.push('updated_at = NOW()');

    const sql = `
      UPDATE followup_rules
      SET ${updateFields.join(', ')}
      WHERE id = $1
      RETURNING *
    `;

    try {
      const result = await DatabaseService.query(sql, params);
      return result.rows[0];
    } catch (error) {
      console.error('Error updating followup rule:', error);
      throw error;
    }
  }

  /**
   * Get all followup rules
   */
  static async getRules(filters = {}) {
    let sql = 'SELECT * FROM followup_rules WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (filters.trigger_event) {
      sql += ` AND trigger_event = $${paramIndex}`;
      params.push(filters.trigger_event);
      paramIndex++;
    }

    if (filters.is_active !== undefined) {
      sql += ` AND is_active = $${paramIndex}`;
      params.push(filters.is_active);
      paramIndex++;
    }

    sql += ' ORDER BY priority DESC, created_at DESC';

    try {
      const result = await DatabaseService.query(sql, params);
      return result.rows.map(rule => ({
        ...rule,
        conditions: rule.conditions ? JSON.parse(rule.conditions) : {},
        actions: rule.actions ? JSON.parse(rule.actions) : []
      }));
    } catch (error) {
      console.error('Error getting followup rules:', error);
      return [];
    }
  }

  /**
   * Delete a followup rule
   */
  static async deleteRule(ruleId) {
    const sql = 'DELETE FROM followup_rules WHERE id = $1 RETURNING *';

    try {
      const result = await DatabaseService.query(sql, [ruleId]);
      return result.rows[0];
    } catch (error) {
      console.error('Error deleting followup rule:', error);
      throw error;
    }
  }

  /**
   * Get rule performance statistics
   */
  static async getRuleStats(ruleId = null, days = 30) {
    let sql, params;

    if (ruleId) {
      sql = `
        SELECT
          fr.name,
          COUNT(f.id) as followups_created,
          COUNT(CASE WHEN f.status = 'sent' THEN 1 END) as followups_sent,
          AVG(EXTRACT(EPOCH FROM (f.sent_date - f.scheduled_date))/3600) as avg_delay_hours
        FROM followup_rules fr
        LEFT JOIN followups f ON fr.id = f.rule_id
          AND f.created_at >= NOW() - INTERVAL '${days} days'
        WHERE fr.id = $1
        GROUP BY fr.id, fr.name
      `;
      params = [ruleId];
    } else {
      sql = `
        SELECT
          fr.name,
          COUNT(f.id) as followups_created,
          COUNT(CASE WHEN f.status = 'sent' THEN 1 END) as followups_sent,
          AVG(EXTRACT(EPOCH FROM (f.sent_date - f.scheduled_date))/3600) as avg_delay_hours
        FROM followup_rules fr
        LEFT JOIN followups f ON fr.id = f.rule_id
          AND f.created_at >= NOW() - INTERVAL '${days} days'
        GROUP BY fr.id, fr.name
        ORDER BY followups_created DESC
      `;
      params = [];
    }

    try {
      const result = await DatabaseService.query(sql, params);
      return result.rows;
    } catch (error) {
      console.error('Error getting rule stats:', error);
      return [];
    }
  }
}

module.exports = FollowupRulesEngine;