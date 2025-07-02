import { EventEmitter } from 'events';
import { AdapterRegistry, BaseAdapter } from '@vibecode/adapter-sdk';
import { structuredLogger } from '../middleware/logging.js';
import {
  comprehensiveAuditLogger,
  AuditCategory,
} from '../security/audit-logger.js';
import { SecurityLevel } from '../security/types.js';

// Adapter health status
export interface AdapterHealth {
  adapterId: string;
  name: string;
  version: string;
  healthy: boolean;
  status: AdapterStatus;
  lastHealthCheck: Date;
  uptime: number;
  errorCount: number;
  lastError?: Error;
  responseTime: number;
  memoryUsage: number;
  resourceLimits: {
    maxMemory: number;
    maxResponseTime: number;
    maxErrorRate: number;
  };
}

// Adapter lifecycle status
export enum AdapterStatus {
  UNLOADED = 'unloaded',
  LOADING = 'loading',
  LOADED = 'loaded',
  INITIALIZING = 'initializing',
  READY = 'ready',
  DEGRADED = 'degraded',
  ERROR = 'error',
  UNLOADING = 'unloading',
  FAILED = 'failed',
}

// Adapter configuration
export interface AdapterConfig {
  enabled: boolean;
  autoStart: boolean;
  priority: number;
  timeout: number;
  retryCount: number;
  retryDelay: number;
  healthCheckInterval: number;
  resourceLimits: {
    maxMemory: number;
    maxResponseTime: number;
    maxErrorRate: number;
  };
  environment: Record<string, string>;
  metadata: Record<string, any>;
}

// Adapter lifecycle event
export interface AdapterLifecycleEvent {
  adapterId: string;
  name: string;
  previousStatus: AdapterStatus;
  currentStatus: AdapterStatus;
  timestamp: Date;
  duration: number;
  error?: Error;
  metadata: Record<string, any>;
}

// Adapter metrics
export interface AdapterMetrics {
  adapterId: string;
  name: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  peakMemoryUsage: number;
  uptime: number;
  errorRate: number;
  lastActivity: Date;
  statusHistory: AdapterLifecycleEvent[];
}

const DEFAULT_CONFIG: AdapterConfig = {
  enabled: true,
  autoStart: true,
  priority: 1,
  timeout: 30000, // 30 seconds
  retryCount: 3,
  retryDelay: 2000, // 2 seconds
  healthCheckInterval: 60000, // 1 minute
  resourceLimits: {
    maxMemory: 256 * 1024 * 1024, // 256MB
    maxResponseTime: 5000, // 5 seconds
    maxErrorRate: 0.1, // 10%
  },
  environment: {},
  metadata: {},
};

export class AdapterLifecycleManager extends EventEmitter {
  private adapterRegistry: AdapterRegistry;
  private adapterStatuses: Map<string, AdapterStatus> = new Map();
  private adapterConfigs: Map<string, AdapterConfig> = new Map();
  private adapterHealth: Map<string, AdapterHealth> = new Map();
  private adapterMetrics: Map<string, AdapterMetrics> = new Map();
  private healthCheckIntervals: Map<string, NodeJS.Timeout> = new Map();
  private lifecycleHistory: Map<string, AdapterLifecycleEvent[]> = new Map();
  private isInitialized = false;

  constructor(adapterRegistry: AdapterRegistry) {
    super();
    this.adapterRegistry = adapterRegistry;
    this.setupEventListeners();
  }

  /**
   * Initialize the adapter lifecycle manager
   */
  initialize(): void {
    if (this.isInitialized) {
      return;
    }

    // Load existing adapters
    this.loadExistingAdapters();

    // Start health monitoring
    this.startGlobalHealthMonitoring();

    this.isInitialized = true;
    structuredLogger.info('Adapter lifecycle manager initialized');
    this.emit('initialized');
  }

