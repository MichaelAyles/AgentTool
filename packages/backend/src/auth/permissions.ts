import { UserRole, Permission, RolePermissions } from './types.js';
import { Database } from '../database/index.js';

// Define permissions for each role
export const rolePermissions: RolePermissions = {
  [UserRole.ADMIN]: [
    // Full access to everything
    { resource: '*', action: '*' },
  ],

  [UserRole.USER]: [
    // Projects
    { resource: 'project', action: 'create' },
    { resource: 'project', action: 'read', conditions: { own: true } },
    { resource: 'project', action: 'update', conditions: { own: true } },
    { resource: 'project', action: 'delete', conditions: { own: true } },
    
    // Sessions
    { resource: 'session', action: 'create', conditions: { own: true } },
    { resource: 'session', action: 'read', conditions: { own: true } },
    { resource: 'session', action: 'terminate', conditions: { own: true } },
    
    // Adapters
    { resource: 'adapter', action: 'read' },
    { resource: 'adapter', action: 'execute', conditions: { own: true } },
    
    // CLI tools
    { resource: 'cli', action: 'read' },
    { resource: 'cli', action: 'install' },
    { resource: 'cli', action: 'check' },
    
    // Git operations
    { resource: 'git', action: 'read', conditions: { own: true } },
    { resource: 'git', action: 'write', conditions: { own: true } },
    
    // User profile
    { resource: 'user', action: 'read', conditions: { own: true } },
    { resource: 'user', action: 'update', conditions: { own: true } },
    
    // System resources
    { resource: 'system', action: 'read' },
    
    // MCP servers
    { resource: 'mcp', action: 'read' },
    { resource: 'mcp', action: 'install' },
    { resource: 'mcp', action: 'configure', conditions: { own: true } },
    
    // Dangerous mode (requires explicit enablement)
    { resource: 'dangerous', action: 'execute', conditions: { enabled: true, own: true } },
  ],

  [UserRole.VIEWER]: [
    // Read-only access to own resources
    { resource: 'project', action: 'read', conditions: { own: true } },
    { resource: 'session', action: 'read', conditions: { own: true } },
    { resource: 'adapter', action: 'read' },
    { resource: 'cli', action: 'read' },
    { resource: 'git', action: 'read', conditions: { own: true } },
    { resource: 'user', action: 'read', conditions: { own: true } },
    { resource: 'system', action: 'read' },
    { resource: 'mcp', action: 'read' },
  ],
};

