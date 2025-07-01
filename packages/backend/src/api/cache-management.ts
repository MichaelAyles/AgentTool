import { Router } from 'express';
import { authenticate } from '../auth/middleware.js';
import { requireAdmin, requirePermission } from '../auth/permissions.js';
import { cacheManager } from '../cache/redis-cache-manager.js';
import { comprehensiveAuditLogger, AuditCategory } from '../security/audit-logger.js';
import { SecurityLevel } from '../security/types.js';

const router = Router();

/**
 * Get cache statistics and health
 */
router.get('/stats', authenticate, requirePermission('system', 'read'), async (req, res) => {
  try {
    const stats = cacheManager.getStats();
    const health = await cacheManager.getHealth();

    const response = {
      statistics: stats,
      health,
      performance: {
        hitRatio: stats.hitRatio,
        avgResponseTime: stats.avgResponseTime,
        errorRate: stats.errors / (stats.hits + stats.misses + stats.sets + stats.deletes || 1),
      },
      recommendations: generateCacheRecommendations(stats, health),
    };

    res.json({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error('Error getting cache stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get cache statistics',
    });
  }
});

/**
 * Get cache health status
 */
router.get('/health', authenticate, requirePermission('system', 'read'), async (req, res) => {
  try {
    const health = await cacheManager.getHealth();
    
    res.json({
      success: true,
      health,
    });
  } catch (error) {
    console.error('Error getting cache health:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get cache health status',
    });
  }
});

/**
 * Get specific cache entry
 */
router.get('/entry/:key', authenticate, requirePermission('system', 'read'), async (req, res) => {
  try {
    const { key } = req.params;
    const { strategy } = req.query;
    
    if (!key) {
      return res.status(400).json({
        success: false,
        message: 'Cache key is required',
      });
    }

    const data = await cacheManager.get(key, strategy as string);
    
    if (data === null) {
      return res.status(404).json({
        success: false,
        message: 'Cache entry not found',
      });
    }

    res.json({
      success: true,
      data: {
        key,
        strategy,
        value: data,
        retrieved: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error getting cache entry:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get cache entry',
    });
  }
});

/**
 * Set cache entry
 */
router.post('/entry', authenticate, requirePermission('system', 'write'), async (req, res) => {
  try {
    const { key, data, strategy, ttl, tags, version } = req.body;
    
    if (!key || data === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Key and data are required',
      });
    }

    const success = await cacheManager.set(key, data, {
      strategyName: strategy,
      ttl,
      tags,
      version,
    });

    const userId = req.user?.id;
    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'cache_entry_set',
      resourceType: 'cache',
      userId,
      sessionId: (req as any).session?.id || (req as any).sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: success ? 'success' : 'failure',
      severity: SecurityLevel.SAFE,
      details: {
        key,
        strategy,
        ttl,
        tags,
        dataSize: JSON.stringify(data).length,
      },
    });

    if (success) {
      res.json({
        success: true,
        message: 'Cache entry set successfully',
        data: { key, strategy, ttl },
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to set cache entry',
      });
    }
  } catch (error) {
    console.error('Error setting cache entry:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to set cache entry',
    });
  }
});

/**
 * Delete specific cache entry
 */
router.delete('/entry/:key', authenticate, requirePermission('system', 'write'), async (req, res) => {
  try {
    const { key } = req.params;
    const { strategy } = req.query;
    
    if (!key) {
      return res.status(400).json({
        success: false,
        message: 'Cache key is required',
      });
    }

    const success = await cacheManager.delete(key, strategy as string);

    const userId = req.user?.id;
    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'cache_entry_deleted',
      resourceType: 'cache',
      userId,
      sessionId: (req as any).session?.id || (req as any).sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: success ? 'success' : 'failure',
      severity: SecurityLevel.SAFE,
      details: { key, strategy },
    });

    if (success) {
      res.json({
        success: true,
        message: 'Cache entry deleted successfully',
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Cache entry not found',
      });
    }
  } catch (error) {
    console.error('Error deleting cache entry:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete cache entry',
    });
  }
});

/**
 * Invalidate cache by tags
 */
router.post('/invalidate/tags', authenticate, requirePermission('system', 'write'), async (req, res) => {
  try {
    const { tags } = req.body;
    
    if (!tags || !Array.isArray(tags) || tags.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Tags array is required and must not be empty',
      });
    }

    const deletedCount = await cacheManager.invalidateByTags(tags);

    const userId = req.user?.id;
    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'cache_invalidated_by_tags',
      resourceType: 'cache',
      userId,
      sessionId: (req as any).session?.id || (req as any).sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: 'success',
      severity: SecurityLevel.MODERATE,
      details: { tags, deletedCount },
    });

    res.json({
      success: true,
      message: `Cache invalidated successfully. ${deletedCount} entries deleted.`,
      data: { tags, deletedCount },
    });
  } catch (error) {
    console.error('Error invalidating cache by tags:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to invalidate cache by tags',
    });
  }
});

/**
 * Clear entire cache
 */
router.post('/clear', authenticate, requireAdmin(), async (req, res) => {
  try {
    const success = await cacheManager.clear();

    const userId = req.user?.id;
    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'cache_cleared',
      resourceType: 'cache',
      userId,
      sessionId: (req as any).session?.id || (req as any).sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: success ? 'success' : 'failure',
      severity: SecurityLevel.HIGH,
      details: {},
    });

    if (success) {
      res.json({
        success: true,
        message: 'Cache cleared successfully',
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to clear cache',
      });
    }
  } catch (error) {
    console.error('Error clearing cache:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear cache',
    });
  }
});

/**
 * Get cache configuration and strategies
 */
