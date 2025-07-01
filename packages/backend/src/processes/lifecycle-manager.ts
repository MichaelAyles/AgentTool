import { EventEmitter } from 'events';
import {
  processStateMachine,
  ProcessState,
  ProcessEvent,
  ProcessContext,
} from './state-machine.js';
import { processQueueManager, JobType, JobPriority } from '../queue/index.js';
import { structuredLogger } from '../middleware/logging.js';
import { securityNotificationService } from '../dangerous/notifications.js';

// Process lifecycle configuration
export interface LifecycleConfig {
  enableHealthChecks: boolean;
  healthCheckInterval: number; // milliseconds
  enableResourceMonitoring: boolean;
  resourceCheckInterval: number; // milliseconds
  enableAutomaticCleanup: boolean;
  cleanupGracePeriod: number; // milliseconds
  maxConcurrentProcesses: number;
  defaultResourceLimits: {
    maxMemory: number; // bytes
    maxCpu: number; // percentage
    maxRuntime: number; // milliseconds
    maxFileSize: number; // bytes
  };
}

// Process health status
export interface ProcessHealth {
  sessionId: string;
  state: ProcessState;
  healthy: boolean;
  issues: string[];
  resourceUsage: {
    memory: number;
    cpu: number;
    runtime: number;
    fileSize: number;
  };
  lastCheckTime: Date;
  checksPerformed: number;
  consecutiveFailures: number;
}

// Process performance metrics
export interface ProcessMetrics {
  sessionId: string;
  adapterName: string;
  totalRuntime: number;
  memoryPeak: number;
  cpuPeak: number;
  stateTransitions: Record<ProcessState, number>;
  eventCounts: Record<ProcessEvent, number>;
  errorCount: number;
  restartCount: number;
  lastActivity: Date;
}

const DEFAULT_CONFIG: LifecycleConfig = {
  enableHealthChecks: true,
  healthCheckInterval: 30000, // 30 seconds
  enableResourceMonitoring: true,
  resourceCheckInterval: 10000, // 10 seconds
  enableAutomaticCleanup: true,
  cleanupGracePeriod: 60000, // 1 minute
  maxConcurrentProcesses: 50,
  defaultResourceLimits: {
    maxMemory: 512 * 1024 * 1024, // 512MB
    maxCpu: 80, // 80%
    maxRuntime: 60 * 60 * 1000, // 1 hour
    maxFileSize: 100 * 1024 * 1024, // 100MB
  },
};

export class ProcessLifecycleManager extends EventEmitter {
  private config: LifecycleConfig;
  private healthChecks: Map<string, ProcessHealth> = new Map();
  private metrics: Map<string, ProcessMetrics> = new Map();
  private healthCheckInterval?: NodeJS.Timeout;
  private resourceMonitorInterval?: NodeJS.Timeout;
  private cleanupQueue: Set<string> = new Set();
  private isInitialized = false;

  constructor(config: Partial<LifecycleConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.setupEventListeners();
  }

  /**
   * Initialize the lifecycle manager
   */
  initialize(): void {
    if (this.isInitialized) {
      return;
    }

    if (this.config.enableHealthChecks) {
      this.startHealthChecks();
    }

    if (this.config.enableResourceMonitoring) {
      this.startResourceMonitoring();
    }

    this.isInitialized = true;
    structuredLogger.info('Process lifecycle manager initialized');

    // Setup cleanup handler integration
    this.setupCleanupIntegration();

    this.emit('initialized');
  }

  /**
   * Create and start a new process
   */
  async createProcess(params: {
    sessionId: string;
    userId: string;
    adapterName: string;
    command?: string;
    args?: string[];
    workingDirectory?: string;
    environment?: Record<string, string>;
    dangerousModeEnabled?: boolean;
    resourceLimits?: Partial<LifecycleConfig['defaultResourceLimits']>;
  }): Promise<boolean> {
    const {
      sessionId,
      userId,
      adapterName,
      dangerousModeEnabled = false,
    } = params;

    // Check concurrency limits
    const activeProcesses = this.getActiveProcessCount();
    if (activeProcesses >= this.config.maxConcurrentProcesses) {
      structuredLogger.warn(
        'Process creation rejected - concurrency limit reached',
        {
          sessionId,
          activeProcesses,
          limit: this.config.maxConcurrentProcesses,
        }
      );
      return false;
    }

    // Create process context
    const context: Omit<ProcessContext, 'metadata'> = {
      sessionId,
      userId,
      adapterName,
      command: params.command,
      args: params.args,
      workingDirectory: params.workingDirectory || process.cwd(),
      environment: params.environment || {},
      dangerousModeEnabled,
      resourceLimits: {
        ...this.config.defaultResourceLimits,
        ...params.resourceLimits,
      },
    };

    // Create process in state machine
    processStateMachine.createProcess(context);

    // Initialize health tracking
    this.initializeHealthTracking(sessionId);

    // Initialize metrics
    this.initializeMetrics(sessionId, adapterName);

    // Start the process lifecycle
    const initialized = await processStateMachine.triggerEvent(
      sessionId,
      ProcessEvent.INITIALIZE
    );
    if (initialized) {
      const started = await processStateMachine.triggerEvent(
        sessionId,
        ProcessEvent.START
      );
      if (started) {
        structuredLogger.info('Process created and started', {
          sessionId,
          adapterName,
        });
        this.emit('processStarted', { sessionId, context });
        return true;
      }
    }

    structuredLogger.error(
      'Failed to start process',
      new Error('Process lifecycle failed'),
      { sessionId }
    );
    return false;
  }

