import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { mcpConnectionManager } from './mcp-connection-manager.js';
import {
  comprehensiveAuditLogger,
  AuditCategory,
} from '../security/audit-logger.js';
import { SecurityLevel } from '../security/types.js';

// MCP Protocol Message Types
export interface MCPMessage {
  jsonrpc: '2.0';
  id?: string | number;
  method?: string;
  params?: any;
  result?: any;
  error?: MCPError;
}

export interface MCPError {
  code: number;
  message: string;
  data?: any;
}

export interface MCPRequest extends MCPMessage {
  method: string;
  params?: any;
}

export interface MCPResponse extends MCPMessage {
  id: string | number;
  result?: any;
  error?: MCPError;
}

export interface MCPNotification extends MCPMessage {
  method: string;
  params?: any;
}

// Standard MCP Error Codes
export enum MCPErrorCode {
  PARSE_ERROR = -32700,
  INVALID_REQUEST = -32600,
  METHOD_NOT_FOUND = -32601,
  INVALID_PARAMS = -32602,
  INTERNAL_ERROR = -32603,
  SERVER_ERROR_START = -32099,
  SERVER_ERROR_END = -32000,
  // Custom error codes
  CONNECTION_ERROR = -32001,
  AUTHENTICATION_ERROR = -32002,
  AUTHORIZATION_ERROR = -32003,
  RESOURCE_NOT_FOUND = -32004,
  TOOL_EXECUTION_ERROR = -32005,
  TIMEOUT_ERROR = -32006,
}

// Message Handler Types
export interface MessageHandler {
  method: string;
  handler: (params: any, context: MessageContext) => Promise<any>;
  requiresAuth?: boolean;
  permissions?: string[];
}

export interface MessageContext {
  connectionId: string;
  userId: string;
  sessionId?: string;
  messageId: string | number;
  timestamp: Date;
}

// Built-in MCP Methods
export enum MCPMethod {
  // Initialization
  INITIALIZE = 'initialize',
  INITIALIZED = 'initialized',

  // Capabilities
  PING = 'ping',

  // Tools
  TOOLS_LIST = 'tools/list',
  TOOLS_CALL = 'tools/call',

  // Resources
  RESOURCES_LIST = 'resources/list',
  RESOURCES_READ = 'resources/read',
  RESOURCES_SUBSCRIBE = 'resources/subscribe',
  RESOURCES_UNSUBSCRIBE = 'resources/unsubscribe',

  // Prompts
  PROMPTS_LIST = 'prompts/list',
  PROMPTS_GET = 'prompts/get',

  // Logging
  LOGGING_SET_LEVEL = 'logging/setLevel',

  // Notifications
  NOTIFICATIONS_CANCELLED = 'notifications/cancelled',
  NOTIFICATIONS_PROGRESS = 'notifications/progress',
  NOTIFICATIONS_INITIALIZED = 'notifications/initialized',
  NOTIFICATIONS_TOOLS_CHANGED = 'notifications/tools/list_changed',
  NOTIFICATIONS_RESOURCES_CHANGED = 'notifications/resources/list_changed',
  NOTIFICATIONS_PROMPTS_CHANGED = 'notifications/prompts/list_changed',
}

export class MCPMessageHandler extends EventEmitter {
  private static instance: MCPMessageHandler;
  private handlers: Map<string, MessageHandler> = new Map();
  private middlewares: Array<
    (message: MCPMessage, context: MessageContext) => Promise<MCPMessage | null>
  > = [];
  private isInitialized = false;

  constructor() {
    super();
  }

  static getInstance(): MCPMessageHandler {
    if (!MCPMessageHandler.instance) {
      MCPMessageHandler.instance = new MCPMessageHandler();
    }
    return MCPMessageHandler.instance;
  }

