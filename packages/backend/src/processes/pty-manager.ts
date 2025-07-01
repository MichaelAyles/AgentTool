import { spawn, IPty } from 'node-pty';
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

export interface PTYSession {
  id: string;
  pty: IPty;
  startTime: Date;
  lastActivity: Date;
}

export class PTYManager extends EventEmitter {
  private sessions = new Map<string, PTYSession>();

  createPTY(options: PTYOptions): PTYSession {
    const id = options.id || generateId();
    
    const pty = spawn(options.command, options.args || [], {
      name: 'xterm-color',
      cols: options.cols || 80,
      rows: options.rows || 24,
      cwd: options.cwd || process.cwd(),
      env: {
        ...process.env,
        ...options.env,
        TERM: 'xterm-color',
        COLORTERM: 'truecolor',
      },
    });

    const session: PTYSession = {
      id,
      pty,
      startTime: new Date(),
      lastActivity: new Date(),
    };

    this.sessions.set(id, session);

    // Set up event handlers
    pty.onData((data) => {
      session.lastActivity = new Date();
      this.emit('data', id, data);
    });

    pty.onExit((exitCode) => {
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