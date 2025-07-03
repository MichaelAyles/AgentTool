import { DuckBridgeConnector } from '../../src/index';
import WebSocket from 'ws';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

describe('Full System Integration Tests', () => {
  let connector: DuckBridgeConnector;
  const httpPort = 9001;
  const wsPort = 9002;
  const testUuid = uuidv4();

  beforeAll(async () => {
    // Create connector with test ports
    connector = new DuckBridgeConnector(httpPort, wsPort);
    await connector.start();
    
    // Wait for server to be ready
    await new Promise(resolve => setTimeout(resolve, 2000));
  }, 30000);

  afterAll(async () => {
    if (connector) {
      await (connector as any).shutdown('test');
    }
  }, 10000);

  describe('HTTP API Integration', () => {
    const baseUrl = `http://localhost:${httpPort}`;

    test('should return healthy status', async () => {
      const response = await axios.get(`${baseUrl}/health`);
      expect(response.status).toBe(200);
      expect(response.data.status).toBe('healthy');
      expect(response.data).toHaveProperty('uuid');
      expect(response.data).toHaveProperty('timestamp');
      expect(response.data).toHaveProperty('sessions');
      expect(response.data).toHaveProperty('websocket');
      expect(response.data).toHaveProperty('resources');
    });

    test('should return connector info', async () => {
      const response = await axios.get(`${baseUrl}/info`);
      expect(response.status).toBe(200);
      expect(response.data.name).toBe('DuckBridge Connector');
      expect(response.data.version).toBe('0.1.0');
      expect(response.data).toHaveProperty('uuid');
      expect(response.data.websocket_url).toBe(`ws://localhost:${wsPort}`);
      expect(response.data.http_url).toBe(`http://localhost:${httpPort}`);
    });

    test('should generate new UUID', async () => {
      const response = await axios.post(`${baseUrl}/generate-uuid`);
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('uuid');
      expect(response.data.uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      expect(response.data.websocket_url).toBe(`ws://localhost:${wsPort}`);
      expect(response.data.instructions).toBeInstanceOf(Array);
    });

    test('should list sessions', async () => {
      const response = await axios.get(`${baseUrl}/sessions`);
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('database_sessions');
      expect(response.data).toHaveProperty('terminal_sessions');
      expect(response.data).toHaveProperty('websocket_clients');
      expect(Array.isArray(response.data.database_sessions)).toBe(true);
      expect(Array.isArray(response.data.terminal_sessions)).toBe(true);
      expect(Array.isArray(response.data.websocket_clients)).toBe(true);
    });

    test('should detect tools', async () => {
      const response = await axios.get(`${baseUrl}/tools`);
      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data).toHaveProperty('tools');
      expect(response.data).toHaveProperty('statistics');
      expect(Array.isArray(response.data.tools)).toBe(true);
    });

    test('should get agent status', async () => {
      const response = await axios.get(`${baseUrl}/agents`);
      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data).toHaveProperty('system');
      expect(response.data).toHaveProperty('agents');
      expect(response.data.system.isInitialized).toBe(true);
    });
  });

  describe('WebSocket Integration', () => {
    test('should establish WebSocket connection and authenticate', (done) => {
      const client = new WebSocket(`ws://localhost:${wsPort}`);
      
      client.on('open', () => {
        const authMessage = {
          type: 'auth',
          uuid: testUuid
        };
        client.send(JSON.stringify(authMessage));
      });
      
      client.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'auth_success') {
          expect(message.uuid).toBe(testUuid);
          client.close();
          done();
        }
      });
      
      client.on('error', done);
    });

    test('should create and manage terminal through WebSocket', (done) => {
      const client = new WebSocket(`ws://localhost:${wsPort}`);
      let terminalId: string;
      let authenticated = false;
      let terminalCreated = false;
      
      client.on('open', () => {
        const authMessage = {
          type: 'auth',
          uuid: testUuid
        };
        client.send(JSON.stringify(authMessage));
      });
      
      client.on('message', (data) => {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'auth_success' && !authenticated) {
          authenticated = true;
          // Create terminal
          const createMessage = {
            type: 'terminal_create',
            data: {
              workingDirectory: process.cwd()
            }
          };
          client.send(JSON.stringify(createMessage));
        } else if (message.type === 'terminal_created' && !terminalCreated) {
          terminalCreated = true;
          terminalId = message.data.terminal.id;
          expect(terminalId).toBeDefined();
          expect(message.data.terminal.uuid).toBe(testUuid);
          
          // Send some input
          const inputMessage = {
            type: 'terminal_input',
            data: {
              terminalId: terminalId,
              data: 'echo "integration test"\n'
            }
          };
          client.send(JSON.stringify(inputMessage));
        } else if (message.type === 'terminal_output') {
          expect(message.data.terminalId).toBe(terminalId);
          expect(typeof message.data.data).toBe('string');
          
          // Close terminal
          const closeMessage = {
            type: 'terminal_close',
            data: {
              terminalId: terminalId
            }
          };
          client.send(JSON.stringify(closeMessage));
        } else if (message.type === 'terminal_closed') {
          expect(message.data.terminalId).toBe(terminalId);
          client.close();
          done();
        }
      });
      
      client.on('error', done);
    }, 10000);
  });

  describe('Multi-Terminal Integration', () => {
    test('should handle multiple terminals from same user', async () => {
      const client = new WebSocket(`ws://localhost:${wsPort}`);
      const terminals: string[] = [];
      
      return new Promise<void>((resolve, reject) => {
        let authenticated = false;
        let terminalsCreated = 0;
        const maxTerminals = 3;
        
        client.on('open', () => {
          const authMessage = {
            type: 'auth',
            uuid: testUuid
          };
          client.send(JSON.stringify(authMessage));
        });
        
        client.on('message', (data) => {
          const message = JSON.parse(data.toString());
          
          if (message.type === 'auth_success' && !authenticated) {
            authenticated = true;
            
            // Create multiple terminals
            for (let i = 0; i < maxTerminals; i++) {
              const createMessage = {
                type: 'terminal_create',
                data: {
                  workingDirectory: process.cwd()
                }
              };
              client.send(JSON.stringify(createMessage));
            }
          } else if (message.type === 'terminal_created') {
            terminals.push(message.data.terminal.id);
            terminalsCreated++;
            
            if (terminalsCreated === maxTerminals) {
              expect(terminals).toHaveLength(maxTerminals);
              
              // Close all terminals
              terminals.forEach(terminalId => {
                const closeMessage = {
                  type: 'terminal_close',
                  data: { terminalId }
                };
                client.send(JSON.stringify(closeMessage));
              });
            }
          } else if (message.type === 'terminal_closed') {
            const index = terminals.indexOf(message.data.terminalId);
            if (index > -1) {
              terminals.splice(index, 1);
            }
            
            if (terminals.length === 0) {
              client.close();
              resolve();
            }
          }
        });
        
        client.on('error', reject);
        
        // Timeout
        setTimeout(() => {
          reject(new Error('Test timeout'));
        }, 15000);
      });
    }, 20000);
  });

  describe('Agent Integration', () => {
    test('should create and manage agents through API', async () => {
      const baseUrl = `http://localhost:${httpPort}`;
      
      // Create an agent
      const createResponse = await axios.post(`${baseUrl}/agents/create`, {
        agentType: 'middle_manager',
        config: {
          name: 'Integration Test Agent'
        }
      });
      
      expect(createResponse.status).toBe(200);
      expect(createResponse.data.success).toBe(true);
      expect(createResponse.data.agentId).toBeDefined();
      
      const agentId = createResponse.data.agentId;
      
      // Submit a task
      const taskResponse = await axios.post(`${baseUrl}/agents/tasks`, {
        type: 'test_task',
        description: 'Integration test task',
        context: {
          test: true
        },
        requirements: {
          tools: [],
          capabilities: []
        }
      });
      
      expect(taskResponse.status).toBe(200);
      expect(taskResponse.data.success).toBe(true);
      expect(taskResponse.data.taskId).toBeDefined();
      
      const taskId = taskResponse.data.taskId;
      
      // Check task status
      const statusResponse = await axios.get(`${baseUrl}/agents/tasks/${taskId}`);
      expect(statusResponse.status).toBe(200);
      expect(statusResponse.data.success).toBe(true);
      expect(statusResponse.data.task.id).toBe(taskId);
      
      // Get agent metrics
      const metricsResponse = await axios.get(`${baseUrl}/agents/metrics`);
      expect(metricsResponse.status).toBe(200);
      expect(metricsResponse.data.success).toBe(true);
      expect(metricsResponse.data.metrics.totalAgents).toBeGreaterThan(0);
      
      // Destroy agent
      const destroyResponse = await axios.delete(`${baseUrl}/agents/${agentId}`);
      expect(destroyResponse.status).toBe(200);
      expect(destroyResponse.data.success).toBe(true);
    });

    test('should handle agent communication', async () => {
      const baseUrl = `http://localhost:${httpPort}`;
      
      // Create multiple agents
      const agent1Response = await axios.post(`${baseUrl}/agents/create`, {
        agentType: 'middle_manager',
        config: { name: 'Agent 1' }
      });
      
      const agent2Response = await axios.post(`${baseUrl}/agents/create`, {
        agentType: 'middle_manager',
        config: { name: 'Agent 2' }
      });
      
      const agentId1 = agent1Response.data.agentId;
      const agentId2 = agent2Response.data.agentId;
      
      // Send message to specific agent
      const messageResponse = await axios.post(`${baseUrl}/agents/${agentId1}/message`, {
        type: 'test_message',
        data: { test: 'data' },
        priority: 'medium'
      });
      
      expect(messageResponse.status).toBe(200);
      expect(messageResponse.data.success).toBe(true);
      
      // Broadcast message
      const broadcastResponse = await axios.post(`${baseUrl}/agents/broadcast`, {
        type: 'broadcast_test',
        data: { broadcast: true },
        priority: 'high'
      });
      
      expect(broadcastResponse.status).toBe(200);
      expect(broadcastResponse.data.success).toBe(true);
      
      // Get message history
      const historyResponse = await axios.get(`${baseUrl}/agents/messages?limit=10`);
      expect(historyResponse.status).toBe(200);
      expect(historyResponse.data.success).toBe(true);
      expect(Array.isArray(historyResponse.data.messages)).toBe(true);
      
      // Cleanup
      await axios.delete(`${baseUrl}/agents/${agentId1}`);
      await axios.delete(`${baseUrl}/agents/${agentId2}`);
    });
  });

  describe('Project Management Integration', () => {
    test('should manage projects through API', async () => {
      const baseUrl = `http://localhost:${httpPort}`;
      
      // Get initial projects
      const initialResponse = await axios.get(`${baseUrl}/projects/${testUuid}`);
      expect(initialResponse.status).toBe(200);
      expect(initialResponse.data).toHaveProperty('projects');
      
      // Create a project
      const createResponse = await axios.post(`${baseUrl}/projects/${testUuid}`, {
        name: 'Integration Test Project',
        path: process.cwd(),
        description: 'Test project for integration tests',
        type: 'existing-local'
      });
      
      expect(createResponse.status).toBe(200);
      expect(createResponse.data.success).toBe(true);
      expect(createResponse.data.project).toBeDefined();
      
      const projectId = createResponse.data.project.id;
      
      // Get specific project
      const getResponse = await axios.get(`${baseUrl}/projects/${testUuid}/${projectId}`);
      expect(getResponse.status).toBe(200);
      expect(getResponse.data.project.name).toBe('Integration Test Project');
      
      // Update project
      const updateResponse = await axios.put(`${baseUrl}/projects/${testUuid}/${projectId}`, {
        description: 'Updated description'
      });
      
      expect(updateResponse.status).toBe(200);
      expect(updateResponse.data.success).toBe(true);
      expect(updateResponse.data.project.description).toBe('Updated description');
      
      // Delete project
      const deleteResponse = await axios.delete(`${baseUrl}/projects/${testUuid}/${projectId}`);
      expect(deleteResponse.status).toBe(200);
      expect(deleteResponse.data.success).toBe(true);
    });

    test('should browse directories', async () => {
      const baseUrl = `http://localhost:${httpPort}`;
      
      const response = await axios.get(`${baseUrl}/browse-directory`, {
        params: {
          path: process.cwd(),
          type: 'directory'
        }
      });
      
      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.path).toBe(process.cwd());
      expect(Array.isArray(response.data.items)).toBe(true);
    });
  });

  describe('Error Handling Integration', () => {
    test('should handle 404 endpoints gracefully', async () => {
      const baseUrl = `http://localhost:${httpPort}`;
      
      try {
        await axios.get(`${baseUrl}/non-existent-endpoint`);
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.response.status).toBe(404);
        expect(error.response.data.error).toBe('Not found');
        expect(error.response.data.available_endpoints).toBeDefined();
      }
    });

    test('should handle invalid WebSocket messages', (done) => {
      const client = new WebSocket(`ws://localhost:${wsPort}`);
      
      client.on('open', () => {
        // Send invalid JSON
        client.send('invalid json');
      });
      
      client.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'error') {
          expect(message.error).toContain('Invalid message format');
          client.close();
          done();
        }
      });
      
      client.on('error', done);
    });

    test('should handle invalid API requests', async () => {
      const baseUrl = `http://localhost:${httpPort}`;
      
      try {
        await axios.post(`${baseUrl}/projects/${testUuid}`, {
          // Missing required fields
          description: 'Test without name and path'
        });
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.response.status).toBe(400);
        expect(error.response.data.error).toContain('Missing required fields');
      }
    });
  });
});