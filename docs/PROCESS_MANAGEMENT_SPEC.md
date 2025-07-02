# Process Management & Communication Specification

## Overview

This document defines the process management and real-time communication architecture for handling CLI tool processes and streaming their output.

## Process Management Architecture

### Core Components

```typescript
// Process Manager
export class ProcessManager {
  private processes = new Map<string, ManagedProcess>();
  private ptyProcesses = new Map<string, IPty>();
  private queue: Queue;

  constructor(
    private adapters: AdapterRegistry,
    private config: ProcessManagerConfig
  ) {
    this.queue = new Queue('process-queue', {
      concurrency: config.maxConcurrentProcesses,
    });
  }

  async spawn(options: SpawnOptions): Promise<ProcessHandle> {
    // Resource checking
    await this.checkResourceLimits();

    // Create managed process
    const process = new ManagedProcess(options);

    // PTY for interactive processes
    if (options.interactive) {
      const pty = this.createPTY(options);
      this.ptyProcesses.set(process.id, pty);
    }

    // Start process
    await process.start();
    this.processes.set(process.id, process);

    // Emit event
    this.emit('process:started', process);

    return process.handle;
  }
}
```

### Managed Process

```typescript
export class ManagedProcess extends EventEmitter {
  public readonly id: string;
  public readonly handle: ProcessHandle;
  private process?: ChildProcess;
  private pty?: IPty;
  private metrics: ProcessMetrics;

  constructor(private options: SpawnOptions) {
    super();
    this.id = generateId();
    this.handle = {
      id: this.id,
      pid: 0,
      adapter: options.adapter,
      startTime: new Date(),
    };
  }

  async start(): Promise<void> {
    if (this.options.interactive && this.pty) {
      // PTY spawn for interactive
      this.startPTY();
    } else {
      // Regular spawn
      this.startProcess();
    }

    // Set up monitoring
    this.startMonitoring();
  }

  private startProcess(): void {
    const adapter = this.adapters.get(this.options.adapter);
    this.process = spawn(this.options.command, this.options.args, {
      cwd: this.options.cwd,
      env: this.buildEnvironment(),
      windowsHide: true,
    });

    this.handle.pid = this.process.pid!;
    this.attachListeners();
  }

  private attachListeners(): void {
    this.process!.stdout?.on('data', data => {
      this.emit('data', { type: 'stdout', data });
    });

    this.process!.stderr?.on('data', data => {
      this.emit('data', { type: 'stderr', data });
    });

    this.process!.on('exit', (code, signal) => {
      this.emit('exit', { code, signal });
      this.cleanup();
    });
  }
}
```

## PTY (Pseudo-Terminal) Support

### PTY Manager

```typescript
import { IPty, spawn as ptySpawn } from 'node-pty';

export class PTYManager {
  private terminals = new Map<string, IPty>();

  create(options: PTYOptions): IPty {
    const pty = ptySpawn(options.command, options.args || [], {
      name: 'xterm-color',
      cols: options.cols || 80,
      rows: options.rows || 24,
      cwd: options.cwd,
      env: options.env,
    });

    this.terminals.set(options.id, pty);
    return pty;
  }

  resize(id: string, cols: number, rows: number): void {
    const pty = this.terminals.get(id);
    pty?.resize(cols, rows);
  }

  write(id: string, data: string): void {
    const pty = this.terminals.get(id);
    pty?.write(data);
  }
}
```

## Real-time Communication

### WebSocket Server

```typescript
export class WebSocketServer {
  private io: Server;
  private sessions = new Map<string, SessionContext>();

  constructor(
    private processManager: ProcessManager,
    private security: SecurityManager
  ) {
    this.io = new Server({
      cors: {
        origin: process.env.ALLOWED_ORIGINS?.split(','),
        credentials: true,
      },
    });

    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.io.on('connection', socket => {
      this.handleConnection(socket);
    });
  }

  private handleConnection(socket: Socket): void {
    // Authentication
    socket.on('auth', async token => {
      const user = await this.security.validateToken(token);
      if (!user) {
        socket.disconnect();
        return;
      }

      socket.data.user = user;
      socket.join(`user:${user.id}`);
    });

    // Session management
    socket.on('session:create', async data => {
      const session = await this.createSession(socket, data);
      socket.emit('session:created', session);
    });

    // Command execution
    socket.on('command:execute', async data => {
      await this.executeCommand(socket, data);
    });

    // Terminal interaction
    socket.on('terminal:input', data => {
      this.handleTerminalInput(socket, data);
    });

    socket.on('terminal:resize', data => {
      this.handleTerminalResize(socket, data);
    });
  }
}
```

### Stream Protocol

