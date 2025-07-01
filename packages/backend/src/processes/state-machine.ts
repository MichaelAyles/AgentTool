import { EventEmitter } from 'events';
import { structuredLogger } from '../middleware/logging.js';
import { processQueueManager, JobType, JobPriority } from '../queue/index.js';

// Process states
export enum ProcessState {
  IDLE = 'idle',
  INITIALIZING = 'initializing',
  STARTING = 'starting',
  RUNNING = 'running',
  PAUSED = 'paused',
  STOPPING = 'stopping',
  STOPPED = 'stopped',
  ERROR = 'error',
  CLEANUP = 'cleanup',
  TERMINATED = 'terminated'
}

// Process events
export enum ProcessEvent {
  INITIALIZE = 'initialize',
  START = 'start',
  PAUSE = 'pause',
  RESUME = 'resume',
  STOP = 'stop',
  TERMINATE = 'terminate',
  ERROR = 'error',
  TIMEOUT = 'timeout',
  CLEANUP = 'cleanup',
  RESET = 'reset'
}

// Transition validation result
interface TransitionResult {
  allowed: boolean;
  reason?: string;
  metadata?: Record<string, any>;
}

// State transition definition
interface StateTransition {
  from: ProcessState;
  to: ProcessState;
  event: ProcessEvent;
  condition?: (context: ProcessContext) => boolean;
  action?: (context: ProcessContext) => Promise<void>;
  metadata?: Record<string, any>;
}

// Process context
export interface ProcessContext {
  sessionId: string;
  userId: string;
  adapterName: string;
  command?: string;
  args?: string[];
  workingDirectory?: string;
  environment?: Record<string, string>;
  pid?: number;
  startTime?: Date;
  endTime?: Date;
  exitCode?: number;
  error?: Error;
  metadata: Record<string, any>;
  dangerousModeEnabled: boolean;
  resourceLimits: {
    maxMemory: number;
    maxCpu: number;
    maxRuntime: number; // milliseconds
    maxFileSize: number;
  };
}

// Process lifecycle event
export interface ProcessLifecycleEvent {
  sessionId: string;
  userId: string;
  previousState: ProcessState;
  currentState: ProcessState;
  event: ProcessEvent;
  timestamp: Date;
  duration: number;
  success: boolean;
  error?: Error;
  metadata: Record<string, any>;
}

// State machine configuration
export interface StateMachineConfig {
  enableLogging: boolean;
  enableQueueIntegration: boolean;
  timeouts: {
    [key in ProcessState]?: number; // milliseconds
  };
  maxRetries: {
    [key in ProcessEvent]?: number;
  };
  autoCleanup: boolean;
  cleanupDelay: number; // milliseconds
}

const DEFAULT_CONFIG: StateMachineConfig = {
  enableLogging: true,
  enableQueueIntegration: true,
  timeouts: {
    [ProcessState.INITIALIZING]: 30000, // 30 seconds
    [ProcessState.STARTING]: 60000, // 1 minute
    [ProcessState.STOPPING]: 30000, // 30 seconds
    [ProcessState.CLEANUP]: 15000, // 15 seconds
  },
  maxRetries: {
    [ProcessEvent.START]: 3,
    [ProcessEvent.STOP]: 2,
    [ProcessEvent.CLEANUP]: 2,
  },
  autoCleanup: true,
  cleanupDelay: 5000, // 5 seconds
};

export class ProcessStateMachine extends EventEmitter {
  private config: StateMachineConfig;
  private processes: Map<string, ProcessContext> = new Map();
  private states: Map<string, ProcessState> = new Map();
  private transitions: StateTransition[] = [];
  private timeouts: Map<string, NodeJS.Timeout> = new Map();
  private retryCounters: Map<string, Map<ProcessEvent, number>> = new Map();
  private lifecycleHistory: Map<string, ProcessLifecycleEvent[]> = new Map();

  constructor(config: Partial<StateMachineConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.setupStateTransitions();
  }

  /**
   * Create a new process context
   */
  createProcess(context: Omit<ProcessContext, 'metadata'>): string {
    const processContext: ProcessContext = {
      ...context,
      metadata: {},
    };

    this.processes.set(context.sessionId, processContext);
    this.states.set(context.sessionId, ProcessState.IDLE);
    this.retryCounters.set(context.sessionId, new Map());
    this.lifecycleHistory.set(context.sessionId, []);

    this.logLifecycleEvent(context.sessionId, ProcessState.IDLE, ProcessState.IDLE, ProcessEvent.INITIALIZE, true);

    structuredLogger.info('Process created', {
      sessionId: context.sessionId,
      userId: context.userId,
      adapterName: context.adapterName,
    });

    this.emit('processCreated', { sessionId: context.sessionId, context: processContext });
    return context.sessionId;
  }

