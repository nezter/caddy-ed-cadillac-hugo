/**
 * Unit Tests: Follow-up Campaigns API
 * Tests campaign CRUD operations and business logic
 */

const handler = require('../../netlify/functions/followup-campaigns');
const testUtils = require('../setup');

describe('Follow-up Campaigns API', () => {
  let mockEvent;

  beforeEach(() => {
    mockEvent = testUtils.createMockEvent({
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testUtils.createMockJWT()}`
      }
    });
  });

  describe('GET /', () => {
    it('should return list of campaigns', async () => {
      const response = await handler.handler(mockEvent);
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });

    it('should filter campaigns by active status', async () => {
      mockEvent.queryStringParameters = { active: 'true' };
      
      const response = await handler.handler(mockEvent);
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    it('should filter campaigns by type', async () => {
      mockEvent.queryStringParameters = { type: 'nurture' };
      
      const response = await handler.handler(mockEvent);
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    it('should handle pagination parameters', async () => {
      mockEvent.queryStringParameters = { 
        limit: '10', 
        offset: '0',
        sort_by: 'created_at',
        sort_order: 'DESC'
      };
      
      const response = await handler.handler(mockEvent);
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    it('should validate query parameters', async () => {
      mockEvent.queryStringParameters = { 
        limit: 'invalid',
        type: 'invalid-type'
      };
      
      const response = await handler.handler(mockEvent);
      
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toContain('validation');
    });
  });

  describe('POST /', () => {
    beforeEach(() => {
      mockEvent.httpMethod = 'POST';
      mockEvent.body = JSON.stringify({
        name: 'Test Campaign',
        description: 'Test campaign description',
        campaign_type: 'nurture',
        target_audience: 'leads',
        is_active: true,
        priority: 1
      });
    });

    it('should create new campaign', async () => {
      const response = await handler.handler(mockEvent);
      
      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.name).toBe('Test Campaign');
    });

    it('should validate required fields', async () => {
      mockEvent.body = JSON.stringify({
        description: 'Missing required name field'
      });
      
      const response = await handler.handler(mockEvent);
      
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toContain('validation');
    });

    it('should validate campaign type', async () => {
      mockEvent.body = JSON.stringify({
        name: 'Test Campaign',
        campaign_type: 'invalid-type'
      });
      
      const response = await handler.handler(mockEvent);
      
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });

    it('should validate target audience', async () => {
      mockEvent.body = JSON.stringify({
        name: 'Test Campaign',
        target_audience: 'invalid-audience'
      });
      
      const response = await handler.handler(mockEvent);
      
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });

    it('should handle invalid JSON', async () => {
      mockEvent.body = 'invalid json';
      
      const response = await handler.handler(mockEvent);
      
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });
  });

  describe('GET /stats', () => {
    beforeEach(() => {
      mockEvent.path = '/.netlify/functions/followup-campaigns/stats';
    });

    it('should return campaign statistics', async () => {
      const response = await handler.handler(mockEvent);
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('total_campaigns');
      expect(body.data).toHaveProperty('active_campaigns');
      expect(body.data).toHaveProperty('total_sent');
      expect(body.data).toHaveProperty('total_opened');
      expect(body.data).toHaveProperty('total_clicked');
      expect(body.data).toHaveProperty('total_converted');
    });
  });

  describe('GET /active', () => {
    beforeEach(() => {
      mockEvent.path = '/.netlify/functions/followup-campaigns/active';
    });

    it('should return active campaigns only', async () => {
      const response = await handler.handler(mockEvent);
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });
  });

  describe('GET /{id}', () => {
    beforeEach(() => {
      mockEvent.path = '/.netlify/functions/followup-campaigns/test-campaign-id';
    });

    it('should return specific campaign', async () => {
      const response = await handler.handler(mockEvent);
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('id');
    });

    it('should handle non-existent campaign', async () => {
      mockEvent.path = '/.netlify/functions/followup-campaigns/non-existent-id';
      
      const response = await handler.handler(mockEvent);
      
      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });

    it('should validate campaign ID format', async () => {
      mockEvent.path = '/.netlify/functions/followup-campaigns/invalid-id';
      
      const response = await handler.handler(mockEvent);
      
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });
  });

  describe('PUT /{id}', () => {
    beforeEach(() => {
      mockEvent.httpMethod = 'PUT';
      mockEvent.path = '/.netlify/functions/followup-campaigns/test-campaign-id';
      mockEvent.body = JSON.stringify({
        name: 'Updated Campaign Name',
        description: 'Updated description',
        is_active: false
      });
    });

    it('should update campaign', async () => {
      const response = await handler.handler(mockEvent);
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.name).toBe('Updated Campaign Name');
    });

    it('should validate update data', async () => {
      mockEvent.body = JSON.stringify({
        campaign_type: 'invalid-type'
      });
      
      const response = await handler.handler(mockEvent);
      
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });
  });

  describe('DELETE /{id}', () => {
    beforeEach(() => {
      mockEvent.httpMethod = 'DELETE';
      mockEvent.path = '/.netlify/functions/followup-campaigns/test-campaign-id';
    });

    it('should delete campaign', async () => {
      const response = await handler.handler(mockEvent);
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    it('should handle deletion of non-existent campaign', async () => {
      mockEvent.path = '/.netlify/functions/followup-campaigns/non-existent-id';
      
      const response = await handler.handler(mockEvent);
      
      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });
  });

  describe('POST /{id}/activate', () => {
    beforeEach(() => {
      mockEvent.httpMethod = 'POST';
      mockEvent.path = '/.netlify/functions/followup-campaigns/test-campaign-id/activate';
    });

    it('should activate campaign', async () => {
      const response = await handler.handler(mockEvent);
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.is_active).toBe(true);
    });
  });

  describe('POST /{id}/deactivate', () => {
    beforeEach(() => {
      mockEvent.httpMethod = 'POST';
      mockEvent.path = '/.netlify/functions/followup-campaigns/test-campaign-id/deactivate';
    });

    it('should deactivate campaign', async () => {
      const response = await handler.handler(mockEvent);
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.is_active).toBe(false);
    });
  });

  describe('GET /{id}/performance', () => {
    beforeEach(() => {
      mockEvent.path = '/.netlify/functions/followup-campaigns/test-campaign-id/performance';
    });

    it('should return campaign performance metrics', async () => {
      const response = await handler.handler(mockEvent);
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('open_rate');
      expect(body.data).toHaveProperty('click_rate');
      expect(body.data).toHaveProperty('conversion_rate');
      expect(body.data).toHaveProperty('total_sent');
      expect(body.data).toHaveProperty('total_opened');
      expect(body.data).toHaveProperty('total_clicked');
      expect(body.data).toHaveProperty('total_converted');
    });
  });

  describe('Authentication & Authorization', () => {
    it('should require authentication', async () => {
      const unauthorizedEvent = testUtils.createMockEvent();
      delete unauthorizedEvent.headers.Authorization;
      
      const response = await handler.handler(unauthorizedEvent);
      
      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });

    it('should validate JWT token', async () => {
      const invalidTokenEvent = testUtils.createMockEvent({
        headers: {
          'Authorization': 'Bearer invalid-token'
        }
      });
      
      const response = await handler.handler(invalidTokenEvent);
      
      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });

    it('should check required permissions', async () => {
      const noPermissionEvent = testUtils.createMockEvent({
        headers: {
          'Authorization': testUtils.createMockJWT({
            permissions: ['other_permission']
          })
        }
      });
      
      const response = await handler.handler(noPermissionEvent);
      
      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Mock database error
      const { createClient } = require('@supabase/supabase-js');
      createClient.mockImplementation(() => ({
        from: jest.fn(() => ({
          select: jest.fn(() => ({
            data: null,
            error: { message: 'Database connection failed' }
          }))
        }))
      }));

      const response = await handler.handler(mockEvent);
      
      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });

    it('should handle unexpected errors', async () => {
      // Mock unexpected error
      const originalHandler = handler.handler;
      handler.handler = jest.fn().mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      const response = await handler.handler(mockEvent);
      
      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);

      // Restore original handler
      handler.handler = originalHandler;
    });
  });

  describe('Input Validation', () => {
    it('should sanitize HTML in text fields', async () => {
      mockEvent.httpMethod = 'POST';
      mockEvent.body = JSON.stringify({
        name: '<script>alert("xss")</script>Test Campaign',
        description: '<img src=x onerror=alert("xss")>Description'
      });
      
      const response = await handler.handler(mockEvent);
      
      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.data.name).not.toContain('<script>');
      expect(body.data.description).not.toContain('<img');
    });

    it('should validate email format in email fields', async () => {
      mockEvent.httpMethod = 'POST';
      mockEvent.body = JSON.stringify({
        name: 'Test Campaign',
        test_email: 'invalid-email-format'
      });
      
      const response = await handler.handler(mockEvent);
      
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });

    it('should validate phone number format', async () => {
      mockEvent.httpMethod = 'POST';
      mockEvent.body = JSON.stringify({
        name: 'Test Campaign',
        test_phone: 'invalid-phone'
      });
      
      const response = await handler.handler(mockEvent);
      
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits', async () => {
      // Make multiple rapid requests
      const promises = Array(101).fill().map(() => handler.handler(mockEvent));
      const responses = await Promise.all(promises);
      
      // At least one request should be rate limited
      const rateLimitedResponses = responses.filter(res => res.statusCode === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });
});