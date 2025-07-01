# MCP Server Integration Specification

## Overview

This document defines the architecture for integrating Model Context Protocol (MCP) servers into Vibe Code, enabling extensible AI tooling capabilities.

## MCP Architecture

### MCP Bridge Service

```typescript
export class MCPBridge {
  private servers = new Map<string, MCPServerConnection>();
  private messageQueue = new Map<string, MessageQueue>();

  async connectServer(config: MCPServerConfig): Promise<void> {
    const connection = await this.createConnection(config);
    await this.handshake(connection);

    this.servers.set(config.name, connection);
    this.setupMessageHandling(connection);

    this.emit('server:connected', config.name);
  }

  async forwardMessage(
    serverName: string,
    message: MCPMessage
  ): Promise<MCPResponse> {
    const server = this.servers.get(serverName);
    if (!server) {
      throw new Error(`MCP server ${serverName} not found`);
    }

    return await this.sendMessage(server, message);
  }

  private async createConnection(
    config: MCPServerConfig
  ): Promise<MCPServerConnection> {
    switch (config.transport) {
      case 'stdio':
        return new StdioMCPConnection(config);
      case 'websocket':
        return new WebSocketMCPConnection(config);
      case 'tcp':
        return new TCPMCPConnection(config);
      default:
        throw new Error(`Unsupported transport: ${config.transport}`);
    }
  }
}
```

### MCP Server Connection Types

```typescript
interface MCPServerConnection {
  id: string;
  name: string;
  transport: MCPTransport;
  status: ConnectionStatus;
  capabilities: MCPCapabilities;

  send(message: MCPMessage): Promise<MCPResponse>;
  close(): Promise<void>;

  on(event: string, listener: Function): void;
}

// Stdio connection for local MCP servers
export class StdioMCPConnection implements MCPServerConnection {
  private process: ChildProcess;
  private messageId = 0;
  private pendingMessages = new Map<number, PendingMessage>();

  constructor(private config: MCPServerConfig) {}

  async connect(): Promise<void> {
    this.process = spawn(this.config.command, this.config.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: this.config.environment,
    });

    this.process.stdout?.on('data', data => {
      this.handleMessage(data);
    });

    this.process.stderr?.on('data', data => {
      this.handleError(data);
    });
  }

  async send(message: MCPMessage): Promise<MCPResponse> {
    const id = ++this.messageId;
    const request = { ...message, id };

    return new Promise((resolve, reject) => {
      this.pendingMessages.set(id, { resolve, reject, timestamp: Date.now() });

      this.process.stdin?.write(JSON.stringify(request) + '\n');

      // Timeout handling
      setTimeout(() => {
        if (this.pendingMessages.has(id)) {
          this.pendingMessages.delete(id);
          reject(new Error('MCP request timeout'));
        }
      }, this.config.timeout || 30000);
    });
  }
}

// WebSocket connection for remote MCP servers
export class WebSocketMCPConnection implements MCPServerConnection {
  private ws: WebSocket;
  private messageId = 0;
  private pendingMessages = new Map<number, PendingMessage>();

  async connect(): Promise<void> {
    this.ws = new WebSocket(this.config.url);

    this.ws.on('open', () => {
      this.emit('connected');
    });

    this.ws.on('message', data => {
      this.handleMessage(data);
    });

    this.ws.on('error', error => {
      this.emit('error', error);
    });
  }
}
```

## MCP Protocol Implementation

### Message Types

```typescript
interface MCPMessage {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
  id?: number;
}

interface MCPResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: MCPError;
}

interface MCPError {
  code: number;
  message: string;
  data?: unknown;
}

// Standard MCP methods
enum MCPMethod {
  INITIALIZE = 'initialize',
  LIST_TOOLS = 'tools/list',
  CALL_TOOL = 'tools/call',
  LIST_RESOURCES = 'resources/list',
  READ_RESOURCE = 'resources/read',
  LIST_PROMPTS = 'prompts/list',
  GET_PROMPT = 'prompts/get',
}
```

### Tool Integration

```typescript
export class MCPToolManager {
  private tools = new Map<string, MCPTool>();

  async discoverTools(): Promise<void> {
    for (const [serverName, server] of this.mcpBridge.servers) {
      const response = await server.send({
        jsonrpc: '2.0',
        method: MCPMethod.LIST_TOOLS,
      });

      if (response.result?.tools) {
        for (const tool of response.result.tools) {
          const mcpTool = new MCPTool(serverName, tool);
          this.tools.set(`${serverName}:${tool.name}`, mcpTool);
        }
      }
    }
  }

  async executeTool(
    toolName: string,
    parameters: Record<string, unknown>
  ): Promise<ToolResult> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new Error(`Tool ${toolName} not found`);
    }

    const response = await this.mcpBridge.forwardMessage(tool.serverName, {
      jsonrpc: '2.0',
      method: MCPMethod.CALL_TOOL,
      params: {
        name: tool.name,
        arguments: parameters,
      },
    });

    return response.result as ToolResult;
  }
}

class MCPTool {
  constructor(
    public readonly serverName: string,
    public readonly definition: ToolDefinition
  ) {}

  get name(): string {
    return this.definition.name;
  }

  get description(): string {
    return this.definition.description;
  }

  get inputSchema(): JSONSchema {
    return this.definition.inputSchema;
  }
}
```

