import { Server, Socket } from 'socket.io';
import { AdapterRegistry } from '@vibecode/adapter-sdk';
import type { ProcessManager } from '../processes/index.js';
import { TerminalHandler } from './terminal-handler.js';
import { createConnectionPool, getConnectionPool } from './connection-pool.js';
import { structuredLogger } from '../middleware/logging.js';

interface Services {
  adapterRegistry: AdapterRegistry;
  processManager: ProcessManager;
}

export function setupWebSocket(io: Server, services: Services): void {
  // Initialize connection pool
  const connectionPool = createConnectionPool({
    maxConnections: 1000,
    maxConnectionsPerUser: 10,
    maxConnectionsPerIP: 50,
    enableConnectionUpgrade: true,
    enableCompression: true,
    enableRateLimiting: true,
  });
  connectionPool.initialize();

  const terminalHandler = new TerminalHandler(io, services.adapterRegistry);

  // Set up process monitoring event forwarding
  setupProcessMonitoring(io, services.processManager);

  // Set up connection pool event handlers
  setupConnectionPoolHandlers(io, connectionPool);

  io.on('connection', async (socket: Socket) => {
    structuredLogger.info('WebSocket connection attempt', { socketId: socket.id });

    // Try to add connection to pool
    const added = await connectionPool.addConnection(socket);
    if (!added) {
      socket.emit('connection_rejected', { 
        reason: 'Pool capacity exceeded or rate limit',
        message: 'Too many connections. Please try again later.'
      });
      socket.disconnect(true);
      return;
    }

    // Authentication middleware
    socket.use((packet, next) => {
      // TODO: Implement proper authentication
      // For now, just set a default user and authenticate in pool
      const userId = 'default-user'; // This should come from actual auth
      socket.data.user = { id: userId, username: 'user' };
      
      // Authenticate connection in pool
      connectionPool.authenticateConnection(socket.id, userId);
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

    socket.on('disconnect', (reason) => {
      structuredLogger.info('WebSocket client disconnected', { 
        socketId: socket.id, 
        reason,
        userId: socket.data.user?.id 
      });
      // Connection pool will handle cleanup automatically
    });

    // Handle connection pool specific events
    socket.on('join_room', (data: { room: string }) => {
      connectionPool.joinRoom(socket.id, data.room);
    });

    socket.on('leave_room', (data: { room: string }) => {
      connectionPool.leaveRoom(socket.id, data.room);
    });

    socket.on('get_connection_info', () => {
      const connectionInfo = connectionPool.getConnection(socket.id);
      socket.emit('connection_info', connectionInfo);
    });
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('Shutting down WebSocket server...');
    terminalHandler.cleanup();
    io.close();
  });
}

function setupConnectionPoolHandlers(io: Server, connectionPool: any): void {
  // Broadcast pool statistics periodically
  connectionPool.on('heartbeat', (stats: any) => {
    io.emit('pool:stats', {
      timestamp: new Date().toISOString(),
      ...stats,
    });
  });

  // Handle connection events
  connectionPool.on('connectionAdded', ({ socketId, metadata }: any) => {
    // Notify admins about new connections
    io.to('admin_room').emit('pool:connection_added', {
      socketId,
      userId: metadata.userId,
      ipAddress: metadata.ipAddress,
      connectionType: metadata.connectionType,
    });
  });

  connectionPool.on('connectionRemoved', ({ socketId, metadata, reason }: any) => {
    // Notify admins about disconnections
    io.to('admin_room').emit('pool:connection_removed', {
      socketId,
      userId: metadata.userId,
      reason,
      connectionDuration: Date.now() - metadata.connectedAt.getTime(),
    });
  });

  connectionPool.on('connectionAuthenticated', ({ socketId, userId }: any) => {
    // Notify about successful authentications
    io.to('admin_room').emit('pool:connection_authenticated', {
      socketId,
      userId,
    });
  });

  connectionPool.on('messageRateLimitExceeded', ({ socketId, metadata }: any) => {
    // Notify admins about rate limit violations
    io.to('admin_room').emit('pool:rate_limit_exceeded', {
      socketId,
      userId: metadata.userId,
      ipAddress: metadata.ipAddress,
    });
  });

  // Global pool events
  connectionPool.on('poolInitialized', () => {
    structuredLogger.info('WebSocket connection pool initialized');
  });

  // Optimized broadcasting for room events
  connectionPool.on('roomBroadcast', ({ roomName, event, messageSize, connectionCount }: any) => {
    structuredLogger.debug('Room broadcast completed', {
      roomName,
      event,
      messageSize,
      connectionCount,
    });
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