  /**
   * Trigger a process event
   */
  async triggerEvent(sessionId: string, event: ProcessEvent, metadata: Record<string, any> = {}): Promise<boolean> {
    const currentState = this.states.get(sessionId);
    const context = this.processes.get(sessionId);

    if (!currentState || !context) {
      structuredLogger.error('Process not found', new Error('Process not found'), { sessionId, event });
      return false;
    }

    const startTime = Date.now();
    const previousState = currentState;

    try {
      // Find valid transition
      const transition = this.findTransition(currentState, event);
      if (!transition) {
        structuredLogger.warn('Invalid state transition', {
          sessionId,
          currentState,
          event,
          reason: 'No valid transition found',
        });
        return false;
      }

      // Validate transition
      const validation = this.validateTransition(transition, context);
      if (!validation.allowed) {
        structuredLogger.warn('State transition blocked', {
          sessionId,
          currentState,
          event,
          reason: validation.reason,
        });
        return false;
      }

      // Clear any existing timeout
      this.clearTimeout(sessionId);

      // Update state
      this.states.set(sessionId, transition.to);
      
      // Update context metadata
      context.metadata = { ...context.metadata, ...metadata };

      // Execute transition action
      if (transition.action) {
        await transition.action(context);
      }

      // Set up timeout for new state
      this.setupTimeout(sessionId, transition.to);

      // Queue job if queue integration is enabled
      if (this.config.enableQueueIntegration) {
        await this.queueStateChange(sessionId, transition, context);
      }

      const duration = Date.now() - startTime;
      this.logLifecycleEvent(sessionId, previousState, transition.to, event, true, duration);

      structuredLogger.info('State transition completed', {
        sessionId,
        previousState,
        newState: transition.to,
        event,
        duration,
      });

      this.emit('stateChanged', {
        sessionId,
        previousState,
        currentState: transition.to,
        event,
        duration,
        context,
      });

      // Auto-cleanup if enabled
      if (this.config.autoCleanup && transition.to === ProcessState.TERMINATED) {
        setTimeout(() => {
          this.cleanup(sessionId);
        }, this.config.cleanupDelay);
      }

      return true;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logLifecycleEvent(sessionId, previousState, currentState, event, false, duration, error as Error);

      // Handle retry logic
      const shouldRetry = this.handleRetry(sessionId, event);
      if (shouldRetry) {
        structuredLogger.info('Retrying event after error', {
          sessionId,
          event,
          error: (error as Error).message,
        });
        // Retry after a delay
        setTimeout(() => {
          this.triggerEvent(sessionId, event, metadata);
        }, 2000);
      } else {
        // Transition to error state
        this.states.set(sessionId, ProcessState.ERROR);
        context.error = error as Error;
        
        this.emit('stateError', {
          sessionId,
          previousState,
          event,
          error: error as Error,
          context,
        });
      }

      structuredLogger.error('State transition failed', error as Error, {
        sessionId,
        currentState,
        event,
      });

      return false;
    }
  }

  /**
   * Get current state of a process
   */
  getState(sessionId: string): ProcessState | null {
    return this.states.get(sessionId) || null;
  }

  /**
   * Get process context
   */
  getContext(sessionId: string): ProcessContext | null {
    return this.processes.get(sessionId) || null;
  }

  /**
   * Get lifecycle history for a process
   */
  getLifecycleHistory(sessionId: string): ProcessLifecycleEvent[] {
    return this.lifecycleHistory.get(sessionId) || [];
  }

  /**
   * Update process context
   */
  updateContext(sessionId: string, updates: Partial<ProcessContext>): boolean {
    const context = this.processes.get(sessionId);
    if (!context) {
      return false;
    }

    Object.assign(context, updates);
    this.emit('contextUpdated', { sessionId, context, updates });
    return true;
  }

  /**
   * Get all processes in a specific state
   */
  getProcessesByState(state: ProcessState): string[] {
    const result: string[] = [];
    for (const [sessionId, processState] of this.states.entries()) {
      if (processState === state) {
        result.push(sessionId);
      }
    }
    return result;
  }

  /**
   * Get system-wide state statistics
   */
  getStateStatistics(): Record<ProcessState, number> {
    const stats: Record<ProcessState, number> = Object.values(ProcessState).reduce((acc, state) => {
      acc[state] = 0;
      return acc;
    }, {} as Record<ProcessState, number>);

    for (const state of this.states.values()) {
      stats[state]++;
    }

    return stats;
  }

