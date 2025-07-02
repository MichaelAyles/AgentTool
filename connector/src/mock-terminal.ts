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
    
    // Create interactive shell process
    const shellArgs = platform() === 'win32' ? [] : ['-i'];
    this.process = spawn(shell, shellArgs, {
      cwd: options.cwd,
      env: { ...options.env, PS1: '$ ' },
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

    // Send initial prompt after shell starts
    setTimeout(() => {
      this.sendPrompt();
    }, 500);
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
      // Enter key - execute command and send newline
      this.process.stdin?.write('\n');
    } else if (data === '\u007f' || data === '\b') {
      // Backspace
      if (this.dataCallback) {
        this.dataCallback('\b \b');
      }
    } else if (data === '\u0003') {
      // Ctrl+C
      this.process.kill('SIGINT');
    } else if (data === '\u0004') {
      // Ctrl+D (EOF)
      this.process.stdin?.end();
    } else {
      // Regular input - echo back and send to process
      if (this.dataCallback) {
        this.dataCallback(data);
      }
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
    const platform = process.platform;
    const cwd = process.cwd();
    const user = process.env.USER || process.env.USERNAME || 'user';
    const hostname = process.env.HOSTNAME || 'localhost';
    
    let prompt = '';
    
    if (platform === 'win32') {
      prompt = `${cwd}> `;
    } else {
      prompt = `${user}@${hostname}:${cwd}$ `;
    }
    
    if (this.dataCallback) {
      this.dataCallback(prompt);
    }
  }
}

// Export mock spawn function
export function mockSpawn(shell: string, args: string[], options: any): MockPty {
  return new MockPtyProcess(shell, args, options);
}