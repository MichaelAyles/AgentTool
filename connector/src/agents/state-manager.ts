import { EventEmitter } from 'events';
import { AgentTask, AgentStatus, AgentMessage, TaskResult, CoordinationPlan, AgentMetrics } from './types';

export interface AgentState {
  id: string;
  status: AgentStatus;
  tasks: Map<string, AgentTask>;
  results: Map<string, TaskResult>;
  messages: AgentMessage[];
  metrics: AgentMetrics;
  lastUpdated: Date;
}

export interface SystemState {
  agents: Map<string, AgentState>;
  globalTasks: Map<string, AgentTask>;
  coordinationPlans: Map<string, CoordinationPlan>;
  messageHistory: AgentMessage[];
  systemMetrics: {
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    activeAgents: number;
    systemUptime: number;
    averageResponseTime: number;
  };
}

export class AgentStateManager extends EventEmitter {
  private state: SystemState;
  private persistenceEnabled: boolean = true;
  private persistenceInterval: NodeJS.Timeout | null = null;
  private stateHistorySize: number = 1000;
  private messageHistorySize: number = 10000;

  constructor() {
    super();
    this.state = this.initializeSystemState();
  }

  public async initialize(): Promise<void> {
    console.log('Initializing Agent State Manager...');
    
    try {
      // Load persisted state if available
      await this.loadPersistedState();
      
      // Start periodic state persistence
      this.startStatePersistence();
      
      // Initialize system metrics collection
      this.initializeMetricsCollection();
      
      console.log('Agent State Manager initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Agent State Manager:', error);
      throw error;
    }
  }

  private initializeSystemState(): SystemState {
    return {
      agents: new Map(),
      globalTasks: new Map(),
      coordinationPlans: new Map(),
      messageHistory: [],
      systemMetrics: {
        totalTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
        activeAgents: 0,
        systemUptime: Date.now(),
        averageResponseTime: 0
      }
    };
  }

  // Agent Management
  public registerAgent(agentId: string, initialStatus: AgentStatus): void {
    const agentState: AgentState = {
      id: agentId,
      status: initialStatus,
      tasks: new Map(),
      results: new Map(),
      messages: [],
      metrics: {
        agentId,
        metrics: {
          tasksCompleted: 0,
          tasksFailed: 0,
          averageExecutionTime: 0,
          successRate: 0,
          resourceEfficiency: 0,
          collaborationScore: 0
        },
        period: {
          start: new Date(),
          end: new Date()
        }
      },
      lastUpdated: new Date()
    };

    this.state.agents.set(agentId, agentState);
    this.updateSystemMetrics();
    
    console.log(`Agent registered: ${agentId}`);
    this.emit('agentRegistered', agentId, agentState);
  }

  public unregisterAgent(agentId: string): void {
    const agentState = this.state.agents.get(agentId);
    if (agentState) {
      // Clean up active tasks
      this.cleanupAgentTasks(agentId);
      
      this.state.agents.delete(agentId);
      this.updateSystemMetrics();
      
      console.log(`Agent unregistered: ${agentId}`);
      this.emit('agentUnregistered', agentId, agentState);
    }
  }

  public updateAgentStatus(agentId: string, status: Partial<AgentStatus>): void {
    const agentState = this.state.agents.get(agentId);
    if (agentState) {
      agentState.status = { ...agentState.status, ...status };
      agentState.lastUpdated = new Date();
      
      this.updateSystemMetrics();
      this.emit('agentStatusUpdated', agentId, agentState.status);
    }
  }

  public getAgentState(agentId: string): AgentState | undefined {
    return this.state.agents.get(agentId);
  }

  public getAllAgentStates(): AgentState[] {
    return Array.from(this.state.agents.values());
  }

  public getActiveAgents(): AgentState[] {
    return Array.from(this.state.agents.values())
      .filter(agent => agent.status.state !== 'offline');
  }

  public getHealthyAgents(): AgentState[] {
    return Array.from(this.state.agents.values())
      .filter(agent => agent.status.healthScore > 70);
  }

