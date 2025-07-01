import { Router } from 'express';
import { authenticate } from '../auth/middleware.js';
import { requirePermission } from '../auth/permissions.js';
import { comprehensiveAuditLogger, AuditCategory } from '../security/audit-logger.js';
import { SecurityLevel } from '../security/types.js';
import {
  mcpServerRegistry,
  ServerRegistrySearch,
  MCPServerDefinition,
} from '../services/mcp-server-registry.js';

const router = Router();

/**
 * Search for MCP server definitions
 */
router.get('/servers', authenticate, requirePermission('mcp', 'read'), async (req, res) => {
  try {
    const search: ServerRegistrySearch = {
      query: req.query.q as string,
      category: req.query.category as string,
      tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
      transport: req.query.transport as any,
      author: req.query.author as string,
      verified: req.query.verified === 'true' ? true : req.query.verified === 'false' ? false : undefined,
      official: req.query.official === 'true' ? true : req.query.official === 'false' ? false : undefined,
      experimental: req.query.experimental === 'true' ? true : req.query.experimental === 'false' ? false : undefined,
      featured: req.query.featured === 'true' ? true : req.query.featured === 'false' ? false : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
      sortBy: req.query.sortBy as any,
      sortOrder: req.query.sortOrder as any,
    };

    const results = await mcpServerRegistry.searchServers(search);

    res.json({
      success: true,
      data: results,
    });
  } catch (error) {
    console.error('Error searching servers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search servers',
    });
  }
});

/**
 * Get a specific server definition
 */
router.get('/servers/:serverId', authenticate, requirePermission('mcp', 'read'), async (req, res) => {
  try {
    const { serverId } = req.params;
    const serverDefinition = mcpServerRegistry.getServerDefinition(serverId);

    if (!serverDefinition) {
      return res.status(404).json({
        success: false,
        error: 'Server not found',
      });
    }

    res.json({
      success: true,
      data: serverDefinition,
    });
  } catch (error) {
    console.error('Error getting server definition:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get server definition',
    });
  }
});

/**
 * Register a new MCP server
 */
router.post('/servers', authenticate, requirePermission('mcp', 'manage'), async (req, res) => {
  try {
    const userId = req.user?.id || 'unknown';
    const serverDefinition = req.body;

    // Validate required fields
    if (!serverDefinition.name || !serverDefinition.displayName || !serverDefinition.description) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name, displayName, description',
      });
    }

    const serverId = await mcpServerRegistry.registerServer(serverDefinition, userId);

    res.status(201).json({
      success: true,
      data: { id: serverId },
      message: 'Server registered successfully',
    });
  } catch (error) {
    console.error('Error registering server:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to register server',
    });
  }
});

/**
 * Get server instances for the current user
 */
router.get('/instances', authenticate, requirePermission('mcp', 'read'), async (req, res) => {
  try {
    const userId = req.user?.id || 'unknown';
    const instances = mcpServerRegistry.getServerInstances(userId);

    res.json({
      success: true,
      data: instances,
    });
  } catch (error) {
    console.error('Error getting server instances:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get server instances',
    });
  }
});

/**
 * Create a new server instance
 */
router.post('/instances', authenticate, requirePermission('mcp', 'configure'), async (req, res) => {
  try {
    const userId = req.user?.id || 'unknown';
    const { serverId, configuration, name, autoConnect, enabled } = req.body;

    if (!serverId || !configuration) {
      return res.status(400).json({
        success: false,
        error: 'serverId and configuration are required',
      });
    }

    const instance = await mcpServerRegistry.createServerInstance(
      serverId,
      userId,
      configuration,
      { name, autoConnect, enabled }
    );

    res.status(201).json({
      success: true,
      data: instance,
    });
  } catch (error) {
    console.error('Error creating server instance:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create server instance',
    });
  }
});

/**
 * Get a specific server instance
 */
router.get('/instances/:instanceId', authenticate, requirePermission('mcp', 'read'), async (req, res) => {
  try {
    const { instanceId } = req.params;
    const userId = req.user?.id || 'unknown';
    
    const instance = mcpServerRegistry.getServerInstance(instanceId);

    if (!instance) {
      return res.status(404).json({
        success: false,
        error: 'Server instance not found',
      });
    }

    // Verify user owns this instance
    if (instance.userId !== userId && req.user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
      });
    }

    res.json({
      success: true,
      data: instance,
    });
  } catch (error) {
    console.error('Error getting server instance:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get server instance',
    });
  }
});

/**
 * Update a server instance
 */
router.put('/instances/:instanceId', authenticate, requirePermission('mcp', 'configure'), async (req, res) => {
  try {
    const { instanceId } = req.params;
    const userId = req.user?.id || 'unknown';
    const updates = req.body;

    const updatedInstance = await mcpServerRegistry.updateServerInstance(
      instanceId,
      updates,
      userId
    );

    res.json({
      success: true,
      data: updatedInstance,
    });
  } catch (error) {
    console.error('Error updating server instance:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update server instance',
    });
  }
});

/**
 * Delete a server instance
 */
router.delete('/instances/:instanceId', authenticate, requirePermission('mcp', 'configure'), async (req, res) => {
  try {
    const { instanceId } = req.params;
    const userId = req.user?.id || 'unknown';

    await mcpServerRegistry.deleteServerInstance(instanceId, userId);

    res.json({
      success: true,
      message: 'Server instance deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting server instance:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete server instance',
    });
  }
});

