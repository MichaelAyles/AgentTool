import { Router } from 'express';
import { authenticate } from '../auth/middleware.js';
import {
  requireAdmin,
  requirePermission,
  PermissionChecker,
} from '../auth/permissions.js';
import { UserRole } from '../auth/types.js';
import { Database } from '../database/index.js';

const router = Router();

// Get all available roles and their permissions
router.get(
  '/roles',
  authenticate,
  requirePermission('system', 'read'),
  async (req, res) => {
    try {
      const roles = Object.values(UserRole);
      const roleInfo = roles.map(role => ({
        role,
        permissions: PermissionChecker.getPermissionsForRole(role),
        availableActions: {
          project: PermissionChecker.getAvailableActions(role, 'project'),
          session: PermissionChecker.getAvailableActions(role, 'session'),
          adapter: PermissionChecker.getAvailableActions(role, 'adapter'),
          cli: PermissionChecker.getAvailableActions(role, 'cli'),
          git: PermissionChecker.getAvailableActions(role, 'git'),
          user: PermissionChecker.getAvailableActions(role, 'user'),
          system: PermissionChecker.getAvailableActions(role, 'system'),
          mcp: PermissionChecker.getAvailableActions(role, 'mcp'),
          dangerous: PermissionChecker.getAvailableActions(role, 'dangerous'),
        },
      }));

      res.json({
        success: true,
        data: roleInfo,
      });
    } catch (error) {
      console.error('Error fetching roles:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch roles',
      });
    }
  }
);

// Get users with their roles (admin only)
router.get('/users', authenticate, requireAdmin(), async (req, res) => {
  try {
    const db = req.app.get('database') as Database;
    const users = await db.getAllUsers();

    // Remove sensitive information
    const safeUsers = users.map(user => ({
      id: user.id,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      settings: {
        dangerousModeEnabled: user.settings?.dangerousModeEnabled || false,
      },
    }));

    res.json({
      success: true,
      data: safeUsers,
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch users',
    });
  }
});

// Update user role (admin only)
router.put(
  '/users/:userId/role',
  authenticate,
  requireAdmin(),
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { role } = req.body;
      const currentUser = req.user;

      // Validate role
      if (!Object.values(UserRole).includes(role)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid role specified',
        });
      }

      // Prevent admin from demoting themselves
      if (userId === currentUser.id && role !== UserRole.ADMIN) {
        return res.status(400).json({
          success: false,
          error: 'Cannot change your own admin role',
        });
      }

      const db = req.app.get('database') as Database;

      // Check if user exists
      const targetUser = await db.getUserById(userId);
      if (!targetUser) {
        return res.status(404).json({
          success: false,
          error: 'User not found',
        });
      }

      // Update user role
      await db.updateUserRole(userId, role);

      res.json({
        success: true,
        message: `User role updated to ${role}`,
        data: {
          userId,
          newRole: role,
          previousRole: targetUser.role,
        },
      });
    } catch (error) {
      console.error('Error updating user role:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update user role',
      });
    }
  }
);

// Check user permissions for specific resource/action
router.post('/check-permission', authenticate, async (req, res) => {
  try {
    const { resource, action, resourceId } = req.body;
    const user = req.user;

    if (!resource || !action) {
      return res.status(400).json({
        success: false,
        error: 'Resource and action are required',
      });
    }

    const db = req.app.get('database') as Database;
    let context = { own: false, enabled: false };

    if (resourceId) {
      context = await PermissionChecker.getResourceContext(
        resource,
        resourceId,
        user.id,
        db
      );
    }

    const hasPermission = PermissionChecker.hasPermission(
      user.role,
      resource,
      action,
      context
    );

    res.json({
      success: true,
      data: {
        hasPermission,
        user: {
          id: user.id,
          role: user.role,
        },
        resource,
        action,
        context,
      },
    });
  } catch (error) {
    console.error('Error checking permission:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check permission',
    });
  }
});

// Get current user's permissions summary
router.get('/my-permissions', authenticate, async (req, res) => {
  try {
    const user = req.user;
    const permissions = PermissionChecker.getPermissionsForRole(user.role);

    const resources = [
      'project',
      'session',
      'adapter',
      'cli',
      'git',
      'user',
      'system',
      'mcp',
      'dangerous',
    ];
    const availableActions = resources.reduce(
      (acc, resource) => {
        acc[resource] = PermissionChecker.getAvailableActions(
          user.role,
          resource
        );
        return acc;
      },
      {} as Record<string, string[]>
    );

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
        permissions,
        availableActions,
        capabilities: {
          canManageUsers: PermissionChecker.canManageUsers(user.role),
          canAccessSystem: PermissionChecker.canAccessSystem(user.role),
          canPerformBulkOperations: PermissionChecker.canPerformBulkOperations(
            user.role
          ),
        },
      },
    });
  } catch (error) {
    console.error('Error fetching user permissions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user permissions',
    });
  }
});

// Bulk role updates (admin only)
router.put(
  '/users/bulk-role',
  authenticate,
  requireAdmin(),
  async (req, res) => {
    try {
      const { userIds, role } = req.body;
      const currentUser = req.user;

      if (!Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'User IDs array is required',
        });
      }

      if (!Object.values(UserRole).includes(role)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid role specified',
        });
      }

      // Prevent admin from demoting themselves
      if (userIds.includes(currentUser.id) && role !== UserRole.ADMIN) {
        return res.status(400).json({
          success: false,
          error: 'Cannot change your own admin role in bulk operation',
        });
      }

      const db = req.app.get('database') as Database;
      const results = [];

      for (const userId of userIds) {
        try {
          const user = await db.getUserById(userId);
          if (user) {
            await db.updateUserRole(userId, role);
            results.push({
              userId,
              success: true,
              previousRole: user.role,
              newRole: role,
            });
          } else {
            results.push({
              userId,
              success: false,
              error: 'User not found',
            });
          }
        } catch (error) {
          results.push({
            userId,
            success: false,
            error: 'Failed to update role',
          });
        }
      }

      const successCount = results.filter(r => r.success).length;

      res.json({
        success: true,
        message: `Successfully updated ${successCount} of ${userIds.length} users`,
        data: results,
      });
    } catch (error) {
      console.error('Error in bulk role update:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to perform bulk role update',
      });
    }
  }
);

export default router;