  /**
   * Register and load an adapter
   */
  async registerAdapter(
    adapter: BaseAdapter,
    config: Partial<AdapterConfig> = {}
  ): Promise<boolean> {
    const adapterId = this.generateAdapterId(adapter);
    const adapterConfig = { ...DEFAULT_CONFIG, ...config };

    try {
      // Update status to loading
      await this.updateAdapterStatus(adapterId, AdapterStatus.LOADING);

      // Store configuration
      this.adapterConfigs.set(adapterId, adapterConfig);

      // Register with adapter registry
      await this.adapterRegistry.register(adapter);

      // Update status to loaded
      await this.updateAdapterStatus(adapterId, AdapterStatus.LOADED);

      // Initialize health tracking
      this.initializeAdapterHealth(adapterId, adapter);

      // Initialize metrics tracking
      this.initializeAdapterMetrics(adapterId, adapter);

      // Auto-start if enabled
      if (adapterConfig.autoStart) {
        await this.startAdapter(adapterId);
      }

      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.SYSTEM_CHANGES,
        action: 'adapter_registered',
        resourceType: 'adapter',
        resourceId: adapterId,
        userId: 'system',
        sessionId: 'lifecycle_manager',
        outcome: 'success',
        severity: SecurityLevel.SAFE,
        details: {
          adapterName: adapter.name,
          adapterVersion: adapter.version,
          autoStart: adapterConfig.autoStart,
        },
      });

      structuredLogger.info('Adapter registered successfully', {
        adapterId,
        name: adapter.name,
        version: adapter.version,
      });

