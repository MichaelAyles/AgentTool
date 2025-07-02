import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';

// Dynamic import for node-pty with fallback
async function getPtySpawn() {
  try {
    const pty = await import('node-pty');
    return pty.spawn;
  } catch (error) {
    logger.warn('node-pty not available, using mock terminal');
    // Mock implementation for when node-pty is not available
    return () => ({
      onData: (callback: (data: string) => void) => {
        // Send a welcome message
        setTimeout(
          () => callback('Welcome to Vibe Code Terminal (mock mode)\r\n$ '),
          100
        );
      },
      onExit: (callback: (code: number, signal: number) => void) => {},
      write: (data: string) => {
        // Echo back for mock mode
        setTimeout(() => {
          if (this.onDataCallback) {
            this.onDataCallback(data);
          }
        }, 10);
      },
      resize: () => {},
      kill: () => {},
      onDataCallback: null as ((data: string) => void) | null,
    });
  }
}

export interface Terminal {
  id: string;
  socketId: string;
  pty: any;
  cwd: string;
  cols: number;
  rows: number;
  createdAt: Date;
}

export interface CreateTerminalOptions {
  cwd?: string;
  cols?: number;
  rows?: number;
  shell?: string;
}

export class TerminalManager {
  private terminals: Map<string, Terminal> = new Map();
  private socketTerminals: Map<string, string[]> = new Map(); // socketId -> terminalIds
  private io: Server;

  constructor(io: Server) {
    this.io = io;
  }

  async createTerminal(
    socket: Socket,
    options: CreateTerminalOptions = {}
  ): Promise<string> {
    const terminalId = uuidv4();
    const cwd = options.cwd || process.cwd();
    const cols = options.cols || 80;
    const rows = options.rows || 24;
    const shell =
      options.shell ||
      (process.platform === 'win32' ? 'powershell.exe' : 'bash');

    try {
      const spawn = await getPtySpawn();
      const pty = spawn(shell, [], {
        name: 'xterm-color',
        cols,
        rows,
        cwd,
        env: process.env,
      });

      const terminal: Terminal = {
        id: terminalId,
        socketId: socket.id,
        pty,
        cwd,
        cols,
        rows,
        createdAt: new Date(),
      };

      this.terminals.set(terminalId, terminal);

      // Track terminals for this socket
      const socketTerminals = this.socketTerminals.get(socket.id) || [];
      socketTerminals.push(terminalId);
      this.socketTerminals.set(socket.id, socketTerminals);

      // Handle PTY output
      pty.onData((data: string) => {
        socket.emit('terminal:output', {
          terminalId,
          data,
        });
      });

      // Handle PTY exit
      pty.onExit((code: number, signal: number) => {
        logger.info(`Terminal ${terminalId} exited`, { code, signal });
        socket.emit('terminal:exit', {
          terminalId,
          code,
          signal,
        });
        this.removeTerminal(terminalId);
      });

      socket.emit('terminal:created', {
        terminalId,
        success: true,
      });

      logger.info(`Created terminal ${terminalId}`, {
        socketId: socket.id,
        cwd,
        shell,
      });

      return terminalId;
    } catch (error) {
      logger.error(`Failed to create terminal:`, error);
      socket.emit('terminal:created', {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  handleInput(socketId: string, data: { terminalId: string; input: string }) {
    const terminal = this.terminals.get(data.terminalId);

    if (!terminal) {
      logger.warn(`Terminal not found: ${data.terminalId}`);
      return;
    }

    if (terminal.socketId !== socketId) {
      logger.warn(
        `Socket ${socketId} tried to access terminal ${data.terminalId} owned by ${terminal.socketId}`
      );
      return;
    }

    try {
      terminal.pty.write(data.input);
    } catch (error) {
      logger.error(`Failed to write to terminal ${data.terminalId}:`, error);
    }
  }

  resize(
    socketId: string,
    data: { terminalId: string; cols: number; rows: number }
  ) {
    const terminal = this.terminals.get(data.terminalId);

    if (!terminal) {
      logger.warn(`Terminal not found: ${data.terminalId}`);
      return;
    }

    if (terminal.socketId !== socketId) {
      logger.warn(
        `Socket ${socketId} tried to resize terminal ${data.terminalId} owned by ${terminal.socketId}`
      );
      return;
    }

    try {
      terminal.pty.resize(data.cols, data.rows);
      terminal.cols = data.cols;
      terminal.rows = data.rows;

      logger.debug(`Resized terminal ${data.terminalId}`, {
        cols: data.cols,
        rows: data.rows,
      });
    } catch (error) {
      logger.error(`Failed to resize terminal ${data.terminalId}:`, error);
    }
  }

  killTerminal(terminalId: string): boolean {
    const terminal = this.terminals.get(terminalId);

    if (!terminal) {
      return false;
    }

    try {
      terminal.pty.kill();
      this.removeTerminal(terminalId);

      logger.info(`Killed terminal ${terminalId}`);
      return true;
    } catch (error) {
      logger.error(`Failed to kill terminal ${terminalId}:`, error);
      return false;
    }
  }

  private removeTerminal(terminalId: string) {
    const terminal = this.terminals.get(terminalId);

    if (terminal) {
      // Remove from socket tracking
      const socketTerminals = this.socketTerminals.get(terminal.socketId) || [];
      const index = socketTerminals.indexOf(terminalId);
      if (index > -1) {
        socketTerminals.splice(index, 1);
        if (socketTerminals.length === 0) {
          this.socketTerminals.delete(terminal.socketId);
        } else {
          this.socketTerminals.set(terminal.socketId, socketTerminals);
        }
      }

      this.terminals.delete(terminalId);
    }
  }

  cleanup(socketId: string) {
    const terminalIds = this.socketTerminals.get(socketId) || [];

    for (const terminalId of terminalIds) {
      this.killTerminal(terminalId);
    }

    this.socketTerminals.delete(socketId);

    if (terminalIds.length > 0) {
      logger.info(
        `Cleaned up ${terminalIds.length} terminals for socket ${socketId}`
      );
    }
  }

  getTerminalCount(): number {
    return this.terminals.size;
  }

  getTerminalsForSocket(socketId: string): string[] {
    return this.socketTerminals.get(socketId) || [];
  }
}