  /**
   * Pause a process
   */
  async pauseProcess(sessionId: string): Promise<boolean> {
    const state = processStateMachine.getState(sessionId);
    if (state !== ProcessState.RUNNING) {
      return false;
    }

    const success = await processStateMachine.triggerEvent(
      sessionId,
      ProcessEvent.PAUSE
    );
    if (success) {
      this.updateMetrics(sessionId, {
        eventCounts: { [ProcessEvent.PAUSE]: 1 },
      });
      this.emit('processPaused', { sessionId });
    }
    return success;
  }

  /**
   * Resume a paused process
   */
  async resumeProcess(sessionId: string): Promise<boolean> {
    const state = processStateMachine.getState(sessionId);
    if (state !== ProcessState.PAUSED) {
      return false;
    }

    const success = await processStateMachine.triggerEvent(
      sessionId,
      ProcessEvent.RESUME
    );
    if (success) {
      this.updateMetrics(sessionId, {
        eventCounts: { [ProcessEvent.RESUME]: 1 },
      });
      this.emit('processResumed', { sessionId });
    }
    return success;
  }

  /**
   * Stop a process gracefully
   */
  async stopProcess(
    sessionId: string,
    graceful: boolean = true
  ): Promise<boolean> {
    const state = processStateMachine.getState(sessionId);
    if (
      !state ||
      [ProcessState.STOPPED, ProcessState.TERMINATED].includes(state)
    ) {
      return false;
    }

    let success: boolean;
    if (graceful) {
      success = await processStateMachine.triggerEvent(
        sessionId,
        ProcessEvent.STOP
      );
    } else {
      success = await processStateMachine.forceTerminate(
        sessionId,
        'force_stop'
      );
    }

    if (success) {
      this.updateMetrics(sessionId, {
        eventCounts: { [ProcessEvent.STOP]: 1 },
      });
      this.scheduleCleanup(sessionId);
      this.emit('processStopped', { sessionId, graceful });
    }
    return success;
  }

  /**
   * Restart a process
   */
  async restartProcess(sessionId: string): Promise<boolean> {
    const context = processStateMachine.getContext(sessionId);
    if (!context) {
      return false;
    }

    // Stop current process
    await this.stopProcess(sessionId, true);

    // Wait for cleanup
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Reset state machine
    const resetSuccess = await processStateMachine.triggerEvent(
      sessionId,
      ProcessEvent.RESET
    );
    if (!resetSuccess) {
      return false;
    }

    // Start again
    const startSuccess = await processStateMachine.triggerEvent(
      sessionId,
      ProcessEvent.START
    );
    if (startSuccess) {
      this.updateMetrics(sessionId, { restartCount: 1 });
      this.emit('processRestarted', { sessionId });
    }

    return startSuccess;
  }

  /**
   * Get process health status
   */
  getProcessHealth(sessionId: string): ProcessHealth | null {
    return this.healthChecks.get(sessionId) || null;
  }

  /**
   * Get process metrics
   */
  getProcessMetrics(sessionId: string): ProcessMetrics | null {
    return this.metrics.get(sessionId) || null;
  }

  /**
   * Get all active processes
   */
  getActiveProcesses(): string[] {
    return processStateMachine.getProcessesByState(ProcessState.RUNNING);
  }

  /**
   * Get active process count
   */
  getActiveProcessCount(): number {
    const activeStates = [
      ProcessState.INITIALIZING,
      ProcessState.STARTING,
      ProcessState.RUNNING,
      ProcessState.PAUSED,
    ];

    return activeStates.reduce((count, state) => {
      return count + processStateMachine.getProcessesByState(state).length;
    }, 0);
  }

