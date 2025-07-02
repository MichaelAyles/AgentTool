import { Router } from 'express';
import { authenticate } from '../auth/middleware.js';
import { requirePermission } from '../auth/permissions.js';
import {
  comprehensiveAuditLogger,
  AuditCategory,
} from '../security/audit-logger.js';
import { SecurityLevel } from '../security/types.js';
import {
  mcpBridge,
  MCPServerConfig,
  MCPRequest,
} from '../services/mcp-bridge.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Input sanitization function
const sanitizeInput = (input: string): string => {
  if (typeof input !== 'string') return '';
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim();
};

/**
 * Get all MCP servers
 */
router.get(
  '/servers',
  authenticate,
  requirePermission('mcp', 'read'),
  async (req, res) => {
    try {
      const servers = mcpBridge.getAllServers();

      // Filter out sensitive information
      const sanitizedServers = servers.map(server => ({
        ...server,
        config: {
          ...server.config,
          env: server.config.env
            ? Object.keys(server.config.env).reduce(
                (acc, key) => {
                  acc[key] =
                    server.config.env![key].includes('KEY') ||
                    server.config.env![key].includes('TOKEN')
                      ? '[REDACTED]'
                      : server.config.env![key];
                  return acc;
                },
                {} as Record<string, string>
              )
            : undefined,
        },
      }));

      res.json({
        success: true,
        data: sanitizedServers,
      });
    } catch (error) {
      console.error('Error getting MCP servers:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get MCP servers',
      });
    }
  }
);

/**
 * Get running MCP servers
 */
router.get(
  '/servers/running',
  authenticate,
  requirePermission('mcp', 'read'),
  async (req, res) => {
    try {
      const runningServers = mcpBridge.getRunningServers();

      res.json({
        success: true,
        data: runningServers.map(server => ({
          id: server.id,
          name: server.config.name,
          description: server.config.description,
          state: server.state,
          capabilities: server.capabilities,
          startedAt: server.startedAt,
          lastPing: server.lastPing,
        })),
      });
    } catch (error) {
      console.error('Error getting running MCP servers:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get running MCP servers',
      });
    }
  }
);

/**
 * Get specific MCP server
 */
router.get(
  '/servers/:serverId',
  authenticate,
  requirePermission('mcp', 'read'),
  async (req, res) => {
    try {
      const serverId = sanitizeInput(req.params.serverId);
      const server = mcpBridge.getServer(serverId);

      if (!server) {
        return res.status(404).json({
          success: false,
          error: 'Server not found',
        });
      }

      res.json({
        success: true,
        data: server,
      });
    } catch (error) {
      console.error('Error getting MCP server:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get MCP server',
      });
    }
  }
);

/**
 * Register a new MCP server
 */
router.post(
  '/servers',
  authenticate,
  requirePermission('mcp', 'configure'),
  async (req, res) => {
    try {
      const {
        id,
        name,
        description,
        command,
        args = [],
        env = {},
        workingDirectory,
        timeout = 30000,
        maxRestarts = 3,
        autoRestart = false,
        enabled = false,
        tags = [],
        metadata = {},
      } = req.body;
      const userId = req.user?.id || 'unknown';

      if (!id || !name || !command) {
        return res.status(400).json({
          success: false,
          error: 'ID, name, and command are required',
        });
      }

      const config: MCPServerConfig = {
        id: sanitizeInput(id),
        name: sanitizeInput(name),
        description: description ? sanitizeInput(description) : undefined,
        command: sanitizeInput(command),
        args: Array.isArray(args) ? args.map(arg => sanitizeInput(arg)) : [],
        env: typeof env === 'object' ? env : {},
        workingDirectory: workingDirectory
          ? sanitizeInput(workingDirectory)
          : undefined,
        timeout,
        maxRestarts,
        autoRestart,
        enabled,
        tags: Array.isArray(tags) ? tags.map(tag => sanitizeInput(tag)) : [],
        metadata: typeof metadata === 'object' ? metadata : {},
      };

      const server = await mcpBridge.registerServer(config, userId);

      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.SYSTEM_CHANGES,
        action: 'mcp_server_registered_via_api',
        resourceType: 'mcp_server',
        resourceId: server.id,
        userId,
        sessionId: req.session?.id || req.sessionID,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        outcome: 'success',
        severity: SecurityLevel.MODERATE,
        details: {
          serverName: server.config.name,
          command: server.config.command,
          enabled: server.config.enabled,
        },
      });

      res.status(201).json({
        success: true,
        data: server,
      });
    } catch (error) {
      console.error('Error registering MCP server:', error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to register MCP server',
      });
    }
  }
);

