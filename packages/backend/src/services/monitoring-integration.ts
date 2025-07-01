import { performanceMonitor } from '../monitoring/performance-monitor.js';
import { cacheManager } from '../cache/redis-cache-manager.js';
import { optimizedDb } from '../database/optimized-database.js';
import { structuredLogger } from '../middleware/logging.js';

/**
 * Service to integrate performance monitoring across all application components
 */
export class MonitoringIntegration {
  private intervalId: NodeJS.Timeout | null = null;
  private config = {
    collectionInterval: 30000, // 30 seconds
    enableCacheMonitoring: true,
    enableDatabaseMonitoring: true,
    enableProcessMonitoring: true,
    enableSystemMonitoring: true,
  };

  constructor(
    config: Partial<typeof MonitoringIntegration.prototype.config> = {}
  ) {
    Object.assign(this.config, config);
    this.setupEventListeners();
  }

  /**
   * Start comprehensive monitoring
   */
  start(): void {
    if (this.intervalId) {
      this.stop();
    }

    this.intervalId = setInterval(() => {
      this.collectMetrics();
    }, this.config.collectionInterval);

    structuredLogger.info('Monitoring integration started', {
      interval: this.config.collectionInterval,
    });
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    structuredLogger.info('Monitoring integration stopped');
  }

  /**
   * Collect metrics from all integrated services
   */
  private async collectMetrics(): Promise<void> {
    try {
      await Promise.all([
        this.collectCacheMetrics(),
        this.collectDatabaseMetrics(),
        this.collectProcessMetrics(),
        this.collectBusinessMetrics(),
      ]);
    } catch (error) {
      structuredLogger.error(
        'Error collecting integrated metrics',
        error as Error
      );
    }
  }

  /**
   * Collect cache performance metrics
   */
  private async collectCacheMetrics(): Promise<void> {
    if (!this.config.enableCacheMonitoring) return;

    try {
      const stats = cacheManager.getStats();
      const health = await cacheManager.getHealth();

      // Record cache performance metrics
      performanceMonitor.recordMetric(
        'cache.hit_ratio',
        stats.hitRatio,
        'ratio'
      );
      performanceMonitor.recordMetric(
        'cache.miss_ratio',
        1 - stats.hitRatio,
        'ratio'
      );
      performanceMonitor.recordMetric(
        'cache.avg_response_time',
        stats.avgResponseTime,
        'ms'
      );
      performanceMonitor.recordMetric('cache.total_hits', stats.hits, 'count');
      performanceMonitor.recordMetric(
        'cache.total_misses',
        stats.misses,
        'count'
      );
      performanceMonitor.recordMetric(
        'cache.error_count',
        stats.errors,
        'count'
      );

      // Record Redis-specific metrics
      if (health.redis.connected) {
        performanceMonitor.recordMetric(
          'redis.memory_usage',
          health.redis.memory,
          'bytes'
        );
        performanceMonitor.recordMetric(
          'redis.connected_clients',
          health.redis.clients,
          'count'
        );
        performanceMonitor.recordMetric(
          'redis.uptime',
          health.redis.uptime,
          'seconds'
        );
        performanceMonitor.recordMetric(
          'redis.connection_status',
          1,
          'boolean',
          {
            status: 'connected',
          }
        );
      } else {
        performanceMonitor.recordMetric(
          'redis.connection_status',
          0,
          'boolean',
          {
            status: 'disconnected',
          }
        );
      }

      // Cache efficiency metrics
      const efficiency = this.calculateCacheEfficiency(stats);
      performanceMonitor.recordMetric(
        'cache.efficiency_score',
        efficiency,
        'score'
      );
    } catch (error) {
      structuredLogger.error('Error collecting cache metrics', error as Error);
    }
  }