  /**
   * Cleanup a process
   */
  cleanup(sessionId: string): boolean {
    const context = this.processes.get(sessionId);
    if (!context) {
      return false;
    }

    // Clear timeout
    this.clearTimeout(sessionId);

    // Remove from maps
    this.processes.delete(sessionId);
    this.states.delete(sessionId);
    this.retryCounters.delete(sessionId);
    
    // Keep lifecycle history for audit purposes
    // this.lifecycleHistory.delete(sessionId);

    structuredLogger.info('Process cleaned up', { sessionId });
    this.emit('processCleanedUp', { sessionId, context });
    
    return true;
  }

  /**
   * Force terminate a process
   */
  async forceTerminate(sessionId: string, reason: string = 'forced'): Promise<boolean> {
    const currentState = this.states.get(sessionId);
    if (!currentState) {
      return false;
    }

    // Set state to terminated regardless of current state
    this.states.set(sessionId, ProcessState.TERMINATED);
    
    const context = this.processes.get(sessionId);
    if (context) {
      context.metadata.terminationReason = reason;
      context.endTime = new Date();
    }

    this.logLifecycleEvent(sessionId, currentState, ProcessState.TERMINATED, ProcessEvent.TERMINATE, true);

    structuredLogger.warn('Process force terminated', {
      sessionId,
      previousState: currentState,
      reason,
    });

    this.emit('processForceTerminated', { sessionId, previousState: currentState, reason });
    
    // Schedule cleanup
    if (this.config.autoCleanup) {
      setTimeout(() => {
        this.cleanup(sessionId);
      }, this.config.cleanupDelay);
    }

    return true;
  }

  // Private methods

  private setupStateTransitions(): void {
    this.transitions = [
      // From IDLE
      { from: ProcessState.IDLE, to: ProcessState.INITIALIZING, event: ProcessEvent.INITIALIZE },
      
      // From INITIALIZING
      { from: ProcessState.INITIALIZING, to: ProcessState.STARTING, event: ProcessEvent.START },
      { from: ProcessState.INITIALIZING, to: ProcessState.ERROR, event: ProcessEvent.ERROR },
      { from: ProcessState.INITIALIZING, to: ProcessState.TERMINATED, event: ProcessEvent.TERMINATE },
      
      // From STARTING
      { from: ProcessState.STARTING, to: ProcessState.RUNNING, event: ProcessEvent.START },
      { from: ProcessState.STARTING, to: ProcessState.ERROR, event: ProcessEvent.ERROR },
      { from: ProcessState.STARTING, to: ProcessState.STOPPING, event: ProcessEvent.STOP },
      { from: ProcessState.STARTING, to: ProcessState.TERMINATED, event: ProcessEvent.TERMINATE },
      
      // From RUNNING
      { from: ProcessState.RUNNING, to: ProcessState.PAUSED, event: ProcessEvent.PAUSE },
      { from: ProcessState.RUNNING, to: ProcessState.STOPPING, event: ProcessEvent.STOP },
      { from: ProcessState.RUNNING, to: ProcessState.ERROR, event: ProcessEvent.ERROR },
      { from: ProcessState.RUNNING, to: ProcessState.TERMINATED, event: ProcessEvent.TERMINATE },
      { from: ProcessState.RUNNING, to: ProcessState.STOPPING, event: ProcessEvent.TIMEOUT },
      
      // From PAUSED
      { from: ProcessState.PAUSED, to: ProcessState.RUNNING, event: ProcessEvent.RESUME },
      { from: ProcessState.PAUSED, to: ProcessState.STOPPING, event: ProcessEvent.STOP },
      { from: ProcessState.PAUSED, to: ProcessState.TERMINATED, event: ProcessEvent.TERMINATE },
      
      // From STOPPING
      { from: ProcessState.STOPPING, to: ProcessState.STOPPED, event: ProcessEvent.STOP },
      { from: ProcessState.STOPPING, to: ProcessState.TERMINATED, event: ProcessEvent.TERMINATE },
      { from: ProcessState.STOPPING, to: ProcessState.ERROR, event: ProcessEvent.ERROR },
      
      // From STOPPED
      { from: ProcessState.STOPPED, to: ProcessState.CLEANUP, event: ProcessEvent.CLEANUP },
      { from: ProcessState.STOPPED, to: ProcessState.INITIALIZING, event: ProcessEvent.RESET },
      { from: ProcessState.STOPPED, to: ProcessState.TERMINATED, event: ProcessEvent.TERMINATE },
      
      // From ERROR
      { from: ProcessState.ERROR, to: ProcessState.CLEANUP, event: ProcessEvent.CLEANUP },
      { from: ProcessState.ERROR, to: ProcessState.INITIALIZING, event: ProcessEvent.RESET },
      { from: ProcessState.ERROR, to: ProcessState.TERMINATED, event: ProcessEvent.TERMINATE },
      
      // From CLEANUP
      { from: ProcessState.CLEANUP, to: ProcessState.TERMINATED, event: ProcessEvent.TERMINATE },
      { from: ProcessState.CLEANUP, to: ProcessState.INITIALIZING, event: ProcessEvent.RESET },
    ];
  }

