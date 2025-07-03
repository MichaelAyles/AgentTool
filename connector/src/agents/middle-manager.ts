import { BaseAgent, AgentTask, AgentConfig, AgentMessage, TaskResult, CoordinationPlan, AgentCapability } from './types';
import { PromptGenerator } from './prompt-generator';
import { AgentStateManager } from './state-manager';
import { EventEmitter } from 'events';

export class MiddleManagerAgent extends BaseAgent {
  private promptGenerator: PromptGenerator;
  private stateManager: AgentStateManager;
  private subordinateAgents: Map<string, BaseAgent> = new Map();
  private coordinationPlans: Map<string, CoordinationPlan> = new Map();
  private taskQueue: AgentTask[] = [];
  private isProcessingQueue = false;

  constructor(config?: Partial<AgentConfig>) {
    const defaultConfig: AgentConfig = {
      id: 'middle-manager',
      name: 'Middle Manager Agent',
      type: 'middle_manager',
      capabilities: [
        {
          name: 'task_coordination',
          description: 'Coordinate multiple agents and tasks',
          category: 'coordination',
          requirements: ['agent_communication', 'task_planning']
        },
        {
          name: 'resource_management',
          description: 'Manage agent resources and load balancing',
          category: 'coordination',
          requirements: ['performance_monitoring', 'load_balancing']
        },
        {
          name: 'workflow_orchestration',
          description: 'Orchestrate complex multi-agent workflows',
          category: 'coordination',
          requirements: ['workflow_planning', 'dependency_resolution']
        },
        {
          name: 'agent_supervision',
          description: 'Monitor and supervise subordinate agents',
          category: 'coordination',
          requirements: ['health_monitoring', 'performance_analysis']
        }
      ],
      tools: ['claude-code', 'gemini', 'communication-bus'],
      maxConcurrentTasks: 10,
      priority: 1,
      timeout: 300000, // 5 minutes
      retryAttempts: 3,
      healthCheckInterval: 30000 // 30 seconds
    };

    const mergedConfig = { ...defaultConfig, ...config };
    super(mergedConfig);

    this.promptGenerator = new PromptGenerator();
    this.stateManager = new AgentStateManager();
  }

  public async initialize(): Promise<void> {
    console.log(`Initializing Middle Manager Agent: ${this.config.id}`);
    
    try {
      // Initialize state manager
      await this.stateManager.initialize();
      
      // Initialize prompt generator
      await this.promptGenerator.initialize();
      
      // Start health monitoring
      await this.startHealthCheck();
      
      // Start queue processing
      this.startQueueProcessing();
      
      this.updateStatus({ state: 'idle' });
      console.log(`Middle Manager Agent ${this.config.id} initialized successfully`);
    } catch (error) {
      console.error(`Failed to initialize Middle Manager Agent:`, error);
      this.updateStatus({ state: 'error' });
      throw error;
    }
  }

  public async processTask(task: AgentTask): Promise<TaskResult> {
    const startTime = Date.now();
    console.log(`Middle Manager processing task: ${task.id} (${task.type})`);

    try {
      // Analyze task complexity and determine coordination strategy
      const coordinationPlan = await this.createCoordinationPlan(task);
      
      // Store the coordination plan
      this.coordinationPlans.set(task.id, coordinationPlan);
      
      // Execute the coordination plan
      const result = await this.executeCoordinationPlan(coordinationPlan, task);
      
      // Clean up coordination plan
      this.coordinationPlans.delete(task.id);
      
      const duration = Date.now() - startTime;
      
      return {
        taskId: task.id,
        agentId: this.config.id,
        success: true,
        output: result,
        duration,
        metadata: {
          completedAt: new Date(),
          resourcesUsed: ['coordination', 'task_planning'],
          outputSize: JSON.stringify(result).length,
          confidence: 0.9
        }
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`Middle Manager failed to process task ${task.id}:`, error);
      
      return {
        taskId: task.id,
        agentId: this.config.id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration,
        metadata: {
          completedAt: new Date(),
          resourcesUsed: ['coordination'],
          outputSize: 0
        }
      };
    }
  }

