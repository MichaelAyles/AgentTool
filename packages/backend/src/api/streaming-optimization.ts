import { Router } from 'express';
import { authenticate } from '../auth/middleware.js';
import { requireAdmin, requirePermission } from '../auth/permissions.js';
import { getOutputStreamOptimizer, defaultStreamingConfig } from '../streaming/output-optimizer.js';
import { getMessageBatcherFactory, defaultBatchConfig } from '../streaming/message-batcher.js';
import { comprehensiveAuditLogger, AuditCategory } from '../security/audit-logger.js';
import { SecurityLevel } from '../security/types.js';

const router = Router();

// Simple input sanitization function
const sanitizeInput = (input: string): string => {
  if (typeof input !== 'string') return '';
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim();
};

/**
 * Get streaming optimization metrics
 */
router.get('/metrics', authenticate, requirePermission('system', 'read'), async (req, res) => {
  try {
    const streamOptimizer = getOutputStreamOptimizer();
    const batcherFactory = getMessageBatcherFactory();

    const streamingMetrics = streamOptimizer.getMetrics();
    const batchingMetrics = batcherFactory.getAggregatedMetrics();

    const combinedMetrics = {
      streaming: {
        ...streamingMetrics,
        efficiency: streamingMetrics.compressionRatio * (1 - streamingMetrics.bufferUtilization),
        status: streamingMetrics.bufferUtilization > 0.9 ? 'overloaded' : 
                streamingMetrics.bufferUtilization > 0.7 ? 'busy' : 'healthy',
      },
      batching: {
        ...batchingMetrics,
        efficiency: batchingMetrics.averageBatchSize / 10, // Normalized to max batch size
        status: batchingMetrics.queueLength > 100 ? 'overloaded' :
                batchingMetrics.queueLength > 50 ? 'busy' : 'healthy',
      },
      overall: {
        totalDataProcessed: streamingMetrics.totalBytes,
        totalMessages: batchingMetrics.totalMessages,
        overallLatency: (streamingMetrics.averageLatency + batchingMetrics.averageLatency) / 2,
        healthScore: calculateHealthScore(streamingMetrics, batchingMetrics),
      },
      timestamp: new Date().toISOString(),
    };

    res.json({
      success: true,
      metrics: combinedMetrics,
    });
  } catch (error) {
    console.error('Error getting streaming metrics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get streaming metrics',
    });
  }
});

/**
 * Get streaming configuration
 */
router.get('/config', authenticate, requirePermission('system', 'read'), async (req, res) => {
  try {
    const streamOptimizer = getOutputStreamOptimizer();
    const batcherFactory = getMessageBatcherFactory();

    const config = {
      streaming: streamOptimizer.getConfig(),
      batching: defaultBatchConfig, // Using default as factory doesn't store global config
      defaults: {
        streaming: defaultStreamingConfig,
        batching: defaultBatchConfig,
      },
    };

    res.json({
      success: true,
      config,
    });
  } catch (error) {
    console.error('Error getting streaming config:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get streaming configuration',
    });
  }
});

/**
 * Update streaming configuration (admin only)
 */
router.put('/config', authenticate, requireAdmin(), async (req, res) => {
  try {
    const { streaming, batching } = req.body;
    const userId = req.user?.id;

    const streamOptimizer = getOutputStreamOptimizer();

    // Update streaming config if provided
    if (streaming) {
      const sanitizedStreamingConfig = sanitizeStreamingConfig(streaming);
      streamOptimizer.updateConfig(sanitizedStreamingConfig);
    }

    // Note: Batching config updates would require recreating batchers
    // This is left as an exercise for production implementation

    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'streaming_config_updated',
      resourceType: 'streaming_system',
      userId,
      sessionId: (req as any).session?.id || (req as any).sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: 'success',
      severity: SecurityLevel.MODERATE,
      details: {
        streamingConfigUpdated: !!streaming,
        batchingConfigUpdated: !!batching,
        changes: { streaming, batching },
      },
    });

    res.json({
      success: true,
      message: 'Streaming configuration updated successfully',
    });
  } catch (error) {
    console.error('Error updating streaming config:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update streaming configuration',
    });
  }
});

/**
 * Get session-specific streaming status
 */
router.get('/sessions/:sessionId/status', authenticate, requirePermission('session', 'read'), async (req, res) => {
  try {
    const { sessionId } = req.params;
    const sanitizedSessionId = sanitizeInput(sessionId);
    
    const streamOptimizer = getOutputStreamOptimizer();
    const bufferStatus = streamOptimizer.getSessionBufferStatus(sanitizedSessionId);

    if (!bufferStatus) {
      return res.status(404).json({
        success: false,
        message: 'Session not found in streaming optimizer',
      });
    }

    res.json({
      success: true,
      sessionId: sanitizedSessionId,
      status: bufferStatus,
    });
  } catch (error) {
    console.error('Error getting session streaming status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get session streaming status',
    });
  }
});

