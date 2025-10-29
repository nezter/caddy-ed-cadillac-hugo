/**
 * Lead Assignment Service
 * Intelligently assigns leads to sales representatives based on multiple factors
 */

const DatabaseService = require('./database-service');

class LeadAssignmentService {
  /**
   * Assign a lead to the best available sales representative
   * @param {Object} leadData - Lead information
   * @returns {Object} - Assignment result with rep details
   */
  static async assignLead(leadData) {
    try {
      // Get all active sales reps
      const salesReps = await DatabaseService.getAllSalesReps();
      const activeReps = salesReps.filter(rep => rep.status === 'active');

      if (activeReps.length === 0) {
        throw new Error('No active sales representatives available');
      }

      // Calculate assignment scores for each rep
      const assignmentScores = await Promise.all(
        activeReps.map(async (rep) => {
          const score = await this.calculateAssignmentScore(rep, leadData);
          return { rep, score };
        })
      );

      // Sort by score (highest first)
      assignmentScores.sort((a, b) => b.score - a.score);

      const bestAssignment = assignmentScores[0];

      if (!bestAssignment || bestAssignment.score <= 0) {
        // Fallback: assign to rep with least leads
        const fallbackRep = await this.getFallbackAssignment(activeReps);
        return {
          assignedRep: fallbackRep,
          assignmentReason: 'fallback_assignment',
          score: 0
        };
      }

      return {
        assignedRep: bestAssignment.rep,
        assignmentScore: bestAssignment.score,
        assignmentReason: this.getAssignmentReason(bestAssignment.rep, leadData)
      };

    } catch (error) {
      console.error('Error assigning lead:', error);
      throw error;
    }
  }

  /**
   * Calculate assignment score for a sales rep and lead combination
   * @param {Object} rep - Sales representative data
   * @param {Object} leadData - Lead data
   * @returns {number} - Assignment score (0-100)
   */
  static async calculateAssignmentScore(rep, leadData) {
    let score = 50; // Base score

    // Workload factor (0-30 points)
    score += await this.calculateWorkloadScore(rep);

    // Specialization factor (0-25 points)
    score += this.calculateSpecializationScore(rep, leadData);

    // Geography factor (0-20 points)
    score += this.calculateGeographyScore(rep, leadData);

    // Performance factor (0-15 points)
    score += await this.calculatePerformanceScore(rep);

    // Availability factor (0-10 points)
    score += this.calculateAvailabilityScore(rep);

    return Math.min(Math.max(score, 0), 100);
  }

  /**
   * Calculate workload score - prefer reps with lower current workload
   * @param {Object} rep - Sales rep data
   * @returns {number} - Workload score
   */
  static async calculateWorkloadScore(rep) {
    try {
      // Get current lead count for this rep
      const currentLeads = await DatabaseService.getSalesRepLeadCount(rep.id);

      // Get rep's capacity (assume 10 leads per rep as baseline)
      const capacity = rep.capacity || 10;

      // Calculate workload percentage
      const workloadPercentage = Math.min(currentLeads / capacity, 1);

      // Higher score for lower workload
      return Math.round((1 - workloadPercentage) * 30);

    } catch (error) {
      console.error('Error calculating workload score:', error);
      return 15; // Neutral score
    }
  }

  /**
   * Calculate specialization score based on rep expertise and lead requirements
   * @param {Object} rep - Sales rep data
   * @param {Object} leadData - Lead data
   * @returns {number} - Specialization score
   */
  static calculateSpecializationScore(rep, leadData) {
    let score = 0;

    // Check vehicle specialization
    if (rep.specializations && Array.isArray(rep.specializations)) {
      const leadVehicle = leadData.vehicle_interest || '';

      // Exact model matches
      if (rep.specializations.some(spec =>
        leadVehicle.toLowerCase().includes(spec.toLowerCase())
      )) {
        score += 15;
      }

      // Brand matches (Cadillac, etc.)
      if (rep.specializations.some(spec =>
        spec.toLowerCase().includes('cadillac') &&
        leadVehicle.toLowerCase().includes('cadillac')
      )) {
        score += 10;
      }
    }

    // Check lead source expertise
    if (rep.source_expertise && rep.source_expertise.includes(leadData.source)) {
      score += 5;
    }

    // Check budget range expertise
    if (rep.budget_expertise && leadData.budget_min) {
      const repMin = rep.budget_expertise.min || 0;
      const repMax = rep.budget_expertise.max || Infinity;

      if (leadData.budget_min >= repMin && leadData.budget_min <= repMax) {
        score += 5;
      }
    }

    return Math.min(score, 25);
  }

  /**
   * Calculate geography score based on rep territory and lead location
   * @param {Object} rep - Sales rep data
   * @param {Object} leadData - Lead data
   * @returns {number} - Geography score
   */
  static calculateGeographyScore(rep, leadData) {
    // For now, implement basic geography matching
    // In a real implementation, this would use ZIP codes, cities, etc.

    if (!rep.territory || !leadData.address_line1) {
      return 10; // Neutral score if no geography data
    }

    const leadLocation = leadData.city || leadData.state || '';
    const repTerritory = rep.territory.toLowerCase();

    // Exact city match
    if (leadLocation.toLowerCase().includes(repTerritory)) {
      return 20;
    }

    // State match
    if (leadData.state && repTerritory.includes(leadData.state.toLowerCase())) {
      return 15;
    }

    // Regional match (basic implementation)
    const regions = {
      'north': ['north carolina', 'virginia', 'maryland'],
      'south': ['south carolina', 'georgia', 'florida'],
      'mountain': ['tennessee', 'kentucky', 'west virginia']
    };

    for (const [region, states] of Object.entries(regions)) {
      if (repTerritory.includes(region) &&
          states.some(state => leadLocation.toLowerCase().includes(state))) {
        return 12;
      }
    }

    return 5; // Low score for no geography match
  }