  private async createCoordinationPlan(task: AgentTask): Promise<CoordinationPlan> {
    console.log(`Creating coordination plan for task: ${task.type}`);
    
    // Analyze task requirements and break down into subtasks
    const subtasks = await this.analyzeAndBreakdownTask(task);
    
    // Determine which agents are needed
    const requiredAgents = this.determineRequiredAgents(subtasks);
    
    // Create workflow steps
    const workflow = this.createWorkflow(subtasks, requiredAgents);
    
    const plan: CoordinationPlan = {
      id: `plan_${task.id}`,
      taskId: task.id,
      agents: requiredAgents,
      workflow,
      status: 'pending',
      progress: 0
    };
    
    console.log(`Created coordination plan with ${workflow.length} steps and ${requiredAgents.length} agents`);
    return plan;
  }

  private async analyzeAndBreakdownTask(task: AgentTask): Promise<Array<{
    id: string;
    type: string;
    description: string;
    requiredCapabilities: string[];
    dependencies: string[];
  }>> {
    const subtasks = [];
    
    switch (task.type) {
      case 'code_generation':
        subtasks.push(
          {
            id: 'analyze_requirements',
            type: 'analysis',
            description: 'Analyze code generation requirements',
            requiredCapabilities: ['code_analysis', 'requirement_parsing'],
            dependencies: []
          },
          {
            id: 'generate_code',
            type: 'generation',
            description: 'Generate code based on requirements',
            requiredCapabilities: ['code_generation', 'ai_integration'],
            dependencies: ['analyze_requirements']
          },
          {
            id: 'review_code',
            type: 'review',
            description: 'Review generated code for quality',
            requiredCapabilities: ['code_review', 'quality_assessment'],
            dependencies: ['generate_code']
          }
        );
        break;
        
      case 'debugging':
        subtasks.push(
          {
            id: 'error_analysis',
            type: 'analysis',
            description: 'Analyze error and symptoms',
            requiredCapabilities: ['error_analysis', 'log_parsing'],
            dependencies: []
          },
          {
            id: 'debug_investigation',
            type: 'investigation',
            description: 'Investigate potential causes',
            requiredCapabilities: ['debugging', 'ai_integration'],
            dependencies: ['error_analysis']
          },
          {
            id: 'solution_generation',
            type: 'solution',
            description: 'Generate debugging solutions',
            requiredCapabilities: ['solution_generation', 'code_modification'],
            dependencies: ['debug_investigation']
          }
        );
        break;
        
      case 'documentation':
        subtasks.push(
          {
            id: 'code_analysis',
            type: 'analysis',
            description: 'Analyze code structure and functionality',
            requiredCapabilities: ['code_analysis', 'structure_parsing'],
            dependencies: []
          },
          {
            id: 'documentation_generation',
            type: 'generation',
            description: 'Generate documentation content',
            requiredCapabilities: ['documentation_generation', 'ai_integration'],
            dependencies: ['code_analysis']
          }
        );
        break;
        
      default:
        // Generic breakdown for unknown task types
        subtasks.push({
          id: 'execute_task',
          type: 'execution',
          description: `Execute ${task.type} task`,
          requiredCapabilities: ['general_execution', 'ai_integration'],
          dependencies: []
        });
    }
    
    return subtasks;
  }

  private determineRequiredAgents(subtasks: Array<any>): string[] {
    const requiredCapabilities = new Set<string>();
    subtasks.forEach(subtask => {
      subtask.requiredCapabilities.forEach((cap: string) => requiredCapabilities.add(cap));
    });
    
    const agents = [];
    
    // Always include AI integration agents for AI tasks
    if (requiredCapabilities.has('ai_integration')) {
      if (this.subordinateAgents.has('claude-code-agent')) {
        agents.push('claude-code-agent');
      }
      if (this.subordinateAgents.has('gemini-agent')) {
        agents.push('gemini-agent');
      }
    }
    
    // Add code specialist for code-related tasks
    if (requiredCapabilities.has('code_generation') || 
        requiredCapabilities.has('code_review') || 
        requiredCapabilities.has('code_analysis')) {
      agents.push('code-specialist-agent');
    }
    
    // Add monitor agent for performance tracking
    agents.push('monitor-agent');
    
    return [...new Set(agents)]; // Remove duplicates
  }

  private createWorkflow(subtasks: Array<any>, agents: string[]): Array<{
    step: number;
    agent: string;
    action: string;
    dependencies: number[];
    timeout: number;
  }> {
    const workflow: Array<{
      step: number;
      agent: string;
      action: string;
      dependencies: number[];
      timeout: number;
    }> = [];
    const agentAssignments = this.assignAgentsToSubtasks(subtasks, agents);
    
    subtasks.forEach((subtask, index) => {
      const assignedAgent = agentAssignments[subtask.id] || agents[0] || 'claude-code-agent';
      
      workflow.push({
        step: index + 1,
        agent: assignedAgent,
        action: subtask.description,
        dependencies: this.mapDependenciesToSteps(subtask.dependencies, subtasks),
        timeout: 60000 // 1 minute per step
      });
    });
    
    return workflow;
  }

