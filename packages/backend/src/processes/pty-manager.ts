// import { spawn, IPty } from '@replit/node-pty';
import { EventEmitter } from 'events';
import { generateId } from '@vibecode/shared';

export interface PTYOptions {
  id?: string;
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
}

// Temporary mock PTY interface until we fix node-pty compilation
interface MockPty {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
  onData(callback: (data: string) => void): void;
  onExit(callback: (exitCode: any) => void): void;
}

export interface PTYSession {
  id: string;
  pty: MockPty;
  startTime: Date;
  lastActivity: Date;
}

export class PTYManager extends EventEmitter {
  private sessions = new Map<string, PTYSession>();

  createPTY(options: PTYOptions): PTYSession {
    const id = options.id || generateId();

    // Mock PTY implementation - replace with real node-pty later
    const pty: MockPty = {
      write: (data: string) => {
        console.log('PTY Write:', data);
      },
      resize: (cols: number, rows: number) => {
        console.log('PTY Resize:', cols, rows);
      },
      kill: (signal?: string) => {
        console.log('PTY Kill:', signal);
        setTimeout(() => this.emit('exit', id, 0), 100);
      },
      onData: (callback: (data: string) => void) => {
        // Mock data events
        setTimeout(() => callback(`Mock output for ${options.command}\n`), 100);
      },
      onExit: (callback: (exitCode: any) => void) => {
        // Will be called by kill()
      },
    };

    const session: PTYSession = {
      id,
      pty,
      startTime: new Date(),
      lastActivity: new Date(),
    };

    this.sessions.set(id, session);

    // Set up event handlers
    pty.onData(data => {
      session.lastActivity = new Date();
      this.emit('data', id, data);
    });

    pty.onExit(exitCode => {
      this.emit('exit', id, exitCode);
      this.sessions.delete(id);
    });

    this.emit('created', session);
    return session;
  }

  getSession(id: string): PTYSession | undefined {
    return this.sessions.get(id);
  }

  write(id: string, data: string): boolean {
    const session = this.sessions.get(id);
    if (session) {
      session.lastActivity = new Date();
      session.pty.write(data);
      return true;
    }
    return false;
  }

  resize(id: string, cols: number, rows: number): boolean {
    const session = this.sessions.get(id);
    if (session) {
      session.pty.resize(cols, rows);
      return true;
    }
    return false;
  }

  kill(id: string, signal?: string): boolean {
    const session = this.sessions.get(id);
    if (session) {
      session.pty.kill(signal);
      this.sessions.delete(id);
      return true;
    }
    return false;
  }

  getAllSessions(): PTYSession[] {
    return Array.from(this.sessions.values());
  }

  cleanup(): void {
    for (const [id, session] of this.sessions) {
      session.pty.kill();
      this.sessions.delete(id);
    }
  }
}
