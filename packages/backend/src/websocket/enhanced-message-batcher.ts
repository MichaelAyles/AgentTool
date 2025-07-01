import { EventEmitter } from 'events';
import type { Socket } from 'socket.io';
import { getConnectionPool, ConnectionMetadata } from './connection-pool.js';
import { structuredLogger } from '../middleware/logging.js';

export interface BatchedMessage {
  id: string;
  event: string;
  data: any;
  priority: MessagePriority;
  timestamp: number;
  targetUser?: string;
  targetRoom?: string;
  sessionId?: string;
  size: number;
  compressed?: boolean;
  retryCount?: number;
  expiresAt?: number;
}

export enum MessagePriority {
  CRITICAL = 0,
  HIGH = 1,
  NORMAL = 2,
  LOW = 3
}

export interface BatchConfig {
  maxBatchSize: number;
  maxBatchDelay: number;
  compressionThreshold: number;
  enableCompression: boolean;
  enablePrioritization: boolean;
  maxRetries: number;
  messageTimeout: number;
  adaptiveBatching: boolean;
  targetLatency: number;
  latencyAdjustmentFactor: number;
}

export interface BatchMetrics {
  totalMessages: number;
  batchesSent: number;
  messagesDropped: number;
  compressionRatio: number;
  averageBatchSize: number;
  averageLatency: number;
  queueLength: number;
  priorityDistribution: Record<MessagePriority, number>;
  targetEfficiency: number;
  networkUtilization: number;
}

interface ConnectionBatcher {
  socketId: string;
  queue: BatchedMessage[];
  lastFlush: number;
  flushTimer?: NodeJS.Timeout;
  metrics: {
    messagesSent: number;
    batchesSent: number;
    averageLatency: number;
    lastBatchSize: number;
  };
  adaptiveConfig: {
    currentBatchSize: number;
    currentDelay: number;
    latencyHistory: number[];
    adjustmentDirection: 'increase' | 'decrease' | 'stable';
  };
}

export class EnhancedMessageBatcher extends EventEmitter {
  private config: BatchConfig;
  private connectionBatchers = new Map<string, ConnectionBatcher>();
  private globalMetrics: BatchMetrics;
  private priorityQueues = new Map<MessagePriority, BatchedMessage[]>();
  private roomBatchers = new Map<string, BatchedMessage[]>();
  private userBatchers = new Map<string, BatchedMessage[]>();
  private messageSequence = 0;
  private isShuttingDown = false;

  constructor(config: Partial<BatchConfig> = {}) {
    super();
    
    this.config = {
      maxBatchSize: 20,
      maxBatchDelay: 50, // 50ms
      compressionThreshold: 1024, // 1KB
      enableCompression: true,
      enablePrioritization: true,
      maxRetries: 3,
      messageTimeout: 30000, // 30 seconds
      adaptiveBatching: true,
      targetLatency: 25, // 25ms target latency
      latencyAdjustmentFactor: 0.1,
      ...config,
    };

    this.globalMetrics = this.initializeMetrics();
    this.initializePriorityQueues();
    
    // Start periodic processing
    this.startPeriodicProcessing();
    
    // Monitor connection pool events
    this.setupConnectionPoolMonitoring();
  }

  /**
   * Add a message to the batch queue
   */
  addMessage(
    socketId: string,
    event: string,
    data: any,
    options: {
      priority?: MessagePriority;
      targetUser?: string;
      targetRoom?: string;
      sessionId?: string;
      timeout?: number;
    } = {}
  ): string {
    if (this.isShuttingDown) {
      throw new Error('Message batcher is shutting down');
    }

    const messageId = this.generateMessageId();
    const message: BatchedMessage = {
      id: messageId,
      event,
      data,
      priority: options.priority || MessagePriority.NORMAL,
      timestamp: Date.now(),
      targetUser: options.targetUser,
      targetRoom: options.targetRoom,
      sessionId: options.sessionId,
      size: this.estimateMessageSize(data),
      retryCount: 0,
      expiresAt: options.timeout ? Date.now() + options.timeout : Date.now() + this.config.messageTimeout,
    };

    // Apply compression if enabled and beneficial
    if (this.shouldCompressMessage(message)) {
      message.data = this.compressMessage(message.data);
      message.compressed = true;
      message.size = this.estimateMessageSize(message.data);
    }

    // Route message based on type
    if (options.targetRoom) {
      this.addRoomMessage(message);
    } else if (options.targetUser) {
      this.addUserMessage(message);
    } else {
      this.addConnectionMessage(socketId, message);
    }

    this.updateGlobalMetrics(message);
    return messageId;
  }