  private assignAgentsToSubtasks(subtasks: Array<any>, agents: string[]): { [subtaskId: string]: string } {
    const assignments: { [subtaskId: string]: string } = {};
    
    subtasks.forEach(subtask => {
      // Simple assignment logic - can be made more sophisticated
      if (subtask.requiredCapabilities.includes('ai_integration')) {
        assignments[subtask.id] = 'claude-code-agent';
      } else if (subtask.requiredCapabilities.includes('code_generation')) {
        assignments[subtask.id] = 'code-specialist-agent';
      } else if (subtask.requiredCapabilities.includes('monitoring')) {
        assignments[subtask.id] = 'monitor-agent';
      } else {
        assignments[subtask.id] = agents[0] || 'claude-code-agent';
      }
    });
    
    return assignments;
  }

  private mapDependenciesToSteps(dependencies: string[], allSubtasks: Array<any>): number[] {
    return dependencies.map(dep => {
      const index = allSubtasks.findIndex(subtask => subtask.id === dep);
      return index + 1; // Steps are 1-indexed
    }).filter(step => step > 0);
  }

  private async executeCoordinationPlan(plan: CoordinationPlan, originalTask: AgentTask): Promise<any> {
    console.log(`Executing coordination plan: ${plan.id}`);
    
    plan.status = 'executing';
    plan.startTime = new Date();
    
    const stepResults: { [step: number]: any } = {};
    const completedSteps = new Set<number>();
    
    try {
      // Execute workflow steps in dependency order
      for (const workflowStep of plan.workflow) {
        // Check if dependencies are completed
        const dependenciesMet = workflowStep.dependencies.every(dep => 
          completedSteps.has(dep)
        );
        
        if (!dependenciesMet) {
          throw new Error(`Dependencies not met for step ${workflowStep.step}`);
        }
        
        console.log(`Executing step ${workflowStep.step}: ${workflowStep.action}`);
        
        // Get dependency results
        const dependencyResults = workflowStep.dependencies.map(dep => stepResults[dep]);
        
        // Execute step with assigned agent
        const stepResult = await this.executeWorkflowStep(
          workflowStep, 
          originalTask, 
          dependencyResults
        );
        
        stepResults[workflowStep.step] = stepResult;
        completedSteps.add(workflowStep.step);
        
        // Update progress
        plan.progress = (completedSteps.size / plan.workflow.length) * 100;
        
        console.log(`Completed step ${workflowStep.step}, progress: ${plan.progress}%`);
      }
      
      plan.status = 'completed';
      plan.endTime = new Date();
      plan.progress = 100;
      
      // Aggregate results
      const finalResult = this.aggregateStepResults(stepResults, originalTask);
      
      console.log(`Coordination plan ${plan.id} completed successfully`);
      return finalResult;
      
    } catch (error) {
      plan.status = 'failed';
      plan.endTime = new Date();
      console.error(`Coordination plan ${plan.id} failed:`, error);
      throw error;
    }
  }

  private async executeWorkflowStep(
    step: any, 
    originalTask: AgentTask, 
    dependencyResults: any[]
  ): Promise<any> {
    const agent = this.subordinateAgents.get(step.agent);
    
    if (!agent) {
      // If agent not available, use prompt generation for AI tools
      return await this.executeStepWithPrompt(step, originalTask, dependencyResults);
    }
    
    // Create subtask for the agent
    const subtask: AgentTask = {
      id: `${originalTask.id}_step_${step.step}`,
      type: this.mapActionToTaskType(step.action),
      priority: originalTask.priority,
      description: step.action,
      context: {
        ...originalTask.context,
        previousOutput: dependencyResults.length > 0 ? JSON.stringify(dependencyResults) : undefined
      },
      requirements: originalTask.requirements,
      metadata: {
        ...originalTask.metadata
      }
    };
    
    // Execute subtask with timeout
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Step timeout')), step.timeout)
    );
    
    const taskPromise = agent.assignTask(subtask);
    
