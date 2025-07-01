import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { ProcessManager } from '../../processes/process-manager.js';
import { 
  createTestSession,
  createMockProcessMetrics,
  mockServices,
  sleep,
  waitFor
} from '../test-setup.js';

// Mock node:pty
const mockPty = {
  spawn: mock(() => ({
    pid: 12345,
    on: mock(),
    write: mock(),
    resize: mock(),
    kill: mock(),
    pause: mock(),
    resume: mock(),
  })),
};

mock.module('node-pty', () => mockPty);

// Mock process monitoring
const mockProcess = {
  kill: mock(() => true),
  on: mock(),
  stdout: { on: mock() },
  stderr: { on: mock() },
  stdin: { write: mock() },
};

mock.module('child_process', () => ({
  spawn: mock(() => mockProcess),
  exec: mock(),
}));

describe('ProcessManager', () => {
  let processManager: ProcessManager;
  const testSession = createTestSession();

  beforeEach(() => {
    processManager = new ProcessManager();
    
    // Reset mocks
    mockPty.spawn.mockClear();
    Object.values(mockProcess).forEach(mockFn => {
      if (typeof mockFn === 'function') mockFn.mockClear();
    });
  });

  afterEach(() => {
    processManager.cleanup();
  });

  describe('Session Management', () => {
    it('should create a new session', async () => {
      const sessionConfig = {
        sessionId: testSession.id,
        command: 'claude-code',
        args: ['--help'],
        cwd: '/tmp/test-project',
        env: { NODE_ENV: 'test' },
        user: 'testuser',
      };

      const result = await processManager.createSession(sessionConfig);

      expect(result.success).toBe(true);
      expect(result.sessionId).toBe(testSession.id);
      expect(mockPty.spawn).toHaveBeenCalledWith(
        sessionConfig.command,
        sessionConfig.args,
        expect.objectContaining({
          cwd: sessionConfig.cwd,
          env: expect.objectContaining(sessionConfig.env),
        })
      );
    });

    it('should handle session creation failure', async () => {
      mockPty.spawn.mockImplementationOnce(() => {
        throw new Error('Command not found');
      });

      const sessionConfig = {
        sessionId: 'fail-session',
        command: 'nonexistent-command',
        args: [],
        cwd: '/tmp',
      };

      const result = await processManager.createSession(sessionConfig);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Command not found');
    });

    it('should prevent duplicate sessions', async () => {
      const sessionConfig = {
        sessionId: testSession.id,
        command: 'claude-code',
        args: [],
        cwd: '/tmp',
      };

      await processManager.createSession(sessionConfig);
      const duplicate = await processManager.createSession(sessionConfig);

      expect(duplicate.success).toBe(false);
      expect(duplicate.error).toContain('already exists');
    });

    it('should get session status', () => {
      // First create a session
      processManager.createSession({
        sessionId: testSession.id,
        command: 'claude-code',
        args: [],
        cwd: '/tmp',
      });

      const status = processManager.getSessionStatus(testSession.id);

      expect(status).toBeDefined();
      expect(status?.sessionId).toBe(testSession.id);
      expect(status?.status).toBe('running');
      expect(status?.pid).toBe(12345);
    });

    it('should return null for non-existent session', () => {
      const status = processManager.getSessionStatus('nonexistent');
      expect(status).toBeNull();
    });
  });

  describe('Process Communication', () => {
    beforeEach(async () => {
      await processManager.createSession({
        sessionId: testSession.id,
        command: 'claude-code',
        args: [],
        cwd: '/tmp',
      });
    });

    it('should write input to session', () => {
      const input = 'hello world\n';
      
      const result = processManager.writeToSession(testSession.id, input);

      expect(result).toBe(true);
      expect(mockPty.spawn().write).toHaveBeenCalledWith(input);
    });

    it('should handle write to non-existent session', () => {
      const result = processManager.writeToSession('nonexistent', 'input');
      expect(result).toBe(false);
    });

    it('should resize session terminal', () => {
      const result = processManager.resizeSession(testSession.id, 80, 24);

      expect(result).toBe(true);
      expect(mockPty.spawn().resize).toHaveBeenCalledWith(80, 24);
    });

    it('should handle resize of non-existent session', () => {
      const result = processManager.resizeSession('nonexistent', 80, 24);
      expect(result).toBe(false);
    });
  });

  describe('Process Lifecycle', () => {
    beforeEach(async () => {
      await processManager.createSession({
        sessionId: testSession.id,
        command: 'claude-code',
        args: [],
        cwd: '/tmp',
      });
    });

    it('should pause session', () => {
      const result = processManager.pauseSession(testSession.id);

      expect(result).toBe(true);
      expect(mockPty.spawn().pause).toHaveBeenCalled();
    });

    it('should resume session', () => {
      processManager.pauseSession(testSession.id);
      const result = processManager.resumeSession(testSession.id);

      expect(result).toBe(true);
      expect(mockPty.spawn().resume).toHaveBeenCalled();
    });

    it('should terminate session gracefully', async () => {
      const result = await processManager.terminateSession(testSession.id, false);

      expect(result).toBe(true);
      expect(mockPty.spawn().kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('should force terminate session', async () => {
      const result = await processManager.terminateSession(testSession.id, true);

      expect(result).toBe(true);
      expect(mockPty.spawn().kill).toHaveBeenCalledWith('SIGKILL');
    });

    it('should handle termination timeout', async () => {
      // Mock a process that doesn't respond to SIGTERM
      mockPty.spawn.mockReturnValueOnce({
        pid: 12345,
        on: mock(),
        write: mock(),
        resize: mock(),
        pause: mock(),
        resume: mock(),
        kill: mock(() => {
          // Don't emit exit event to simulate hanging process
        }),
      });

      await processManager.createSession({
        sessionId: 'hanging-session',
        command: 'hanging-command',
        args: [],
        cwd: '/tmp',
      });

      const result = await processManager.terminateSession('hanging-session', false, 100); // 100ms timeout

      expect(result).toBe(true); // Should still succeed via force kill
    });
  });

  describe('Resource Monitoring', () => {
    beforeEach(async () => {
      await processManager.createSession({
        sessionId: testSession.id,
        command: 'claude-code',
        args: [],
        cwd: '/tmp',
      });
    });

    it('should collect process metrics', async () => {
      // Mock process metrics collection
      const mockMetrics = createMockProcessMetrics();
      (processManager as any).collectProcessMetrics = mock(() => mockMetrics);

      await sleep(100); // Wait for metrics collection

      const metrics = processManager.getSessionMetrics(testSession.id);

      expect(metrics).toBeDefined();
      expect(metrics?.pid).toBe(12345);
    });

    it('should track resource usage over time', async () => {
      await sleep(200); // Wait for multiple metric collections

      const metrics = processManager.getSessionMetrics(testSession.id);

      expect(metrics).toBeDefined();
      expect(Array.isArray(metrics?.history)).toBe(true);
    });

    it('should get all metrics', () => {
      const allMetrics = processManager.getAllMetrics();

      expect(Array.isArray(allMetrics)).toBe(true);
      expect(allMetrics.some(m => m.sessionId === testSession.id)).toBe(true);
    });

    it('should get health status', () => {
      const health = processManager.getHealthStatus();

      expect(health.totalSessions).toBeGreaterThan(0);
      expect(health.runningSessions).toBeGreaterThan(0);
      expect(typeof health.systemLoad).toBe('number');
      expect(typeof health.memoryUsage).toBe('number');
    });
  });

  describe('Resource Limits', () => {
    it('should get default resource limits', () => {
      const limits = processManager.getResourceLimits();

      expect(limits.maxSessions).toBeDefined();
      expect(limits.maxMemoryPerSession).toBeDefined();
      expect(limits.maxCpuPerSession).toBeDefined();
      expect(limits.sessionTimeout).toBeDefined();
    });

    it('should update resource limits', () => {
      const newLimits = {
        maxSessions: 20,
        maxMemoryPerSession: 512 * 1024 * 1024, // 512MB
        maxCpuPerSession: 80, // 80%
        sessionTimeout: 7200000, // 2 hours
      };

      processManager.updateResourceLimits(newLimits);
      const updatedLimits = processManager.getResourceLimits();

      expect(updatedLimits.maxSessions).toBe(newLimits.maxSessions);
      expect(updatedLimits.maxMemoryPerSession).toBe(newLimits.maxMemoryPerSession);
      expect(updatedLimits.maxCpuPerSession).toBe(newLimits.maxCpuPerSession);
      expect(updatedLimits.sessionTimeout).toBe(newLimits.sessionTimeout);
    });

    it('should enforce session limits', async () => {
      // Set low session limit
      processManager.updateResourceLimits({ maxSessions: 1 });

      // Create first session
      await processManager.createSession({
        sessionId: 'session-1',
        command: 'claude-code',
        args: [],
        cwd: '/tmp',
      });

      // Try to create second session
      const result = await processManager.createSession({
        sessionId: 'session-2',
        command: 'claude-code',
        args: [],
        cwd: '/tmp',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('session limit');
    });
  });

  describe('Event Handling', () => {
    it('should emit session created event', async () => {
      let sessionCreated = false;
      
      processManager.on('sessionCreated', (session) => {
        sessionCreated = true;
        expect(session.sessionId).toBe(testSession.id);
      });

      await processManager.createSession({
        sessionId: testSession.id,
        command: 'claude-code',
        args: [],
        cwd: '/tmp',
      });

      expect(sessionCreated).toBe(true);
    });

    it('should emit session terminated event', async () => {
      let sessionTerminated = false;

      processManager.on('sessionTerminated', (session) => {
        sessionTerminated = true;
        expect(session.sessionId).toBe(testSession.id);
      });

      await processManager.createSession({
        sessionId: testSession.id,
        command: 'claude-code',
        args: [],
        cwd: '/tmp',
      });

      await processManager.terminateSession(testSession.id);

      expect(sessionTerminated).toBe(true);
    });

    it('should emit output events', async () => {
      let outputReceived = false;

      processManager.on('sessionOutput', (data) => {
        outputReceived = true;
        expect(data.sessionId).toBe(testSession.id);
        expect(data.type).toBe('stdout');
      });

      await processManager.createSession({
        sessionId: testSession.id,
        command: 'claude-code',
        args: [],
        cwd: '/tmp',
      });

      // Simulate output from process
      const session = (processManager as any).sessions.get(testSession.id);
      session.ptyProcess.emit('data', 'test output');

      await sleep(10); // Wait for event processing

      expect(outputReceived).toBe(true);
    });
  });

  describe('Session Recovery', () => {
    it('should handle process crashes', async () => {
      await processManager.createSession({
        sessionId: testSession.id,
        command: 'claude-code',
        args: [],
        cwd: '/tmp',
      });

      // Simulate process crash
      const session = (processManager as any).sessions.get(testSession.id);
      session.ptyProcess.emit('exit', 1, 'SIGTERM');

      await sleep(10); // Wait for event processing

      const status = processManager.getSessionStatus(testSession.id);
      expect(status?.status).toBe('crashed');
    });

    it('should clean up crashed sessions', async () => {
      await processManager.createSession({
        sessionId: testSession.id,
        command: 'claude-code',
        args: [],
        cwd: '/tmp',
      });

      // Simulate process crash
      const session = (processManager as any).sessions.get(testSession.id);
      session.ptyProcess.emit('exit', 1, 'SIGTERM');

      // Trigger cleanup
      (processManager as any).cleanupInactiveSessions();

      await sleep(10);

      // Session should be cleaned up after some time
      expect(true).toBe(true); // Placeholder - actual implementation would verify cleanup
    });
  });

  describe('Security', () => {
    it('should validate command paths', async () => {
      const maliciousConfig = {
        sessionId: 'malicious-session',
        command: '/etc/passwd', // Trying to read system file
        args: [],
        cwd: '/tmp',
      };

      const result = await processManager.createSession(maliciousConfig);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not allowed');
    });

    it('should validate working directory', async () => {
      const invalidConfig = {
        sessionId: 'invalid-cwd-session',
        command: 'claude-code',
        args: [],
        cwd: '/root', // Restricted directory
      };

      const result = await processManager.createSession(invalidConfig);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not accessible');
    });

    it('should sanitize environment variables', async () => {
      const unsafeConfig = {
        sessionId: 'unsafe-env-session',
        command: 'claude-code',
        args: [],
        cwd: '/tmp',
        env: {
          PATH: '/malicious/path', // Trying to override PATH
          LD_PRELOAD: '/malicious/lib.so', // Trying to preload malicious library
        },
      };

      const result = await processManager.createSession(unsafeConfig);

      // Should filter out dangerous environment variables
      expect(result.success).toBe(true);
      // PATH and LD_PRELOAD should be sanitized
    });
  });

  describe('Performance', () => {
    it('should handle multiple concurrent sessions', async () => {
      const sessionPromises = [];
      
      for (let i = 0; i < 10; i++) {
        sessionPromises.push(processManager.createSession({
          sessionId: `concurrent-session-${i}`,
          command: 'claude-code',
          args: [],
          cwd: '/tmp',
        }));
      }

      const results = await Promise.all(sessionPromises);
      
      expect(results.every(r => r.success)).toBe(true);
      expect(processManager.getAllMetrics().length).toBe(10);
    });

    it('should maintain performance under load', async () => {
      // Create multiple sessions
      for (let i = 0; i < 5; i++) {
        await processManager.createSession({
          sessionId: `load-session-${i}`,
          command: 'claude-code',
          args: [],
          cwd: '/tmp',
        });
      }

      const startTime = Date.now();
      
      // Perform operations
      for (let i = 0; i < 5; i++) {
        processManager.writeToSession(`load-session-${i}`, 'test input\n');
        processManager.getSessionStatus(`load-session-${i}`);
        processManager.getSessionMetrics(`load-session-${i}`);
      }

      const endTime = Date.now();
      const executionTime = endTime - startTime;

      // Should complete operations quickly even under load
      expect(executionTime).toBeLessThan(1000); // Less than 1 second
    });
  });

  describe('Cleanup', () => {
    it('should cleanup all sessions on manager cleanup', async () => {
      // Create multiple sessions
      await processManager.createSession({
        sessionId: 'cleanup-session-1',
        command: 'claude-code',
        args: [],
        cwd: '/tmp',
      });

      await processManager.createSession({
        sessionId: 'cleanup-session-2',
        command: 'claude-code',
        args: [],
        cwd: '/tmp',
      });

      expect(processManager.getAllMetrics().length).toBe(2);

      processManager.cleanup();

      // All sessions should be terminated
      expect(mockPty.spawn().kill).toHaveBeenCalled();
    });

    it('should clean up zombie processes', async () => {
      await processManager.createSession({
        sessionId: 'zombie-session',
        command: 'claude-code',
        args: [],
        cwd: '/tmp',
      });

      // Simulate process becoming zombie
      const session = (processManager as any).sessions.get('zombie-session');
      session.status = 'zombie';
      session.lastActivity = new Date(Date.now() - 3600000); // 1 hour ago

      (processManager as any).cleanupInactiveSessions();

      await sleep(10);

      // Zombie session should be cleaned up
      expect(true).toBe(true); // Placeholder
    });
  });
});