/**
 * Get configuration template for a server
 */
router.get('/servers/:serverId/template', authenticate, requirePermission('mcp', 'read'), async (req, res) => {
  try {
    const { serverId } = req.params;
    
    const template = mcpServerRegistry.generateConfigurationTemplate(serverId);

    res.json({
      success: true,
      data: template,
    });
  } catch (error) {
    console.error('Error getting configuration template:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get configuration template',
    });
  }
});

/**
 * Get registry statistics
 */
router.get('/stats', authenticate, requirePermission('mcp', 'read'), async (req, res) => {
  try {
    const stats = mcpServerRegistry.getRegistryStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Error getting registry stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get registry statistics',
    });
  }
});

/**
 * Get server categories
 */
router.get('/categories', authenticate, requirePermission('mcp', 'read'), async (req, res) => {
  try {
    const categories = [
      { id: 'ai', name: 'AI & Machine Learning', description: 'AI-powered tools and services' },
      { id: 'productivity', name: 'Productivity', description: 'Tools to enhance productivity' },
      { id: 'development', name: 'Development', description: 'Software development tools' },
      { id: 'data', name: 'Data & Analytics', description: 'Data processing and analytics' },
      { id: 'system', name: 'System', description: 'System utilities and tools' },
      { id: 'utility', name: 'Utilities', description: 'General-purpose utilities' },
      { id: 'custom', name: 'Custom', description: 'Custom or specialized servers' },
    ];

    res.json({
      success: true,
      data: categories,
    });
  } catch (error) {
    console.error('Error getting categories:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get categories',
    });
  }
});

/**
 * Get featured servers
 */
router.get('/featured', authenticate, requirePermission('mcp', 'read'), async (req, res) => {
  try {
    const results = await mcpServerRegistry.searchServers({
      featured: true,
      limit: 10,
      sortBy: 'downloads',
      sortOrder: 'desc',
    });

    res.json({
      success: true,
      data: results.servers,
    });
  } catch (error) {
    console.error('Error getting featured servers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get featured servers',
    });
  }
});

/**
 * Get popular servers
 */
router.get('/popular', authenticate, requirePermission('mcp', 'read'), async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
    
    const results = await mcpServerRegistry.searchServers({
      limit: Math.min(limit, 50),
      sortBy: 'downloads',
      sortOrder: 'desc',
    });

    res.json({
      success: true,
      data: results.servers,
    });
  } catch (error) {
    console.error('Error getting popular servers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get popular servers',
    });
  }
});

/**
 * Get recent servers
 */
router.get('/recent', authenticate, requirePermission('mcp', 'read'), async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
    
    const results = await mcpServerRegistry.searchServers({
      limit: Math.min(limit, 50),
      sortBy: 'created',
      sortOrder: 'desc',
    });

    res.json({
      success: true,
      data: results.servers,
    });
  } catch (error) {
    console.error('Error getting recent servers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get recent servers',
    });
  }
});

/**
 * Validate server configuration
 */
router.post('/servers/:serverId/validate', authenticate, requirePermission('mcp', 'read'), async (req, res) => {
  try {
    const { serverId } = req.params;
    const { configuration } = req.body;

    const serverDefinition = mcpServerRegistry.getServerDefinition(serverId);
    if (!serverDefinition) {
      return res.status(404).json({
        success: false,
        error: 'Server not found',
      });
    }

    // Basic validation
    const validation = {
      valid: true,
      errors: [] as string[],
      warnings: [] as string[],
    };

    // Check required fields
    for (const field of serverDefinition.configuration.required) {
      if (!(field in configuration)) {
        validation.valid = false;
        validation.errors.push(`Missing required field: ${field}`);
      }
    }

    // Check for unknown fields
    const allowedFields = Object.keys(serverDefinition.configuration.schema.properties || {});
    for (const field of Object.keys(configuration)) {
      if (!allowedFields.includes(field)) {
        validation.warnings.push(`Unknown field: ${field}`);
      }
    }

    res.json({
      success: true,
      data: validation,
    });
  } catch (error) {
    console.error('Error validating configuration:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate configuration',
    });
  }
});

/**
 * Export registry data
 */
router.get('/export', authenticate, requirePermission('mcp', 'read'), async (req, res) => {
  try {
    const userId = req.user?.id || 'unknown';
    const { format = 'json', includeInstances = 'true' } = req.query;

    // Get all servers
    const serverResults = await mcpServerRegistry.searchServers({});
    
    const exportData: any = {
      timestamp: new Date().toISOString(),
      format: 'vibe-code-mcp-registry',
      version: '1.0',
      user: userId,
      data: {
        servers: serverResults.servers,
        statistics: mcpServerRegistry.getRegistryStats(),
      },
    };

    // Include user instances if requested
    if (includeInstances === 'true') {
      exportData.data.instances = mcpServerRegistry.getServerInstances(userId);
    }

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="mcp-registry-${Date.now()}.json"`);
      res.json(exportData);
    } else {
      res.status(400).json({
        success: false,
        error: 'Unsupported format. Only JSON is currently supported.',
      });
    }
  } catch (error) {
    console.error('Error exporting registry data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export registry data',
    });
  }
});

export default router;