import { EventEmitter } from 'events';
import { Socket } from 'socket.io';
import { structuredLogger } from '../middleware/logging.js';
import {
  comprehensiveAuditLogger,
  AuditCategory,
} from '../security/audit-logger.js';
import { SecurityLevel } from '../security/types.js';

// Connection metadata
export interface ConnectionMetadata {
  socketId: string;
  userId: string;
  sessionId: string;
  ipAddress: string;
  userAgent: string;
  connectedAt: Date;
  lastActivity: Date;
  messageCount: number;
  dataTransferred: number;
  roomsJoined: Set<string>;
  subscriptions: Set<string>;
  isAuthenticated: boolean;
  connectionQuality: ConnectionQuality;
  pingLatency: number;
  connectionType: ConnectionType;
}

// Connection quality metrics
export enum ConnectionQuality {
  EXCELLENT = 'excellent',
  GOOD = 'good',
  FAIR = 'fair',
  POOR = 'poor',
  DEGRADED = 'degraded',
}

// Connection type
export enum ConnectionType {
  WEBSOCKET = 'websocket',
  POLLING = 'polling',
  TRANSPORT_UNKNOWN = 'unknown',
}

// Pool configuration
export interface PoolConfig {
  maxConnections: number;
  maxConnectionsPerUser: number;
  maxConnectionsPerIP: number;
  idleTimeout: number; // milliseconds
  pingInterval: number; // milliseconds
  pingTimeout: number; // milliseconds
  enableConnectionUpgrade: boolean;
  enableCompression: boolean;
  compressionThreshold: number; // bytes
  enableBroadcastOptimization: boolean;
  maxMessageSize: number; // bytes
  maxMessagesPerSecond: number;
  enableRateLimiting: boolean;
  heartbeatInterval: number; // milliseconds
  connectionCleanupInterval: number; // milliseconds
}

// Pool statistics
export interface PoolStatistics {
  totalConnections: number;
  activeConnections: number;
  authenticatedConnections: number;
  connectionsByType: Record<ConnectionType, number>;
  connectionsByQuality: Record<ConnectionQuality, number>;
  averagePingLatency: number;
  totalDataTransferred: number;
  messagesPerSecond: number;
  connectionsPerUser: Record<string, number>;
  connectionsPerIP: Record<string, number>;
  uptime: number;
  lastCleanup: Date;
  poolEfficiency: number;
}

// Message rate tracking
interface MessageRateTracker {
  count: number;
  lastReset: Date;
  violations: number;
}

const DEFAULT_CONFIG: PoolConfig = {
  maxConnections: 1000,
  maxConnectionsPerUser: 10,
  maxConnectionsPerIP: 50,
  idleTimeout: 5 * 60 * 1000, // 5 minutes
  pingInterval: 25000, // 25 seconds
  pingTimeout: 20000, // 20 seconds
  enableConnectionUpgrade: true,
  enableCompression: true,
  compressionThreshold: 1024, // 1KB
  enableBroadcastOptimization: true,
  maxMessageSize: 1024 * 1024, // 1MB
  maxMessagesPerSecond: 100,
  enableRateLimiting: true,
  heartbeatInterval: 30000, // 30 seconds
  connectionCleanupInterval: 60000, // 1 minute
};

export class WebSocketConnectionPool extends EventEmitter {
  private config: PoolConfig;
  private connections: Map<string, ConnectionMetadata> = new Map();
  private sockets: Map<string, Socket> = new Map();
  private userConnections: Map<string, Set<string>> = new Map();
  private ipConnections: Map<string, Set<string>> = new Map();
  private messageRates: Map<string, MessageRateTracker> = new Map();
  private rooms: Map<string, Set<string>> = new Map();
  private subscriptions: Map<string, Set<string>> = new Map();
  private pingIntervals: Map<string, NodeJS.Timeout> = new Map();
  private heartbeatInterval?: NodeJS.Timeout;
  private cleanupInterval?: NodeJS.Timeout;
  private poolStartTime: Date = new Date();
  private totalMessagesProcessed = 0;
  private totalDataTransferred = 0;
  private isInitialized = false;