  /**
   * Get system-wide lifecycle statistics
   */
  getSystemStatistics(): {
    totalProcesses: number;
    activeProcesses: number;
    stateDistribution: Record<ProcessState, number>;
    healthySystems: number;
    averageUptime: number;
    totalMemoryUsage: number;
    totalCpuUsage: number;
    errorRate: number;
  } {
    const stateDistribution = processStateMachine.getStateStatistics();
    const totalProcesses = Object.values(stateDistribution).reduce(
      (sum, count) => sum + count,
      0
    );
    const activeProcesses = this.getActiveProcessCount();

    let healthySystems = 0;
    let totalUptime = 0;
    let totalMemory = 0;
    let totalCpu = 0;
    let totalErrors = 0;
    let totalEvents = 0;

    for (const [sessionId, health] of this.healthChecks.entries()) {
      if (health.healthy) healthySystems++;
      totalMemory += health.resourceUsage.memory;
      totalCpu += health.resourceUsage.cpu;
    }

    for (const metrics of this.metrics.values()) {
      totalUptime += metrics.totalRuntime;
      totalErrors += metrics.errorCount;
      totalEvents += Object.values(metrics.eventCounts).reduce(
        (sum, count) => sum + count,
        0
      );
    }

    const averageUptime =
      this.metrics.size > 0 ? totalUptime / this.metrics.size : 0;
    const errorRate = totalEvents > 0 ? totalErrors / totalEvents : 0;

    return {
      totalProcesses,
      activeProcesses,
      stateDistribution,
      healthySystems,
      averageUptime,
      totalMemoryUsage: totalMemory,
      totalCpuUsage: totalCpu,
      errorRate,
    };
  }

  /**
   * Force cleanup all terminated processes
   */
  async cleanupTerminatedProcesses(): Promise<number> {
    const terminatedProcesses = processStateMachine.getProcessesByState(
      ProcessState.TERMINATED
    );
    let cleanedCount = 0;

    for (const sessionId of terminatedProcesses) {
      if (this.performCleanup(sessionId)) {
        cleanedCount++;
      }
    }

    structuredLogger.info('Cleanup completed', {
      cleanedCount,
      total: terminatedProcesses.length,
    });
    return cleanedCount;
  }

  /**
   * Emergency shutdown all processes
   */
  async emergencyShutdown(reason: string = 'system_shutdown'): Promise<void> {
    const activeProcesses = this.getActiveProcesses();

    structuredLogger.warn('Emergency shutdown initiated', {
      reason,
      activeProcesses: activeProcesses.length,
    });

    // Notify security system
    await securityNotificationService.sendEmergencyDisableNotification(
      `Process system emergency shutdown: ${reason}`,
      activeProcesses
    );

    // Force terminate all active processes
    const terminationPromises = activeProcesses.map(sessionId =>
      processStateMachine.forceTerminate(sessionId, reason)
    );

    await Promise.all(terminationPromises);

    // Stop monitoring
    this.stopMonitoring();

    this.emit('emergencyShutdown', {
      reason,
      affectedProcesses: activeProcesses,
    });
  }

  // Private methods

  private setupEventListeners(): void {
    // Listen to state machine events
    processStateMachine.on('stateChanged', event => {
      this.handleStateChange(event);
    });

    processStateMachine.on('stateError', event => {
      this.handleStateError(event);
    });

    processStateMachine.on('processCreated', event => {
      this.initializeHealthTracking(event.sessionId);
      this.initializeMetrics(event.sessionId, event.context.adapterName);
    });

    processStateMachine.on('processCleanedUp', event => {
      this.healthChecks.delete(event.sessionId);
      this.metrics.delete(event.sessionId);
      this.cleanupQueue.delete(event.sessionId);
    });
  }

  private setupCleanupIntegration(): void {
    // Set up integration with process cleanup handler
    // This will be imported dynamically to avoid circular dependencies
    setTimeout(async () => {
      try {
        const { processCleanupHandler } = await import('./cleanup-handler.js');

        // Listen for process stopped events to trigger cleanup
        this.on('processStopped', async ({ sessionId, graceful }) => {
          if (!graceful) {
            try {
              await processCleanupHandler.performCleanup(
                sessionId,
                'process_stopped_ungraceful'
              );
            } catch (error) {
              structuredLogger.error(
                'Failed to perform cleanup after ungraceful stop',
                error as Error,
                { sessionId }
              );
            }
          }
        });

        // Listen for process errors to trigger error handling
        this.on('processError', async ({ sessionId, error }) => {
          try {
            await processCleanupHandler.handleProcessError(sessionId, error);
          } catch (cleanupError) {
            structuredLogger.error(
              'Failed to handle process error with cleanup handler',
              cleanupError as Error,
              { sessionId }
            );
          }
        });

        // Listen for health check failures to trigger cleanup
        this.on('healthCheck', async ({ sessionId, health }) => {
          if (!health.healthy && health.consecutiveFailures >= 5) {
            try {
              await processCleanupHandler.performCleanup(
                sessionId,
                'health_check_failures'
              );
            } catch (error) {
              structuredLogger.error(
                'Failed to perform cleanup after health failures',
                error as Error,
                { sessionId }
              );
            }
          }
        });

        structuredLogger.info('Process cleanup integration established');
      } catch (error) {
        structuredLogger.warn('Could not establish cleanup integration', {
          error: (error as Error).message,
        });
      }
    }, 100); // Small delay to allow cleanup handler to initialize
  }

