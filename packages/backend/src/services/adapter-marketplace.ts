import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { spawn } from 'child_process';
import { comprehensiveAuditLogger, AuditCategory } from '../security/audit-logger.js';
import { SecurityLevel } from '../security/types.js';

// Adapter Marketplace Types
export interface MarketplaceAdapter {
  id: string;
  name: string;
  displayName: string;
  description: string;
  version: string;
  author: {
    name: string;
    email?: string;
    github?: string;
    website?: string;
  };
  repository: {
    type: 'git' | 'npm' | 'github';
    url: string;
    branch?: string;
    directory?: string;
  };
  license: string;
  tags: string[];
  keywords: string[];
  category: 'ai-assistant' | 'cli-tool' | 'development' | 'automation' | 'utility' | 'other';
  compatibility: {
    platforms: string[]; // ['linux', 'darwin', 'win32']
    nodeVersion?: string;
    bunVersion?: string;
  };
  capabilities: {
    interactive?: boolean;
    streaming?: boolean;
    fileAccess?: boolean;
    networkAccess?: boolean;
    systemAccess?: boolean;
  };
  dependencies: {
    runtime: Record<string, string>;
    peer?: Record<string, string>;
    system?: string[]; // System commands required
  };
  configuration?: {
    schema?: any; // JSON schema for configuration
    required?: string[];
    defaults?: Record<string, any>;
  };
  documentation: {
    readme?: string;
    changelog?: string;
    examples?: string[];
    apiDocs?: string;
  };
  metrics: {
    downloads: number;
    stars: number;
    forks: number;
    issues: number;
    lastUpdate: Date;
    createdAt: Date;
  };
  security: {
    verified: boolean;
    scanned: boolean;
    scanResults?: {
      vulnerabilities: number;
      warnings: number;
      lastScan: Date;
    };
    permissions: string[];
    sandbox: boolean;
  };
  status: 'active' | 'deprecated' | 'archived' | 'security-review' | 'pending-approval';
  installation: {
    command: string;
    postInstall?: string[];
    preUninstall?: string[];
  };
  metadata: {
    featured: boolean;
    official: boolean;
    beta: boolean;
    experimental: boolean;
    minimumVibeCodeVersion?: string;
  };
}

export interface AdapterInstallation {
  id: string;
  adapterId: string;
  version: string;
  installedAt: Date;
  installedBy: string;
  status: 'installing' | 'installed' | 'failed' | 'updating' | 'uninstalling';
  installPath: string;
  configurationId?: string;
  enabled: boolean;
  autoUpdate: boolean;
  lastUpdate?: Date;
  error?: string;
  logs: InstallationLog[];
}

export interface InstallationLog {
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  details?: any;
}

export interface MarketplaceSearch {
  query?: string;
  category?: string;
  tags?: string[];
  author?: string;
  verified?: boolean;
  platform?: string;
  sortBy?: 'downloads' | 'stars' | 'updated' | 'created' | 'name' | 'relevance';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface MarketplaceStats {
  totalAdapters: number;
  totalDownloads: number;
  totalAuthors: number;
  categoryCounts: Record<string, number>;
  recentAdapters: MarketplaceAdapter[];
  popularAdapters: MarketplaceAdapter[];
  featuredAdapters: MarketplaceAdapter[];
}

export class AdapterMarketplace extends EventEmitter {
  private static instance: AdapterMarketplace;
  private adapters: Map<string, MarketplaceAdapter> = new Map();
  private installations: Map<string, AdapterInstallation> = new Map();
  private marketplaceDir: string;
  private installationDir: string;
  private initialized = false;

  constructor() {
    super();
    this.marketplaceDir = join(process.cwd(), '.marketplace');
    this.installationDir = join(process.cwd(), 'adapters');
    this.ensureDirectories();
  }

  static getInstance(): AdapterMarketplace {
    if (!AdapterMarketplace.instance) {
      AdapterMarketplace.instance = new AdapterMarketplace();
    }
    return AdapterMarketplace.instance;
  }

