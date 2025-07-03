import { EventEmitter } from 'events';
import { platform } from 'os';
import { MockPty, mockSpawn } from './mock-terminal';

export interface TerminalSession {
  id: string;
  terminalId: string;
  uuid: string;
  ptyProcess: MockPty;
  isActive: boolean;
  createdAt: Date;
  lastActivity: Date;
  name?: string;
  color?: string;
}

export class TerminalManager extends EventEmitter {
  private sessions: Map<string, TerminalSession> = new Map();
  private sessionsByUuid: Map<string, Set<string>> = new Map();
  
  // Resource limits
  private readonly MAX_TERMINALS_PER_USER = 8;
  private readonly MAX_TOTAL_TERMINALS = 50;
  private readonly MAX_MEMORY_PER_TERMINAL = 100 * 1024 * 1024; // 100MB
  private readonly MAX_IDLE_TIME = 2 * 60 * 60 * 1000; // 2 hours

  createSession(uuid: string, terminalId?: string, name?: string, color?: string): TerminalSession {
    // Check resource limits first
    this.enforceResourceLimits(uuid);
    
    // Generate terminal ID if not provided
    if (!terminalId) {
      terminalId = `term_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    }

    const sessionKey = `${uuid}:${terminalId}`;
    
    // Check if terminal already exists
    if (this.sessions.has(sessionKey)) {
      throw new Error(`Terminal ${terminalId} already exists for session ${uuid}`);
    }

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
      terminalId,
      uuid,
      ptyProcess,
      isActive: true,
      createdAt: new Date(),
      lastActivity: new Date(),
      name: name || `Terminal ${terminalId.split('_')[1]?.substring(0, 4) || ''}`,
      color: color || 'blue'
    };

    // Handle PTY data output
    ptyProcess.onData((data: string) => {
      session.lastActivity = new Date();
      this.emit('data', uuid, terminalId, data);
    });

    // Handle PTY exit
    ptyProcess.onExit((exitCode: number, signal?: number) => {
      console.log(`Terminal session ${uuid}:${terminalId} exited with code ${exitCode}`);
      session.isActive = false;
      this.emit('exit', uuid, terminalId, exitCode, signal);
    });

    this.sessions.set(sessionKey, session);
    
    // Track session by UUID for easy lookup
    if (!this.sessionsByUuid.has(uuid)) {
      this.sessionsByUuid.set(uuid, new Set());
    }
    this.sessionsByUuid.get(uuid)!.add(terminalId);
    
    // Send initial prompt
    setTimeout(() => {
      this.emit('data', uuid, terminalId, `\r\n🦆 DuckBridge Terminal Connected\r\n`);
      this.emit('data', uuid, terminalId, `Terminal ID: ${terminalId}\r\n`);
      this.emit('data', uuid, terminalId, `Session ID: ${uuid.substring(0, 8)}...\r\n`);
      this.emit('data', uuid, terminalId, `Platform: ${platform()}\r\n\r\n`);
    }, 100);

    return session;
  }

  writeToSession(uuid: string, terminalId: string, data: string): boolean {
    const sessionKey = `${uuid}:${terminalId}`;
    const session = this.sessions.get(sessionKey);
    if (!session || !session.isActive) {
      return false;
    }

    session.lastActivity = new Date();
    session.ptyProcess.write(data);
    return true;
  }

  resizeSession(uuid: string, terminalId: string, cols: number, rows: number): boolean {
    const sessionKey = `${uuid}:${terminalId}`;
    const session = this.sessions.get(sessionKey);
    if (!session || !session.isActive) {
      return false;
    }

    session.ptyProcess.resize(cols, rows);
    return true;
  }

  terminateSession(uuid: string, terminalId?: string): boolean {
    if (terminalId) {
      // Terminate specific terminal
      const sessionKey = `${uuid}:${terminalId}`;
      const session = this.sessions.get(sessionKey);
      if (!session) {
        return false;
      }

      if (session.isActive) {
        session.ptyProcess.kill();
        session.isActive = false;
      }

      this.sessions.delete(sessionKey);
      
      // Remove from UUID tracking
      const terminalSet = this.sessionsByUuid.get(uuid);
      if (terminalSet) {
        terminalSet.delete(terminalId);
        if (terminalSet.size === 0) {
          this.sessionsByUuid.delete(uuid);
        }
      }
      
      return true;
    } else {
      // Terminate all terminals for UUID (legacy support)
      const terminalSet = this.sessionsByUuid.get(uuid);
      if (!terminalSet) {
        return false;
      }

      let terminated = false;
      for (const tid of terminalSet) {
        terminated = this.terminateSession(uuid, tid) || terminated;
      }
      
      return terminated;
    }
  }

  getSession(uuid: string, terminalId: string): TerminalSession | undefined {
    const sessionKey = `${uuid}:${terminalId}`;
    return this.sessions.get(sessionKey);
  }

  getSessionsByUuid(uuid: string): TerminalSession[] {
    const terminalSet = this.sessionsByUuid.get(uuid);
    if (!terminalSet) {
      return [];
    }

    const sessions: TerminalSession[] = [];
    for (const terminalId of terminalSet) {
      const sessionKey = `${uuid}:${terminalId}`;
      const session = this.sessions.get(sessionKey);
      if (session) {
        sessions.push(session);
      }
    }

    return sessions;
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

    for (const [sessionKey, session] of this.sessions.entries()) {
      const idleTime = now.getTime() - session.lastActivity.getTime();
      
      if (idleTime > maxIdleTime && session.isActive) {
        console.log(`Cleaning up idle terminal session: ${sessionKey}`);
        this.terminateSession(session.uuid, session.terminalId);
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

  private enforceResourceLimits(uuid: string): void {
    // Check total terminal limit
    if (this.sessions.size >= this.MAX_TOTAL_TERMINALS) {
      throw new Error(`Maximum total terminals reached (${this.MAX_TOTAL_TERMINALS}). Please close some terminals.`);
    }

    // Check per-user terminal limit
    const userTerminals = this.sessionsByUuid.get(uuid);
    if (userTerminals && userTerminals.size >= this.MAX_TERMINALS_PER_USER) {
      throw new Error(`Maximum terminals per user reached (${this.MAX_TERMINALS_PER_USER}). Please close some terminals first.`);
    }

    // Check system memory (simplified check)
    const memoryUsage = process.memoryUsage();
    const totalMemoryMB = memoryUsage.heapUsed / (1024 * 1024);
    const estimatedMaxMemory = this.MAX_MEMORY_PER_TERMINAL / (1024 * 1024) * this.MAX_TOTAL_TERMINALS;
    
    if (totalMemoryMB > estimatedMaxMemory * 0.8) { // 80% threshold
      console.warn(`High memory usage detected: ${totalMemoryMB.toFixed(2)}MB`);
      this.cleanupIdleSessionsAggressively();
    }
  }

  private cleanupIdleSessionsAggressively(): void {
    const now = new Date();
    const aggressiveIdleTime = 30 * 60 * 1000; // 30 minutes for aggressive cleanup

    for (const [sessionKey, session] of this.sessions.entries()) {
      const idleTime = now.getTime() - session.lastActivity.getTime();
      
      if (idleTime > aggressiveIdleTime && session.isActive) {
        console.log(`Aggressively cleaning up idle terminal session: ${sessionKey} (idle for ${Math.round(idleTime / 1000 / 60)} minutes)`);
        this.terminateSession(session.uuid, session.terminalId);
      }
    }
  }

  getResourceUsage(): {
    totalTerminals: number;
    activeTerminals: number;
    memoryUsage: NodeJS.MemoryUsage;
    limits: {
      maxTerminalsPerUser: number;
      maxTotalTerminals: number;
      maxMemoryPerTerminal: number;
      maxIdleTime: number;
    }
  } {
    return {
      totalTerminals: this.sessions.size,
      activeTerminals: this.getActiveSessions().length,
      memoryUsage: process.memoryUsage(),
      limits: {
        maxTerminalsPerUser: this.MAX_TERMINALS_PER_USER,
        maxTotalTerminals: this.MAX_TOTAL_TERMINALS,
        maxMemoryPerTerminal: this.MAX_MEMORY_PER_TERMINAL,
        maxIdleTime: this.MAX_IDLE_TIME
      }
    };
  }

  destroy(): void {
    // Clean up all sessions
    for (const session of this.sessions.values()) {
      this.terminateSession(session.uuid, session.terminalId);
    }
    
    this.sessions.clear();
    this.sessionsByUuid.clear();
    this.removeAllListeners();
  }
}