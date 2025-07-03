import { EventEmitter } from 'events';
import { platform } from 'os';
import { MockPty, mockSpawn } from './mock-terminal';

export interface TerminalSession {
  id: string;
  uuid: string;
  ptyProcess: MockPty;
  isActive: boolean;
  createdAt: Date;
  lastActivity: Date;
}

export class TerminalManager extends EventEmitter {
  private sessions: Map<string, TerminalSession> = new Map();

  createSession(uuid: string): TerminalSession {
    // Determine the shell based on platform
    const shell = this.getDefaultShell();
    const args = this.getDefaultArgs();

    // Create mock PTY process (replace with real PTY when node-pty is working)
    const ptyProcess = mockSpawn(shell, args, {
      name: 'xterm-color',
      cols: 80,
      rows: 24,
      cwd: process.env.HOME || process.env.USERPROFILE || process.cwd(),
      env: { ...process.env, TERM: 'xterm-256color' }
    });

    const session: TerminalSession = {
      id: `terminal_${Date.now()}`,
      uuid,
      ptyProcess,
      isActive: true,
      createdAt: new Date(),
      lastActivity: new Date()
    };

    // Handle PTY data output
    ptyProcess.onData((data: string) => {
      session.lastActivity = new Date();
      this.emit('data', uuid, data);
    });

    // Handle PTY exit
    ptyProcess.onExit((exitCode: number, signal?: number) => {
      console.log(`Terminal session ${uuid} exited with code ${exitCode}`);
      session.isActive = false;
      this.emit('exit', uuid, exitCode, signal);
    });

    this.sessions.set(uuid, session);
    
    // Send initial prompt
    setTimeout(() => {
      this.emit('data', uuid, `\r\n🦆 DuckBridge Terminal Connected\r\n`);
      this.emit('data', uuid, `Session ID: ${uuid.substring(0, 8)}...\r\n`);
      this.emit('data', uuid, `Platform: ${platform()}\r\n\r\n`);
    }, 100);

    return session;
  }

  writeToSession(uuid: string, data: string): boolean {
    const session = this.sessions.get(uuid);
    if (!session || !session.isActive) {
      return false;
    }

    session.lastActivity = new Date();
    session.ptyProcess.write(data);
    return true;
  }

  resizeSession(uuid: string, cols: number, rows: number): boolean {
    const session = this.sessions.get(uuid);
    if (!session || !session.isActive) {
      return false;
    }

    session.ptyProcess.resize(cols, rows);
    return true;
  }

  terminateSession(uuid: string): boolean {
    const session = this.sessions.get(uuid);
    if (!session) {
      return false;
    }

    if (session.isActive) {
      session.ptyProcess.kill();
      session.isActive = false;
    }

    this.sessions.delete(uuid);
    return true;
  }

  getSession(uuid: string): TerminalSession | undefined {
    return this.sessions.get(uuid);
  }

  getAllSessions(): TerminalSession[] {
    return Array.from(this.sessions.values());
  }

  getActiveSessions(): TerminalSession[] {
    return Array.from(this.sessions.values()).filter(session => session.isActive);
  }

  cleanupInactiveSessions(): void {
    const now = new Date();
    const maxIdleTime = 30 * 60 * 1000; // 30 minutes

    for (const [uuid, session] of this.sessions.entries()) {
      const idleTime = now.getTime() - session.lastActivity.getTime();
      
      if (idleTime > maxIdleTime && session.isActive) {
        console.log(`Cleaning up idle terminal session: ${uuid}`);
        this.terminateSession(uuid);
      }
    }
  }

  private getDefaultShell(): string {
    const platform = process.platform;
    
    if (platform === 'win32') {
      // Windows
      return process.env.COMSPEC || 'cmd.exe';
    } else {
      // Unix-like systems (macOS, Linux, WSL)
      return process.env.SHELL || '/bin/bash';
    }
  }

  private getDefaultArgs(): string[] {
    const platform = process.platform;
    
    if (platform === 'win32') {
      return [];
    } else {
      // For Unix-like systems, use login shell
      return ['--login'];
    }
  }

  destroy(): void {
    // Clean up all sessions
    for (const uuid of this.sessions.keys()) {
      this.terminateSession(uuid);
    }
    
    this.removeAllListeners();
  }
}