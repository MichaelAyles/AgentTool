import { Router } from 'express';
import { authenticate } from '../auth/middleware.js';
import { requirePermission } from '../auth/permissions.js';
import {
  comprehensiveAuditLogger,
  AuditCategory,
} from '../security/audit-logger.js';
import { SecurityLevel } from '../security/types.js';
import {
  mcpConnectionManager,
  MCPConnectionConfig,
  MCPTransportType,
} from '../services/mcp-connection-manager.js';

const router = Router();

/**
 * Get all MCP server connections
 */
router.get(
  '/',
  authenticate,
  requirePermission('mcp', 'read'),
  async (req, res) => {
    try {
      const userId = req.user?.id || 'unknown';
      const connections = mcpConnectionManager.getConnections(userId);

      res.json({
        success: true,
        data: connections,
        metadata: {
          total: connections.length,
          connected: connections.filter(c => c.status === 'connected').length,
          disconnected: connections.filter(c => c.status === 'disconnected')
            .length,
          error: connections.filter(c => c.status === 'error').length,
        },
      });
    } catch (error) {
      console.error('Error getting MCP connections:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get MCP connections',
      });
    }
  }
);

/**
 * Get a specific MCP connection
 */
router.get(
  '/:connectionId',
  authenticate,
  requirePermission('mcp', 'read'),
  async (req, res) => {
    try {
      const { connectionId } = req.params;
      const connection = mcpConnectionManager.getConnection(connectionId);

      if (!connection) {
        return res.status(404).json({
          success: false,
          error: 'Connection not found',
        });
      }

      // Verify user owns this connection
      const userId = req.user?.id || 'unknown';
      if (connection.userId !== userId && req.user?.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Access denied',
        });
      }

      res.json({
        success: true,
        data: connection,
      });
    } catch (error) {
      console.error('Error getting MCP connection:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get MCP connection',
      });
    }
  }
);

/**
 * Connect to an MCP server
 */
router.post(
  '/connect',
  authenticate,
  requirePermission('mcp', 'connect'),
  async (req, res) => {
    try {
      const userId = req.user?.id || 'unknown';
      const config: MCPConnectionConfig = req.body;

      // Validate required fields
      if (!config.serverId || !config.name || !config.transport) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: serverId, name, transport',
        });
      }

      // Validate transport-specific requirements
      switch (config.transport) {
        case MCPTransportType.WEBSOCKET:
          if (!config.connectionInfo.url) {
            return res.status(400).json({
              success: false,
              error: 'WebSocket URL required',
            });
          }
          break;
        case MCPTransportType.STDIO:
          if (!config.connectionInfo.executable) {
            return res.status(400).json({
              success: false,
              error: 'Executable path required for stdio transport',
            });
          }
          break;
      }

      const connection = await mcpConnectionManager.connect(config, userId);

      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.SYSTEM_ACCESS,
        action: 'mcp_connection_created',
        resourceType: 'mcp_connection',
        resourceId: connection.id,
        userId,
        sessionId: req.session?.id || req.sessionID,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        outcome: 'success',
        severity: SecurityLevel.MODERATE,
        details: {
          serverId: config.serverId,
          serverName: config.name,
          transport: config.transport,
        },
      });

      res.status(201).json({
        success: true,
        data: connection,
      });
    } catch (error) {
      console.error('Error connecting to MCP server:', error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to connect to MCP server',
      });
    }
  }
);

/**
 * Disconnect from an MCP server
 */
router.post(
  '/:connectionId/disconnect',
  authenticate,
  requirePermission('mcp', 'disconnect'),
  async (req, res) => {
    try {
      const { connectionId } = req.params;
      const userId = req.user?.id || 'unknown';

      const connection = mcpConnectionManager.getConnection(connectionId);
      if (!connection) {
        return res.status(404).json({
          success: false,
          error: 'Connection not found',
        });
      }

      // Verify user owns this connection
      if (connection.userId !== userId && req.user?.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Access denied',
        });
      }

      await mcpConnectionManager.disconnect(connectionId);

      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.SYSTEM_ACCESS,
        action: 'mcp_connection_disconnected',
        resourceType: 'mcp_connection',
        resourceId: connectionId,
        userId,
        sessionId: req.session?.id || req.sessionID,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        outcome: 'success',
        severity: SecurityLevel.SAFE,
        details: {
          serverName: connection.name,
        },
      });

      res.json({
        success: true,
        message: 'Disconnected successfully',
      });
    } catch (error) {
      console.error('Error disconnecting from MCP server:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to disconnect',
      });
    }
  }
);

/**
 * Reconnect to an MCP server
 */
router.post(
  '/:connectionId/reconnect',
  authenticate,
  requirePermission('mcp', 'connect'),
  async (req, res) => {
    try {
      const { connectionId } = req.params;
      const userId = req.user?.id || 'unknown';

      const connection = mcpConnectionManager.getConnection(connectionId);
      if (!connection) {
        return res.status(404).json({
          success: false,
          error: 'Connection not found',
        });
      }

      // Verify user owns this connection
      if (connection.userId !== userId && req.user?.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Access denied',
        });
      }

      await mcpConnectionManager.reconnect(connectionId);

      res.json({
        success: true,
        message: 'Reconnect initiated',
      });
    } catch (error) {
      console.error('Error reconnecting to MCP server:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to reconnect',
      });
    }
  }
);

/**
 * Get connection health status
 */
