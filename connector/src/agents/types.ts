import { EventEmitter } from 'events';

// Agent System Types and Interfaces
export interface AgentTask {
  id: string;
  type: 'code_generation' | 'code_review' | 'debugging' | 'documentation' | 'testing' | 'refactoring' | 'analysis' | 'code_analysis' | 'simple_task' | 'concurrent_task' | 'test_task';
  priority: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  context: {
    projectId?: string;
    terminalId?: string;
    workingDirectory?: string;
    files?: string[];
    previousOutput?: string;
    userInput?: string;
    language?: string;
    requirements?: string;
    index?: number;
  };
  requirements: {
    tools: string[];
    capabilities: string[];
    maxDuration?: number;
    outputFormat?: 'text' | 'json' | 'markdown' | 'code';
  };
  metadata: {
    createdAt: Date;
    deadline?: Date;
    estimatedDuration?: number;
    assignedTo?: string;
    dependencies?: string[];
    source?: string;
  };
  status?: 'pending' | 'assigned' | 'in_progress' | 'completed' | 'failed';
}

export interface AgentCapability {
  name: string;
  description: string;
  category: 'code' | 'analysis' | 'communication' | 'tools' | 'coordination';
  requirements: string[];
  limitations?: string[];
}

export interface AgentConfig {
  id: string;
  name: string;
  type: 'middle_manager' | 'code_specialist' | 'ai_integration' | 'coordinator' | 'monitor';
  capabilities: AgentCapability[];
  tools: string[];
  maxConcurrentTasks: number;
  priority: number;
  timeout: number;
  retryAttempts: number;
  healthCheckInterval: number;
}

export interface AgentStatus {
  id: string;
  state: 'idle' | 'busy' | 'error' | 'offline' | 'initializing';
  currentTasks: string[];
  completedTasks: number;
  failedTasks: number;
  uptime: number;
  lastActivity: Date;
  resourceUsage: {
    cpu: number;
    memory: number;
    activeProcesses: number;
  };
  healthScore: number;
  startTime?: Date;
  type?: string;
  status?: 'pending' | 'assigned' | 'in_progress' | 'completed' | 'failed';
}

export interface AgentMessage {
  id: string;
  type: 'task_assignment' | 'task_result' | 'status_update' | 'coordination' | 'error' | 'heartbeat';
  fromAgent: string;
  toAgent: string | 'broadcast';
  timestamp: Date;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  data: any;
  correlationId?: string;
  requiresResponse?: boolean;
  timeout?: number;
}

export interface TaskResult {
  taskId: string;
  agentId: string;
  success: boolean;
  output?: any;
  error?: string;
  duration: number;
  metadata: {
    completedAt: Date;
    resourcesUsed: string[];
    outputSize: number;
    confidence?: number;
  };
}

export interface CoordinationPlan {
  id: string;
  taskId: string;
  agents: string[];
  workflow: Array<{
    step: number;
    agent: string;
    action: string;
    dependencies: number[];
    timeout: number;
  }>;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  startTime?: Date;
  endTime?: Date;
  progress: number;
}

export interface AgentMetrics {
  agentId: string;
  metrics: {
    tasksCompleted: number;
    tasksFailed: number;
    averageExecutionTime: number;
    successRate: number;
    resourceEfficiency: number;
    collaborationScore: number;
  };
  period: {
    start: Date;
    end: Date;
  };
  // Additional system metrics
  totalAgents?: number;
  agentsByType?: { [type: string]: number };
  agentsByState?: { [state: string]: number };
  averageHealthScore?: number;
  systemUptime?: number;
}

// Abstract base class for all agents
export abstract class BaseAgent extends EventEmitter {
  protected config: AgentConfig;
  protected status: AgentStatus;
  protected messageQueue: AgentMessage[] = [];
  protected activeTasks: Map<string, AgentTask> = new Map();

  constructor(config: AgentConfig) {
    super();
    this.config = config;
    this.status = {
      id: config.id,
      state: 'initializing',
      currentTasks: [],
      completedTasks: 0,
      failedTasks: 0,
      uptime: 0,
      lastActivity: new Date(),
      resourceUsage: {
        cpu: 0,
        memory: 0,
        activeProcesses: 0
      },
      healthScore: 100
    };
  }

  abstract initialize(): Promise<void>;
  abstract processTask(task: AgentTask): Promise<TaskResult>;
  abstract shutdown(): Promise<void>;

  public getConfig(): AgentConfig {
    return { ...this.config };
  }

  public getStatus(): AgentStatus {
    return { ...this.status };
  }