      this.emit('adapterRegistered', {
        adapterId,
        adapter,
        config: adapterConfig,
      });
      return true;
    } catch (error) {
      await this.updateAdapterStatus(
        adapterId,
        AdapterStatus.FAILED,
        error as Error
      );
      structuredLogger.error('Failed to register adapter', error as Error, {
        adapterId,
      });
      return false;
    }
  }

  /**
   * Start an adapter
   */
  async startAdapter(adapterId: string): Promise<boolean> {
    const status = this.adapterStatuses.get(adapterId);
    if (
      !status ||
      ![AdapterStatus.LOADED, AdapterStatus.ERROR].includes(status)
    ) {
      return false;
    }

    try {
      await this.updateAdapterStatus(adapterId, AdapterStatus.INITIALIZING);

      const adapter = this.getAdapterById(adapterId);
      if (!adapter) {
        throw new Error('Adapter not found');
      }

      // Initialize adapter if it has initialization logic
      if (typeof (adapter as any).initialize === 'function') {
        await (adapter as any).initialize();
      }

      await this.updateAdapterStatus(adapterId, AdapterStatus.READY);

      // Start health monitoring
      this.startAdapterHealthMonitoring(adapterId);

      structuredLogger.info('Adapter started successfully', { adapterId });
      this.emit('adapterStarted', { adapterId });
      return true;
    } catch (error) {
      await this.updateAdapterStatus(
        adapterId,
        AdapterStatus.ERROR,
        error as Error
      );
      return false;
    }
  }

  /**
   * Stop an adapter gracefully
   */
  async stopAdapter(
    adapterId: string,
    graceful: boolean = true
  ): Promise<boolean> {
    const status = this.adapterStatuses.get(adapterId);
    if (!status || status === AdapterStatus.UNLOADED) {
      return false;
    }

    try {
      await this.updateAdapterStatus(adapterId, AdapterStatus.UNLOADING);

      const adapter = this.getAdapterById(adapterId);
      if (adapter && graceful) {
        // Call cleanup if available
        if (typeof (adapter as any).cleanup === 'function') {
          await (adapter as any).cleanup();
        }
      }

      // Stop health monitoring
      this.stopAdapterHealthMonitoring(adapterId);

      await this.updateAdapterStatus(adapterId, AdapterStatus.UNLOADED);

      structuredLogger.info('Adapter stopped', { adapterId, graceful });
      this.emit('adapterStopped', { adapterId, graceful });
      return true;
    } catch (error) {
      await this.updateAdapterStatus(
        adapterId,
        AdapterStatus.ERROR,
        error as Error
      );
      return false;
    }
  }

  /**
   * Restart an adapter
   */
  async restartAdapter(adapterId: string): Promise<boolean> {
    const stopSuccess = await this.stopAdapter(adapterId, true);
    if (!stopSuccess) {
      return false;
    }

    // Wait a moment for cleanup
    await new Promise(resolve => setTimeout(resolve, 1000));

    return await this.startAdapter(adapterId);
  }

  /**
   * Unregister an adapter
   */
  async unregisterAdapter(adapterId: string): Promise<boolean> {
    try {
      // Stop the adapter first
      await this.stopAdapter(adapterId, true);

      // Remove from registry
      const adapter = this.getAdapterById(adapterId);
      if (adapter) {
        this.adapterRegistry.unregister(adapter.name);
      }

      // Clean up tracking data
      this.cleanupAdapterData(adapterId);

      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.SYSTEM_CHANGES,
        action: 'adapter_unregistered',
        resourceType: 'adapter',
        resourceId: adapterId,
        userId: 'system',
        sessionId: 'lifecycle_manager',
        outcome: 'success',
        severity: SecurityLevel.MODERATE,
        details: { adapterId },
      });

      structuredLogger.info('Adapter unregistered', { adapterId });
      this.emit('adapterUnregistered', { adapterId });
      return true;
    } catch (error) {
      structuredLogger.error('Failed to unregister adapter', error as Error, {
        adapterId,
      });
      return false;
    }
  }

  /**
   * Get adapter health status
   */
  getAdapterHealth(adapterId: string): AdapterHealth | null {
    return this.adapterHealth.get(adapterId) || null;
  }

  /**
   * Get adapter metrics
   */
  getAdapterMetrics(adapterId: string): AdapterMetrics | null {
    return this.adapterMetrics.get(adapterId) || null;
  }

  /**
   * Get all adapter statuses
   */
  getAllAdapterStatuses(): Map<string, AdapterStatus> {
    return new Map(this.adapterStatuses);
  }

  /**
   * Get adapters by status
   */
  getAdaptersByStatus(status: AdapterStatus): string[] {
    return Array.from(this.adapterStatuses.entries())
      .filter(([_, adapterStatus]) => adapterStatus === status)
      .map(([adapterId]) => adapterId);
  }

  /**
   * Get lifecycle history for an adapter
   */
  getAdapterLifecycleHistory(
    adapterId: string,
    limit: number = 50
  ): AdapterLifecycleEvent[] {
    const history = this.lifecycleHistory.get(adapterId) || [];
    return history.slice(-limit);
  }

  /**
   * Emergency shutdown all adapters
   */
  async emergencyShutdown(reason: string = 'emergency'): Promise<void> {
    structuredLogger.warn('Emergency adapter shutdown initiated', { reason });

    const activeAdapters = this.getAdaptersByStatus(AdapterStatus.READY);

    const shutdownPromises = activeAdapters.map(adapterId =>
      this.stopAdapter(adapterId, false).catch(error => {
        structuredLogger.error(
          'Emergency shutdown failed for adapter',
          error as Error,
          { adapterId }
        );
      })
    );

    await Promise.all(shutdownPromises);

    this.emit('emergencyShutdown', {
      reason,
      affectedAdapters: activeAdapters,
    });
  }

  // Private methods

  private setupEventListeners(): void {
    // Check if registry supports events (it may extend EventEmitter)
    if (typeof (this.adapterRegistry as any).on === 'function') {
      // Listen for registry events
      (this.adapterRegistry as any).on(
        'adapterRegistered',
        (adapter: BaseAdapter) => {
          const adapterId = this.generateAdapterId(adapter);
          this.updateAdapterStatus(adapterId, AdapterStatus.LOADED);
        }
      );

      (this.adapterRegistry as any).on(
        'adapterUnregistered',
        (adapterName: string) => {
          const adapterId = this.findAdapterIdByName(adapterName);
          if (adapterId) {
            this.cleanupAdapterData(adapterId);
          }
        }
      );
    } else {
      // Registry doesn't support events, we'll manually track adapter changes
      structuredLogger.info(
        'Adapter registry does not support events, using manual tracking'
      );
    }
  }

  private loadExistingAdapters(): void {
    const adapters = this.adapterRegistry.list();
    for (const adapter of adapters) {
      const adapterId = this.generateAdapterId(adapter);
      this.adapterStatuses.set(adapterId, AdapterStatus.LOADED);
      this.initializeAdapterHealth(adapterId, adapter);
      this.initializeAdapterMetrics(adapterId, adapter);
    }
  }

  private generateAdapterId(adapter: BaseAdapter): string {
    return `${adapter.name}@${adapter.version}`;
  }

  private getAdapterById(adapterId: string): BaseAdapter | null {
    const adapters = this.adapterRegistry.list();
    return (
      adapters.find(adapter => this.generateAdapterId(adapter) === adapterId) ||
      null
    );
  }

  private findAdapterIdByName(name: string): string | null {
    for (const [adapterId] of this.adapterStatuses) {
      if (adapterId.startsWith(`${name}@`)) {
        return adapterId;
      }
    }
    return null;
  }

  private async updateAdapterStatus(
    adapterId: string,
    status: AdapterStatus,
    error?: Error
  ): Promise<void> {
    const previousStatus =
      this.adapterStatuses.get(adapterId) || AdapterStatus.UNLOADED;
    const startTime = Date.now();

    this.adapterStatuses.set(adapterId, status);

    // Update health if error
    if (error) {
      const health = this.adapterHealth.get(adapterId);
      if (health) {
        health.healthy = false;
        health.lastError = error;
        health.errorCount++;
      }
    }

    // Record lifecycle event
    const event: AdapterLifecycleEvent = {
      adapterId,
      name: adapterId.split('@')[0],
      previousStatus,
      currentStatus: status,
      timestamp: new Date(),
      duration: Date.now() - startTime,
      error,
      metadata: {},
    };

    const history = this.lifecycleHistory.get(adapterId) || [];
    history.push(event);
    this.lifecycleHistory.set(adapterId, history.slice(-100)); // Keep last 100 events

    this.emit('adapterStatusChanged', event);
  }

  private initializeAdapterHealth(
    adapterId: string,
    adapter: BaseAdapter
  ): void {
    const config = this.adapterConfigs.get(adapterId) || DEFAULT_CONFIG;

    const health: AdapterHealth = {
      adapterId,
      name: adapter.name,
      version: adapter.version,
      healthy: true,
      status: AdapterStatus.LOADED,
      lastHealthCheck: new Date(),
      uptime: 0,
      errorCount: 0,
      responseTime: 0,
      memoryUsage: 0,
      resourceLimits: config.resourceLimits,
    };

    this.adapterHealth.set(adapterId, health);
  }

  private initializeAdapterMetrics(
    adapterId: string,
    adapter: BaseAdapter
  ): void {
    const metrics: AdapterMetrics = {
      adapterId,
      name: adapter.name,
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      peakMemoryUsage: 0,
      uptime: 0,
      errorRate: 0,
      lastActivity: new Date(),
      statusHistory: [],
    };

    this.adapterMetrics.set(adapterId, metrics);
  }

  private startAdapterHealthMonitoring(adapterId: string): void {
    const config = this.adapterConfigs.get(adapterId) || DEFAULT_CONFIG;

    const interval = setInterval(() => {
      this.performAdapterHealthCheck(adapterId);
    }, config.healthCheckInterval);

    this.healthCheckIntervals.set(adapterId, interval);
  }

  private stopAdapterHealthMonitoring(adapterId: string): void {
    const interval = this.healthCheckIntervals.get(adapterId);
    if (interval) {
      clearInterval(interval);
      this.healthCheckIntervals.delete(adapterId);
    }
  }

  private performAdapterHealthCheck(adapterId: string): void {
    const health = this.adapterHealth.get(adapterId);
    const adapter = this.getAdapterById(adapterId);

    if (!health || !adapter) {
      return;
    }

    try {
      const startTime = Date.now();

      // Perform basic health check
      health.lastHealthCheck = new Date();
      health.uptime = Date.now() - health.lastHealthCheck.getTime();

      // Check if adapter has health check method
      if (typeof (adapter as any).healthCheck === 'function') {
        (adapter as any).healthCheck();
      }

      health.responseTime = Date.now() - startTime;
      health.healthy =
        health.responseTime <= health.resourceLimits.maxResponseTime;

      // Update metrics
      const metrics = this.adapterMetrics.get(adapterId);
      if (metrics) {
        metrics.uptime = health.uptime;
        metrics.averageResponseTime =
          (metrics.averageResponseTime + health.responseTime) / 2;
      }

      this.emit('adapterHealthCheck', { adapterId, health });
    } catch (error) {
      health.healthy = false;
      health.lastError = error as Error;
      health.errorCount++;

      this.emit('adapterHealthCheckFailed', { adapterId, error });
    }
  }

  private startGlobalHealthMonitoring(): void {
    setInterval(() => {
      this.performGlobalHealthAssessment();
    }, 30000); // Every 30 seconds
  }

  private performGlobalHealthAssessment(): void {
    const unhealthyAdapters = Array.from(this.adapterHealth.values()).filter(
      health => !health.healthy
    );

    if (unhealthyAdapters.length > 0) {
      this.emit('globalHealthConcern', { unhealthyAdapters });
    }
  }

  private cleanupAdapterData(adapterId: string): void {
    this.adapterStatuses.delete(adapterId);
    this.adapterConfigs.delete(adapterId);
    this.adapterHealth.delete(adapterId);
    this.adapterMetrics.delete(adapterId);
    this.lifecycleHistory.delete(adapterId);
    this.stopAdapterHealthMonitoring(adapterId);
  }
}

