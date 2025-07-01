import { Router } from 'express';
import { authenticate } from '../auth/middleware.js';
import { requirePermission } from '../auth/permissions.js';
import {
  comprehensiveAuditLogger,
  AuditCategory,
} from '../security/audit-logger.js';
import { SecurityLevel } from '../security/types.js';
import {
  mcpDiscoveryService,
  ToolSearchQuery,
  ResourceSearchQuery,
} from '../services/mcp-discovery-service.js';

const router = Router();

/**
 * Search for MCP tools
 */
router.get(
  '/tools/search',
  authenticate,
  requirePermission('mcp', 'read'),
  async (req, res) => {
    try {
      const userId = req.user?.id || 'unknown';
      const query: ToolSearchQuery = {
        query: req.query.q as string,
        category: req.query.category as string,
        tags: req.query.tags
          ? (req.query.tags as string).split(',')
          : undefined,
        serverId: req.query.serverId as string,
        deprecated:
          req.query.deprecated === 'true'
            ? true
            : req.query.deprecated === 'false'
              ? false
              : undefined,
        experimental:
          req.query.experimental === 'true'
            ? true
            : req.query.experimental === 'false'
              ? false
              : undefined,
        limit: req.query.limit
          ? parseInt(req.query.limit as string, 10)
          : undefined,
        offset: req.query.offset
          ? parseInt(req.query.offset as string, 10)
          : undefined,
        sortBy: req.query.sortBy as any,
        sortOrder: req.query.sortOrder as any,
      };

      const results = await mcpDiscoveryService.searchTools(query, userId);

      res.json({
        success: true,
        data: results,
      });
    } catch (error) {
      console.error('Error searching tools:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to search tools',
      });
    }
  }
);

/**
 * Search for MCP resources
 */
router.get(
  '/resources/search',
  authenticate,
  requirePermission('mcp', 'read'),
  async (req, res) => {
    try {
      const userId = req.user?.id || 'unknown';
      const query: ResourceSearchQuery = {
        query: req.query.q as string,
        category: req.query.category as string,
        tags: req.query.tags
          ? (req.query.tags as string).split(',')
          : undefined,
        mimeType: req.query.mimeType as string,
        serverId: req.query.serverId as string,
        limit: req.query.limit
          ? parseInt(req.query.limit as string, 10)
          : undefined,
        offset: req.query.offset
          ? parseInt(req.query.offset as string, 10)
          : undefined,
        sortBy: req.query.sortBy as any,
        sortOrder: req.query.sortOrder as any,
      };

      const results = await mcpDiscoveryService.searchResources(query, userId);

      res.json({
        success: true,
        data: results,
      });
    } catch (error) {
      console.error('Error searching resources:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to search resources',
      });
    }
  }
);

/**
 * Get a specific tool by ID
 */
router.get(
  '/tools/:toolId',
  authenticate,
  requirePermission('mcp', 'read'),
  async (req, res) => {
    try {
      const { toolId } = req.params;
      const tool = mcpDiscoveryService.getTool(toolId);

      if (!tool) {
        return res.status(404).json({
          success: false,
          error: 'Tool not found',
        });
      }

      res.json({
        success: true,
        data: tool,
      });
    } catch (error) {
      console.error('Error getting tool:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get tool',
      });
    }
  }
);

/**
 * Get a specific resource by ID
 */
router.get(
  '/resources/:resourceId',
  authenticate,
  requirePermission('mcp', 'read'),
  async (req, res) => {
    try {
      const { resourceId } = req.params;
      const resource = mcpDiscoveryService.getResource(resourceId);

      if (!resource) {
        return res.status(404).json({
          success: false,
          error: 'Resource not found',
        });
      }

      res.json({
        success: true,
        data: resource,
      });
    } catch (error) {
      console.error('Error getting resource:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get resource',
      });
    }
  }
);

/**
 * Execute a tool
 */
router.post(
  '/tools/:toolId/execute',
  authenticate,
  requirePermission('mcp', 'execute'),
  async (req, res) => {
    try {
      const { toolId } = req.params;
      const { parameters = {} } = req.body;
      const userId = req.user?.id || 'unknown';

      const result = await mcpDiscoveryService.executeTool(
        toolId,
        parameters,
        userId
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('Error executing tool:', error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to execute tool',
      });
    }
  }
);

/**
 * Access a resource
 */
router.get(
  '/resources/:resourceId/content',
  authenticate,
  requirePermission('mcp', 'read'),
  async (req, res) => {
    try {
      const { resourceId } = req.params;
      const userId = req.user?.id || 'unknown';

      const result = await mcpDiscoveryService.accessResource(
        resourceId,
        userId
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('Error accessing resource:', error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to access resource',
      });
    }
  }
);

/**
 * Get discovery statistics
 */
router.get(
  '/stats',
  authenticate,
  requirePermission('mcp', 'read'),
  async (req, res) => {
    try {
      const stats = mcpDiscoveryService.getDiscoveryStats();

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      console.error('Error getting discovery stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get discovery statistics',
      });
    }
  }
);

/**
 * Get tool categories
 */
router.get(
  '/tools/categories',
  authenticate,
  requirePermission('mcp', 'read'),
  async (req, res) => {
    try {
      const stats = mcpDiscoveryService.getDiscoveryStats();

      res.json({
        success: true,
        data: stats.toolCategories,
      });
    } catch (error) {
      console.error('Error getting tool categories:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get tool categories',
      });
    }
  }
);

/**
 * Get resource categories
 */