  // Task Management
  public addTask(task: AgentTask, assignedAgentId?: string): void {
    this.state.globalTasks.set(task.id, task);
    
    if (assignedAgentId) {
      const agentState = this.state.agents.get(assignedAgentId);
      if (agentState) {
        agentState.tasks.set(task.id, task);
        agentState.lastUpdated = new Date();
      }
    }
    
    this.state.systemMetrics.totalTasks++;
    this.emit('taskAdded', task, assignedAgentId);
  }

  public updateTaskProgress(taskId: string, progress: Partial<AgentTask>): void {
    const task = this.state.globalTasks.get(taskId);
    if (task) {
      Object.assign(task, progress);
      
      // Update in agent tasks as well
      for (const agentState of this.state.agents.values()) {
        if (agentState.tasks.has(taskId)) {
          agentState.tasks.set(taskId, task);
          agentState.lastUpdated = new Date();
          break;
        }
      }
      
      this.emit('taskUpdated', taskId, task);
    }
  }

  public completeTask(taskId: string, result: TaskResult): void {
    const task = this.state.globalTasks.get(taskId);
    if (task) {
      // Update system metrics
      if (result.success) {
        this.state.systemMetrics.completedTasks++;
      } else {
        this.state.systemMetrics.failedTasks++;
      }
      
      // Store result
      const agentState = this.state.agents.get(result.agentId);
      if (agentState) {
        agentState.results.set(taskId, result);
        agentState.tasks.delete(taskId);
        agentState.lastUpdated = new Date();
        
        // Update agent metrics
        this.updateAgentMetrics(result.agentId, result);
      }
      
      // Remove from global tasks
      this.state.globalTasks.delete(taskId);
      
      this.emit('taskCompleted', taskId, result);
    }
  }

  public getTask(taskId: string): AgentTask | undefined {
    return this.state.globalTasks.get(taskId);
  }

  public getTasksByAgent(agentId: string): AgentTask[] {
    const agentState = this.state.agents.get(agentId);
    return agentState ? Array.from(agentState.tasks.values()) : [];
  }

  public getAllActiveTasks(): AgentTask[] {
    return Array.from(this.state.globalTasks.values());
  }

  public getTaskResults(agentId: string): TaskResult[] {
    const agentState = this.state.agents.get(agentId);
    return agentState ? Array.from(agentState.results.values()) : [];
  }

  // Message Management
  public addMessage(message: AgentMessage): void {
    // Add to system message history
    this.state.messageHistory.push(message);
    
    // Trim history if too large
    if (this.state.messageHistory.length > this.messageHistorySize) {
      this.state.messageHistory = this.state.messageHistory.slice(-this.messageHistorySize);
    }
    
    // Add to relevant agent histories
    const fromAgent = this.state.agents.get(message.fromAgent);
    if (fromAgent) {
      fromAgent.messages.push(message);
      fromAgent.lastUpdated = new Date();
    }
    
    if (message.toAgent !== 'broadcast') {
      const toAgent = this.state.agents.get(message.toAgent);
      if (toAgent) {
        toAgent.messages.push(message);
        toAgent.lastUpdated = new Date();
      }
    }
    
    this.emit('messageAdded', message);
  }

  public getMessageHistory(limit?: number): AgentMessage[] {
    const messages = this.state.messageHistory;
    return limit ? messages.slice(-limit) : messages;
  }

  public getAgentMessages(agentId: string, limit?: number): AgentMessage[] {
    const agentState = this.state.agents.get(agentId);
    if (!agentState) return [];
    
    const messages = agentState.messages;
    return limit ? messages.slice(-limit) : messages;
  }

  // Coordination Plan Management
  public addCoordinationPlan(plan: CoordinationPlan): void {
    this.state.coordinationPlans.set(plan.id, plan);
    this.emit('coordinationPlanAdded', plan);
  }

  public updateCoordinationPlan(planId: string, updates: Partial<CoordinationPlan>): void {
    const plan = this.state.coordinationPlans.get(planId);
    if (plan) {
      Object.assign(plan, updates);
      this.emit('coordinationPlanUpdated', planId, plan);
    }
  }

