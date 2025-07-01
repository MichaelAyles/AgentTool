import { EventEmitter } from 'events';
import { Docker } from 'dockerode';
import { structuredLogger } from '../middleware/logging.js';
import { sandboxManager } from './sandbox-manager.js';
import { orchestrationManager } from './orchestration-manager.js';
import { resourceMonitor } from './resource-monitor.js';

export interface CleanupRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  schedule: string; // Cron expression
  conditions: {
    maxAge?: number; // milliseconds
    status?: ('exited' | 'stopped' | 'failed')[];
    labels?: Record<string, string>;
    memoryThreshold?: number; // bytes
    cpuThreshold?: number; // percentage
    inactiveFor?: number; // milliseconds
    diskUsageThreshold?: number; // bytes
  };
  actions: {
    stop?: boolean;
    remove?: boolean;
    removeVolumes?: boolean;
    removeImages?: boolean;
    alert?: boolean;
  };
  dryRun: boolean;
  retentionPolicy?: {
    keepLast?: number; // Keep last N containers
    keepRunning?: boolean; // Never clean running containers
    gracePeriod?: number; // Grace period before force removal
  };
}

export interface CleanupResult {
  ruleId: string;
  ruleName: string;
  timestamp: Date;
  containersProcessed: number;
  containersRemoved: number;
  volumesRemoved: number;
  imagesRemoved: number;
  bytesFreed: number;
  errors: Array<{
    containerId: string;
    error: string;
  }>;
  dryRun: boolean;
}

export interface CleanupStats {
  totalRuns: number;
  totalContainersRemoved: number;
  totalVolumesRemoved: number;
  totalImagesRemoved: number;
  totalBytesFreed: number;
  lastRun: Date | null;
  lastSuccess: Date | null;
  lastError: Date | null;
  averageRunTime: number;
}

export class ContainerCleanup extends EventEmitter {
  private docker: Docker;
  private rules = new Map<string, CleanupRule>();
  private cleanupHistory: CleanupResult[] = [];
  private scheduledJobs = new Map<string, NodeJS.Timeout>();
  private stats: CleanupStats = {
    totalRuns: 0,
    totalContainersRemoved: 0,
    totalVolumesRemoved: 0,
    totalImagesRemoved: 0,
    totalBytesFreed: 0,
    lastRun: null,
    lastSuccess: null,
    lastError: null,
    averageRunTime: 0,
  };

  private config = {
    historyRetention: 86400000 * 30, // 30 days
    maxHistoryEntries: 1000,
    defaultGracePeriod: 30000, // 30 seconds
    forceRemovalTimeout: 60000, // 1 minute
  };

  constructor() {
    super();

    this.docker = new Docker({
      socketPath: process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock',
    });

    this.initializeDefaultRules();
    this.startCleanupScheduler();

    structuredLogger.info('Container cleanup manager initialized');
  }

  /**
   * Add or update a cleanup rule
   */
  addRule(rule: CleanupRule): void {
    this.rules.set(rule.id, rule);

    if (rule.enabled) {
      this.scheduleRule(rule);
    }

    this.emit('ruleAdded', rule);
    structuredLogger.info('Cleanup rule added', {
      ruleId: rule.id,
      name: rule.name,
      enabled: rule.enabled,
    });
  }

  /**
   * Remove a cleanup rule
   */
  removeRule(ruleId: string): boolean {
    const rule = this.rules.get(ruleId);
    if (!rule) return false;

    this.unscheduleRule(ruleId);
    this.rules.delete(ruleId);

    this.emit('ruleRemoved', { ruleId });
    structuredLogger.info('Cleanup rule removed', { ruleId });

    return true;
  }

  /**
   * Enable or disable a rule
   */
  toggleRule(ruleId: string, enabled: boolean): boolean {
    const rule = this.rules.get(ruleId);
    if (!rule) return false;

    rule.enabled = enabled;

    if (enabled) {
      this.scheduleRule(rule);
    } else {
      this.unscheduleRule(ruleId);
    }

    this.emit('ruleToggled', { ruleId, enabled });
    structuredLogger.info('Cleanup rule toggled', { ruleId, enabled });

    return true;
  }

  /**
   * Execute a cleanup rule manually
   */
  async executeRule(
    ruleId: string,
    dryRun: boolean = false
  ): Promise<CleanupResult> {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      throw new Error(`Cleanup rule ${ruleId} not found`);
    }

