import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { MCPTransportType } from './mcp-connection-manager.js';
import {
  comprehensiveAuditLogger,
  AuditCategory,
} from '../security/audit-logger.js';
import { SecurityLevel } from '../security/types.js';

// MCP Server Registry Types
export interface MCPServerDefinition {
  id: string;
  name: string;
  displayName: string;
  description: string;
  version: string;
  author: {
    name: string;
    email?: string;
    website?: string;
    github?: string;
  };
  repository?: {
    type: 'git' | 'npm' | 'github';
    url: string;
    branch?: string;
    directory?: string;
  };
  license: string;
  tags: string[];
  category:
    | 'ai'
    | 'productivity'
    | 'development'
    | 'data'
    | 'system'
    | 'utility'
    | 'custom';
  transport: {
    type: MCPTransportType;
    config: MCPServerTransportConfig;
  };
  capabilities: {
    tools: string[];
    resources: string[];
    prompts: string[];
    features: string[];
  };
  configuration: {
    schema: any; // JSON schema for configuration
    defaults: Record<string, any>;
    required: string[];
    sensitive: string[]; // Fields that contain sensitive data
  };
  installation?: {
    requirements: string[];
    instructions: string[];
    postInstall?: string[];
  };
  documentation: {
    readme?: string;
    examples?: any[];
    apiDocs?: string;
  };
  metadata: {
    official: boolean;
    verified: boolean;
    experimental: boolean;
    deprecated: boolean;
    featured: boolean;
    downloadCount: number;
    rating: number;
    lastUpdated: Date;
    createdAt: Date;
  };
  status: 'active' | 'inactive' | 'deprecated' | 'review';
}

export interface MCPServerTransportConfig {
  // WebSocket config
  url?: string;
  headers?: Record<string, string>;

  // STDIO config
  executable?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;

  // HTTP config
  baseUrl?: string;
  timeout?: number;

  // IPC config
  path?: string;
}

export interface MCPServerInstance {
  id: string;
  serverId: string;
  userId: string;
  name: string;
  configuration: Record<string, any>;
  connectionId?: string;
  status: 'configured' | 'connected' | 'disconnected' | 'error';
  autoConnect: boolean;
  enabled: boolean;
  lastConnected?: Date;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ServerRegistrySearch {
  query?: string;
  category?: string;
  tags?: string[];
  transport?: MCPTransportType;
  author?: string;
  verified?: boolean;
  official?: boolean;
  experimental?: boolean;
  featured?: boolean;
  limit?: number;
  offset?: number;
  sortBy?: 'name' | 'downloads' | 'rating' | 'updated' | 'created';
  sortOrder?: 'asc' | 'desc';
}

export class MCPServerRegistry extends EventEmitter {
  private static instance: MCPServerRegistry;
  private serverDefinitions: Map<string, MCPServerDefinition> = new Map();
  private serverInstances: Map<string, MCPServerInstance> = new Map();
  private registryDir: string;
  private instancesDir: string;
  private configTemplatesDir: string;
  private isInitialized = false;

  constructor() {
    super();
    this.registryDir = join(process.cwd(), '.mcp', 'registry');
    this.instancesDir = join(process.cwd(), '.mcp', 'instances');
    this.configTemplatesDir = join(process.cwd(), '.mcp', 'templates');
    this.ensureDirectories();
  }

  static getInstance(): MCPServerRegistry {
    if (!MCPServerRegistry.instance) {
      MCPServerRegistry.instance = new MCPServerRegistry();
    }
    return MCPServerRegistry.instance;
  }

  /**
   * Initialize the server registry
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      await this.loadServerDefinitions();
      await this.loadServerInstances();
      await this.loadDefaultServers();

      this.isInitialized = true;
      this.emit('initialized');

      console.log('✅ MCP server registry initialized');
    } catch (error) {
      console.error('❌ Failed to initialize MCP server registry:', error);
      throw error;
    }
  }

  /**
   * Register a new MCP server definition
   */
  async registerServer(
    definition: Omit<MCPServerDefinition, 'id' | 'metadata'>,
    submitterId: string
  ): Promise<string> {
    const serverId = uuidv4();

    const serverDefinition: MCPServerDefinition = {
      ...definition,
      id: serverId,
      metadata: {
        official: false,
        verified: false,
        experimental: false,
        deprecated: false,
        featured: false,
        downloadCount: 0,
        rating: 0,
        lastUpdated: new Date(),
        createdAt: new Date(),
      },
      status: 'review', // New servers need review by default
    };

    // Validate server definition
    await this.validateServerDefinition(serverDefinition);

    this.serverDefinitions.set(serverId, serverDefinition);
    await this.saveServerDefinitions();

    this.emit('serverRegistered', serverDefinition, submitterId);

    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CONFIGURATION,
      action: 'mcp_server_registered',
      resourceType: 'mcp_server_definition',
      resourceId: serverId,
      userId: submitterId,
      outcome: 'success',
      severity: SecurityLevel.MODERATE,
      details: {
        serverName: definition.name,
        transport: definition.transport.type,
        category: definition.category,
      },
    });

