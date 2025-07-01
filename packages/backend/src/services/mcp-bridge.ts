import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { comprehensiveAuditLogger, AuditCategory } from '../security/audit-logger.js';
import { SecurityLevel } from '../security/types.js';

// MCP Protocol Types
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

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: any; // JSON Schema
}

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

// MCP Server Configuration
export interface MCPServerConfig {
  id: string;
  name: string;
  description?: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  workingDirectory?: string;
  timeout?: number;
  maxRestarts?: number;
  autoRestart?: boolean;
  enabled?: boolean;
  tags?: string[];
  metadata?: Record<string, any>;
}

// MCP Server Instance
export interface MCPServerInstance {
  id: string;
  config: MCPServerConfig;
  process?: ChildProcess;
  state: 'starting' | 'running' | 'stopping' | 'stopped' | 'error' | 'crashed';
  capabilities?: {
    tools?: MCPTool[];
    resources?: MCPResource[];
    prompts?: MCPPrompt[];
  };
  lastPing?: Date;
  restartCount?: number;
  startedAt?: Date;
  error?: string;
}

// MCP Request/Response handling
export interface MCPRequest {
  id: string;
  sessionId: string;
  serverId: string;
  method: string;
  params?: any;
  timestamp: Date;
  userId: string;
}

export interface MCPResponse {
  requestId: string;
  success: boolean;
  result?: any;
  error?: MCPError;
  timestamp: Date;
  executionTime: number;
}

export class MCPBridgeService extends EventEmitter {
  private static instance: MCPBridgeService;
  private servers: Map<string, MCPServerInstance> = new Map();
  private pendingRequests: Map<string, {
    resolve: (value: any) => void;
    reject: (reason: any) => void;
    timeout: NodeJS.Timeout;
    timestamp: Date;
  }> = new Map();
  private initialized = false;
  private healthCheckInterval?: NodeJS.Timeout;

  constructor() {
    super();
  }

  static getInstance(): MCPBridgeService {
    if (!MCPBridgeService.instance) {
      MCPBridgeService.instance = new MCPBridgeService();
    }
    return MCPBridgeService.instance;
  }

  /**
   * Initialize the MCP bridge service
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Load server configurations
      await this.loadServerConfigurations();
      
      // Start enabled servers
      await this.startEnabledServers();
      
      // Start health check monitoring
      this.startHealthChecking();
      
      this.initialized = true;
      this.emit('initialized');
      
      console.log('✅ MCP bridge service initialized');
    } catch (error) {
      console.error('❌ Failed to initialize MCP bridge service:', error);
      throw error;
    }
  }

  /**
   * Register a new MCP server
   */
  async registerServer(config: MCPServerConfig, userId: string): Promise<MCPServerInstance> {
    try {
      // Validate configuration
      this.validateServerConfig(config);
      
      // Create server instance
      const instance: MCPServerInstance = {
        id: config.id,
        config,
        state: 'stopped',
        restartCount: 0,
      };
      
      this.servers.set(config.id, instance);
      
      // Start server if enabled
      if (config.enabled) {
        await this.startServer(config.id, userId);
      }
      
      this.emit('serverRegistered', instance);
      
      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.SYSTEM_CHANGES,
        action: 'mcp_server_registered',
        resourceType: 'mcp_server',
        resourceId: config.id,
        userId,
        outcome: 'success',
        severity: SecurityLevel.SAFE,
        details: {
          serverName: config.name,
          command: config.command,
          enabled: config.enabled,
        },
      });
      