  /**
   * Collect database performance metrics
   */
  private async collectDatabaseMetrics(): Promise<void> {
    if (!this.config.enableDatabaseMonitoring) return;

    try {
      const dbInfo = optimizedDb.getDatabaseInfo();
      const queryMetrics = optimizedDb.getQueryMetrics();

      // Record database metrics
      performanceMonitor.recordMetric(
        'database.query_count',
        queryMetrics.queryCount,
        'count'
      );
      performanceMonitor.recordMetric(
        'database.avg_query_time',
        queryMetrics.averageTime,
        'ms'
      );
      performanceMonitor.recordMetric(
        'database.total_query_time',
        queryMetrics.totalTime,
        'ms'
      );
      performanceMonitor.recordMetric(
        'database.slow_queries',
        queryMetrics.slowQueries.length,
        'count'
      );
      performanceMonitor.recordMetric(
        'database.cache_hits',
        queryMetrics.cacheHits,
        'count'
      );
      performanceMonitor.recordMetric(
        'database.cache_misses',
        queryMetrics.cacheMisses,
        'count'
      );

      // Database size metrics
      const totalRows = Object.values(dbInfo.tableSizes).reduce(
        (sum: number, count: number) => sum + count,
        0
      );
      performanceMonitor.recordMetric(
        'database.total_rows',
        totalRows,
        'count'
      );
      performanceMonitor.recordMetric(
        'database.table_count',
        Object.keys(dbInfo.tableSizes).length,
        'count'
      );

      // Database performance score
      const dbPerformance = this.calculateDatabasePerformance(queryMetrics);
      performanceMonitor.recordMetric(
        'database.performance_score',
        dbPerformance,
        'score'
      );

      // Table-specific metrics
      for (const [tableName, rowCount] of Object.entries(dbInfo.tableSizes)) {
        performanceMonitor.recordMetric(
          'database.table_size',
          rowCount as number,
          'count',
          {
            table: tableName,
          }
        );
      }
    } catch (error) {
      structuredLogger.error(
        'Error collecting database metrics',
        error as Error
      );
    }
  }

  /**
   * Collect process and session metrics
   */
  private async collectProcessMetrics(): Promise<void> {
    if (!this.config.enableProcessMonitoring) return;

    try {
      // This would integrate with the actual process manager
      // For now, we'll collect mock metrics

      const processMetrics = {
        activeProcesses: 3,
        totalProcesses: 15,
        averageMemoryUsage: 128 * 1024 * 1024, // 128MB
        averageCpuUsage: 25.5,
        sessionsCreated: 8,
        sessionsTerminated: 5,
        commandsExecuted: 142,
        averageCommandTime: 2500,
      };

      performanceMonitor.recordMetric(
        'processes.active',
        processMetrics.activeProcesses,
        'count'
      );
      performanceMonitor.recordMetric(
        'processes.total',
        processMetrics.totalProcesses,
        'count'
      );
      performanceMonitor.recordMetric(
        'processes.avg_memory',
        processMetrics.averageMemoryUsage,
        'bytes'
      );
      performanceMonitor.recordMetric(
        'processes.avg_cpu',
        processMetrics.averageCpuUsage,
        'percent'
      );
      performanceMonitor.recordMetric(
        'sessions.created',
        processMetrics.sessionsCreated,
        'count'
      );
      performanceMonitor.recordMetric(
        'sessions.terminated',
        processMetrics.sessionsTerminated,
        'count'
      );
      performanceMonitor.recordMetric(
        'commands.executed',
        processMetrics.commandsExecuted,
        'count'
      );
      performanceMonitor.recordMetric(
        'commands.avg_time',
        processMetrics.averageCommandTime,
        'ms'
      );

      // Process efficiency
      const processEfficiency = this.calculateProcessEfficiency(processMetrics);
      performanceMonitor.recordMetric(
        'processes.efficiency_score',
        processEfficiency,
        'score'
      );
    } catch (error) {
      structuredLogger.error(
        'Error collecting process metrics',
        error as Error
      );
    }
  }

