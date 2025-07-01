import { Router } from 'express';
import { authenticate } from '../auth/middleware.js';
import { requireAdmin, requirePermission } from '../auth/permissions.js';
import { getConnectionPool } from '../websocket/connection-pool.js';
import { getEnhancedMessageBatcher, createEnhancedMessageBatcher } from '../websocket/enhanced-message-batcher.js';
import { getPoolOptimizer, createPoolOptimizer } from '../websocket/pool-optimizer.js';
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
 * Get comprehensive connection pool and batching metrics
 */
router.get('/metrics', authenticate, requirePermission('system', 'read'), async (req, res) => {
  try {
    const connectionPool = getConnectionPool();
    const poolStats = connectionPool.getStatistics();

    let batcherMetrics = null;
    let optimizerMetrics = null;

    try {
      const batcher = getEnhancedMessageBatcher();
      batcherMetrics = batcher.getMetrics();
    } catch (error) {
      // Batcher might not be initialized
    }

    try {
      const optimizer = getPoolOptimizer();
      optimizerMetrics = optimizer.getMetrics();
    } catch (error) {
      // Optimizer might not be initialized
    }

    const combinedMetrics = {
      connectionPool: {
        ...poolStats,
        healthStatus: calculatePoolHealth(poolStats),
      },
      messageBatcher: batcherMetrics ? {
        ...batcherMetrics,
        efficiency: calculateBatchingEfficiency(batcherMetrics),
      } : null,
      poolOptimizer: optimizerMetrics ? {
        ...optimizerMetrics,
        status: optimizerMetrics.totalOptimizations > 0 ? 'active' : 'idle',
      } : null,
      overall: {
        systemHealth: calculateOverallHealth(poolStats, batcherMetrics, optimizerMetrics),
        performanceScore: calculatePerformanceScore(poolStats, batcherMetrics),
        optimization: {
          enabled: !!optimizerMetrics,
          lastRun: optimizerMetrics?.lastOptimization,
          recommendations: optimizerMetrics?.recommendations?.length || 0,
        },
      },
      timestamp: new Date().toISOString(),
    };

    res.json({
      success: true,
      metrics: combinedMetrics,
    });
  } catch (error) {
    console.error('Error getting connection optimization metrics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get connection optimization metrics',
    });
  }
});

/**
 * Get detailed connection analytics
 */
router.get('/analytics', authenticate, requirePermission('system', 'read'), async (req, res) => {
  try {
    const { timeRange = '1h', groupBy = 'user' } = req.query;
    const connectionPool = getConnectionPool();

    const analytics = {
      connectionDistribution: analyzeConnectionDistribution(connectionPool, groupBy as string),
      performanceTrends: analyzePerformanceTrends(connectionPool, timeRange as string),
      qualityMetrics: analyzeQualityMetrics(connectionPool),
      resourceUtilization: analyzeResourceUtilization(connectionPool),
      recommendations: generatePerformanceRecommendations(connectionPool),
    };

    res.json({
      success: true,
      analytics,
      timeRange,
      groupBy,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error getting connection analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get connection analytics',
    });
  }
});

/**
 * Initialize or update message batcher configuration
 */
router.post('/batcher/configure', authenticate, requireAdmin(), async (req, res) => {
  try {
    const { config } = req.body;
    const userId = req.user?.id;

    // Validate and sanitize config
    const sanitizedConfig = sanitizeBatcherConfig(config);

    // Get or create batcher
    let batcher;
    try {
      batcher = getEnhancedMessageBatcher();
      batcher.updateConfig(sanitizedConfig);
    } catch (error) {
      batcher = createEnhancedMessageBatcher(sanitizedConfig);
    }

    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'message_batcher_configured',
      resourceType: 'message_batcher',
      userId,
      sessionId: (req as any).session?.id || (req as any).sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: 'success',
      severity: SecurityLevel.MODERATE,
      details: {
        configuration: sanitizedConfig,
      },
    });

    res.json({
      success: true,
      message: 'Message batcher configured successfully',
      config: batcher.getConfig ? batcher.getConfig() : sanitizedConfig,
    });
  } catch (error) {
    console.error('Error configuring message batcher:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to configure message batcher',
    });
  }
});

