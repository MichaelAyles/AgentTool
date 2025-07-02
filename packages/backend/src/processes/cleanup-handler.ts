import { EventEmitter } from 'events';
import {
  processStateMachine,
  ProcessState,
  ProcessEvent,
} from './state-machine.js';
import { processLifecycleManager } from './lifecycle-manager.js';
import { structuredLogger } from '../middleware/logging.js';
import {
  comprehensiveAuditLogger,
  AuditCategory,
} from '../security/audit-logger.js';
import { SecurityLevel } from '../security/types.js';
import { securityNotificationService } from '../dangerous/notifications.js';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';

// Cleanup operation types
export enum CleanupOperation {
  PROCESS_TERMINATION = 'process_termination',
  FILE_CLEANUP = 'file_cleanup',
  MEMORY_CLEANUP = 'memory_cleanup',
  TEMP_CLEANUP = 'temp_cleanup',
  RESOURCE_RELEASE = 'resource_release',
  NETWORK_CLEANUP = 'network_cleanup',
  LOG_ROTATION = 'log_rotation',
}

// Cleanup priority levels
export enum CleanupPriority {
  LOW = 1,
  NORMAL = 2,
  HIGH = 3,
  CRITICAL = 4,
  EMERGENCY = 5,
}

// Cleanup strategy
export interface CleanupStrategy {
  operation: CleanupOperation;
  priority: CleanupPriority;
  timeout: number; // milliseconds
  retryCount: number;
  retryDelay: number; // milliseconds
  condition?: (context: CleanupContext) => boolean;
  action: (context: CleanupContext) => Promise<CleanupResult>;
  rollback?: (context: CleanupContext) => Promise<void>;
}

// Cleanup context
export interface CleanupContext {
  sessionId: string;
  userId: string;
  processContext: any;
  cleanupReason: string;
  startTime: Date;
  resources: {
    processes: ChildProcess[];
    files: string[];
    directories: string[];
    networkConnections: string[];
    tempFiles: string[];
  };
  metadata: Record<string, any>;
  dangerousModeEnabled: boolean;
}

// Cleanup result
export interface CleanupResult {
  success: boolean;
  operation: CleanupOperation;
  duration: number;
  resourcesReleased: {
    processes: number;
    files: number;
    directories: number;
    memoryBytes: number;
  };
  errors: string[];
  warnings: string[];
  metadata: Record<string, any>;
}

// Error recovery strategy
export interface ErrorRecoveryStrategy {
  errorType: string;
  maxRetries: number;
  retryDelay: number;
  escalationThreshold: number;
  recoveryAction: (error: Error, context: any) => Promise<boolean>;
  fallbackAction?: (error: Error, context: any) => Promise<void>;
}

// Cleanup configuration
export interface CleanupConfig {
  enableAutomaticCleanup: boolean;
  cleanupTimeout: number; // milliseconds
  maxConcurrentCleanups: number;
  retentionPeriod: number; // milliseconds
  enableResourceMonitoring: boolean;
  emergencyCleanupThreshold: {
    memoryUsage: number; // percentage
    diskUsage: number; // percentage
    processCount: number;
  };
  cleanupStrategies: CleanupStrategy[];
  errorRecoveryStrategies: ErrorRecoveryStrategy[];
}

const DEFAULT_CONFIG: CleanupConfig = {
  enableAutomaticCleanup: true,
  cleanupTimeout: 30000, // 30 seconds
  maxConcurrentCleanups: 5,
  retentionPeriod: 24 * 60 * 60 * 1000, // 24 hours
  enableResourceMonitoring: true,
  emergencyCleanupThreshold: {
    memoryUsage: 90,
    diskUsage: 85,
    processCount: 100,
  },
  cleanupStrategies: [],
  errorRecoveryStrategies: [],
};

export class ProcessCleanupHandler extends EventEmitter {
  private config: CleanupConfig;
  private activeCleanups: Map<string, CleanupContext> = new Map();
  private cleanupQueue: Array<{
    sessionId: string;
    priority: CleanupPriority;
  }> = [];
  private resourceMonitorInterval?: NodeJS.Timeout;
  private emergencyCleanupInterval?: NodeJS.Timeout;
  private cleanupHistory: Map<string, CleanupResult[]> = new Map();
  private errorCounts: Map<string, number> = new Map();
  private isInitialized = false;