  /**
   * Calculate performance score based on rep's recent conversion rates
   * @param {Object} rep - Sales rep data
   * @returns {number} - Performance score
   */
  static async calculatePerformanceScore(rep) {
    try {
      // Get rep's performance metrics for last 30 days
      const performance = await DatabaseService.getSalesRepPerformance(rep.id, 30);

      if (!performance) return 7; // Neutral score

      // Calculate conversion rate
      const conversionRate = performance.total_leads > 0 ?
        (performance.converted_leads / performance.total_leads) * 100 : 0;

      // Higher conversion rate = higher score
      return Math.min(Math.round(conversionRate * 0.15), 15);

    } catch (error) {
      console.error('Error calculating performance score:', error);
      return 7; // Neutral score
    }
  }

  /**
   * Calculate availability score based on rep schedule and capacity
   * @param {Object} rep - Sales rep data
   * @returns {number} - Availability score
   */
  static calculateAvailabilityScore(rep) {
    // Check if rep is currently available
    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDay(); // 0 = Sunday, 6 = Saturday

    // Assume standard business hours (9 AM - 6 PM, Monday-Friday)
    const isBusinessHours = currentHour >= 9 && currentHour <= 18 && currentDay >= 1 && currentDay <= 5;

    if (isBusinessHours) {
      return 10;
    } else {
      // Lower score for off-hours, but still assignable
      return 5;
    }
  }

  /**
   * Get fallback assignment when no good matches found
   * @param {Array} reps - Available sales reps
   * @returns {Object} - Fallback rep assignment
   */
  static async getFallbackAssignment(reps) {
    // Find rep with lowest current lead count
    let lowestCount = Infinity;
    let selectedRep = reps[0];

    for (const rep of reps) {
      try {
        const leadCount = await DatabaseService.getSalesRepLeadCount(rep.id);
        if (leadCount < lowestCount) {
          lowestCount = leadCount;
          selectedRep = rep;
        }
      } catch (error) {
        console.error(`Error getting lead count for rep ${rep.id}:`, error);
      }
    }

    return selectedRep;
  }

  /**
   * Get human-readable reason for assignment
   * @param {Object} rep - Assigned rep
   * @param {Object} leadData - Lead data
   * @returns {string} - Assignment reason
   */
  static getAssignmentReason(rep, leadData) {
    const reasons = [];

    // Specialization match
    if (rep.specializations && leadData.vehicle_interest) {
      if (rep.specializations.some(spec =>
        leadData.vehicle_interest.toLowerCase().includes(spec.toLowerCase())
      )) {
        reasons.push('vehicle specialization match');
      }
    }

    // Geography match
    if (rep.territory && leadData.city) {
      if (leadData.city.toLowerCase().includes(rep.territory.toLowerCase())) {
        reasons.push('geographic territory match');
      }
    }

    // Performance
    reasons.push('optimal workload balance');

    return reasons.length > 0 ? reasons[0] : 'automatic assignment';
  }

  /**
   * Rebalance existing lead assignments
   * @returns {Object} - Rebalancing results
   */
  static async rebalanceAssignments() {
    try {
      // Get all unassigned or poorly assigned leads
      const leadsToReassign = await DatabaseService.getLeadsNeedingReassignment();

      const results = {
        totalProcessed: leadsToReassign.length,
        reassigned: 0,
        errors: 0
      };

      for (const lead of leadsToReassign) {
        try {
          const assignment = await this.assignLead(lead);

          // Update lead assignment in database
          await DatabaseService.updateLead(lead.id, {
            assigned_sales_rep_id: assignment.assignedRep.id,
            assignment_reason: assignment.assignmentReason,
            assignment_score: assignment.assignmentScore
          });

          results.reassigned++;

        } catch (error) {
          console.error(`Error reassigning lead ${lead.id}:`, error);
          results.errors++;
        }
      }

      return results;

    } catch (error) {
      console.error('Error rebalancing assignments:', error);
      throw error;
    }
  }

  /**
   * Get assignment analytics
   * @param {number} days - Number of days to analyze
   * @returns {Object} - Assignment analytics
   */
  static async getAssignmentAnalytics(days = 30) {
    try {
      const analytics = await DatabaseService.getAssignmentAnalytics(days);

      return {
        totalAssignments: analytics.totalAssignments,
        averageAssignmentScore: analytics.averageScore,
        assignmentsByReason: analytics.assignmentsByReason,
        repWorkloadDistribution: analytics.repWorkload,
        reassignmentRate: analytics.reassignmentRate
      };

    } catch (error) {
      console.error('Error getting assignment analytics:', error);
      throw error;
    }
  }
}

module.exports = LeadAssignmentService;