import { EventEmitter } from 'events';
import type { Socket } from 'socket.io';

export interface BatchConfig {
  maxBatchSize: number;
  maxBatchDelay: number;
  enablePrioritization: boolean;
  compressionThreshold: number;
  enableCompression: boolean;
}

export interface QueuedMessage {
  id: string;
  event: string;
  data: any;
  priority: 'low' | 'normal' | 'high' | 'critical';
  timestamp: number;
  sessionId?: string;
  userId?: string;
  size: number;
  compressed?: boolean;
}

export interface BatchMetrics {
  totalMessages: number;
  batchesSent: number;
  averageBatchSize: number;
  averageLatency: number;
  compressionRatio: number;
  queueLength: number;
  droppedMessages: number;
}

export class MessageBatcher extends EventEmitter {
  private messageQueue: QueuedMessage[] = [];
  private batchTimer: NodeJS.Timeout | null = null;
  private metrics: BatchMetrics;
  private lastBatchTime = Date.now();

  constructor(
    private socket: Socket,
    private config: BatchConfig
  ) {
    super();

    this.metrics = {
      totalMessages: 0,
      batchesSent: 0,
      averageBatchSize: 0,
      averageLatency: 0,
      compressionRatio: 1.0,
      queueLength: 0,
      droppedMessages: 0,
    };

    // Handle socket disconnection
    this.socket.on('disconnect', () => {
      this.flush();
      this.clearBatchTimer();
    });
  }

  /**
   * Add a message to the batch queue
   */
  addMessage(
    event: string,
    data: any,
    priority: QueuedMessage['priority'] = 'normal',
    sessionId?: string,
    userId?: string
  ): void {
    const message: QueuedMessage = {
      id: this.generateMessageId(),
      event,
      data,
      priority,
      timestamp: Date.now(),
      sessionId,
      userId,
      size: this.estimateSize(data),
    };

    // Apply compression if enabled and data is large enough
    if (
      this.config.enableCompression &&
      message.size >= this.config.compressionThreshold
    ) {
      const compressedData = this.compressData(data);
      if (compressedData && this.estimateSize(compressedData) < message.size) {
        message.data = compressedData;
        message.compressed = true;
        message.size = this.estimateSize(compressedData);
      }
    }

    // Handle critical priority messages immediately
    if (priority === 'critical') {
      this.sendImmediately(message);
      return;
    }

    // Add to queue with priority ordering
    this.insertMessage(message);
    this.metrics.totalMessages++;
    this.metrics.queueLength = this.messageQueue.length;

    // Check if we should send batch immediately
    if (this.shouldFlushBatch()) {
      this.flush();
    } else {
      this.scheduleBatchFlush();
    }
  }

  /**
   * Insert message into queue with priority ordering
   */
  private insertMessage(message: QueuedMessage): void {
    if (!this.config.enablePrioritization) {
      this.messageQueue.push(message);
      return;
    }

    const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };
    const messagePriority = priorityOrder[message.priority];

    // Find insertion point
    let insertIndex = this.messageQueue.length;
    for (let i = 0; i < this.messageQueue.length; i++) {
      const queuedPriority = priorityOrder[this.messageQueue[i].priority];
      if (messagePriority < queuedPriority) {
        insertIndex = i;
        break;
      }
    }

