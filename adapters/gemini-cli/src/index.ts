import { BaseAdapter } from '@vibecode/adapter-sdk';
import type {
  CLICapabilities,
  ExecuteOptions,
  ProcessHandle,
  StreamChunk,
  OutputChunk,
} from '@vibecode/shared';
import { EventEmitter } from 'events';
import { spawn as nodeSpawn } from 'child_process';

export class GeminiCLIAdapter extends BaseAdapter {
  name = 'gemini-cli';
  version = '1.0.0';
  description = 'Google Gemini CLI adapter for AI-powered coding assistance';

  capabilities: CLICapabilities = {
    supportsStreaming: true,
    supportsMCP: false, // Gemini CLI doesn't support MCP directly
    supportsSubagents: false,
    supportsInteractiveMode: true,
    supportsFileOperations: true,
    supportsProjectContext: true,
  };

  private isAvailable: boolean | null = null;

  async isInstalled(): Promise<boolean> {
    if (this.isAvailable !== null) {
      return this.isAvailable;
    }

    try {
      let process: any;
      try {
        // Try to use node-pty
        const nodePty = await import('node-pty');
        process = nodePty.spawn('gemini', ['--version'], {
          name: 'xterm-color',
          cols: 80,
          rows: 24,
        });
      } catch (error) {
        // Fallback to regular spawn
        process = nodeSpawn('gemini', ['--version'], {
          stdio: 'pipe',
        });
      }

      return new Promise(resolve => {
        let output = '';

        process.onData(data => {
          output += data;
        });

        process.onExit(exitCode => {
          this.isAvailable = exitCode === 0 && output.includes('gemini');
          resolve(this.isAvailable);
        });

        // Timeout after 5 seconds
        setTimeout(() => {
          process.kill();
          this.isAvailable = false;
          resolve(false);
        }, 5000);
      });
    } catch (error) {
      this.isAvailable = false;
      return false;
    }
  }

  async execute(
    command: string,
    options: ExecuteOptions = {}
  ): Promise<ProcessHandle> {
    if (!(await this.isInstalled())) {
      throw new Error('Gemini CLI is not installed or not available in PATH');
    }

    const {
      workingDirectory = process.cwd(),
      environment = {},
      timeout = 300000, // 5 minutes default timeout
    } = options;

    // Prepare Gemini CLI command
    const geminiArgs = this.prepareGeminiCommand(command, options);

    let ptyProcess: any;
    try {
      // Try to use node-pty for better terminal support
      const nodePty = await import('node-pty');
      ptyProcess = nodePty.spawn('gemini', geminiArgs, {
        name: 'xterm-color',
        cols: options.cols || 80,
        rows: options.rows || 24,
        cwd: workingDirectory,
        env: {
          ...process.env,
          ...environment,
          // Set Gemini-specific environment variables
          GEMINI_STREAMING: 'true',
          GEMINI_FORMAT: 'markdown',
        },
      });
    } catch (error) {
      // Fallback to regular child_process.spawn
      ptyProcess = nodeSpawn('gemini', geminiArgs, {
        cwd: workingDirectory,
        env: {
          ...process.env,
          ...environment,
          // Set Gemini-specific environment variables
          GEMINI_STREAMING: 'true',
          GEMINI_FORMAT: 'markdown',
        },
        stdio: 'pipe',
      });
    }

    const processHandle = new GeminiProcessHandle(ptyProcess, timeout);

    // Handle timeout
    if (timeout > 0) {
      setTimeout(() => {
        if (!processHandle.isCompleted()) {
          processHandle.kill('SIGTERM');
        }
      }, timeout);
    }

    return processHandle;
  }

  private prepareGeminiCommand(
    command: string,
    options: ExecuteOptions
  ): string[] {
    // Parse the command to determine if it's a direct prompt or a complex request
    const args: string[] = [];

    // Check if this is a file-based operation
    if (options.files && options.files.length > 0) {
      args.push('--files');
      args.push(...options.files);
    }

    // Add project context if available
    if (options.projectPath) {
      args.push('--project', options.projectPath);
    }

    // Enable streaming output
    args.push('--stream');

    // Add the main command/prompt
    if (command.startsWith('gemini ')) {
      // Remove 'gemini ' prefix if present
      args.push(
        ...command
          .slice(7)
          .split(' ')
          .filter(arg => arg.length > 0)
      );
    } else {
      // Treat as a direct prompt
      args.push('--prompt', command);
    }

    return args;
  }

  async *streamOutput(handle: ProcessHandle): AsyncIterable<OutputChunk> {
    if (!(handle instanceof GeminiProcessHandle)) {
      throw new Error('Invalid process handle for Gemini CLI adapter');
    }

    for await (const chunk of handle.streamOutput()) {
      yield {
        type: chunk.type,
        data: chunk.data,
        timestamp: chunk.timestamp,
        metadata: chunk.metadata,
      };
    }
  }

  async interrupt(handle: ProcessHandle): Promise<void> {
    if (handle instanceof GeminiProcessHandle) {
      handle.kill('SIGINT');
    }
  }

  async getHelp(): Promise<string> {
    return `
Gemini CLI Adapter

This adapter integrates with Google's Gemini CLI tool for AI-powered coding assistance.

Available Commands:
- Direct prompts: Any text will be sent as a prompt to Gemini
- File operations: Include --files flag to analyze specific files
- Project context: Use --project to provide project-wide context

Examples:
- "Explain this code"
- "gemini --files src/main.js --prompt 'Review this code for bugs'"
- "gemini --project . --prompt 'Generate unit tests for this project'"

Requirements:
- Gemini CLI must be installed and available in PATH
- Valid Google Cloud credentials must be configured
- Appropriate API quotas and permissions

Configuration:
Set these environment variables for optimal performance:
- GOOGLE_APPLICATION_CREDENTIALS: Path to service account key file
- GOOGLE_CLOUD_PROJECT: Your Google Cloud project ID
- GEMINI_MODEL: Model to use (default: gemini-pro)
`;
  }

