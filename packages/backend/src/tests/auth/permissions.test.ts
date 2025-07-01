import { describe, it, expect, beforeEach } from 'bun:test';
import { 
  checkPermission, 
  hasPermission, 
  requirePermission,
  requireAdmin,
  requireRole 
} from '../../auth/permissions.js';
import { 
  createMockReq, 
  createMockRes, 
  createTestUser, 
  createTestAdmin,
  expectForbidden,
  expectSuccessResponse 
} from '../test-setup.js';

describe('Auth Permissions', () => {
  describe('checkPermission', () => {
    it('should return true for wildcard permission', () => {
      const user = { ...createTestUser(), permissions: ['*'] };
      expect(checkPermission(user, 'project', 'read')).toBe(true);
      expect(checkPermission(user, 'system', 'admin')).toBe(true);
    });

    it('should return true for exact permission match', () => {
      const user = { ...createTestUser(), permissions: ['project:read', 'project:create'] };
      expect(checkPermission(user, 'project', 'read')).toBe(true);
      expect(checkPermission(user, 'project', 'create')).toBe(true);
    });

    it('should return true for resource wildcard', () => {
      const user = { ...createTestUser(), permissions: ['project:*'] };
      expect(checkPermission(user, 'project', 'read')).toBe(true);
      expect(checkPermission(user, 'project', 'delete')).toBe(true);
    });

    it('should return true for action wildcard', () => {
      const user = { ...createTestUser(), permissions: ['*:read'] };
      expect(checkPermission(user, 'project', 'read')).toBe(true);
      expect(checkPermission(user, 'session', 'read')).toBe(true);
    });

    it('should return false for missing permission', () => {
      const user = { ...createTestUser(), permissions: ['project:read'] };
      expect(checkPermission(user, 'project', 'delete')).toBe(false);
      expect(checkPermission(user, 'system', 'read')).toBe(false);
    });

    it('should return false for empty permissions', () => {
      const user = { ...createTestUser(), permissions: [] };
      expect(checkPermission(user, 'project', 'read')).toBe(false);
    });
  });

  describe('hasPermission', () => {
    it('should return true for admin role', () => {
      const admin = createTestAdmin();
      expect(hasPermission(admin, 'project', 'read')).toBe(true);
      expect(hasPermission(admin, 'system', 'admin')).toBe(true);
    });

    it('should check permissions for non-admin users', () => {
      const user = { ...createTestUser(), permissions: ['project:read'] };
      expect(hasPermission(user, 'project', 'read')).toBe(true);
      expect(hasPermission(user, 'project', 'delete')).toBe(false);
    });
  });

  describe('requirePermission middleware', () => {
    it('should allow access with valid permission', () => {
      const user = { ...createTestUser(), permissions: ['project:read'] };
      const req = createMockReq({ user });
      const res = createMockRes();
      let nextCalled = false;
      const next = () => { nextCalled = true; };

      const middleware = requirePermission('project', 'read');
      middleware(req, res, next);

      expect(nextCalled).toBe(true);
      expect(res.statusCode).toBe(200);
    });

    it('should deny access without permission', () => {
      const user = { ...createTestUser(), permissions: ['project:read'] };
      const req = createMockReq({ user });
      const res = createMockRes();
      let nextCalled = false;
      const next = () => { nextCalled = true; };

      const middleware = requirePermission('project', 'delete');
      middleware(req, res, next);

      expect(nextCalled).toBe(false);
      expectForbidden(res);
    });

    it('should deny access without user', () => {
      const req = createMockReq({ user: null });
      const res = createMockRes();
      let nextCalled = false;
      const next = () => { nextCalled = true; };

      const middleware = requirePermission('project', 'read');
      middleware(req, res, next);

      expect(nextCalled).toBe(false);
      expectForbidden(res);
    });

    it('should allow admin access regardless of permissions', () => {
      const admin = createTestAdmin();
      const req = createMockReq({ user: admin });
      const res = createMockRes();
      let nextCalled = false;
      const next = () => { nextCalled = true; };

      const middleware = requirePermission('system', 'admin');
      middleware(req, res, next);

      expect(nextCalled).toBe(true);
    });
  });

  describe('requireAdmin middleware', () => {
    it('should allow access for admin users', () => {
      const admin = createTestAdmin();
      const req = createMockReq({ user: admin });
      const res = createMockRes();
      let nextCalled = false;
      const next = () => { nextCalled = true; };

      const middleware = requireAdmin();
      middleware(req, res, next);

      expect(nextCalled).toBe(true);
    });

    it('should deny access for non-admin users', () => {
      const user = createTestUser();
      const req = createMockReq({ user });
      const res = createMockRes();
      let nextCalled = false;
      const next = () => { nextCalled = true; };

      const middleware = requireAdmin();
      middleware(req, res, next);

      expect(nextCalled).toBe(false);
      expectForbidden(res);
    });

    it('should deny access without user', () => {
      const req = createMockReq({ user: null });
      const res = createMockRes();
      let nextCalled = false;
      const next = () => { nextCalled = true; };

      const middleware = requireAdmin();
      middleware(req, res, next);

      expect(nextCalled).toBe(false);
      expectForbidden(res);
    });
  });

  describe('requireRole middleware', () => {
    it('should allow access for matching role', () => {
      const admin = createTestAdmin();
      const req = createMockReq({ user: admin });
      const res = createMockRes();
      let nextCalled = false;
      const next = () => { nextCalled = true; };

      const middleware = requireRole('admin');
      middleware(req, res, next);

      expect(nextCalled).toBe(true);
    });

    it('should deny access for non-matching role', () => {
      const user = createTestUser();
      const req = createMockReq({ user });
      const res = createMockRes();
      let nextCalled = false;
      const next = () => { nextCalled = true; };

      const middleware = requireRole('admin');
      middleware(req, res, next);

      expect(nextCalled).toBe(false);
      expectForbidden(res);
    });

    it('should allow access for any of multiple roles', () => {
      const user = createTestUser();
      const req = createMockReq({ user });
      const res = createMockRes();
      let nextCalled = false;
      const next = () => { nextCalled = true; };

      const middleware = requireRole(['user', 'admin']);
      middleware(req, res, next);

      expect(nextCalled).toBe(true);
    });

    it('should deny access without user', () => {
      const req = createMockReq({ user: null });
      const res = createMockRes();
      let nextCalled = false;
      const next = () => { nextCalled = true; };

      const middleware = requireRole('user');
      middleware(req, res, next);

      expect(nextCalled).toBe(false);
      expectForbidden(res);
    });
  });

  describe('Permission patterns', () => {
    it('should handle complex permission patterns', () => {
      const user = {
        ...createTestUser(),
        permissions: [
          'project:*',
          'session:read',
          'session:create',
          '*:read',
          'system:monitor'
        ]
      };

      // Should allow all project actions
      expect(hasPermission(user, 'project', 'read')).toBe(true);
      expect(hasPermission(user, 'project', 'create')).toBe(true);
      expect(hasPermission(user, 'project', 'delete')).toBe(true);

      // Should allow specific session actions
      expect(hasPermission(user, 'session', 'read')).toBe(true);
      expect(hasPermission(user, 'session', 'create')).toBe(true);
      expect(hasPermission(user, 'session', 'delete')).toBe(false);

      // Should allow read action on any resource
      expect(hasPermission(user, 'container', 'read')).toBe(true);
      expect(hasPermission(user, 'logs', 'read')).toBe(true);
      expect(hasPermission(user, 'metrics', 'read')).toBe(true);

      // Should allow specific system action
      expect(hasPermission(user, 'system', 'monitor')).toBe(true);
      expect(hasPermission(user, 'system', 'admin')).toBe(false);
    });

    it('should handle edge cases in permission strings', () => {
      const user = {
        ...createTestUser(),
        permissions: ['', 'invalid', 'project:', ':read', 'project:read:extra']
      };

      // Should not grant access for malformed permissions
      expect(hasPermission(user, 'project', 'read')).toBe(false);
      expect(hasPermission(user, 'project', 'create')).toBe(false);
    });
  });

  describe('Resource-specific permissions', () => {
    it('should handle hierarchical resource permissions', () => {
      const user = {
        ...createTestUser(),
        permissions: [
          'project:read',
          'project:create',
          'session:read',
          'container:read',
          'container:update',
          'system:read'
        ]
      };

      // Project permissions
      expect(hasPermission(user, 'project', 'read')).toBe(true);
      expect(hasPermission(user, 'project', 'create')).toBe(true);
      expect(hasPermission(user, 'project', 'update')).toBe(false);
      expect(hasPermission(user, 'project', 'delete')).toBe(false);

      // Session permissions
      expect(hasPermission(user, 'session', 'read')).toBe(true);
      expect(hasPermission(user, 'session', 'create')).toBe(false);

      // Container permissions
      expect(hasPermission(user, 'container', 'read')).toBe(true);
      expect(hasPermission(user, 'container', 'update')).toBe(true);
      expect(hasPermission(user, 'container', 'delete')).toBe(false);

      // System permissions
      expect(hasPermission(user, 'system', 'read')).toBe(true);
      expect(hasPermission(user, 'system', 'admin')).toBe(false);
    });
  });
});