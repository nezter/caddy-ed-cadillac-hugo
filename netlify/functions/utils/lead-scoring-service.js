/**
 * Lead Scoring Service
 * Implements comprehensive lead scoring algorithm with multiple factors
 */

const DatabaseService = require('./database-service');

class LeadScoringService {
  /**
   * Calculate initial lead score based on lead data
   * @param {Object} leadData - Lead information
   * @returns {number} - Calculated score (0-100)
   */
  static calculateInitialScore(leadData) {
    let score = 0;

    // Base score
    score += 10;

    // Source quality scoring (0-25 points)
    score += this.calculateSourceScore(leadData.source);

    // Contact information completeness (0-20 points)
    score += this.calculateContactScore(leadData);

    // Engagement indicators (0-20 points)
    score += this.calculateEngagementScore(leadData);

    // Vehicle interest specificity (0-15 points)
    score += this.calculateVehicleInterestScore(leadData);

    // Budget and timeline information (0-10 points)
    score += this.calculateBudgetScore(leadData);

    return Math.min(Math.max(score, 0), 100);
  }

  /**
   * Calculate source quality score
   * @param {string} source - Lead source
   * @returns {number} - Source score
   */
  static calculateSourceScore(source) {
    const sourceScores = {
      'phone': 25,           // Direct phone call - highest quality
      'walk_in': 22,         // In-person visit
      'trade_in': 20,        // Trade-in inquiry
      'referral': 18,        // Personal referral
      'website': 15,         // Website form submission
      'service': 12,         // Service department
      'social_media': 8,     // Social media
      'email': 6,            // Email inquiry
      'advertisement': 4,    // Paid advertisement
      'other': 2             // Other sources
    };

    return sourceScores[source] || 2;
  }

  /**
   * Calculate contact information completeness score
   * @param {Object} leadData - Lead data
   * @returns {number} - Contact score
   */
  static calculateContactScore(leadData) {
    let score = 0;

    // Email provided (required)
    if (leadData.email) score += 8;

    // Phone provided
    if (leadData.phone) score += 7;

    // Address information
    if (leadData.address_line1 || leadData.city) score += 3;

    // Preferred contact method specified
    if (leadData.preferred_contact_method) score += 2;

    return score;
  }

  /**
   * Calculate engagement indicators score
   * @param {Object} leadData - Lead data
   * @returns {number} - Engagement score
   */
  static calculateEngagementScore(leadData) {
    let score = 0;

    // Message length indicates engagement
    if (leadData.message) {
      const messageLength = leadData.message.length;
      if (messageLength > 200) score += 8;
      else if (messageLength > 100) score += 6;
      else if (messageLength > 50) score += 4;
      else if (messageLength > 10) score += 2;
    }

    // UTM parameters (paid traffic)
    if (leadData.utm_source || leadData.utm_campaign) score += 4;

    // Consent given (shows trust)
    if (leadData.consent) score += 3;

    // Test drive requested
    if (leadData.test_drive_requested) score += 5;

    return score;
  }

  /**
   * Calculate vehicle interest specificity score
   * @param {Object} leadData - Lead data
   * @returns {number} - Vehicle interest score
   */
  static calculateVehicleInterestScore(leadData) {
    let score = 0;

    // Specific vehicle interest
    if (leadData.vehicle_interest) {
      score += 8;

      // Bonus for specific Cadillac models
      const cadillacModels = ['CT4', 'CT5', 'CT6', 'XT4', 'XT5', 'XT6', 'Escalade', 'Lyriq'];
      const interest = leadData.vehicle_interest.toLowerCase();

      if (cadillacModels.some(model => interest.includes(model.toLowerCase()))) {
        score += 4;
      }

      // Bonus for specific trim levels
      if (interest.includes('luxury') || interest.includes('platinum') ||
          interest.includes('premium') || interest.includes('sport')) {
        score += 3;
      }
    }

    return score;
  }

  /**
   * Calculate budget and timeline score
   * @param {Object} leadData - Lead data
   * @returns {number} - Budget score
   */
  static calculateBudgetScore(leadData) {
    let score = 0;

    // Budget information provided
    if (leadData.budget_min || leadData.budget_max) {
      score += 6;

      // Specific budget range
      if (leadData.budget_min && leadData.budget_max) {
        score += 4;
      }
    }

    // Timeline specified
    if (leadData.timeline) {
      const timelineScores = {
        'immediate': 8,
        'within_1_week': 7,
        'within_2_weeks': 6,
        'within_1_month': 5,
        '1-3_months': 4,
        '3-6_months': 3,
        '6+_months': 2
      };
      score += timelineScores[leadData.timeline] || 1;
    }

    return score;
  }