  /**
   * Initialize the adapter marketplace
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await this.loadMarketplaceData();
      await this.loadInstallations();
      await this.syncWithRegistry();
      
      this.initialized = true;
      this.emit('initialized');
      
      console.log('✅ Adapter marketplace initialized');
    } catch (error) {
      console.error('❌ Failed to initialize adapter marketplace:', error);
      throw error;
    }
  }

  /**
   * Search adapters in the marketplace
   */
  async searchAdapters(search: MarketplaceSearch): Promise<{
    adapters: MarketplaceAdapter[];
    total: number;
    offset: number;
    limit: number;
  }> {
    let filteredAdapters = Array.from(this.adapters.values());

    // Apply filters
    if (search.query) {
      const query = search.query.toLowerCase();
      filteredAdapters = filteredAdapters.filter(adapter =>
        adapter.name.toLowerCase().includes(query) ||
        adapter.displayName.toLowerCase().includes(query) ||
        adapter.description.toLowerCase().includes(query) ||
        adapter.keywords.some(keyword => keyword.toLowerCase().includes(query))
      );
    }

    if (search.category) {
      filteredAdapters = filteredAdapters.filter(adapter =>
        adapter.category === search.category
      );
    }

    if (search.tags && search.tags.length > 0) {
      filteredAdapters = filteredAdapters.filter(adapter =>
        search.tags!.some(tag => adapter.tags.includes(tag))
      );
    }

    if (search.author) {
      filteredAdapters = filteredAdapters.filter(adapter =>
        adapter.author.name.toLowerCase().includes(search.author!.toLowerCase())
      );
    }

    if (search.verified !== undefined) {
      filteredAdapters = filteredAdapters.filter(adapter =>
        adapter.security.verified === search.verified
      );
    }

    if (search.platform) {
      filteredAdapters = filteredAdapters.filter(adapter =>
        adapter.compatibility.platforms.includes(search.platform!)
      );
    }

    // Sort results
    const sortBy = search.sortBy || 'relevance';
    const sortOrder = search.sortOrder || 'desc';
    
    filteredAdapters.sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'downloads':
          comparison = a.metrics.downloads - b.metrics.downloads;
          break;
        case 'stars':
          comparison = a.metrics.stars - b.metrics.stars;
          break;
        case 'updated':
          comparison = a.metrics.lastUpdate.getTime() - b.metrics.lastUpdate.getTime();
          break;
        case 'created':
          comparison = a.metrics.createdAt.getTime() - b.metrics.createdAt.getTime();
          break;
        case 'name':
          comparison = a.displayName.localeCompare(b.displayName);
          break;
        case 'relevance':
        default:
          // Relevance score based on various factors
          const scoreA = this.calculateRelevanceScore(a, search.query || '');
          const scoreB = this.calculateRelevanceScore(b, search.query || '');
          comparison = scoreA - scoreB;
          break;
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    // Apply pagination
    const offset = search.offset || 0;
    const limit = Math.min(search.limit || 50, 100);
    const paginatedAdapters = filteredAdapters.slice(offset, offset + limit);

    return {
      adapters: paginatedAdapters,
      total: filteredAdapters.length,
      offset,
      limit,
    };
  }

  /**
   * Get adapter details by ID
   */
  async getAdapter(adapterId: string): Promise<MarketplaceAdapter | null> {
    return this.adapters.get(adapterId) || null;
  }

