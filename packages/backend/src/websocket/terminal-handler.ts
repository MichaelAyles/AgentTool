import { Server, Socket } from 'socket.io';
import { PTYManager } from '../processes/pty-manager.js';
import { AdapterRegistry } from '@vibecode/adapter-sdk';
import { db } from '../database/index.js';
import { generateId } from '@vibecode/shared';

interface TerminalSession {
  id: string;
  projectId: string;
  adapter: string;
  ptyId?: string;
  userId: string;
}

export class TerminalHandler {
  private sessions = new Map<string, TerminalSession>();
  private ptyManager = new PTYManager();

  constructor(
    private io: Server,
    private adapterRegistry: AdapterRegistry
  ) {
    this.setupPTYEvents();
  }

  private setupPTYEvents(): void {
    this.ptyManager.on('data', (ptyId: string, data: string) => {
      // Find session by PTY ID and emit to connected clients
      for (const [sessionId, session] of this.sessions) {
        if (session.ptyId === ptyId) {
          this.io.to(`session:${sessionId}`).emit('terminal:data', {
            sessionId,
            data,
            timestamp: new Date().toISOString(),
          });
          break;
        }
      }
    });

    this.ptyManager.on('exit', (ptyId: string, exitCode: number) => {
      // Find session and notify clients
      for (const [sessionId, session] of this.sessions) {
        if (session.ptyId === ptyId) {
          this.io.to(`session:${sessionId}`).emit('terminal:exit', {
            sessionId,
            exitCode,
            timestamp: new Date().toISOString(),
          });
          
          // Update session in database
          db.updateSessionState(sessionId, 'stopped');
          this.sessions.delete(sessionId);
          break;
        }
      }
    });
  }

  handleConnection(socket: Socket): void {
    // Create terminal session
    socket.on('terminal:create', async (data) => {
      try {
        const { projectId, adapter, cols = 80, rows = 24 } = data;
        const userId = socket.data.user?.id || 'anonymous';

        // Create session
        const sessionId = generateId();
        const session: TerminalSession = {
          id: sessionId,
          projectId,
          adapter,
          userId,
        };

        // Get adapter
        const adapterInstance = this.adapterRegistry.get(adapter);
        if (!adapterInstance) {
          socket.emit('terminal:error', {
            sessionId,
            error: `Adapter ${adapter} not found`,
          });
          return;
        }

        // Create PTY session
        const ptySession = this.ptyManager.createPTY({
          command: 'claude-code', // Default, will be overridden by adapter
          args: [],
          cols,
          rows,
        });

        session.ptyId = ptySession.id;
        this.sessions.set(sessionId, session);

        // Join socket to session room
        socket.join(`session:${sessionId}`);

        // Save to database
        db.createSession(
          {
            id: sessionId,
            projectId,
            adapter,
            state: 'running',
          },
          userId
        );

        socket.emit('terminal:created', {
          sessionId,
          ptyId: ptySession.id,
        });
      } catch (error) {
        socket.emit('terminal:error', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Handle terminal input
    socket.on('terminal:input', (data) => {
      const { sessionId, input } = data;
      const session = this.sessions.get(sessionId);
      
      if (session && session.ptyId) {
        this.ptyManager.write(session.ptyId, input);
        
        // Save command to database if it's a complete command (ends with \r)
        if (input.includes('\r')) {
          const cleanInput = input.replace(/\r\n?/g, '').trim();
          if (cleanInput) {
            db.createCommand({
              id: generateId(),
              sessionId,
              input: cleanInput,
              output: [],
            });
          }
        }
      }
    });

    // Handle terminal resize
    socket.on('terminal:resize', (data) => {
      const { sessionId, cols, rows } = data;
      const session = this.sessions.get(sessionId);
      
      if (session && session.ptyId) {
        this.ptyManager.resize(session.ptyId, cols, rows);
      }
    });

    // Execute command through adapter
    socket.on('terminal:execute', async (data) => {
      try {
        const { sessionId, command } = data;
        const session = this.sessions.get(sessionId);
        
        if (!session) {
          socket.emit('terminal:error', {
            sessionId,
            error: 'Session not found',
          });
          return;
        }

        const adapter = this.adapterRegistry.get(session.adapter);
        if (!adapter) {
          socket.emit('terminal:error', {
            sessionId,
            error: `Adapter ${session.adapter} not found`,
          });
          return;
        }

        // Execute through adapter
        const handle = await adapter.execute(command, {
          workingDirectory: process.cwd(), // TODO: Get from project
        });

        // Stream output
        for await (const chunk of adapter.streamOutput(handle)) {
          socket.emit('terminal:data', {
            sessionId,
            data: chunk.data,
            type: chunk.type,
            timestamp: chunk.timestamp.toISOString(),
          });
        }
      } catch (error) {
        socket.emit('terminal:error', {
          sessionId: data.sessionId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Join existing session
    socket.on('terminal:join', (data) => {
      const { sessionId } = data;
      const session = this.sessions.get(sessionId);
      
      if (session) {
        socket.join(`session:${sessionId}`);
        socket.emit('terminal:joined', { sessionId });
      } else {
        socket.emit('terminal:error', {
          sessionId,
          error: 'Session not found',
        });
      }
    });

    // Leave session
    socket.on('terminal:leave', (data) => {
      const { sessionId } = data;
      socket.leave(`session:${sessionId}`);
    });

    // Kill session
    socket.on('terminal:kill', (data) => {
      const { sessionId } = data;
      const session = this.sessions.get(sessionId);
      
      if (session && session.ptyId) {
        this.ptyManager.kill(session.ptyId);
        this.sessions.delete(sessionId);
        
        // Update database
        db.updateSessionState(sessionId, 'stopped');
        
        // Notify all clients in the session
        this.io.to(`session:${sessionId}`).emit('terminal:killed', {
          sessionId,
        });
      }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      // Clean up any sessions owned by this socket if needed
      // Note: We keep sessions alive even if the socket disconnects
      // so users can reconnect to existing sessions
    });
  }

  cleanup(): void {
    this.ptyManager.cleanup();
    this.sessions.clear();
  }
}