import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';
import type { AdapterRegistry } from '@vibecode/adapter-sdk';
import type { ProcessHandle, SessionState } from '@vibecode/shared';

interface ProcessMetrics {
  cpuUsage: number;
  memoryUsage: number;
  startTime: number;
  runtime: number;
  commandsExecuted: number;
  lastActivity: number;
}

interface ResourceLimits {
  maxMemoryMB: number;
  maxCpuPercent: number;
  maxRuntimeMs: number;
  maxIdleTimeMs: number;
}

interface SessionMetrics extends ProcessMetrics {
  sessionId: string;
  projectId: string;
  adapter: string;
  state: SessionState;
}

export class ProcessManager extends EventEmitter {
  private processes = new Map<string, ProcessHandle>();
  private sessions = new Map<string, ManagedSession>();
  private metrics = new Map<string, ProcessMetrics>();
  private resourceLimits: ResourceLimits = {
    maxMemoryMB: 512,
    maxCpuPercent: 80,
    maxRuntimeMs: 30 * 60 * 1000, // 30 minutes
    maxIdleTimeMs: 10 * 60 * 1000, // 10 minutes
  };
  private monitoringInterval?: NodeJS.Timeout;

  constructor(private adapterRegistry: AdapterRegistry) {
    super();
    this.startMonitoring();
  }

  async createSession(options: SessionOptions): Promise<ManagedSession> {
    const session = new ManagedSession(options, this.adapterRegistry);
    this.sessions.set(session.id, session);

    // Initialize metrics
    this.metrics.set(session.id, {
      cpuUsage: 0,
      memoryUsage: 0,
      startTime: performance.now(),
      runtime: 0,
      commandsExecuted: 0,
      lastActivity: Date.now(),
    });

    session.on('state-change', (state: SessionState) => {
      this.emit('session-state', session.id, state);
    });

    session.on('command-executed', () => {
      this.updateMetrics(session.id, {
        commandsExecuted: 1,
        lastActivity: Date.now(),
      });
    });

    session.on('process-started', (process: ProcessHandle) => {
      this.processes.set(session.id, process);
    });

    return session;
  }

  getSession(id: string): ManagedSession | undefined {
    return this.sessions.get(id);
  }

  async terminateSession(id: string): Promise<void> {
    const session = this.sessions.get(id);
    if (session) {
      await session.terminate();
      this.sessions.delete(id);
      this.processes.delete(id);
      this.metrics.delete(id);
      this.emit('session-terminated', id);
    }
  }