```typescript
export interface StreamProtocol {
  // Message types
  type: 'output' | 'error' | 'status' | 'metrics';

  // Common fields
  sessionId: string;
  timestamp: number;

  // Type-specific data
  data: OutputData | ErrorData | StatusData | MetricsData;
}

interface OutputData {
  stream: 'stdout' | 'stderr';
  content: string;
  encoding?: 'utf8' | 'base64';
}

interface StatusData {
  state: 'running' | 'paused' | 'completed' | 'failed';
  exitCode?: number;
  signal?: string;
}
```

### Output Streaming

```typescript
export class OutputStreamer {
  private buffers = new Map<string, CircularBuffer>();
  private subscribers = new Map<string, Set<Socket>>();

  constructor(private config: StreamerConfig) {}

  async streamProcess(
    process: ManagedProcess,
    sessionId: string
  ): Promise<void> {
    const buffer = new CircularBuffer(this.config.bufferSize);
    this.buffers.set(sessionId, buffer);

    // Handle stdout
    process.on('data', async chunk => {
      // Buffer data
      buffer.write(chunk);

      // Stream to subscribers
      await this.broadcast(sessionId, {
        type: 'output',
        sessionId,
        timestamp: Date.now(),
        data: {
          stream: chunk.type,
          content: chunk.data.toString('utf8'),
        },
      });
    });

    // Handle process exit
    process.on('exit', async exitInfo => {
      await this.broadcast(sessionId, {
        type: 'status',
        sessionId,
        timestamp: Date.now(),
        data: {
          state: 'completed',
          exitCode: exitInfo.code,
          signal: exitInfo.signal,
        },
      });

      this.cleanup(sessionId);
    });
  }

  private async broadcast(
    sessionId: string,
    message: StreamProtocol
  ): Promise<void> {
    const subscribers = this.subscribers.get(sessionId) || new Set();

    // Batch sending for performance
    const promises = Array.from(subscribers).map(socket =>
      this.sendToSocket(socket, message)
    );

    await Promise.allSettled(promises);
  }
}
```

## Process Lifecycle Management

### State Machine

```typescript
enum ProcessState {
  PENDING = 'pending',
  STARTING = 'starting',
  RUNNING = 'running',
  PAUSED = 'paused',
  STOPPING = 'stopping',
  STOPPED = 'stopped',
  FAILED = 'failed',
}

export class ProcessStateMachine {
  private state: ProcessState = ProcessState.PENDING;
  private transitions = new Map<string, ProcessState>();

  constructor() {
    this.defineTransitions();
  }

  private defineTransitions(): void {
    // Valid state transitions
    this.addTransition(ProcessState.PENDING, ProcessState.STARTING);
    this.addTransition(ProcessState.STARTING, ProcessState.RUNNING);
    this.addTransition(ProcessState.STARTING, ProcessState.FAILED);
    this.addTransition(ProcessState.RUNNING, ProcessState.PAUSED);
    this.addTransition(ProcessState.RUNNING, ProcessState.STOPPING);
    this.addTransition(ProcessState.PAUSED, ProcessState.RUNNING);
    this.addTransition(ProcessState.PAUSED, ProcessState.STOPPING);
    this.addTransition(ProcessState.STOPPING, ProcessState.STOPPED);
  }

  transition(to: ProcessState): void {
    const key = `${this.state}->${to}`;
    if (!this.transitions.has(key)) {
      throw new Error(`Invalid transition: ${key}`);
    }

    this.state = to;
    this.emit('transition', { from: this.state, to });
  }
}
```

### Resource Management

```typescript
export class ResourceManager {
  private usage = new Map<string, ResourceUsage>();

  async checkLimits(options: SpawnOptions): Promise<void> {
    const current = await this.getCurrentUsage();

    // CPU check
    if (current.cpu > this.config.maxCPU) {
      throw new ResourceError('CPU limit exceeded');
    }

    // Memory check
    if (current.memory > this.config.maxMemory) {
      throw new ResourceError('Memory limit exceeded');
    }

    // Process count check
    if (this.processes.size >= this.config.maxProcesses) {
      throw new ResourceError('Process limit exceeded');
    }
  }

  startMonitoring(process: ManagedProcess): void {
    const interval = setInterval(async () => {
      const usage = await this.getProcessUsage(process.handle.pid);
      this.usage.set(process.id, usage);

      // Check limits
      if (usage.memory > this.config.perProcessMemoryLimit) {
        await this.handleMemoryExceeded(process);
      }
    }, this.config.monitoringInterval);

    process.on('exit', () => clearInterval(interval));
  }
}
```

## Queue Management

### Job Queue

