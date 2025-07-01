import { Server, Socket } from 'socket.io';
import { AdapterRegistry } from '@vibecode/adapter-sdk';
import type { ProcessManager } from '../processes/index.js';
import { TerminalHandler } from './terminal-handler.js';

interface Services {
  adapterRegistry: AdapterRegistry;
  processManager: ProcessManager;
}

export function setupWebSocket(io: Server, services: Services): void {
  const terminalHandler = new TerminalHandler(io, services.adapterRegistry);

  io.on('connection', (socket: Socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Authentication middleware
    socket.use((packet, next) => {
      // TODO: Implement proper authentication
      // For now, just set a default user
      socket.data.user = { id: 'default-user', username: 'user' };
      next();
    });

    // Handle terminal events
    terminalHandler.handleConnection(socket);

    // Legacy command execution (keeping for compatibility)
    socket.on('execute-command', async (data) => {
      try {
        const { command, adapter: adapterName, workingDirectory } = data;
        const adapter = services.adapterRegistry.get(adapterName);
        
        if (!adapter) {
          socket.emit('error', { message: `Adapter ${adapterName} not found` });
          return;
        }

        const handle = await adapter.execute(command, { workingDirectory });
        
        // Stream output
        for await (const chunk of adapter.streamOutput(handle)) {
          socket.emit('output', {
            sessionId: data.sessionId,
            chunk,
          });
        }
      } catch (error) {
        socket.emit('error', { message: error instanceof Error ? error.message : 'Unknown error' });
      }
    });

    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
    });
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('Shutting down WebSocket server...');
    terminalHandler.cleanup();
    io.close();
  });
}