  /**
   * Add a broadcast message to a room
   */
  broadcastToRoom(
    roomName: string,
    event: string,
    data: any,
    priority: MessagePriority = MessagePriority.NORMAL
  ): string {
    const connectionPool = getConnectionPool();
    const roomConnections = this.getRoomConnections(roomName);
    
    if (roomConnections.length === 0) {
      structuredLogger.warn('No connections found for room broadcast', { roomName });
      return '';
    }

    const messageId = this.generateMessageId();
    
    // Create batched message for each connection in the room
    roomConnections.forEach(socketId => {
      this.addMessage(socketId, event, data, {
        priority,
        targetRoom: roomName,
      });
    });

    return messageId;
  }

  /**
   * Add a message to a specific user (all their connections)
   */
  sendToUser(
    userId: string,
    event: string,
    data: any,
    priority: MessagePriority = MessagePriority.NORMAL
  ): string {
    const connectionPool = getConnectionPool();
    const userConnections = connectionPool.getUserConnections(userId);
    
    if (userConnections.length === 0) {
      structuredLogger.warn('No connections found for user', { userId });
      return '';
    }

    const messageId = this.generateMessageId();
    
    // Send to all user connections
    userConnections.forEach(connection => {
      this.addMessage(connection.socketId, event, data, {
        priority,
        targetUser: userId,
      });
    });

    return messageId;
  }

  /**
   * Force flush all pending messages
   */
  flushAll(): void {
    for (const batcher of this.connectionBatchers.values()) {
      this.flushConnectionBatcher(batcher);
    }
    
    this.flushRoomBatchers();
    this.flushUserBatchers();
    this.flushPriorityQueues();
  }

  /**
   * Force flush messages for a specific connection
   */
  flushConnection(socketId: string): boolean {
    const batcher = this.connectionBatchers.get(socketId);
    if (!batcher || batcher.queue.length === 0) {
      return false;
    }
    
    this.flushConnectionBatcher(batcher);
    return true;
  }

  /**
   * Get current metrics
   */
  getMetrics(): BatchMetrics {
    this.updateNetworkUtilization();
    return { ...this.globalMetrics };
  }

  /**
   * Get metrics for a specific connection
   */
  getConnectionMetrics(socketId: string): any {
    const batcher = this.connectionBatchers.get(socketId);
    return batcher ? { ...batcher.metrics, queueLength: batcher.queue.length } : null;
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<BatchConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.emit('configUpdated', this.config);
  }

