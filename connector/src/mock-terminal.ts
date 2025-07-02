import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import { platform } from 'os';

// Mock PTY interface to replace node-pty temporarily
export interface MockPty {
  onData(callback: (data: string) => void): void;
  onExit(callback: (exitCode: number, signal?: number) => void): void;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
}

export class MockPtyProcess extends EventEmitter implements MockPty {
  private process: ChildProcess;
  private dataCallback?: (data: string) => void;
  private exitCallback?: (exitCode: number, signal?: number) => void;

  constructor(shell: string, args: string[], options: any) {
    super();
    
    // Create interactive shell process with proper environment
    const isWindows = platform() === 'win32';
    const shellArgs = isWindows ? [] : ['-i', '-l'];
    
    this.process = spawn(shell, shellArgs, {
      cwd: options.cwd,
      env: { 
        ...options.env, 
        PS1: '\\u@\\h:\\w$ ',
        TERM: 'xterm-256color',
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        USER: process.env.USER,
        SHELL: shell
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Handle stdout data
    this.process.stdout?.on('data', (data: Buffer) => {
      const output = this.formatOutput(data.toString());
      if (this.dataCallback) {
        this.dataCallback(output);
      }
    });

    // Handle stderr data
    this.process.stderr?.on('data', (data: Buffer) => {
      const output = this.formatOutput(data.toString(), true);
      if (this.dataCallback) {
        this.dataCallback(output);
      }
    });

    // Handle process exit
    this.process.on('exit', (code, signal) => {
      if (this.exitCallback) {
        this.exitCallback(code || 0, signal ? 0 : undefined);
      }
    });

    // Handle process error
    this.process.on('error', (error) => {
      console.error('Process error:', error);
      if (this.dataCallback) {
        this.dataCallback(`\r\n❌ Process error: ${error.message}\r\n`);
      }
    });

    // Wait for shell to be ready, then send initial setup
    setTimeout(() => {
      // Send a simple command to initialize the shell
      this.process.stdin?.write('echo "Terminal ready"\n');
    }, 1000);
  }

  onData(callback: (data: string) => void): void {
    this.dataCallback = callback;
  }

  onExit(callback: (exitCode: number, signal?: number) => void): void {
    this.exitCallback = callback;
  }

  write(data: string): void {
    // Handle special terminal commands
    if (data === '\r' || data === '\n') {
      // Enter key - send newline to process
      this.process.stdin?.write('\n');
    } else if (data === '\u007f' || data === '\b') {
      // Backspace - send to process for proper handling
      this.process.stdin?.write('\b');
    } else if (data === '\u0003') {
      // Ctrl+C
      this.process.kill('SIGINT');
    } else if (data === '\u0004') {
      // Ctrl+D (EOF)
      this.process.stdin?.end();
    } else if (data === '\u001b') {
      // Escape sequences - pass through
      this.process.stdin?.write(data);
    } else {
      // Regular input - send directly to process
      this.process.stdin?.write(data);
    }
  }

  resize(cols: number, rows: number): void {
    // Mock resize - in real implementation this would resize PTY
    console.log(`Terminal resized to ${cols}x${rows}`);
  }

  kill(signal: string = 'SIGTERM'): void {
    this.process.kill(signal as NodeJS.Signals);
  }

  private formatOutput(data: string, isError: boolean = false): string {
    // Convert newlines to carriage return + newline for terminal
    let formatted = data.replace(/\n/g, '\r\n');
    
    // Add color for errors
    if (isError) {
      formatted = `\x1b[31m${formatted}\x1b[0m`; // Red text
    }
    
    return formatted;
  }

  private sendPrompt(): void {
    // Let the shell handle its own prompt
    // This method is kept for compatibility but doesn't send manual prompts
  }
}

// Export mock spawn function
export function mockSpawn(shell: string, args: string[], options: any): MockPty {
  return new MockPtyProcess(shell, args, options);
}