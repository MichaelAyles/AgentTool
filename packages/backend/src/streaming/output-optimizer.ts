import { EventEmitter } from 'events';
import { Buffer } from 'buffer';

export interface StreamingConfig {
  bufferSize: number;
  flushInterval: number;
  compressionThreshold: number;
  maxChunkSize: number;
  enableCompression: boolean;
  enableBatching: boolean;
  enableDeltaCompression: boolean;
}

export interface OutputChunk {
  id: string;
  sessionId: string;
  timestamp: number;
  data: Buffer;
  type: 'stdout' | 'stderr' | 'system';
  compressed?: boolean;
  delta?: boolean;
  size: number;
}

export interface StreamingMetrics {
  totalBytes: number;
  compressedBytes: number;
  chunksProcessed: number;
  compressionRatio: number;
  averageLatency: number;
  throughput: number;
  bufferUtilization: number;
}

export class OutputStreamOptimizer extends EventEmitter {
  private buffers = new Map<string, Buffer[]>();
  private lastFlush = new Map<string, number>();
  private compressionCache = new Map<string, Buffer>();
  private lastOutput = new Map<string, Buffer>();
  private metrics: StreamingMetrics;
  private flushTimers = new Map<string, NodeJS.Timeout>();

  constructor(private config: StreamingConfig) {
    super();
    this.metrics = {
      totalBytes: 0,
      compressedBytes: 0,
      chunksProcessed: 0,
      compressionRatio: 1.0,
      averageLatency: 0,
      throughput: 0,
      bufferUtilization: 0,
    };

    // Cleanup timer
    setInterval(() => this.cleanupStaleBuffers(), 60000);
  }

  /**
   * Add output data to the streaming pipeline
   */
  addOutput(
    sessionId: string,
    data: Buffer | string,
    type: 'stdout' | 'stderr' | 'system' = 'stdout'
  ): void {
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    const startTime = Date.now();

    // Initialize session buffer if needed
    if (!this.buffers.has(sessionId)) {
      this.buffers.set(sessionId, []);
      this.lastFlush.set(sessionId, Date.now());
    }

    const sessionBuffers = this.buffers.get(sessionId)!;
    sessionBuffers.push(buffer);

    // Update metrics
    this.metrics.totalBytes += buffer.length;
    this.metrics.chunksProcessed++;

    // Check if we should flush immediately
    const totalBufferSize = sessionBuffers.reduce(
      (sum, buf) => sum + buf.length,
      0
    );
    const timeSinceLastFlush = Date.now() - this.lastFlush.get(sessionId)!;

    if (
      totalBufferSize >= this.config.bufferSize ||
      timeSinceLastFlush >= this.config.flushInterval ||
      !this.config.enableBatching
    ) {
      this.flushSession(sessionId, type);
    } else {
      // Set flush timer if not already set
      if (!this.flushTimers.has(sessionId)) {
        const timer = setTimeout(() => {
          this.flushSession(sessionId, type);
          this.flushTimers.delete(sessionId);
        }, this.config.flushInterval);
        this.flushTimers.set(sessionId, timer);
      }
    }

    // Update latency metrics
    const latency = Date.now() - startTime;
    this.metrics.averageLatency = (this.metrics.averageLatency + latency) / 2;
  }

  /**
   * Flush buffered output for a session
   */
  private flushSession(
    sessionId: string,
    type: 'stdout' | 'stderr' | 'system'
  ): void {
    const sessionBuffers = this.buffers.get(sessionId);
    if (!sessionBuffers || sessionBuffers.length === 0) {
      return;
    }

    // Combine all buffers
    const combinedBuffer = Buffer.concat(sessionBuffers);

    // Clear session buffers
    sessionBuffers.length = 0;
    this.lastFlush.set(sessionId, Date.now());

    // Clear flush timer
    const timer = this.flushTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.flushTimers.delete(sessionId);
    }