      return instance;
    } catch (error) {
      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.SYSTEM_CHANGES,
        action: 'mcp_server_registration_failed',
        resourceType: 'mcp_server',
        resourceId: config.id,
        userId,
        outcome: 'failure',
        severity: SecurityLevel.MODERATE,
        details: { error: (error as Error).message },
      });
      throw error;
    }
  }

  /**
   * Start an MCP server
   */
  async startServer(serverId: string, userId: string): Promise<void> {
    const instance = this.servers.get(serverId);
    if (!instance) {
      throw new Error(`Server not found: ${serverId}`);
    }

    if (instance.state === 'running' || instance.state === 'starting') {
      throw new Error(`Server ${serverId} is already running or starting`);
    }

    try {
      instance.state = 'starting';
      this.emit('serverStarting', instance);
      
      // Spawn the MCP server process
      const process = spawn(instance.config.command, instance.config.args || [], {
        env: { ...process.env, ...instance.config.env },
        cwd: instance.config.workingDirectory || process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      
      instance.process = process;
      instance.startedAt = new Date();
      
      // Set up process event handlers
      this.setupProcessHandlers(instance);
      
      // Initialize the MCP protocol handshake
      await this.initializeServer(instance);
      
      instance.state = 'running';
      this.emit('serverStarted', instance);
      
      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.SYSTEM_CHANGES,
        action: 'mcp_server_started',
        resourceType: 'mcp_server',
        resourceId: serverId,
        userId,
        outcome: 'success',
        severity: SecurityLevel.MODERATE,
        details: {
          serverName: instance.config.name,
          pid: process.pid,
        },
      });
      
    } catch (error) {
      instance.state = 'error';
      instance.error = (error as Error).message;
      this.emit('serverError', instance, error);
      
      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.SYSTEM_CHANGES,
        action: 'mcp_server_start_failed',
        resourceType: 'mcp_server',
        resourceId: serverId,
        userId,
        outcome: 'failure',
        severity: SecurityLevel.MODERATE,
        details: { error: (error as Error).message },
      });
      
      throw error;
    }
  }

  /**
   * Stop an MCP server
   */
  async stopServer(serverId: string, userId: string): Promise<void> {
    const instance = this.servers.get(serverId);
    if (!instance) {
      throw new Error(`Server not found: ${serverId}`);
    }

    if (instance.state === 'stopped' || instance.state === 'stopping') {
      return;
    }

    try {
      instance.state = 'stopping';
      this.emit('serverStopping', instance);
      
      if (instance.process) {
        // Graceful shutdown
        instance.process.kill('SIGTERM');
        
        // Force kill after timeout
        setTimeout(() => {
          if (instance.process && !instance.process.killed) {
            instance.process.kill('SIGKILL');
          }
        }, 5000);
      }
      
      instance.state = 'stopped';
      instance.process = undefined;
      this.emit('serverStopped', instance);
      
      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.SYSTEM_CHANGES,
        action: 'mcp_server_stopped',
        resourceType: 'mcp_server',
        resourceId: serverId,
        userId,
        outcome: 'success',
        severity: SecurityLevel.SAFE,
        details: {
          serverName: instance.config.name,
        },
      });
      
    } catch (error) {
      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.SYSTEM_CHANGES,
        action: 'mcp_server_stop_failed',
        resourceType: 'mcp_server',
        resourceId: serverId,
        userId,
        outcome: 'failure',
        severity: SecurityLevel.MODERATE,
        details: { error: (error as Error).message },
      });
      throw error;
    }
  }

  /**
   * Send request to MCP server
   */
  async sendRequest(request: MCPRequest): Promise<MCPResponse> {
    const instance = this.servers.get(request.serverId);
    if (!instance) {
      throw new Error(`Server not found: ${request.serverId}`);
    }

    if (instance.state !== 'running') {
      throw new Error(`Server ${request.serverId} is not running`);
    }

    if (!instance.process) {
      throw new Error(`Server ${request.serverId} has no process`);
    }

    const startTime = Date.now();
    
    try {
      // Create MCP message
      const mcpMessage: MCPMessage = {
        jsonrpc: '2.0',
        id: request.id,
        method: request.method,
        params: request.params,
      };
      
      // Send request and wait for response
      const result = await this.sendMCPMessage(instance, mcpMessage);
      
      const response: MCPResponse = {
        requestId: request.id,
        success: true,
        result,
        timestamp: new Date(),
        executionTime: Date.now() - startTime,
      };
      
      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.SYSTEM_ACCESS,
        action: 'mcp_request_executed',
        resourceType: 'mcp_server',
        resourceId: request.serverId,
        userId: request.userId,
        outcome: 'success',
        severity: SecurityLevel.SAFE,
        details: {
          method: request.method,
          executionTime: response.executionTime,
          sessionId: request.sessionId,
        },
      });
      
      return response;
      
    } catch (error) {
      const response: MCPResponse = {
        requestId: request.id,
        success: false,
        error: {
          code: -32603,
          message: (error as Error).message,
        },
        timestamp: new Date(),
        executionTime: Date.now() - startTime,
      };
      
      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.SYSTEM_ACCESS,
        action: 'mcp_request_failed',
        resourceType: 'mcp_server',
        resourceId: request.serverId,
        userId: request.userId,
        outcome: 'failure',
        severity: SecurityLevel.MODERATE,
        details: {
          method: request.method,
          error: (error as Error).message,
          sessionId: request.sessionId,
        },
      });
      
      return response;
    }
  }

  /**
   * Get server capabilities
   */
  getServerCapabilities(serverId: string): MCPServerInstance['capabilities'] | null {
    const instance = this.servers.get(serverId);
    return instance?.capabilities || null;
  }

  /**
   * Get all servers
   */
  getAllServers(): MCPServerInstance[] {
    return Array.from(this.servers.values());
  }

  /**
   * Get running servers
   */
  getRunningServers(): MCPServerInstance[] {
    return Array.from(this.servers.values()).filter(s => s.state === 'running');
  }

  /**
   * Get server by ID
   */
  getServer(serverId: string): MCPServerInstance | null {
    return this.servers.get(serverId) || null;
  }

  /**
   * Unregister a server
   */
  async unregisterServer(serverId: string, userId: string): Promise<void> {
    const instance = this.servers.get(serverId);
    if (!instance) {
      throw new Error(`Server not found: ${serverId}`);
    }

    // Stop server if running
    if (instance.state === 'running' || instance.state === 'starting') {
      await this.stopServer(serverId, userId);
    }

    // Remove from registry
    this.servers.delete(serverId);
    
    this.emit('serverUnregistered', instance);
    
    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'mcp_server_unregistered',
      resourceType: 'mcp_server',
      resourceId: serverId,
      userId,
      outcome: 'success',
      severity: SecurityLevel.SAFE,
      details: {
        serverName: instance.config.name,
      },
    });
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    // Stop health checking
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    // Stop all servers
    for (const instance of this.servers.values()) {
      if (instance.process && !instance.process.killed) {
        instance.process.kill('SIGTERM');
      }
    }
    
    // Clear pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Service shutdown'));
    }
    this.pendingRequests.clear();
  }

  // Private methods

  private async loadServerConfigurations(): Promise<void> {
    // In a real implementation, this would load from database or config files
    // For now, we'll register some example servers
    
    // File system MCP server example
    const fileSystemServer: MCPServerConfig = {
      id: 'filesystem',
      name: 'File System Server',
      description: 'Provides file system access through MCP',
      command: 'npx',
      args: ['@modelcontextprotocol/server-filesystem', '/tmp'],
      enabled: false, // Disabled by default for security
      tags: ['filesystem', 'builtin'],
    };
    
    // Git MCP server example
    const gitServer: MCPServerConfig = {
      id: 'git',
      name: 'Git Server',
      description: 'Provides git operations through MCP',
      command: 'npx',
      args: ['@modelcontextprotocol/server-git'],
      enabled: false,
      tags: ['git', 'builtin'],
    };
    
    // Store example configurations
    this.servers.set(fileSystemServer.id, {
      id: fileSystemServer.id,
      config: fileSystemServer,
      state: 'stopped',
      restartCount: 0,
    });
    
    this.servers.set(gitServer.id, {
      id: gitServer.id,
      config: gitServer,
      state: 'stopped',
      restartCount: 0,
    });
  }

  private async startEnabledServers(): Promise<void> {
    for (const instance of this.servers.values()) {
      if (instance.config.enabled) {
        try {
          await this.startServer(instance.id, 'system');
        } catch (error) {
          console.warn(`Failed to start MCP server ${instance.id}:`, (error as Error).message);
        }
      }
    }
  }

  private startHealthChecking(): void {
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, 30000); // Check every 30 seconds
  }

  private async performHealthCheck(): Promise<void> {
    for (const instance of this.servers.values()) {
      if (instance.state === 'running') {
        try {
          await this.pingServer(instance);
          instance.lastPing = new Date();
        } catch (error) {
          console.warn(`Health check failed for MCP server ${instance.id}:`, (error as Error).message);
          
          // Consider restarting if auto-restart is enabled
          if (instance.config.autoRestart && instance.restartCount! < (instance.config.maxRestarts || 3)) {
            instance.restartCount = (instance.restartCount || 0) + 1;
            try {
              await this.stopServer(instance.id, 'system');
              await this.startServer(instance.id, 'system');
            } catch (restartError) {
              console.error(`Failed to restart MCP server ${instance.id}:`, (restartError as Error).message);
            }
          }
        }
      }
    }
  }

  private async pingServer(instance: MCPServerInstance): Promise<void> {
    if (!instance.process) return;
    
    const pingMessage: MCPMessage = {
      jsonrpc: '2.0',
      id: uuidv4(),
      method: 'ping',
    };
    
    await this.sendMCPMessage(instance, pingMessage, 5000);
  }

  private setupProcessHandlers(instance: MCPServerInstance): void {
    if (!instance.process) return;
    
    const process = instance.process;
    
    process.on('close', (code) => {
      if (instance.state === 'stopping') {
        instance.state = 'stopped';
        this.emit('serverStopped', instance);
      } else {
        instance.state = 'crashed';
        instance.error = `Process exited with code ${code}`;
        this.emit('serverCrashed', instance);
      }
    });
    
    process.on('error', (error) => {
      instance.state = 'error';
      instance.error = error.message;
      this.emit('serverError', instance, error);
    });
    
    // Handle stdout/stderr for logging
    if (process.stdout) {
      process.stdout.on('data', (data) => {
        this.handleServerOutput(instance, data.toString());
      });
    }
    
    if (process.stderr) {
      process.stderr.on('data', (data) => {
        this.handleServerError(instance, data.toString());
      });
    }
  }

  private async initializeServer(instance: MCPServerInstance): Promise<void> {
    if (!instance.process) return;
    
    // Send initialize request
    const initMessage: MCPMessage = {
      jsonrpc: '2.0',
      id: uuidv4(),
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {
          roots: { listChanged: true },
          sampling: {},
        },
        clientInfo: {
          name: 'vibe-code',
          version: '1.0.0',
        },
      },
    };
    
    const response = await this.sendMCPMessage(instance, initMessage);
    
    // Store server capabilities
    instance.capabilities = response.capabilities || {};
    
    // Send initialized notification
    const initializedMessage: MCPMessage = {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    };
    
    await this.sendMCPMessage(instance, initializedMessage);
  }

  private async sendMCPMessage(instance: MCPServerInstance, message: MCPMessage, timeout = 30000): Promise<any> {
    if (!instance.process || !instance.process.stdin) {
      throw new Error('Server process not available');
    }

    return new Promise((resolve, reject) => {
      const messageId = message.id || uuidv4();
      
      // Set up timeout
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(messageId.toString());
        reject(new Error('Request timeout'));
      }, timeout);
      
      // Store pending request
      if (message.id) {
        this.pendingRequests.set(messageId.toString(), {
          resolve,
          reject,
          timeout: timeoutHandle,
          timestamp: new Date(),
        });
      }
      
      // Send message
      const messageData = JSON.stringify(message) + '\n';
      instance.process!.stdin!.write(messageData, (error) => {
        if (error) {
          this.pendingRequests.delete(messageId.toString());
          clearTimeout(timeoutHandle);
          reject(error);
        } else if (!message.id) {
          // Notification (no response expected)
          clearTimeout(timeoutHandle);
          resolve(null);
        }
      });
    });
  }

  private handleServerOutput(instance: MCPServerInstance, data: string): void {
    // Parse JSON-RPC messages
    const lines = data.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      try {
        const message: MCPMessage = JSON.parse(line);
        
        if (message.id && this.pendingRequests.has(message.id.toString())) {
          // Response to our request
          const pending = this.pendingRequests.get(message.id.toString())!;
          this.pendingRequests.delete(message.id.toString());
          clearTimeout(pending.timeout);
          
          if (message.error) {
            pending.reject(new Error(message.error.message));
          } else {
            pending.resolve(message.result);
          }
        } else if (message.method) {
          // Notification from server
          this.emit('serverNotification', instance, message);
        }
      } catch (error) {
        // Not a valid JSON-RPC message, treat as log output
        this.emit('serverLog', instance, line);
      }
    }
  }

  private handleServerError(instance: MCPServerInstance, data: string): void {
    this.emit('serverError', instance, new Error(data));
  }

  private validateServerConfig(config: MCPServerConfig): void {
    if (!config.id || !config.name || !config.command) {
      throw new Error('Server configuration must have id, name, and command');
    }
    
    if (this.servers.has(config.id)) {
      throw new Error(`Server with id ${config.id} already exists`);
    }
  }
}

// Export singleton instance
export const mcpBridge = MCPBridgeService.getInstance();