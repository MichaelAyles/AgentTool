import { EventEmitter } from 'events';
import { WebSocket } from 'ws';
import { spawn, ChildProcess } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import { comprehensiveAuditLogger, AuditCategory } from '../security/audit-logger.js';
import { SecurityLevel } from '../security/types.js';
import { db } from '../database/index.js';

// MCP Connection Types
export interface MCPServerConnection {
  id: string;
  serverId: string;
  name: string;
  transport: MCPTransportType;
  status: 'connecting' | 'connected' | 'disconnected' | 'error' | 'reconnecting';
  connectionInfo: {
    url?: string;
    host?: string;
    port?: number;
    executable?: string;
    args?: string[];
    env?: Record<string, string>;
  };
  metadata: {
    version: string;
    capabilities: string[];
    tools: MCPTool[];
    resources: MCPResource[];
  };
  authentication?: {
    type: 'none' | 'token' | 'oauth' | 'custom';
    credentials?: any;
  };
  options: {
    autoReconnect: boolean;
    reconnectDelay: number;
    maxReconnectAttempts: number;
    heartbeatInterval: number;
    requestTimeout: number;
  };
  stats: {
    connectedAt?: Date;
    disconnectedAt?: Date;
    lastHeartbeat?: Date;
    requestCount: number;
    errorCount: number;
    averageResponseTime: number;
  };
  userId: string;
  sessionId?: string;
}

export enum MCPTransportType {
  WEBSOCKET = 'websocket',
  STDIO = 'stdio',
  HTTP = 'http',
  IPC = 'ipc',
}

export interface MCPTool {
  name: string;
  description: string;
  parameters: any; // JSON Schema
  returns: any; // JSON Schema
}

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface MCPConnectionConfig {
  serverId: string;
  name: string;
  transport: MCPTransportType;
  connectionInfo: MCPServerConnection['connectionInfo'];
  authentication?: MCPServerConnection['authentication'];
  autoConnect?: boolean;
  options?: Partial<MCPServerConnection['options']>;
}

interface MCPMessage {
  id: string;
  jsonrpc: '2.0';
  method?: string;
  params?: any;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export class MCPConnectionManager extends EventEmitter {
  private static instance: MCPConnectionManager;
  private connections: Map<string, MCPServerConnection> = new Map();
  private websockets: Map<string, WebSocket> = new Map();
  private processes: Map<string, ChildProcess> = new Map();
  private pendingRequests: Map<string, {
    resolve: (value: any) => void;
    reject: (error: any) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();
  private heartbeatIntervals: Map<string, NodeJS.Timeout> = new Map();
  private reconnectTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private reconnectAttempts: Map<string, number> = new Map();

  constructor() {
    super();
  }

  static getInstance(): MCPConnectionManager {
    if (!MCPConnectionManager.instance) {
      MCPConnectionManager.instance = new MCPConnectionManager();
    }
    return MCPConnectionManager.instance;
  }

  /**
   * Connect to an MCP server
   */
  async connect(config: MCPConnectionConfig, userId: string): Promise<MCPServerConnection> {
    const connectionId = uuidv4();
    
    const connection: MCPServerConnection = {
      id: connectionId,
      serverId: config.serverId,
      name: config.name,
      transport: config.transport,
      status: 'connecting',
      connectionInfo: config.connectionInfo,
      metadata: {
        version: 'unknown',
        capabilities: [],
        tools: [],
        resources: [],
      },
      authentication: config.authentication,
      options: {
        autoReconnect: true,
        reconnectDelay: 5000,
        maxReconnectAttempts: 5,
        heartbeatInterval: 30000,
        requestTimeout: 30000,
        ...config.options,
      },
      stats: {
        requestCount: 0,
        errorCount: 0,
        averageResponseTime: 0,
      },
      userId,
    };

    this.connections.set(connectionId, connection);
    this.emit('connectionCreated', connection);

    try {
      await this.establishConnection(connection);
      
      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.SYSTEM_ACCESS,
        action: 'mcp_server_connected',
        resourceType: 'mcp_server',
        resourceId: connection.serverId,
        userId,
        outcome: 'success',
        severity: SecurityLevel.SAFE,
        details: {
          connectionId,
          serverName: connection.name,
          transport: connection.transport,
        },
      });

      return connection;
    } catch (error) {
      connection.status = 'error';
      this.emit('connectionError', connection, error);
      
      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.SYSTEM_ACCESS,
        action: 'mcp_server_connection_failed',
        resourceType: 'mcp_server',
        resourceId: connection.serverId,
        userId,
        outcome: 'failure',
        severity: SecurityLevel.MODERATE,
        details: {
          connectionId,
          error: (error as Error).message,
        },
      });

