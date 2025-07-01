import { Router } from 'express';
import { authenticate } from '../auth/middleware.js';
import { requirePermission } from '../auth/permissions.js';
import { comprehensiveAuditLogger, AuditCategory } from '../security/audit-logger.js';
import { SecurityLevel } from '../security/types.js';
import {
  mcpMessageHandler,
  MCPMessage,
  MCPMethod,
  MessageHandler,
} from '../services/mcp-message-handler.js';

const router = Router();

/**
 * Send a request to an MCP server
 */
router.post('/send-request', authenticate, requirePermission('mcp', 'execute'), async (req, res) => {
  try {
    const { connectionId, method, params } = req.body;
    const userId = req.user?.id || 'unknown';

    if (!connectionId || !method) {
      return res.status(400).json({
        success: false,
        error: 'connectionId and method are required',
      });
    }

    const result = await mcpMessageHandler.sendRequest(connectionId, method, params, userId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error sending MCP request:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send request',
    });
  }
});

/**
 * Send a notification to an MCP server
 */
router.post('/send-notification', authenticate, requirePermission('mcp', 'execute'), async (req, res) => {
  try {
    const { connectionId, method, params } = req.body;
    const userId = req.user?.id || 'unknown';

    if (!connectionId || !method) {
      return res.status(400).json({
        success: false,
        error: 'connectionId and method are required',
      });
    }

    await mcpMessageHandler.sendNotification(connectionId, method, params, userId);

    res.json({
      success: true,
      message: 'Notification sent successfully',
    });
  } catch (error) {
    console.error('Error sending MCP notification:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send notification',
    });
  }
});

/**
 * Process a raw MCP message
 */
router.post('/process', authenticate, requirePermission('mcp', 'execute'), async (req, res) => {
  try {
    const { connectionId, message, sessionId } = req.body;
    const userId = req.user?.id || 'unknown';

    if (!connectionId || !message) {
      return res.status(400).json({
        success: false,
        error: 'connectionId and message are required',
      });
    }

    // Validate message format
    const validatedMessage = mcpMessageHandler.validateMessage(message);
    if (!validatedMessage) {
      return res.status(400).json({
        success: false,
        error: 'Invalid message format',
      });
    }

    const response = await mcpMessageHandler.processMessage(
      connectionId,
      validatedMessage,
      userId,
      sessionId
    );

    res.json({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error('Error processing MCP message:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process message',
    });
  }
});

/**
 * Get available message handlers
 */
router.get('/handlers', authenticate, requirePermission('mcp', 'read'), async (req, res) => {
  try {
    const handlers = mcpMessageHandler.getHandlers();
    
    const handlerInfo = handlers.map(handler => ({
      method: handler.method,
      requiresAuth: handler.requiresAuth || false,
      permissions: handler.permissions || [],
    }));

    res.json({
      success: true,
      data: handlerInfo,
    });
  } catch (error) {
    console.error('Error getting message handlers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get message handlers',
    });
  }
});

/**
 * Register a custom message handler
 */
router.post('/handlers', authenticate, requirePermission('mcp', 'manage'), async (req, res) => {
  try {
    const { method, requiresAuth = false, permissions = [] } = req.body;
    const userId = req.user?.id || 'unknown';

    if (!method) {
      return res.status(400).json({
        success: false,
        error: 'method is required',
      });
    }

    // Create a simple handler that logs the call
    const handler: MessageHandler = {
      method,
      requiresAuth,
      permissions,
      handler: async (params, context) => {
        console.log(`Custom handler ${method} called with params:`, params);
        return {
          success: true,
          method,
          params,
          timestamp: new Date().toISOString(),
          handledBy: 'custom-handler',
        };
      },
    };

    mcpMessageHandler.registerHandler(handler);

    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CONFIGURATION,
      action: 'mcp_handler_registered',
      resourceType: 'mcp_handler',
      resourceId: method,
      userId,
      sessionId: req.session?.id || req.sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: 'success',
      severity: SecurityLevel.MODERATE,
      details: {
        method,
        requiresAuth,
        permissions,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Handler registered successfully',
      data: {
        method,
        requiresAuth,
        permissions,
      },
    });
  } catch (error) {
    console.error('Error registering message handler:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to register handler',
    });
  }
});

/**
 * Unregister a message handler
 */
router.delete('/handlers/:method', authenticate, requirePermission('mcp', 'manage'), async (req, res) => {
  try {
    const { method } = req.params;
    const userId = req.user?.id || 'unknown';

    mcpMessageHandler.unregisterHandler(method);

    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CONFIGURATION,
      action: 'mcp_handler_unregistered',
      resourceType: 'mcp_handler',
      resourceId: method,
      userId,
      sessionId: req.session?.id || req.sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: 'success',
      severity: SecurityLevel.SAFE,
      details: {
        method,
      },
    });

    res.json({
      success: true,
      message: 'Handler unregistered successfully',
    });
  } catch (error) {
    console.error('Error unregistering message handler:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to unregister handler',
    });
  }
});