  /**
   * Initialize the message handler with built-in handlers
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Register built-in handlers
    this.registerBuiltinHandlers();

    // Set up connection listeners
    this.setupConnectionListeners();

    this.isInitialized = true;
    this.emit('initialized');

    console.log('✅ MCP message handler initialized');
  }

  /**
   * Register a message handler
   */
  registerHandler(handler: MessageHandler): void {
    this.handlers.set(handler.method, handler);
    this.emit('handlerRegistered', handler);
  }

  /**
   * Unregister a message handler
   */
  unregisterHandler(method: string): void {
    const handler = this.handlers.get(method);
    if (handler) {
      this.handlers.delete(method);
      this.emit('handlerUnregistered', handler);
    }
  }

  /**
   * Add middleware for message processing
   */
  addMiddleware(
    middleware: (
      message: MCPMessage,
      context: MessageContext
    ) => Promise<MCPMessage | null>
  ): void {
    this.middlewares.push(middleware);
  }

  /**
   * Process an incoming MCP message
   */
  async processMessage(
    connectionId: string,
    message: MCPMessage,
    userId: string,
    sessionId?: string
  ): Promise<MCPResponse | null> {
    const context: MessageContext = {
      connectionId,
      userId,
      sessionId,
      messageId: message.id || uuidv4(),
      timestamp: new Date(),
    };

    try {
      // Apply middlewares
      let processedMessage = message;
      for (const middleware of this.middlewares) {
        const result = await middleware(processedMessage, context);
        if (result === null) {
          // Middleware rejected the message
          return null;
        }
        processedMessage = result;
      }

      // Handle different message types
      if (processedMessage.method && processedMessage.id !== undefined) {
        // Request
        return await this.handleRequest(
          processedMessage as MCPRequest,
          context
        );
      } else if (processedMessage.method && processedMessage.id === undefined) {
        // Notification
        await this.handleNotification(
          processedMessage as MCPNotification,
          context
        );
        return null;
      } else if (
        processedMessage.id !== undefined &&
        (processedMessage.result !== undefined ||
          processedMessage.error !== undefined)
      ) {
        // Response - forward to connection manager
        this.emit('response', processedMessage, context);
        return null;
      } else {
        // Invalid message
        return this.createErrorResponse(
          context.messageId,
          MCPErrorCode.INVALID_REQUEST,
          'Invalid message format'
        );
      }
    } catch (error) {
      console.error('Error processing MCP message:', error);

      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.SYSTEM_ERRORS,
        action: 'mcp_message_processing_error',
        resourceType: 'mcp_message',
        resourceId: context.messageId.toString(),
        userId: context.userId,
        sessionId: context.sessionId,
        outcome: 'failure',
        severity: SecurityLevel.MODERATE,
        details: {
          method: message.method,
          error: (error as Error).message,
        },
      });