  private handleStateChange(event: any): void {
    const { sessionId, currentState, previousState, duration } = event;

    // Update metrics
    this.updateMetrics(sessionId, {
      stateTransitions: { [currentState]: 1 },
      totalRuntime: duration,
      lastActivity: new Date(),
    });

    // Update health check
    const health = this.healthChecks.get(sessionId);
    if (health) {
      health.consecutiveFailures = 0; // Reset on successful state change
    }

    // Handle specific state transitions
    if (currentState === ProcessState.ERROR) {
      this.handleProcessError(sessionId);
    } else if (currentState === ProcessState.TERMINATED) {
      this.scheduleCleanup(sessionId);
    }
  }

  private handleStateError(event: any): void {
    const { sessionId, error } = event;

    this.updateMetrics(sessionId, {
      errorCount: 1,
      lastActivity: new Date(),
    });

    // Update health status
    const health = this.healthChecks.get(sessionId);
    if (health) {
      health.healthy = false;
      health.issues.push(`State error: ${error.message}`);
      health.consecutiveFailures++;
    }

    // Check if we should attempt recovery
    if (health && health.consecutiveFailures >= 3) {
      this.attemptProcessRecovery(sessionId);
    }
  }

  private handleProcessError(sessionId: string): void {
    const context = processStateMachine.getContext(sessionId);
    if (!context) return;

    const error = context.error || new Error('Unknown error');

    structuredLogger.error('Process entered error state', error, {
      sessionId,
      adapterName: context.adapterName,
    });

    // Emit error event for cleanup handler integration
    this.emit('processError', { sessionId, error });

    // Schedule automatic recovery attempt
    setTimeout(() => {
      this.attemptProcessRecovery(sessionId);
    }, 5000);
  }

  private async attemptProcessRecovery(sessionId: string): Promise<void> {
    const state = processStateMachine.getState(sessionId);
    if (state !== ProcessState.ERROR) {
      return;
    }

    structuredLogger.info('Attempting process recovery', { sessionId });

    // Try to cleanup and reset
    const cleanupSuccess = await processStateMachine.triggerEvent(
      sessionId,
      ProcessEvent.CLEANUP
    );
    if (cleanupSuccess) {
      // Wait a bit then try to restart
      setTimeout(async () => {
        const resetSuccess = await processStateMachine.triggerEvent(
          sessionId,
          ProcessEvent.RESET
        );
        if (resetSuccess) {
          this.emit('processRecovered', { sessionId });
        }
      }, 2000);
    }
  }

  private initializeHealthTracking(sessionId: string): void {
    const health: ProcessHealth = {
      sessionId,
      state: ProcessState.IDLE,
      healthy: true,
      issues: [],
      resourceUsage: {
        memory: 0,
        cpu: 0,
        runtime: 0,
        fileSize: 0,
      },
      lastCheckTime: new Date(),
      checksPerformed: 0,
      consecutiveFailures: 0,
    };

    this.healthChecks.set(sessionId, health);
  }

  private initializeMetrics(sessionId: string, adapterName: string): void {
    const metrics: ProcessMetrics = {
      sessionId,
      adapterName,
      totalRuntime: 0,
      memoryPeak: 0,
      cpuPeak: 0,
      stateTransitions: Object.values(ProcessState).reduce(
        (acc, state) => {
          acc[state] = 0;
          return acc;
        },
        {} as Record<ProcessState, number>
      ),
      eventCounts: Object.values(ProcessEvent).reduce(
        (acc, event) => {
          acc[event] = 0;
          return acc;
        },
        {} as Record<ProcessEvent, number>
      ),
      errorCount: 0,
      restartCount: 0,
      lastActivity: new Date(),
    };

    this.metrics.set(sessionId, metrics);
  }

