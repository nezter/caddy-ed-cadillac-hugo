/**
 * Integration Tests: Follow-up System
 * Tests end-to-end workflows and system integration
 */

const handler = require('../../netlify/functions/followup-campaigns');
const followupRulesHandler = require('../../netlify/functions/followup-rules');
const followupAnalyticsHandler = require('../../netlify/functions/followup-analytics');
const testUtils = require('../setup');

describe('Follow-up System Integration', () => {
  let mockEvent;
  let createdCampaignId;
  let createdRuleId;

  beforeEach(() => {
    mockEvent = testUtils.createMockEvent({
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testUtils.createMockJWT({
          role: 'admin',
          permissions: ['campaigns_read', 'campaigns_write', 'rules_read', 'rules_write', 'analytics_read']
        })}`
      }
    });
  });

  describe('Campaign and Rule Workflow', () => {
    it('should create campaign and associated rules', async () => {
      // Step 1: Create a campaign
      mockEvent.httpMethod = 'POST';
      mockEvent.body = JSON.stringify({
        name: 'Integration Test Campaign',
        description: 'Campaign for integration testing',
        campaign_type: 'nurture',
        target_audience: 'leads',
        is_active: true,
        priority: 1
      });

      const campaignResponse = await handler.handler(mockEvent);
      expect(campaignResponse.statusCode).toBe(201);
      
      const campaignData = JSON.parse(campaignResponse.body).data;
      createdCampaignId = campaignData.id;
      expect(createdCampaignId).toBeDefined();

      // Step 2: Create rules for the campaign
      mockEvent.path = '/.netlify/functions/followup-rules';
      mockEvent.body = JSON.stringify({
        name: 'Welcome Email Rule',
        description: 'Send welcome email to new leads',
        trigger_event: 'lead_created',
        conditions: {},
        actions: [{
          type: 'schedule_followup',
          email: true,
          email_template: 'welcome_new_lead',
          delay: '1 hour',
          priority: 1
        }],
        campaign_id: createdCampaignId,
        priority: 10,
        delay_hours: 1,
        is_active: true
      });

      const ruleResponse = await followupRulesHandler.handler(mockEvent);
      expect(ruleResponse.statusCode).toBe(201);
      
      const ruleData = JSON.parse(ruleResponse.body).data;
      createdRuleId = ruleData.id;
      expect(createdRuleId).toBeDefined();

      // Step 3: Verify campaign has the rule
      mockEvent.httpMethod = 'GET';
      mockEvent.path = `/.netlify/functions/followup-campaigns/${createdCampaignId}`;
      
      const getCampaignResponse = await handler.handler(mockEvent);
      expect(getCampaignResponse.statusCode).toBe(200);
      
      const retrievedCampaign = JSON.parse(getCampaignResponse.body).data;
      expect(retrievedCampaign.id).toBe(createdCampaignId);
    });

    it('should activate campaign and rules together', async () => {
      // Create inactive campaign
      mockEvent.httpMethod = 'POST';
      mockEvent.body = JSON.stringify({
        name: 'Inactive Campaign',
        campaign_type: 'nurture',
        is_active: false
      });

      const campaignResponse = await handler.handler(mockEvent);
      const campaignId = JSON.parse(campaignResponse.body).data.id;

      // Activate the campaign
      mockEvent.httpMethod = 'POST';
      mockEvent.path = `/.netlify/functions/followup-campaigns/${campaignId}/activate`;
      
      const activateResponse = await handler.handler(mockEvent);
      expect(activateResponse.statusCode).toBe(200);
      
      const activatedCampaign = JSON.parse(activateResponse.body).data;
      expect(activatedCampaign.is_active).toBe(true);
    });
  });

  describe('Analytics Integration', () => {
    it('should track campaign performance metrics', async () => {
      // Create a campaign for analytics testing
      mockEvent.httpMethod = 'POST';
      mockEvent.body = JSON.stringify({
        name: 'Analytics Test Campaign',
        campaign_type: 'nurture',
        is_active: true
      });

      const campaignResponse = await handler.handler(mockEvent);
      const campaignId = JSON.parse(campaignResponse.body).data.id;

      // Track analytics events
      mockEvent.path = '/.netlify/functions/followup-analytics/track';
      mockEvent.body = JSON.stringify({
        followup_id: 'test-followup-id',
        customer_id: 'test-customer-id',
        campaign_id: campaignId,
        event_type: 'opened',
        email_opened: true,
        user_agent: 'Test Browser',
        ip_address: '127.0.0.1'
      });

      const analyticsResponse = await followupAnalyticsHandler.handler(mockEvent);
      expect(analyticsResponse.statusCode).toBe(200);

      // Get campaign performance
      mockEvent.httpMethod = 'GET';
      mockEvent.path = `/.netlify/functions/followup-campaigns/${campaignId}/performance`;
      
      const performanceResponse = await handler.handler(mockEvent);
      expect(performanceResponse.statusCode).toBe(200);
      
      const performance = JSON.parse(performanceResponse.body).data;
      expect(performance).toHaveProperty('open_rate');
      expect(performance).toHaveProperty('click_rate');
      expect(performance).toHaveProperty('conversion_rate');
    });

    it('should aggregate analytics across multiple events', async () => {
      const campaignId = 'test-campaign-id';
      
      // Track multiple events
      const events = [
        { event_type: 'sent', email_opened: false },
        { event_type: 'opened', email_opened: true },
        { event_type: 'clicked', link_clicked: 'https://example.com' }
      ];

      for (const event of events) {
        mockEvent.path = '/.netlify/functions/followup-analytics/track';
        mockEvent.body = JSON.stringify({
          followup_id: 'test-followup-id',
          customer_id: 'test-customer-id',
          campaign_id: campaignId,
          ...event
        });

        const response = await followupAnalyticsHandler.handler(mockEvent);
        expect(response.statusCode).toBe(200);
      }

      // Get analytics dashboard
      mockEvent.httpMethod = 'GET';
      mockEvent.path = '/.netlify/functions/followup-analytics/dashboard';
      
      const dashboardResponse = await followupAnalyticsHandler.handler(mockEvent);
      expect(dashboardResponse.statusCode).toBe(200);
      
      const dashboard = JSON.parse(dashboardResponse.body).data;
      expect(dashboard).toHaveProperty('total_events');
      expect(dashboard).toHaveProperty('event_breakdown');
    });
  });

  describe('Permission Integration', () => {
    it('should enforce permissions across all endpoints', async () => {
      // Test with limited permissions
      const limitedPermissionEvent = testUtils.createMockEvent({
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testUtils.createMockJWT({
            role: 'sales_rep',
            permissions: ['campaigns_read'] // Only read permission
          })}`
        }
      });

      // Should be able to read campaigns
      limitedPermissionEvent.httpMethod = 'GET';
      limitedPermissionEvent.path = '/.netlify/functions/followup-campaigns';
      
      const readResponse = await handler.handler(limitedPermissionEvent);
      expect(readResponse.statusCode).toBe(200);

      // Should not be able to create campaigns
      limitedPermissionEvent.httpMethod = 'POST';
      limitedPermissionEvent.body = JSON.stringify({
        name: 'Unauthorized Campaign'
      });
      
      const createResponse = await handler.handler(limitedPermissionEvent);
      expect(createResponse.statusCode).toBe(403);

      // Should not be able to access analytics without permission
      limitedPermissionEvent.path = '/.netlify/functions/followup-analytics/dashboard';
      
      const analyticsResponse = await followupAnalyticsHandler.handler(limitedPermissionEvent);
      expect(analyticsResponse.statusCode).toBe(403);
    });
  });

  describe('Data Consistency', () => {
    it('should maintain data consistency across related tables', async () => {
      // Create campaign
      mockEvent.httpMethod = 'POST';
      mockEvent.body = JSON.stringify({
        name: 'Consistency Test Campaign',
        campaign_type: 'nurture',
        is_active: true
      });

      const campaignResponse = await handler.handler(mockEvent);
      const campaignId = JSON.parse(campaignResponse.body).data.id;

      // Create rule referencing the campaign
      mockEvent.path = '/.netlify/functions/followup-rules';
      mockEvent.body = JSON.stringify({
        name: 'Consistency Test Rule',
        trigger_event: 'lead_created',
        campaign_id: campaignId,
        is_active: true
      });

      const ruleResponse = await followupRulesHandler.handler(mockEvent);
      const ruleId = JSON.parse(ruleResponse.body).data.id;

      // Verify rule references correct campaign
      mockEvent.httpMethod = 'GET';
      mockEvent.path = `/.netlify/functions/followup-rules/${ruleId}`;
      
      const getRuleResponse = await followupRulesHandler.handler(mockEvent);
      expect(getRuleResponse.statusCode).toBe(200);
      
      const rule = JSON.parse(getRuleResponse.body).data;
      expect(rule.campaign_id).toBe(campaignId);

      // Delete campaign and verify rule handling
      mockEvent.httpMethod = 'DELETE';
      mockEvent.path = `/.netlify/functions/followup-campaigns/${campaignId}`;
      
      const deleteResponse = await handler.handler(mockEvent);
      expect(deleteResponse.statusCode).toBe(200);

      // Rule should still exist but campaign reference should be handled gracefully
      mockEvent.httpMethod = 'GET';
      mockEvent.path = `/.netlify/functions/followup-rules/${ruleId}`;
      
      const getRuleAfterDeleteResponse = await followupRulesHandler.handler(mockEvent);
      expect(getRuleAfterDeleteResponse.statusCode).toBe(200);
    });
  });

  describe('Error Propagation', () => {
    it('should handle cascading errors gracefully', async () => {
      // Test with invalid campaign ID in rule creation
      mockEvent.path = '/.netlify/functions/followup-rules';
      mockEvent.body = JSON.stringify({
        name: 'Invalid Rule',
        trigger_event: 'lead_created',
        campaign_id: 'invalid-campaign-id',
        is_active: true
      });

      const ruleResponse = await followupRulesHandler.handler(mockEvent);
      expect(ruleResponse.statusCode).toBe(400);
      
      const errorBody = JSON.parse(ruleResponse.body);
      expect(errorBody.success).toBe(false);
      expect(errorBody.error).toBeDefined();
    });

    it('should maintain transaction integrity', async () => {
      // Test operations that should be atomic
      mockEvent.httpMethod = 'POST';
      mockEvent.body = JSON.stringify({
        name: 'Transaction Test Campaign',
        campaign_type: 'invalid-type', // This should cause validation error
        is_active: true
      });

      const response = await handler.handler(mockEvent);
      expect(response.statusCode).toBe(400);
      
      // Verify no partial data was created
      mockEvent.httpMethod = 'GET';
      mockEvent.path = '/.netlify/functions/followup-campaigns';
      
      const listResponse = await handler.handler(mockEvent);
      const campaigns = JSON.parse(listResponse.body).data;
      
      const transactionTestCampaign = campaigns.find(c => c.name === 'Transaction Test Campaign');
      expect(transactionTestCampaign).toBeUndefined();
    });
  });

  describe('Performance Integration', () => {
    it('should handle concurrent requests efficiently', async () => {
      // Create multiple concurrent requests
      const concurrentRequests = Array(10).fill().map((_, index) => {
        const concurrentEvent = testUtils.createMockEvent({
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${testUtils.createMockJWT()}`
          }
        });
        
        concurrentEvent.httpMethod = 'GET';
        concurrentEvent.path = '/.netlify/functions/followup-campaigns';
        concurrentEvent.queryStringParameters = { limit: '5', offset: index * 5 };
        
        return handler.handler(concurrentEvent);
      });

      const responses = await Promise.all(concurrentRequests);
      
      // All requests should succeed
      responses.forEach(response => {
        expect(response.statusCode).toBe(200);
      });

      // Responses should be valid JSON
      responses.forEach(response => {
        expect(() => JSON.parse(response.body)).not.toThrow();
      });
    });

    it('should maintain response times under load', async () => {
      const startTime = Date.now();
      
      // Make a series of requests
      for (let i = 0; i < 5; i++) {
        mockEvent.httpMethod = 'GET';
        mockEvent.path = '/.netlify/functions/followup-campaigns';
        
        const response = await handler.handler(mockEvent);
        expect(response.statusCode).toBe(200);
      }
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      const averageTime = totalTime / 5;
      
      // Average response time should be reasonable (under 2 seconds)
      expect(averageTime).toBeLessThan(2000);
    });
  });

  describe('Security Integration', () => {
    it('should prevent SQL injection across all endpoints', async () => {
      const maliciousInput = "'; DROP TABLE followup_campaigns; --";
      
      // Test in campaign creation
      mockEvent.httpMethod = 'POST';
      mockEvent.body = JSON.stringify({
        name: maliciousInput,
        description: maliciousInput
      });

      const createResponse = await handler.handler(mockEvent);
      expect(createResponse.statusCode).toBe(400); // Should be caught by validation

      // Test in query parameters
      mockEvent.httpMethod = 'GET';
      mockEvent.queryStringParameters = { 
        search: maliciousInput,
        type: maliciousInput 
      };

      const searchResponse = await handler.handler(mockEvent);
      expect(searchResponse.statusCode).toBe(400); // Should be caught by validation
    });

    it('should sanitize XSS attempts', async () => {
      const xssPayload = '<script>alert("xss")</script>';
      
      mockEvent.httpMethod = 'POST';
      mockEvent.body = JSON.stringify({
        name: xssPayload,
        description: xssPayload
      });

      const response = await handler.handler(mockEvent);
      
      if (response.statusCode === 201) {
        const createdCampaign = JSON.parse(response.body).data;
        // XSS should be sanitized
        expect(createdCampaign.name).not.toContain('<script>');
        expect(createdCampaign.description).not.toContain('<script>');
      } else {
        // Or it should be rejected by validation
        expect(response.statusCode).toBe(400);
      }
    });
  });
});