      return this.createErrorResponse(
        context.messageId,
        MCPErrorCode.INTERNAL_ERROR,
        'Internal server error'
      );
    }
  }

  /**
   * Send a request to an MCP server
   */
  async sendRequest(
    connectionId: string,
    method: string,
    params?: any,
    userId?: string
  ): Promise<any> {
    try {
      const result = await mcpConnectionManager.sendRequest(
        connectionId,
        method,
        params
      );

      if (userId) {
        await comprehensiveAuditLogger.logAuditEvent({
          category: AuditCategory.SYSTEM_ACCESS,
          action: 'mcp_request_sent',
          resourceType: 'mcp_connection',
          resourceId: connectionId,
          userId,
          outcome: 'success',
          severity: SecurityLevel.SAFE,
          details: {
            method,
            hasParams: !!params,
          },
        });
      }

      return result;
    } catch (error) {
      if (userId) {
        await comprehensiveAuditLogger.logAuditEvent({
          category: AuditCategory.SYSTEM_ACCESS,
          action: 'mcp_request_failed',
          resourceType: 'mcp_connection',
          resourceId: connectionId,
          userId,
          outcome: 'failure',
          severity: SecurityLevel.MODERATE,
          details: {
            method,
            error: (error as Error).message,
          },
        });
      }
      throw error;
    }
  }

  /**
   * Send a notification to an MCP server
   */
  async sendNotification(
    connectionId: string,
    method: string,
    params?: any,
    userId?: string
  ): Promise<void> {
    const message: MCPNotification = {
      jsonrpc: '2.0',
      method,
      params,
    };

    // Notifications don't expect responses
    try {
      // This would send the notification through the connection manager
      // For now, we'll emit an event
      this.emit('notificationSent', {
        connectionId,
        method,
        params,
        userId,
      });

      if (userId) {
        await comprehensiveAuditLogger.logAuditEvent({
          category: AuditCategory.SYSTEM_ACCESS,
          action: 'mcp_notification_sent',
          resourceType: 'mcp_connection',
          resourceId: connectionId,
          userId,
          outcome: 'success',
          severity: SecurityLevel.SAFE,
          details: {
            method,
          },
        });
      }
    } catch (error) {
      console.error('Failed to send notification:', error);
      throw error;
    }
  }

  /**
   * Get registered handlers
   */
  getHandlers(): MessageHandler[] {
    return Array.from(this.handlers.values());
  }

  /**
   * Validate message format
   */
  validateMessage(message: any): MCPMessage | null {
    if (!message || typeof message !== 'object') {
      return null;
    }

    if (message.jsonrpc !== '2.0') {
      return null;
    }

    // Basic structure validation
    const hasMethod = typeof message.method === 'string';
    const hasId = message.id !== undefined;
    const hasResult = message.result !== undefined;
    const hasError = message.error !== undefined;

    // Valid combinations:
    // Request: method + id
    // Notification: method (no id)
    // Response: id + (result OR error)
    const isRequest = hasMethod && hasId;
    const isNotification = hasMethod && !hasId;
    const isResponse = hasId && !hasMethod && (hasResult || hasError);

    if (!isRequest && !isNotification && !isResponse) {
      return null;
    }

    return message as MCPMessage;
  }

  // Private methods

  private async handleRequest(
    request: MCPRequest,
    context: MessageContext
  ): Promise<MCPResponse> {
    const handler = this.handlers.get(request.method);

    if (!handler) {
      return this.createErrorResponse(
        context.messageId,
        MCPErrorCode.METHOD_NOT_FOUND,
        `Method not found: ${request.method}`
      );
    }

    // Check authentication if required
    if (handler.requiresAuth && !context.userId) {
      return this.createErrorResponse(
        context.messageId,
        MCPErrorCode.AUTHENTICATION_ERROR,
        'Authentication required'
      );
    }

    // Check permissions if specified
    if (handler.permissions && handler.permissions.length > 0) {
      // This would integrate with the permission system
      // For now, assume permissions are granted
    }

    try {
      const result = await handler.handler(request.params, context);

      return {
        jsonrpc: '2.0',
        id: context.messageId,
        result,
      };
    } catch (error) {
      const errorMessage = (error as Error).message;
      let errorCode = MCPErrorCode.INTERNAL_ERROR;

      // Map specific errors to MCP error codes
      if (errorMessage.includes('not found')) {
        errorCode = MCPErrorCode.RESOURCE_NOT_FOUND;
      } else if (errorMessage.includes('timeout')) {
        errorCode = MCPErrorCode.TIMEOUT_ERROR;
      } else if (errorMessage.includes('authentication')) {
        errorCode = MCPErrorCode.AUTHENTICATION_ERROR;
      } else if (errorMessage.includes('authorization')) {
        errorCode = MCPErrorCode.AUTHORIZATION_ERROR;
      }

      return this.createErrorResponse(
        context.messageId,
        errorCode,
        errorMessage
      );
    }
  }

  private async handleNotification(
    notification: MCPNotification,
    context: MessageContext
  ): Promise<void> {
    this.emit('notification', notification, context);

    // Handle specific notifications
    switch (notification.method) {
      case MCPMethod.NOTIFICATIONS_TOOLS_CHANGED:
        this.emit('toolsChanged', notification.params, context);
        break;
      case MCPMethod.NOTIFICATIONS_RESOURCES_CHANGED:
        this.emit('resourcesChanged', notification.params, context);
        break;
      case MCPMethod.NOTIFICATIONS_PROGRESS:
        this.emit('progress', notification.params, context);
        break;
      case MCPMethod.NOTIFICATIONS_CANCELLED:
        this.emit('cancelled', notification.params, context);
        break;
    }
  }

  private createErrorResponse(
    id: string | number,
    code: number,
    message: string,
    data?: any
  ): MCPResponse {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message,
        data,
      },
    };
  }

  private registerBuiltinHandlers(): void {
    // Initialize handler
    this.registerHandler({
      method: MCPMethod.INITIALIZE,
      handler: async (params, context) => {
        return {
          protocolVersion: '1.0',
          serverInfo: {
            name: 'Vibe Code MCP Server',
            version: '1.0.0',
          },
          capabilities: {
            tools: { listChanged: true },
            resources: { subscribe: true, listChanged: true },
            prompts: { listChanged: true },
            logging: {},
          },
        };
      },
    });

    // Ping handler
    this.registerHandler({
      method: MCPMethod.PING,
      handler: async (params, context) => {
        return { pong: true, timestamp: new Date().toISOString() };
      },
    });

    // Tools list handler
    this.registerHandler({
      method: MCPMethod.TOOLS_LIST,
      requiresAuth: true,
      handler: async (params, context) => {
        const connection = mcpConnectionManager.getConnection(
          context.connectionId
        );
        if (!connection) {
          throw new Error('Connection not found');
        }
        return { tools: connection.metadata.tools };
      },
    });

    // Tool call handler
    this.registerHandler({
      method: MCPMethod.TOOLS_CALL,
      requiresAuth: true,
      handler: async (params, context) => {
        const { name, arguments: args } = params;

        // This would delegate to the actual tool execution
        // For now, return a placeholder
        return {
          success: true,
          result: `Tool ${name} executed with arguments`,
          timestamp: new Date().toISOString(),
        };
      },
    });

    // Resources list handler
    this.registerHandler({
      method: MCPMethod.RESOURCES_LIST,
      requiresAuth: true,
      handler: async (params, context) => {
        const connection = mcpConnectionManager.getConnection(
          context.connectionId
        );
        if (!connection) {
          throw new Error('Connection not found');
        }
        return { resources: connection.metadata.resources };
      },
    });

    // Resource read handler
    this.registerHandler({
      method: MCPMethod.RESOURCES_READ,
      requiresAuth: true,
      handler: async (params, context) => {
        const { uri } = params;

        // This would delegate to the actual resource reading
        // For now, return a placeholder
        return {
          contents: [
            {
              uri,
              mimeType: 'text/plain',
              text: `Content of resource: ${uri}`,
            },
          ],
        };
      },
    });

    // Logging set level handler
    this.registerHandler({
      method: MCPMethod.LOGGING_SET_LEVEL,
      requiresAuth: true,
      handler: async (params, context) => {
        const { level } = params;
        console.log(`Setting log level to: ${level}`);
        return { success: true };
      },
    });
  }

  private setupConnectionListeners(): void {
    mcpConnectionManager.on('serverMessage', (connection, message) => {
      // Process messages from MCP servers
      this.processMessage(
        connection.id,
        message,
        connection.userId,
        connection.sessionId
      ).catch(error => {
        console.error('Error processing server message:', error);
      });
    });

    mcpConnectionManager.on('connected', connection => {
      // Send initialization notification
      this.sendNotification(
        connection.id,
        MCPMethod.NOTIFICATIONS_INITIALIZED,
        {},
        connection.userId
      ).catch(error => {
        console.error('Failed to send initialized notification:', error);
      });
    });
  }
}

// Export singleton instance
export const mcpMessageHandler = MCPMessageHandler.getInstance();