  constructor(config: Partial<CleanupConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.setupDefaultStrategies();
    this.setupEventListeners();
  }

  /**
   * Initialize the cleanup handler
   */
  initialize(): void {
    if (this.isInitialized) {
      return;
    }

    if (this.config.enableResourceMonitoring) {
      this.startResourceMonitoring();
    }

    if (this.config.enableAutomaticCleanup) {
      this.startEmergencyCleanupMonitoring();
    }

    this.isInitialized = true;
    structuredLogger.info('Process cleanup handler initialized');
    this.emit('initialized');
  }

  /**
   * Perform cleanup for a specific session
   */
  async performCleanup(
    sessionId: string,
    reason: string = 'manual',
    priority: CleanupPriority = CleanupPriority.NORMAL
  ): Promise<CleanupResult[]> {
    if (this.activeCleanups.has(sessionId)) {
      throw new Error(`Cleanup already in progress for session ${sessionId}`);
    }

    const processContext = processStateMachine.getContext(sessionId);
    if (!processContext) {
      throw new Error(`Process context not found for session ${sessionId}`);
    }

    const startTime = new Date();
    const cleanupContext: CleanupContext = {
      sessionId,
      userId: processContext.userId,
      processContext,
      cleanupReason: reason,
      startTime,
      resources: {
        processes: [],
        files: [],
        directories: [],
        networkConnections: [],
        tempFiles: [],
      },
      metadata: {},
      dangerousModeEnabled: processContext.dangerousModeEnabled,
    };

    this.activeCleanups.set(sessionId, cleanupContext);

    try {
      // Discover resources to clean up
      await this.discoverResources(cleanupContext);

      // Sort strategies by priority
      const sortedStrategies = [...this.config.cleanupStrategies].sort(
        (a, b) => b.priority - a.priority
      );

      const results: CleanupResult[] = [];

      // Execute cleanup strategies
      for (const strategy of sortedStrategies) {
        if (strategy.condition && !strategy.condition(cleanupContext)) {
          continue;
        }

        try {
          const result = await this.executeCleanupStrategy(
            strategy,
            cleanupContext
          );
          results.push(result);

          if (!result.success) {
            structuredLogger.warn('Cleanup strategy failed', {
              sessionId,
              operation: strategy.operation,
              errors: result.errors,
            });
          }
        } catch (error) {
          structuredLogger.error('Cleanup strategy error', error as Error, {
            sessionId,
            operation: strategy.operation,
          });

          results.push({
            success: false,
            operation: strategy.operation,
            duration: 0,
            resourcesReleased: {
              processes: 0,
              files: 0,
              directories: 0,
              memoryBytes: 0,
            },
            errors: [(error as Error).message],
            warnings: [],
            metadata: {},
          });
        }
      }

      // Store cleanup history
      this.cleanupHistory.set(sessionId, results);

      // Log cleanup completion
      await this.logCleanupCompletion(cleanupContext, results);

      this.emit('cleanupCompleted', { sessionId, results, reason });

      return results;
    } finally {
      this.activeCleanups.delete(sessionId);
    }
  }

  /**
   * Handle process error with recovery strategies
   */
  async handleProcessError(
    sessionId: string,
    error: Error,
    errorContext: Record<string, any> = {}
  ): Promise<boolean> {
    const errorType = this.classifyError(error);
    const strategy = this.findErrorRecoveryStrategy(errorType);

    if (!strategy) {
      structuredLogger.error('No recovery strategy found for error', error, {
        sessionId,
        errorType,
      });
      return false;
    }

    // Track error count
    const errorKey = `${sessionId}_${errorType}`;
    const errorCount = (this.errorCounts.get(errorKey) || 0) + 1;
    this.errorCounts.set(errorKey, errorCount);

    // Check if we should escalate
    if (errorCount >= strategy.escalationThreshold) {
      await this.escalateError(sessionId, error, errorContext);
      return false;
    }

    // Attempt recovery
    try {
      const recovered = await strategy.recoveryAction(error, {
        sessionId,
        ...errorContext,
      });

      if (recovered) {
        structuredLogger.info('Process error recovered', {
          sessionId,
          errorType,
          attempt: errorCount,
        });
        this.errorCounts.delete(errorKey);
        this.emit('errorRecovered', { sessionId, error, errorType });
        return true;
      } else if (strategy.fallbackAction) {
        await strategy.fallbackAction(error, { sessionId, ...errorContext });
      }
    } catch (recoveryError) {
      structuredLogger.error('Error recovery failed', recoveryError as Error, {
        sessionId,
        originalError: error.message,
        errorType,
      });
    }

    return false;
  }