    return await Promise.race([taskPromise, timeoutPromise]);
  }

  private async executeStepWithPrompt(
    step: any, 
    originalTask: AgentTask, 
    dependencyResults: any[]
  ): Promise<any> {
    console.log(`Executing step with prompt generation: ${step.action}`);
    
    // Generate appropriate prompt for the step
    const prompt = await this.promptGenerator.generatePrompt({
      taskType: this.mapActionToTaskType(step.action),
      context: originalTask.context,
      previousResults: dependencyResults,
      targetAgent: step.agent,
      action: step.action
    });
    
    // Execute prompt with appropriate AI tool
    // This is a simplified implementation - would be expanded based on available AI integrations
    return {
      step: step.step,
      action: step.action,
      prompt: prompt,
      result: `Executed ${step.action}`,
      agent: step.agent
    };
  }

  private mapActionToTaskType(action: string): AgentTask['type'] {
    if (action.includes('generate') || action.includes('creation')) return 'code_generation';
    if (action.includes('review') || action.includes('analyze')) return 'code_review';
    if (action.includes('debug') || action.includes('investigate')) return 'debugging';
    if (action.includes('document')) return 'documentation';
    if (action.includes('test')) return 'testing';
    if (action.includes('refactor')) return 'refactoring';
    return 'analysis';
  }

  private aggregateStepResults(stepResults: { [step: number]: any }, originalTask: AgentTask): any {
    const steps = Object.keys(stepResults).map(Number).sort((a, b) => a - b);
    const aggregatedResult = {
      taskId: originalTask.id,
      taskType: originalTask.type,
      steps: steps.map(step => stepResults[step]),
      summary: this.generateResultSummary(stepResults, originalTask),
      completedAt: new Date()
    };
    
    return aggregatedResult;
  }

  private generateResultSummary(stepResults: { [step: number]: any }, originalTask: AgentTask): string {
    const stepCount = Object.keys(stepResults).length;
    const taskType = originalTask.type.replace('_', ' ');
    
    return `Successfully completed ${taskType} task with ${stepCount} coordination steps. ` +
           `All agents collaborated effectively to deliver the requested outcome.`;
  }

  private startQueueProcessing(): void {
    setInterval(async () => {
      if (!this.isProcessingQueue && this.taskQueue.length > 0) {
        this.isProcessingQueue = true;
        await this.processTaskQueue();
        this.isProcessingQueue = false;
      }
    }, 1000); // Check every second
  }

  private async processTaskQueue(): Promise<void> {
    while (this.taskQueue.length > 0 && this.activeTasks.size < this.config.maxConcurrentTasks) {
      const task = this.taskQueue.shift()!;
      await this.assignTask(task);
    }
  }

  public addSubordinateAgent(agent: BaseAgent): void {
    this.subordinateAgents.set(agent.getConfig().id, agent);
    console.log(`Added subordinate agent: ${agent.getConfig().id}`);
    
    // Listen to agent events
    agent.on('statusUpdate', (status) => {
      this.handleSubordinateStatusUpdate(agent.getConfig().id, status);
    });
    
    agent.on('taskCompleted', (result) => {
      this.handleSubordinateTaskCompletion(agent.getConfig().id, result);
    });
  }

  private handleSubordinateStatusUpdate(agentId: string, status: any): void {
    // Log status updates and potentially take action based on agent health
    if (status.healthScore < 50) {
      console.warn(`Agent ${agentId} health score is low: ${status.healthScore}`);
      // Could implement load balancing or agent restart logic here
    }
  }

  private handleSubordinateTaskCompletion(agentId: string, result: TaskResult): void {
    console.log(`Agent ${agentId} completed task ${result.taskId}: ${result.success ? 'SUCCESS' : 'FAILED'}`);
    // Update coordination plans and metrics
  }

  protected async handleMessage(message: AgentMessage): Promise<void> {
    switch (message.type) {
      case 'task_assignment':
        if (message.data.task) {
          this.taskQueue.push(message.data.task);
        }
        break;
        
      case 'status_update':
        // Handle status updates from other agents
        break;
        
      case 'coordination':
        // Handle coordination messages
        break;
        
      default:
        console.log(`Middle Manager received unhandled message type: ${message.type}`);
    }
  }

  public async shutdown(): Promise<void> {
    console.log(`Shutting down Middle Manager Agent: ${this.config.id}`);
    
    // Shutdown all subordinate agents
    for (const agent of this.subordinateAgents.values()) {
      await agent.shutdown();
    }
    
    // Clean up state
    this.coordinationPlans.clear();
    this.taskQueue = [];
    
    this.updateStatus({ state: 'offline' });
    console.log(`Middle Manager Agent ${this.config.id} shut down successfully`);
  }
}