  constructor(config: Partial<PoolConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.setupEventHandlers();
  }

  /**
   * Initialize the connection pool
   */
  initialize(): void {
    if (this.isInitialized) {
      return;
    }

    this.startHeartbeat();
    this.startConnectionCleanup();

    this.isInitialized = true;
    structuredLogger.info('WebSocket connection pool initialized', {
      maxConnections: this.config.maxConnections,
      maxConnectionsPerUser: this.config.maxConnectionsPerUser,
    });
    this.emit('poolInitialized');
  }

  /**
   * Add a new connection to the pool
   */
  async addConnection(socket: Socket): Promise<boolean> {
    const socketId = socket.id;
    const ipAddress = this.extractIPAddress(socket);
    const userAgent = socket.handshake.headers['user-agent'] || 'unknown';

    // Check global connection limit
    if (this.connections.size >= this.config.maxConnections) {
      structuredLogger.warn('Connection rejected - pool at capacity', {
        socketId,
        ipAddress,
        currentConnections: this.connections.size,
        maxConnections: this.config.maxConnections,
      });
      return false;
    }

    // Check IP-based connection limit
    const ipConnectionCount = this.ipConnections.get(ipAddress)?.size || 0;
    if (ipConnectionCount >= this.config.maxConnectionsPerIP) {
      structuredLogger.warn('Connection rejected - IP limit exceeded', {
        socketId,
        ipAddress,
        currentConnections: ipConnectionCount,
        maxConnectionsPerIP: this.config.maxConnectionsPerIP,
      });
      return false;
    }

    // Create connection metadata
    const metadata: ConnectionMetadata = {
      socketId,
      userId: '', // Will be set during authentication
      sessionId: socket.handshake.sessionID || '',
      ipAddress,
      userAgent,
      connectedAt: new Date(),
      lastActivity: new Date(),
      messageCount: 0,
      dataTransferred: 0,
      roomsJoined: new Set(),
      subscriptions: new Set(),
      isAuthenticated: false,
      connectionQuality: ConnectionQuality.GOOD,
      pingLatency: 0,
      connectionType: this.getConnectionType(socket),
    };

    // Add to tracking maps
    this.connections.set(socketId, metadata);
    this.sockets.set(socketId, socket);

    // Track IP connections
    if (!this.ipConnections.has(ipAddress)) {
      this.ipConnections.set(ipAddress, new Set());
    }
    this.ipConnections.get(ipAddress)!.add(socketId);

    // Start ping monitoring
    this.startPingMonitoring(socketId);

    // Setup socket event handlers
    this.setupSocketHandlers(socket, metadata);

    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'websocket_connection_added',
      resourceType: 'websocket_connection',
      resourceId: socketId,
      sessionId: metadata.sessionId,
      ipAddress,
      userAgent,
      outcome: 'success',
      severity: SecurityLevel.SAFE,
      details: {
        connectionType: metadata.connectionType,
        totalConnections: this.connections.size,
      },
    });

    structuredLogger.info('Connection added to pool', {
      socketId,
      ipAddress,
      totalConnections: this.connections.size,
      connectionType: metadata.connectionType,
    });

    this.emit('connectionAdded', { socketId, metadata });
    return true;
  }

  /**
   * Remove a connection from the pool
   */
  async removeConnection(
    socketId: string,
    reason: string = 'disconnect'
  ): Promise<boolean> {
    const metadata = this.connections.get(socketId);
    if (!metadata) {
      return false;
    }

    // Clean up tracking
    this.connections.delete(socketId);
    this.sockets.delete(socketId);

    // Remove from user connections if authenticated
    if (metadata.userId && this.userConnections.has(metadata.userId)) {
      this.userConnections.get(metadata.userId)!.delete(socketId);
      if (this.userConnections.get(metadata.userId)!.size === 0) {
        this.userConnections.delete(metadata.userId);
      }
    }

    // Remove from IP connections
    if (this.ipConnections.has(metadata.ipAddress)) {
      this.ipConnections.get(metadata.ipAddress)!.delete(socketId);
      if (this.ipConnections.get(metadata.ipAddress)!.size === 0) {
        this.ipConnections.delete(metadata.ipAddress);
      }
    }

    // Clean up rooms and subscriptions
    this.cleanupConnectionRooms(socketId, metadata);

    // Stop ping monitoring
    this.stopPingMonitoring(socketId);

    // Clean up message rate tracking
    this.messageRates.delete(socketId);

    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'websocket_connection_removed',
      resourceType: 'websocket_connection',
      resourceId: socketId,
      userId: metadata.userId,
      sessionId: metadata.sessionId,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      outcome: 'success',
      severity: SecurityLevel.SAFE,
      details: {
        reason,
        connectionDuration: Date.now() - metadata.connectedAt.getTime(),
        messageCount: metadata.messageCount,
        dataTransferred: metadata.dataTransferred,
        totalConnections: this.connections.size,
      },
    });

    structuredLogger.info('Connection removed from pool', {
      socketId,
      reason,
      userId: metadata.userId,
      connectionDuration: Date.now() - metadata.connectedAt.getTime(),
      totalConnections: this.connections.size,
    });

    this.emit('connectionRemoved', { socketId, metadata, reason });
    return true;
  }

  /**
   * Authenticate a connection
   */
  authenticateConnection(socketId: string, userId: string): boolean {
    const metadata = this.connections.get(socketId);
    if (!metadata) {
      return false;
    }

    // Check user connection limit
    const userConnectionCount = this.userConnections.get(userId)?.size || 0;
    if (userConnectionCount >= this.config.maxConnectionsPerUser) {
      structuredLogger.warn(
        'Authentication rejected - user connection limit exceeded',
        {
          socketId,
          userId,
          currentConnections: userConnectionCount,
          maxConnectionsPerUser: this.config.maxConnectionsPerUser,
        }
      );
      return false;
    }

    // Update metadata
    metadata.userId = userId;
    metadata.isAuthenticated = true;
    metadata.lastActivity = new Date();

    // Track user connections
    if (!this.userConnections.has(userId)) {
      this.userConnections.set(userId, new Set());
    }
    this.userConnections.get(userId)!.add(socketId);

    structuredLogger.info('Connection authenticated', {
      socketId,
      userId,
      userConnections: this.userConnections.get(userId)!.size,
    });

    this.emit('connectionAuthenticated', { socketId, userId, metadata });
    return true;
  }

  /**
   * Join a room
   */
  joinRoom(socketId: string, roomName: string): boolean {
    const socket = this.sockets.get(socketId);
    const metadata = this.connections.get(socketId);

    if (!socket || !metadata) {
      return false;
    }

    socket.join(roomName);
    metadata.roomsJoined.add(roomName);

    // Track room membership
    if (!this.rooms.has(roomName)) {
      this.rooms.set(roomName, new Set());
    }
    this.rooms.get(roomName)!.add(socketId);

    this.emit('roomJoined', { socketId, roomName, metadata });
    return true;
  }

  /**
   * Leave a room
   */
  leaveRoom(socketId: string, roomName: string): boolean {
    const socket = this.sockets.get(socketId);
    const metadata = this.connections.get(socketId);

    if (!socket || !metadata) {
      return false;
    }

    socket.leave(roomName);
    metadata.roomsJoined.delete(roomName);

    // Update room tracking
    if (this.rooms.has(roomName)) {
      this.rooms.get(roomName)!.delete(socketId);
      if (this.rooms.get(roomName)!.size === 0) {
        this.rooms.delete(roomName);
      }
    }

    this.emit('roomLeft', { socketId, roomName, metadata });
    return true;
  }

  /**
   * Broadcast to room with optimization
   */
  broadcastToRoom(roomName: string, event: string, data: any): boolean {
    const roomConnections = this.rooms.get(roomName);
    if (!roomConnections || roomConnections.size === 0) {
      return false;
    }

    let messageSize = 0;
    try {
      messageSize = JSON.stringify(data).length;
    } catch (error) {
      structuredLogger.error(
        'Failed to serialize broadcast data',
        error as Error
      );
      return false;
    }

    // Apply compression if enabled and message is large enough
    const shouldCompress =
      this.config.enableCompression &&
      messageSize > this.config.compressionThreshold;

    const broadcastOptions = shouldCompress ? { compress: true } : {};

    // Broadcast to all connections in room
    for (const socketId of roomConnections) {
      const socket = this.sockets.get(socketId);
      const metadata = this.connections.get(socketId);

      if (socket && metadata) {
        socket.emit(event, data, broadcastOptions);
        this.updateConnectionActivity(socketId, messageSize);
      }
    }

    this.emit('roomBroadcast', {
      roomName,
      event,
      messageSize,
      connectionCount: roomConnections.size,
    });
    return true;
  }

  /**
   * Get pool statistics
   */
  getStatistics(): PoolStatistics {
    const now = Date.now();
    const uptime = now - this.poolStartTime.getTime();

    // Calculate averages and counts
    const connections = Array.from(this.connections.values());
    const totalPingLatency = connections.reduce(
      (sum, conn) => sum + conn.pingLatency,
      0
    );
    const averagePingLatency =
      connections.length > 0 ? totalPingLatency / connections.length : 0;

    const connectionsByType = connections.reduce(
      (acc, conn) => {
        acc[conn.connectionType] = (acc[conn.connectionType] || 0) + 1;
        return acc;
      },
      {} as Record<ConnectionType, number>
    );

    const connectionsByQuality = connections.reduce(
      (acc, conn) => {
        acc[conn.connectionQuality] = (acc[conn.connectionQuality] || 0) + 1;
        return acc;
      },
      {} as Record<ConnectionQuality, number>
    );

    const connectionsPerUser: Record<string, number> = {};
    for (const [userId, socketIds] of this.userConnections) {
      connectionsPerUser[userId] = socketIds.size;
    }

    const connectionsPerIP: Record<string, number> = {};
    for (const [ip, socketIds] of this.ipConnections) {
      connectionsPerIP[ip] = socketIds.size;
    }

    // Calculate efficiency (active vs total capacity)
    const poolEfficiency = this.connections.size / this.config.maxConnections;

    // Calculate messages per second
    const uptimeSeconds = uptime / 1000;
    const messagesPerSecond =
      uptimeSeconds > 0 ? this.totalMessagesProcessed / uptimeSeconds : 0;

    return {
      totalConnections: this.connections.size,
      activeConnections: connections.filter(c => c.isAuthenticated).length,
      authenticatedConnections: connections.filter(c => c.isAuthenticated)
        .length,
      connectionsByType,
      connectionsByQuality,
      averagePingLatency,
      totalDataTransferred: this.totalDataTransferred,
      messagesPerSecond,
      connectionsPerUser,
      connectionsPerIP,
      uptime,
      lastCleanup: new Date(), // Updated during cleanup
      poolEfficiency,
    };
  }

  /**
   * Get connection by socket ID
   */
  getConnection(socketId: string): ConnectionMetadata | null {
    return this.connections.get(socketId) || null;
  }

  /**
   * Get all connections for a user
   */
  getUserConnections(userId: string): ConnectionMetadata[] {
    const socketIds = this.userConnections.get(userId);
    if (!socketIds) {
      return [];
    }

    return Array.from(socketIds)
      .map(socketId => this.connections.get(socketId))
      .filter(metadata => metadata !== undefined) as ConnectionMetadata[];
  }

  /**
   * Cleanup idle connections
   */
  cleanupIdleConnections(): number {
    const now = Date.now();
    const idleConnections: string[] = [];

    for (const [socketId, metadata] of this.connections) {
      const idleTime = now - metadata.lastActivity.getTime();
      if (idleTime > this.config.idleTimeout) {
        idleConnections.push(socketId);
      }
    }

    // Remove idle connections
    let removedCount = 0;
    for (const socketId of idleConnections) {
      const socket = this.sockets.get(socketId);
      if (socket) {
        socket.disconnect(true);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      structuredLogger.info('Cleaned up idle connections', {
        removedCount,
        totalConnections: this.connections.size,
      });
    }

    return removedCount;
  }

  // Private methods

  private setupEventHandlers(): void {
    this.on('connectionAdded', this.handleConnectionAdded.bind(this));
    this.on('connectionRemoved', this.handleConnectionRemoved.bind(this));
    this.on(
      'messageRateLimitExceeded',
      this.handleRateLimitExceeded.bind(this)
    );
  }

  private setupSocketHandlers(
    socket: Socket,
    metadata: ConnectionMetadata
  ): void {
    socket.on('disconnect', reason => {
      this.removeConnection(socket.id, reason);
    });

    socket.on('error', error => {
      structuredLogger.error('Socket error', error, { socketId: socket.id });
      this.updateConnectionQuality(socket.id, ConnectionQuality.POOR);
    });

    // Message rate limiting
    socket.use((packet, next) => {
      if (this.config.enableRateLimiting) {
        const allowed = this.checkMessageRate(socket.id);
        if (!allowed) {
          this.emit('messageRateLimitExceeded', {
            socketId: socket.id,
            metadata,
          });
          return; // Don't call next(), effectively dropping the message
        }
      }

      // Update activity
      this.updateConnectionActivity(socket.id, JSON.stringify(packet).length);
      next();
    });

    // Heartbeat/ping handling
    socket.on('ping', () => {
      const pingTime = Date.now();
      socket.emit('pong', pingTime);
    });

    socket.on('pong', (pingTime: number) => {
      const latency = Date.now() - pingTime;
      this.updatePingLatency(socket.id, latency);
    });
  }

  private extractIPAddress(socket: Socket): string {
    return (
      socket.handshake.address ||
      socket.conn.remoteAddress ||
      socket.request.socket.remoteAddress ||
      'unknown'
    );
  }

  private getConnectionType(socket: Socket): ConnectionType {
    const transport = socket.conn.transport?.name;
    switch (transport) {
      case 'websocket':
        return ConnectionType.WEBSOCKET;
      case 'polling':
        return ConnectionType.POLLING;
      default:
        return ConnectionType.TRANSPORT_UNKNOWN;
    }
  }

  private updateConnectionActivity(
    socketId: string,
    messageSize: number
  ): void {
    const metadata = this.connections.get(socketId);
    if (metadata) {
      metadata.lastActivity = new Date();
      metadata.messageCount++;
      metadata.dataTransferred += messageSize;
      this.totalMessagesProcessed++;
      this.totalDataTransferred += messageSize;
    }
  }

  private updatePingLatency(socketId: string, latency: number): void {
    const metadata = this.connections.get(socketId);
    if (metadata) {
      metadata.pingLatency = latency;

      // Update connection quality based on latency
      if (latency < 50) {
        metadata.connectionQuality = ConnectionQuality.EXCELLENT;
      } else if (latency < 100) {
        metadata.connectionQuality = ConnectionQuality.GOOD;
      } else if (latency < 200) {
        metadata.connectionQuality = ConnectionQuality.FAIR;
      } else if (latency < 500) {
        metadata.connectionQuality = ConnectionQuality.POOR;
      } else {
        metadata.connectionQuality = ConnectionQuality.DEGRADED;
      }
    }
  }

  private updateConnectionQuality(
    socketId: string,
    quality: ConnectionQuality
  ): void {
    const metadata = this.connections.get(socketId);
    if (metadata) {
      metadata.connectionQuality = quality;
    }
  }

  private checkMessageRate(socketId: string): boolean {
    const now = new Date();
    let tracker = this.messageRates.get(socketId);

    if (!tracker) {
      tracker = { count: 0, lastReset: now, violations: 0 };
      this.messageRates.set(socketId, tracker);
    }

    // Reset counter if a second has passed
    if (now.getTime() - tracker.lastReset.getTime() >= 1000) {
      tracker.count = 0;
      tracker.lastReset = now;
    }

    tracker.count++;

    if (tracker.count > this.config.maxMessagesPerSecond) {
      tracker.violations++;
      return false;
    }

    return true;
  }

  private startPingMonitoring(socketId: string): void {
    const interval = setInterval(() => {
      const socket = this.sockets.get(socketId);
      if (socket && socket.connected) {
        const pingTime = Date.now();
        socket.emit('ping', pingTime);
      } else {
        clearInterval(interval);
      }
    }, this.config.pingInterval);

    this.pingIntervals.set(socketId, interval);
  }

  private stopPingMonitoring(socketId: string): void {
    const interval = this.pingIntervals.get(socketId);
    if (interval) {
      clearInterval(interval);
      this.pingIntervals.delete(socketId);
    }
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.performHeartbeat();
    }, this.config.heartbeatInterval);
  }

  private startConnectionCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleConnections();
    }, this.config.connectionCleanupInterval);
  }

  private performHeartbeat(): void {
    const stats = this.getStatistics();
    this.emit('heartbeat', stats);

    // Log statistics periodically
    structuredLogger.info('Connection pool heartbeat', {
      totalConnections: stats.totalConnections,
      activeConnections: stats.activeConnections,
      averagePingLatency: Math.round(stats.averagePingLatency),
      poolEfficiency: Math.round(stats.poolEfficiency * 100),
    });
  }

  private cleanupConnectionRooms(
    socketId: string,
    metadata: ConnectionMetadata
  ): void {
    // Remove from all rooms
    for (const roomName of metadata.roomsJoined) {
      if (this.rooms.has(roomName)) {
        this.rooms.get(roomName)!.delete(socketId);
        if (this.rooms.get(roomName)!.size === 0) {
          this.rooms.delete(roomName);
        }
      }
    }

    // Remove from all subscriptions
    for (const subscription of metadata.subscriptions) {
      if (this.subscriptions.has(subscription)) {
        this.subscriptions.get(subscription)!.delete(socketId);
        if (this.subscriptions.get(subscription)!.size === 0) {
          this.subscriptions.delete(subscription);
        }
      }
    }
  }

  private handleConnectionAdded(event: any): void {
    // Handle connection added logic if needed
  }

  private handleConnectionRemoved(event: any): void {
    // Handle connection removed logic if needed
  }

  private handleRateLimitExceeded(event: any): void {
    const { socketId, metadata } = event;
    structuredLogger.warn('Message rate limit exceeded', {
      socketId,
      userId: metadata.userId,
      ipAddress: metadata.ipAddress,
    });

    // Could implement progressive penalties here
    const socket = this.sockets.get(socketId);
    if (socket) {
      socket.emit('rate_limit_exceeded', {
        message: 'Too many messages sent too quickly',
        retryAfter: 1000,
      });
    }
  }
}

// Export singleton instance factory
let connectionPoolInstance: WebSocketConnectionPool | null = null;

export function createConnectionPool(
  config?: Partial<PoolConfig>
): WebSocketConnectionPool {
  if (connectionPoolInstance) {
    return connectionPoolInstance;
  }

  connectionPoolInstance = new WebSocketConnectionPool(config);
  return connectionPoolInstance;
}

export function getConnectionPool(): WebSocketConnectionPool {
  if (!connectionPoolInstance) {
    throw new Error(
      'Connection pool not initialized. Call createConnectionPool first.'
    );
  }
  return connectionPoolInstance;
}