### Resource Management

```typescript
export class MCPResourceManager {
  private resources = new Map<string, MCPResource>();

  async discoverResources(): Promise<void> {
    for (const [serverName, server] of this.mcpBridge.servers) {
      const response = await server.send({
        jsonrpc: '2.0',
        method: MCPMethod.LIST_RESOURCES,
      });

      if (response.result?.resources) {
        for (const resource of response.result.resources) {
          const mcpResource = new MCPResource(serverName, resource);
          this.resources.set(resource.uri, mcpResource);
        }
      }
    }
  }

  async readResource(uri: string): Promise<ResourceContent> {
    const resource = this.resources.get(uri);
    if (!resource) {
      throw new Error(`Resource ${uri} not found`);
    }

    const response = await this.mcpBridge.forwardMessage(resource.serverName, {
      jsonrpc: '2.0',
      method: MCPMethod.READ_RESOURCE,
      params: { uri },
    });

    return response.result as ResourceContent;
  }
}
```

## MCP Server Registry

### Server Discovery & Registration

```typescript
export class MCPServerRegistry {
  private servers = new Map<string, MCPServerConfig>();
  private instances = new Map<string, MCPServerConnection>();

  async registerServer(config: MCPServerConfig): Promise<void> {
    // Validate configuration
    await this.validateConfig(config);

    // Store configuration
    this.servers.set(config.name, config);

    // Auto-connect if enabled
    if (config.autoConnect) {
      await this.connectServer(config.name);
    }

    this.emit('server:registered', config.name);
  }

  async autoDiscoverServers(): Promise<void> {
    // Discover from well-known locations
    const discoveryPaths = [
      '~/.config/mcp/servers',
      './mcp-servers',
      process.env.MCP_SERVERS_PATH,
    ].filter(Boolean);

    for (const path of discoveryPaths) {
      await this.discoverFromPath(path);
    }

    // Discover from environment variables
    await this.discoverFromEnvironment();
  }

  private async discoverFromPath(path: string): Promise<void> {
    try {
      const files = await fs.readdir(path);

      for (const file of files) {
        if (file.endsWith('.json')) {
          const config = await this.loadServerConfig(join(path, file));
          await this.registerServer(config);
        }
      }
    } catch (error) {
      this.logger.debug(`Failed to discover servers from ${path}:`, error);
    }
  }

  private async loadServerConfig(configPath: string): Promise<MCPServerConfig> {
    const content = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(content);

    // Validate against schema
    const validation = this.validateConfigSchema(config);
    if (!validation.valid) {
      throw new Error(
        `Invalid MCP server config: ${validation.errors.join(', ')}`
      );
    }

    return config;
  }
}
```

### Configuration Schema

```typescript
interface MCPServerConfig {
  name: string;
  description?: string;
  transport: MCPTransport;
  autoConnect: boolean;
  timeout?: number;
  retryAttempts?: number;

  // Stdio transport
  command?: string;
  args?: string[];
  environment?: Record<string, string>;

  // WebSocket transport
  url?: string;
  headers?: Record<string, string>;

  // TCP transport
  host?: string;
  port?: number;

  // Security
  authentication?: MCPAuthConfig;
  encryption?: boolean;
}

type MCPTransport = 'stdio' | 'websocket' | 'tcp';

interface MCPAuthConfig {
  type: 'bearer' | 'basic' | 'api-key';
  token?: string;
  username?: string;
  password?: string;
  apiKey?: string;
}
```

## Integration with CLI Adapters

### MCP-Aware Adapters

```typescript
export interface MCPCapableAdapter extends CLIAdapter {
  // MCP integration
  supportsMCP: true;

  listMCPServers(): Promise<MCPServer[]>;
  connectMCPServer(server: MCPServer): Promise<void>;
  disconnectMCPServer(serverName: string): Promise<void>;

  // Tool forwarding
  executeToolViaAdapter(
    toolName: string,
    parameters: Record<string, unknown>
  ): Promise<ToolResult>;
}

// Claude Code adapter with MCP support
export class ClaudeCodeMCPAdapter
  extends ClaudeCodeAdapter
  implements MCPCapableAdapter
{
  supportsMCP = true as const;

  async listMCPServers(): Promise<MCPServer[]> {
    // Query claude-code for available MCP servers
    const result = await this.execute('--list-mcp-servers', {
      workingDirectory: process.cwd(),
    });

    return this.parseMCPServerList(result);
  }

  async connectMCPServer(server: MCPServer): Promise<void> {
    await this.execute(`--connect-mcp ${server.name}`, {
      workingDirectory: process.cwd(),
    });
  }

  async executeToolViaAdapter(
    toolName: string,
    parameters: Record<string, unknown>
  ): Promise<ToolResult> {
    const command = `--use-tool ${toolName} ${JSON.stringify(parameters)}`;

    const result = await this.execute(command, {
      workingDirectory: process.cwd(),
    });

    return this.parseToolResult(result);
  }
}
```

