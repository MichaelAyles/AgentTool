import { EventEmitter } from 'events';
import { BaseAgent, AgentConfig, AgentStatus, AgentTask } from './types';
import { MiddleManagerAgent } from './middle-manager';
import { ClaudeCodeAgent } from './claude-code-agent';
import { GeminiAgent } from './gemini-agent';
import { AgentStateManager } from './state-manager';

export interface SpawnConfig {
  agentType: 'middle_manager' | 'claude_code' | 'gemini' | 'monitor' | 'coordinator';
  instanceId?: string;
  config?: Partial<AgentConfig>;
  autoStart?: boolean;
  dependencies?: string[];
}

export interface AgentInstance {
  id: string;
  type: string;
  agent: BaseAgent;
  status: AgentStatus;
  spawnedAt: Date;
  lastActivity: Date;
  dependencies: string[];
  health: {
    score: number;
    lastCheck: Date;
    issues: string[];
  };
}

export class AgentSpawner extends EventEmitter {
  private instances: Map<string, AgentInstance> = new Map();
  private stateManager: AgentStateManager;
  private spawningQueue: SpawnConfig[] = [];
  private isProcessingQueue = false;
  private healthCheckInterval: ReturnType<typeof setTimeout> | null = null;
  private maxInstances: number = 10;
  private defaultConfigs: Map<string, Partial<AgentConfig>> = new Map();

  constructor(stateManager: AgentStateManager) {
    super();
    this.stateManager = stateManager;
    this.initializeDefaultConfigs();
  }

  public async initialize(): Promise<void> {
    console.log('Initializing Agent Spawner...');
    
    try {
      // Start queue processing
      this.startQueueProcessing();
      
      // Start health monitoring
      this.startHealthMonitoring();
      
      console.log('Agent Spawner initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Agent Spawner:', error);
      throw error;
    }
  }

  private initializeDefaultConfigs(): void {
    // Default configurations for different agent types
    this.defaultConfigs.set('middle_manager', {
      maxConcurrentTasks: 10,
      priority: 1,
      timeout: 300000,
      retryAttempts: 3,
      healthCheckInterval: 30000
    });

    this.defaultConfigs.set('claude_code', {
      maxConcurrentTasks: 3,
      priority: 2,
      timeout: 180000,
      retryAttempts: 2,
      healthCheckInterval: 45000
    });

    this.defaultConfigs.set('gemini', {
      maxConcurrentTasks: 4,
      priority: 3,
      timeout: 120000,
      retryAttempts: 2,
      healthCheckInterval: 60000
    });

    this.defaultConfigs.set('monitor', {
      maxConcurrentTasks: 5,
      priority: 4,
      timeout: 30000,
      retryAttempts: 1,
      healthCheckInterval: 15000
    });
  }

  public async spawnAgent(config: SpawnConfig): Promise<string> {
    console.log(`Spawning agent: ${config.agentType}`);
    
    // Check if we're at max capacity
    if (this.instances.size >= this.maxInstances) {
      throw new Error(`Maximum agent instances reached (${this.maxInstances})`);
    }
    
    // Generate instance ID
    const instanceId = config.instanceId || this.generateInstanceId(config.agentType);
    
    // Check if instance already exists
    if (this.instances.has(instanceId)) {
      throw new Error(`Agent instance ${instanceId} already exists`);
    }
    
    try {
      // Create agent instance
      const agent = await this.createAgentInstance(config.agentType, instanceId, config.config);
      
      // Create instance record
      const instance: AgentInstance = {
        id: instanceId,
        type: config.agentType,
        agent,
        status: agent.getStatus(),
        spawnedAt: new Date(),
        lastActivity: new Date(),
        dependencies: config.dependencies || [],
        health: {
          score: 100,
          lastCheck: new Date(),
          issues: []
        }
      };
      
      // Register with state manager
      this.stateManager.registerAgent(instanceId, instance.status);
      
      // Store instance
      this.instances.set(instanceId, instance);
      
      // Set up event listeners
      this.setupAgentEventListeners(instance);
      
      // Initialize agent if autoStart is enabled (default true)
      if (config.autoStart !== false) {
        await agent.initialize();
      }
      
      console.log(`Successfully spawned agent: ${instanceId}`);
      this.emit('agentSpawned', instanceId, instance);
      
      return instanceId;
    } catch (error) {
      console.error(`Failed to spawn agent ${instanceId}:`, error);
      throw error;
    }
  }