```typescript
export class ProcessQueue extends Queue {
  constructor(config: QueueConfig) {
    super('process-queue', {
      redis: config.redis,
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: false,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    });

    this.setupWorkers();
  }

  private setupWorkers(): void {
    this.process('spawn', async job => {
      const { options } = job.data;
      return await this.processManager.spawn(options);
    });

    this.process('kill', async job => {
      const { processId, signal } = job.data;
      return await this.processManager.kill(processId, signal);
    });
  }

  async addSpawnJob(options: SpawnOptions, priority?: number): Promise<Job> {
    return this.add(
      'spawn',
      { options },
      {
        priority,
        delay: options.delay,
      }
    );
  }
}
```

## Error Handling

### Process Errors

```typescript
export class ProcessErrorHandler {
  handle(error: ProcessError, process: ManagedProcess): void {
    switch (error.type) {
      case 'SPAWN_FAILED':
        this.handleSpawnFailure(error, process);
        break;

      case 'TIMEOUT':
        this.handleTimeout(error, process);
        break;

      case 'RESOURCE_EXCEEDED':
        this.handleResourceExceeded(error, process);
        break;

      case 'UNEXPECTED_EXIT':
        this.handleUnexpectedExit(error, process);
        break;
    }
  }

  private async handleTimeout(
    error: ProcessError,
    process: ManagedProcess
  ): Promise<void> {
    // Log timeout
    this.logger.warn(`Process ${process.id} timed out`, error);

    // Kill process
    await process.kill('SIGTERM');

    // Wait for graceful shutdown
    await this.waitForExit(process, 5000);

    // Force kill if needed
    if (process.isRunning()) {
      await process.kill('SIGKILL');
    }
  }
}
```

## Monitoring & Metrics

### Process Metrics

```typescript
export interface ProcessMetrics {
  // Resource usage
  cpu: number;
  memory: number;
  handles: number;

  // I/O stats
  bytesRead: number;
  bytesWritten: number;

  // Timing
  startTime: Date;
  userTime: number;
  systemTime: number;

  // Custom metrics
  custom: Record<string, unknown>;
}

export class MetricsCollector {
  private metrics = new Map<string, ProcessMetrics>();

  async collect(process: ManagedProcess): Promise<ProcessMetrics> {
    const pid = process.handle.pid;

    // Get OS-level metrics
    const usage = await pidusage(pid);

    // Get I/O stats
    const io = await this.getIOStats(pid);

    return {
      cpu: usage.cpu,
      memory: usage.memory,
      handles: await this.getHandleCount(pid),
      bytesRead: io.read_bytes,
      bytesWritten: io.write_bytes,
      startTime: process.handle.startTime,
      userTime: usage.ctime,
      systemTime: usage.stime,
      custom: {},
    };
  }

  aggregate(processIds: string[]): AggregatedMetrics {
    // Calculate aggregated metrics across processes
    const metrics = processIds.map(id => this.metrics.get(id));

    return {
      totalCPU: sum(metrics.map(m => m?.cpu || 0)),
      totalMemory: sum(metrics.map(m => m?.memory || 0)),
      activeProcesses: metrics.filter(m => m).length,
      // ... more aggregated stats
    };
  }
}
```

## Performance Optimization

### Output Buffering

```typescript
export class OutputBuffer {
  private buffer: string[] = [];
  private size = 0;
  private flushTimer?: NodeJS.Timeout;

  constructor(
    private options: BufferOptions,
    private onFlush: (data: string[]) => void
  ) {}

  write(data: string): void {
    this.buffer.push(data);
    this.size += data.length;

    // Flush if size exceeded
    if (this.size >= this.options.maxSize) {
      this.flush();
    } else {
      // Schedule flush
      this.scheduleFlush();
    }
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;

    this.flushTimer = setTimeout(() => {
      this.flush();
    }, this.options.flushInterval);
  }

  private flush(): void {
    if (this.buffer.length === 0) return;

    const data = this.buffer.slice();
    this.buffer = [];
    this.size = 0;

    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }

    this.onFlush(data);
  }
}
```

### Connection Pooling

```typescript
export class ProcessPool {
  private available: ManagedProcess[] = [];
  private inUse = new Map<string, ManagedProcess>();

  async acquire(options: AcquireOptions): Promise<ManagedProcess> {
    // Try to reuse existing process
    const existing = this.findAvailable(options);
    if (existing) {
      this.inUse.set(existing.id, existing);
      return existing;
    }

    // Create new process if under limit
    if (this.totalSize < this.options.maxSize) {
      const process = await this.create(options);
      this.inUse.set(process.id, process);
      return process;
    }

    // Wait for available process
    return this.waitForAvailable(options);
  }

  release(process: ManagedProcess): void {
    this.inUse.delete(process.id);

    if (process.isHealthy()) {
      this.available.push(process);
    } else {
      process.dispose();
    }
  }
}
```
