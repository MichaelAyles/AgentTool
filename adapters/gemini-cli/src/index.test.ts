import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiCLIAdapter } from './index';
import type { ExecuteOptions } from '@vibecode/shared';

// Mock node-pty
vi.mock('node-pty', () => ({
  spawn: vi.fn(),
}));

describe('GeminiCLIAdapter', () => {
  let adapter: GeminiCLIAdapter;
  let mockPtyProcess: any;

  beforeEach(() => {
    adapter = new GeminiCLIAdapter();
    mockPtyProcess = {
      pid: 12345,
      onData: vi.fn(),
      onExit: vi.fn(),
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
    };

    vi.clearAllMocks();
  });

  describe('Basic Properties', () => {
    it('should have correct adapter properties', () => {
      expect(adapter.name).toBe('gemini-cli');
      expect(adapter.version).toBe('1.0.0');
      expect(adapter.description).toContain('Gemini CLI');
    });

    it('should have correct capabilities', () => {
      expect(adapter.capabilities.supportsStreaming).toBe(true);
      expect(adapter.capabilities.supportsMCP).toBe(false);
      expect(adapter.capabilities.supportsInteractiveMode).toBe(true);
      expect(adapter.capabilities.supportsFileOperations).toBe(true);
      expect(adapter.capabilities.supportsProjectContext).toBe(true);
    });
  });

  describe('Installation Check', () => {
    it('should check if Gemini CLI is installed', async () => {
      const { spawn } = await import('node-pty');
      (spawn as any).mockReturnValue({
        ...mockPtyProcess,
        onData: vi.fn((callback) => {
          callback('gemini version 1.0.0');
        }),
        onExit: vi.fn((callback) => {
          callback(0);
        }),
      });

      const isInstalled = await adapter.isInstalled();
      expect(isInstalled).toBe(true);
      expect(spawn).toHaveBeenCalledWith('gemini', ['--version'], expect.any(Object));
    });

    it('should return false if Gemini CLI is not installed', async () => {
      const { spawn } = await import('node-pty');
      (spawn as any).mockReturnValue({
        ...mockPtyProcess,
        onData: vi.fn((callback) => {
          callback('command not found');
        }),
        onExit: vi.fn((callback) => {
          callback(1);
        }),
      });

      const isInstalled = await adapter.isInstalled();
      expect(isInstalled).toBe(false);
    });

    it('should handle timeout during installation check', async () => {
      const { spawn } = await import('node-pty');
      (spawn as any).mockReturnValue({
        ...mockPtyProcess,
        onData: vi.fn(),
        onExit: vi.fn(),
        kill: vi.fn(),
      });

      // Mock setTimeout to immediately call the timeout callback
      vi.useFakeTimers();
      const promise = adapter.isInstalled();
      vi.advanceTimersByTime(5000);
      
      const isInstalled = await promise;
      expect(isInstalled).toBe(false);
      
      vi.useRealTimers();
    });
  });

  describe('Command Preparation', () => {
    it('should prepare basic command correctly', async () => {
      const { spawn } = await import('node-pty');
      (spawn as any).mockReturnValue(mockPtyProcess);

      // Mock isInstalled to return true
      vi.spyOn(adapter, 'isInstalled').mockResolvedValue(true);

      await adapter.execute('Explain this code');

      expect(spawn).toHaveBeenCalledWith(
        'gemini',
        ['--stream', '--prompt', 'Explain this code'],
        expect.objectContaining({
          env: expect.objectContaining({
            GEMINI_STREAMING: 'true',
            GEMINI_FORMAT: 'markdown',
          }),
        })
      );
    });

    it('should handle file-based operations', async () => {
      const { spawn } = await import('node-pty');
      (spawn as any).mockReturnValue(mockPtyProcess);

      vi.spyOn(adapter, 'isInstalled').mockResolvedValue(true);

      const options: ExecuteOptions = {
        files: ['src/main.js', 'src/utils.js'],
      };

      await adapter.execute('Review these files', options);

      expect(spawn).toHaveBeenCalledWith(
        'gemini',
        ['--files', 'src/main.js', 'src/utils.js', '--stream', '--prompt', 'Review these files'],
        expect.any(Object)
      );
    });

    it('should handle project context', async () => {
      const { spawn } = await import('node-pty');
      (spawn as any).mockReturnValue(mockPtyProcess);

      vi.spyOn(adapter, 'isInstalled').mockResolvedValue(true);

      const options: ExecuteOptions = {
        projectPath: '/path/to/project',
      };

      await adapter.execute('Analyze project', options);

      expect(spawn).toHaveBeenCalledWith(
        'gemini',
        ['--project', '/path/to/project', '--stream', '--prompt', 'Analyze project'],
        expect.any(Object)
      );
    });

    it('should handle gemini-prefixed commands', async () => {
      const { spawn } = await import('node-pty');
      (spawn as any).mockReturnValue(mockPtyProcess);

      vi.spyOn(adapter, 'isInstalled').mockResolvedValue(true);

      await adapter.execute('gemini --model gemini-pro "test prompt"');

      expect(spawn).toHaveBeenCalledWith(
        'gemini',
        ['--model', 'gemini-pro', '"test', 'prompt"', '--stream'],
        expect.any(Object)
      );
    });
  });

  describe('Process Execution', () => {
    it('should throw error if Gemini CLI is not installed', async () => {
      vi.spyOn(adapter, 'isInstalled').mockResolvedValue(false);

      await expect(adapter.execute('test command')).rejects.toThrow(
        'Gemini CLI is not installed or not available in PATH'
      );
    });

    it('should create process handle with correct timeout', async () => {
      const { spawn } = await import('node-pty');
      (spawn as any).mockReturnValue(mockPtyProcess);

      vi.spyOn(adapter, 'isInstalled').mockResolvedValue(true);

      const options: ExecuteOptions = {
        timeout: 120000,
      };

      const handle = await adapter.execute('test command', options);
      expect(handle).toBeDefined();
      expect(handle.pid).toBe(12345);
    });

    it('should use default working directory', async () => {
      const { spawn } = await import('node-pty');
      (spawn as any).mockReturnValue(mockPtyProcess);

      vi.spyOn(adapter, 'isInstalled').mockResolvedValue(true);

      await adapter.execute('test command');

      expect(spawn).toHaveBeenCalledWith(
        'gemini',
        expect.any(Array),
        expect.objectContaining({
          cwd: process.cwd(),
        })
      );
    });

    it('should use custom working directory', async () => {
      const { spawn } = await import('node-pty');
      (spawn as any).mockReturnValue(mockPtyProcess);

      vi.spyOn(adapter, 'isInstalled').mockResolvedValue(true);

      const options: ExecuteOptions = {
        workingDirectory: '/custom/path',
      };

      await adapter.execute('test command', options);

      expect(spawn).toHaveBeenCalledWith(
        'gemini',
        expect.any(Array),
        expect.objectContaining({
          cwd: '/custom/path',
        })
      );
    });
  });

  describe('Configuration Validation', () => {
    it('should validate configuration successfully', async () => {
      vi.spyOn(adapter, 'isInstalled').mockResolvedValue(true);
      
      const { spawn } = await import('node-pty');
      (spawn as any).mockReturnValue({
        ...mockPtyProcess,
        onData: vi.fn((callback) => {
          callback('usage: gemini [options]');
        }),
        onExit: vi.fn((callback) => {
          callback(0);
        }),
      });

      // Mock environment variables
      process.env.GOOGLE_CLOUD_PROJECT = 'test-project';

      const result = await adapter.validateConfiguration();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);

      delete process.env.GOOGLE_CLOUD_PROJECT;
    });

    it('should report validation errors', async () => {
      vi.spyOn(adapter, 'isInstalled').mockResolvedValue(false);

      const result = await adapter.validateConfiguration();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Gemini CLI is not installed or not available in PATH');
    });

    it('should report missing credentials', async () => {
      vi.spyOn(adapter, 'isInstalled').mockResolvedValue(true);
      
      const { spawn } = await import('node-pty');
      (spawn as any).mockReturnValue({
        ...mockPtyProcess,
        onData: vi.fn((callback) => {
          callback('usage: gemini [options]');
        }),
        onExit: vi.fn((callback) => {
          callback(0);
        }),
      });

      // Ensure no credentials are set
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
      delete process.env.GOOGLE_CLOUD_PROJECT;

      const result = await adapter.validateConfiguration();
      expect(result.valid).toBe(false);
      expect(result.errors.some(error => 
        error.includes('Google Cloud credentials not configured')
      )).toBe(true);
    });
  });

  describe('Help Documentation', () => {
    it('should provide comprehensive help text', async () => {
      const help = await adapter.getHelp();
      
      expect(help).toContain('Gemini CLI Adapter');
      expect(help).toContain('Available Commands');
      expect(help).toContain('Examples');
      expect(help).toContain('Requirements');
      expect(help).toContain('Configuration');
    });
  });
});