  private async createAgentInstance(
    agentType: string, 
    instanceId: string, 
    customConfig?: Partial<AgentConfig>
  ): Promise<BaseAgent> {
    const defaultConfig = this.defaultConfigs.get(agentType) || {};
    const mergedConfig = {
      id: instanceId,
      ...defaultConfig,
      ...customConfig
    };
    
    switch (agentType) {
      case 'middle_manager':
        return new MiddleManagerAgent(mergedConfig);
        
      case 'claude_code':
        return new ClaudeCodeAgent(mergedConfig);
        
      case 'gemini':
        return new GeminiAgent(mergedConfig);
        
      case 'monitor':
        return this.createMonitorAgent(mergedConfig);
        
      case 'coordinator':
        return this.createCoordinatorAgent(mergedConfig);
        
      default:
        throw new Error(`Unknown agent type: ${agentType}`);
    }
  }

  private createMonitorAgent(config: Partial<AgentConfig>): BaseAgent {
    // Create a simple monitor agent implementation
    const monitorConfig: AgentConfig = {
      id: config.id || 'monitor-agent',
      name: 'Monitor Agent',
      type: 'monitor',
      capabilities: [
        {
          name: 'system_monitoring',
          description: 'Monitor system and agent health',
          category: 'coordination',
          requirements: ['health_checking', 'metrics_collection']
        }
      ],
      tools: ['system'],
      maxConcurrentTasks: 5,
      priority: 4,
      timeout: 30000,
      retryAttempts: 1,
      healthCheckInterval: 15000,
      ...config
    };

    return new (class extends BaseAgent {
      constructor() {
        super(monitorConfig);
      }

      async initialize(): Promise<void> {
        this.updateStatus({ state: 'idle' });
      }

      async processTask(task: AgentTask): Promise<any> {
        return {
          taskId: task.id,
          agentId: this.config.id,
          success: true,
          output: { monitoring: 'completed', task: task.type },
          duration: 100,
          metadata: {
            completedAt: new Date(),
            resourcesUsed: ['monitoring'],
            outputSize: 50
          }
        };
      }

      protected async handleMessage(): Promise<void> {
        // Handle monitoring messages
      }

      async shutdown(): Promise<void> {
        this.updateStatus({ state: 'offline' });
      }
    })();
  }

  private createCoordinatorAgent(config: Partial<AgentConfig>): BaseAgent {
    // Create a simple coordinator agent implementation
    const coordinatorConfig: AgentConfig = {
      id: config.id || 'coordinator-agent',
      name: 'Coordinator Agent',
      type: 'coordinator',
      capabilities: [
        {
          name: 'task_coordination',
          description: 'Coordinate tasks between agents',
          category: 'coordination',
          requirements: ['task_management', 'agent_communication']
        }
      ],
      tools: ['communication'],
      maxConcurrentTasks: 8,
      priority: 2,
      timeout: 60000,
      retryAttempts: 2,
      healthCheckInterval: 30000,
      ...config
    };

    return new (class extends BaseAgent {
      constructor() {
        super(coordinatorConfig);
      }

      async initialize(): Promise<void> {
        this.updateStatus({ state: 'idle' });
      }

      async processTask(task: AgentTask): Promise<any> {
        return {
          taskId: task.id,
          agentId: this.config.id,
          success: true,
          output: { coordination: 'completed', task: task.type },
          duration: 200,
          metadata: {
            completedAt: new Date(),
            resourcesUsed: ['coordination'],
            outputSize: 60
          }
        };
      }

      protected async handleMessage(): Promise<void> {
        // Handle coordination messages
      }

      async shutdown(): Promise<void> {
        this.updateStatus({ state: 'offline' });
      }
    })();
  }

