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

  // Set up process monitoring event forwarding
  setupProcessMonitoring(io, services.processManager);

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

    // Handle process monitoring requests
    setupProcessMonitoringHandlers(socket, services.processManager);

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

function setupProcessMonitoring(io: Server, processManager: ProcessManager): void {
  // Forward process manager events to all connected clients
  processManager.on('session-state', (sessionId: string, state: string) => {
    io.emit('process:session-state', { sessionId, state });
  });

  processManager.on('session-terminated', (sessionId: string) => {
    io.emit('process:session-terminated', { sessionId });
  });

  processManager.on('resource-limit-exceeded', (data: any) => {
    io.emit('process:resource-limit-exceeded', data);
  });

  processManager.on('session-warning', (data: any) => {
    io.emit('process:session-warning', data);
  });

  processManager.on('resource-limits-updated', (limits: any) => {
    io.emit('process:resource-limits-updated', limits);
  });

  // Periodic metrics broadcast
  setInterval(() => {
    const health = processManager.getHealthStatus();
    const metrics = processManager.getAllMetrics();
    
    io.emit('process:metrics-update', {
      health,
      metrics,
      timestamp: Date.now(),
    });
  }, 10000); // Every 10 seconds
}

function setupProcessMonitoringHandlers(socket: Socket, processManager: ProcessManager): void {
  // Subscribe to specific session metrics
  socket.on('process:subscribe-session', (data: { sessionId: string }) => {
    const { sessionId } = data;
    
    const sendSessionMetrics = () => {
      const metrics = processManager.getSessionMetrics(sessionId);
      if (metrics) {
        socket.emit('process:session-metrics', { sessionId, metrics });
      }
    };

    // Send initial metrics
    sendSessionMetrics();
    
    // Set up periodic updates for this session
    const interval = setInterval(sendSessionMetrics, 5000);
    
    // Clean up on disconnect or unsubscribe
    socket.on('disconnect', () => clearInterval(interval));
    socket.on('process:unsubscribe-session', (unsubData: { sessionId: string }) => {
      if (unsubData.sessionId === sessionId) {
        clearInterval(interval);
      }
    });
  });

  // Get current health status
  socket.on('process:get-health', () => {
    const health = processManager.getHealthStatus();
    socket.emit('process:health', health);
  });

  // Get current metrics
  socket.on('process:get-metrics', () => {
    const metrics = processManager.getAllMetrics();
    socket.emit('process:metrics', metrics);
  });

  // Get resource limits
  socket.on('process:get-limits', () => {
    const limits = processManager.getResourceLimits();
    socket.emit('process:limits', limits);
  });

  // Update resource limits
  socket.on('process:update-limits', (data: any) => {
    try {
      processManager.updateResourceLimits(data);
      const newLimits = processManager.getResourceLimits();
      socket.emit('process:limits-updated', newLimits);
    } catch (error) {
      socket.emit('error', { 
        message: `Failed to update resource limits: ${error.message}`,
        type: 'resource-limits' 
      });
    }
  });

  // Terminate session
  socket.on('process:terminate-session', async (data: { sessionId: string }) => {
    try {
      await processManager.terminateSession(data.sessionId);
      socket.emit('process:session-terminated', { sessionId: data.sessionId });
    } catch (error) {
      socket.emit('error', { 
        message: `Failed to terminate session: ${error.message}`,
        type: 'session-termination' 
      });
    }
  });
}