    return serverId;
  }

  /**
   * Search for server definitions
   */
  async searchServers(search: ServerRegistrySearch): Promise<{
    servers: MCPServerDefinition[];
    total: number;
    categories: string[];
    tags: string[];
  }> {
    let servers = Array.from(this.serverDefinitions.values()).filter(
      server => server.status === 'active'
    );

    // Apply filters
    if (search.query) {
      const query = search.query.toLowerCase();
      servers = servers.filter(
        server =>
          server.name.toLowerCase().includes(query) ||
          server.displayName.toLowerCase().includes(query) ||
          server.description.toLowerCase().includes(query) ||
          server.tags.some(tag => tag.toLowerCase().includes(query))
      );
    }

    if (search.category) {
      servers = servers.filter(server => server.category === search.category);
    }

    if (search.tags && search.tags.length > 0) {
      servers = servers.filter(server =>
        search.tags!.some(tag => server.tags.includes(tag))
      );
    }

    if (search.transport) {
      servers = servers.filter(
        server => server.transport.type === search.transport
      );
    }

    if (search.author) {
      servers = servers.filter(server =>
        server.author.name.toLowerCase().includes(search.author!.toLowerCase())
      );
    }

    if (search.verified !== undefined) {
      servers = servers.filter(
        server => server.metadata.verified === search.verified
      );
    }

    if (search.official !== undefined) {
      servers = servers.filter(
        server => server.metadata.official === search.official
      );
    }

    if (search.experimental !== undefined) {
      servers = servers.filter(
        server => server.metadata.experimental === search.experimental
      );
    }

    if (search.featured !== undefined) {
      servers = servers.filter(
        server => server.metadata.featured === search.featured
      );
    }

    // Sort results
    const sortBy = search.sortBy || 'name';
    const sortOrder = search.sortOrder || 'asc';

    servers.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'name':
          comparison = a.displayName.localeCompare(b.displayName);
          break;
        case 'downloads':
          comparison = a.metadata.downloadCount - b.metadata.downloadCount;
          break;
        case 'rating':
          comparison = a.metadata.rating - b.metadata.rating;
          break;
        case 'updated':
          comparison =
            a.metadata.lastUpdated.getTime() - b.metadata.lastUpdated.getTime();
          break;
        case 'created':
          comparison =
            a.metadata.createdAt.getTime() - b.metadata.createdAt.getTime();
          break;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    // Apply pagination
    const offset = search.offset || 0;
    const limit = Math.min(search.limit || 50, 100);
    const paginatedServers = servers.slice(offset, offset + limit);

    // Get available categories and tags
    const allServers = Array.from(this.serverDefinitions.values());
    const categories = Array.from(new Set(allServers.map(s => s.category)));
    const allTags = new Set<string>();
    allServers.forEach(server => {
      server.tags.forEach(tag => allTags.add(tag));
    });

    return {
      servers: paginatedServers,
      total: servers.length,
      categories,
      tags: Array.from(allTags),
    };
  }

  /**
   * Get a server definition by ID
   */
  getServerDefinition(serverId: string): MCPServerDefinition | null {
    return this.serverDefinitions.get(serverId) || null;
  }

  /**
   * Create a server instance for a user
   */
  async createServerInstance(
    serverId: string,
    userId: string,
    configuration: Record<string, any>,
    options: {
      name?: string;
      autoConnect?: boolean;
      enabled?: boolean;
    } = {}
  ): Promise<MCPServerInstance> {
    const serverDefinition = this.serverDefinitions.get(serverId);
    if (!serverDefinition) {
      throw new Error(`Server definition not found: ${serverId}`);
    }

    // Validate configuration against schema
    await this.validateConfiguration(serverDefinition, configuration);

    const instanceId = uuidv4();
    const instance: MCPServerInstance = {
      id: instanceId,
      serverId,
      userId,
      name: options.name || serverDefinition.displayName,
      configuration,
      status: 'configured',
      autoConnect: options.autoConnect !== false,
      enabled: options.enabled !== false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.serverInstances.set(instanceId, instance);
    await this.saveServerInstances();

    this.emit('instanceCreated', instance);

    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CONFIGURATION,
      action: 'mcp_server_instance_created',
      resourceType: 'mcp_server_instance',
      resourceId: instanceId,
      userId,
      outcome: 'success',
      severity: SecurityLevel.SAFE,
      details: {
        serverId,
        serverName: serverDefinition.name,
        instanceName: instance.name,
      },
    });

    return instance;
  }

  /**
   * Get server instances for a user
   */
  getServerInstances(userId?: string): MCPServerInstance[] {
    const instances = Array.from(this.serverInstances.values());

    if (userId) {
      return instances.filter(instance => instance.userId === userId);
    }

    return instances;
  }

  /**
   * Get a specific server instance
   */
  getServerInstance(instanceId: string): MCPServerInstance | null {
    return this.serverInstances.get(instanceId) || null;
  }

  /**
   * Update server instance configuration
   */
  async updateServerInstance(
    instanceId: string,
    updates: Partial<MCPServerInstance>,
    userId: string
  ): Promise<MCPServerInstance> {
    const instance = this.serverInstances.get(instanceId);
    if (!instance) {
      throw new Error(`Server instance not found: ${instanceId}`);
    }

    if (instance.userId !== userId) {
      throw new Error('Access denied');
    }

    // Validate configuration if being updated
    if (updates.configuration) {
      const serverDefinition = this.serverDefinitions.get(instance.serverId);
      if (serverDefinition) {
        await this.validateConfiguration(
          serverDefinition,
          updates.configuration
        );
      }
    }

    // Update allowed fields
    const allowedFields = ['name', 'configuration', 'autoConnect', 'enabled'];
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        (instance as any)[key] = value;
      }
    }

    instance.updatedAt = new Date();
    await this.saveServerInstances();

    this.emit('instanceUpdated', instance);

    return instance;
  }

  /**
   * Delete a server instance
   */
  async deleteServerInstance(
    instanceId: string,
    userId: string
  ): Promise<void> {
    const instance = this.serverInstances.get(instanceId);
    if (!instance) {
      throw new Error(`Server instance not found: ${instanceId}`);
    }

    if (instance.userId !== userId) {
      throw new Error('Access denied');
    }

    this.serverInstances.delete(instanceId);
    await this.saveServerInstances();

    this.emit('instanceDeleted', instance);

    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CONFIGURATION,
      action: 'mcp_server_instance_deleted',
      resourceType: 'mcp_server_instance',
      resourceId: instanceId,
      userId,
      outcome: 'success',
      severity: SecurityLevel.SAFE,
      details: {
        serverId: instance.serverId,
        instanceName: instance.name,
      },
    });
  }

  /**
   * Get registry statistics
   */
  getRegistryStats(): {
    totalServers: number;
    activeServers: number;
    totalInstances: number;
    categoryCounts: Record<string, number>;
    transportCounts: Record<string, number>;
    featuredServers: MCPServerDefinition[];
    popularServers: MCPServerDefinition[];
  } {
    const servers = Array.from(this.serverDefinitions.values());
    const instances = Array.from(this.serverInstances.values());

    const categoryCounts = servers.reduce(
      (counts, server) => {
        counts[server.category] = (counts[server.category] || 0) + 1;
        return counts;
      },
      {} as Record<string, number>
    );

    const transportCounts = servers.reduce(
      (counts, server) => {
        counts[server.transport.type] =
          (counts[server.transport.type] || 0) + 1;
        return counts;
      },
      {} as Record<string, number>
    );

    const featuredServers = servers
      .filter(s => s.metadata.featured && s.status === 'active')
      .slice(0, 10);

    const popularServers = servers
      .filter(s => s.status === 'active')
      .sort((a, b) => b.metadata.downloadCount - a.metadata.downloadCount)
      .slice(0, 10);

    return {
      totalServers: servers.length,
      activeServers: servers.filter(s => s.status === 'active').length,
      totalInstances: instances.length,
      categoryCounts,
      transportCounts,
      featuredServers,
      popularServers,
    };
  }

  /**
   * Generate configuration template for a server
   */
  generateConfigurationTemplate(serverId: string): any {
    const serverDefinition = this.serverDefinitions.get(serverId);
    if (!serverDefinition) {
      throw new Error(`Server definition not found: ${serverId}`);
    }

    const template = { ...serverDefinition.configuration.defaults };

    // Add placeholders for required fields
    for (const field of serverDefinition.configuration.required) {
      if (!(field in template)) {
        template[field] = `<${field}>`;
      }
    }

    return template;
  }

  // Private methods

  private ensureDirectories(): void {
    [this.registryDir, this.instancesDir, this.configTemplatesDir].forEach(
      dir => {
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }
      }
    );
  }

  private async loadServerDefinitions(): Promise<void> {
    const definitionsPath = join(this.registryDir, 'definitions.json');

    if (existsSync(definitionsPath)) {
      try {
        const data = await fs.readFile(definitionsPath, 'utf8');
        const definitions = JSON.parse(data);

        for (const definition of definitions) {
          // Convert date strings back to Date objects
          definition.metadata.lastUpdated = new Date(
            definition.metadata.lastUpdated
          );
          definition.metadata.createdAt = new Date(
            definition.metadata.createdAt
          );
          this.serverDefinitions.set(definition.id, definition);
        }
      } catch (error) {
        console.warn('Failed to load server definitions:', error);
      }
    }
  }

  private async loadServerInstances(): Promise<void> {
    const instancesPath = join(this.instancesDir, 'instances.json');

    if (existsSync(instancesPath)) {
      try {
        const data = await fs.readFile(instancesPath, 'utf8');
        const instances = JSON.parse(data);

        for (const instance of instances) {
          instance.createdAt = new Date(instance.createdAt);
          instance.updatedAt = new Date(instance.updatedAt);
          if (instance.lastConnected) {
            instance.lastConnected = new Date(instance.lastConnected);
          }
          this.serverInstances.set(instance.id, instance);
        }
      } catch (error) {
        console.warn('Failed to load server instances:', error);
      }
    }
  }

  private async saveServerDefinitions(): Promise<void> {
    const definitionsPath = join(this.registryDir, 'definitions.json');
    const definitions = Array.from(this.serverDefinitions.values());
    await fs.writeFile(definitionsPath, JSON.stringify(definitions, null, 2));
  }

  private async saveServerInstances(): Promise<void> {
    const instancesPath = join(this.instancesDir, 'instances.json');
    const instances = Array.from(this.serverInstances.values());
    await fs.writeFile(instancesPath, JSON.stringify(instances, null, 2));
  }

  private async loadDefaultServers(): Promise<void> {
    // Load default server definitions if registry is empty
    if (this.serverDefinitions.size === 0) {
      const defaultServers = await this.getDefaultServerDefinitions();

      for (const server of defaultServers) {
        this.serverDefinitions.set(server.id, server);
      }

      if (defaultServers.length > 0) {
        await this.saveServerDefinitions();
      }
    }
  }

  private async getDefaultServerDefinitions(): Promise<MCPServerDefinition[]> {
    // This would contain built-in MCP server definitions
    return [
      {
        id: 'filesystem-server',
        name: 'filesystem',
        displayName: 'File System Server',
        description: 'MCP server for file system operations',
        version: '1.0.0',
        author: {
          name: 'Vibe Code Team',
          email: 'team@vibecode.dev',
        },
        license: 'MIT',
        tags: ['filesystem', 'files', 'directories', 'built-in'],
        category: 'system',
        transport: {
          type: MCPTransportType.STDIO,
          config: {
            executable: 'mcp-filesystem-server',
            args: [],
          },
        },
        capabilities: {
          tools: [
            'read_file',
            'write_file',
            'list_directory',
            'create_directory',
          ],
          resources: ['file://*'],
          prompts: [],
          features: ['file_operations'],
        },
        configuration: {
          schema: {
            type: 'object',
            properties: {
              basePath: {
                type: 'string',
                description: 'Base path for file operations',
                default: process.cwd(),
              },
              allowedPaths: {
                type: 'array',
                items: { type: 'string' },
                description: 'Allowed paths for file operations',
              },
              readOnly: {
                type: 'boolean',
                description: 'Restrict to read-only operations',
                default: false,
              },
            },
          },
          defaults: {
            basePath: process.cwd(),
            readOnly: false,
          },
          required: ['basePath'],
          sensitive: [],
        },
        documentation: {
          readme: 'Built-in file system server for basic file operations',
        },
        metadata: {
          official: true,
          verified: true,
          experimental: false,
          deprecated: false,
          featured: true,
          downloadCount: 0,
          rating: 5.0,
          lastUpdated: new Date(),
          createdAt: new Date(),
        },
        status: 'active',
      },
    ];
  }

  private async validateServerDefinition(
    definition: MCPServerDefinition
  ): Promise<void> {
    // Validate required fields
    if (
      !definition.name ||
      !definition.displayName ||
      !definition.description
    ) {
      throw new Error('Missing required server definition fields');
    }

    // Validate transport configuration
    if (!definition.transport.type) {
      throw new Error('Transport type is required');
    }

    // Validate configuration schema
    if (!definition.configuration.schema) {
      throw new Error('Configuration schema is required');
    }
  }

  private async validateConfiguration(
    definition: MCPServerDefinition,
    configuration: Record<string, any>
  ): Promise<void> {
    // Check required fields
    for (const field of definition.configuration.required) {
      if (!(field in configuration)) {
        throw new Error(`Missing required configuration field: ${field}`);
      }
    }

    // This would use a JSON schema validator in production
    // For now, basic validation
    console.log(`Configuration validated for ${definition.name}`);
  }
}

// Export singleton instance
export const mcpServerRegistry = MCPServerRegistry.getInstance();