  /**
   * Update lead score based on interactions and time decay
   * @param {string} leadId - Lead ID
   * @param {Array} interactions - Recent interactions
   * @returns {number} - Updated score
   */
  static async updateDynamicScore(leadId, interactions = []) {
    try {
      // Get current lead data
      const lead = await DatabaseService.getLead(leadId);
      if (!lead) return 0;

      let score = lead.score || 0;

      // Apply time decay (older leads lose points over time)
      const daysSinceCreation = Math.floor((Date.now() - new Date(lead.created_at).getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceCreation > 30) {
        const decayFactor = Math.max(0.7, 1 - (daysSinceCreation - 30) * 0.01); // 1% decay per day after 30 days
        score *= decayFactor;
      }

      // Apply interaction-based scoring adjustments
      score += this.calculateInteractionScore(interactions);

      // Apply engagement velocity bonus
      score += this.calculateEngagementVelocity(lead, interactions);

      // Ensure score stays within bounds
      return Math.min(Math.max(Math.round(score), 0), 100);

    } catch (error) {
      console.error('Error updating dynamic score:', error);
      return 0;
    }
  }

  /**
   * Calculate score adjustments based on interactions
   * @param {Array} interactions - Lead interactions
   * @returns {number} - Interaction score adjustment
   */
  static calculateInteractionScore(interactions) {
    let adjustment = 0;

    if (!interactions || interactions.length === 0) return adjustment;

    // Recent interactions (last 7 days) are more valuable
    const recentInteractions = interactions.filter(interaction => {
      const daysSince = Math.floor((Date.now() - new Date(interaction.created_at).getTime()) / (1000 * 60 * 60 * 24));
      return daysSince <= 7;
    });

    // Email opens/views (+2 points each, max 10)
    const emailOpens = recentInteractions.filter(i => i.type === 'email_open').length;
    adjustment += Math.min(emailOpens * 2, 10);

    // Website visits (+3 points each, max 15)
    const websiteVisits = recentInteractions.filter(i => i.type === 'website_visit').length;
    adjustment += Math.min(websiteVisits * 3, 15);

    // Phone calls (+5 points each, max 20)
    const phoneCalls = recentInteractions.filter(i => i.type === 'phone_call').length;
    adjustment += Math.min(phoneCalls * 5, 20);

    // In-person visits (+10 points each, max 30)
    const inPersonVisits = recentInteractions.filter(i => i.type === 'in_person_visit').length;
    adjustment += Math.min(inPersonVisits * 10, 30);

    // Test drives (+15 points each, max 45)
    const testDrives = recentInteractions.filter(i => i.type === 'test_drive').length;
    adjustment += Math.min(testDrives * 15, 45);

    return adjustment;
  }

  /**
   * Calculate engagement velocity bonus
   * @param {Object} lead - Lead data
   * @param {Array} interactions - Lead interactions
   * @returns {number} - Velocity bonus
   */
  static calculateEngagementVelocity(lead, interactions) {
    if (!interactions || interactions.length < 2) return 0;

    // Calculate average time between interactions
    const sortedInteractions = interactions
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .slice(-5); // Last 5 interactions

    if (sortedInteractions.length < 2) return 0;

    const timeDiffs = [];
    for (let i = 1; i < sortedInteractions.length; i++) {
      const diff = new Date(sortedInteractions[i].created_at) - new Date(sortedInteractions[i-1].created_at);
      timeDiffs.push(diff / (1000 * 60 * 60 * 24)); // Convert to days
    }

    const avgTimeBetweenInteractions = timeDiffs.reduce((sum, diff) => sum + diff, 0) / timeDiffs.length;

    // High engagement velocity (interactions within 1 day) gets bonus
    if (avgTimeBetweenInteractions <= 1) return 10;
    if (avgTimeBetweenInteractions <= 3) return 5;
    if (avgTimeBetweenInteractions <= 7) return 2;

    return 0;
  }

  /**
   * Get lead priority level based on score
   * @param {number} score - Lead score
   * @returns {string} - Priority level
   */
  static getPriorityLevel(score) {
    if (score >= 80) return 'hot';
    if (score >= 60) return 'warm';
    if (score >= 40) return 'cool';
    return 'cold';
  }

  /**
   * Get recommended follow-up actions based on score and interactions
   * @param {number} score - Lead score
   * @param {Array} interactions - Recent interactions
   * @returns {Array} - Recommended actions
   */
  static getRecommendedActions(score, interactions = []) {
    const actions = [];
    const priority = this.getPriorityLevel(score);

    // High priority leads
    if (priority === 'hot') {
      actions.push('immediate_phone_call', 'schedule_test_drive', 'send_welcome_package');
    }
    // Warm leads
    else if (priority === 'warm') {
      actions.push('follow_up_email', 'phone_call_within_24h', 'send_brochure');
    }
    // Cool leads
    else if (priority === 'cool') {
      actions.push('nurture_email_sequence', 'phone_call_this_week');
    }
    // Cold leads
    else {
      actions.push('monthly_nurture_email', 're_engagement_campaign');
    }

    // Add interaction-based recommendations
    if (interactions.length === 0) {
      actions.push('initial_contact');
    }

    const recentCalls = interactions.filter(i => i.type === 'phone_call' &&
      (Date.now() - new Date(i.created_at)) < (7 * 24 * 60 * 60 * 1000)); // Last 7 days

    if (recentCalls.length === 0) {
      actions.push('schedule_follow_up_call');
    }

    return actions;
  }
}

module.exports = LeadScoringService;