router.get(
  '/resources/categories',
  authenticate,
  requirePermission('mcp', 'read'),
  async (req, res) => {
    try {
      const stats = mcpDiscoveryService.getDiscoveryStats();

      res.json({
        success: true,
        data: stats.resourceCategories,
      });
    } catch (error) {
      console.error('Error getting resource categories:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get resource categories',
      });
    }
  }
);

/**
 * Get trending tools (most used)
 */
router.get(
  '/tools/trending',
  authenticate,
  requirePermission('mcp', 'read'),
  async (req, res) => {
    try {
      const userId = req.user?.id || 'unknown';
      const limit = req.query.limit
        ? parseInt(req.query.limit as string, 10)
        : 10;

      const results = await mcpDiscoveryService.searchTools(
        {
          sortBy: 'usage',
          sortOrder: 'desc',
          limit,
        },
        userId
      );

      res.json({
        success: true,
        data: results.tools,
      });
    } catch (error) {
      console.error('Error getting trending tools:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get trending tools',
      });
    }
  }
);

/**
 * Get recently accessed resources
 */
router.get(
  '/resources/recent',
  authenticate,
  requirePermission('mcp', 'read'),
  async (req, res) => {
    try {
      const userId = req.user?.id || 'unknown';
      const limit = req.query.limit
        ? parseInt(req.query.limit as string, 10)
        : 10;

      const results = await mcpDiscoveryService.searchResources(
        {
          sortBy: 'recent',
          sortOrder: 'desc',
          limit,
        },
        userId
      );

      res.json({
        success: true,
        data: results.resources,
      });
    } catch (error) {
      console.error('Error getting recent resources:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get recent resources',
      });
    }
  }
);

/**
 * Validate tool parameters against schema
 */
router.post(
  '/tools/:toolId/validate',
  authenticate,
  requirePermission('mcp', 'read'),
  async (req, res) => {
    try {
      const { toolId } = req.params;
      const { parameters } = req.body;

      const tool = mcpDiscoveryService.getTool(toolId);
      if (!tool) {
        return res.status(404).json({
          success: false,
          error: 'Tool not found',
        });
      }

      // Basic validation against tool schema
      const validation = {
        valid: true,
        errors: [] as string[],
        warnings: [] as string[],
      };

      // Check if tool has parameter schema
      if (tool.parameters) {
        // This would use a JSON schema validator
        // For now, basic validation
        if (tool.parameters.required) {
          for (const requiredParam of tool.parameters.required) {
            if (!(requiredParam in parameters)) {
              validation.valid = false;
              validation.errors.push(
                `Missing required parameter: ${requiredParam}`
              );
            }
          }
        }
      }

      res.json({
        success: true,
        data: validation,
      });
    } catch (error) {
      console.error('Error validating tool parameters:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to validate parameters',
      });
    }
  }
);

/**
 * Get tool execution history
 */
router.get(
  '/tools/:toolId/history',
  authenticate,
  requirePermission('mcp', 'read'),
  async (req, res) => {
    try {
      const { toolId } = req.params;
      const tool = mcpDiscoveryService.getTool(toolId);

      if (!tool) {
        return res.status(404).json({
          success: false,
          error: 'Tool not found',
        });
      }

      // Return usage statistics as history placeholder
      const history = {
        executions: tool.usage.callCount,
        errors: tool.usage.errorCount,
        successRate: tool.usage.successRate,
        averageExecutionTime: tool.usage.averageExecutionTime,
        lastExecuted: tool.usage.lastCalled,
      };

      res.json({
        success: true,
        data: history,
      });
    } catch (error) {
      console.error('Error getting tool history:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get tool execution history',
      });
    }
  }
);

/**
 * Get resource access history
 */
router.get(
  '/resources/:resourceId/history',
  authenticate,
  requirePermission('mcp', 'read'),
  async (req, res) => {
    try {
      const { resourceId } = req.params;
      const resource = mcpDiscoveryService.getResource(resourceId);

      if (!resource) {
        return res.status(404).json({
          success: false,
          error: 'Resource not found',
        });
      }

      // Return access statistics as history placeholder
      const history = {
        accesses: resource.access.readCount,
        errors: resource.access.errorCount,
        successRate: resource.access.successRate,
        averageLoadTime: resource.access.averageLoadTime,
        lastAccessed: resource.access.lastAccessed,
      };

      res.json({
        success: true,
        data: history,
      });
    } catch (error) {
      console.error('Error getting resource history:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get resource access history',
      });
    }
  }
);

/**
 * Export discovery data
 */
router.get(
  '/export',
  authenticate,
  requirePermission('mcp', 'read'),
  async (req, res) => {
    try {
      const userId = req.user?.id || 'unknown';
      const { format = 'json' } = req.query;

      // Get all tools and resources for the user
      const toolResults = await mcpDiscoveryService.searchTools({}, userId);
      const resourceResults = await mcpDiscoveryService.searchResources(
        {},
        userId
      );
      const stats = mcpDiscoveryService.getDiscoveryStats();

      const exportData = {
        timestamp: new Date().toISOString(),
        format: 'vibe-code-mcp-discovery',
        version: '1.0',
        user: userId,
        data: {
          tools: toolResults.tools,
          resources: resourceResults.resources,
          statistics: stats,
        },
      };

      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="mcp-discovery-${Date.now()}.json"`
        );
        res.json(exportData);
      } else {
        res.status(400).json({
          success: false,
          error: 'Unsupported format. Only JSON is currently supported.',
        });
      }
    } catch (error) {
      console.error('Error exporting discovery data:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to export discovery data',
      });
    }
  }
);

export default router;