## MCP Server Examples

### File System MCP Server

```typescript
export class FileSystemMCPServer {
  private tools = [
    {
      name: 'read_file',
      description: 'Read contents of a file',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
        },
        required: ['path'],
      },
    },
    {
      name: 'write_file',
      description: 'Write contents to a file',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['path', 'content'],
      },
    },
  ];

  async handleMessage(message: MCPMessage): Promise<MCPResponse> {
    switch (message.method) {
      case MCPMethod.LIST_TOOLS:
        return {
          jsonrpc: '2.0',
          id: message.id!,
          result: { tools: this.tools },
        };

      case MCPMethod.CALL_TOOL:
        return await this.executeTool(message);

      default:
        return {
          jsonrpc: '2.0',
          id: message.id!,
          error: {
            code: -32601,
            message: 'Method not found',
          },
        };
    }
  }

  private async executeTool(message: MCPMessage): Promise<MCPResponse> {
    const { name, arguments: args } = message.params as any;

    try {
      let result;

      switch (name) {
        case 'read_file':
          result = await fs.readFile(args.path, 'utf-8');
          break;

        case 'write_file':
          await fs.writeFile(args.path, args.content);
          result = { success: true };
          break;

        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      return {
        jsonrpc: '2.0',
        id: message.id!,
        result,
      };
    } catch (error) {
      return {
        jsonrpc: '2.0',
        id: message.id!,
        error: {
          code: -32000,
          message: error.message,
        },
      };
    }
  }
}
```

### Database MCP Server

```typescript
export class DatabaseMCPServer {
  private tools = [
    {
      name: 'execute_query',
      description: 'Execute SQL query',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          parameters: { type: 'array' },
        },
        required: ['query'],
      },
    },
  ];

  private resources = [
    {
      uri: 'db://schema',
      name: 'Database Schema',
      description: 'Current database schema',
      mimeType: 'application/json',
    },
  ];

  async handleMessage(message: MCPMessage): Promise<MCPResponse> {
    switch (message.method) {
      case MCPMethod.LIST_RESOURCES:
        return {
          jsonrpc: '2.0',
          id: message.id!,
          result: { resources: this.resources },
        };

      case MCPMethod.READ_RESOURCE:
        return await this.readResource(message);

      case MCPMethod.CALL_TOOL:
        return await this.executeTool(message);

      default:
        return this.methodNotFound(message.id!);
    }
  }
}
```

## Performance & Scaling

### Connection Pooling

```typescript
export class MCPConnectionPool {
  private pools = new Map<string, Connection[]>();
  private config: PoolConfig;

  async getConnection(serverName: string): Promise<MCPServerConnection> {
    let pool = this.pools.get(serverName);

    if (!pool) {
      pool = [];
      this.pools.set(serverName, pool);
    }

    // Return available connection
    const available = pool.find(conn => !conn.inUse);
    if (available) {
      available.inUse = true;
      return available.connection;
    }

    // Create new connection if under limit
    if (pool.length < this.config.maxConnections) {
      const connection = await this.createConnection(serverName);
      pool.push({ connection, inUse: true });
      return connection;
    }

    // Wait for available connection
    return this.waitForConnection(serverName);
  }

  releaseConnection(serverName: string, connection: MCPServerConnection): void {
    const pool = this.pools.get(serverName);
    if (pool) {
      const entry = pool.find(entry => entry.connection === connection);
      if (entry) {
        entry.inUse = false;
      }
    }
  }
}
```

### Message Batching

```typescript
export class MCPMessageBatcher {
  private batches = new Map<string, BatchedMessage[]>();
  private timers = new Map<string, NodeJS.Timeout>();

  async sendMessage(
    serverName: string,
    message: MCPMessage
  ): Promise<MCPResponse> {
    // Add to batch
    let batch = this.batches.get(serverName);
    if (!batch) {
      batch = [];
      this.batches.set(serverName, batch);
    }

    const batchedMessage: BatchedMessage = {
      message,
      resolve: null!,
      reject: null!,
    };

    const promise = new Promise<MCPResponse>((resolve, reject) => {
      batchedMessage.resolve = resolve;
      batchedMessage.reject = reject;
    });

    batch.push(batchedMessage);

    // Schedule batch processing
    this.scheduleBatchProcessing(serverName);

    return promise;
  }

  private scheduleBatchProcessing(serverName: string): void {
    if (this.timers.has(serverName)) return;

    const timer = setTimeout(async () => {
      await this.processBatch(serverName);
      this.timers.delete(serverName);
    }, this.config.batchDelay);

    this.timers.set(serverName, timer);
  }
}
```