  public getCoordinationPlan(planId: string): CoordinationPlan | undefined {
    return this.state.coordinationPlans.get(planId);
  }

  public getAllCoordinationPlans(): CoordinationPlan[] {
    return Array.from(this.state.coordinationPlans.values());
  }

  public getActiveCoordinationPlans(): CoordinationPlan[] {
    return Array.from(this.state.coordinationPlans.values())
      .filter(plan => plan.status === 'executing');
  }

  // Metrics and Analytics
  private updateAgentMetrics(agentId: string, result: TaskResult): void {
    const agentState = this.state.agents.get(agentId);
    if (!agentState) return;
    
    const metrics = agentState.metrics.metrics;
    
    // Update task counters
    if (result.success) {
      metrics.tasksCompleted++;
    } else {
      metrics.tasksFailed++;
    }
    
    // Update success rate
    const totalTasks = metrics.tasksCompleted + metrics.tasksFailed;
    metrics.successRate = totalTasks > 0 ? (metrics.tasksCompleted / totalTasks) * 100 : 0;
    
    // Update average execution time
    const currentAvg = metrics.averageExecutionTime;
    const taskCount = metrics.tasksCompleted;
    metrics.averageExecutionTime = taskCount > 1 
      ? ((currentAvg * (taskCount - 1)) + result.duration) / taskCount
      : result.duration;
    
    // Update resource efficiency (simplified calculation)
    const resourceScore = this.calculateResourceEfficiency(agentState.status);
    metrics.resourceEfficiency = resourceScore;
    
    // Update collaboration score (based on message activity)
    metrics.collaborationScore = this.calculateCollaborationScore(agentId);
    
    agentState.metrics.period.end = new Date();
    agentState.lastUpdated = new Date();
  }

  private calculateResourceEfficiency(status: AgentStatus): number {
    // Calculate efficiency based on resource usage
    const memoryEfficiency = Math.max(0, 100 - (status.resourceUsage.memory / 10)); // Assume 1GB is 100% usage
    const cpuEfficiency = Math.max(0, 100 - status.resourceUsage.cpu);
    const loadEfficiency = status.currentTasks.length <= 3 ? 100 : Math.max(0, 100 - (status.currentTasks.length * 10));
    
    return (memoryEfficiency + cpuEfficiency + loadEfficiency) / 3;
  }

  private calculateCollaborationScore(agentId: string): number {
    const agentState = this.state.agents.get(agentId);
    if (!agentState) return 0;
    
    const recentMessages = agentState.messages.filter(msg => 
      Date.now() - msg.timestamp.getTime() < 3600000 // Last hour
    );
    
    const sentMessages = recentMessages.filter(msg => msg.fromAgent === agentId).length;
    const receivedMessages = recentMessages.filter(msg => msg.toAgent === agentId).length;
    
    // Score based on message activity
    return Math.min(100, (sentMessages + receivedMessages) * 5);
  }

  private updateSystemMetrics(): void {
    const now = Date.now();
    this.state.systemMetrics.activeAgents = this.getActiveAgents().length;
    this.state.systemMetrics.systemUptime = now - this.state.systemMetrics.systemUptime;
    
    // Calculate average response time from recent task completions
    const recentResults = this.getRecentTaskResults(3600000); // Last hour
    if (recentResults.length > 0) {
      const totalDuration = recentResults.reduce((sum, result) => sum + result.duration, 0);
      this.state.systemMetrics.averageResponseTime = totalDuration / recentResults.length;
    }
  }

  private getRecentTaskResults(timeWindow: number): TaskResult[] {
    const cutoff = Date.now() - timeWindow;
    const results: TaskResult[] = [];
    
    for (const agentState of this.state.agents.values()) {
      for (const result of agentState.results.values()) {
        if (result.metadata.completedAt.getTime() > cutoff) {
          results.push(result);
        }
      }
    }
    
    return results;
  }

