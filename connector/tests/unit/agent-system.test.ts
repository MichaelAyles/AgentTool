import { AgentSystem } from '../../src/agents/agent-system';
import { AgentMessageBus } from '../../src/agents/message-bus';
import { AgentTask } from '../../src/agents/types';
import { v4 as uuidv4 } from 'uuid';

describe('AgentSystem', () => {
  let agentSystem: AgentSystem;
  let messageBus: AgentMessageBus;

  beforeEach(async () => {
    messageBus = new AgentMessageBus();
    await messageBus.initialize();
    
    agentSystem = new AgentSystem({
      autoSpawnDefault: false, // Don't auto-spawn for tests
      maxAgents: 5,
      enableLogging: false,
      enableMetrics: true,
      healthCheckInterval: 1000
    });
    
    await agentSystem.initialize();
  });

  afterEach(async () => {
    await agentSystem.shutdown();
    await messageBus.shutdown();
  });

  describe('System Initialization', () => {
    test('should initialize successfully', () => {
      const status = agentSystem.getSystemStatus();
      expect(status.initialized).toBe(true);
      expect(status.agents.total).toBe(0); // No auto-spawn
    });

    test('should have proper configuration', () => {
      const status = agentSystem.getSystemStatus();
      expect(status.initialized).toBe(true);
      expect(status.agents.total).toBe(0);
    });
  });

  describe('Agent Management', () => {
    test('should create Claude Code agent', async () => {
      const agentId = await agentSystem.createAgent('claude_code', {
        name: 'Test Claude Agent'
      });
      
      expect(agentId).toBeDefined();
      expect(typeof agentId).toBe('string');
      
      const statuses = agentSystem.getAgentStatuses();
      expect(Object.keys(statuses)).toHaveLength(1);
      expect(statuses[agentId]).toBeDefined();
    });

    test('should create Gemini agent', async () => {
      const agentId = await agentSystem.createAgent('gemini', {
        name: 'Test Gemini Agent'
      });
      
      expect(agentId).toBeDefined();
      
      const statuses = agentSystem.getAgentStatuses();
      expect(Object.keys(statuses)).toHaveLength(1);
    });

    test('should create Monitor agent', async () => {
      const agentId = await agentSystem.createAgent('monitor', {
        name: 'Test Monitor Agent'
      });
      
      expect(agentId).toBeDefined();
      
      const statuses = agentSystem.getAgentStatuses();
      expect(Object.keys(statuses)).toHaveLength(1);
      expect(statuses[agentId]).toBeDefined();
    });

    test('should enforce agent limits', async () => {
      // Create maximum allowed agents (5)
      const agentIds = [];
      for (let i = 0; i < 5; i++) {
        const agentId = await agentSystem.createAgent('monitor', {
          name: `Test Agent ${i}`
        });
        agentIds.push(agentId);
      }
      
      // 6th agent should fail
      await expect(agentSystem.createAgent('monitor', {
        name: 'Extra Agent'
      })).rejects.toThrow();
    });

    test('should destroy agent successfully', async () => {
      const agentId = await agentSystem.createAgent('monitor', {
        name: 'Test Agent'
      });
      
      await agentSystem.destroyAgent(agentId);
      
      const statuses = agentSystem.getAgentStatuses();
      expect(Object.keys(statuses)).toHaveLength(0);
    });

    test('should restart agent successfully', async () => {
      const agentId = await agentSystem.createAgent('monitor', {
        name: 'Test Agent'
      });
      
      const statusesBefore = agentSystem.getAgentStatuses();
      // const _statusBefore = statusesBefore[agentId];
      
      await agentSystem.restartAgent(agentId);
      
      const statusesAfter = agentSystem.getAgentStatuses();
      const statusAfter = statusesAfter[agentId];
      expect(statusAfter).toBeDefined();
    });
  });

  describe('Task Management', () => {
    let agentId: string;
    
    beforeEach(async () => {
      agentId = await agentSystem.createAgent('coordinator', {
        name: 'Test Coordinator Agent'
      });
    });

    test('should submit task successfully', async () => {
      const task: AgentTask = {
        id: uuidv4(),
        type: 'code_generation',
        priority: 'medium',
        description: 'Generate test code',
        context: {
          language: 'typescript',
          requirements: 'Create a simple function'
        },
        requirements: {
          tools: ['claude'],
          capabilities: ['code_generation']
        },
        metadata: {
          createdAt: new Date(),
          source: 'test'
        }
      };
      
      const taskId = await agentSystem.submitTask(task);
      expect(taskId).toBe(task.id);
    });

    test('should track task status', async () => {
      const task: AgentTask = {
        id: uuidv4(),
        type: 'code_analysis',
        priority: 'high',
        description: 'Analyze code quality',
        context: {},
        requirements: {
          tools: [],
          capabilities: ['code_analysis']
        },
        metadata: {
          createdAt: new Date()
        }
      };
      
      await agentSystem.submitTask(task);
      
      const status = await agentSystem.getTaskStatus(task.id);
      expect(status).toBeDefined();
      expect(status?.id).toBe(task.id);
      expect(['pending', 'assigned', 'in_progress', 'completed', 'failed']).toContain(status?.status || 'pending');
    });

    test('should handle task completion', async () => {
      const task: AgentTask = {
        id: uuidv4(),
        type: 'simple_task',
        priority: 'low',
        description: 'Simple test task',
        context: {},
        requirements: {
          tools: [],
          capabilities: []
        },
        metadata: {
          createdAt: new Date()
        }
      };
      
      await agentSystem.submitTask(task);
      
      // Wait a bit for task processing
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const result = await agentSystem.getTaskResult(task.id);
      expect(result).toBeDefined();
    });

    test('should handle multiple concurrent tasks', async () => {
      const tasks: AgentTask[] = [];
      for (let i = 0; i < 3; i++) {
        tasks.push({
          id: uuidv4(),
          type: 'concurrent_task',
          priority: 'medium',
          description: `Concurrent task ${i}`,
          context: { index: i },
          requirements: {
            tools: [],
            capabilities: []
          },
          metadata: {
            createdAt: new Date()
          }
        });
      }
      
      // Submit all tasks
      const taskIds = await Promise.all(
        tasks.map(task => agentSystem.submitTask(task))
      );
      
      expect(taskIds).toHaveLength(3);
      expect(taskIds.every(id => typeof id === 'string')).toBe(true);
    });
  });

  describe('Message Communication', () => {
    let agentId: string;
    
    beforeEach(async () => {
      agentId = await agentSystem.createAgent('monitor', {
        name: 'Test Agent'
      });
    });

    test('should send message to agent', async () => {
      const message = {
        type: 'status_update' as const,
        toAgent: agentId,
        data: { test: 'data' },
        priority: 'medium' as const
      };
      
      await expect(agentSystem.sendMessageToAgent(agentId, message))
        .resolves.not.toThrow();
    });

    test('should broadcast message to all agents', async () => {
      // Create multiple agents
      await agentSystem.createAgent('gemini', {
        name: 'Test Agent 2'
      });
      
      const message = {
        type: 'status_update' as const,
        data: { test: 'broadcast' },
        priority: 'high' as const
      };
      
      await expect(agentSystem.broadcastMessage(message))
        .resolves.not.toThrow();
    });

    test('should get message history', () => {
      const history = agentSystem.getMessageHistory(5);
      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBeLessThanOrEqual(5);
    });
  });

  describe('Metrics and Monitoring', () => {
    test('should provide agent metrics', () => {
      const metrics = agentSystem.getAgentMetrics();
      expect(metrics).toHaveProperty('totalAgents');
      expect(metrics).toHaveProperty('agentsByType');
      expect(metrics).toHaveProperty('agentsByState');
      expect(metrics).toHaveProperty('averageHealthScore');
      expect(metrics).toHaveProperty('systemUptime');
      expect(typeof metrics.totalAgents).toBe('number');
    });

    test('should track system uptime', async () => {
      const metrics1 = agentSystem.getAgentMetrics();
      
      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const metrics2 = agentSystem.getAgentMetrics();
      expect(metrics2.systemUptime).toBeGreaterThan(metrics1.systemUptime);
    });

    test('should provide aggregation history', () => {
      const history = agentSystem.getAggregationHistory();
      expect(Array.isArray(history)).toBe(true);
    });
  });

  describe('System State Management', () => {
    test('should export system state', () => {
      const state = agentSystem.exportSystemState();
      expect(typeof state).toBe('string');
      
      const parsed = JSON.parse(state);
      expect(parsed).toHaveProperty('timestamp');
      expect(parsed).toHaveProperty('systemStatus');
      expect(parsed).toHaveProperty('agents');
      expect(parsed).toHaveProperty('metrics');
    });

    test('should clear task history', async () => {
      // Submit a task first
      const task: AgentTask = {
        id: uuidv4(),
        type: 'test_task',
        priority: 'medium',
        description: 'Test task for history',
        context: {},
        requirements: {
          tools: [],
          capabilities: []
        },
        metadata: {
          createdAt: new Date()
        }
      };
      
      await agentSystem.submitTask(task);
      
      // Clear history
      await agentSystem.clearTaskHistory();
      
      // Task should no longer be retrievable
      const status = await agentSystem.getTaskStatus(task.id);
      expect(status).toBeNull();
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid agent type', async () => {
      await expect(agentSystem.createAgent('invalid_type' as any, {}))
        .rejects.toThrow();
    });

    test('should handle non-existent agent operations', async () => {
      const fakeAgentId = uuidv4();
      
      await expect(agentSystem.destroyAgent(fakeAgentId))
        .rejects.toThrow();
      
      await expect(agentSystem.restartAgent(fakeAgentId))
        .rejects.toThrow();
    });

    test('should handle invalid task', async () => {
      const invalidTask = {
        id: 'invalid',
        type: 'invalid_type'
      } as any;
      
      await expect(agentSystem.submitTask(invalidTask))
        .rejects.toThrow();
    });

    test('should handle message sending to non-existent agent', async () => {
      const fakeAgentId = uuidv4();
      const message = {
        type: 'status_update' as const,
        toAgent: fakeAgentId,
        data: {},
        priority: 'medium' as const
      };
      
      // This should not throw as the message routing will warn but not error
      await expect(agentSystem.sendMessageToAgent(fakeAgentId, message))
        .resolves.not.toThrow();
    });
  });
});