    // Process the combined buffer
    this.processChunk(sessionId, combinedBuffer, type);
  }

  /**
   * Process a chunk of output data
   */
  private processChunk(
    sessionId: string,
    data: Buffer,
    type: 'stdout' | 'stderr' | 'system'
  ): void {
    let processedData = data;
    let compressed = false;
    let delta = false;

    // Apply delta compression if enabled
    if (this.config.enableDeltaCompression) {
      const deltaResult = this.applyDeltaCompression(sessionId, data);
      if (deltaResult) {
        processedData = deltaResult;
        delta = true;
      }
    }

    // Apply compression if enabled and data is large enough
    if (
      this.config.enableCompression &&
      processedData.length >= this.config.compressionThreshold
    ) {
      const compressedResult = this.compressData(processedData);
      if (compressedResult && compressedResult.length < processedData.length) {
        processedData = compressedResult;
        compressed = true;
        this.metrics.compressedBytes += processedData.length;
      }
    }

    // Split into chunks if too large
    const chunks = this.splitIntoChunks(
      processedData,
      sessionId,
      type,
      compressed,
      delta
    );

    // Emit chunks
    for (const chunk of chunks) {
      this.emit('chunk', chunk);
    }

    // Update metrics
    this.updateThroughputMetrics();
    this.updateCompressionRatio();
  }

  /**
   * Apply delta compression by comparing with last output
   */
  private applyDeltaCompression(
    sessionId: string,
    data: Buffer
  ): Buffer | null {
    const lastOutput = this.lastOutput.get(sessionId);
    if (!lastOutput) {
      this.lastOutput.set(sessionId, data);
      return null;
    }

    // Simple delta: only send changes
    const delta = this.computeDelta(lastOutput, data);
    this.lastOutput.set(sessionId, data);

    // Only use delta if it's significantly smaller
    if (delta.length < data.length * 0.7) {
      return delta;
    }

    return null;
  }

  /**
   * Compute delta between two buffers
   */
  private computeDelta(oldData: Buffer, newData: Buffer): Buffer {
    // Simple implementation - in practice, you'd use a more sophisticated diff algorithm
    const commonPrefix = this.findCommonPrefix(oldData, newData);
    const commonSuffix = this.findCommonSuffix(oldData, newData);

    const deltaStart = commonPrefix;
    const deltaEnd = newData.length - commonSuffix;

    if (deltaStart >= deltaEnd) {
      return Buffer.alloc(0);
    }

    // Create delta packet: [operation][position][length][data]
    const operation = Buffer.from([0x01]); // REPLACE operation
    const position = Buffer.allocUnsafe(4);
    const length = Buffer.allocUnsafe(4);

    position.writeUInt32BE(deltaStart, 0);
    length.writeUInt32BE(deltaEnd - deltaStart, 0);

    const deltaData = newData.subarray(deltaStart, deltaEnd);

    return Buffer.concat([operation, position, length, deltaData]);
  }

  /**
   * Find common prefix between two buffers
   */
  private findCommonPrefix(a: Buffer, b: Buffer): number {
    const maxLength = Math.min(a.length, b.length);
    for (let i = 0; i < maxLength; i++) {
      if (a[i] !== b[i]) {
        return i;
      }
    }
    return maxLength;
  }

  /**
   * Find common suffix between two buffers
   */
  private findCommonSuffix(a: Buffer, b: Buffer): number {
    const maxLength = Math.min(a.length, b.length);
    for (let i = 0; i < maxLength; i++) {
      if (a[a.length - 1 - i] !== b[b.length - 1 - i]) {
        return i;
      }
    }
    return maxLength;
  }

  /**
   * Compress data using gzip-like compression
   */
  private compressData(data: Buffer): Buffer | null {
    try {
      const zlib = require('zlib');
      return zlib.deflateSync(data);
    } catch (error) {
      console.warn('Compression failed:', error);
      return null;
    }
  }

  /**
   * Split data into appropriately sized chunks
   */
  private splitIntoChunks(
    data: Buffer,
    sessionId: string,
    type: 'stdout' | 'stderr' | 'system',
    compressed: boolean,
    delta: boolean
  ): OutputChunk[] {
    const chunks: OutputChunk[] = [];
    const maxSize = this.config.maxChunkSize;

    for (let offset = 0; offset < data.length; offset += maxSize) {
      const chunkData = data.subarray(
        offset,
        Math.min(offset + maxSize, data.length)
      );

      const chunk: OutputChunk = {
        id: this.generateChunkId(),
        sessionId,
        timestamp: Date.now(),
        data: chunkData,
        type,
        compressed,
        delta,
        size: chunkData.length,
      };

      chunks.push(chunk);
    }

    return chunks;
  }

  /**
   * Generate unique chunk ID
   */
  private generateChunkId(): string {
    return `chunk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Update throughput metrics
   */
  private updateThroughputMetrics(): void {
    const now = Date.now();
    // Simple throughput calculation - in practice, you'd use a sliding window
    this.metrics.throughput =
      this.metrics.totalBytes / ((now - (now - 60000)) / 1000);
  }

  /**
   * Update compression ratio
   */
  private updateCompressionRatio(): void {
    if (this.metrics.totalBytes > 0) {
      this.metrics.compressionRatio =
        this.metrics.compressedBytes / this.metrics.totalBytes;
    }
  }

  /**
   * Clean up stale buffers and data
   */
  private cleanupStaleBuffers(): void {
    const now = Date.now();
    const staleThreshold = 5 * 60 * 1000; // 5 minutes

    for (const [sessionId, lastFlushTime] of Array.from(
      this.lastFlush.entries()
    )) {
      if (now - lastFlushTime > staleThreshold) {
        // Force flush any remaining data
        this.flushSession(sessionId, 'system');

        // Clean up session data
        this.buffers.delete(sessionId);
        this.lastFlush.delete(sessionId);
        this.lastOutput.delete(sessionId);

        const timer = this.flushTimers.get(sessionId);
        if (timer) {
          clearTimeout(timer);
          this.flushTimers.delete(sessionId);
        }
      }
    }

    // Update buffer utilization
    const totalBufferSize = Array.from(this.buffers.values()).reduce(
      (sum, buffers) => sum + buffers.reduce((s, b) => s + b.length, 0),
      0
    );

    this.metrics.bufferUtilization =
      totalBufferSize / (this.config.bufferSize * this.buffers.size || 1);
  }

  /**
   * Force flush all sessions
   */
  flushAll(): void {
    for (const sessionId of Array.from(this.buffers.keys())) {
      this.flushSession(sessionId, 'system');
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): StreamingMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalBytes: 0,
      compressedBytes: 0,
      chunksProcessed: 0,
      compressionRatio: 1.0,
      averageLatency: 0,
      throughput: 0,
      bufferUtilization: 0,
    };
  }

  /**
   * Get configuration
   */
  getConfig(): StreamingConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<StreamingConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get buffer status for a session
   */
  getSessionBufferStatus(sessionId: string): {
    bufferSize: number;
    chunkCount: number;
    lastFlush: number;
    hasPendingFlush: boolean;
  } | null {
    const buffers = this.buffers.get(sessionId);
    const lastFlush = this.lastFlush.get(sessionId);

    if (!buffers || lastFlush === undefined) {
      return null;
    }

    return {
      bufferSize: buffers.reduce((sum, buf) => sum + buf.length, 0),
      chunkCount: buffers.length,
      lastFlush,
      hasPendingFlush: this.flushTimers.has(sessionId),
    };
  }

  /**
   * Force flush a specific session
   */
  flushSessionNow(sessionId: string): boolean {
    if (!this.buffers.has(sessionId)) {
      return false;
    }

    this.flushSession(sessionId, 'system');
    return true;
  }

  /**
   * Remove a session and clean up its resources
   */
  removeSession(sessionId: string): void {
    // Force flush any remaining data
    this.flushSession(sessionId, 'system');

    // Clean up all session data
    this.buffers.delete(sessionId);
    this.lastFlush.delete(sessionId);
    this.lastOutput.delete(sessionId);
    this.compressionCache.delete(sessionId);

    const timer = this.flushTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.flushTimers.delete(sessionId);
    }
  }
}

// Default configuration
export const defaultStreamingConfig: StreamingConfig = {
  bufferSize: 64 * 1024, // 64KB buffer
  flushInterval: 100, // 100ms flush interval
  compressionThreshold: 1024, // Compress if > 1KB
  maxChunkSize: 32 * 1024, // 32KB max chunk size
  enableCompression: true,
  enableBatching: true,
  enableDeltaCompression: false, // Disabled by default as it's experimental
};

// Singleton instance
let optimizerInstance: OutputStreamOptimizer | null = null;

export function getOutputStreamOptimizer(
  config?: StreamingConfig
): OutputStreamOptimizer {
  if (!optimizerInstance) {
    optimizerInstance = new OutputStreamOptimizer(
      config || defaultStreamingConfig
    );
  }
  return optimizerInstance;
}

export function resetOutputStreamOptimizer(): void {
  if (optimizerInstance) {
    optimizerInstance.flushAll();
    optimizerInstance.removeAllListeners();
  }
  optimizerInstance = null;
}