/**
 * Start an MCP server
 */
router.post(
  '/servers/:serverId/start',
  authenticate,
  requirePermission('mcp', 'execute'),
  async (req, res) => {
    try {
      const serverId = sanitizeInput(req.params.serverId);
      const userId = req.user?.id || 'unknown';

      await mcpBridge.startServer(serverId, userId);

      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.DANGEROUS_OPERATIONS,
        action: 'mcp_server_started_via_api',
        resourceType: 'mcp_server',
        resourceId: serverId,
        userId,
        sessionId: req.session?.id || req.sessionID,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        outcome: 'success',
        severity: SecurityLevel.DANGEROUS,
        details: {
          serverId,
        },
      });

      res.json({
        success: true,
        message: 'Server started successfully',
      });
    } catch (error) {
      console.error('Error starting MCP server:', error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to start MCP server',
      });
    }
  }
);

/**
 * Stop an MCP server
 */
router.post(
  '/servers/:serverId/stop',
  authenticate,
  requirePermission('mcp', 'execute'),
  async (req, res) => {
    try {
      const serverId = sanitizeInput(req.params.serverId);
      const userId = req.user?.id || 'unknown';

      await mcpBridge.stopServer(serverId, userId);

      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.SYSTEM_CHANGES,
        action: 'mcp_server_stopped_via_api',
        resourceType: 'mcp_server',
        resourceId: serverId,
        userId,
        sessionId: req.session?.id || req.sessionID,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        outcome: 'success',
        severity: SecurityLevel.MODERATE,
        details: {
          serverId,
        },
      });

      res.json({
        success: true,
        message: 'Server stopped successfully',
      });
    } catch (error) {
      console.error('Error stopping MCP server:', error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to stop MCP server',
      });
    }
  }
);

/**
 * Unregister an MCP server
 */
router.delete(
  '/servers/:serverId',
  authenticate,
  requirePermission('mcp', 'configure'),
  async (req, res) => {
    try {
      const serverId = sanitizeInput(req.params.serverId);
      const userId = req.user?.id || 'unknown';

      await mcpBridge.unregisterServer(serverId, userId);

      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.SYSTEM_CHANGES,
        action: 'mcp_server_unregistered_via_api',
        resourceType: 'mcp_server',
        resourceId: serverId,
        userId,
        sessionId: req.session?.id || req.sessionID,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        outcome: 'success',
        severity: SecurityLevel.MODERATE,
        details: {
          serverId,
        },
      });

      res.json({
        success: true,
        message: 'Server unregistered successfully',
      });
    } catch (error) {
      console.error('Error unregistering MCP server:', error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to unregister MCP server',
      });
    }
  }
);

/**
 * Execute MCP request
 */
router.post(
  '/servers/:serverId/execute',
  authenticate,
  requirePermission('mcp', 'execute'),
  async (req, res) => {
    try {
      const serverId = sanitizeInput(req.params.serverId);
      const { method, params, sessionId } = req.body;
      const userId = req.user?.id || 'unknown';

      if (!method) {
        return res.status(400).json({
          success: false,
          error: 'Method is required',
        });
      }

      const request: MCPRequest = {
        id: uuidv4(),
        sessionId: sessionId || req.sessionID,
        serverId,
        method: sanitizeInput(method),
        params,
        timestamp: new Date(),
        userId,
      };

      const response = await mcpBridge.sendRequest(request);

      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.DANGEROUS_OPERATIONS,
        action: 'mcp_request_executed_via_api',
        resourceType: 'mcp_server',
        resourceId: serverId,
        userId,
        sessionId: req.session?.id || req.sessionID,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        outcome: response.success ? 'success' : 'failure',
        severity: SecurityLevel.DANGEROUS,
        details: {
          method: request.method,
          executionTime: response.executionTime,
          hasParams: !!params,
        },
      });

      res.json({
        success: true,
        data: response,
      });
    } catch (error) {
      console.error('Error executing MCP request:', error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to execute MCP request',
      });
    }
  }
);

