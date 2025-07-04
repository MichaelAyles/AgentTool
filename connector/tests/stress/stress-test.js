const WebSocket = require('ws');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

class StressTest {
  constructor(httpPort = 3001, wsPort = 3002) {
    this.httpPort = httpPort;
    this.wsPort = wsPort;
    this.baseUrl = `http://localhost:${httpPort}`;
    this.wsUrl = `ws://localhost:${wsPort}`;
    this.results = {
      connectionTests: {},
      terminalTests: {},
      agentTests: {},
      apiTests: {},
      errors: []
    };
  }

  log(message) {
    console.log(`[${new Date().toISOString()}] ${message}`);
  }

  async waitForServer() {
    this.log('Waiting for server to be ready...');
    let attempts = 0;
    const maxAttempts = 30;
    
    while (attempts < maxAttempts) {
      try {
        await axios.get(`${this.baseUrl}/health`);
        this.log('Server is ready!');
        return true;
      } catch (error) {
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    throw new Error('Server not ready after 30 seconds');
  }

  async testConcurrentConnections(numConnections = 50) {
    this.log(`Testing ${numConnections} concurrent WebSocket connections...`);
    
    const startTime = Date.now();
    const connections = [];
    const promises = [];
    
    for (let i = 0; i < numConnections; i++) {
      const uuid = uuidv4();
      const promise = new Promise((resolve, reject) => {
        const client = new WebSocket(this.wsUrl);
        const startConnect = Date.now();
        
        client.on('open', () => {
          const authMessage = {
            type: 'auth',
            uuid: uuid
          };
          client.send(JSON.stringify(authMessage));
        });
        
        client.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            if (message.type === 'auth_success') {
              const connectTime = Date.now() - startConnect;
              connections.push({
                client,
                uuid,
                connectTime
              });
              resolve(connectTime);
            }
          } catch (error) {
            reject(error);
          }
        });
        
        client.on('error', reject);
        
        setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 10000);
      });
      