/**
 * Initialize or update pool optimizer configuration
 */
router.post('/optimizer/configure', authenticate, requireAdmin(), async (req, res) => {
  try {
    const { config } = req.body;
    const userId = req.user?.id;

    // Validate and sanitize config
    const sanitizedConfig = sanitizeOptimizerConfig(config);

    // Get or create optimizer
    let optimizer;
    try {
      optimizer = getPoolOptimizer();
      optimizer.updateConfig(sanitizedConfig);
    } catch (error) {
      optimizer = createPoolOptimizer(sanitizedConfig);
    }

    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'pool_optimizer_configured',
      resourceType: 'pool_optimizer',
      userId,
      sessionId: (req as any).session?.id || (req as any).sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: 'success',
      severity: SecurityLevel.MODERATE,
      details: {
        configuration: sanitizedConfig,
      },
    });

    res.json({
      success: true,
      message: 'Pool optimizer configured successfully',
      config: sanitizedConfig,
    });
  } catch (error) {
    console.error('Error configuring pool optimizer:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to configure pool optimizer',
    });
  }
});

/**
 * Force flush all message batchers
 */
router.post('/batcher/flush', authenticate, requirePermission('system', 'write'), async (req, res) => {
  try {
    const batcher = getEnhancedMessageBatcher();
    batcher.flushAll();

    const userId = req.user?.id;
    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'message_batcher_flushed',
      resourceType: 'message_batcher',
      userId,
      sessionId: (req as any).session?.id || (req as any).sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: 'success',
      severity: SecurityLevel.SAFE,
      details: {},
    });

    res.json({
      success: true,
      message: 'All message batchers flushed successfully',
    });
  } catch (error) {
    console.error('Error flushing message batchers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to flush message batchers',
    });
  }
});

/**
 * Force run pool optimization
 */
router.post('/optimizer/optimize', authenticate, requireAdmin(), async (req, res) => {
  try {
    const optimizer = getPoolOptimizer();
    await optimizer.performOptimization();

    const userId = req.user?.id;
    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'pool_optimization_triggered',
      resourceType: 'pool_optimizer',
      userId,
      sessionId: (req as any).session?.id || (req as any).sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: 'success',
      severity: SecurityLevel.MODERATE,
      details: {},
    });

    const metrics = optimizer.getMetrics();
    res.json({
      success: true,
      message: 'Pool optimization completed successfully',
      metrics,
    });
  } catch (error) {
    console.error('Error running pool optimization:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to run pool optimization',
    });
  }
});

/**
 * Cleanup connections based on criteria
 */
router.post('/connections/cleanup', authenticate, requireAdmin(), async (req, res) => {
  try {
    const { 
      maxIdleTime = 300000, // 5 minutes
      maxLatency = 1000,    // 1 second
      minQuality = 'fair'   // fair or better
    } = req.body;

    const optimizer = getPoolOptimizer();
    
    // Map quality string to enum
    const qualityMap: any = {
      'excellent': 'excellent',
      'good': 'good',
      'fair': 'fair',
      'poor': 'poor',
      'degraded': 'degraded',
    };

    const cleanedCount = optimizer.cleanupConnections({
      maxIdleTime: parseInt(maxIdleTime as string),
      maxLatency: parseInt(maxLatency as string),
      minQuality: qualityMap[minQuality],
    });

    const userId = req.user?.id;
    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'connections_cleaned',
      resourceType: 'connection_pool',
      userId,
      sessionId: (req as any).session?.id || (req as any).sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: 'success',
      severity: SecurityLevel.MODERATE,
      details: {
        cleanedCount,
        criteria: { maxIdleTime, maxLatency, minQuality },
      },
    });

    res.json({
      success: true,
      message: `Cleaned up ${cleanedCount} connections`,
      cleanedCount,
    });
  } catch (error) {
    console.error('Error cleaning up connections:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cleanup connections',
    });
  }
});

/**
 * Get real-time connection monitoring data
 */
