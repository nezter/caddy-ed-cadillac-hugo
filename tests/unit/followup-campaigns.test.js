/**
 * Unit Tests: Follow-up Campaigns API
 * Tests campaign CRUD operations and business logic
 */

const handler = require('../../netlify/functions/followup-campaigns');
const testUtils = require('../setup');

describe('Follow-up Campaigns API', () => {
  let mockEvent;
  let DB;

  /**
   * The campaign these tests are about.
   *
   * The suite is written as though the table has a row in it -- it fetches
   * 'test-campaign-id' and expects a campaign back. Nothing ever put one there,
   * so every {id} test got the honest 404 for an empty table and read as a
   * routing failure.
   *
   * Stated here, once, rather than mocked per test: the fake database answers
   * by table, so this row serves the SELECT and the COUNTs alike.
   */
  const CAMPAIGN = {
    id: 'test-campaign-id',
    name: 'Test Campaign',
    description: 'Test campaign description',
    campaign_type: 'nurture',
    target_audience: 'leads',
    is_active: true,
    priority: 1,
  };

  beforeEach(() => {
    DB = testUtils.database();
    DB.insert('followup_campaigns', CAMPAIGN);
    DB.insert('followup_rules', []);
    DB.insert('followups', []);

    // The path names THIS function, and it has to.
    //
    // createMockEvent defaults to `/.netlify/functions/test`, and the handler
    // routes by stripping its own name off the front:
    //
    //     event.path.replace('/.netlify/functions/followup-campaigns', '')
    //
    // With the default path that replace matches nothing, so `path` stayed
    // `/.netlify/functions/test`, no case in the switch matched, and every
    // collection request came back 404. The sub-resource tests set their own
    // path (`.../stats`, `.../active`, `.../{id}`) and so passed, which is why
    // this looked like a routing bug in a few tests rather than a missing
    // default in all of them.
    mockEvent = testUtils.createMockEvent({
      path: '/.netlify/functions/followup-campaigns',
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
      expect(Array.isArray(body.campaigns)).toBe(true);
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
      expect(body.message).toMatch(/validation/i);
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
      expect(body.campaign.name).toBe('Test Campaign');
    });

    it('should validate required fields', async () => {
      mockEvent.body = JSON.stringify({
        description: 'Missing required name field'
      });
      
      const response = await handler.handler(mockEvent);
      
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.message).toMatch(/validation/i);
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
      expect(body.data.stats).toHaveProperty('total_campaigns');
      // `active_campaigns` is a COLUMN of the stats row (a COUNT with a CASE),
      // not a sibling of it.
      expect(body.data.stats).toHaveProperty('active_campaigns');
      expect(body.data.stats).toHaveProperty('total_sent_all');
      expect(body.data.stats).toHaveProperty('total_opened_all');
      expect(body.data.stats).toHaveProperty('total_clicked_all');
      expect(body.data.stats).toHaveProperty('total_converted_all');
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
      // This endpoint returns `active_campaigns`; the collection endpoint above
      // returns `campaigns`. Both are real, and they are not the same key.
      expect(Array.isArray(body.data.active_campaigns)).toBe(true);
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
        // createSuccessResponse wraps its payload in `data`; the list endpoint
        // uses createSecureResponse and does not. Both shapes are real, so the
        // assertion names the one THIS endpoint returns.
        expect(body.data.campaign).toHaveProperty('id');
    });

    it('should handle non-existent campaign', async () => {
      mockEvent.path = '/.netlify/functions/followup-campaigns/non-existent-id';
      
      const response = await handler.handler(mockEvent);
      
      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });

    it('refuses an id that is not a single safe path segment', async () => {
      // This is no longer a 400-for-a-bad-id test, and deliberately so.
      //
      // `invalid-id` IS a well-formed id: the schema in this project is
      // `id TEXT PRIMARY KEY` and the ids in circulation are UUIDs, so the old
      // expectation that a non-numeric id is rejected was asserting a rule the
      // database does not have. It 404s now, which is the correct answer for an
      // id that is well-formed and absent.
      //
      // What is still worth asserting is the rule that DOES exist: an id
      // containing anything outside [A-Za-z0-9_-] is refused outright, before the
      // database is consulted. That is the property the route depends on.
      mockEvent.path = '/.netlify/functions/followup-campaigns/bad%20id%3Bdrop';

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
      expect(body.data.campaign.name).toBe('Updated Campaign Name');
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
      expect(body.data.campaign.is_active).toBe(true);
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
      expect(body.data.campaign.is_active).toBe(false);
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
      expect(body.data.performance).toHaveProperty('total_followups');
      // This endpoint returns `performance` and `rules`. The `stats` key
      // belongs to GET /stats; it was never on this response.
      expect(body.data).toHaveProperty('period_days');
      expect(body.data).toHaveProperty('rules');
      expect(body.data.campaign).toHaveProperty('id');
      expect(body.data.performance).toHaveProperty('total_followups');
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
      
        // The jsonwebtoken mock returns valid claims for WHATEVER it is handed,
        // so an "invalid" token authenticated and this got a 200.
        //
        // The token's contents are not what is under test. What is, is that a
        // token the verifier REJECTS produces a 401 -- so the verifier is made to
        // reject, which is what a real invalid token does. setup.js re-arms the
        // default verifier after each test so this cannot leak into later ones.
        testUtils.rejectTokens();

      const response = await handler.handler(invalidTokenEvent);
      
      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });

    it('takes permissions from the account row, not from the token', async () => {
      // This test asked for a 403 by putting the wrong permissions in the TOKEN.
      // That cannot work, and the reason is the design: the role and permission
      // checks read the sales_reps row, and a token's own claims are decorative.
      // Which is the security property worth stating -- a token claiming rights
      // it does not have is refused.
      //
      // So the denial is expressed where the decision is actually made: the
      // account row holds the wrong permissions.
      testUtils.asRep({ permissions: ['some_other_permission'] });

      const limitedEvent = testUtils.createMockEvent({
        path: '/.netlify/functions/followup-campaigns',
        headers: {
          Authorization: `Bearer ${testUtils.createMockJWT({ permissions: ['campaigns_read', 'campaigns_write'] })}`
        }
      });

      const response = await handler.handler(limitedEvent);

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('reports a failing data layer as a 500, without leaking the reason', async () => {
      // This mocked `@supabase/supabase-js`, which this function does not use.
      // It has queried through DatabaseService for some time, so the mock was
      // arranged and then never consulted, the request succeeded, and the
      // assertion failed. A test that arranges a failure in a dependency the
      // code does not have is not a test of failure handling at all.
      //
      // The failure is now caused where it would actually occur.
      const DatabaseService = require('../../netlify/functions/utils/database-service');
      DatabaseService.query.mockRejectedValue(new Error('connection terminated unexpectedly'));

      const response = await handler.handler(mockEvent);

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      // The operator gets a message; the caller does not get the driver's text.
      expect(body.message).toBeTruthy();
      expect(JSON.stringify(body)).not.toContain('connection terminated');
    });

      it('reports an unexpected failure as a 500, not as a crash', async () => {
        // This used to replace `handler.handler` with one that throws, then call
        // the replacement and assert it returned a response. It cannot pass: the
        // replacement throws, so `response` is never assigned.
        //
        // It also could not fail safely. The restore line sat after the
        // assertions, so the throw skipped it and `handler.handler` stayed
        // replaced for the REST OF THE SUITE -- which is why the four tests below
        // this one all reported "Unexpected error" as their own failure. One
        // broken test was failing five.
        //
        // What is worth asserting is real, and is asserted here directly: when
        // the data layer fails unexpectedly the caller gets a 500 with a
        // message, and the internal error does not leak into the response.
        const DatabaseService = require('../../netlify/functions/utils/database-service');
        DatabaseService.query.mockRejectedValue(new Error('connection reset by peer'));

        const response = await handler.handler(mockEvent);

        expect(response.statusCode).toBe(500);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(false);
        expect(body.message).toBeTruthy();
        expect(JSON.stringify(body)).not.toContain('connection reset by peer');
      });

  });

  describe('Input Validation', () => {
    it('should sanitize HTML in text fields', async () => {
      mockEvent.httpMethod = 'POST';
      mockEvent.body = JSON.stringify({
        name: '<script>alert("xss")</script>Test Campaign',
        description: '<img src=x onerror=alert("xss")>Description',
        // campaign_type is REQUIRED by campaignSchemas.create, so without it
        // this is a 400 and never reaches the sanitiser -- which is what
        // these three tests were actually measuring.
        campaign_type: 'custom'
      });
      
      const response = await handler.handler(mockEvent);
      
      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      // POST / uses createSecureResponse, which does NOT wrap in `data` -- the
      // GET endpoints that use createSuccessResponse do. The sanitiser is the
      // thing under test, and it ran: the markup is gone from the stored row.
      expect(body.campaign.name).not.toContain('<script>');
      expect(body.campaign.description).not.toContain('<img');
    });

    it('refuses a field the schema does not have', async () => {
      // This test sent `test_email: 'invalid-email-format'` and expected a 400
      // for a bad address. There is no such field: `test_email` appears nowhere
      // in campaignSchemas.create or in this function.
      //
      // So the request was rejected -- but by `stripUnknown` dropping the field
      // and `campaign_type` being missing, not by any email validation. The test
      // passed for a reason that has nothing to do with its name.
      //
      // What is actually worth stating is the real behaviour: unknown fields are
      // dropped rather than stored, so a caller cannot smuggle data in, and a
      // request that is otherwise complete is accepted.
      mockEvent.httpMethod = 'POST';
      mockEvent.body = JSON.stringify({
        name: 'Test Campaign',
        campaign_type: 'custom',
        test_email: 'invalid-email-format'
      });

      const response = await handler.handler(mockEvent);

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      // Dropped on the way in, so it is nowhere on the way out.
      expect(JSON.stringify(body)).not.toContain('test_email');
    });

    it('refuses a name that is only whitespace', async () => {
      // As with `test_phone` above: there is no phone field on this schema, so
      // the 400 it got was the missing `campaign_type`, not a format check.
      //
      // The rule that genuinely exists for text fields is the length bound, and
      // `min(3)` is what rejects a name of "  " after trimming. That is worth
      // asserting because it is the check a caller can actually trip.
      mockEvent.httpMethod = 'POST';
      mockEvent.body = JSON.stringify({
        name: '   ',
        campaign_type: 'custom'
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