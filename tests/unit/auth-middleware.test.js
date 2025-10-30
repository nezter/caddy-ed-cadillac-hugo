/**
 * Unit Tests: Authentication Middleware
 * Tests JWT validation, role-based access, and permission checking
 */

const { authenticateRequest } = require('../../netlify/functions/utils/auth-middleware');
const testUtils = require('../setup');

describe('Authentication Middleware', () => {
  let mockEvent;

  beforeEach(() => {
    mockEvent = testUtils.createMockEvent();
  });

  describe('JWT Token Validation', () => {
    it('should authenticate valid JWT token', async () => {
      mockEvent.headers.Authorization = `Bearer ${testUtils.createMockJWT()}`;
      
      const result = await authenticateRequest(mockEvent);
      
      expect(result.authenticated).toBe(true);
      expect(result.user).toHaveProperty('sub');
      expect(result.user).toHaveProperty('email');
      expect(result.user).toHaveProperty('role');
    });

    it('should reject missing Authorization header', async () => {
      delete mockEvent.headers.Authorization;
      
      const result = await authenticateRequest(mockEvent);
      
      expect(result.authenticated).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error.statusCode).toBe(401);
    });

    it('should reject malformed Authorization header', async () => {
      mockEvent.headers.Authorization = 'InvalidFormat token';
      
      const result = await authenticateRequest(mockEvent);
      
      expect(result.authenticated).toBe(false);
      expect(result.error.statusCode).toBe(401);
    });

    it('should reject invalid JWT token', async () => {
      mockEvent.headers.Authorization = 'Bearer invalid.jwt.token';
      
      const result = await authenticateRequest(mockEvent);
      
      expect(result.authenticated).toBe(false);
      expect(result.error.statusCode).toBe(401);
    });

    it('should reject expired JWT token', async () => {
      const expiredToken = testUtils.createMockJWT({
        exp: Math.floor(Date.now() / 1000) - 3600 // Expired 1 hour ago
      });
      
      mockEvent.headers.Authorization = `Bearer ${expiredToken}`;
      
      const result = await authenticateRequest(mockEvent);
      
      expect(result.authenticated).toBe(false);
      expect(result.error.statusCode).toBe(401);
    });

    it('should reject JWT with invalid signature', async () => {
      const { verify } = require('jsonwebtoken');
      verify.mockImplementation(() => {
        throw new Error('invalid signature');
      });

      mockEvent.headers.Authorization = `Bearer ${testUtils.createMockJWT()}`;
      
      const result = await authenticateRequest(mockEvent);
      
      expect(result.authenticated).toBe(false);
      expect(result.error.statusCode).toBe(401);
    });
  });

  describe('Role-Based Access Control', () => {
    it('should allow access for admin role', async () => {
      const adminToken = testUtils.createMockJWT({
        role: 'admin'
      });
      
      mockEvent.headers.Authorization = `Bearer ${adminToken}`;
      
      const result = await authenticateRequest(mockEvent, {
        allowedRoles: ['admin', 'manager']
      });
      
      expect(result.authenticated).toBe(true);
    });

    it('should allow access for manager role', async () => {
      const managerToken = testUtils.createMockJWT({
        role: 'manager'
      });
      
      mockEvent.headers.Authorization = `Bearer ${managerToken}`;
      
      const result = await authenticateRequest(mockEvent, {
        allowedRoles: ['admin', 'manager']
      });
      
      expect(result.authenticated).toBe(true);
    });

    it('should deny access for unauthorized role', async () => {
      const salesRepToken = testUtils.createMockJWT({
        role: 'sales_rep'
      });
      
      mockEvent.headers.Authorization = `Bearer ${salesRepToken}`;
      
      const result = await authenticateRequest(mockEvent, {
        allowedRoles: ['admin', 'manager']
      });
      
      expect(result.authenticated).toBe(false);
      expect(result.error.statusCode).toBe(403);
    });

    it('should allow access when no roles specified', async () => {
      const anyRoleToken = testUtils.createMockJWT({
        role: 'any_role'
      });
      
      mockEvent.headers.Authorization = `Bearer ${anyRoleToken}`;
      
      const result = await authenticateRequest(mockEvent);
      
      expect(result.authenticated).toBe(true);
    });
  });

  describe('Permission-Based Access Control', () => {
    it('should allow access with required permissions', async () => {
      const tokenWithPermissions = testUtils.createMockJWT({
        permissions: ['campaigns_read', 'campaigns_write', 'analytics_read']
      });
      
      mockEvent.headers.Authorization = `Bearer ${tokenWithPermissions}`;
      
      const result = await authenticateRequest(mockEvent, {
        requiredPermissions: ['campaigns_read']
      });
      
      expect(result.authenticated).toBe(true);
    });

    it('should allow access with multiple required permissions', async () => {
      const tokenWithPermissions = testUtils.createMockJWT({
        permissions: ['campaigns_read', 'campaigns_write', 'analytics_read']
      });
      
      mockEvent.headers.Authorization = `Bearer ${tokenWithPermissions}`;
      
      const result = await authenticateRequest(mockEvent, {
        requiredPermissions: ['campaigns_read', 'campaigns_write']
      });
      
      expect(result.authenticated).toBe(true);
    });

    it('should deny access with missing permissions', async () => {
      const tokenWithLimitedPermissions = testUtils.createMockJWT({
        permissions: ['campaigns_read']
      });
      
      mockEvent.headers.Authorization = `Bearer ${tokenWithLimitedPermissions}`;
      
      const result = await authenticateRequest(mockEvent, {
        requiredPermissions: ['campaigns_write']
      });
      
      expect(result.authenticated).toBe(false);
      expect(result.error.statusCode).toBe(403);
    });

    it('should deny access with no permissions array', async () => {
      const tokenWithoutPermissions = testUtils.createMockJWT();
      delete tokenWithoutPermissions.permissions;
      
      mockEvent.headers.Authorization = `Bearer ${tokenWithoutPermissions}`;
      
      const result = await authenticateRequest(mockEvent, {
        requiredPermissions: ['campaigns_read']
      });
      
      expect(result.authenticated).toBe(false);
      expect(result.error.statusCode).toBe(403);
    });

    it('should handle permission checking with empty permissions array', async () => {
      const tokenWithEmptyPermissions = testUtils.createMockJWT({
        permissions: []
      });
      
      mockEvent.headers.Authorization = `Bearer ${tokenWithEmptyPermissions}`;
      
      const result = await authenticateRequest(mockEvent, {
        requiredPermissions: ['campaigns_read']
      });
      
      expect(result.authenticated).toBe(false);
      expect(result.error.statusCode).toBe(403);
    });
  });

  describe('Optional Authentication', () => {
    it('should pass without authentication when not required', async () => {
      const result = await authenticateRequest(mockEvent, {
        requireAuth: false
      });
      
      expect(result.authenticated).toBe(true);
      expect(result.user).toBeNull();
    });

    it('should authenticate valid token even when optional', async () => {
      mockEvent.headers.Authorization = `Bearer ${testUtils.createMockJWT()}`;
      
      const result = await authenticateRequest(mockEvent, {
        requireAuth: false
      });
      
      expect(result.authenticated).toBe(true);
      expect(result.user).not.toBeNull();
    });

    it('should ignore invalid token when authentication is optional', async () => {
      mockEvent.headers.Authorization = 'Bearer invalid.token';
      
      const result = await authenticateRequest(mockEvent, {
        requireAuth: false
      });
      
      expect(result.authenticated).toBe(true);
      expect(result.user).toBeNull();
    });
  });

  describe('Token Extraction', () => {
    it('should extract token from Authorization header', async () => {
      const token = testUtils.createMockJWT();
      mockEvent.headers.Authorization = `Bearer ${token}`;
      
      const result = await authenticateRequest(mockEvent);
      
      expect(result.authenticated).toBe(true);
    });

    it('should handle lowercase "bearer" prefix', async () => {
      const token = testUtils.createMockJWT();
      mockEvent.headers.Authorization = `bearer ${token}`;
      
      const result = await authenticateRequest(mockEvent);
      
      expect(result.authenticated).toBe(true);
    });

    it('should handle mixed case "Bearer" prefix', async () => {
      const token = testUtils.createMockJWT();
      mockEvent.headers.Authorization = `BeArEr ${token}`;
      
      const result = await authenticateRequest(mockEvent);
      
      expect(result.authenticated).toBe(true);
    });

    it('should handle extra whitespace in Authorization header', async () => {
      const token = testUtils.createMockJWT();
      mockEvent.headers.Authorization = `  Bearer   ${token}  `;
      
      const result = await authenticateRequest(mockEvent);
      
      expect(result.authenticated).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle JWT verification errors', async () => {
      const { verify } = require('jsonwebtoken');
      verify.mockImplementation(() => {
        throw new Error('Token verification failed');
      });

      mockEvent.headers.Authorization = `Bearer ${testUtils.createMockJWT()}`;
      
      const result = await authenticateRequest(mockEvent);
      
      expect(result.authenticated).toBe(false);
      expect(result.error.statusCode).toBe(401);
    });

    it('should handle malformed JWT payload', async () => {
      const { verify } = require('jsonwebtoken');
      verify.mockReturnValue('invalid-payload');

      mockEvent.headers.Authorization = `Bearer ${testUtils.createMockJWT()}`;
      
      const result = await authenticateRequest(mockEvent);
      
      expect(result.authenticated).toBe(false);
      expect(result.error.statusCode).toBe(401);
    });

    it('should handle missing user claims', async () => {
      const minimalToken = testUtils.createMockJWT();
      delete minimalToken.sub;
      delete minimalToken.email;
      
      mockEvent.headers.Authorization = `Bearer ${minimalToken}`;
      
      const result = await authenticateRequest(mockEvent);
      
      expect(result.authenticated).toBe(false);
      expect(result.error.statusCode).toBe(401);
    });
  });

  describe('User Data Extraction', () => {
    it('should extract user data from JWT payload', async () => {
      const userData = {
        sub: 'user-123',
        email: 'user@example.com',
        role: 'admin',
        permissions: ['campaigns_read', 'campaigns_write'],
        name: 'Test User',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600
      };
      
      const token = testUtils.createMockJWT(userData);
      mockEvent.headers.Authorization = `Bearer ${token}`;
      
      const result = await authenticateRequest(mockEvent);
      
      expect(result.authenticated).toBe(true);
      expect(result.user.sub).toBe(userData.sub);
      expect(result.user.email).toBe(userData.email);
      expect(result.user.role).toBe(userData.role);
      expect(result.user.permissions).toEqual(userData.permissions);
    });

    it('should handle missing optional user fields', async () => {
      const minimalUserData = {
        sub: 'user-123',
        email: 'user@example.com'
      };
      
      const token = testUtils.createMockJWT(minimalUserData);
      mockEvent.headers.Authorization = `Bearer ${token}`;
      
      const result = await authenticateRequest(mockEvent);
      
      expect(result.authenticated).toBe(true);
      expect(result.user.sub).toBe(minimalUserData.sub);
      expect(result.user.email).toBe(minimalUserData.email);
      expect(result.user.role).toBeUndefined();
      expect(result.user.permissions).toBeUndefined();
    });
  });

  describe('Security Headers', () => {
    it('should include security-related error responses', async () => {
      mockEvent.headers.Authorization = 'Bearer invalid-token';
      
      const result = await authenticateRequest(mockEvent);
      
      expect(result.authenticated).toBe(false);
      expect(result.error.body).toHaveProperty('error');
      expect(result.error.body).toHaveProperty('message');
      expect(result.error.headers).toHaveProperty('Content-Type');
    });
  });
});