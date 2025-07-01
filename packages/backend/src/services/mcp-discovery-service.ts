import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { mcpConnectionManager, MCPTool, MCPResource } from './mcp-connection-manager.js';
import { comprehensiveAuditLogger, AuditCategory } from '../security/audit-logger.js';
import { SecurityLevel } from '../security/types.js';

// Discovery Types
export interface DiscoveredTool extends MCPTool {
  id: string;
  connectionId: string;
  serverId: string;
  serverName: string;
  lastUpdated: Date;
  usage: {
    callCount: number;
    lastCalled?: Date;
    averageExecutionTime: number;
    errorCount: number;
    successRate: number;
  };
  metadata: {
    category?: string;
    tags: string[];
    examples?: any[];
    documentation?: string;
    deprecated: boolean;
    experimental: boolean;
  };
}

export interface DiscoveredResource extends MCPResource {
  id: string;
  connectionId: string;
  serverId: string;
  serverName: string;
  lastUpdated: Date;
  access: {
    readCount: number;
    lastAccessed?: Date;
    averageLoadTime: number;
    errorCount: number;
    successRate: number;
  };
  metadata: {
    category?: string;
    tags: string[];
    size?: number;
    encoding?: string;
    cacheControl?: string;
    dependencies?: string[];
  };
}

export interface ToolSearchQuery {
  query?: string;
  category?: string;
  tags?: string[];
  serverId?: string;
  deprecated?: boolean;
  experimental?: boolean;
  limit?: number;
  offset?: number;
  sortBy?: 'name' | 'usage' | 'recent' | 'success_rate';
  sortOrder?: 'asc' | 'desc';
}

export interface ResourceSearchQuery {
  query?: string;
  category?: string;
  tags?: string[];
  mimeType?: string;
  serverId?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'name' | 'size' | 'accessed' | 'recent';
  sortOrder?: 'asc' | 'desc';
}

export interface ToolExecutionResult {
  toolId: string;
  result: any;
  duration: number;
  success: boolean;
  error?: string;
  timestamp: Date;
}

export interface ResourceAccessResult {
  resourceId: string;
  content: any;
  duration: number;
  success: boolean;
  error?: string;
  timestamp: Date;
  size?: number;
}

export class MCPDiscoveryService extends EventEmitter {
  private static instance: MCPDiscoveryService;
  private discoveredTools: Map<string, DiscoveredTool> = new Map();
  private discoveredResources: Map<string, DiscoveredResource> = new Map();
  private toolCategories: Set<string> = new Set();
  private resourceCategories: Set<string> = new Set();
  private isInitialized = false;

  constructor() {
    super();
    this.setupConnectionListeners();
  }

  static getInstance(): MCPDiscoveryService {
    if (!MCPDiscoveryService.instance) {
      MCPDiscoveryService.instance = new MCPDiscoveryService();
    }
    return MCPDiscoveryService.instance;
  }