router.get('/monitor', authenticate, requirePermission('system', 'read'), async (req, res) => {
  try {
    const connectionPool = getConnectionPool();
    const poolStats = connectionPool.getStatistics();

    const monitoringData = {
      connectionPool: {
        status: poolStats.poolEfficiency > 0.9 ? 'overloaded' : 
                poolStats.poolEfficiency > 0.7 ? 'busy' : 'healthy',
        totalConnections: poolStats.totalConnections,
        activeConnections: poolStats.activeConnections,
        poolEfficiency: Math.round(poolStats.poolEfficiency * 100),
        averageLatency: Math.round(poolStats.averagePingLatency),
      },
      performance: {
        messagesPerSecond: Math.round(poolStats.messagesPerSecond),
        dataTransferRate: formatBytes(poolStats.totalDataTransferred),
        uptime: formatDuration(poolStats.uptime),
      },
      quality: {
        distribution: poolStats.connectionsByQuality,
        averageQuality: calculateAverageQuality(poolStats.connectionsByQuality),
      },
      alerts: generateSystemAlerts(poolStats),
      timestamp: new Date().toISOString(),
    };

    res.json({
      success: true,
      monitoring: monitoringData,
    });
  } catch (error) {
    console.error('Error getting monitoring data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get monitoring data',
    });
  }
});

/**
 * Get optimization recommendations
 */
router.get('/recommendations', authenticate, requirePermission('system', 'read'), async (req, res) => {
  try {
    const connectionPool = getConnectionPool();
    const poolStats = connectionPool.getStatistics();

    let optimizerRecommendations: any[] = [];
    try {
      const optimizer = getPoolOptimizer();
      const metrics = optimizer.getMetrics();
      optimizerRecommendations = metrics.recommendations || [];
    } catch (error) {
      // Optimizer not initialized
    }

    const systemRecommendations = generateSystemRecommendations(poolStats);
    const performanceRecommendations = generatePerformanceRecommendations(connectionPool);

    const allRecommendations = [
      ...optimizerRecommendations,
      ...systemRecommendations,
      ...performanceRecommendations,
    ].sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return (priorityOrder as any)[a.priority] - (priorityOrder as any)[b.priority];
    });

    res.json({
      success: true,
      recommendations: allRecommendations,
      count: allRecommendations.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error getting recommendations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get recommendations',
    });
  }
});

// Helper functions

function calculatePoolHealth(stats: any): string {
  if (stats.poolEfficiency > 0.95) return 'critical';
  if (stats.poolEfficiency > 0.8) return 'warning';
  if (stats.averagePingLatency > 200) return 'warning';
  return 'healthy';
}

function calculateBatchingEfficiency(metrics: any): number {
  if (!metrics.averageBatchSize || !metrics.totalMessages) return 0;
  return Math.min(100, (metrics.averageBatchSize / 10) * 100);
}

function calculateOverallHealth(poolStats: any, batcherMetrics: any, optimizerMetrics: any): string {
  let score = 100;
  
  if (poolStats.poolEfficiency > 0.9) score -= 30;
  if (poolStats.averagePingLatency > 200) score -= 20;
  if (batcherMetrics && batcherMetrics.queueLength > 100) score -= 20;
  if (!optimizerMetrics) score -= 10;
  
  if (score >= 80) return 'excellent';
  if (score >= 60) return 'good';
  if (score >= 40) return 'fair';
  return 'poor';
}

function calculatePerformanceScore(poolStats: any, batcherMetrics: any): number {
  let score = 100;
  
  // Pool efficiency penalty
  if (poolStats.poolEfficiency > 0.9) score -= 20;
  else if (poolStats.poolEfficiency < 0.3) score -= 10;
  
  // Latency penalty
  if (poolStats.averagePingLatency > 200) score -= 30;
  else if (poolStats.averagePingLatency > 100) score -= 15;
  
  // Batching efficiency bonus
  if (batcherMetrics) {
    const batchingEfficiency = calculateBatchingEfficiency(batcherMetrics);
    score += Math.min(20, batchingEfficiency / 5);
  }
  
  return Math.max(0, Math.min(100, score));
}

function analyzeConnectionDistribution(pool: any, groupBy: string): any {
  // Mock implementation
  return {
    groupBy,
    distribution: {},
    insights: [],
  };
}

function analyzePerformanceTrends(pool: any, timeRange: string): any {
  // Mock implementation
  return {
    timeRange,
    trends: {},
    projections: {},
  };
}