  /**
   * Collect business and application metrics
   */
  private async collectBusinessMetrics(): Promise<void> {
    try {
      // These would be collected from actual application state
      const businessMetrics = {
        activeUsers: 12,
        totalProjects: 45,
        adaptersInUse: 3,
        totalApiCalls: 1250,
        successfulOperations: 1198,
        failedOperations: 52,
        dataProcessed: 2.5 * 1024 * 1024 * 1024, // 2.5GB
      };

      performanceMonitor.recordMetric(
        'business.active_users',
        businessMetrics.activeUsers,
        'count'
      );
      performanceMonitor.recordMetric(
        'business.total_projects',
        businessMetrics.totalProjects,
        'count'
      );
      performanceMonitor.recordMetric(
        'business.adapters_in_use',
        businessMetrics.adaptersInUse,
        'count'
      );
      performanceMonitor.recordMetric(
        'business.api_calls',
        businessMetrics.totalApiCalls,
        'count'
      );
      performanceMonitor.recordMetric(
        'business.success_rate',
        businessMetrics.successfulOperations / businessMetrics.totalApiCalls,
        'ratio'
      );
      performanceMonitor.recordMetric(
        'business.data_processed',
        businessMetrics.dataProcessed,
        'bytes'
      );

      // Business health score
      const businessHealth = this.calculateBusinessHealth(businessMetrics);
      performanceMonitor.recordMetric(
        'business.health_score',
        businessHealth,
        'score'
      );
    } catch (error) {
      structuredLogger.error(
        'Error collecting business metrics',
        error as Error
      );
    }
  }

  /**
   * Setup event listeners for real-time metrics
   */
  private setupEventListeners(): void {
    // Cache event listeners
    cacheManager.on('hit', data => {
      performanceMonitor.recordMetric('cache.hit', 1, 'count', {
        strategy: data.strategy || 'unknown',
      });
    });

    cacheManager.on('miss', data => {
      performanceMonitor.recordMetric('cache.miss', 1, 'count', {
        strategy: data.strategy || 'unknown',
      });
    });

    cacheManager.on('error', () => {
      performanceMonitor.recordMetric('cache.error', 1, 'count');
    });

    // Performance monitor event listeners
    performanceMonitor.on('alert', alert => {
      structuredLogger.warn('Performance alert triggered', {
        alertId: alert.id,
        level: alert.level,
        metric: alert.metric,
        currentValue: alert.currentValue,
        threshold: alert.threshold,
      });

      // Record alert metrics
      performanceMonitor.recordMetric('monitoring.alerts', 1, 'count', {
        level: alert.level,
        metric: alert.metric,
      });
    });

    performanceMonitor.on('metric', metric => {
      // Could forward metrics to external systems here
      if (metric.name.includes('error') || metric.name.includes('failure')) {
        structuredLogger.debug('Error metric recorded', {
          name: metric.name,
          value: metric.value,
          tags: metric.tags,
        });
      }
    });
  }

  /**
   * Generate comprehensive system health report
   */
  async generateHealthReport(): Promise<{
    overall: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
    components: {
      cache: { status: string; score: number; issues: string[] };
      database: { status: string; score: number; issues: string[] };
      processes: { status: string; score: number; issues: string[] };
      business: { status: string; score: number; issues: string[] };
    };
    recommendations: string[];
    timestamp: string;
  }> {
    const cacheHealth = await this.assessCacheHealth();
    const databaseHealth = await this.assessDatabaseHealth();
    const processHealth = await this.assessProcessHealth();
    const businessHealth = await this.assessBusinessHealth();

    const overallScore =
      (cacheHealth.score +
        databaseHealth.score +
        processHealth.score +
        businessHealth.score) /
      4;

    const overall = this.scoreToStatus(overallScore);

    const allRecommendations = [
      ...cacheHealth.recommendations,
      ...databaseHealth.recommendations,
      ...processHealth.recommendations,
      ...businessHealth.recommendations,
    ];

    return {
      overall,
      components: {
        cache: cacheHealth,
        database: databaseHealth,
        processes: processHealth,
        business: businessHealth,
      },
      recommendations: allRecommendations,
      timestamp: new Date().toISOString(),
    };
  }

  // Private helper methods

  private calculateCacheEfficiency(stats: any): number {
    let score = 100;

    if (stats.hitRatio < 0.5) score -= 40;
    else if (stats.hitRatio < 0.7) score -= 20;

    if (stats.avgResponseTime > 50) score -= 20;
    else if (stats.avgResponseTime > 25) score -= 10;

    const errorRate =
      stats.errors /
      (stats.hits + stats.misses + stats.sets + stats.deletes || 1);
    if (errorRate > 0.05) score -= 25;
    else if (errorRate > 0.01) score -= 10;

    return Math.max(0, score);
  }