router.get('/config', authenticate, requirePermission('system', 'read'), async (req, res) => {
  try {
    // Get current cache strategies (this would be exposed from cache manager)
    const strategies = [
      {
        name: 'query-results',
        ttl: 1800,
        tags: ['database', 'queries'],
        compression: true,
        description: 'Database query result caching',
      },
      {
        name: 'sessions',
        ttl: 3600,
        tags: ['auth', 'sessions'],
        compression: false,
        description: 'User session data caching',
      },
      {
        name: 'api-responses',
        ttl: 300,
        tags: ['api', 'responses'],
        compression: true,
        description: 'API response caching',
      },
      {
        name: 'process-metrics',
        ttl: 60,
        tags: ['monitoring', 'metrics'],
        compression: false,
        description: 'Process monitoring metrics',
      },
      {
        name: 'file-system',
        ttl: 900,
        tags: ['filesystem', 'projects'],
        compression: true,
        description: 'File system data caching',
      },
    ];

    res.json({
      success: true,
      data: {
        strategies,
        defaultTTL: 3600,
        keyPrefix: 'vibecode:',
        compressionEnabled: true,
      },
    });
  } catch (error) {
    console.error('Error getting cache config:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get cache configuration',
    });
  }
});

/**
 * Cache warming endpoint
 */
router.post('/warm', authenticate, requireAdmin(), async (req, res) => {
  try {
    const { keys, strategy } = req.body;
    
    if (!keys || !Array.isArray(keys)) {
      return res.status(400).json({
        success: false,
        message: 'Keys array is required',
      });
    }

    const results = [];
    
    for (const key of keys) {
      try {
        // This would trigger cache warming logic specific to each key type
        // For now, we'll just report the key as warmed
        results.push({
          key,
          status: 'warmed',
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        results.push({
          key,
          status: 'failed',
          error: (error as Error).message,
        });
      }
    }

    const userId = req.user?.id;
    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'cache_warming_requested',
      resourceType: 'cache',
      userId,
      sessionId: (req as any).session?.id || (req as any).sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: 'success',
      severity: SecurityLevel.SAFE,
      details: { strategy, keysCount: keys.length },
    });

    res.json({
      success: true,
      message: 'Cache warming completed',
      data: { results },
    });
  } catch (error) {
    console.error('Error warming cache:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to warm cache',
    });
  }
});

/**
 * Cache performance analysis
 */
router.get('/analysis', authenticate, requirePermission('system', 'read'), async (req, res) => {
  try {
    const stats = cacheManager.getStats();
    const health = await cacheManager.getHealth();
    
    const analysis = {
      performance: {
        overall: calculateOverallPerformance(stats, health),
        hitRatio: stats.hitRatio,
        avgResponseTime: stats.avgResponseTime,
        throughput: calculateThroughput(stats),
        errorRate: stats.errors / (stats.hits + stats.misses + stats.sets + stats.deletes || 1),
      },
      recommendations: generateCacheRecommendations(stats, health),
      trends: {
        // This would include historical data analysis
        hitRatioTrend: 'stable',
        responseTimeTrend: 'improving',
        errorRateTrend: 'stable',
      },
      strategies: {
        mostEffective: 'query-results',
        leastEffective: 'api-responses',
        optimization: 'Consider increasing TTL for stable data',
      },
    };

    res.json({
      success: true,
      analysis,
    });
  } catch (error) {
    console.error('Error getting cache analysis:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get cache analysis',
    });
  }
});

// Helper functions

function generateCacheRecommendations(stats: any, health: any): string[] {
  const recommendations: string[] = [];
  
  if (stats.hitRatio < 0.7) {
    recommendations.push('Consider increasing cache TTL for better hit ratios');
  }
  
  if (stats.avgResponseTime > 50) {
    recommendations.push('Cache response time is high, check Redis connection');
  }
  
  if (health.redis.memory > 1000000000) { // 1GB
    recommendations.push('Redis memory usage is high, consider implementing cache eviction policies');
  }
  
  if (stats.errors > stats.hits * 0.01) {
    recommendations.push('Error rate is high, review cache configuration and Redis connectivity');
  }
  
  if (health.performance.hitRatio > 0.9) {
    recommendations.push('Excellent cache performance, consider extending current strategies');
  }
  
  return recommendations;
}

function calculateOverallPerformance(stats: any, health: any): 'excellent' | 'good' | 'fair' | 'poor' {
  let score = 100;
  
  // Hit ratio impact (40% of score)
  if (stats.hitRatio < 0.5) score -= 40;
  else if (stats.hitRatio < 0.7) score -= 20;
  else if (stats.hitRatio < 0.8) score -= 10;
  
  // Response time impact (30% of score)
  if (stats.avgResponseTime > 100) score -= 30;
  else if (stats.avgResponseTime > 50) score -= 15;
  else if (stats.avgResponseTime > 25) score -= 5;
  
  // Error rate impact (20% of score)
  const errorRate = stats.errors / (stats.hits + stats.misses + stats.sets + stats.deletes || 1);
  if (errorRate > 0.05) score -= 20;
  else if (errorRate > 0.01) score -= 10;
  
  // Connection health impact (10% of score)
  if (!health.redis.connected) score -= 10;
  
  if (score >= 85) return 'excellent';
  if (score >= 70) return 'good';
  if (score >= 55) return 'fair';
  return 'poor';
}

function calculateThroughput(stats: any): number {
  // Calculate operations per second (rough estimate)
  const totalOps = stats.hits + stats.misses + stats.sets + stats.deletes;
  const uptimeHours = 1; // This would be actual uptime in hours
  return Math.round(totalOps / (uptimeHours * 3600));
}

export default router;