  private updateMetrics(
    sessionId: string,
    updates: Partial<ProcessMetrics>
  ): void {
    const metrics = this.metrics.get(sessionId);
    if (!metrics) return;

    // Merge updates
    Object.assign(metrics, updates);

    // Handle special updates
    if (updates.stateTransitions) {
      for (const [state, count] of Object.entries(updates.stateTransitions)) {
        metrics.stateTransitions[state as ProcessState] += count;
      }
    }

    if (updates.eventCounts) {
      for (const [event, count] of Object.entries(updates.eventCounts)) {
        metrics.eventCounts[event as ProcessEvent] += count;
      }
    }

    // Update aggregate counters
    if (updates.errorCount) {
      metrics.errorCount += updates.errorCount;
    }
    if (updates.restartCount) {
      metrics.restartCount += updates.restartCount;
    }
    if (updates.totalRuntime) {
      metrics.totalRuntime += updates.totalRuntime;
    }
  }

  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks();
    }, this.config.healthCheckInterval);
  }

  private startResourceMonitoring(): void {
    this.resourceMonitorInterval = setInterval(() => {
      this.performResourceChecks();
    }, this.config.resourceCheckInterval);
  }

  private stopMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
    if (this.resourceMonitorInterval) {
      clearInterval(this.resourceMonitorInterval);
      this.resourceMonitorInterval = undefined;
    }
  }

  private performHealthChecks(): void {
    for (const [sessionId, health] of this.healthChecks.entries()) {
      try {
        const state = processStateMachine.getState(sessionId);
        const context = processStateMachine.getContext(sessionId);

        if (!state || !context) {
          continue;
        }

        health.state = state;
        health.lastCheckTime = new Date();
        health.checksPerformed++;
        health.issues = [];

        // Check if process is in a healthy state
        const healthyStates = [
          ProcessState.IDLE,
          ProcessState.RUNNING,
          ProcessState.PAUSED,
        ];
        health.healthy = healthyStates.includes(state);

        // Check for issues
        if (state === ProcessState.ERROR) {
          health.issues.push('Process is in error state');
        }

        // Check resource limits
        if (health.resourceUsage.memory > context.resourceLimits.maxMemory) {
          health.issues.push('Memory limit exceeded');
          health.healthy = false;
        }

        if (health.resourceUsage.cpu > context.resourceLimits.maxCpu) {
          health.issues.push('CPU limit exceeded');
          health.healthy = false;
        }

        if (health.resourceUsage.runtime > context.resourceLimits.maxRuntime) {
          health.issues.push('Runtime limit exceeded');
          health.healthy = false;
        }

        // Update consecutive failures
        if (!health.healthy) {
          health.consecutiveFailures++;
        } else {
          health.consecutiveFailures = 0;
        }

        // Emit health check result
        this.emit('healthCheck', { sessionId, health });
      } catch (error) {
        structuredLogger.error('Health check failed', error as Error, {
          sessionId,
        });
      }
    }
  }

  private performResourceChecks(): void {
    // In a real implementation, this would check actual resource usage
    // For now, we'll use mock data
    for (const [sessionId, health] of this.healthChecks.entries()) {
      health.resourceUsage = {
        memory: Math.random() * 1024 * 1024 * 512, // Random memory usage up to 512MB
        cpu: Math.random() * 100, // Random CPU usage 0-100%
        runtime: Date.now() - (health.lastCheckTime.getTime() - 60000), // Mock runtime
        fileSize: Math.random() * 1024 * 1024 * 50, // Random file size up to 50MB
      };

      // Update peak values in metrics
      const metrics = this.metrics.get(sessionId);
      if (metrics) {
        metrics.memoryPeak = Math.max(
          metrics.memoryPeak,
          health.resourceUsage.memory
        );
        metrics.cpuPeak = Math.max(metrics.cpuPeak, health.resourceUsage.cpu);
      }
    }
  }

  private scheduleCleanup(sessionId: string): void {
    if (this.config.enableAutomaticCleanup) {
      this.cleanupQueue.add(sessionId);
      setTimeout(() => {
        this.performCleanup(sessionId);
      }, this.config.cleanupGracePeriod);
    }
  }

  private performCleanup(sessionId: string): boolean {
    if (!this.cleanupQueue.has(sessionId)) {
      return false;
    }

    const success = processStateMachine.cleanup(sessionId);
    if (success) {
      this.cleanupQueue.delete(sessionId);
      structuredLogger.info('Process cleanup completed', { sessionId });
      this.emit('processCleanedUp', { sessionId });
    }

    return success;
  }
}

// Export singleton instance
export const processLifecycleManager = new ProcessLifecycleManager();