  // Resource monitoring and management
  private startMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      this.updateResourceMetrics();
      this.checkResourceLimits();
    }, 5000); // Check every 5 seconds
  }

  private async updateResourceMetrics(): Promise<void> {
    for (const [sessionId, session] of this.sessions) {
      const metrics = this.metrics.get(sessionId);
      if (!metrics) continue;

      const process = this.processes.get(sessionId);
      if (process && process.pid) {
        try {
          // Get process stats (this would require process monitoring libraries in production)
          const stats = await this.getProcessStats(process.pid);

          this.metrics.set(sessionId, {
            ...metrics,
            cpuUsage: stats.cpuUsage,
            memoryUsage: stats.memoryUsage,
            runtime: performance.now() - metrics.startTime,
          });
        } catch (error) {
          console.warn(
            `Failed to get stats for process ${process.pid}:`,
            error
          );
        }
      }
    }
  }

  private async getProcessStats(
    pid: number
  ): Promise<{ cpuUsage: number; memoryUsage: number }> {
    // In a real implementation, this would use libraries like 'pidusage' or system calls
    // For now, return mock data
    return {
      cpuUsage: Math.random() * 20, // Mock CPU usage 0-20%
      memoryUsage: Math.random() * 100, // Mock memory usage 0-100MB
    };
  }

  private checkResourceLimits(): void {
    for (const [sessionId, metrics] of this.metrics) {
      const session = this.sessions.get(sessionId);
      if (!session) continue;

      // Check memory limit
      if (metrics.memoryUsage > this.resourceLimits.maxMemoryMB) {
        this.emit('resource-limit-exceeded', {
          sessionId,
          type: 'memory',
          current: metrics.memoryUsage,
          limit: this.resourceLimits.maxMemoryMB,
        });
        this.handleResourceViolation(sessionId, 'memory');
      }

      // Check CPU limit
      if (metrics.cpuUsage > this.resourceLimits.maxCpuPercent) {
        this.emit('resource-limit-exceeded', {
          sessionId,
          type: 'cpu',
          current: metrics.cpuUsage,
          limit: this.resourceLimits.maxCpuPercent,
        });
        this.handleResourceViolation(sessionId, 'cpu');
      }

      // Check runtime limit
      if (metrics.runtime > this.resourceLimits.maxRuntimeMs) {
        this.emit('resource-limit-exceeded', {
          sessionId,
          type: 'runtime',
          current: metrics.runtime,
          limit: this.resourceLimits.maxRuntimeMs,
        });
        this.handleResourceViolation(sessionId, 'runtime');
      }

      // Check idle time
      const idleTime = Date.now() - metrics.lastActivity;
      if (idleTime > this.resourceLimits.maxIdleTimeMs) {
        this.emit('resource-limit-exceeded', {
          sessionId,
          type: 'idle',
          current: idleTime,
          limit: this.resourceLimits.maxIdleTimeMs,
        });
        this.handleResourceViolation(sessionId, 'idle');
      }
    }
  }

  private async handleResourceViolation(
    sessionId: string,
    type: string
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    console.warn(
      `Resource violation detected for session ${sessionId}: ${type}`
    );

    // Emit warning first
    this.emit('session-warning', {
      sessionId,
      type,
      message: `Session exceeded ${type} limits and will be terminated`,
    });

    // Terminate the session after a brief delay to allow warning to be processed
    setTimeout(async () => {
      await this.terminateSession(sessionId);
    }, 2000);
  }

  private updateMetrics(
    sessionId: string,
    updates: Partial<ProcessMetrics>
  ): void {
    const metrics = this.metrics.get(sessionId);
    if (!metrics) return;

    this.metrics.set(sessionId, {
      ...metrics,
      ...updates,
      commandsExecuted:
        metrics.commandsExecuted + (updates.commandsExecuted || 0),
    });
  }

  // Public API methods
  getAllMetrics(): SessionMetrics[] {
    const result: SessionMetrics[] = [];

    for (const [sessionId, session] of this.sessions) {
      const metrics = this.metrics.get(sessionId);
      if (metrics) {
        result.push({
          ...metrics,
          sessionId,
          projectId: session.getProjectId(),
          adapter: session.getAdapter(),
          state: session.getState(),
        });
      }
    }

    return result;
  }

  getSessionMetrics(sessionId: string): SessionMetrics | null {
    const session = this.sessions.get(sessionId);
    const metrics = this.metrics.get(sessionId);

    if (!session || !metrics) return null;

    return {
      ...metrics,
      sessionId,
      projectId: session.getProjectId(),
      adapter: session.getAdapter(),
      state: session.getState(),
    };
  }

  updateResourceLimits(limits: Partial<ResourceLimits>): void {
    this.resourceLimits = { ...this.resourceLimits, ...limits };
    this.emit('resource-limits-updated', this.resourceLimits);
  }

  getResourceLimits(): ResourceLimits {
    return { ...this.resourceLimits };
  }

  getActiveSessionCount(): number {
    return this.sessions.size;
  }

  getProcessCount(): number {
    return this.processes.size;
  }

  // Health check
  getHealthStatus(): {
    healthy: boolean;
    activeSessions: number;
    totalProcesses: number;
    averageMemoryUsage: number;
    averageCpuUsage: number;
  } {
    const metrics = Array.from(this.metrics.values());
    const avgMemory =
      metrics.length > 0
        ? metrics.reduce((sum, m) => sum + m.memoryUsage, 0) / metrics.length
        : 0;
    const avgCpu =
      metrics.length > 0
        ? metrics.reduce((sum, m) => sum + m.cpuUsage, 0) / metrics.length
        : 0;

    return {
      healthy:
        avgMemory < this.resourceLimits.maxMemoryMB * 0.8 &&
        avgCpu < this.resourceLimits.maxCpuPercent * 0.8,
      activeSessions: this.sessions.size,
      totalProcesses: this.processes.size,
      averageMemoryUsage: avgMemory,
      averageCpuUsage: avgCpu,
    };
  }

  // Cleanup
  destroy(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    // Terminate all sessions
    for (const [sessionId] of this.sessions) {
      this.terminateSession(sessionId);
    }
  }
}

interface SessionOptions {
  id: string;
  projectId: string;
  adapter: string;
  workingDirectory: string;
}

class ManagedSession extends EventEmitter {
  public readonly id: string;
  private state: SessionState = 'pending';
  private currentProcess?: ProcessHandle;
  private commandHistory: Array<{
    command: string;
    timestamp: number;
    exitCode?: number;
  }> = [];

  constructor(
    private options: SessionOptions,
    private adapterRegistry: AdapterRegistry
  ) {
    super();
    this.id = options.id;
  }

  async execute(command: string): Promise<void> {
    const adapter = this.adapterRegistry.get(this.options.adapter);
    if (!adapter) {
      throw new Error(`Adapter ${this.options.adapter} not found`);
    }

    const commandEntry = {
      command,
      timestamp: Date.now(),
    };
    this.commandHistory.push(commandEntry);

    this.setState('running');
    this.emit('command-executed');

    try {
      this.currentProcess = await adapter.execute(command, {
        workingDirectory: this.options.workingDirectory,
      });

      this.emit('process-started', this.currentProcess);

      // Handle process completion
      // This would typically listen for process exit events
      if (this.currentProcess.on) {
        this.currentProcess.on('exit', (exitCode: number) => {
          commandEntry.exitCode = exitCode;
          this.setState(exitCode === 0 ? 'idle' : 'failed');
          this.emit('command-completed', { command, exitCode });
        });
      }
    } catch (error) {
      commandEntry.exitCode = 1;
      this.setState('failed');
      this.emit('command-failed', { command, error: error.message });
      throw error;
    }
  }

  async terminate(): Promise<void> {
    if (this.currentProcess) {
      const adapter = this.adapterRegistry.get(this.options.adapter);
      if (adapter) {
        await adapter.interrupt(this.currentProcess);
      }
    }
    this.setState('stopped');
  }

  private setState(newState: SessionState): void {
    this.state = newState;
    this.emit('state-change', newState);
  }

  getState(): SessionState {
    return this.state;
  }

  getProjectId(): string {
    return this.options.projectId;
  }

  getAdapter(): string {
    return this.options.adapter;
  }

  getCommandHistory(): Array<{
    command: string;
    timestamp: number;
    exitCode?: number;
  }> {
    return [...this.commandHistory];
  }

  getCurrentProcess(): ProcessHandle | undefined {
    return this.currentProcess;
  }

  getWorkingDirectory(): string {
    return this.options.workingDirectory;
  }
}
