import { EventEmitter } from 'events';
import { AgentStateManager } from './state-manager';
import { AgentSpawner } from './agent-spawner';
import { MiddleManagerAgent } from './middle-manager';
import { OutputAggregator } from './output-aggregator';
import { AgentTask, AgentMessage, TaskResult, AgentStatus } from './types';

export interface AgentSystemConfig {
  autoSpawnDefault: boolean;
  maxAgents: number;
  enableLogging: boolean;
  enableMetrics: boolean;
  healthCheckInterval: number;
}

export class AgentSystem extends EventEmitter {
  private stateManager: AgentStateManager;
  private spawner: AgentSpawner;
  private outputAggregator: OutputAggregator;
  private middleManager: MiddleManagerAgent | null = null;
  private isInitialized = false;
  private config: AgentSystemConfig;
  private taskQueue: AgentTask[] = [];
  private messageRouter: Map<string, (message: AgentMessage) => void> = new Map();

  constructor(config?: Partial<AgentSystemConfig>) {
    super();
    
    this.config = {
      autoSpawnDefault: true,
      maxAgents: 10,
      enableLogging: true,
      enableMetrics: true,
      healthCheckInterval: 30000,
      ...config
    };

    // Initialize core components
    this.stateManager = new AgentStateManager();
    this.spawner = new AgentSpawner(this.stateManager);
    this.outputAggregator = new OutputAggregator();
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('Agent System already initialized');
      return;
    }

    console.log('Initializing Agent System...');