  private findTransition(currentState: ProcessState, event: ProcessEvent): StateTransition | null {
    return this.transitions.find(t => t.from === currentState && t.event === event) || null;
  }

  private validateTransition(transition: StateTransition, context: ProcessContext): TransitionResult {
    // Check if transition condition is met
    if (transition.condition && !transition.condition(context)) {
      return {
        allowed: false,
        reason: 'Transition condition not met',
      };
    }

    // Check resource limits for certain transitions
    if (transition.to === ProcessState.RUNNING) {
      // Add resource limit checks here
      if (context.dangerousModeEnabled && !this.validateDangerousMode(context)) {
        return {
          allowed: false,
          reason: 'Dangerous mode validation failed',
        };
      }
    }

    return { allowed: true };
  }

  private validateDangerousMode(context: ProcessContext): boolean {
    // Add dangerous mode specific validation
    return true; // Placeholder
  }

  private setupTimeout(sessionId: string, state: ProcessState): void {
    const timeout = this.config.timeouts[state];
    if (!timeout) {
      return;
    }

    const timer = setTimeout(() => {
      structuredLogger.warn('Process state timeout', { sessionId, state, timeout });
      this.triggerEvent(sessionId, ProcessEvent.TIMEOUT);
    }, timeout);

    this.timeouts.set(sessionId, timer);
  }

  private clearTimeout(sessionId: string): void {
    const timer = this.timeouts.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.timeouts.delete(sessionId);
    }
  }

  private handleRetry(sessionId: string, event: ProcessEvent): boolean {
    const maxRetries = this.config.maxRetries[event];
    if (!maxRetries) {
      return false;
    }

    const retryMap = this.retryCounters.get(sessionId);
    if (!retryMap) {
      return false;
    }

    const currentRetries = retryMap.get(event) || 0;
    if (currentRetries >= maxRetries) {
      return false;
    }

    retryMap.set(event, currentRetries + 1);
    return true;
  }

  private async queueStateChange(
    sessionId: string,
    transition: StateTransition,
    context: ProcessContext
  ): Promise<void> {
    try {
      await processQueueManager.addJob(JobType.PROCESS_EXECUTION, {
        type: JobType.PROCESS_EXECUTION,
        sessionId,
        userId: context.userId,
        priority: context.dangerousModeEnabled ? JobPriority.HIGH : JobPriority.NORMAL,
        metadata: {
          stateTransition: {
            from: transition.from,
            to: transition.to,
            event: transition.event,
          },
          adapterName: context.adapterName,
          command: context.command,
          args: context.args,
        },
        command: context.command || '',
        args: context.args || [],
        workingDirectory: context.workingDirectory || process.cwd(),
        environment: context.environment || {},
        adapterName: context.adapterName,
        dangerousModeEnabled: context.dangerousModeEnabled,
      });
    } catch (error) {
      structuredLogger.error('Failed to queue state change', error as Error, { sessionId, transition });
    }
  }

  private logLifecycleEvent(
    sessionId: string,
    previousState: ProcessState,
    currentState: ProcessState,
    event: ProcessEvent,
    success: boolean,
    duration: number = 0,
    error?: Error
  ): void {
    const context = this.processes.get(sessionId);
    if (!context) {
      return;
    }

    const lifecycleEvent: ProcessLifecycleEvent = {
      sessionId,
      userId: context.userId,
      previousState,
      currentState,
      event,
      timestamp: new Date(),
      duration,
      success,
      error,
      metadata: { ...context.metadata },
    };

    const history = this.lifecycleHistory.get(sessionId);
    if (history) {
      history.push(lifecycleEvent);
      
      // Keep only last 100 events per process
      if (history.length > 100) {
        history.splice(0, history.length - 100);
      }
    }

    if (this.config.enableLogging) {
      if (success) {
        structuredLogger.info('Process lifecycle event', {
          sessionId,
          event,
          previousState,
          currentState,
          duration,
        });
      } else {
        structuredLogger.error('Process lifecycle event failed', error || new Error('Unknown error'), {
          sessionId,
          event,
          previousState,
          currentState,
          duration,
        });
      }
    }

    this.emit('lifecycleEvent', lifecycleEvent);
  }
}

// Export singleton instance
export const processStateMachine = new ProcessStateMachine();