  /**
   * Shutdown the batcher gracefully
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    
    // Flush all pending messages
    this.flushAll();
    
    // Clear all timers
    this.clearAllTimers();
    
    // Wait a bit for messages to be sent
    await new Promise(resolve => setTimeout(resolve, 100));
    
    this.removeAllListeners();
  }

  // Private methods

  private addConnectionMessage(socketId: string, message: BatchedMessage): void {
    let batcher = this.connectionBatchers.get(socketId);
    
    if (!batcher) {
      batcher = this.createConnectionBatcher(socketId);
      this.connectionBatchers.set(socketId, batcher);
    }

    // Priority insertion
    if (this.config.enablePrioritization) {
      this.insertMessageByPriority(batcher.queue, message);
    } else {
      batcher.queue.push(message);
    }

    // Check if we should flush immediately
    if (this.shouldFlushBatcher(batcher)) {
      this.flushConnectionBatcher(batcher);
    } else {
      this.scheduleBatcherFlush(batcher);
    }
  }

  private addRoomMessage(message: BatchedMessage): void {
    const roomName = message.targetRoom!;
    let roomQueue = this.roomBatchers.get(roomName);
    
    if (!roomQueue) {
      roomQueue = [];
      this.roomBatchers.set(roomName, roomQueue);
    }

    if (this.config.enablePrioritization) {
      this.insertMessageByPriority(roomQueue, message);
    } else {
      roomQueue.push(message);
    }

    // Check if room queue should be flushed
    if (roomQueue.length >= this.config.maxBatchSize) {
      this.flushRoomQueue(roomName);
    }
  }

  private addUserMessage(message: BatchedMessage): void {
    const userId = message.targetUser!;
    let userQueue = this.userBatchers.get(userId);
    
    if (!userQueue) {
      userQueue = [];
      this.userBatchers.set(userId, userQueue);
    }

    if (this.config.enablePrioritization) {
      this.insertMessageByPriority(userQueue, message);
    } else {
      userQueue.push(message);
    }

    // Check if user queue should be flushed
    if (userQueue.length >= this.config.maxBatchSize) {
      this.flushUserQueue(userId);
    }
  }

  private createConnectionBatcher(socketId: string): ConnectionBatcher {
    return {
      socketId,
      queue: [],
      lastFlush: Date.now(),
      metrics: {
        messagesSent: 0,
        batchesSent: 0,
        averageLatency: 0,
        lastBatchSize: 0,
      },
      adaptiveConfig: {
        currentBatchSize: this.config.maxBatchSize,
        currentDelay: this.config.maxBatchDelay,
        latencyHistory: [],
        adjustmentDirection: 'stable',
      },
    };
  }

  private shouldFlushBatcher(batcher: ConnectionBatcher): boolean {
    const now = Date.now();
    const queueLength = batcher.queue.length;
    const timeSinceLastFlush = now - batcher.lastFlush;
    
    // Immediate flush conditions
    if (queueLength >= (this.config.adaptiveBatching ? batcher.adaptiveConfig.currentBatchSize : this.config.maxBatchSize)) {
      return true;
    }
    
    if (timeSinceLastFlush >= (this.config.adaptiveBatching ? batcher.adaptiveConfig.currentDelay : this.config.maxBatchDelay)) {
      return true;
    }
    
    // Priority-based flushing
    if (this.config.enablePrioritization && queueLength > 0) {
      const highestPriority = Math.min(...batcher.queue.map(m => m.priority));
      if (highestPriority <= MessagePriority.HIGH && timeSinceLastFlush > this.config.maxBatchDelay / 2) {
        return true;
      }
      if (highestPriority === MessagePriority.CRITICAL) {
        return true;
      }
    }
    
    return false;
  }

  private flushConnectionBatcher(batcher: ConnectionBatcher): void {
    if (batcher.queue.length === 0) {
      return;
    }

    const connectionPool = getConnectionPool();
    const socket = this.getSocketFromPool(batcher.socketId);
    
    if (!socket) {
      // Connection no longer exists, remove batcher
      this.connectionBatchers.delete(batcher.socketId);
      return;
    }

    const startTime = Date.now();
    const messages = [...batcher.queue];
    batcher.queue.length = 0;
    
    // Clear flush timer
    if (batcher.flushTimer) {
      clearTimeout(batcher.flushTimer);
      batcher.flushTimer = undefined;
    }

    // Send messages
    this.sendMessagesToSocket(socket, messages);
    
    // Update metrics
    const latency = Date.now() - startTime;
    this.updateBatcherMetrics(batcher, messages.length, latency);
    this.updateGlobalBatchMetrics(messages.length, latency);
    
    // Adaptive batching adjustment
    if (this.config.adaptiveBatching) {
      this.adjustAdaptiveBatching(batcher, latency);
    }
    
    batcher.lastFlush = Date.now();
  }

  private sendMessagesToSocket(socket: any, messages: BatchedMessage[]): void {
    if (messages.length === 1) {
      // Send single message directly
      const message = messages[0];
      socket.emit(message.event, message.data);
    } else {
      // Send as batch
      const batchPayload = {
        type: 'message_batch',
        messages: messages.map(msg => ({
          id: msg.id,
          event: msg.event,
          data: msg.data,
          compressed: msg.compressed,
          timestamp: msg.timestamp,
        })),
        batchId: this.generateBatchId(),
        timestamp: Date.now(),
      };
      
      socket.emit('message_batch', batchPayload);
    }
  }

  private flushRoomBatchers(): void {
    for (const [roomName, queue] of this.roomBatchers.entries()) {
      if (queue.length > 0) {
        this.flushRoomQueue(roomName);
      }
    }
  }

  private flushRoomQueue(roomName: string): void {
    const queue = this.roomBatchers.get(roomName);
    if (!queue || queue.length === 0) {
      return;
    }

    const messages = [...queue];
    queue.length = 0;

    // Get room connections and send to each
    const connections = this.getRoomConnections(roomName);
    connections.forEach(socketId => {
      messages.forEach(message => {
        this.addConnectionMessage(socketId, { ...message });
      });
    });
  }

  private flushUserBatchers(): void {
    for (const [userId, queue] of this.userBatchers.entries()) {
      if (queue.length > 0) {
        this.flushUserQueue(userId);
      }
    }
  }

  private flushUserQueue(userId: string): void {
    const queue = this.userBatchers.get(userId);
    if (!queue || queue.length === 0) {
      return;
    }

    const messages = [...queue];
    queue.length = 0;

    // Get user connections and send to each
    const connectionPool = getConnectionPool();
    const userConnections = connectionPool.getUserConnections(userId);
    
    userConnections.forEach(connection => {
      messages.forEach(message => {
        this.addConnectionMessage(connection.socketId, { ...message });
      });
    });
  }

  private flushPriorityQueues(): void {
    for (const [priority, queue] of this.priorityQueues.entries()) {
      while (queue.length > 0) {
        const message = queue.shift()!;
        // Route message to appropriate destination
        if (message.targetRoom) {
          this.addRoomMessage(message);
        } else if (message.targetUser) {
          this.addUserMessage(message);
        }
      }
    }
  }

  private scheduleBatcherFlush(batcher: ConnectionBatcher): void {
    if (batcher.flushTimer) {
      return; // Timer already scheduled
    }

    const delay = this.config.adaptiveBatching ? 
      batcher.adaptiveConfig.currentDelay : 
      this.config.maxBatchDelay;

    batcher.flushTimer = setTimeout(() => {
      this.flushConnectionBatcher(batcher);
    }, delay);
  }

  private insertMessageByPriority(queue: BatchedMessage[], message: BatchedMessage): void {
    let insertIndex = queue.length;
    
    for (let i = 0; i < queue.length; i++) {
      if (message.priority < queue[i].priority) {
        insertIndex = i;
        break;
      }
    }
    
    queue.splice(insertIndex, 0, message);
  }

  private shouldCompressMessage(message: BatchedMessage): boolean {
    return this.config.enableCompression && 
           message.size >= this.config.compressionThreshold;
  }

  private compressMessage(data: any): any {
    try {
      const zlib = require('zlib');
      
      if (typeof data === 'object') {
        const jsonString = JSON.stringify(data);
        const compressed = zlib.deflateSync(Buffer.from(jsonString, 'utf8'));
        return {
          __compressed: true,
          data: compressed.toString('base64'),
        };
      }
      
      return data;
    } catch (error) {
      structuredLogger.warn('Message compression failed', { error });
      return data;
    }
  }

  private estimateMessageSize(data: any): number {
    try {
      if (Buffer.isBuffer(data)) {
        return data.length;
      }
      
      if (typeof data === 'string') {
        return Buffer.byteLength(data, 'utf8');
      }
      
      return Buffer.byteLength(JSON.stringify(data), 'utf8');
    } catch {
      return 1024; // Default estimate
    }
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${++this.messageSequence}`;
  }

  private generateBatchId(): string {
    return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private updateBatcherMetrics(batcher: ConnectionBatcher, messageCount: number, latency: number): void {
    batcher.metrics.messagesSent += messageCount;
    batcher.metrics.batchesSent++;
    batcher.metrics.averageLatency = (batcher.metrics.averageLatency + latency) / 2;
    batcher.metrics.lastBatchSize = messageCount;
  }

  private updateGlobalMetrics(message: BatchedMessage): void {
    this.globalMetrics.totalMessages++;
    this.globalMetrics.queueLength++;
    this.globalMetrics.priorityDistribution[message.priority]++;
  }

  private updateGlobalBatchMetrics(messageCount: number, latency: number): void {
    this.globalMetrics.batchesSent++;
    this.globalMetrics.averageBatchSize = 
      (this.globalMetrics.averageBatchSize + messageCount) / 2;
    this.globalMetrics.averageLatency = 
      (this.globalMetrics.averageLatency + latency) / 2;
    this.globalMetrics.queueLength -= messageCount;
  }

  private adjustAdaptiveBatching(batcher: ConnectionBatcher, latency: number): void {
    const adaptive = batcher.adaptiveConfig;
    adaptive.latencyHistory.push(latency);
    
    // Keep only recent history
    if (adaptive.latencyHistory.length > 10) {
      adaptive.latencyHistory.shift();
    }
    
    const averageLatency = adaptive.latencyHistory.reduce((a, b) => a + b, 0) / adaptive.latencyHistory.length;
    
    if (averageLatency > this.config.targetLatency * 1.2) {
      // Latency too high, reduce batch size or delay
      if (adaptive.adjustmentDirection !== 'decrease') {
        adaptive.adjustmentDirection = 'decrease';
        adaptive.currentBatchSize = Math.max(1, Math.floor(adaptive.currentBatchSize * 0.8));
        adaptive.currentDelay = Math.max(10, Math.floor(adaptive.currentDelay * 0.8));
      }
    } else if (averageLatency < this.config.targetLatency * 0.8) {
      // Latency good, can increase batch size or delay
      if (adaptive.adjustmentDirection !== 'increase') {
        adaptive.adjustmentDirection = 'increase';
        adaptive.currentBatchSize = Math.min(this.config.maxBatchSize, Math.ceil(adaptive.currentBatchSize * 1.1));
        adaptive.currentDelay = Math.min(this.config.maxBatchDelay, Math.ceil(adaptive.currentDelay * 1.1));
      }
    } else {
      adaptive.adjustmentDirection = 'stable';
    }
  }

  private updateNetworkUtilization(): void {
    const connectionPool = getConnectionPool();
    const stats = connectionPool.getStatistics();
    
    // Simple network utilization calculation
    this.globalMetrics.networkUtilization = Math.min(100, 
      (stats.messagesPerSecond / (stats.totalConnections * 10)) * 100
    );
  }

  private getRoomConnections(roomName: string): string[] {
    // This would need to integrate with the actual room management system
    // For now, return empty array as placeholder
    return [];
  }

  private getSocketFromPool(socketId: string): any {
    // Get socket from connection pool
    const connectionPool = getConnectionPool();
    const connection = connectionPool.getConnection(socketId);
    return connection ? { emit: () => {}, id: socketId } : null; // Mock socket
  }

  private initializeMetrics(): BatchMetrics {
    return {
      totalMessages: 0,
      batchesSent: 0,
      messagesDropped: 0,
      compressionRatio: 1.0,
      averageBatchSize: 0,
      averageLatency: 0,
      queueLength: 0,
      priorityDistribution: {
        [MessagePriority.CRITICAL]: 0,
        [MessagePriority.HIGH]: 0,
        [MessagePriority.NORMAL]: 0,
        [MessagePriority.LOW]: 0,
      },
      targetEfficiency: 0,
      networkUtilization: 0,
    };
  }

  private initializePriorityQueues(): void {
    for (const priority of [MessagePriority.CRITICAL, MessagePriority.HIGH, MessagePriority.NORMAL, MessagePriority.LOW]) {
      this.priorityQueues.set(priority, []);
    }
  }

  private startPeriodicProcessing(): void {
    // Process expired messages
    setInterval(() => {
      this.cleanupExpiredMessages();
    }, 5000); // Every 5 seconds

    // Periodic metrics update
    setInterval(() => {
      this.updateNetworkUtilization();
      this.emit('metricsUpdated', this.globalMetrics);
    }, 1000); // Every second
  }

  private cleanupExpiredMessages(): void {
    const now = Date.now();
    let droppedCount = 0;

    // Clean connection batchers
    for (const batcher of this.connectionBatchers.values()) {
      const initialLength = batcher.queue.length;
      batcher.queue = batcher.queue.filter(msg => msg.expiresAt! > now);
      droppedCount += initialLength - batcher.queue.length;
    }

    // Clean room batchers
    for (const [roomName, queue] of this.roomBatchers.entries()) {
      const initialLength = queue.length;
      this.roomBatchers.set(roomName, queue.filter(msg => msg.expiresAt! > now));
      droppedCount += initialLength - queue.length;
    }

    // Clean user batchers
    for (const [userId, queue] of this.userBatchers.entries()) {
      const initialLength = queue.length;
      this.userBatchers.set(userId, queue.filter(msg => msg.expiresAt! > now));
      droppedCount += initialLength - queue.length;
    }

    if (droppedCount > 0) {
      this.globalMetrics.messagesDropped += droppedCount;
      this.globalMetrics.queueLength -= droppedCount;
      structuredLogger.info('Dropped expired messages', { droppedCount });
    }
  }

  private setupConnectionPoolMonitoring(): void {
    try {
      const connectionPool = getConnectionPool();
      
      connectionPool.on('connectionRemoved', ({ socketId }) => {
        this.removeConnectionBatcher(socketId);
      });
      
    } catch (error) {
      // Connection pool might not be initialized yet
      structuredLogger.warn('Could not setup connection pool monitoring', { error });
    }
  }

  private removeConnectionBatcher(socketId: string): void {
    const batcher = this.connectionBatchers.get(socketId);
    if (batcher) {
      // Flush any remaining messages
      this.flushConnectionBatcher(batcher);
      
      // Clear timer
      if (batcher.flushTimer) {
        clearTimeout(batcher.flushTimer);
      }
      
      this.connectionBatchers.delete(socketId);
    }
  }

  private clearAllTimers(): void {
    for (const batcher of this.connectionBatchers.values()) {
      if (batcher.flushTimer) {
        clearTimeout(batcher.flushTimer);
      }
    }
  }
}

// Singleton factory
let enhancedBatcherInstance: EnhancedMessageBatcher | null = null;

export function createEnhancedMessageBatcher(config?: Partial<BatchConfig>): EnhancedMessageBatcher {
  if (enhancedBatcherInstance) {
    return enhancedBatcherInstance;
  }
  
  enhancedBatcherInstance = new EnhancedMessageBatcher(config);
  return enhancedBatcherInstance;
}

export function getEnhancedMessageBatcher(): EnhancedMessageBatcher {
  if (!enhancedBatcherInstance) {
    throw new Error('Enhanced message batcher not initialized. Call createEnhancedMessageBatcher first.');
  }
  return enhancedBatcherInstance;
}

export function resetEnhancedMessageBatcher(): void {
  if (enhancedBatcherInstance) {
    enhancedBatcherInstance.shutdown();
  }
  enhancedBatcherInstance = null;
}