    this.messageQueue.splice(insertIndex, 0, message);
  }

  /**
   * Check if batch should be flushed immediately
   */
  private shouldFlushBatch(): boolean {
    if (this.messageQueue.length === 0) {
      return false;
    }

    // Flush if batch size limit reached
    if (this.messageQueue.length >= this.config.maxBatchSize) {
      return true;
    }

    // Flush if total size is getting large
    const totalSize = this.messageQueue.reduce((sum, msg) => sum + msg.size, 0);
    if (totalSize >= 256 * 1024) {
      // 256KB
      return true;
    }

    // Flush if oldest message is too old
    const oldestMessage = this.messageQueue[0];
    if (
      oldestMessage &&
      Date.now() - oldestMessage.timestamp >= this.config.maxBatchDelay
    ) {
      return true;
    }

    // Flush if we have high priority messages waiting
    if (this.config.enablePrioritization) {
      const hasHighPriority = this.messageQueue.some(
        msg => msg.priority === 'high'
      );
      const hasNormalWithDelay = this.messageQueue.some(
        msg =>
          msg.priority === 'normal' &&
          Date.now() - msg.timestamp > this.config.maxBatchDelay / 2
      );

      if (hasHighPriority && hasNormalWithDelay) {
        return true;
      }
    }

    return false;
  }

  /**
   * Schedule a batch flush
   */
  private scheduleBatchFlush(): void {
    if (this.batchTimer) {
      return; // Timer already scheduled
    }

    this.batchTimer = setTimeout(() => {
      this.flush();
    }, this.config.maxBatchDelay);
  }

  /**
   * Clear the batch timer
   */
  private clearBatchTimer(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
  }

  /**
   * Flush the current batch
   */
  flush(): void {
    this.clearBatchTimer();

    if (this.messageQueue.length === 0) {
      return;
    }

    const batch = [...this.messageQueue];
    this.messageQueue.length = 0;
    this.metrics.queueLength = 0;

    this.sendBatch(batch);
  }

  /**
   * Send a batch of messages
   */
  private sendBatch(messages: QueuedMessage[]): void {
    const startTime = Date.now();

    if (messages.length === 1) {
      // Send single message directly
      const message = messages[0];
      this.socket.emit(message.event, message.data);
    } else {
      // Send as batch
      this.socket.emit('batch_messages', {
        messages: messages.map(msg => ({
          id: msg.id,
          event: msg.event,
          data: msg.data,
          compressed: msg.compressed,
          timestamp: msg.timestamp,
          sessionId: msg.sessionId,
        })),
        batchId: this.generateBatchId(),
        timestamp: Date.now(),
      });
    }

    // Update metrics
    const latency = Date.now() - startTime;
    this.metrics.batchesSent++;
    this.metrics.averageBatchSize =
      (this.metrics.averageBatchSize + messages.length) / 2;
    this.metrics.averageLatency = (this.metrics.averageLatency + latency) / 2;

    // Update compression ratio
    const compressedMessages = messages.filter(m => m.compressed).length;
    if (compressedMessages > 0) {
      this.metrics.compressionRatio = compressedMessages / messages.length;
    }

    this.lastBatchTime = Date.now();

    // Emit batch sent event
    this.emit('batch_sent', {
      messageCount: messages.length,
      totalSize: messages.reduce((sum, msg) => sum + msg.size, 0),
      latency,
    });
  }

  /**
   * Send a message immediately (bypass batching)
   */
  private sendImmediately(message: QueuedMessage): void {
    this.socket.emit(message.event, message.data);
    this.metrics.totalMessages++;

    this.emit('message_sent', {
      messageId: message.id,
      event: message.event,
      priority: message.priority,
      size: message.size,
    });
  }

  /**
   * Estimate the size of data
   */
  private estimateSize(data: any): number {
    if (Buffer.isBuffer(data)) {
      return data.length;
    }

    if (typeof data === 'string') {
      return Buffer.byteLength(data, 'utf8');
    }

    // Rough estimate for objects
    try {
      return Buffer.byteLength(JSON.stringify(data), 'utf8');
    } catch {
      return 1024; // Default estimate
    }
  }

  /**
   * Compress data
   */
  private compressData(data: any): any {
    try {
      const zlib = require('zlib');

      if (Buffer.isBuffer(data)) {
        return zlib.deflateSync(data);
      }

      if (typeof data === 'string') {
        return zlib.deflateSync(Buffer.from(data, 'utf8'));
      }

      if (typeof data === 'object') {
        const jsonString = JSON.stringify(data);
        const compressed = zlib.deflateSync(Buffer.from(jsonString, 'utf8'));
        return {
          __compressed: true,
          data: compressed.toString('base64'),
        };
      }

      return null;
    } catch (error) {
      console.warn('Compression failed:', error);
      return null;
    }
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique batch ID
   */
  private generateBatchId(): string {
    return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get current metrics
   */
  getMetrics(): BatchMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalMessages: 0,
      batchesSent: 0,
      averageBatchSize: 0,
      averageLatency: 0,
      compressionRatio: 1.0,
      queueLength: this.messageQueue.length,
      droppedMessages: 0,
    };
  }

  /**
   * Get current queue length
   */
  getQueueLength(): number {
    return this.messageQueue.length;
  }

  /**
   * Clear the message queue
   */
  clearQueue(): void {
    const droppedCount = this.messageQueue.length;
    this.messageQueue.length = 0;
    this.metrics.queueLength = 0;
    this.metrics.droppedMessages += droppedCount;
    this.clearBatchTimer();
  }

  /**
   * Get configuration
   */
  getConfig(): BatchConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<BatchConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Check if batcher is idle
   */
  isIdle(): boolean {
    return this.messageQueue.length === 0 && !this.batchTimer;
  }

  /**
   * Get time since last batch
   */
  getTimeSinceLastBatch(): number {
    return Date.now() - this.lastBatchTime;
  }

  /**
   * Destroy the batcher and clean up resources
   */
  destroy(): void {
    this.flush();
    this.clearBatchTimer();
    this.removeAllListeners();
  }
}