    const startTime = Date.now();

    try {
      structuredLogger.info('Starting cleanup execution', {
        ruleId,
        ruleName: rule.name,
        dryRun,
      });

      const result = await this.performCleanup(rule, dryRun);

      // Update stats
      this.stats.totalRuns++;
      this.stats.lastRun = new Date();
      this.stats.lastSuccess = new Date();
      this.stats.averageRunTime =
        (this.stats.averageRunTime + (Date.now() - startTime)) / 2;

      if (!dryRun) {
        this.stats.totalContainersRemoved += result.containersRemoved;
        this.stats.totalVolumesRemoved += result.volumesRemoved;
        this.stats.totalImagesRemoved += result.imagesRemoved;
        this.stats.totalBytesFreed += result.bytesFreed;
      }

      this.cleanupHistory.push(result);
      this.trimHistory();

      this.emit('cleanupCompleted', result);
      structuredLogger.info('Cleanup completed successfully', {
        ruleId,
        containersRemoved: result.containersRemoved,
        volumesRemoved: result.volumesRemoved,
        imagesRemoved: result.imagesRemoved,
        bytesFreed: result.bytesFreed,
        dryRun,
      });

      return result;
    } catch (error) {
      this.stats.lastError = new Date();

      const result: CleanupResult = {
        ruleId,
        ruleName: rule.name,
        timestamp: new Date(),
        containersProcessed: 0,
        containersRemoved: 0,
        volumesRemoved: 0,
        imagesRemoved: 0,
        bytesFreed: 0,
        errors: [{ containerId: 'system', error: (error as Error).message }],
        dryRun,
      };

      this.cleanupHistory.push(result);
      this.emit('cleanupFailed', { ruleId, error });

      structuredLogger.error('Cleanup execution failed', error as Error, {
        ruleId,
      });
      throw error;
    }
  }

  /**
   * Execute all enabled rules
   */
  async executeAllRules(dryRun: boolean = false): Promise<CleanupResult[]> {
    const results: CleanupResult[] = [];
    const enabledRules = Array.from(this.rules.values()).filter(r => r.enabled);

    for (const rule of enabledRules) {
      try {
        const result = await this.executeRule(rule.id, dryRun);
        results.push(result);
      } catch (error) {
        structuredLogger.error(
          'Failed to execute cleanup rule',
          error as Error,
          {
            ruleId: rule.id,
          }
        );
      }
    }

    return results;
  }

  /**
   * Get cleanup statistics
   */
  getStats(): CleanupStats {
    return { ...this.stats };
  }

  /**
   * Get cleanup history
   */
  getHistory(limit: number = 100): CleanupResult[] {
    return this.cleanupHistory
      .slice(-limit)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Get all cleanup rules
   */
  getRules(): CleanupRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Get a specific cleanup rule
   */
  getRule(ruleId: string): CleanupRule | undefined {
    return this.rules.get(ruleId);
  }

  /**
   * Force cleanup of specific containers
   */
  async forceCleanup(
    containerIds: string[],
    options: {
      removeVolumes?: boolean;
      removeImages?: boolean;
      gracePeriod?: number;
    } = {}
  ): Promise<{
    successful: string[];
    failed: Array<{ containerId: string; error: string }>;
  }> {
    const successful: string[] = [];
    const failed: Array<{ containerId: string; error: string }> = [];

    for (const containerId of containerIds) {
      try {
        await this.cleanupContainer(
          containerId,
          {
            stop: true,
            remove: true,
            removeVolumes: options.removeVolumes || false,
            removeImages: options.removeImages || false,
          },
          options.gracePeriod || this.config.defaultGracePeriod
        );

        successful.push(containerId);
      } catch (error) {
        failed.push({
          containerId,
          error: (error as Error).message,
        });
      }
    }

    this.emit('forceCleanupCompleted', { successful, failed });

    return { successful, failed };
  }

  // Private methods

  private initializeDefaultRules(): void {
    // Rule 1: Clean up exited containers older than 24 hours
    this.addRule({
      id: 'cleanup-exited-24h',
      name: 'Clean Exited Containers (24h)',
      description:
        'Remove containers that have been in exited state for more than 24 hours',
      enabled: true,
      schedule: '0 2 * * *', // Daily at 2 AM
      conditions: {
        maxAge: 86400000, // 24 hours
        status: ['exited'],
      },
      actions: {
        remove: true,
        removeVolumes: false,
        alert: true,
      },
      dryRun: false,
      retentionPolicy: {
        keepLast: 5,
        gracePeriod: 30000,
      },
    });

    // Rule 2: Clean up failed containers older than 1 hour
    this.addRule({
      id: 'cleanup-failed-1h',
      name: 'Clean Failed Containers (1h)',
      description: 'Remove containers that failed and are older than 1 hour',
      enabled: true,
      schedule: '0 * * * *', // Hourly
      conditions: {
        maxAge: 3600000, // 1 hour
        status: ['failed'],
      },
      actions: {
        remove: true,
        removeVolumes: true,
        alert: true,
      },
      dryRun: false,
      retentionPolicy: {
        keepLast: 3,
        gracePeriod: 60000,
      },
    });

    // Rule 3: Clean up high memory usage containers
    this.addRule({
      id: 'cleanup-high-memory',
      name: 'Clean High Memory Containers',
      description: 'Stop containers using more than 95% of their memory limit',
      enabled: true,
      schedule: '*/15 * * * *', // Every 15 minutes
      conditions: {
        memoryThreshold: 0.95, // 95% of limit
      },
      actions: {
        stop: true,
        alert: true,
      },
      dryRun: false,
      retentionPolicy: {
        keepRunning: false,
        gracePeriod: 30000,
      },
    });

    // Rule 4: Clean up inactive containers
    this.addRule({
      id: 'cleanup-inactive-7d',
      name: 'Clean Inactive Containers (7d)',
      description: 'Remove containers inactive for more than 7 days',
      enabled: false, // Disabled by default
      schedule: '0 3 * * 0', // Weekly on Sunday at 3 AM
      conditions: {
        inactiveFor: 604800000, // 7 days
      },
      actions: {
        remove: true,
        removeVolumes: true,
        removeImages: false,
        alert: true,
      },
      dryRun: true, // Start as dry run
      retentionPolicy: {
        keepLast: 10,
        keepRunning: true,
        gracePeriod: 60000,
      },
    });
  }

  private scheduleRule(rule: CleanupRule): void {
    this.unscheduleRule(rule.id);

    // Parse cron schedule (simplified - in production use a proper cron library)
    const interval = this.parseCronToInterval(rule.schedule);

    const job = setInterval(async () => {
      try {
        await this.executeRule(rule.id, rule.dryRun);
      } catch (error) {
        structuredLogger.error('Scheduled cleanup failed', error as Error, {
          ruleId: rule.id,
        });
      }
    }, interval);

    this.scheduledJobs.set(rule.id, job);
  }

  private unscheduleRule(ruleId: string): void {
    const job = this.scheduledJobs.get(ruleId);
    if (job) {
      clearInterval(job);
      this.scheduledJobs.delete(ruleId);
    }
  }

  private parseCronToInterval(cronExpression: string): number {
    // Simplified cron parsing - in production use a proper cron library
    const parts = cronExpression.split(' ');

    // For this demo, convert some common patterns
    if (cronExpression === '0 2 * * *') return 86400000; // Daily
    if (cronExpression === '0 * * * *') return 3600000; // Hourly
    if (cronExpression === '*/15 * * * *') return 900000; // Every 15 minutes
    if (cronExpression === '0 3 * * 0') return 604800000; // Weekly

    return 3600000; // Default to hourly
  }

  private async performCleanup(
    rule: CleanupRule,
    dryRun: boolean
  ): Promise<CleanupResult> {
    const result: CleanupResult = {
      ruleId: rule.id,
      ruleName: rule.name,
      timestamp: new Date(),
      containersProcessed: 0,
      containersRemoved: 0,
      volumesRemoved: 0,
      imagesRemoved: 0,
      bytesFreed: 0,
      errors: [],
      dryRun,
    };

    // Get all containers
    const containers = await this.docker.listContainers({ all: true });

    for (const containerInfo of containers) {
      try {
        if (await this.matchesRule(containerInfo, rule)) {
          result.containersProcessed++;

          if (!dryRun) {
            const bytesFreed = await this.cleanupContainer(
              containerInfo.Id,
              rule.actions,
              rule.retentionPolicy?.gracePeriod ||
                this.config.defaultGracePeriod
            );

            result.containersRemoved++;
            result.bytesFreed += bytesFreed;

            if (rule.actions.removeVolumes) {
              result.volumesRemoved++;
            }

            if (rule.actions.removeImages) {
              result.imagesRemoved++;
            }
          }
        }
      } catch (error) {
        result.errors.push({
          containerId: containerInfo.Id,
          error: (error as Error).message,
        });
      }
    }

    return result;
  }

  private async matchesRule(
    containerInfo: any,
    rule: CleanupRule
  ): Promise<boolean> {
    // Check age condition
    if (rule.conditions.maxAge) {
      const created = new Date(containerInfo.Created * 1000);
      const age = Date.now() - created.getTime();
      if (age < rule.conditions.maxAge) return false;
    }

    // Check status condition
    if (rule.conditions.status) {
      if (!rule.conditions.status.includes(containerInfo.State)) return false;
    }

    // Check labels condition
    if (rule.conditions.labels) {
      for (const [key, value] of Object.entries(rule.conditions.labels)) {
        if (containerInfo.Labels?.[key] !== value) return false;
      }
    }

    // Check memory threshold
    if (rule.conditions.memoryThreshold) {
      const metrics = resourceMonitor.getMetrics(containerInfo.Id);
      if (metrics.length > 0) {
        const latest = metrics[metrics.length - 1];
        const usage = latest.memory.usage / latest.memory.limit;
        if (usage < rule.conditions.memoryThreshold) return false;
      }
    }

    // Check CPU threshold
    if (rule.conditions.cpuThreshold) {
      const metrics = resourceMonitor.getMetrics(containerInfo.Id);
      if (metrics.length > 0) {
        const latest = metrics[metrics.length - 1];
        if (latest.cpu.usage < rule.conditions.cpuThreshold) return false;
      }
    }

    // Check inactive condition
    if (rule.conditions.inactiveFor) {
      const metrics = resourceMonitor.getMetrics(containerInfo.Id);
      if (metrics.length > 0) {
        const latest = metrics[metrics.length - 1];
        const inactive = Date.now() - latest.timestamp.getTime();
        if (inactive < rule.conditions.inactiveFor) return false;
      }
    }

    return true;
  }

  private async cleanupContainer(
    containerId: string,
    actions: CleanupRule['actions'],
    gracePeriod: number
  ): Promise<number> {
    let bytesFreed = 0;
    const container = this.docker.getContainer(containerId);

    try {
      // Get container info for size calculation
      const inspect = await container.inspect();
      const sizeBefore = inspect.SizeRw || 0;

      // Stop container if requested
      if (actions.stop) {
        try {
          await container.stop({ t: Math.floor(gracePeriod / 1000) });
        } catch (error) {
          // Container might already be stopped
        }
      }

      // Remove container if requested
      if (actions.remove) {
        await container.remove({
          force: true,
          v: actions.removeVolumes || false,
        });
        bytesFreed += sizeBefore;
      }

      // Remove associated images if requested
      if (actions.removeImages && inspect.Image) {
        try {
          const image = this.docker.getImage(inspect.Image);
          await image.remove({ force: true });
          // Would need to calculate image size
        } catch (error) {
          // Image might be used by other containers
        }
      }

      // Remove from monitoring
      resourceMonitor.removeContainer(containerId);
    } catch (error) {
      structuredLogger.error('Failed to cleanup container', error as Error, {
        containerId,
      });
      throw error;
    }

    return bytesFreed;
  }

  private startCleanupScheduler(): void {
    // Schedule all enabled rules
    for (const rule of this.rules.values()) {
      if (rule.enabled) {
        this.scheduleRule(rule);
      }
    }
  }

  private trimHistory(): void {
    // Remove old history entries
    const cutoff = new Date(Date.now() - this.config.historyRetention);
    this.cleanupHistory = this.cleanupHistory.filter(
      h => h.timestamp >= cutoff
    );

    // Limit total entries
    if (this.cleanupHistory.length > this.config.maxHistoryEntries) {
      this.cleanupHistory = this.cleanupHistory.slice(
        -this.config.maxHistoryEntries
      );
    }
  }

  /**
   * Close the container cleanup manager
   */
  close(): void {
    // Clear all scheduled jobs
    for (const job of this.scheduledJobs.values()) {
      clearInterval(job);
    }
    this.scheduledJobs.clear();

    this.removeAllListeners();
    structuredLogger.info('Container cleanup manager closed');
  }
}

// Export singleton instance
export const containerCleanup = new ContainerCleanup();