/**
 * Force flush a session's buffer
 */
router.post('/sessions/:sessionId/flush', authenticate, requirePermission('session', 'write'), async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user?.id;
    const sanitizedSessionId = sanitizeInput(sessionId);
    
    const streamOptimizer = getOutputStreamOptimizer();
    const success = streamOptimizer.flushSessionNow(sanitizedSessionId);

    if (!success) {
      return res.status(404).json({
        success: false,
        message: 'Session not found or no data to flush',
      });
    }

    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'session_buffer_flushed',
      resourceType: 'streaming_session',
      resourceId: sessionId,
      userId,
      sessionId: (req as any).session?.id || (req as any).sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: 'success',
      severity: SecurityLevel.SAFE,
      details: {
        targetSessionId: sessionId,
      },
    });

    res.json({
      success: true,
      message: 'Session buffer flushed successfully',
    });
  } catch (error) {
    console.error('Error flushing session buffer:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to flush session buffer',
    });
  }
});

/**
 * Force flush all buffers (admin only)
 */
router.post('/flush-all', authenticate, requireAdmin(), async (req, res) => {
  try {
    const userId = req.user?.id;
    
    const streamOptimizer = getOutputStreamOptimizer();
    const batcherFactory = getMessageBatcherFactory();

    // Flush all streaming buffers
    streamOptimizer.flushAll();
    
    // Flush all message batchers
    batcherFactory.flushAll();

    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'all_buffers_flushed',
      resourceType: 'streaming_system',
      userId,
      sessionId: (req as any).session?.id || (req as any).sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: 'success',
      severity: SecurityLevel.MODERATE,
      details: {
        reason: 'admin_manual_flush',
      },
    });

    res.json({
      success: true,
      message: 'All buffers flushed successfully',
    });
  } catch (error) {
    console.error('Error flushing all buffers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to flush all buffers',
    });
  }
});

/**
 * Reset streaming metrics (admin only)
 */
router.post('/metrics/reset', authenticate, requireAdmin(), async (req, res) => {
  try {
    const userId = req.user?.id;
    
    const streamOptimizer = getOutputStreamOptimizer();
    streamOptimizer.resetMetrics();

    // Note: Resetting batcher metrics would require access to all batchers
    // This could be implemented with a factory method

    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'streaming_metrics_reset',
      resourceType: 'streaming_system',
      userId,
      sessionId: (req as any).session?.id || (req as any).sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: 'success',
      severity: SecurityLevel.SAFE,
      details: {
        resetBy: 'admin',
      },
    });

    res.json({
      success: true,
      message: 'Streaming metrics reset successfully',
    });
  } catch (error) {
    console.error('Error resetting streaming metrics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset streaming metrics',
    });
  }
});

/**
 * Get performance recommendations
 */
router.get('/recommendations', authenticate, requirePermission('system', 'read'), async (req, res) => {
  try {
    const streamOptimizer = getOutputStreamOptimizer();
    const batcherFactory = getMessageBatcherFactory();

    const streamingMetrics = streamOptimizer.getMetrics();
    const batchingMetrics = batcherFactory.getAggregatedMetrics();
    const streamingConfig = streamOptimizer.getConfig();

    const recommendations = generatePerformanceRecommendations(
      streamingMetrics,
      batchingMetrics,
      streamingConfig
    );

    res.json({
      success: true,
      recommendations,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error generating recommendations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate performance recommendations',
    });
  }
});

/**
 * Get real-time streaming status
 */
router.get('/status', authenticate, requirePermission('system', 'read'), async (req, res) => {
  try {
    const streamOptimizer = getOutputStreamOptimizer();
    const batcherFactory = getMessageBatcherFactory();

    const streamingMetrics = streamOptimizer.getMetrics();
    const batchingMetrics = batcherFactory.getAggregatedMetrics();
    const allBatchers = batcherFactory.getAllBatchers();

    const status = {
      streaming: {
        healthy: streamingMetrics.bufferUtilization < 0.9 && streamingMetrics.averageLatency < 100,
        bufferUtilization: streamingMetrics.bufferUtilization,
        throughput: streamingMetrics.throughput,
        compressionRatio: streamingMetrics.compressionRatio,
      },
      batching: {
        healthy: batchingMetrics.queueLength < 100 && batchingMetrics.averageLatency < 50,
        activeBatchers: allBatchers.length,
        totalQueueLength: batchingMetrics.queueLength,
        averageBatchSize: batchingMetrics.averageBatchSize,
      },
      overall: {
        healthy: streamingMetrics.bufferUtilization < 0.9 && 
                batchingMetrics.queueLength < 100 &&
                (streamingMetrics.averageLatency + batchingMetrics.averageLatency) / 2 < 75,
        uptime: Date.now(), // This should track actual uptime
        totalDataProcessed: streamingMetrics.totalBytes,
        totalMessages: batchingMetrics.totalMessages,
      },
      timestamp: new Date().toISOString(),
    };

    res.json({
      success: true,
      status,
    });
  } catch (error) {
    console.error('Error getting streaming status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get streaming status',
    });
  }
});