/**
 * Get server capabilities
 */
router.get(
  '/servers/:serverId/capabilities',
  authenticate,
  requirePermission('mcp', 'read'),
  async (req, res) => {
    try {
      const serverId = sanitizeInput(req.params.serverId);
      const capabilities = mcpBridge.getServerCapabilities(serverId);

      if (!capabilities) {
        return res.status(404).json({
          success: false,
          error: 'Server not found or capabilities not available',
        });
      }

      res.json({
        success: true,
        data: capabilities,
      });
    } catch (error) {
      console.error('Error getting server capabilities:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get server capabilities',
      });
    }
  }
);

/**
 * List available tools from all running servers
 */
router.get(
  '/tools',
  authenticate,
  requirePermission('mcp', 'read'),
  async (req, res) => {
    try {
      const runningServers = mcpBridge.getRunningServers();
      const allTools: any[] = [];

      for (const server of runningServers) {
        if (server.capabilities?.tools) {
          for (const tool of server.capabilities.tools) {
            allTools.push({
              ...tool,
              serverId: server.id,
              serverName: server.config.name,
            });
          }
        }
      }

      res.json({
        success: true,
        data: allTools,
      });
    } catch (error) {
      console.error('Error getting MCP tools:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get MCP tools',
      });
    }
  }
);

/**
 * List available resources from all running servers
 */
router.get(
  '/resources',
  authenticate,
  requirePermission('mcp', 'read'),
  async (req, res) => {
    try {
      const runningServers = mcpBridge.getRunningServers();
      const allResources: any[] = [];

      for (const server of runningServers) {
        if (server.capabilities?.resources) {
          for (const resource of server.capabilities.resources) {
            allResources.push({
              ...resource,
              serverId: server.id,
              serverName: server.config.name,
            });
          }
        }
      }

      res.json({
        success: true,
        data: allResources,
      });
    } catch (error) {
      console.error('Error getting MCP resources:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get MCP resources',
      });
    }
  }
);

/**
 * List available prompts from all running servers
 */
router.get(
  '/prompts',
  authenticate,
  requirePermission('mcp', 'read'),
  async (req, res) => {
    try {
      const runningServers = mcpBridge.getRunningServers();
      const allPrompts: any[] = [];

      for (const server of runningServers) {
        if (server.capabilities?.prompts) {
          for (const prompt of server.capabilities.prompts) {
            allPrompts.push({
              ...prompt,
              serverId: server.id,
              serverName: server.config.name,
            });
          }
        }
      }

      res.json({
        success: true,
        data: allPrompts,
      });
    } catch (error) {
      console.error('Error getting MCP prompts:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get MCP prompts',
      });
    }
  }
);

/**
 * Get MCP system status
 */
router.get(
  '/status',
  authenticate,
  requirePermission('mcp', 'read'),
  async (req, res) => {
    try {
      const allServers = mcpBridge.getAllServers();
      const runningServers = mcpBridge.getRunningServers();

      const status = {
        totalServers: allServers.length,
        runningServers: runningServers.length,
        stoppedServers: allServers.filter(s => s.state === 'stopped').length,
        errorServers: allServers.filter(
          s => s.state === 'error' || s.state === 'crashed'
        ).length,
        servers: allServers.map(server => ({
          id: server.id,
          name: server.config.name,
          state: server.state,
          enabled: server.config.enabled,
          lastPing: server.lastPing,
          restartCount: server.restartCount,
          error: server.error,
        })),
      };

      res.json({
        success: true,
        data: status,
      });
    } catch (error) {
      console.error('Error getting MCP status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get MCP status',
      });
    }
  }
);

export default router;