      throw error;
    }
  }

  /**
   * Disconnect from an MCP server
   */
  async disconnect(connectionId: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error(`Connection not found: ${connectionId}`);
    }

    // Clear intervals and timeouts
    const heartbeatInterval = this.heartbeatIntervals.get(connectionId);
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      this.heartbeatIntervals.delete(connectionId);
    }

    const reconnectTimeout = this.reconnectTimeouts.get(connectionId);
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      this.reconnectTimeouts.delete(connectionId);
    }

    // Close transport-specific connection
    await this.closeTransport(connection);

    connection.status = 'disconnected';
    connection.stats.disconnectedAt = new Date();
    
    this.emit('connectionClosed', connection);

    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_ACCESS,
      action: 'mcp_server_disconnected',
      resourceType: 'mcp_server',
      resourceId: connection.serverId,
      userId: connection.userId,
      outcome: 'success',
      severity: SecurityLevel.SAFE,
      details: {
        connectionId,
        serverName: connection.name,
      },
    });
  }

  /**
   * Get all active connections
   */
  getConnections(userId?: string): MCPServerConnection[] {
    const connections = Array.from(this.connections.values());
    
    if (userId) {
      return connections.filter(conn => conn.userId === userId);
    }
    
    return connections;
  }

  /**
   * Get a specific connection
   */
  getConnection(connectionId: string): MCPServerConnection | null {
    return this.connections.get(connectionId) || null;
  }

  /**
   * Send a request to an MCP server
   */
  async sendRequest(
    connectionId: string,
    method: string,
    params?: any
  ): Promise<any> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error(`Connection not found: ${connectionId}`);
    }

    if (connection.status !== 'connected') {
      throw new Error(`Connection not ready: ${connection.status}`);
    }

    const requestId = uuidv4();
    const message: MCPMessage = {
      id: requestId,
      jsonrpc: '2.0',
      method,
      params,
    };

    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      // Set up timeout
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Request timeout: ${method}`));
        connection.stats.errorCount++;
      }, connection.options.requestTimeout);

      this.pendingRequests.set(requestId, { resolve, reject, timeout });

      // Send message based on transport
      this.sendMessage(connection, message).catch(error => {
        clearTimeout(timeout);
        this.pendingRequests.delete(requestId);
        reject(error);
        connection.stats.errorCount++;
      });
    }).finally(() => {
      // Update stats
      const duration = Date.now() - startTime;
      connection.stats.requestCount++;
      connection.stats.averageResponseTime = 
        (connection.stats.averageResponseTime * (connection.stats.requestCount - 1) + duration) /
        connection.stats.requestCount;
    });
  }

  /**
   * Get connection health status
   */
  getConnectionHealth(connectionId: string): {
    status: MCPServerConnection['status'];
    latency: number;
    uptime: number;
    errorRate: number;
    lastHeartbeat?: Date;
  } | null {
    const connection = this.connections.get(connectionId);
    if (!connection) return null;

    const uptime = connection.stats.connectedAt
      ? Date.now() - connection.stats.connectedAt.getTime()
      : 0;

    const errorRate = connection.stats.requestCount > 0
      ? connection.stats.errorCount / connection.stats.requestCount
      : 0;

    return {
      status: connection.status,
      latency: connection.stats.averageResponseTime,
      uptime,
      errorRate,
      lastHeartbeat: connection.stats.lastHeartbeat,
    };
  }

  /**
   * Reconnect to a server
   */
  async reconnect(connectionId: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error(`Connection not found: ${connectionId}`);
    }

    connection.status = 'reconnecting';
    this.emit('reconnecting', connection);

    await this.establishConnection(connection);
  }

  // Private methods

  private async establishConnection(connection: MCPServerConnection): Promise<void> {
    switch (connection.transport) {
      case MCPTransportType.WEBSOCKET:
        await this.connectWebSocket(connection);
        break;
      case MCPTransportType.STDIO:
        await this.connectStdio(connection);
        break;
      case MCPTransportType.HTTP:
        await this.connectHttp(connection);
        break;
      case MCPTransportType.IPC:
        await this.connectIpc(connection);
        break;
      default:
        throw new Error(`Unsupported transport: ${connection.transport}`);
    }

    // Initialize connection
    await this.initializeConnection(connection);
    
    // Start heartbeat
    this.startHeartbeat(connection);
    
    connection.status = 'connected';
    connection.stats.connectedAt = new Date();
    this.emit('connected', connection);
  }

  private async connectWebSocket(connection: MCPServerConnection): Promise<void> {
    if (!connection.connectionInfo.url) {
      throw new Error('WebSocket URL required');
    }

    const ws = new WebSocket(connection.connectionInfo.url, {
      headers: this.getAuthHeaders(connection),
    });

    ws.on('open', () => {
      console.log(`WebSocket connected to ${connection.name}`);
    });

    ws.on('message', (data) => {
      this.handleMessage(connection, JSON.parse(data.toString()));
    });

    ws.on('error', (error) => {
      console.error(`WebSocket error for ${connection.name}:`, error);
      this.handleConnectionError(connection, error);
    });

    ws.on('close', () => {
      console.log(`WebSocket closed for ${connection.name}`);
      this.handleConnectionClose(connection);
    });

    this.websockets.set(connection.id, ws);
  }

  private async connectStdio(connection: MCPServerConnection): Promise<void> {
    if (!connection.connectionInfo.executable) {
      throw new Error('Executable path required for stdio transport');
    }

    const process = spawn(
      connection.connectionInfo.executable,
      connection.connectionInfo.args || [],
      {
        env: {
          ...process.env,
          ...connection.connectionInfo.env,
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );

    let buffer = '';
    
    process.stdout?.on('data', (data) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.trim()) {
          try {
            const message = JSON.parse(line);
            this.handleMessage(connection, message);
          } catch (error) {
            console.error('Failed to parse stdio message:', error);
          }
        }
      }
    });

    process.stderr?.on('data', (data) => {
      console.error(`Stdio stderr for ${connection.name}:`, data.toString());
    });

    process.on('error', (error) => {
      console.error(`Stdio process error for ${connection.name}:`, error);
      this.handleConnectionError(connection, error);
    });

    process.on('exit', (code, signal) => {
      console.log(`Stdio process exited for ${connection.name}:`, { code, signal });
      this.handleConnectionClose(connection);
    });

    this.processes.set(connection.id, process);
  }

  private async connectHttp(connection: MCPServerConnection): Promise<void> {
    // HTTP connections are stateless, no persistent connection needed
    // Requests will be made on-demand
  }

  private async connectIpc(connection: MCPServerConnection): Promise<void> {
    // IPC implementation would go here
    throw new Error('IPC transport not yet implemented');
  }

  private async initializeConnection(connection: MCPServerConnection): Promise<void> {
    try {
      // Get server info
      const info = await this.sendRequest(connection.id, 'initialize', {
        protocolVersion: '1.0',
        clientInfo: {
          name: 'Vibe Code',
          version: '1.0.0',
        },
      });

      connection.metadata.version = info.protocolVersion || '1.0';
      connection.metadata.capabilities = info.capabilities || [];

      // Get available tools
      const toolsResponse = await this.sendRequest(connection.id, 'tools/list');
      connection.metadata.tools = toolsResponse.tools || [];

      // Get available resources
      const resourcesResponse = await this.sendRequest(connection.id, 'resources/list');
      connection.metadata.resources = resourcesResponse.resources || [];

      this.emit('initialized', connection);
    } catch (error) {
      console.error('Failed to initialize connection:', error);
      throw error;
    }
  }

  private startHeartbeat(connection: MCPServerConnection): void {
    const interval = setInterval(async () => {
      if (connection.status !== 'connected') {
        clearInterval(interval);
        return;
      }

      try {
        await this.sendRequest(connection.id, 'ping');
        connection.stats.lastHeartbeat = new Date();
      } catch (error) {
        console.error(`Heartbeat failed for ${connection.name}:`, error);
        // Connection might be dead, trigger reconnect
        if (connection.options.autoReconnect) {
          this.scheduleReconnect(connection);
        }
      }
    }, connection.options.heartbeatInterval);

    this.heartbeatIntervals.set(connection.id, interval);
  }

  private async sendMessage(connection: MCPServerConnection, message: MCPMessage): Promise<void> {
    const messageStr = JSON.stringify(message);

    switch (connection.transport) {
      case MCPTransportType.WEBSOCKET:
        const ws = this.websockets.get(connection.id);
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          throw new Error('WebSocket not connected');
        }
        ws.send(messageStr);
        break;

      case MCPTransportType.STDIO:
        const process = this.processes.get(connection.id);
        if (!process || !process.stdin) {
          throw new Error('Stdio process not connected');
        }
        process.stdin.write(messageStr + '\n');
        break;

      case MCPTransportType.HTTP:
        // HTTP requests are made directly
        const response = await fetch(connection.connectionInfo.url!, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...this.getAuthHeaders(connection),
          },
          body: messageStr,
        });
        
        if (!response.ok) {
          throw new Error(`HTTP request failed: ${response.statusText}`);
        }
        
        const result = await response.json();
        this.handleMessage(connection, result);
        break;

      default:
        throw new Error(`Unsupported transport: ${connection.transport}`);
    }
  }

  private handleMessage(connection: MCPServerConnection, message: MCPMessage): void {
    // Handle response to a pending request
    if (message.id && this.pendingRequests.has(message.id)) {
      const { resolve, reject, timeout } = this.pendingRequests.get(message.id)!;
      clearTimeout(timeout);
      this.pendingRequests.delete(message.id);

      if (message.error) {
        reject(new Error(message.error.message));
      } else {
        resolve(message.result);
      }
    } 
    // Handle server-initiated messages
    else if (message.method) {
      this.emit('serverMessage', connection, message);
      
      // Handle specific server methods
      switch (message.method) {
        case 'tools/changed':
          this.handleToolsChanged(connection, message.params);
          break;
        case 'resources/changed':
          this.handleResourcesChanged(connection, message.params);
          break;
        case 'notification':
          this.emit('notification', connection, message.params);
          break;
      }
    }
  }

  private handleToolsChanged(connection: MCPServerConnection, params: any): void {
    // Update tools list
    this.sendRequest(connection.id, 'tools/list')
      .then(response => {
        connection.metadata.tools = response.tools || [];
        this.emit('toolsChanged', connection);
      })
      .catch(error => {
        console.error('Failed to update tools:', error);
      });
  }

  private handleResourcesChanged(connection: MCPServerConnection, params: any): void {
    // Update resources list
    this.sendRequest(connection.id, 'resources/list')
      .then(response => {
        connection.metadata.resources = response.resources || [];
        this.emit('resourcesChanged', connection);
      })
      .catch(error => {
        console.error('Failed to update resources:', error);
      });
  }

  private handleConnectionError(connection: MCPServerConnection, error: Error): void {
    connection.status = 'error';
    connection.stats.errorCount++;
    this.emit('error', connection, error);

    if (connection.options.autoReconnect) {
      this.scheduleReconnect(connection);
    }
  }

  private handleConnectionClose(connection: MCPServerConnection): void {
    connection.status = 'disconnected';
    connection.stats.disconnectedAt = new Date();
    this.emit('disconnected', connection);

    if (connection.options.autoReconnect) {
      this.scheduleReconnect(connection);
    }
  }

  private scheduleReconnect(connection: MCPServerConnection): void {
    const attempts = this.reconnectAttempts.get(connection.id) || 0;
    
    if (attempts >= connection.options.maxReconnectAttempts) {
      console.error(`Max reconnect attempts reached for ${connection.name}`);
      connection.status = 'error';
      return;
    }

    const delay = connection.options.reconnectDelay * Math.pow(2, attempts);
    
    console.log(`Scheduling reconnect for ${connection.name} in ${delay}ms (attempt ${attempts + 1})`);
    
    const timeout = setTimeout(() => {
      this.reconnectAttempts.set(connection.id, attempts + 1);
      this.reconnect(connection.id).catch(error => {
        console.error(`Reconnect failed for ${connection.name}:`, error);
      });
    }, delay);

    this.reconnectTimeouts.set(connection.id, timeout);
  }

  private async closeTransport(connection: MCPServerConnection): Promise<void> {
    switch (connection.transport) {
      case MCPTransportType.WEBSOCKET:
        const ws = this.websockets.get(connection.id);
        if (ws) {
          ws.close();
          this.websockets.delete(connection.id);
        }
        break;

      case MCPTransportType.STDIO:
        const process = this.processes.get(connection.id);
        if (process) {
          process.kill();
          this.processes.delete(connection.id);
        }
        break;
    }
  }

  private getAuthHeaders(connection: MCPServerConnection): Record<string, string> {
    if (!connection.authentication || connection.authentication.type === 'none') {
      return {};
    }

    switch (connection.authentication.type) {
      case 'token':
        return {
          'Authorization': `Bearer ${connection.authentication.credentials.token}`,
        };
      case 'oauth':
        return {
          'Authorization': `Bearer ${connection.authentication.credentials.accessToken}`,
        };
      default:
        return {};
    }
  }

  /**
   * Cleanup all connections
   */
  cleanup(): void {
    for (const connectionId of this.connections.keys()) {
      this.disconnect(connectionId).catch(error => {
        console.error(`Failed to disconnect ${connectionId}:`, error);
      });
    }
    
    this.connections.clear();
    this.websockets.clear();
    this.processes.clear();
    this.pendingRequests.clear();
    this.heartbeatIntervals.clear();
    this.reconnectTimeouts.clear();
    this.reconnectAttempts.clear();
  }
}

// Export singleton instance
export const mcpConnectionManager = MCPConnectionManager.getInstance();