  public getSystemMetrics(): typeof this.state.systemMetrics {
    this.updateSystemMetrics();
    return { ...this.state.systemMetrics };
  }

  public getAgentMetrics(agentId: string): AgentMetrics | undefined {
    const agentState = this.state.agents.get(agentId);
    return agentState ? { ...agentState.metrics } : undefined;
  }

  public getAllAgentMetrics(): AgentMetrics[] {
    return Array.from(this.state.agents.values()).map(agent => ({ ...agent.metrics }));
  }

  // State Persistence
  private async loadPersistedState(): Promise<void> {
    if (!this.persistenceEnabled) return;
    
    try {
      // In a real implementation, this would load from a database or file
      // For now, we'll just initialize with default state
      console.log('Loading persisted state (not implemented - using default state)');
    } catch (error) {
      console.warn('Failed to load persisted state:', error);
    }
  }

  private startStatePersistence(): void {
    if (!this.persistenceEnabled) return;
    
    this.persistenceInterval = setInterval(() => {
      this.persistState();
    }, 30000); // Persist every 30 seconds
  }

  private async persistState(): Promise<void> {
    try {
      // In a real implementation, this would save to a database or file
      // For now, we'll just log the state summary
      const summary = {
        agents: this.state.agents.size,
        activeTasks: this.state.globalTasks.size,
        coordinationPlans: this.state.coordinationPlans.size,
        messageHistory: this.state.messageHistory.length,
        systemMetrics: this.state.systemMetrics
      };
      
      console.log('State persisted:', summary);
    } catch (error) {
      console.error('Failed to persist state:', error);
    }
  }

  private cleanupAgentTasks(agentId: string): void {
    const agentState = this.state.agents.get(agentId);
    if (!agentState) return;
    
    // Move unfinished tasks back to global pool or mark as failed
    for (const [taskId, task] of agentState.tasks) {
      console.log(`Cleaning up unfinished task ${taskId} from agent ${agentId}`);
      
      // Create a failed result for the unfinished task
      const failedResult: TaskResult = {
        taskId,
        agentId,
        success: false,
        error: 'Agent shutdown before task completion',
        duration: Date.now() - task.metadata.createdAt.getTime(),
        metadata: {
          completedAt: new Date(),
          resourcesUsed: [],
          outputSize: 0
        }
      };
      
      this.completeTask(taskId, failedResult);
    }
  }

  private initializeMetricsCollection(): void {
    // Start periodic metrics collection
    setInterval(() => {
      this.updateSystemMetrics();
      this.emit('metricsUpdated', this.state.systemMetrics);
    }, 60000); // Update every minute
  }

  // Cleanup and shutdown
  public async shutdown(): Promise<void> {
    console.log('Shutting down Agent State Manager...');
    
    // Persist final state
    await this.persistState();
    
    // Clear persistence interval
    if (this.persistenceInterval) {
      clearInterval(this.persistenceInterval);
    }
    
    // Clean up all agent tasks
    for (const agentId of this.state.agents.keys()) {
      this.cleanupAgentTasks(agentId);
    }
    
    console.log('Agent State Manager shut down successfully');
  }

  // Utility methods
  public getSystemState(): SystemState {
    return {
      agents: new Map(this.state.agents),
      globalTasks: new Map(this.state.globalTasks),
      coordinationPlans: new Map(this.state.coordinationPlans),
      messageHistory: [...this.state.messageHistory],
      systemMetrics: { ...this.state.systemMetrics }
    };
  }

  public clearHistory(): void {
    this.state.messageHistory = [];
    for (const agentState of this.state.agents.values()) {
      agentState.messages = [];
      agentState.results.clear();
    }
    console.log('Agent state history cleared');
  }

  public exportState(): string {
    const exportData = {
      timestamp: new Date().toISOString(),
      agents: Array.from(this.state.agents.entries()),
      globalTasks: Array.from(this.state.globalTasks.entries()),
      coordinationPlans: Array.from(this.state.coordinationPlans.entries()),
      systemMetrics: this.state.systemMetrics
    };
    
    return JSON.stringify(exportData, null, 2);
  }
}