  async validateConfiguration(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Check if Gemini CLI is installed
    if (!(await this.isInstalled())) {
      errors.push('Gemini CLI is not installed or not available in PATH');
    }

    // Check for required environment variables
    if (
      !process.env.GOOGLE_APPLICATION_CREDENTIALS &&
      !process.env.GOOGLE_CLOUD_PROJECT
    ) {
      errors.push(
        'Google Cloud credentials not configured. Set GOOGLE_APPLICATION_CREDENTIALS or ensure default credentials are available'
      );
    }

    // Test basic functionality
    try {
      let testProcess: any;
      try {
        // Try to use node-pty
        const nodePty = await import('node-pty');
        testProcess = nodePty.spawn('gemini', ['--help'], {
          name: 'xterm-color',
          cols: 80,
          rows: 24,
        });
      } catch (error) {
        // Fallback to regular spawn
        testProcess = nodeSpawn('gemini', ['--help'], {
          stdio: 'pipe',
        });
      }

      const helpAvailable = await new Promise<boolean>(resolve => {
        let hasOutput = false;

        testProcess.onData(data => {
          if (data.includes('usage') || data.includes('help')) {
            hasOutput = true;
          }
        });

        testProcess.onExit(() => {
          resolve(hasOutput);
        });

        setTimeout(() => {
          testProcess.kill();
          resolve(false);
        }, 3000);
      });

      if (!helpAvailable) {
        errors.push(
          'Gemini CLI help command failed - installation may be corrupted'
        );
      }
    } catch (error) {
      errors.push(`Failed to test Gemini CLI: ${error.message}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

class GeminiProcessHandle extends EventEmitter implements ProcessHandle {
  id: string;
  pid: number;
  adapter: string;
  startTime: Date;
  exitCode?: number;
  private completed = false;
  private outputBuffer: StreamChunk[] = [];
  private outputHandlers: ((chunk: StreamChunk) => void)[] = [];

  constructor(
    private ptyProcess: any,
    private timeoutMs: number
  ) {
    super();
    this.id = `gemini-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.pid = ptyProcess.pid;
    this.adapter = 'gemini-cli';
    this.startTime = new Date();
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.ptyProcess.onData((data: string) => {
      const chunk: StreamChunk = {
        type: 'stdout',
        data,
        timestamp: new Date(),
      };

      this.outputBuffer.push(chunk);
      this.outputHandlers.forEach(handler => handler(chunk));
      this.emit('data', chunk);
    });

    this.ptyProcess.onExit((exitCode: number) => {
      this.exitCode = exitCode;
      this.completed = true;
      this.emit('exit', exitCode);

      // Final chunk to indicate completion
      const finalChunk: StreamChunk = {
        type: 'system',
        data: `Process exited with code ${exitCode}`,
        timestamp: new Date(),
      };

      this.outputBuffer.push(finalChunk);
      this.outputHandlers.forEach(handler => handler(finalChunk));
    });
  }

  async *streamOutput(): AsyncIterable<StreamChunk> {
    // Yield any buffered output first
    for (const chunk of this.outputBuffer) {
      yield chunk;
    }

    // If process is already completed, return
    if (this.completed) {
      return;
    }

    // Set up real-time streaming
    let resolveNext: ((value: IteratorResult<StreamChunk>) => void) | null =
      null;
    const chunks: StreamChunk[] = [];

    const handler = (chunk: StreamChunk) => {
      if (resolveNext) {
        resolveNext({ value: chunk, done: false });
        resolveNext = null;
      } else {
        chunks.push(chunk);
      }
    };

    this.outputHandlers.push(handler);

    try {
      while (!this.completed) {
        if (chunks.length > 0) {
          yield chunks.shift()!;
        } else {
          // Wait for next chunk
          await new Promise<void>(resolve => {
            if (this.completed) {
              resolve();
              return;
            }

            resolveNext = result => {
              if (!result.done) {
                resolve();
              }
            };
          });
        }
      }

      // Yield any remaining chunks
      while (chunks.length > 0) {
        yield chunks.shift()!;
      }
    } finally {
      // Clean up handler
      const index = this.outputHandlers.indexOf(handler);
      if (index !== -1) {
        this.outputHandlers.splice(index, 1);
      }
    }
  }

  write(data: string): void {
    if (!this.completed && this.ptyProcess) {
      this.ptyProcess.write(data);
    }
  }

  resize(cols: number, rows: number): void {
    if (!this.completed && this.ptyProcess) {
      this.ptyProcess.resize(cols, rows);
    }
  }

  kill(signal: string = 'SIGTERM'): void {
    if (!this.completed && this.ptyProcess) {
      this.ptyProcess.kill(signal);

      // Force completion after a delay if process doesn't exit gracefully
      setTimeout(() => {
        if (!this.completed) {
          this.ptyProcess.kill('SIGKILL');
          this.completed = true;
          this.exitCode = -1;
          this.emit('exit', -1);
        }
      }, 5000);
    }
  }

  isCompleted(): boolean {
    return this.completed;
  }

  getOutput(): StreamChunk[] {
    return [...this.outputBuffer];
  }
}