      promises.push(promise);
    }
    
    try {
      const connectTimes = await Promise.all(promises);
      const totalTime = Date.now() - startTime;
      
      this.results.connectionTests.concurrent = {
        connections: numConnections,
        totalTime,
        averageConnectTime: connectTimes.reduce((a, b) => a + b, 0) / connectTimes.length,
        minConnectTime: Math.min(...connectTimes),
        maxConnectTime: Math.max(...connectTimes),
        success: true
      };
      
      this.log(`Concurrent connections test completed: ${numConnections} connections in ${totalTime}ms`);
      
      // Cleanup connections
      connections.forEach(({ client }) => {
        if (client.readyState === WebSocket.OPEN) {
          client.close();
        }
      });
      
    } catch (error) {
      this.results.connectionTests.concurrent = {
        connections: numConnections,
        error: error.message,
        success: false
      };
      this.results.errors.push(`Concurrent connections: ${error.message}`);
    }
  }

  async testMultipleTerminals(numTerminals = 20) {
    this.log(`Testing ${numTerminals} concurrent terminals...`);
    
    const startTime = Date.now();
    const client = new WebSocket(this.wsUrl);
    const uuid = uuidv4();
    const terminals = [];
    
    return new Promise((resolve, reject) => {
      let authenticated = false;
      let terminalsCreated = 0;
      let terminalsClosed = 0;
      const createTimes = [];
      
      client.on('open', () => {
        const authMessage = {
          type: 'auth',
          uuid: uuid
        };
        client.send(JSON.stringify(authMessage));
      });
      
      client.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          
          if (message.type === 'auth_success' && !authenticated) {
            authenticated = true;
            
            // Create all terminals
            for (let i = 0; i < numTerminals; i++) {
              const createStart = Date.now();
              const createMessage = {
                type: 'terminal_create',
                data: {
                  workingDirectory: process.cwd()
                }
              };
              client.send(JSON.stringify(createMessage));
              createTimes.push({ index: i, startTime: createStart });
            }
          } else if (message.type === 'terminal_created') {
            terminalsCreated++;
            const terminalId = message.data.terminal.id;
            terminals.push(terminalId);
            
            const createTime = createTimes.find(t => t.index === terminalsCreated - 1);
            if (createTime) {
              createTime.duration = Date.now() - createTime.startTime;
            }
            
            if (terminalsCreated === numTerminals) {
              // All terminals created, now close them
              terminals.forEach(terminalId => {
                const closeMessage = {
                  type: 'terminal_close',
                  data: { terminalId }
                };
                client.send(JSON.stringify(closeMessage));
              });
            }
          } else if (message.type === 'terminal_closed') {
            terminalsClosed++;
            
            if (terminalsClosed === numTerminals) {
              const totalTime = Date.now() - startTime;
              const durations = createTimes.map(t => t.duration).filter(Boolean);
              
              this.results.terminalTests.multiple = {
                terminals: numTerminals,
                totalTime,
                averageCreateTime: durations.reduce((a, b) => a + b, 0) / durations.length,
                minCreateTime: Math.min(...durations),
                maxCreateTime: Math.max(...durations),
                success: true
              };
              
              this.log(`Multiple terminals test completed: ${numTerminals} terminals in ${totalTime}ms`);
              client.close();
              resolve();
            }
          }
        } catch (error) {
          this.results.terminalTests.multiple = {
            terminals: numTerminals,
            error: error.message,
            success: false
          };
          this.results.errors.push(`Multiple terminals: ${error.message}`);
          client.close();
          reject(error);
        }
      });
      
      client.on('error', (error) => {
        this.results.errors.push(`Terminal WebSocket error: ${error.message}`);
        reject(error);
      });
      
      setTimeout(() => {
        const error = new Error('Multiple terminals test timeout');
        this.results.terminalTests.multiple = {
          terminals: numTerminals,
          error: error.message,
          success: false
        };
        reject(error);
      }, 30000);
    });
  }

  async testAPILoad(numRequests = 100) {
    this.log(`Testing API load with ${numRequests} concurrent requests...`);
    
    const startTime = Date.now();
    const promises = [];
    
    for (let i = 0; i < numRequests; i++) {
      const promise = axios.get(`${this.baseUrl}/health`)
        .then(response => {
          return {
            status: response.status,
            time: Date.now()
          };
        })
        .catch(error => {
          return {
            error: error.message,
            time: Date.now()
          };
        });
      
      promises.push(promise);
    }
    
    try {
      const results = await Promise.all(promises);
      const totalTime = Date.now() - startTime;
      const successful = results.filter(r => r.status === 200).length;
      const failed = results.filter(r => r.error).length;
      
      this.results.apiTests.load = {
        requests: numRequests,
        successful,
        failed,
        totalTime,
        requestsPerSecond: (numRequests / totalTime) * 1000,
        success: failed === 0
      };
      
      this.log(`API load test completed: ${successful}/${numRequests} successful in ${totalTime}ms`);
      
    } catch (error) {
      this.results.apiTests.load = {
        requests: numRequests,
        error: error.message,
        success: false
      };
      this.results.errors.push(`API load test: ${error.message}`);
    }
  }

  async testAgentStress(numAgents = 10, numTasks = 50) {
    this.log(`Testing agent system with ${numAgents} agents and ${numTasks} tasks...`);
    
    const startTime = Date.now();
    const agentIds = [];
    
    try {
      // Create agents
      for (let i = 0; i < numAgents; i++) {
        const response = await axios.post(`${this.baseUrl}/agents/create`, {
          agentType: 'middle_manager',
          config: {
            name: `Stress Test Agent ${i}`
          }
        });
        
        if (response.data.success) {
          agentIds.push(response.data.agentId);
        }
      }
      
      this.log(`Created ${agentIds.length} agents`);
      
      // Submit tasks
      const taskPromises = [];
      for (let i = 0; i < numTasks; i++) {
        const taskPromise = axios.post(`${this.baseUrl}/agents/tasks`, {
          type: 'stress_test_task',
          description: `Stress test task ${i}`,
          context: {
            taskIndex: i,
            timestamp: Date.now()
          },
          requirements: {
            tools: [],
            capabilities: []
          }
        });
        
        taskPromises.push(taskPromise);
      }
      
      const taskResults = await Promise.all(taskPromises);
      const successfulTasks = taskResults.filter(r => r.data.success).length;
      
      // Wait a bit for task processing
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Get metrics
      const metricsResponse = await axios.get(`${this.baseUrl}/agents/metrics`);
      
      const totalTime = Date.now() - startTime;
      
      this.results.agentTests.stress = {
        agents: numAgents,
        agentsCreated: agentIds.length,
        tasks: numTasks,
        tasksSubmitted: successfulTasks,
        totalTime,
        metrics: metricsResponse.data.metrics,
        success: agentIds.length === numAgents && successfulTasks === numTasks
      };
      
      this.log(`Agent stress test completed: ${agentIds.length} agents, ${successfulTasks} tasks in ${totalTime}ms`);
      
      // Cleanup agents
      for (const agentId of agentIds) {
        try {
          await axios.delete(`${this.baseUrl}/agents/${agentId}`);
        } catch (error) {
          this.log(`Failed to cleanup agent ${agentId}: ${error.message}`);
        }
      }
      
    } catch (error) {
      this.results.agentTests.stress = {
        agents: numAgents,
        tasks: numTasks,
        error: error.message,
        success: false
      };
      this.results.errors.push(`Agent stress test: ${error.message}`);
      
      // Still try to cleanup
      for (const agentId of agentIds) {
        try {
          await axios.delete(`${this.baseUrl}/agents/${agentId}`);
        } catch (cleanupError) {
          // Ignore cleanup errors
        }
      }
    }
  }

  async runMemoryTest(duration = 30000) {
    this.log(`Running memory stress test for ${duration / 1000} seconds...`);
    
    const startTime = Date.now();
    let peakMemory = 0;
    const memorySnapshots = [];
    
    const monitorMemory = () => {
      const memUsage = process.memoryUsage();
      const totalMemory = memUsage.heapUsed + memUsage.external;
      peakMemory = Math.max(peakMemory, totalMemory);
      
      memorySnapshots.push({
        timestamp: Date.now() - startTime,
        heapUsed: memUsage.heapUsed,
        external: memUsage.external,
        total: totalMemory
      });
    };
    
    const memoryInterval = setInterval(monitorMemory, 1000);
    
    try {
      // Create continuous load
      // const _loadPromises = [];
      let requestCount = 0;
      
      const createLoad = async () => {
        while (Date.now() - startTime < duration) {
          const promises = [];
          
          // API requests
          for (let i = 0; i < 5; i++) {
            promises.push(
              axios.get(`${this.baseUrl}/health`).catch(() => {})
            );
          }
          
          // WebSocket connections
          const wsPromise = new Promise((resolve) => {
            const client = new WebSocket(this.wsUrl);
            client.on('open', () => {
              client.send(JSON.stringify({
                type: 'auth',
                uuid: uuidv4()
              }));
              setTimeout(() => {
                client.close();
                resolve();
              }, 100);
            });
            client.on('error', () => resolve());
          });
          promises.push(wsPromise);
          
          await Promise.all(promises);
          requestCount += promises.length;
          
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      };
      
      await createLoad();
      
      clearInterval(memoryInterval);
      monitorMemory(); // Final snapshot
      
      const totalTime = Date.now() - startTime;
      
      this.results.memoryTest = {
        duration: totalTime,
        requestCount,
        peakMemoryMB: Math.round(peakMemory / 1024 / 1024),
        snapshots: memorySnapshots,
        success: true
      };
      
      this.log(`Memory test completed: Peak memory ${Math.round(peakMemory / 1024 / 1024)}MB, ${requestCount} requests`);
      
    } catch (error) {
      clearInterval(memoryInterval);
      this.results.memoryTest = {
        duration: Date.now() - startTime,
        error: error.message,
        success: false
      };
      this.results.errors.push(`Memory test: ${error.message}`);
    }
  }

  async runAllTests() {
    this.log('Starting comprehensive stress tests...');
    
    try {
      await this.waitForServer();
      
      await this.testConcurrentConnections(50);
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      await this.testMultipleTerminals(20);
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      await this.testAPILoad(100);
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      await this.testAgentStress(5, 25);
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      await this.runMemoryTest(30000);
      
    } catch (error) {
      this.log(`Test suite error: ${error.message}`);
      this.results.errors.push(`Test suite: ${error.message}`);
    }
    
    this.generateReport();
  }

  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
        totalErrors: this.results.errors.length
      },
      results: this.results
    };
    
    // Count tests
    Object.values(this.results).forEach(category => {
      if (typeof category === 'object' && category !== null && !Array.isArray(category)) {
        Object.values(category).forEach(test => {
          if (typeof test === 'object' && Object.prototype.hasOwnProperty.call(test, 'success')) {
            report.summary.totalTests++;
            if (test.success) {
              report.summary.passedTests++;
            } else {
              report.summary.failedTests++;
            }
          }
        });
      }
    });
    
    // Special handling for memory test
    if (this.results.memoryTest) {
      report.summary.totalTests++;
      if (this.results.memoryTest.success) {
        report.summary.passedTests++;
      } else {
        report.summary.failedTests++;
      }
    }
    
    this.log('\\n' + '='.repeat(80));
    this.log('STRESS TEST REPORT');
    this.log('='.repeat(80));
    this.log(`Total Tests: ${report.summary.totalTests}`);
    this.log(`Passed: ${report.summary.passedTests}`);
    this.log(`Failed: ${report.summary.failedTests}`);
    this.log(`Errors: ${report.summary.totalErrors}`);
    this.log('='.repeat(80));
    
    if (this.results.errors.length > 0) {
      this.log('\\nErrors:');
      this.results.errors.forEach(error => {
        this.log(`  - ${error}`);
      });
    }
    
    this.log('\\nDetailed Results:');
    this.log(JSON.stringify(report, null, 2));
    
    return report;
  }
}

module.exports = StressTest;

// Run if called directly
if (require.main === module) {
  const httpPort = process.argv[2] ? parseInt(process.argv[2]) : 3001;
  const wsPort = process.argv[3] ? parseInt(process.argv[3]) : 3002;
  
  const stressTest = new StressTest(httpPort, wsPort);
  stressTest.runAllTests()
    .then(() => {
      console.log('Stress tests completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Stress tests failed:', error);
      process.exit(1);
    });
}