    try {
      // Initialize core components
      await this.stateManager.initialize();
      await this.spawner.initialize();
      await this.outputAggregator.initialize();

      // Set up event handlers
      this.setupEventHandlers();

      // Spawn default agents if configured
      if (this.config.autoSpawnDefault) {
        await this.spawnDefaultAgents();
      }

      // Set up message routing
      this.setupMessageRouting();

      this.isInitialized = true;
      console.log('Agent System initialized successfully');
      this.emit('systemInitialized');
    } catch (error) {
      console.error('Failed to initialize Agent System:', error);
      throw error;
    }
  }

  private async spawnDefaultAgents(): Promise<void> {
    console.log('Spawning default agent configuration...');

    try {
      const spawnedAgents = await this.spawner.spawnDefaultAgents();
      
      // Get the middle manager instance
      const middleManagerInstance = this.spawner.getAgentInstance('middle-manager-primary');
      if (middleManagerInstance) {
        this.middleManager = middleManagerInstance.agent as MiddleManagerAgent;
        
        // Add subordinate agents to middle manager
        const claudeCodeInstance = this.spawner.getAgentInstance('claude-code-primary');
        const geminiInstance = this.spawner.getAgentInstance('gemini-primary');
        
        if (claudeCodeInstance) {
          this.middleManager.addSubordinateAgent(claudeCodeInstance.agent);
        }
        if (geminiInstance) {
          this.middleManager.addSubordinateAgent(geminiInstance.agent);
        }
      }

      console.log(`Default agents spawned: ${spawnedAgents.length} agents`);
    } catch (error) {
      console.error('Failed to spawn default agents:', error);
      throw error;
    }
  }

  private setupEventHandlers(): void {
    // State manager events
    this.stateManager.on('agentRegistered', (agentId, agentState) => {
      console.log(`Agent registered: ${agentId}`);
      this.emit('agentRegistered', agentId, agentState);
    });

    this.stateManager.on('agentStatusUpdated', (agentId, status) => {
      this.emit('agentStatusUpdated', agentId, status);
    });

    this.stateManager.on('taskCompleted', (taskId, result) => {
      this.handleTaskCompletion(taskId, result);
    });

    // Spawner events
    this.spawner.on('agentSpawned', (agentId, instance) => {
      console.log(`Agent spawned: ${agentId}`);
      this.emit('agentSpawned', agentId, instance);
    });

    this.spawner.on('agentDestroyed', (agentId, instance) => {
      console.log(`Agent destroyed: ${agentId}`);
      this.emit('agentDestroyed', agentId, instance);
    });

    this.spawner.on('agentHealthCritical', (agentId, health) => {
      console.warn(`Agent health critical: ${agentId}`);
      this.handleCriticalAgentHealth(agentId, health);
    });

    // Output aggregator events
    this.outputAggregator.on('aggregationCompleted', (aggregatedOutput) => {
      this.emit('outputAggregated', aggregatedOutput);
    });
  }

  private setupMessageRouting(): void {
    // Set up message routing between agents
    this.spawner.on('agentMessage', (agentId, message) => {
      this.routeMessage(message);
    });
  }

  private routeMessage(message: AgentMessage): void {
    console.log(`Routing message from ${message.fromAgent} to ${message.toAgent}`);
    
    // Add message to state manager
    this.stateManager.addMessage(message);
    
    if (message.toAgent === 'broadcast') {
      // Broadcast to all agents
      const instances = this.spawner.getAllInstances();
      instances.forEach(instance => {
        if (instance.id !== message.fromAgent) {
          instance.agent.receiveMessage(message);
        }
      });
    } else {
      // Send to specific agent
      const targetInstance = this.spawner.getAgentInstance(message.toAgent);
      if (targetInstance) {
        targetInstance.agent.receiveMessage(message);
      } else {
        console.warn(`Target agent not found: ${message.toAgent}`);
      }
    }
  }

  private async handleTaskCompletion(taskId: string, result: TaskResult): Promise<void> {
    console.log(`Task completed: ${taskId} by ${result.agentId}`);
    
    // Check if this task is part of a coordination plan
    const coordinationPlans = this.stateManager.getAllCoordinationPlans();
    const relatedPlan = coordinationPlans.find(plan => plan.taskId === taskId);
    
    if (relatedPlan) {
      // Handle coordination plan completion
      await this.handleCoordinationPlanProgress(relatedPlan, result);
    }
    
    this.emit('taskCompleted', taskId, result);
  }

  private async handleCoordinationPlanProgress(plan: any, _result: TaskResult): Promise<void> {
    // Update coordination plan progress
    // This would involve checking if all steps are complete and aggregating results
    console.log(`Updating coordination plan progress: ${plan.id}`);
  }

  private async handleCriticalAgentHealth(agentId: string, _health: any): Promise<void> {
    console.log(`Handling critical health for agent: ${agentId}`);
    
    try {
      // Attempt to restart the agent
      await this.spawner.restartAgent(agentId);
      console.log(`Successfully restarted unhealthy agent: ${agentId}`);
    } catch (error) {
      console.error(`Failed to restart agent ${agentId}:`, error);
      
      // If restart fails, consider spawning a replacement
      const instance = this.spawner.getAgentInstance(agentId);
      if (instance) {
        try {
          await this.spawner.destroyAgent(agentId);
          await this.spawner.spawnAgent({
            agentType: instance.type as any,
            autoStart: true
          });
          console.log(`Replaced failed agent: ${agentId}`);
        } catch (replaceError) {
          console.error(`Failed to replace agent ${agentId}:`, replaceError);
        }
      }
    }
  }

  // Public API methods
  public async submitTask(task: AgentTask): Promise<string> {
    if (!this.isInitialized) {
      throw new Error('Agent System not initialized');
    }

    console.log(`Submitting task: ${task.id} (${task.type})`);
    
    // Add task to state manager
    this.stateManager.addTask(task);
    
    // Route task to appropriate agent
    if (this.middleManager) {
      await this.middleManager.assignTask(task);
      return task.id;
    } else {
      // Fallback: assign to best available agent
      return await this.assignTaskToBestAgent(task);
    }
  }

  private async assignTaskToBestAgent(task: AgentTask): Promise<string> {
    const healthyAgents = this.spawner.getHealthyInstances();
    
    if (healthyAgents.length === 0) {
      throw new Error('No healthy agents available');
    }
    
    // Find best agent for this task type
    const suitableAgent = healthyAgents.find(instance => 
      instance.agent.canHandleTask(task)
    );
    
    if (suitableAgent) {
      await suitableAgent.agent.assignTask(task);
      this.stateManager.addTask(task, suitableAgent.id);
      return task.id;
    } else {
      throw new Error(`No suitable agent found for task type: ${task.type}`);
    }
  }

  public async getTaskStatus(taskId: string): Promise<AgentTask | null> {
    return this.stateManager.getTask(taskId) || null;
  }

  public async getTaskResult(taskId: string): Promise<TaskResult | null> {
    // Search through all agents for the task result
    const instances = this.spawner.getAllInstances();
    
    for (const instance of instances) {
      const results = this.stateManager.getTaskResults(instance.id);
      const result = results.find(r => r.taskId === taskId);
      if (result) {
        return result;
      }
    }
    
    return null;
  }

  public getSystemStatus(): {
    initialized: boolean;
    agents: {
      total: number;
      healthy: number;
      active: number;
      byType: { [type: string]: number };
    };
    tasks: {
      active: number;
      completed: number;
      failed: number;
    };
    system: {
      uptime: number;
      memory: number;
      cpu: number;
    };
  } {
    const systemMetrics = this.stateManager.getSystemMetrics();
    const spawnerStats = this.spawner.getSystemStats();
    
    return {
      initialized: this.isInitialized,
      agents: {
        total: spawnerStats.totalInstances,
        healthy: spawnerStats.healthyInstances,
        active: systemMetrics.activeAgents,
        byType: spawnerStats.byType
      },
      tasks: {
        active: systemMetrics.totalTasks - systemMetrics.completedTasks - systemMetrics.failedTasks,
        completed: systemMetrics.completedTasks,
        failed: systemMetrics.failedTasks
      },
      system: {
        uptime: systemMetrics.systemUptime,
        memory: process.memoryUsage().heapUsed / (1024 * 1024),
        cpu: process.cpuUsage().user / 1000000
      }
    };
  }

  public getAgentStatuses(): { [agentId: string]: AgentStatus } {
    const instances = this.spawner.getAllInstances();
    const statuses: { [agentId: string]: AgentStatus } = {};
    
    instances.forEach(instance => {
      statuses[instance.id] = instance.status;
    });
    
    return statuses;
  }

  public async createAgent(
    agentType: 'claude_code' | 'gemini' | 'monitor' | 'coordinator',
    config?: any
  ): Promise<string> {
    return await this.spawner.spawnAgent({
      agentType,
      config,
      autoStart: true
    });
  }

  public async destroyAgent(agentId: string): Promise<void> {
    await this.spawner.destroyAgent(agentId);
  }

  public async restartAgent(agentId: string): Promise<void> {
    await this.spawner.restartAgent(agentId);
  }

  public getAgentMetrics(): any {
    return this.stateManager.getAllAgentMetrics();
  }

  public getMessageHistory(limit?: number): AgentMessage[] {
    return this.stateManager.getMessageHistory(limit);
  }

  public getAggregationHistory(): any[] {
    return this.outputAggregator.getAggregationHistory();
  }

  public async sendMessageToAgent(agentId: string, message: Omit<AgentMessage, 'id' | 'timestamp' | 'fromAgent'>): Promise<void> {
    const fullMessage: AgentMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      fromAgent: 'system',
      timestamp: new Date(),
      ...message
    };
    
    this.routeMessage(fullMessage);
  }

  public async broadcastMessage(message: Omit<AgentMessage, 'id' | 'timestamp' | 'fromAgent' | 'toAgent'>): Promise<void> {
    const fullMessage: AgentMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      fromAgent: 'system',
      toAgent: 'broadcast',
      timestamp: new Date(),
      ...message
    };
    
    this.routeMessage(fullMessage);
  }

  public async clearTaskHistory(agentId?: string): Promise<void> {
    if (agentId) {
      // Clear history for specific agent
      const agentState = this.stateManager.getAgentState(agentId);
      if (agentState) {
        agentState.results.clear();
        agentState.messages = [];
      }
    } else {
      // Clear all history
      this.stateManager.clearHistory();
    }
  }

  public exportSystemState(): string {
    return this.stateManager.exportState();
  }

  public async shutdown(): Promise<void> {
    console.log('Shutting down Agent System...');
    
    try {
      // Shutdown spawner (which will shutdown all agents)
      await this.spawner.shutdown();
      
      // Shutdown state manager
      await this.stateManager.shutdown();
      
      // Clear task queue
      this.taskQueue = [];
      
      this.isInitialized = false;
      console.log('Agent System shut down successfully');
      this.emit('systemShutdown');
    } catch (error) {
      console.error('Error during Agent System shutdown:', error);
      throw error;
    }
  }

  // Getters for components (for testing and debugging)
  public getStateManager(): AgentStateManager {
    return this.stateManager;
  }

  public getSpawner(): AgentSpawner {
    return this.spawner;
  }

  public getOutputAggregator(): OutputAggregator {
    return this.outputAggregator;
  }

  public getMiddleManager(): MiddleManagerAgent | null {
    return this.middleManager;
  }
}