  /**
   * Install an adapter from the marketplace
   */
  async installAdapter(
    adapterId: string,
    version?: string,
    userId?: string,
    options: {
      autoUpdate?: boolean;
      configureAfterInstall?: boolean;
      enableAfterInstall?: boolean;
    } = {}
  ): Promise<AdapterInstallation> {
    const adapter = this.adapters.get(adapterId);
    if (!adapter) {
      throw new Error(`Adapter not found: ${adapterId}`);
    }

    const installationId = uuidv4();
    const targetVersion = version || adapter.version;
    const installPath = join(this.installationDir, adapter.name);

    const installation: AdapterInstallation = {
      id: installationId,
      adapterId,
      version: targetVersion,
      installedAt: new Date(),
      installedBy: userId || 'system',
      status: 'installing',
      installPath,
      enabled: options.enableAfterInstall || false,
      autoUpdate: options.autoUpdate || false,
      logs: [],
    };

    this.installations.set(installationId, installation);
    this.emit('installationStarted', installation);

    try {
      // Security validation
      await this.validateAdapterSecurity(adapter);
      
      // Check system requirements
      await this.checkSystemRequirements(adapter);
      
      // Download and install
      await this.performInstallation(adapter, installation, targetVersion);
      
      // Post-installation configuration
      if (options.configureAfterInstall) {
        await this.configureAfterInstall(adapter, installation);
      }
      
      installation.status = 'installed';
      installation.lastUpdate = new Date();
      
      this.emit('installationCompleted', installation);
      
      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.SYSTEM_CHANGES,
        action: 'adapter_installed',
        resourceType: 'marketplace_adapter',
        resourceId: adapterId,
        userId: userId || 'system',
        outcome: 'success',
        severity: SecurityLevel.MODERATE,
        details: {
          adapterName: adapter.name,
          version: targetVersion,
          installPath,
          autoUpdate: installation.autoUpdate,
        },
      });
      