export class PermissionChecker {
  /**
   * Check if a user role has permission to perform an action on a resource
   */
  static hasPermission(
    role: UserRole,
    resource: string,
    action: string,
    context?: Record<string, any>
  ): boolean {
    const permissions = rolePermissions[role];
    
    for (const permission of permissions) {
      if (this.matchesPermission(permission, resource, action, context)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Check if a permission matches the requested resource and action
   */
  private static matchesPermission(
    permission: Permission,
    resource: string,
    action: string,
    context?: Record<string, any>
  ): boolean {
    // Check resource match (with wildcard support)
    if (permission.resource !== '*' && permission.resource !== resource) {
      return false;
    }

    // Check action match (with wildcard support)
    if (permission.action !== '*' && permission.action !== action) {
      return false;
    }

    // Check conditions if present
    if (permission.conditions) {
      for (const [key, value] of Object.entries(permission.conditions)) {
        if (!context || context[key] !== value) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Get all permissions for a role
   */
  static getPermissionsForRole(role: UserRole): Permission[] {
    return rolePermissions[role] || [];
  }

  /**
   * Check if a role can access a specific project
   */
  static canAccessProject(role: UserRole, projectOwnerId: string, userId: string): boolean {
    if (role === UserRole.ADMIN) {
      return true;
    }

    return this.hasPermission(role, 'project', 'read', { 
      own: projectOwnerId === userId 
    });
  }

  /**
   * Check if a role can modify a specific project
   */
  static canModifyProject(role: UserRole, projectOwnerId: string, userId: string): boolean {
    if (role === UserRole.ADMIN) {
      return true;
    }

    return this.hasPermission(role, 'project', 'update', { 
      own: projectOwnerId === userId 
    });
  }

  /**
   * Check if a role can execute dangerous commands
   */
  static canExecuteDangerous(
    role: UserRole, 
    userId: string, 
    projectOwnerId: string,
    dangerousModeEnabled: boolean
  ): boolean {
    if (role === UserRole.ADMIN) {
      return true;
    }

    return this.hasPermission(role, 'dangerous', 'execute', { 
      enabled: dangerousModeEnabled,
      own: projectOwnerId === userId 
    });
  }

  /**
   * Filter a list of resources based on permissions
   */
  static filterByPermission<T extends { userId?: string; ownerId?: string }>(
    items: T[],
    role: UserRole,
    resource: string,
    action: string,
    userId: string
  ): T[] {
    if (role === UserRole.ADMIN) {
      return items;
    }

    return items.filter(item => {
      const ownerId = item.userId || item.ownerId;
      return this.hasPermission(role, resource, action, {
        own: ownerId === userId
      });
    });
  }

  /**
   * Get available actions for a role on a specific resource
   */
  static getAvailableActions(role: UserRole, resource: string): string[] {
    const permissions = rolePermissions[role];
    const actions = new Set<string>();

    for (const permission of permissions) {
      if (permission.resource === resource || permission.resource === '*') {
        if (permission.action === '*') {
          actions.add('create');
          actions.add('read');
          actions.add('update');
          actions.add('delete');
          actions.add('execute');
        } else {
          actions.add(permission.action);
        }
      }
    }

    return Array.from(actions);
  }

  /**
   * Check if a user can manage other users (admin-only function)
   */
  static canManageUsers(role: UserRole): boolean {
    return role === UserRole.ADMIN;
  }

  /**
   * Check if a user can access system-level resources
   */
  static canAccessSystem(role: UserRole): boolean {
    return this.hasPermission(role, 'system', 'read');
  }

  /**
   * Validate role hierarchy (admins can manage all, users can't manage admins)
   */
  static canManageRole(managerRole: UserRole, targetRole: UserRole): boolean {
    if (managerRole === UserRole.ADMIN) {
      return true;
    }
    // Non-admin users cannot manage any roles
    return false;
  }

  /**
   * Check if user can perform bulk operations
   */
  static canPerformBulkOperations(role: UserRole): boolean {
    return role === UserRole.ADMIN;
  }

  /**
   * Get resource ownership context from database
   */
  static async getResourceContext(
    resourceType: string, 
    resourceId: string, 
    userId: string,
    db: Database
  ): Promise<Record<string, any>> {
    const context: Record<string, any> = {
      own: false,
      enabled: false
    };

    try {
      switch (resourceType) {
        case 'project':
          const project = await db.getProject(resourceId);
          context.own = project?.userId === userId;
          break;
        case 'session':
          const session = await db.getSession(resourceId);
          context.own = session?.userId === userId;
          break;
        case 'dangerous':
          const user = await db.getUserById(userId);
          context.enabled = user?.settings?.dangerousModeEnabled || false;
          context.own = true; // Users can only enable dangerous mode for themselves
          break;
        default:
          context.own = true; // Default to owned for unknown resources
      }
    } catch (error) {
      console.error(`Error getting resource context for ${resourceType}:${resourceId}:`, error);
    }

    return context;
  }
}

// Enhanced middleware helper for Express routes
export function requirePermission(resource: string, action: string) {
  return async (req: any, res: any, next: any) => {
    try {
      const user = req.user;
      
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Get database instance from app context
      const db = req.app.get('database') as Database;
      if (!db) {
        console.error('Database not available in request context');
        return res.status(500).json({ error: 'Internal server error' });
      }

      // Determine resource ID from common request patterns
      const resourceId = req.params.projectId || 
                        req.params.sessionId || 
                        req.params.id || 
                        req.body.id;

      // Build context from request and database
      let context: Record<string, any> = {
        own: false,
        enabled: false,
      };

      if (resourceId) {
        context = await PermissionChecker.getResourceContext(
          resource, 
          resourceId, 
          user.id, 
          db
        );
      } else if (resource === 'dangerous') {
        // For dangerous operations, check user settings
        const userData = await db.getUserById(user.id);
        context.enabled = userData?.settings?.dangerousModeEnabled || false;
        context.own = true;
      }

      // Check permissions
      if (!PermissionChecker.hasPermission(user.role, resource, action, context)) {
        return res.status(403).json({ 
          error: 'Insufficient permissions',
          required: { resource, action },
          context: context
        });
      }

      // Add permission context to request for use in handlers
      req.permissionContext = context;
      next();
    } catch (error) {
      console.error('Permission check error:', error);
      return res.status(500).json({ error: 'Permission check failed' });
    }
  };
}

// Role-based middleware helpers
export function requireAdmin() {
  return (req: any, res: any, next: any) => {
    const user = req.user;
    
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (user.role !== UserRole.ADMIN) {
      return res.status(403).json({ 
        error: 'Admin access required',
        userRole: user.role 
      });
    }

    next();
  };
}

export function requireRole(requiredRole: UserRole) {
  return (req: any, res: any, next: any) => {
    const user = req.user;
    
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Role hierarchy: Admin > User > Viewer
    const roleHierarchy = {
      [UserRole.ADMIN]: 3,
      [UserRole.USER]: 2,
      [UserRole.VIEWER]: 1
    };

    if (roleHierarchy[user.role] < roleHierarchy[requiredRole]) {
      return res.status(403).json({ 
        error: 'Insufficient role permissions',
        required: requiredRole,
        current: user.role
      });
    }

    next();
  };
}

// Ownership-based middleware
export function requireOwnership(resourceParam: string = 'id') {
  return async (req: any, res: any, next: any) => {
    try {
      const user = req.user;
      
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Admin can access anything
      if (user.role === UserRole.ADMIN) {
        return next();
      }

      const resourceId = req.params[resourceParam];
      if (!resourceId) {
        return res.status(400).json({ error: 'Resource ID required' });
      }

      // Get database instance
      const db = req.app.get('database') as Database;
      if (!db) {
        return res.status(500).json({ error: 'Database not available' });
      }

      // Check ownership based on resource type (inferred from route)
      const resourceType = req.route.path.split('/')[1]; // e.g., '/projects/:id' -> 'projects'
      const context = await PermissionChecker.getResourceContext(
        resourceType.slice(0, -1), // Remove 's' from plural
        resourceId,
        user.id,
        db
      );

      if (!context.own) {
        return res.status(403).json({ 
          error: 'Resource access denied - not owner',
          resourceId 
        });
      }

      req.permissionContext = context;
      next();
    } catch (error) {
      console.error('Ownership check error:', error);
      return res.status(500).json({ error: 'Ownership check failed' });
    }
  };
}