router.get(
  '/:connectionId/health',
  authenticate,
  requirePermission('mcp', 'read'),
  async (req, res) => {
    try {
      const { connectionId } = req.params;
      const health = mcpConnectionManager.getConnectionHealth(connectionId);

      if (!health) {
        return res.status(404).json({
          success: false,
          error: 'Connection not found',
        });
      }

      res.json({
        success: true,
        data: health,
      });
    } catch (error) {
      console.error('Error getting connection health:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get connection health',
      });
    }
  }
);

/**
 * Send a request to an MCP server
 */
router.post(
  '/:connectionId/request',
  authenticate,
  requirePermission('mcp', 'execute'),
  async (req, res) => {
    try {
      const { connectionId } = req.params;
      const { method, params } = req.body;
      const userId = req.user?.id || 'unknown';

      if (!method) {
        return res.status(400).json({
          success: false,
          error: 'Method is required',
        });
      }

      const connection = mcpConnectionManager.getConnection(connectionId);
      if (!connection) {
        return res.status(404).json({
          success: false,
          error: 'Connection not found',
        });
      }

      // Verify user owns this connection
      if (connection.userId !== userId && req.user?.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Access denied',
        });
      }

      const result = await mcpConnectionManager.sendRequest(
        connectionId,
        method,
        params
      );

      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.SYSTEM_ACCESS,
        action: 'mcp_request_sent',
        resourceType: 'mcp_connection',
        resourceId: connectionId,
        userId,
        sessionId: req.session?.id || req.sessionID,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        outcome: 'success',
        severity: SecurityLevel.SAFE,
        details: {
          method,
          serverName: connection.name,
        },
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('Error sending MCP request:', error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to send request',
      });
    }
  }
);

/**
 * Get available tools from a connection
 */
router.get(
  '/:connectionId/tools',
  authenticate,
  requirePermission('mcp', 'read'),
  async (req, res) => {
    try {
      const { connectionId } = req.params;
      const connection = mcpConnectionManager.getConnection(connectionId);

      if (!connection) {
        return res.status(404).json({
          success: false,
          error: 'Connection not found',
        });
      }

      res.json({
        success: true,
        data: connection.metadata.tools,
      });
    } catch (error) {
      console.error('Error getting MCP tools:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get tools',
      });
    }
  }
);

/**
 * Get available resources from a connection
 */
router.get(
  '/:connectionId/resources',
  authenticate,
  requirePermission('mcp', 'read'),
  async (req, res) => {
    try {
      const { connectionId } = req.params;
      const connection = mcpConnectionManager.getConnection(connectionId);

      if (!connection) {
        return res.status(404).json({
          success: false,
          error: 'Connection not found',
        });
      }

      res.json({
        success: true,
        data: connection.metadata.resources,
      });
    } catch (error) {
      console.error('Error getting MCP resources:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get resources',
      });
    }
  }
);

/**
 * Update connection options
 */
router.patch(
  '/:connectionId/options',
  authenticate,
  requirePermission('mcp', 'manage'),
  async (req, res) => {
    try {
      const { connectionId } = req.params;
      const userId = req.user?.id || 'unknown';
      const updates = req.body;

      const connection = mcpConnectionManager.getConnection(connectionId);
      if (!connection) {
        return res.status(404).json({
          success: false,
          error: 'Connection not found',
        });
      }

      // Verify user owns this connection
      if (connection.userId !== userId && req.user?.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Access denied',
        });
      }

      // Update allowed options
      const allowedOptions = [
        'autoReconnect',
        'reconnectDelay',
        'maxReconnectAttempts',
        'heartbeatInterval',
        'requestTimeout',
      ];

      for (const [key, value] of Object.entries(updates)) {
        if (allowedOptions.includes(key)) {
          (connection.options as any)[key] = value;
        }
      }

      res.json({
        success: true,
        data: connection.options,
      });
    } catch (error) {
      console.error('Error updating connection options:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update connection options',
      });
    }
  }
);

/**
 * Get connection statistics
 */
router.get(
  '/:connectionId/stats',
  authenticate,
  requirePermission('mcp', 'read'),
  async (req, res) => {
    try {
      const { connectionId } = req.params;
      const connection = mcpConnectionManager.getConnection(connectionId);

      if (!connection) {
        return res.status(404).json({
          success: false,
          error: 'Connection not found',
        });
      }

      res.json({
        success: true,
        data: connection.stats,
      });
    } catch (error) {
      console.error('Error getting connection stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get connection statistics',
      });
    }
  }
);

/**
 * Test connection configuration
 */
router.post(
  '/test',
  authenticate,
  requirePermission('mcp', 'connect'),
  async (req, res) => {
    try {
      const userId = req.user?.id || 'unknown';
      const config: MCPConnectionConfig = req.body;

      // Create a temporary connection with test flag
      const testConfig = {
        ...config,
        name: `${config.name} (Test)`,
        autoConnect: false,
      };

      const connection = await mcpConnectionManager.connect(testConfig, userId);

      // Test the connection
      try {
        await mcpConnectionManager.sendRequest(connection.id, 'ping');

        // Disconnect after successful test
        await mcpConnectionManager.disconnect(connection.id);

        res.json({
          success: true,
          message: 'Connection test successful',
          data: {
            version: connection.metadata.version,
            capabilities: connection.metadata.capabilities,
            toolCount: connection.metadata.tools.length,
            resourceCount: connection.metadata.resources.length,
          },
        });
      } catch (error) {
        // Disconnect on failure
        await mcpConnectionManager.disconnect(connection.id).catch(() => {});

        throw error;
      }
    } catch (error) {
      console.error('Error testing MCP connection:', error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error ? error.message : 'Connection test failed',
      });
    }
  }
);

export default router;