function analyzeQualityMetrics(pool: any): any {
  // Mock implementation
  return {
    overall: 'good',
    distribution: {},
    improvements: [],
  };
}

function analyzeResourceUtilization(pool: any): any {
  // Mock implementation
  return {
    cpu: 25,
    memory: 45,
    network: 30,
    recommendations: [],
  };
}

function generatePerformanceRecommendations(pool: any): any[] {
  return [];
}

function generateSystemRecommendations(stats: any): any[] {
  const recommendations = [];
  
  if (stats.poolEfficiency > 0.9) {
    recommendations.push({
      type: 'capacity',
      priority: 'high',
      message: 'Connection pool efficiency is very high. Consider increasing capacity.',
      action: 'increase_pool_size',
    });
  }
  
  if (stats.averagePingLatency > 200) {
    recommendations.push({
      type: 'performance',
      priority: 'medium',
      message: 'Average ping latency is high. Check network conditions.',
      action: 'optimize_network',
    });
  }
  
  return recommendations;
}

function generateSystemAlerts(stats: any): any[] {
  const alerts = [];
  
  if (stats.poolEfficiency > 0.95) {
    alerts.push({
      type: 'warning',
      message: 'Connection pool nearly at capacity',
      severity: 'high',
    });
  }
  
  if (stats.averagePingLatency > 500) {
    alerts.push({
      type: 'error',
      message: 'Very high latency detected',
      severity: 'critical',
    });
  }
  
  return alerts;
}

function calculateAverageQuality(qualityDist: any): string {
  // Mock implementation
  return 'good';
}

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function sanitizeBatcherConfig(config: any): any {
  return {
    maxBatchSize: Math.max(1, Math.min(100, parseInt(config.maxBatchSize) || 20)),
    maxBatchDelay: Math.max(10, Math.min(1000, parseInt(config.maxBatchDelay) || 50)),
    compressionThreshold: Math.max(256, Math.min(64*1024, parseInt(config.compressionThreshold) || 1024)),
    enableCompression: Boolean(config.enableCompression),
    enablePrioritization: Boolean(config.enablePrioritization),
    maxRetries: Math.max(0, Math.min(10, parseInt(config.maxRetries) || 3)),
    messageTimeout: Math.max(1000, Math.min(300000, parseInt(config.messageTimeout) || 30000)),
    adaptiveBatching: Boolean(config.adaptiveBatching),
    targetLatency: Math.max(10, Math.min(1000, parseInt(config.targetLatency) || 25)),
    latencyAdjustmentFactor: Math.max(0.01, Math.min(1.0, parseFloat(config.latencyAdjustmentFactor) || 0.1)),
  };
}

function sanitizeOptimizerConfig(config: any): any {
  return {
    enableAutomaticScaling: Boolean(config.enableAutomaticScaling),
    enableConnectionUpgrading: Boolean(config.enableConnectionUpgrading),
    enableLoadBalancing: Boolean(config.enableLoadBalancing),
    targetPoolEfficiency: Math.max(0.1, Math.min(1.0, parseFloat(config.targetPoolEfficiency) || 0.75)),
    maxLatencyThreshold: Math.max(50, Math.min(5000, parseInt(config.maxLatencyThreshold) || 200)),
    minLatencyThreshold: Math.max(10, Math.min(500, parseInt(config.minLatencyThreshold) || 50)),
    connectionUpgradeThreshold: Math.max(10, Math.min(200, parseInt(config.connectionUpgradeThreshold) || 50)),
    connectionDowngradeThreshold: Math.max(100, Math.min(2000, parseInt(config.connectionDowngradeThreshold) || 500)),
    scalingCooldownPeriod: Math.max(10000, Math.min(600000, parseInt(config.scalingCooldownPeriod) || 60000)),
    optimizationInterval: Math.max(5000, Math.min(300000, parseInt(config.optimizationInterval) || 30000)),
    enablePreemptiveCleanup: Boolean(config.enablePreemptiveCleanup),
    qualityCheckInterval: Math.max(5000, Math.min(60000, parseInt(config.qualityCheckInterval) || 15000)),
  };
}

export default router;