/**
 * Calculate overall health score
 */
function calculateHealthScore(streamingMetrics: any, batchingMetrics: any): number {
  let score = 100;

  // Streaming penalties
  if (streamingMetrics.bufferUtilization > 0.9) score -= 30;
  else if (streamingMetrics.bufferUtilization > 0.7) score -= 15;

  if (streamingMetrics.averageLatency > 100) score -= 20;
  else if (streamingMetrics.averageLatency > 50) score -= 10;

  // Batching penalties
  if (batchingMetrics.queueLength > 100) score -= 25;
  else if (batchingMetrics.queueLength > 50) score -= 10;

  if (batchingMetrics.averageLatency > 50) score -= 15;
  else if (batchingMetrics.averageLatency > 25) score -= 5;

  // Compression bonus
  if (streamingMetrics.compressionRatio < 0.8) score += 5;
  if (batchingMetrics.compressionRatio < 0.8) score += 5;

  return Math.max(0, Math.min(100, score));
}

/**
 * Generate performance recommendations
 */
function generatePerformanceRecommendations(
  streamingMetrics: any,
  batchingMetrics: any,
  streamingConfig: any
): Array<{ type: string; priority: string; message: string; action?: string }> {
  const recommendations = [];

  // Streaming recommendations
  if (streamingMetrics.bufferUtilization > 0.9) {
    recommendations.push({
      type: 'streaming',
      priority: 'high',
      message: 'Buffer utilization is very high. Consider reducing buffer size or increasing flush frequency.',
      action: 'reduce_buffer_size',
    });
  }

  if (streamingMetrics.averageLatency > 100) {
    recommendations.push({
      type: 'streaming',
      priority: 'medium',
      message: 'Average streaming latency is high. Consider optimizing compression or reducing chunk size.',
      action: 'optimize_latency',
    });
  }

  if (streamingMetrics.compressionRatio > 0.9) {
    recommendations.push({
      type: 'streaming',
      priority: 'low',
      message: 'Compression ratio is low. Consider adjusting compression threshold or algorithm.',
      action: 'improve_compression',
    });
  }

  // Batching recommendations
  if (batchingMetrics.queueLength > 100) {
    recommendations.push({
      type: 'batching',
      priority: 'high',
      message: 'Message queue length is very high. Consider reducing batch delay or increasing batch size.',
      action: 'optimize_batching',
    });
  }

  if (batchingMetrics.averageBatchSize < 3) {
    recommendations.push({
      type: 'batching',
      priority: 'medium',
      message: 'Average batch size is small. Consider increasing batch delay to improve efficiency.',
      action: 'increase_batch_delay',
    });
  }

  // Configuration recommendations
  if (streamingConfig.bufferSize > 128 * 1024 && streamingMetrics.bufferUtilization < 0.3) {
    recommendations.push({
      type: 'configuration',
      priority: 'low',
      message: 'Buffer size might be too large for current usage. Consider reducing to save memory.',
      action: 'reduce_buffer_size',
    });
  }

  return recommendations;
}

/**
 * Sanitize streaming configuration
 */
function sanitizeStreamingConfig(config: any): any {
  return {
    bufferSize: Math.max(1024, Math.min(1024 * 1024, parseInt(config.bufferSize) || 64 * 1024)),
    flushInterval: Math.max(10, Math.min(5000, parseInt(config.flushInterval) || 100)),
    compressionThreshold: Math.max(256, Math.min(64 * 1024, parseInt(config.compressionThreshold) || 1024)),
    maxChunkSize: Math.max(1024, Math.min(256 * 1024, parseInt(config.maxChunkSize) || 32 * 1024)),
    enableCompression: Boolean(config.enableCompression),
    enableBatching: Boolean(config.enableBatching),
    enableDeltaCompression: Boolean(config.enableDeltaCompression),
  };
}

export default router;