  /**
   * Initialize the discovery service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Discover tools and resources from existing connections
      await this.discoverFromExistingConnections();
      
      this.isInitialized = true;
      this.emit('initialized');
      
      console.log('✅ MCP discovery service initialized');
    } catch (error) {
      console.error('❌ Failed to initialize MCP discovery service:', error);
      throw error;
    }
  }

  /**
   * Search for tools across all connected MCP servers
   */
  async searchTools(query: ToolSearchQuery, userId?: string): Promise<{
    tools: DiscoveredTool[];
    total: number;
    categories: string[];
    tags: string[];
  }> {
    let tools = Array.from(this.discoveredTools.values());

    // Filter by user access (if they own the connection)
    if (userId) {
      const userConnections = mcpConnectionManager.getConnections(userId);
      const userConnectionIds = new Set(userConnections.map(c => c.id));
      tools = tools.filter(tool => userConnectionIds.has(tool.connectionId));
    }

    // Apply filters
    if (query.query) {
      const searchTerm = query.query.toLowerCase();
      tools = tools.filter(tool =>
        tool.name.toLowerCase().includes(searchTerm) ||
        tool.description.toLowerCase().includes(searchTerm) ||
        tool.metadata.tags.some(tag => tag.toLowerCase().includes(searchTerm))
      );
    }

    if (query.category) {
      tools = tools.filter(tool => tool.metadata.category === query.category);
    }

    if (query.tags && query.tags.length > 0) {
      tools = tools.filter(tool =>
        query.tags!.some(tag => tool.metadata.tags.includes(tag))
      );
    }

    if (query.serverId) {
      tools = tools.filter(tool => tool.serverId === query.serverId);
    }

    if (query.deprecated !== undefined) {
      tools = tools.filter(tool => tool.metadata.deprecated === query.deprecated);
    }

    if (query.experimental !== undefined) {
      tools = tools.filter(tool => tool.metadata.experimental === query.experimental);
    }

    // Sort results
    const sortBy = query.sortBy || 'name';
    const sortOrder = query.sortOrder || 'asc';
    
    tools.sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'usage':
          comparison = a.usage.callCount - b.usage.callCount;
          break;
        case 'recent':
          const aTime = a.usage.lastCalled?.getTime() || 0;
          const bTime = b.usage.lastCalled?.getTime() || 0;
          comparison = aTime - bTime;
          break;
        case 'success_rate':
          comparison = a.usage.successRate - b.usage.successRate;
          break;
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    // Apply pagination
    const offset = query.offset || 0;
    const limit = query.limit || 50;
    const paginatedTools = tools.slice(offset, offset + limit);

    // Get available categories and tags
    const categories = Array.from(this.toolCategories);
    const allTags = new Set<string>();
    tools.forEach(tool => {
      tool.metadata.tags.forEach(tag => allTags.add(tag));
    });

    return {
      tools: paginatedTools,
      total: tools.length,
      categories,
      tags: Array.from(allTags),
    };
  }

  /**
   * Search for resources across all connected MCP servers
   */
  async searchResources(query: ResourceSearchQuery, userId?: string): Promise<{
    resources: DiscoveredResource[];
    total: number;
    categories: string[];
    mimeTypes: string[];
  }> {
    let resources = Array.from(this.discoveredResources.values());

    // Filter by user access
    if (userId) {
      const userConnections = mcpConnectionManager.getConnections(userId);
      const userConnectionIds = new Set(userConnections.map(c => c.id));
      resources = resources.filter(resource => userConnectionIds.has(resource.connectionId));
    }

    // Apply filters
    if (query.query) {
      const searchTerm = query.query.toLowerCase();
      resources = resources.filter(resource =>
        resource.name.toLowerCase().includes(searchTerm) ||
        (resource.description && resource.description.toLowerCase().includes(searchTerm)) ||
        resource.uri.toLowerCase().includes(searchTerm) ||
        resource.metadata.tags.some(tag => tag.toLowerCase().includes(searchTerm))
      );
    }

    if (query.category) {
      resources = resources.filter(resource => resource.metadata.category === query.category);
    }

    if (query.tags && query.tags.length > 0) {
      resources = resources.filter(resource =>
        query.tags!.some(tag => resource.metadata.tags.includes(tag))
      );
    }

    if (query.mimeType) {
      resources = resources.filter(resource => resource.mimeType === query.mimeType);
    }

    if (query.serverId) {
      resources = resources.filter(resource => resource.serverId === query.serverId);
    }

    // Sort results
    const sortBy = query.sortBy || 'name';
    const sortOrder = query.sortOrder || 'asc';
    
    resources.sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'size':
          const aSize = a.metadata.size || 0;
          const bSize = b.metadata.size || 0;
          comparison = aSize - bSize;
          break;
        case 'accessed':
          comparison = a.access.readCount - b.access.readCount;
          break;
        case 'recent':
          const aTime = a.access.lastAccessed?.getTime() || 0;
          const bTime = b.access.lastAccessed?.getTime() || 0;
          comparison = aTime - bTime;
          break;
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    // Apply pagination
    const offset = query.offset || 0;
    const limit = query.limit || 50;
    const paginatedResources = resources.slice(offset, offset + limit);

    // Get available categories and mime types
    const categories = Array.from(this.resourceCategories);
    const mimeTypes = Array.from(new Set(resources.map(r => r.mimeType).filter(Boolean))) as string[];

    return {
      resources: paginatedResources,
      total: resources.length,
      categories,
      mimeTypes,
    };
  }