// Export factory function to create singleton with actual registry
let adapterLifecycleManagerInstance: AdapterLifecycleManager | null = null;

export function createAdapterLifecycleManager(
  adapterRegistry: AdapterRegistry
): AdapterLifecycleManager {
  if (adapterLifecycleManagerInstance) {
    return adapterLifecycleManagerInstance;
  }

  adapterLifecycleManagerInstance = new AdapterLifecycleManager(
    adapterRegistry
  );
  return adapterLifecycleManagerInstance;
}

export function getAdapterLifecycleManager(): AdapterLifecycleManager {
  if (!adapterLifecycleManagerInstance) {
    throw new Error(
      'Adapter lifecycle manager not initialized. Call createAdapterLifecycleManager first.'
    );
  }
  return adapterLifecycleManagerInstance;
}

// Temporary export for backwards compatibility
export const adapterLifecycleManager = {
  getAllAdapterStatuses: () =>
    getAdapterLifecycleManager().getAllAdapterStatuses(),
  getAdaptersByStatus: (status: AdapterStatus) =>
    getAdapterLifecycleManager().getAdaptersByStatus(status),
  getAdapterHealth: (adapterId: string) =>
    getAdapterLifecycleManager().getAdapterHealth(adapterId),
  getAdapterMetrics: (adapterId: string) =>
    getAdapterLifecycleManager().getAdapterMetrics(adapterId),
  getAdapterLifecycleHistory: (adapterId: string, limit?: number) =>
    getAdapterLifecycleManager().getAdapterLifecycleHistory(adapterId, limit),
  startAdapter: (adapterId: string) =>
    getAdapterLifecycleManager().startAdapter(adapterId),
  stopAdapter: (adapterId: string, graceful?: boolean) =>
    getAdapterLifecycleManager().stopAdapter(adapterId, graceful),
  restartAdapter: (adapterId: string) =>
    getAdapterLifecycleManager().restartAdapter(adapterId),
  emergencyShutdown: (reason?: string) =>
    getAdapterLifecycleManager().emergencyShutdown(reason),
};