  /**
   * Force emergency cleanup of all processes
   */
  async emergencyCleanup(reason: string = 'emergency'): Promise<void> {
    structuredLogger.warn('Emergency cleanup initiated', { reason });

    // Get all active processes
    const activeProcesses = processLifecycleManager.getActiveProcesses();

    // Notify security system
    await securityNotificationService.sendEmergencyDisableNotification(
      `Emergency process cleanup: ${reason}`,
      activeProcesses
    );

    // Force cleanup all processes
    const cleanupPromises = activeProcesses.map(sessionId =>
      this.performCleanup(sessionId, reason, CleanupPriority.EMERGENCY).catch(
        error => {
          structuredLogger.error('Emergency cleanup failed', error as Error, {
            sessionId,
          });
        }
      )
    );

    await Promise.all(cleanupPromises);

    // Clear all tracking data
    this.activeCleanups.clear();
    this.cleanupQueue.length = 0;

    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'emergency_cleanup',
      resourceType: 'process_system',
      userId: 'system',
      sessionId: 'emergency',
      outcome: 'success',
      severity: SecurityLevel.CRITICAL,
      details: {
        reason,
        affectedProcesses: activeProcesses.length,
      },
    });

    this.emit('emergencyCleanup', {
      reason,
      affectedProcesses: activeProcesses,
    });
  }

  /**
   * Get cleanup statistics
   */
  getCleanupStatistics(): {
    activeCleanups: number;
    queuedCleanups: number;
    totalCleanupsSinceStart: number;
    averageCleanupTime: number;
    successRate: number;
    errorCounts: Record<string, number>;
  } {
    let totalCleanups = 0;
    let totalTime = 0;
    let successfulCleanups = 0;

    for (const results of this.cleanupHistory.values()) {
      totalCleanups += results.length;
      for (const result of results) {
        totalTime += result.duration;
        if (result.success) successfulCleanups++;
      }
    }

    return {
      activeCleanups: this.activeCleanups.size,
      queuedCleanups: this.cleanupQueue.length,
      totalCleanupsSinceStart: totalCleanups,
      averageCleanupTime: totalCleanups > 0 ? totalTime / totalCleanups : 0,
      successRate: totalCleanups > 0 ? successfulCleanups / totalCleanups : 1,
      errorCounts: Object.fromEntries(this.errorCounts),
    };
  }

  /**
   * Get cleanup history for a session
   */
  getCleanupHistory(sessionId: string): CleanupResult[] {
    return this.cleanupHistory.get(sessionId) || [];
  }

  // Private methods

  private setupDefaultStrategies(): void {
    this.config.cleanupStrategies = [
      // Process termination
      {
        operation: CleanupOperation.PROCESS_TERMINATION,
        priority: CleanupPriority.CRITICAL,
        timeout: 10000,
        retryCount: 3,
        retryDelay: 1000,
        action: async (context: CleanupContext) => {
          const startTime = Date.now();
          let processesTerminated = 0;
          const errors: string[] = [];

          try {
            // Terminate child processes
            for (const proc of context.resources.processes) {
              try {
                if (proc.pid && !proc.killed) {
                  process.kill(proc.pid, 'SIGTERM');

                  // Wait for graceful shutdown
                  await new Promise(resolve => setTimeout(resolve, 2000));

                  // Force kill if still alive
                  if (!proc.killed) {
                    process.kill(proc.pid, 'SIGKILL');
                  }

                  processesTerminated++;
                }
              } catch (error) {
                errors.push(
                  `Failed to terminate process ${proc.pid}: ${(error as Error).message}`
                );
              }
            }

            return {
              success: errors.length === 0,
              operation: CleanupOperation.PROCESS_TERMINATION,
              duration: Date.now() - startTime,
              resourcesReleased: {
                processes: processesTerminated,
                files: 0,
                directories: 0,
                memoryBytes: 0,
              },
              errors,
              warnings: [],
              metadata: { terminatedProcesses: processesTerminated },
            };
          } catch (error) {
            return {
              success: false,
              operation: CleanupOperation.PROCESS_TERMINATION,
              duration: Date.now() - startTime,
              resourcesReleased: {
                processes: 0,
                files: 0,
                directories: 0,
                memoryBytes: 0,
              },
              errors: [(error as Error).message],
              warnings: [],
              metadata: {},
            };
          }
        },
      },

      // File cleanup
      {
        operation: CleanupOperation.FILE_CLEANUP,
        priority: CleanupPriority.HIGH,
        timeout: 15000,
        retryCount: 2,
        retryDelay: 2000,
        action: async (context: CleanupContext) => {
          const startTime = Date.now();
          let filesDeleted = 0;
          let directoriesDeleted = 0;
          const errors: string[] = [];
          const warnings: string[] = [];

          try {
            // Delete files
            for (const filePath of context.resources.files) {
              try {
                await fs.unlink(filePath);
                filesDeleted++;
              } catch (error) {
                if ((error as any).code !== 'ENOENT') {
                  errors.push(
                    `Failed to delete file ${filePath}: ${(error as Error).message}`
                  );
                }
              }
            }

            // Delete directories
            for (const dirPath of context.resources.directories) {
              try {
                await fs.rmdir(dirPath, { recursive: true });
                directoriesDeleted++;
              } catch (error) {
                if ((error as any).code !== 'ENOENT') {
                  warnings.push(
                    `Failed to delete directory ${dirPath}: ${(error as Error).message}`
                  );
                }
              }
            }

            return {
              success: errors.length === 0,
              operation: CleanupOperation.FILE_CLEANUP,
              duration: Date.now() - startTime,
              resourcesReleased: {
                processes: 0,
                files: filesDeleted,
                directories: directoriesDeleted,
                memoryBytes: 0,
              },
              errors,
              warnings,
              metadata: { filesDeleted, directoriesDeleted },
            };
          } catch (error) {
            return {
              success: false,
              operation: CleanupOperation.FILE_CLEANUP,
              duration: Date.now() - startTime,
              resourcesReleased: {
                processes: 0,
                files: 0,
                directories: 0,
                memoryBytes: 0,
              },
              errors: [(error as Error).message],
              warnings,
              metadata: {},
            };
          }
        },
      },

      // Temporary file cleanup
      {
        operation: CleanupOperation.TEMP_CLEANUP,
        priority: CleanupPriority.NORMAL,
        timeout: 10000,
        retryCount: 1,
        retryDelay: 1000,
        action: async (context: CleanupContext) => {
          const startTime = Date.now();
          let tempFilesDeleted = 0;
          const errors: string[] = [];

          try {
            for (const tempFile of context.resources.tempFiles) {
              try {
                await fs.unlink(tempFile);
                tempFilesDeleted++;
              } catch (error) {
                if ((error as any).code !== 'ENOENT') {
                  errors.push(
                    `Failed to delete temp file ${tempFile}: ${(error as Error).message}`
                  );
                }
              }
            }

            return {
              success: errors.length === 0,
              operation: CleanupOperation.TEMP_CLEANUP,
              duration: Date.now() - startTime,
              resourcesReleased: {
                processes: 0,
                files: tempFilesDeleted,
                directories: 0,
                memoryBytes: 0,
              },
              errors,
              warnings: [],
              metadata: { tempFilesDeleted },
            };
          } catch (error) {
            return {
              success: false,
              operation: CleanupOperation.TEMP_CLEANUP,
              duration: Date.now() - startTime,
              resourcesReleased: {
                processes: 0,
                files: 0,
                directories: 0,
                memoryBytes: 0,
              },
              errors: [(error as Error).message],
              warnings: [],
              metadata: {},
            };
          }
        },
      },

      // Memory cleanup
      {
        operation: CleanupOperation.MEMORY_CLEANUP,
        priority: CleanupPriority.LOW,
        timeout: 5000,
        retryCount: 1,
        retryDelay: 1000,
        action: async (context: CleanupContext) => {
          const startTime = Date.now();

          try {
            // Force garbage collection if available
            if (global.gc) {
              global.gc();
            }

            // Clear any large objects from context
            delete context.processContext;
            delete context.metadata;

            return {
              success: true,
              operation: CleanupOperation.MEMORY_CLEANUP,
              duration: Date.now() - startTime,
              resourcesReleased: {
                processes: 0,
                files: 0,
                directories: 0,
                memoryBytes: 0,
              },
              errors: [],
              warnings: [],
              metadata: { gcTriggered: !!global.gc },
            };
          } catch (error) {
            return {
              success: false,
              operation: CleanupOperation.MEMORY_CLEANUP,
              duration: Date.now() - startTime,
              resourcesReleased: {
                processes: 0,
                files: 0,
                directories: 0,
                memoryBytes: 0,
              },
              errors: [(error as Error).message],
              warnings: [],
              metadata: {},
            };
          }
        },
      },
    ];

    // Setup error recovery strategies
    this.config.errorRecoveryStrategies = [
      {
        errorType: 'PROCESS_EXIT',
        maxRetries: 3,
        retryDelay: 2000,
        escalationThreshold: 5,
        recoveryAction: async (error: Error, context: any) => {
          // Attempt to restart the process
          return await processLifecycleManager.restartProcess(
            context.sessionId
          );
        },
        fallbackAction: async (error: Error, context: any) => {
          // Clean up the failed process
          await this.performCleanup(context.sessionId, 'process_exit_fallback');
        },
      },
      {
        errorType: 'MEMORY_EXCEEDED',
        maxRetries: 2,
        retryDelay: 1000,
        escalationThreshold: 3,
        recoveryAction: async (error: Error, context: any) => {
          // Try memory cleanup first
          await this.performCleanup(
            context.sessionId,
            'memory_recovery',
            CleanupPriority.HIGH
          );
          return true;
        },
      },
      {
        errorType: 'TIMEOUT',
        maxRetries: 1,
        retryDelay: 5000,
        escalationThreshold: 2,
        recoveryAction: async (error: Error, context: any) => {
          // Stop and restart with fresh timeout
          await processLifecycleManager.stopProcess(context.sessionId, false);
          return await processLifecycleManager.restartProcess(
            context.sessionId
          );
        },
      },
    ];
  }

  private setupEventListeners(): void {
    // Listen for process lifecycle events
    processLifecycleManager.on(
      'processStopped',
      async ({ sessionId, graceful }) => {
        if (this.config.enableAutomaticCleanup && !graceful) {
          await this.performCleanup(sessionId, 'process_stopped');
        }
      }
    );

    processLifecycleManager.on('processError', async ({ sessionId, error }) => {
      await this.handleProcessError(sessionId, error);
    });

    // Listen for state machine events
    processStateMachine.on('stateError', async ({ sessionId, error }) => {
      await this.handleProcessError(sessionId, error);
    });
  }

  private async discoverResources(context: CleanupContext): Promise<void> {
    // Discover child processes
    if (context.processContext.pid) {
      try {
        // Find child processes (simplified - in production would use proper process tree discovery)
        context.resources.processes = [];
      } catch (error) {
        structuredLogger.warn('Failed to discover child processes', {
          sessionId: context.sessionId,
          error: (error as Error).message,
        });
      }
    }

    // Discover temporary files
    if (context.processContext.workingDirectory) {
      try {
        const tempDir = path.join(
          context.processContext.workingDirectory,
          '.tmp'
        );
        try {
          const files = await fs.readdir(tempDir);
          context.resources.tempFiles = files.map(file =>
            path.join(tempDir, file)
          );
        } catch (error) {
          // Temp directory might not exist
        }
      } catch (error) {
        structuredLogger.warn('Failed to discover temp files', {
          sessionId: context.sessionId,
          error: (error as Error).message,
        });
      }
    }

    // Add more resource discovery logic as needed
  }

  private async executeCleanupStrategy(
    strategy: CleanupStrategy,
    context: CleanupContext
  ): Promise<CleanupResult> {
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt <= strategy.retryCount) {
      try {
        const timeoutPromise = new Promise<CleanupResult>((_, reject) => {
          setTimeout(
            () => reject(new Error('Cleanup timeout')),
            strategy.timeout
          );
        });

        const result = await Promise.race([
          strategy.action(context),
          timeoutPromise,
        ]);

        if (result.success) {
          return result;
        }

        lastError = new Error(`Cleanup failed: ${result.errors.join(', ')}`);
      } catch (error) {
        lastError = error as Error;
      }

      attempt++;
      if (attempt <= strategy.retryCount) {
        await new Promise(resolve => setTimeout(resolve, strategy.retryDelay));
      }
    }

    // All attempts failed
    return {
      success: false,
      operation: strategy.operation,
      duration: strategy.timeout,
      resourcesReleased: {
        processes: 0,
        files: 0,
        directories: 0,
        memoryBytes: 0,
      },
      errors: [lastError?.message || 'Unknown error'],
      warnings: [],
      metadata: { attempts: attempt },
    };
  }

  private classifyError(error: Error): string {
    if (error.message.includes('exit') || error.message.includes('SIGTERM')) {
      return 'PROCESS_EXIT';
    }
    if (error.message.includes('memory') || error.message.includes('heap')) {
      return 'MEMORY_EXCEEDED';
    }
    if (error.message.includes('timeout')) {
      return 'TIMEOUT';
    }
    if (error.message.includes('ENOENT') || error.message.includes('file')) {
      return 'FILE_ERROR';
    }
    return 'UNKNOWN';
  }

  private findErrorRecoveryStrategy(
    errorType: string
  ): ErrorRecoveryStrategy | null {
    return (
      this.config.errorRecoveryStrategies.find(
        s => s.errorType === errorType
      ) || null
    );
  }

  private async escalateError(
    sessionId: string,
    error: Error,
    context: Record<string, any>
  ): Promise<void> {
    structuredLogger.error(
      'Error escalated - recovery threshold exceeded',
      error,
      {
        sessionId,
        context,
      }
    );

    // Notify security system
    await securityNotificationService.sendSecurityAlert({
      id: `error_escalation_${Date.now()}`,
      type: 'anomaly_detected',
      severity: 'dangerous',
      sessionId,
      userId: context.userId || 'unknown',
      message: `Process error escalated: ${error.message}`,
      details: {
        errorType: this.classifyError(error),
        context,
        escalationTime: new Date().toISOString(),
      },
      timestamp: new Date(),
      action: 'warn',
      acknowledged: false,
    });

    // Force cleanup
    await this.performCleanup(
      sessionId,
      'error_escalation',
      CleanupPriority.EMERGENCY
    );
  }

  private async logCleanupCompletion(
    context: CleanupContext,
    results: CleanupResult[]
  ): Promise<void> {
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
    const successCount = results.filter(r => r.success).length;
    const totalResources = results.reduce(
      (sum, r) => ({
        processes: sum.processes + r.resourcesReleased.processes,
        files: sum.files + r.resourcesReleased.files,
        directories: sum.directories + r.resourcesReleased.directories,
        memoryBytes: sum.memoryBytes + r.resourcesReleased.memoryBytes,
      }),
      { processes: 0, files: 0, directories: 0, memoryBytes: 0 }
    );

    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'process_cleanup',
      resourceType: 'process',
      resourceId: context.sessionId,
      userId: context.userId,
      sessionId: context.sessionId,
      outcome: successCount === results.length ? 'success' : 'partial',
      severity: context.dangerousModeEnabled
        ? SecurityLevel.MODERATE
        : SecurityLevel.SAFE,
      details: {
        reason: context.cleanupReason,
        totalDuration,
        successCount,
        totalOperations: results.length,
        resourcesReleased: totalResources,
      },
    });
  }

  private startResourceMonitoring(): void {
    this.resourceMonitorInterval = setInterval(() => {
      this.checkResourceLimits();
    }, 30000); // Check every 30 seconds
  }

  private startEmergencyCleanupMonitoring(): void {
    this.emergencyCleanupInterval = setInterval(() => {
      this.checkEmergencyConditions();
    }, 60000); // Check every minute
  }

  private checkResourceLimits(): void {
    // In a real implementation, this would check actual system resources
    const memoryUsage = process.memoryUsage();
    const heapUsed = memoryUsage.heapUsed / 1024 / 1024; // MB

    // Trigger cleanup if memory usage is high
    if (heapUsed > 500) {
      // 500MB threshold
      structuredLogger.warn('High memory usage detected, triggering cleanup', {
        heapUsed,
      });
      // Could trigger selective cleanup here
    }
  }

  private async checkEmergencyConditions(): Promise<void> {
    const stats = processLifecycleManager.getSystemStatistics();

    // Check if emergency cleanup is needed
    if (
      stats.activeProcesses > this.config.emergencyCleanupThreshold.processCount
    ) {
      await this.emergencyCleanup('too_many_processes');
    }
  }
}

// Export singleton instance
export const processCleanupHandler = new ProcessCleanupHandler();