// Default configuration
export const defaultBatchConfig: BatchConfig = {
  maxBatchSize: 10,
  maxBatchDelay: 50, // 50ms
  enablePrioritization: true,
  compressionThreshold: 1024, // 1KB
  enableCompression: true,
};

// Batcher factory
export class MessageBatcherFactory {
  private batchers = new Map<string, MessageBatcher>();

  /**
   * Get or create a batcher for a socket
   */
  getBatcher(socket: Socket, config?: BatchConfig): MessageBatcher {
    const socketId = socket.id;

    if (this.batchers.has(socketId)) {
      return this.batchers.get(socketId)!;
    }

    const batcher = new MessageBatcher(socket, config || defaultBatchConfig);
    this.batchers.set(socketId, batcher);

    // Clean up when socket disconnects
    socket.on('disconnect', () => {
      this.removeBatcher(socketId);
    });

    return batcher;
  }

  /**
   * Remove a batcher
   */
  removeBatcher(socketId: string): void {
    const batcher = this.batchers.get(socketId);
    if (batcher) {
      batcher.destroy();
      this.batchers.delete(socketId);
    }
  }

  /**
   * Get all active batchers
   */
  getAllBatchers(): MessageBatcher[] {
    return Array.from(this.batchers.values());
  }

  /**
   * Get metrics for all batchers
   */
  getAggregatedMetrics(): BatchMetrics {
    const allMetrics = this.getAllBatchers().map(batcher =>
      batcher.getMetrics()
    );

    if (allMetrics.length === 0) {
      return {
        totalMessages: 0,
        batchesSent: 0,
        averageBatchSize: 0,
        averageLatency: 0,
        compressionRatio: 1.0,
        queueLength: 0,
        droppedMessages: 0,
      };
    }

    return {
      totalMessages: allMetrics.reduce((sum, m) => sum + m.totalMessages, 0),
      batchesSent: allMetrics.reduce((sum, m) => sum + m.batchesSent, 0),
      averageBatchSize:
        allMetrics.reduce((sum, m) => sum + m.averageBatchSize, 0) /
        allMetrics.length,
      averageLatency:
        allMetrics.reduce((sum, m) => sum + m.averageLatency, 0) /
        allMetrics.length,
      compressionRatio:
        allMetrics.reduce((sum, m) => sum + m.compressionRatio, 0) /
        allMetrics.length,
      queueLength: allMetrics.reduce((sum, m) => sum + m.queueLength, 0),
      droppedMessages: allMetrics.reduce(
        (sum, m) => sum + m.droppedMessages,
        0
      ),
    };
  }

  /**
   * Flush all batchers
   */
  flushAll(): void {
    for (const batcher of Array.from(this.batchers.values())) {
      batcher.flush();
    }
  }

  /**
   * Destroy all batchers
   */
  destroyAll(): void {
    for (const batcher of Array.from(this.batchers.values())) {
      batcher.destroy();
    }
    this.batchers.clear();
  }
}

// Singleton instance
let batcherFactory: MessageBatcherFactory | null = null;

export function getMessageBatcherFactory(): MessageBatcherFactory {
  if (!batcherFactory) {
    batcherFactory = new MessageBatcherFactory();
  }
  return batcherFactory;
}

export function resetMessageBatcherFactory(): void {
  if (batcherFactory) {
    batcherFactory.destroyAll();
  }
  batcherFactory = null;
}
