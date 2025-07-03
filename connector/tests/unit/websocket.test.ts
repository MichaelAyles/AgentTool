import { WebSocketManager } from '../../src/websocket';
import { TerminalManager } from '../../src/terminal';
import { SessionDatabase } from '../../src/database';
import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';

describe('WebSocketManager', () => {
  let wsManager: WebSocketManager;
  let terminalManager: TerminalManager;
  let database: SessionDatabase;
  const testPort = 9999;
  const testUuid = uuidv4();

  beforeAll(async () => {
    terminalManager = new TerminalManager();
    database = new SessionDatabase();
    wsManager = new WebSocketManager(testPort, terminalManager, database);
    
    // Start the WebSocket server
    await new Promise<void>((resolve) => {
      const checkServer = () => {
        if ((wsManager as any).wss) {
          resolve();
        } else {
          setTimeout(checkServer, 100);
        }
      };
      checkServer();
    });
  });

  afterAll(async () => {
    wsManager.destroy();
    terminalManager.destroy();
    database.close();
  });

  describe('WebSocket Server', () => {
    test('should start WebSocket server on specified port', () => {
      expect((wsManager as any).wss).toBeDefined();
      expect((wsManager as any).port).toBe(testPort);
    });

    test('should accept WebSocket connections', (done) => {
      const client = new WebSocket(`ws://localhost:${testPort}`);
      
      client.on('open', () => {
        expect(client.readyState).toBe(WebSocket.OPEN);
        client.close();
        done();
      });
      
      client.on('error', (error) => {
        done(error);
      });
    });

    test('should handle client authentication', (done) => {
      const client = new WebSocket(`ws://localhost:${testPort}`);
      
      client.on('open', () => {
        // Send authentication message
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
      
      client.on('error', (error) => {
        done(error);
      });
    });

    test('should reject invalid authentication', (done) => {
      const client = new WebSocket(`ws://localhost:${testPort}`);
      
      client.on('open', () => {
        // Send invalid authentication message
        const authMessage = {
          type: 'auth',
          uuid: 'invalid-uuid-format'
        };
        client.send(JSON.stringify(authMessage));
      });
      
      client.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'auth_error') {
          expect(message.error).toContain('Invalid UUID format');
          client.close();
          done();
        }
      });
      
      client.on('error', (error) => {
        done(error);
      });
    });
  });

  describe('Message Handling', () => {
    let authenticatedClient: WebSocket;
    
    beforeEach((done) => {
      authenticatedClient = new WebSocket(`ws://localhost:${testPort}`);
      
      authenticatedClient.on('open', () => {
        const authMessage = {
          type: 'auth',
          uuid: testUuid
        };
        authenticatedClient.send(JSON.stringify(authMessage));
      });
      
      authenticatedClient.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'auth_success') {
          done();
        }
      });
    });
    
    afterEach(() => {
      if (authenticatedClient.readyState === WebSocket.OPEN) {
        authenticatedClient.close();
      }
    });

    test('should handle terminal creation message', (done) => {
      const createMessage = {
        type: 'terminal_create',
        data: {
          workingDirectory: process.cwd()
        }
      };
      
      authenticatedClient.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'terminal_created') {
          expect(message.data.terminal).toBeDefined();
          expect(message.data.terminal.id).toBeDefined();
          expect(message.data.terminal.uuid).toBe(testUuid);
          done();
        }
      });
      
      authenticatedClient.send(JSON.stringify(createMessage));
    });

    test('should handle terminal input message', async () => {
      // First create a terminal
      const terminal = await terminalManager.createSession(testUuid);
      
      return new Promise<void>((resolve, reject) => {
        let outputReceived = false;
        
        authenticatedClient.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'terminal_output') {
            outputReceived = true;
            expect(message.data.terminalId).toBe(terminal.id);
            expect(typeof message.data.data).toBe('string');
            resolve();
          }
        });
        
        const inputMessage = {
          type: 'terminal_input',
          data: {
            terminalId: terminal.id,
            data: 'echo "test"\n'
          }
        };
        
        authenticatedClient.send(JSON.stringify(inputMessage));
        
        // Timeout if no output received
        setTimeout(() => {
          if (!outputReceived) {
            reject(new Error('No terminal output received'));
          }
        }, 5000);
      });
    });

    test('should handle terminal resize message', async () => {
      const terminal = await terminalManager.createSession(testUuid);
      
      const resizeMessage = {
        type: 'terminal_resize',
        data: {
          terminalId: terminal.id,
          cols: 120,
          rows: 40
        }
      };
      
      // Should not throw
      expect(() => {
        authenticatedClient.send(JSON.stringify(resizeMessage));
      }).not.toThrow();
    });

    test('should handle terminal close message', async () => {
      const terminal = await terminalManager.createSession(testUuid);
      
      return new Promise<void>((resolve) => {
        authenticatedClient.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'terminal_closed') {
            expect(message.data.terminalId).toBe(terminal.id);
            resolve();
          }
        });
        
        const closeMessage = {
          type: 'terminal_close',
          data: {
            terminalId: terminal.id
          }
        };
        
        authenticatedClient.send(JSON.stringify(closeMessage));
      });
    });

    test('should handle invalid message format gracefully', (done) => {
      const invalidMessage = 'invalid json';
      
      // Listen for error message
      authenticatedClient.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'error') {
          expect(message.error).toContain('Invalid message format');
          done();
        }
      });
      
      authenticatedClient.send(invalidMessage);
    });

    test('should handle unknown message type', (done) => {
      const unknownMessage = {
        type: 'unknown_type',
        data: {}
      };
      
      authenticatedClient.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'error') {
          expect(message.error).toContain('Unknown message type');
          done();
        }
      });
      
      authenticatedClient.send(JSON.stringify(unknownMessage));
    });
  });

  describe('Client Management', () => {
    test('should track connected clients', () => {
      const clients = wsManager.getConnectedClients();
      expect(Array.isArray(clients)).toBe(true);
    });

    test('should handle client disconnection', (done) => {
      const client = new WebSocket(`ws://localhost:${testPort}`);
      
      client.on('open', () => {
        // Authenticate first
        const authMessage = {
          type: 'auth',
          uuid: testUuid
        };
        client.send(JSON.stringify(authMessage));
      });
      
      client.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'auth_success') {
          // Close connection immediately after auth
          client.close();
          
          // Check that client is removed from connected clients
          setTimeout(() => {
            const clients = wsManager.getConnectedClients();
            const foundClient = clients.find(c => c.uuid === testUuid);
            expect(foundClient).toBeUndefined();
            done();
          }, 100);
        }
      });
    });

    test('should handle ping/pong heartbeat', (done) => {
      const client = new WebSocket(`ws://localhost:${testPort}`);
      
      client.on('open', () => {
        const authMessage = {
          type: 'auth',
          uuid: testUuid
        };
        client.send(JSON.stringify(authMessage));
      });
      
      client.on('ping', () => {
        // Respond to ping with pong
        client.pong();
      });
      
      client.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'auth_success') {
          // Wait for ping
          setTimeout(() => {
            client.close();
            done();
          }, 1000);
        }
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle client errors gracefully', (done) => {
      const client = new WebSocket(`ws://localhost:${testPort}`);
      
      client.on('open', () => {
        // Force an error by sending malformed data
        (client as any)._socket.write('malformed data');
      });
      
      client.on('error', () => {
        // Error should be handled gracefully
        done();
      });
      
      client.on('close', () => {
        done();
      });
    });

    test('should handle operations on non-existent terminals', (done) => {
      const client = new WebSocket(`ws://localhost:${testPort}`);
      
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
          const inputMessage = {
            type: 'terminal_input',
            data: {
              terminalId: 'non-existent-terminal',
              data: 'test'
            }
          };
          client.send(JSON.stringify(inputMessage));
        } else if (message.type === 'error') {
          expect(message.error).toContain('Terminal not found');
          client.close();
          done();
        }
      });
    });
  });
});