      return installation;
      
    } catch (error) {
      installation.status = 'failed';
      installation.error = (error as Error).message;
      
      this.addInstallationLog(installation, 'error', 'Installation failed', error);
      this.emit('installationFailed', installation, error);
      
      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.SYSTEM_CHANGES,
        action: 'adapter_installation_failed',
        resourceType: 'marketplace_adapter',
        resourceId: adapterId,
        userId: userId || 'system',
        outcome: 'failure',
        severity: SecurityLevel.MODERATE,
        details: {
          adapterName: adapter.name,
          error: (error as Error).message,
        },
      });
      
      throw error;
    }
  }

  /**
   * Uninstall an adapter
   */
  async uninstallAdapter(adapterId: string, userId?: string): Promise<void> {
    const installation = this.findInstallationByAdapterId(adapterId);
    if (!installation) {
      throw new Error(`Adapter not installed: ${adapterId}`);
    }

    const adapter = this.adapters.get(adapterId);
    if (!adapter) {
      throw new Error(`Adapter not found: ${adapterId}`);
    }

    try {
      installation.status = 'uninstalling';
      this.emit('uninstallationStarted', installation);
      
      // Run pre-uninstall scripts
      if (adapter.installation.preUninstall) {
        await this.runPreUninstallScripts(adapter, installation);
      }
      
      // Remove installation directory
      if (existsSync(installation.installPath)) {
        await fs.rm(installation.installPath, { recursive: true, force: true });
      }
      
      // Remove from installations
      this.installations.delete(installation.id);
      
      this.emit('uninstallationCompleted', installation);
      
      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.SYSTEM_CHANGES,
        action: 'adapter_uninstalled',
        resourceType: 'marketplace_adapter',
        resourceId: adapterId,
        userId: userId || 'system',
        outcome: 'success',
        severity: SecurityLevel.MODERATE,
        details: {
          adapterName: adapter.name,
          installPath: installation.installPath,
        },
      });
      
    } catch (error) {
      installation.status = 'failed';
      installation.error = (error as Error).message;
      
      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.SYSTEM_CHANGES,
        action: 'adapter_uninstallation_failed',
        resourceType: 'marketplace_adapter',
        resourceId: adapterId,
        userId: userId || 'system',
        outcome: 'failure',
        severity: SecurityLevel.MODERATE,
        details: {
          adapterName: adapter.name,
          error: (error as Error).message,
        },
      });
      
      throw error;
    }
  }

  /**
   * Get marketplace statistics
   */
  async getMarketplaceStats(): Promise<MarketplaceStats> {
    const adapters = Array.from(this.adapters.values());
    
    const categoryCounts = adapters.reduce((counts, adapter) => {
      counts[adapter.category] = (counts[adapter.category] || 0) + 1;
      return counts;
    }, {} as Record<string, number>);
    
    const recentAdapters = adapters
      .filter(a => a.status === 'active')
      .sort((a, b) => b.metrics.createdAt.getTime() - a.metrics.createdAt.getTime())
      .slice(0, 10);
    
    const popularAdapters = adapters
      .filter(a => a.status === 'active')
      .sort((a, b) => b.metrics.downloads - a.metrics.downloads)
      .slice(0, 10);
    
    const featuredAdapters = adapters
      .filter(a => a.status === 'active' && a.metadata.featured)
      .slice(0, 10);

    return {
      totalAdapters: adapters.length,
      totalDownloads: adapters.reduce((total, a) => total + a.metrics.downloads, 0),
      totalAuthors: new Set(adapters.map(a => a.author.name)).size,
      categoryCounts,
      recentAdapters,
      popularAdapters,
      featuredAdapters,
    };
  }

  /**
   * Get installed adapters
   */
  getInstalledAdapters(): AdapterInstallation[] {
    return Array.from(this.installations.values());
  }

  /**
   * Submit adapter to marketplace
   */
  async submitAdapter(
    adapterData: Omit<MarketplaceAdapter, 'id' | 'metrics' | 'status'>,
    submitterId: string
  ): Promise<string> {
    const adapterId = uuidv4();
    
    const adapter: MarketplaceAdapter = {
      ...adapterData,
      id: adapterId,
      metrics: {
        downloads: 0,
        stars: 0,
        forks: 0,
        issues: 0,
        lastUpdate: new Date(),
        createdAt: new Date(),
      },
      status: 'pending-approval',
    };
    
    // Validate adapter submission
    await this.validateAdapterSubmission(adapter);
    
    // Security scan
    await this.performSecurityScan(adapter);
    
    this.adapters.set(adapterId, adapter);
    await this.saveMarketplaceData();
    
    this.emit('adapterSubmitted', adapter, submitterId);
    
    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'adapter_submitted',
      resourceType: 'marketplace_adapter',
      resourceId: adapterId,
      userId: submitterId,
      outcome: 'success',
      severity: SecurityLevel.SAFE,
      details: {
        adapterName: adapter.name,
        author: adapter.author.name,
        category: adapter.category,
      },
    });
    
    return adapterId;
  }

  // Private methods

  private ensureDirectories(): void {
    if (!existsSync(this.marketplaceDir)) {
      mkdirSync(this.marketplaceDir, { recursive: true });
    }
    if (!existsSync(this.installationDir)) {
      mkdirSync(this.installationDir, { recursive: true });
    }
  }

  private async loadMarketplaceData(): Promise<void> {
    const dataPath = join(this.marketplaceDir, 'adapters.json');
    if (existsSync(dataPath)) {
      try {
        const data = await fs.readFile(dataPath, 'utf8');
        const adapters = JSON.parse(data);
        for (const adapter of adapters) {
          // Convert date strings back to Date objects
          adapter.metrics.lastUpdate = new Date(adapter.metrics.lastUpdate);
          adapter.metrics.createdAt = new Date(adapter.metrics.createdAt);
          this.adapters.set(adapter.id, adapter);
        }
      } catch (error) {
        console.warn('Failed to load marketplace data:', error);
      }
    }
    
    // Load default/official adapters if empty
    if (this.adapters.size === 0) {
      await this.loadDefaultAdapters();
    }
  }

  private async loadDefaultAdapters(): Promise<void> {
    const defaultAdapters = [
      {
        id: 'claude-code-official',
        name: 'claude-code',
        displayName: 'Claude Code (Official)',
        description: 'Official Claude Code adapter for Anthropic\'s Claude AI assistant',
        version: '1.0.0',
        author: {
          name: 'Anthropic',
          website: 'https://anthropic.com',
          github: 'anthropics',
        },
        repository: {
          type: 'github' as const,
          url: 'https://github.com/anthropics/claude-code',
        },
        license: 'MIT',
        tags: ['ai', 'assistant', 'claude', 'anthropic', 'official'],
        keywords: ['claude', 'ai', 'coding', 'assistant'],
        category: 'ai-assistant' as const,
        compatibility: {
          platforms: ['linux', 'darwin', 'win32'],
          nodeVersion: '>=18.0.0',
        },
        capabilities: {
          interactive: true,
          streaming: true,
          fileAccess: true,
          networkAccess: true,
        },
        dependencies: {
          runtime: {},
          system: ['git'],
        },
        documentation: {
          readme: 'https://github.com/anthropics/claude-code/blob/main/README.md',
        },
        metrics: {
          downloads: 10000,
          stars: 500,
          forks: 50,
          issues: 10,
          lastUpdate: new Date(),
          createdAt: new Date('2024-01-01'),
        },
        security: {
          verified: true,
          scanned: true,
          permissions: ['file:read', 'file:write', 'network:request'],
          sandbox: false,
        },
        status: 'active' as const,
        installation: {
          command: 'npm install -g claude-code',
        },
        metadata: {
          featured: true,
          official: true,
          beta: false,
          experimental: false,
        },
      },
      // Add more default adapters as needed
    ];

    for (const adapterData of defaultAdapters) {
      this.adapters.set(adapterData.id, adapterData as MarketplaceAdapter);
    }
  }

  private async loadInstallations(): Promise<void> {
    const installationsPath = join(this.marketplaceDir, 'installations.json');
    if (existsSync(installationsPath)) {
      try {
        const data = await fs.readFile(installationsPath, 'utf8');
        const installations = JSON.parse(data);
        for (const installation of installations) {
          installation.installedAt = new Date(installation.installedAt);
          if (installation.lastUpdate) {
            installation.lastUpdate = new Date(installation.lastUpdate);
          }
          installation.logs = installation.logs.map((log: any) => ({
            ...log,
            timestamp: new Date(log.timestamp),
          }));
          this.installations.set(installation.id, installation);
        }
      } catch (error) {
        console.warn('Failed to load installations:', error);
      }
    }
  }

  private async saveMarketplaceData(): Promise<void> {
    const dataPath = join(this.marketplaceDir, 'adapters.json');
    const adapters = Array.from(this.adapters.values());
    await fs.writeFile(dataPath, JSON.stringify(adapters, null, 2));
  }

  private async syncWithRegistry(): Promise<void> {
    // This would sync with external registries (npm, GitHub, etc.)
    // For now, it's a placeholder
    console.log('Syncing with external registries...');
  }

  private calculateRelevanceScore(adapter: MarketplaceAdapter, query: string): number {
    let score = 0;
    const queryLower = query.toLowerCase();
    
    // Name match (highest weight)
    if (adapter.name.toLowerCase().includes(queryLower)) score += 100;
    if (adapter.displayName.toLowerCase().includes(queryLower)) score += 80;
    
    // Description match
    if (adapter.description.toLowerCase().includes(queryLower)) score += 50;
    
    // Keywords match
    for (const keyword of adapter.keywords) {
      if (keyword.toLowerCase().includes(queryLower)) score += 30;
    }
    
    // Tags match
    for (const tag of adapter.tags) {
      if (tag.toLowerCase().includes(queryLower)) score += 20;
    }
    
    // Popularity boost
    score += Math.log(adapter.metrics.downloads + 1) * 0.1;
    score += adapter.metrics.stars * 0.05;
    
    // Official/verified boost
    if (adapter.metadata.official) score += 50;
    if (adapter.security.verified) score += 25;
    if (adapter.metadata.featured) score += 30;
    
    return score;
  }

  private async validateAdapterSecurity(adapter: MarketplaceAdapter): Promise<void> {
    if (!adapter.security.verified) {
      console.warn(`Installing unverified adapter: ${adapter.name}`);
    }
    
    if (adapter.security.scanResults && adapter.security.scanResults.vulnerabilities > 0) {
      throw new Error(`Adapter has known security vulnerabilities: ${adapter.name}`);
    }
  }

  private async checkSystemRequirements(adapter: MarketplaceAdapter): Promise<void> {
    const platform = process.platform;
    if (!adapter.compatibility.platforms.includes(platform)) {
      throw new Error(`Adapter not compatible with platform: ${platform}`);
    }
    
    // Check Node.js version if specified
    if (adapter.compatibility.nodeVersion) {
      const nodeVersion = process.version;
      // Simple version check (in production, use semver)
      if (adapter.compatibility.nodeVersion.includes('>=')) {
        const required = adapter.compatibility.nodeVersion.replace('>=', '');
        if (nodeVersion < required) {
          throw new Error(`Node.js version ${required} or higher required`);
        }
      }
    }
  }

  private async performInstallation(
    adapter: MarketplaceAdapter,
    installation: AdapterInstallation,
    version: string
  ): Promise<void> {
    this.addInstallationLog(installation, 'info', 'Starting installation');
    
    // Create installation directory
    if (!existsSync(installation.installPath)) {
      mkdirSync(installation.installPath, { recursive: true });
    }
    
    // Execute installation command
    await this.executeCommand(
      adapter.installation.command,
      installation.installPath,
      installation
    );
    
    // Run post-install scripts
    if (adapter.installation.postInstall) {
      for (const script of adapter.installation.postInstall) {
        await this.executeCommand(script, installation.installPath, installation);
      }
    }
    
    this.addInstallationLog(installation, 'info', 'Installation completed successfully');
  }

  private async executeCommand(
    command: string,
    workingDir: string,
    installation: AdapterInstallation
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const [cmd, ...args] = command.split(' ');
      const process = spawn(cmd, args, {
        cwd: workingDir,
        stdio: 'pipe',
      });
      
      let stdout = '';
      let stderr = '';
      
      process.stdout?.on('data', (data) => {
        stdout += data.toString();
      });
      
      process.stderr?.on('data', (data) => {
        stderr += data.toString();
      });
      
      process.on('close', (code) => {
        if (code === 0) {
          this.addInstallationLog(installation, 'info', `Command completed: ${command}`, { stdout });
          resolve();
        } else {
          this.addInstallationLog(installation, 'error', `Command failed: ${command}`, { stderr, code });
          reject(new Error(`Command failed with code ${code}: ${stderr}`));
        }
      });
      
      process.on('error', (error) => {
        this.addInstallationLog(installation, 'error', `Command error: ${command}`, error);
        reject(error);
      });
    });
  }

  private addInstallationLog(
    installation: AdapterInstallation,
    level: InstallationLog['level'],
    message: string,
    details?: any
  ): void {
    installation.logs.push({
      timestamp: new Date(),
      level,
      message,
      details,
    });
  }

  private findInstallationByAdapterId(adapterId: string): AdapterInstallation | null {
    for (const installation of this.installations.values()) {
      if (installation.adapterId === adapterId) {
        return installation;
      }
    }
    return null;
  }

  private async configureAfterInstall(
    adapter: MarketplaceAdapter,
    installation: AdapterInstallation
  ): Promise<void> {
    // This would integrate with the adapter configuration system
    // For now, it's a placeholder
    this.addInstallationLog(installation, 'info', 'Configuration completed');
  }

  private async runPreUninstallScripts(
    adapter: MarketplaceAdapter,
    installation: AdapterInstallation
  ): Promise<void> {
    if (adapter.installation.preUninstall) {
      for (const script of adapter.installation.preUninstall) {
        await this.executeCommand(script, installation.installPath, installation);
      }
    }
  }

  private async validateAdapterSubmission(adapter: MarketplaceAdapter): Promise<void> {
    // Validate required fields
    if (!adapter.name || !adapter.displayName || !adapter.description) {
      throw new Error('Missing required adapter fields');
    }
    
    // Validate repository URL
    if (!adapter.repository.url) {
      throw new Error('Repository URL is required');
    }
    
    // Check for duplicate names
    for (const existing of this.adapters.values()) {
      if (existing.name === adapter.name && existing.id !== adapter.id) {
        throw new Error(`Adapter name already exists: ${adapter.name}`);
      }
    }
  }

  private async performSecurityScan(adapter: MarketplaceAdapter): Promise<void> {
    // This would perform actual security scanning
    // For now, it's a placeholder
    adapter.security.scanned = true;
    adapter.security.scanResults = {
      vulnerabilities: 0,
      warnings: 0,
      lastScan: new Date(),
    };
  }
}

// Export singleton instance
export const adapterMarketplace = AdapterMarketplace.getInstance();