  /**
   * Get a specific tool by ID
   */
  getTool(toolId: string): DiscoveredTool | null {
    return this.discoveredTools.get(toolId) || null;
  }

  /**
   * Get a specific resource by ID
   */
  getResource(resourceId: string): DiscoveredResource | null {
    return this.discoveredResources.get(resourceId) || null;
  }

  /**
   * Execute a tool
   */
  async executeTool(
    toolId: string,
    parameters: any,
    userId: string
  ): Promise<ToolExecutionResult> {
    const tool = this.discoveredTools.get(toolId);
    if (!tool) {
      throw new Error(`Tool not found: ${toolId}`);
    }

    // Verify user has access to the connection
    const connection = mcpConnectionManager.getConnection(tool.connectionId);
    if (!connection) {
      throw new Error(`Connection not found: ${tool.connectionId}`);
    }

    if (connection.userId !== userId) {
      throw new Error('Access denied');
    }

    const startTime = Date.now();
    let result: ToolExecutionResult;

    try {
      const response = await mcpConnectionManager.sendRequest(
        tool.connectionId,
        'tools/call',
        {
          name: tool.name,
          arguments: parameters,
        }
      );

      const duration = Date.now() - startTime;
      
      result = {
        toolId,
        result: response,
        duration,
        success: true,
        timestamp: new Date(),
      };

      // Update usage statistics
      tool.usage.callCount++;
      tool.usage.lastCalled = new Date();
      tool.usage.averageExecutionTime = 
        (tool.usage.averageExecutionTime * (tool.usage.callCount - 1) + duration) /
        tool.usage.callCount;
      tool.usage.successRate = (tool.usage.callCount - tool.usage.errorCount) / tool.usage.callCount;

      this.emit('toolExecuted', result);

      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.SYSTEM_ACCESS,
        action: 'mcp_tool_executed',
        resourceType: 'mcp_tool',
        resourceId: toolId,
        userId,
        outcome: 'success',
        severity: SecurityLevel.MODERATE,
        details: {
          toolName: tool.name,
          serverName: tool.serverName,
          duration,
          parametersProvided: Object.keys(parameters).length,
        },
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      
      result = {
        toolId,
        result: null,
        duration,
        success: false,
        error: (error as Error).message,
        timestamp: new Date(),
      };

      // Update error statistics
      tool.usage.errorCount++;
      tool.usage.successRate = (tool.usage.callCount - tool.usage.errorCount) / tool.usage.callCount;

      this.emit('toolExecutionFailed', result, error);

      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.SYSTEM_ACCESS,
        action: 'mcp_tool_execution_failed',
        resourceType: 'mcp_tool',
        resourceId: toolId,
        userId,
        outcome: 'failure',
        severity: SecurityLevel.MODERATE,
        details: {
          toolName: tool.name,
          serverName: tool.serverName,
          error: (error as Error).message,
        },
      });