  private generateInstanceId(agentType: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `${agentType}-${timestamp}-${random}`;
  }

  private setupAgentEventListeners(instance: AgentInstance): void {
    const agent = instance.agent;
    
    // Status updates
    agent.on('statusUpdate', (status: AgentStatus) => {
      instance.status = status;
      instance.lastActivity = new Date();
      this.stateManager.updateAgentStatus(instance.id, status);
      this.emit('agentStatusUpdate', instance.id, status);
    });
    
    // Task completion
    agent.on('taskCompleted', (result: any) => {
      instance.lastActivity = new Date();
      this.emit('agentTaskCompleted', instance.id, result);
    });
    
    // Messages
    agent.on('message', (message: any) => {
      this.stateManager.addMessage(message);
      this.emit('agentMessage', instance.id, message);
    });
    
    // Errors
    agent.on('error', (error: Error) => {
      console.error(`Agent ${instance.id} error:`, error);
      instance.health.issues.push(error.message);
      this.emit('agentError', instance.id, error);
    });
  }

  public async destroyAgent(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Agent instance ${instanceId} not found`);
    }
    
    console.log(`Destroying agent: ${instanceId}`);
    
    try {
      // Shutdown agent
      await instance.agent.shutdown();
      
      // Unregister from state manager
      this.stateManager.unregisterAgent(instanceId);
      
      // Remove from instances
      this.instances.delete(instanceId);
      
      console.log(`Successfully destroyed agent: ${instanceId}`);
      this.emit('agentDestroyed', instanceId, instance);
    } catch (error) {
      console.error(`Failed to destroy agent ${instanceId}:`, error);
      throw error;
    }
  }

  public async restartAgent(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Agent instance ${instanceId} not found`);
    }
    
    console.log(`Restarting agent: ${instanceId}`);
    
    try {
      // Shutdown current instance
      await instance.agent.shutdown();
      
      // Create new agent instance with same config
      const newAgent = await this.createAgentInstance(
        instance.type, 
        instanceId, 
        instance.agent.getConfig()
      );
      
      // Update instance
      instance.agent = newAgent;
      instance.spawnedAt = new Date();
      instance.lastActivity = new Date();
      instance.health.score = 100;
      instance.health.issues = [];
      
      // Set up event listeners
      this.setupAgentEventListeners(instance);
      
      // Initialize new agent
      await newAgent.initialize();
      
      console.log(`Successfully restarted agent: ${instanceId}`);
      this.emit('agentRestarted', instanceId, instance);
    } catch (error) {
      console.error(`Failed to restart agent ${instanceId}:`, error);
      throw error;
    }
  }

  public getAgentInstance(instanceId: string): AgentInstance | undefined {
    return this.instances.get(instanceId);
  }

  public getAllInstances(): AgentInstance[] {
    return Array.from(this.instances.values());
  }

  public getInstancesByType(agentType: string): AgentInstance[] {
    return Array.from(this.instances.values())
      .filter(instance => instance.type === agentType);
  }

  public getHealthyInstances(): AgentInstance[] {
    return Array.from(this.instances.values())
      .filter(instance => instance.health.score > 70);
  }

  public async spawnDefaultAgents(): Promise<string[]> {
    console.log('Spawning default agent set...');
    
    const defaultAgents: SpawnConfig[] = [
      {
        agentType: 'middle_manager',
        instanceId: 'middle-manager-primary',
        autoStart: true
      },
      {
        agentType: 'claude_code',
        instanceId: 'claude-code-primary',
        autoStart: true,
        dependencies: ['middle-manager-primary']
      },
      {
        agentType: 'gemini',
        instanceId: 'gemini-primary',
        autoStart: true,
        dependencies: ['middle-manager-primary']
      },
      {
        agentType: 'monitor',
        instanceId: 'monitor-primary',
        autoStart: true
      }
    ];
    
    const spawnedIds: string[] = [];
    
    for (const config of defaultAgents) {
      try {
        const instanceId = await this.spawnAgent(config);
        spawnedIds.push(instanceId);
        
        // Wait a bit between spawns to avoid resource contention
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`Failed to spawn default agent ${config.agentType}:`, error);
      }
    }
    
    console.log(`Spawned ${spawnedIds.length} default agents`);
    return spawnedIds;
  }

  private startQueueProcessing(): void {
    setInterval(async () => {
      if (!this.isProcessingQueue && this.spawningQueue.length > 0) {
        this.isProcessingQueue = true;
        await this.processSpawningQueue();
        this.isProcessingQueue = false;
      }
    }, 2000); // Check every 2 seconds
  }

  private async processSpawningQueue(): Promise<void> {
    while (this.spawningQueue.length > 0 && this.instances.size < this.maxInstances) {
      const config = this.spawningQueue.shift()!;
      try {
        await this.spawnAgent(config);
      } catch (error) {
        console.error('Failed to spawn queued agent:', error);
      }
    }
  }

  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, 30000); // Check every 30 seconds
  }

  private performHealthCheck(): void {
    for (const instance of this.instances.values()) {
      try {
        const status = instance.agent.getStatus();
        const now = new Date();
        
        // Calculate health score
        let healthScore = 100;
        
        // Deduct for poor agent health
        if (status.healthScore < 50) {
          healthScore -= 30;
        }
        
        // Deduct for inactivity
        const inactiveTime = now.getTime() - instance.lastActivity.getTime();
        if (inactiveTime > 600000) { // 10 minutes
          healthScore -= 20;
        }
        
        // Deduct for errors
        if (status.state === 'error') {
          healthScore -= 40;
        }
        
        instance.health.score = Math.max(0, healthScore);
        instance.health.lastCheck = now;
        
        // Check if restart is needed
        if (instance.health.score < 30) {
          console.warn(`Agent ${instance.id} health is critical, considering restart`);
          this.emit('agentHealthCritical', instance.id, instance.health);
        }
        
      } catch (error) {
        console.error(`Health check failed for agent ${instance.id}:`, error);
        instance.health.issues.push(`Health check failed: ${error}`);
      }
    }
  }

  public async queueAgentSpawn(config: SpawnConfig): Promise<void> {
    this.spawningQueue.push(config);
    console.log(`Queued agent spawn: ${config.agentType}`);
  }

  public getSystemStats(): {
    totalInstances: number;
    healthyInstances: number;
    unhealthyInstances: number;
    byType: { [type: string]: number };
    queueLength: number;
  } {
    const instances = Array.from(this.instances.values());
    const healthy = instances.filter(i => i.health.score > 70);
    const unhealthy = instances.filter(i => i.health.score <= 70);
    
    const byType: { [type: string]: number } = {};
    instances.forEach(instance => {
      byType[instance.type] = (byType[instance.type] || 0) + 1;
    });
    
    return {
      totalInstances: instances.length,
      healthyInstances: healthy.length,
      unhealthyInstances: unhealthy.length,
      byType,
      queueLength: this.spawningQueue.length
    };
  }

  public async shutdown(): Promise<void> {
    console.log('Shutting down Agent Spawner...');
    
    // Clear health check interval
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    // Shutdown all agent instances
    const shutdownPromises = Array.from(this.instances.keys()).map(instanceId =>
      this.destroyAgent(instanceId).catch(error => 
        console.error(`Failed to destroy agent ${instanceId}:`, error)
      )
    );
    
    await Promise.all(shutdownPromises);
    
    // Clear spawning queue
    this.spawningQueue = [];
    
    console.log('Agent Spawner shut down successfully');
  }
}