  public canHandleTask(task: AgentTask): boolean {
    return this.config.capabilities.some(cap => 
      task.requirements.capabilities.includes(cap.name)
    );
  }

  protected updateStatus(updates: Partial<AgentStatus>): void {
    this.status = { ...this.status, ...updates };
    this.status.lastActivity = new Date();
    this.emit('statusUpdate', this.status);
  }

  protected sendMessage(message: Omit<AgentMessage, 'id' | 'fromAgent' | 'timestamp'>): void {
    const fullMessage: AgentMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      fromAgent: this.config.id,
      timestamp: new Date(),
      ...message
    };
    this.emit('message', fullMessage);
  }

  public receiveMessage(message: AgentMessage): void {
    this.messageQueue.push(message);
    this.processNextMessage();
  }

  protected async processNextMessage(): Promise<void> {
    if (this.messageQueue.length === 0) return;

    const message = this.messageQueue.shift()!;
    try {
      await this.handleMessage(message);
    } catch (error) {
      console.error(`Error processing message in agent ${this.config.id}:`, error);
      this.sendMessage({
        type: 'error',
        toAgent: message.fromAgent,
        priority: 'high',
        data: {
          error: error instanceof Error ? error.message : 'Unknown error',
          originalMessage: message.id
        }
      });
    }
  }

  protected abstract handleMessage(message: AgentMessage): Promise<void>;

  protected async startHealthCheck(): Promise<void> {
    setInterval(() => {
      this.performHealthCheck();
    }, this.config.healthCheckInterval);
  }

  protected performHealthCheck(): void {
    // Basic health metrics
    const now = Date.now();
    const cpuUsage = process.cpuUsage();
    const memUsage = process.memoryUsage();

    this.updateStatus({
      uptime: now - (this.status.lastActivity.getTime() - this.status.uptime),
      resourceUsage: {
        cpu: cpuUsage.user / 1000000, // Convert to milliseconds
        memory: memUsage.heapUsed / (1024 * 1024), // Convert to MB
        activeProcesses: this.activeTasks.size
      },
      healthScore: this.calculateHealthScore()
    });
  }

  protected calculateHealthScore(): number {
    let score = 100;
    
    // Deduct points for high resource usage
    if (this.status.resourceUsage.memory > 512) score -= 20;
    if (this.status.resourceUsage.cpu > 80) score -= 15;
    
    // Deduct points for high failure rate
    const totalTasks = this.status.completedTasks + this.status.failedTasks;
    if (totalTasks > 0) {
      const failureRate = this.status.failedTasks / totalTasks;
      score -= failureRate * 30;
    }
    
    // Deduct points for too many concurrent tasks
    if (this.activeTasks.size > this.config.maxConcurrentTasks) {
      score -= 25;
    }

    return Math.max(0, Math.min(100, score));
  }

  public async assignTask(task: AgentTask): Promise<void> {
    if (this.activeTasks.size >= this.config.maxConcurrentTasks) {
      throw new Error(`Agent ${this.config.id} is at maximum capacity`);
    }

    if (!this.canHandleTask(task)) {
      throw new Error(`Agent ${this.config.id} cannot handle task type: ${task.type}`);
    }

    this.activeTasks.set(task.id, task);
    this.updateStatus({
      state: 'busy',
      currentTasks: Array.from(this.activeTasks.keys())
    });

    try {
      const result = await this.processTask(task);
      this.activeTasks.delete(task.id);
      
      if (result.success) {
        this.updateStatus({
          completedTasks: this.status.completedTasks + 1,
          state: this.activeTasks.size > 0 ? 'busy' : 'idle',
          currentTasks: Array.from(this.activeTasks.keys())
        });
      } else {
        this.updateStatus({
          failedTasks: this.status.failedTasks + 1,
          state: this.activeTasks.size > 0 ? 'busy' : 'idle',
          currentTasks: Array.from(this.activeTasks.keys())
        });
      }

      this.emit('taskCompleted', result);
    } catch (error) {
      this.activeTasks.delete(task.id);
      this.updateStatus({
        failedTasks: this.status.failedTasks + 1,
        state: this.activeTasks.size > 0 ? 'busy' : 'error',
        currentTasks: Array.from(this.activeTasks.keys())
      });

      const result: TaskResult = {
        taskId: task.id,
        agentId: this.config.id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: 0,
        metadata: {
          completedAt: new Date(),
          resourcesUsed: [],
          outputSize: 0
        }
      };

      this.emit('taskCompleted', result);
    }
  }
}