      throw error;
    }

    return result;
  }

  /**
   * Access a resource
   */
  async accessResource(
    resourceId: string,
    userId: string
  ): Promise<ResourceAccessResult> {
    const resource = this.discoveredResources.get(resourceId);
    if (!resource) {
      throw new Error(`Resource not found: ${resourceId}`);
    }

    // Verify user has access to the connection
    const connection = mcpConnectionManager.getConnection(resource.connectionId);
    if (!connection) {
      throw new Error(`Connection not found: ${resource.connectionId}`);
    }

    if (connection.userId !== userId) {
      throw new Error('Access denied');
    }

    const startTime = Date.now();
    let result: ResourceAccessResult;

    try {
      const response = await mcpConnectionManager.sendRequest(
        resource.connectionId,
        'resources/read',
        {
          uri: resource.uri,
        }
      );

      const duration = Date.now() - startTime;
      const size = response.contents ? JSON.stringify(response.contents).length : 0;

      result = {
        resourceId,
        content: response.contents,
        duration,
        success: true,
        timestamp: new Date(),
        size,
      };

      // Update access statistics
      resource.access.readCount++;
      resource.access.lastAccessed = new Date();
      resource.access.averageLoadTime = 
        (resource.access.averageLoadTime * (resource.access.readCount - 1) + duration) /
        resource.access.readCount;
      resource.access.successRate = (resource.access.readCount - resource.access.errorCount) / resource.access.readCount;

      // Update metadata if available
      if (size > 0) {
        resource.metadata.size = size;
      }

      this.emit('resourceAccessed', result);

      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.SYSTEM_ACCESS,
        action: 'mcp_resource_accessed',
        resourceType: 'mcp_resource',
        resourceId,
        userId,
        outcome: 'success',
        severity: SecurityLevel.SAFE,
        details: {
          resourceName: resource.name,
          serverName: resource.serverName,
          uri: resource.uri,
          size,
          duration,
        },
      });

    } catch (error) {
      const duration = Date.now() - startTime;

      result = {
        resourceId,
        content: null,
        duration,
        success: false,
        error: (error as Error).message,
        timestamp: new Date(),
      };

      // Update error statistics
      resource.access.errorCount++;
      resource.access.successRate = (resource.access.readCount - resource.access.errorCount) / resource.access.readCount;

      this.emit('resourceAccessFailed', result, error);

      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.SYSTEM_ACCESS,
        action: 'mcp_resource_access_failed',
        resourceType: 'mcp_resource',
        resourceId,
        userId,
        outcome: 'failure',
        severity: SecurityLevel.MODERATE,
        details: {
          resourceName: resource.name,
          serverName: resource.serverName,
          error: (error as Error).message,
        },
      });

      throw error;
    }

    return result;
  }

  /**
   * Get discovery statistics
   */
  getDiscoveryStats(): {
    totalTools: number;
    totalResources: number;
    totalConnections: number;
    toolCategories: string[];
    resourceCategories: string[];
    topTools: Array<{ name: string; callCount: number; serverName: string }>;
    topResources: Array<{ name: string; readCount: number; serverName: string }>;
  } {
    const tools = Array.from(this.discoveredTools.values());
    const resources = Array.from(this.discoveredResources.values());
    const connections = mcpConnectionManager.getConnections();

    // Get top tools by usage
    const topTools = tools
      .sort((a, b) => b.usage.callCount - a.usage.callCount)
      .slice(0, 10)
      .map(tool => ({
        name: tool.name,
        callCount: tool.usage.callCount,
        serverName: tool.serverName,
      }));

    // Get top resources by access
    const topResources = resources
      .sort((a, b) => b.access.readCount - a.access.readCount)
      .slice(0, 10)
      .map(resource => ({
        name: resource.name,
        readCount: resource.access.readCount,
        serverName: resource.serverName,
      }));

    return {
      totalTools: tools.length,
      totalResources: resources.length,
      totalConnections: connections.length,
      toolCategories: Array.from(this.toolCategories),
      resourceCategories: Array.from(this.resourceCategories),
      topTools,
      topResources,
    };
  }

  // Private methods

  private setupConnectionListeners(): void {
    mcpConnectionManager.on('connected', async (connection) => {
      await this.discoverFromConnection(connection.id);
    });

    mcpConnectionManager.on('disconnected', (connection) => {
      this.removeDiscoveredItems(connection.id);
    });

    mcpConnectionManager.on('toolsChanged', async (connection) => {
      await this.discoverFromConnection(connection.id);
    });

    mcpConnectionManager.on('resourcesChanged', async (connection) => {
      await this.discoverFromConnection(connection.id);
    });
  }

  private async discoverFromExistingConnections(): Promise<void> {
    const connections = mcpConnectionManager.getConnections();
    
    for (const connection of connections) {
      if (connection.status === 'connected') {
        await this.discoverFromConnection(connection.id);
      }
    }
  }

  private async discoverFromConnection(connectionId: string): Promise<void> {
    const connection = mcpConnectionManager.getConnection(connectionId);
    if (!connection) return;

    try {
      // Remove existing items for this connection
      this.removeDiscoveredItems(connectionId);

      // Discover tools
      for (const tool of connection.metadata.tools) {
        const discoveredTool: DiscoveredTool = {
          id: uuidv4(),
          connectionId,
          serverId: connection.serverId,
          serverName: connection.name,
          lastUpdated: new Date(),
          usage: {
            callCount: 0,
            averageExecutionTime: 0,
            errorCount: 0,
            successRate: 1.0,
          },
          metadata: {
            tags: [],
            deprecated: false,
            experimental: false,
          },
          ...tool,
        };

        // Categorize tool
        const category = this.categorizeItem(tool.name, tool.description);
        if (category) {
          discoveredTool.metadata.category = category;
          this.toolCategories.add(category);
        }

        // Extract tags from description
        discoveredTool.metadata.tags = this.extractTags(tool.description);

        this.discoveredTools.set(discoveredTool.id, discoveredTool);
      }

      // Discover resources
      for (const resource of connection.metadata.resources) {
        const discoveredResource: DiscoveredResource = {
          id: uuidv4(),
          connectionId,
          serverId: connection.serverId,
          serverName: connection.name,
          lastUpdated: new Date(),
          access: {
            readCount: 0,
            averageLoadTime: 0,
            errorCount: 0,
            successRate: 1.0,
          },
          metadata: {
            tags: [],
          },
          ...resource,
        };

        // Categorize resource
        const category = this.categorizeItem(resource.name, resource.description || '');
        if (category) {
          discoveredResource.metadata.category = category;
          this.resourceCategories.add(category);
        }

        // Extract tags from description and URI
        discoveredResource.metadata.tags = this.extractTags(
          `${resource.description || ''} ${resource.uri}`
        );

        this.discoveredResources.set(discoveredResource.id, discoveredResource);
      }

      this.emit('discoveryUpdated', {
        connectionId,
        toolCount: connection.metadata.tools.length,
        resourceCount: connection.metadata.resources.length,
      });

    } catch (error) {
      console.error(`Failed to discover from connection ${connectionId}:`, error);
    }
  }

  private removeDiscoveredItems(connectionId: string): void {
    // Remove tools
    for (const [id, tool] of this.discoveredTools.entries()) {
      if (tool.connectionId === connectionId) {
        this.discoveredTools.delete(id);
      }
    }

    // Remove resources
    for (const [id, resource] of this.discoveredResources.entries()) {
      if (resource.connectionId === connectionId) {
        this.discoveredResources.delete(id);
      }
    }
  }

  private categorizeItem(name: string, description: string): string | undefined {
    const text = `${name} ${description}`.toLowerCase();
    
    const categories = {
      'file-system': ['file', 'directory', 'path', 'folder', 'read', 'write'],
      'database': ['database', 'sql', 'query', 'table', 'record'],
      'web': ['http', 'api', 'request', 'url', 'web', 'fetch'],
      'ai': ['ai', 'ml', 'model', 'predict', 'classify', 'generate'],
      'code': ['code', 'git', 'repository', 'commit', 'syntax'],
      'text': ['text', 'string', 'parse', 'format', 'translate'],
      'image': ['image', 'photo', 'picture', 'visual', 'graphics'],
      'audio': ['audio', 'sound', 'music', 'voice', 'speech'],
      'video': ['video', 'movie', 'stream', 'media'],
      'system': ['system', 'process', 'command', 'exec', 'shell'],
      'math': ['math', 'calculate', 'compute', 'formula'],
      'utility': ['utility', 'tool', 'helper', 'convert'],
    };

    for (const [category, keywords] of Object.entries(categories)) {
      if (keywords.some(keyword => text.includes(keyword))) {
        return category;
      }
    }

    return undefined;
  }

  private extractTags(text: string): string[] {
    const tags = new Set<string>();
    const words = text.toLowerCase().match(/\b\w+\b/g) || [];
    
    // Common technical terms that make good tags
    const tagPatterns = [
      'api', 'json', 'xml', 'csv', 'pdf', 'image', 'text', 'file',
      'database', 'sql', 'web', 'http', 'git', 'code', 'ai', 'ml',
      'async', 'sync', 'stream', 'batch', 'real-time', 'cache',
    ];

    for (const word of words) {
      if (tagPatterns.includes(word)) {
        tags.add(word);
      }
    }

    return Array.from(tags);
  }
}

// Export singleton instance
export const mcpDiscoveryService = MCPDiscoveryService.getInstance();