  private calculateDatabasePerformance(metrics: any): number {
    let score = 100;

    if (metrics.averageTime > 500) score -= 40;
    else if (metrics.averageTime > 200) score -= 20;
    else if (metrics.averageTime > 100) score -= 10;

    const slowQueryRatio =
      metrics.slowQueries.length / (metrics.queryCount || 1);
    if (slowQueryRatio > 0.1) score -= 30;
    else if (slowQueryRatio > 0.05) score -= 15;

    const cacheHitRatio =
      metrics.cacheHits / (metrics.cacheHits + metrics.cacheMisses || 1);
    if (cacheHitRatio < 0.7) score -= 15;

    return Math.max(0, score);
  }

  private calculateProcessEfficiency(metrics: any): number {
    let score = 100;

    const memoryPerProcess =
      metrics.averageMemoryUsage / (metrics.activeProcesses || 1);
    if (memoryPerProcess > 256 * 1024 * 1024) score -= 25; // 256MB per process

    if (metrics.averageCpuUsage > 80) score -= 30;
    else if (metrics.averageCpuUsage > 60) score -= 15;

    if (metrics.averageCommandTime > 5000) score -= 20;
    else if (metrics.averageCommandTime > 2000) score -= 10;

    return Math.max(0, score);
  }

  private calculateBusinessHealth(metrics: any): number {
    let score = 100;

    const successRate =
      metrics.successfulOperations / (metrics.totalApiCalls || 1);
    if (successRate < 0.95) score -= 30;
    else if (successRate < 0.98) score -= 15;

    if (metrics.activeUsers === 0) score -= 50;
    else if (metrics.activeUsers < 5) score -= 20;

    return Math.max(0, score);
  }

  private async assessCacheHealth(): Promise<{
    status: string;
    score: number;
    issues: string[];
    recommendations: string[];
  }> {
    const stats = cacheManager.getStats();
    const health = await cacheManager.getHealth();
    const score = this.calculateCacheEfficiency(stats);

    const issues: string[] = [];
    const recommendations: string[] = [];

    if (!health.redis.connected) {
      issues.push('Redis connection lost');
      recommendations.push('Check Redis server status and connectivity');
    }

    if (stats.hitRatio < 0.7) {
      issues.push('Low cache hit ratio');
      recommendations.push('Review cache TTL settings and strategies');
    }

    if (stats.avgResponseTime > 25) {
      issues.push('High cache response time');
      recommendations.push('Check Redis performance and network latency');
    }

    return {
      status: this.scoreToStatus(score),
      score,
      issues,
      recommendations,
    };
  }

  private async assessDatabaseHealth(): Promise<{
    status: string;
    score: number;
    issues: string[];
    recommendations: string[];
  }> {
    const queryMetrics = optimizedDb.getQueryMetrics();
    const score = this.calculateDatabasePerformance(queryMetrics);

    const issues: string[] = [];
    const recommendations: string[] = [];

    if (queryMetrics.averageTime > 200) {
      issues.push('High average query time');
      recommendations.push('Review slow queries and add missing indexes');
    }

    if (queryMetrics.slowQueries.length > queryMetrics.queryCount * 0.05) {
      issues.push('High percentage of slow queries');
      recommendations.push('Optimize slow queries and database schema');
    }

    return {
      status: this.scoreToStatus(score),
      score,
      issues,
      recommendations,
    };
  }

  private async assessProcessHealth(): Promise<{
    status: string;
    score: number;
    issues: string[];
    recommendations: string[];
  }> {
    // Mock implementation
    const score = 85;
    const issues: string[] = [];
    const recommendations: string[] = [];

    return {
      status: this.scoreToStatus(score),
      score,
      issues,
      recommendations,
    };
  }

  private async assessBusinessHealth(): Promise<{
    status: string;
    score: number;
    issues: string[];
    recommendations: string[];
  }> {
    // Mock implementation
    const score = 90;
    const issues: string[] = [];
    const recommendations: string[] = [];

    return {
      status: this.scoreToStatus(score),
      score,
      issues,
      recommendations,
    };
  }

  private scoreToStatus(score: number): string {
    if (score >= 90) return 'excellent';
    if (score >= 75) return 'good';
    if (score >= 60) return 'fair';
    if (score >= 40) return 'poor';
    return 'critical';
  }
}

// Export singleton instance
export const monitoringIntegration = new MonitoringIntegration();