/**
 * Get built-in MCP methods
 */
router.get('/methods', authenticate, requirePermission('mcp', 'read'), async (req, res) => {
  try {
    const methods = Object.values(MCPMethod).map(method => ({
      method,
      description: getMethodDescription(method),
      category: getMethodCategory(method),
    }));

    res.json({
      success: true,
      data: methods,
    });
  } catch (error) {
    console.error('Error getting MCP methods:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get MCP methods',
    });
  }
});

/**
 * Validate an MCP message
 */
router.post('/validate', authenticate, requirePermission('mcp', 'read'), async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'message is required',
      });
    }

    const validatedMessage = mcpMessageHandler.validateMessage(message);
    
    if (validatedMessage) {
      res.json({
        success: true,
        valid: true,
        data: validatedMessage,
      });
    } else {
      res.json({
        success: true,
        valid: false,
        error: 'Invalid message format',
      });
    }
  } catch (error) {
    console.error('Error validating MCP message:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate message',
    });
  }
});

/**
 * Get message statistics
 */
router.get('/stats', authenticate, requirePermission('mcp', 'read'), async (req, res) => {
  try {
    // This would be implemented with actual statistics tracking
    const stats = {
      totalHandlers: mcpMessageHandler.getHandlers().length,
      builtinMethods: Object.values(MCPMethod).length,
      // These would come from actual tracking
      messagesProcessed: 0,
      requestsSuccessful: 0,
      requestsFailed: 0,
      notificationsSent: 0,
      averageResponseTime: 0,
    };

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Error getting message statistics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get message statistics',
    });
  }
});

/**
 * Test a message handler
 */
router.post('/test/:method', authenticate, requirePermission('mcp', 'execute'), async (req, res) => {
  try {
    const { method } = req.params;
    const { params = {}, connectionId } = req.body;
    const userId = req.user?.id || 'unknown';

    // Create a test message
    const testMessage: MCPMessage = {
      jsonrpc: '2.0',
      id: 'test-' + Date.now(),
      method,
      params,
    };

    const response = await mcpMessageHandler.processMessage(
      connectionId || 'test-connection',
      testMessage,
      userId,
      'test-session'
    );

    res.json({
      success: true,
      data: {
        request: testMessage,
        response,
      },
    });
  } catch (error) {
    console.error('Error testing message handler:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to test handler',
    });
  }
});

// Helper functions

function getMethodDescription(method: MCPMethod): string {
  const descriptions: Record<MCPMethod, string> = {
    [MCPMethod.INITIALIZE]: 'Initialize the MCP connection',
    [MCPMethod.INITIALIZED]: 'Confirm initialization completed',
    [MCPMethod.PING]: 'Health check ping',
    [MCPMethod.TOOLS_LIST]: 'List available tools',
    [MCPMethod.TOOLS_CALL]: 'Execute a tool',
    [MCPMethod.RESOURCES_LIST]: 'List available resources',
    [MCPMethod.RESOURCES_READ]: 'Read a resource',
    [MCPMethod.RESOURCES_SUBSCRIBE]: 'Subscribe to resource changes',
    [MCPMethod.RESOURCES_UNSUBSCRIBE]: 'Unsubscribe from resource changes',
    [MCPMethod.PROMPTS_LIST]: 'List available prompts',
    [MCPMethod.PROMPTS_GET]: 'Get a specific prompt',
    [MCPMethod.LOGGING_SET_LEVEL]: 'Set logging level',
    [MCPMethod.NOTIFICATIONS_CANCELLED]: 'Operation cancelled notification',
    [MCPMethod.NOTIFICATIONS_PROGRESS]: 'Progress update notification',
    [MCPMethod.NOTIFICATIONS_INITIALIZED]: 'Initialization completed notification',
    [MCPMethod.NOTIFICATIONS_TOOLS_CHANGED]: 'Tools list changed notification',
    [MCPMethod.NOTIFICATIONS_RESOURCES_CHANGED]: 'Resources list changed notification',
    [MCPMethod.NOTIFICATIONS_PROMPTS_CHANGED]: 'Prompts list changed notification',
  };

  return descriptions[method] || 'No description available';
}

function getMethodCategory(method: MCPMethod): string {
  if (method.startsWith('notifications/')) return 'notifications';
  if (method.startsWith('tools/')) return 'tools';
  if (method.startsWith('resources/')) return 'resources';
  if (method.startsWith('prompts/')) return 'prompts';
  if (method.startsWith('logging/')) return 'logging';
  return 'core';
}

export default router;