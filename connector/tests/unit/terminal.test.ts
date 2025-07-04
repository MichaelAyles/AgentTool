import { TerminalManager } from '../../src/terminal';
import { v4 as uuidv4 } from 'uuid';

describe('TerminalManager', () => {
  let terminalManager: TerminalManager;
  const testUuid = uuidv4();

  beforeEach(() => {
    terminalManager = new TerminalManager();
  });

  afterEach(() => {
    // Cleanup all terminals after each test
    terminalManager.destroy();
  });

  describe('Terminal Creation', () => {
    test('should create a terminal session successfully', async () => {
      const session = await terminalManager.createSession(testUuid);
      
      expect(session).toBeDefined();
      expect(session.uuid).toBe(testUuid);
      expect(session.id).toBeDefined();
      expect(session.isActive).toBe(true);
      expect(session.createdAt).toBeInstanceOf(Date);
    });

    test('should enforce user terminal limits', async () => {
      // Create maximum allowed terminals for user (8)
      const sessions = [];
      for (let i = 0; i < 8; i++) {
        const session = await terminalManager.createSession(testUuid);
        sessions.push(session);
      }

      // 9th terminal should fail
      await expect(terminalManager.createSession(testUuid))
        .rejects.toThrow('Maximum terminals per user reached');
    });

    test('should enforce global terminal limits', async () => {
      // Create terminals for different users up to global limit (50)
      const sessions = [];
      for (let i = 0; i < 50; i++) {
        const userUuid = uuidv4();
        const session = await terminalManager.createSession(userUuid);
        sessions.push(session);
      }

      // 51st terminal should fail
      const newUserUuid = uuidv4();
      await expect(terminalManager.createSession(newUserUuid))
        .rejects.toThrow('Maximum global terminals reached');
    });

    test('should create terminals with different shells based on platform', async () => {
      const session = await terminalManager.createSession(testUuid);
      
      if (process.platform === 'win32') {
        expect(session.shell).toContain('cmd.exe');
      } else {
        expect(session.shell).toMatch(/\/(bash|zsh|sh)$/);
      }
    });
  });

  describe('Terminal Management', () => {
    test('should retrieve active sessions for user', async () => {
      const session1 = await terminalManager.createSession(testUuid);
      const session2 = await terminalManager.createSession(testUuid);
      
      const activeSessions = terminalManager.getActiveSessions();
      const userSessions = activeSessions.filter(s => s.uuid === testUuid);
      
      expect(userSessions).toHaveLength(2);
      expect(userSessions.map(s => s.id)).toContain(session1.id);
      expect(userSessions.map(s => s.id)).toContain(session2.id);
    });

    test('should get session by terminal ID', async () => {
      const session = await terminalManager.createSession(testUuid);
      const retrieved = terminalManager.getSession(session.id);
      
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(session.id);
      expect(retrieved?.uuid).toBe(testUuid);
    });

    test('should terminate specific terminal session', async () => {
      const session = await terminalManager.createSession(testUuid);
      
      // Terminate the session
      const terminated = terminalManager.terminateSession(session.id);
      expect(terminated).toBe(true);
      
      // Wait a bit for cleanup
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const retrieved = terminalManager.getSession(session.id);
      expect(retrieved?.isActive).toBe(false);
    });

    test('should cleanup idle sessions', async () => {
      const session = await terminalManager.createSession(testUuid);
      
      // Mock last activity to be more than 30 minutes ago
      const terminal = terminalManager.getSession(session.id);
      if (terminal) {
        (terminal as any).lastActivity = new Date(Date.now() - 31 * 60 * 1000);
      }
      
      // Trigger cleanup
      (terminalManager as any).cleanupIdleSessions();
      
      // Session should be terminated
      await new Promise(resolve => setTimeout(resolve, 100));
      const retrieved = terminalManager.getSession(session.id);
      expect(retrieved?.isActive).toBe(false);
    });
  });

  describe('Resource Management', () => {
    test('should track memory usage', () => {
      const resourceUsage = terminalManager.getResourceUsage();
      
      expect(resourceUsage).toHaveProperty('memoryUsage');
      expect(resourceUsage).toHaveProperty('activeTerminals');
      expect(resourceUsage).toHaveProperty('totalTerminals');
      expect(resourceUsage).toHaveProperty('limits');
      
      expect(typeof resourceUsage.activeTerminals).toBe('number');
      expect(typeof resourceUsage.totalTerminals).toBe('number');
      expect(resourceUsage.limits.maxTerminalsPerUser).toBe(8);
      expect(resourceUsage.limits.maxGlobalTerminals).toBe(50);
    });

    test('should handle terminal input/output', async () => {
      const session = await terminalManager.createSession(testUuid);
      
      return new Promise<void>((resolve, reject) => {
        let outputReceived = false;
        
        // Listen for output
        terminalManager.onData(session.id, (data) => {
          outputReceived = true;
          expect(typeof data).toBe('string');
        });
        
        // Send input
        terminalManager.sendInput(session.id, 'echo "test"\n');
        
        // Wait for output
        setTimeout(() => {
          if (outputReceived) {
            resolve();
          } else {
            reject(new Error('No output received within timeout'));
          }
        }, 2000);
      });
    });

    test('should handle terminal resize', async () => {
      const session = await terminalManager.createSession(testUuid);
      
      // Resize terminal
      terminalManager.resizeTerminal(session.id, 120, 40);
      
      // Should not throw and session should still be active
      const retrieved = terminalManager.getSession(session.id);
      expect(retrieved?.isActive).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid terminal ID gracefully', () => {
      const invalidId = 'invalid-terminal-id';
      
      expect(terminalManager.getSession(invalidId)).toBeUndefined();
      expect(terminalManager.terminateSession(invalidId)).toBe(false);
      expect(() => terminalManager.sendInput(invalidId, 'test')).not.toThrow();
      expect(() => terminalManager.resizeTerminal(invalidId, 80, 24)).not.toThrow();
    });

    test('should handle working directory that does not exist', async () => {
      const nonExistentPath = '/non/existent/path';
      
      // Should still create session but use default directory
      const session = await terminalManager.createSession(testUuid, {
        workingDirectory: nonExistentPath
      });
      
      expect(session).toBeDefined();
      expect(session.isActive).toBe(true);
    });
  });
});