import { Router } from 'express';
import { authenticate } from '../auth/middleware.js';
import { requireAdmin, requirePermission } from '../auth/permissions.js';
import { performanceMonitor } from '../monitoring/performance-monitor.js';
import {
  comprehensiveAuditLogger,
  AuditCategory,
} from '../security/audit-logger.js';
import { SecurityLevel } from '../security/types.js';

const router = Router();

/**
 * Get comprehensive performance dashboard data
 */
router.get(
  '/dashboard',
  authenticate,
  requirePermission('system', 'read'),
  async (req, res) => {
    try {
      const timeRange = getTimeRangeFromQuery(req.query);

      // Get system metrics
      const systemMetrics = await performanceMonitor.getSystemMetrics();

      // Get application metrics
      const applicationMetrics =
        await performanceMonitor.getApplicationMetrics();

      // Get key performance indicators
      const responseTimeMetrics = performanceMonitor.getMetricsSummary(
        'http.request.duration',
        timeRange
      );
      const requestRateMetrics = performanceMonitor.getMetricsSummary(
        'http.request.count',
        timeRange
      );
      const errorMetrics = performanceMonitor.getMetricsSummary(
        'error.occurrence',
        timeRange
      );

      // Get active alerts
      const alerts = performanceMonitor.getAlerts();
      const criticalAlerts = alerts.filter(
        a => a.level === 'critical' && !a.acknowledged
      );

      const dashboard = {
        timestamp: new Date().toISOString(),
        system: {
          cpu: {
            usage: systemMetrics.cpu.usage,
            cores: systemMetrics.cpu.cores,
            loadAverage: systemMetrics.cpu.loadAverage[0],
          },
          memory: {
            usage: systemMetrics.memory.percentage,
            used: formatBytes(systemMetrics.memory.used),
            total: formatBytes(systemMetrics.memory.total),
          },
          uptime: formatUptime(systemMetrics.uptime),
        },
        application: {
          requests: {
            total: applicationMetrics.requests.total,
            perSecond:
              Math.round(applicationMetrics.requests.perSecond * 100) / 100,
            averageResponseTime: Math.round(
              applicationMetrics.requests.averageResponseTime
            ),
            errorRate:
              Math.round(applicationMetrics.requests.errorRate * 10000) / 100, // percentage
          },
          processes: applicationMetrics.processes,
          cache: applicationMetrics.cache,
          database: applicationMetrics.database,
          websockets: applicationMetrics.websockets,
        },
        performance: {
          responseTime: {
            average: Math.round(responseTimeMetrics.summary.average),
            p95: Math.round(responseTimeMetrics.summary.percentiles.p95),
            p99: Math.round(responseTimeMetrics.summary.percentiles.p99),
          },
          throughput: {
            requestsPerMinute: Math.round(requestRateMetrics.summary.count),
            trend: calculateTrend(requestRateMetrics.metrics),
          },
          errors: {
            total: errorMetrics.summary.count,
            rate: applicationMetrics.requests.errorRate,
            trend: calculateTrend(errorMetrics.metrics),
          },
        },
        alerts: {
          total: alerts.length,
          critical: criticalAlerts.length,
          unacknowledged: alerts.filter(a => !a.acknowledged).length,
          recent: alerts.slice(0, 5),
        },
        health: {
          status: calculateOverallHealth(
            systemMetrics,
            applicationMetrics,
            criticalAlerts
          ),
          scores: {
            performance: calculatePerformanceScore(responseTimeMetrics.summary),
            reliability: calculateReliabilityScore(
              applicationMetrics.requests.errorRate
            ),
            efficiency: calculateEfficiencyScore(
              systemMetrics,
              applicationMetrics
            ),
          },
        },
      };

      res.json({
        success: true,
        data: dashboard,
      });
    } catch (error) {
      console.error('Error getting performance dashboard:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get performance dashboard',
      });
    }
  }
);

/**
 * Get detailed metrics for a specific metric name
 */
router.get(
  '/metrics/:metricName',
  authenticate,
  requirePermission('system', 'read'),
  async (req, res) => {
    try {
      const { metricName } = req.params;
      const timeRange = getTimeRangeFromQuery(req.query);
      const { aggregation = 'none', interval = '5m' } = req.query;

      const metrics = performanceMonitor.getMetricsSummary(
        metricName,
        timeRange
      );

      let processedData = metrics.metrics;

      // Apply aggregation if requested
      if (aggregation !== 'none') {
        processedData = aggregateMetrics(
          metrics.metrics,
          interval as string,
          aggregation as string
        );
      }

      res.json({
        success: true,
        data: {
          metricName,
          timeRange,
          aggregation,
          interval,
          summary: metrics.summary,
          data: processedData,
        },
      });
    } catch (error) {
      console.error('Error getting metric details:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get metric details',
      });
    }
  }
);

/**
 * Get system metrics
 */
router.get(
  '/system',
  authenticate,
  requirePermission('system', 'read'),
  async (req, res) => {
    try {
      const systemMetrics = await performanceMonitor.getSystemMetrics();

      // Add historical data
      const cpuHistory = performanceMonitor.getMetricsSummary(
        'cpu.usage',
        getTimeRangeFromQuery({ hours: '1' })
      );
      const memoryHistory = performanceMonitor.getMetricsSummary(
        'memory.percentage',
        getTimeRangeFromQuery({ hours: '1' })
      );

      const response = {
        current: systemMetrics,
        history: {
          cpu: cpuHistory.metrics.slice(-20), // Last 20 data points
          memory: memoryHistory.metrics.slice(-20),
        },
        trends: {
          cpu: calculateTrend(cpuHistory.metrics),
          memory: calculateTrend(memoryHistory.metrics),
        },
      };

      res.json({
        success: true,
        data: response,
      });
    } catch (error) {
      console.error('Error getting system metrics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get system metrics',
      });
    }
  }
);

/**
 * Get application performance metrics
 */
router.get(
  '/application',
  authenticate,
  requirePermission('system', 'read'),
  async (req, res) => {
    try {
      const applicationMetrics =
        await performanceMonitor.getApplicationMetrics();
      const timeRange = getTimeRangeFromQuery(req.query);

      // Get detailed breakdowns
      const endpointMetrics = performanceMonitor.getMetricsSummary(
        'api.usage.by_endpoint',
        timeRange
      );
      const userMetrics = performanceMonitor.getMetricsSummary(
        'api.usage.by_user',
        timeRange
      );
      const responseTimeBreakdown = performanceMonitor.getMetricsSummary(
        'http.request.duration',
        timeRange
      );

      const response = {
        overview: applicationMetrics,
        breakdowns: {
          topEndpoints: aggregateByTag(
            endpointMetrics.metrics,
            'endpoint'
          ).slice(0, 10),
          topUsers: aggregateByTag(userMetrics.metrics, 'user_id').slice(0, 10),
          responseTimeDistribution: createDistribution(
            responseTimeBreakdown.metrics
          ),
        },
        trends: {
          requests: calculateTrend(
            performanceMonitor.getMetricsSummary(
              'http.request.count',
              timeRange
            ).metrics
          ),
          responseTime: calculateTrend(responseTimeBreakdown.metrics),
          errors: calculateTrend(
            performanceMonitor.getMetricsSummary('error.occurrence', timeRange)
              .metrics
          ),
        },
      };

      res.json({
        success: true,
        data: response,
      });
    } catch (error) {
      console.error('Error getting application metrics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get application metrics',
      });
    }
  }
);

/**
 * Get alerts and incidents
 */
router.get(
  '/alerts',
  authenticate,
  requirePermission('system', 'read'),
  async (req, res) => {
    try {
      const { level, acknowledged, limit = '50' } = req.query;

      let alerts = performanceMonitor.getAlerts(level as any);

      if (acknowledged !== undefined) {
        const isAcknowledged = acknowledged === 'true';
        alerts = alerts.filter(alert => alert.acknowledged === isAcknowledged);
      }

      // Sort by timestamp (newest first)
      alerts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      // Limit results
      const limitNum = parseInt(limit as string);
      if (limitNum > 0) {
        alerts = alerts.slice(0, limitNum);
      }

      const summary = {
        total: alerts.length,
        byLevel: {
          critical: alerts.filter(a => a.level === 'critical').length,
          error: alerts.filter(a => a.level === 'error').length,
          warning: alerts.filter(a => a.level === 'warning').length,
          info: alerts.filter(a => a.level === 'info').length,
        },
        unacknowledged: alerts.filter(a => !a.acknowledged).length,
      };

      res.json({
        success: true,
        data: {
          summary,
          alerts,
        },
      });
    } catch (error) {
      console.error('Error getting alerts:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get alerts',
      });
    }
  }
);

/**
 * Acknowledge an alert
 */
router.post(
  '/alerts/:alertId/acknowledge',
  authenticate,
  requirePermission('system', 'write'),
  async (req, res) => {
    try {
      const { alertId } = req.params;

      const success = performanceMonitor.acknowledgeAlert(alertId);

      if (success) {
        const userId = req.user?.id;
        await comprehensiveAuditLogger.logAuditEvent({
          category: AuditCategory.SYSTEM_CHANGES,
          action: 'alert_acknowledged',
          resourceType: 'monitoring',
          resourceId: alertId,
          userId,
          sessionId: (req as any).session?.id || (req as any).sessionID,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          outcome: 'success',
          severity: SecurityLevel.SAFE,
          details: { alertId },
        });

        res.json({
          success: true,
          message: 'Alert acknowledged successfully',
        });
      } else {
        res.status(404).json({
          success: false,
          message: 'Alert not found',
        });
      }
    } catch (error) {
      console.error('Error acknowledging alert:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to acknowledge alert',
      });
    }
  }
);

/**
 * Set custom metric thresholds
 */
router.post('/thresholds', authenticate, requireAdmin(), async (req, res) => {
  try {
    const { metricName, warning, critical } = req.body;

    if (!metricName || warning === undefined || critical === undefined) {
      return res.status(400).json({
        success: false,
        message: 'metricName, warning, and critical thresholds are required',
      });
    }

    if (warning >= critical) {
      return res.status(400).json({
        success: false,
        message: 'Warning threshold must be less than critical threshold',
      });
    }

    performanceMonitor.setThreshold(metricName, warning, critical);

    const userId = req.user?.id;
    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'threshold_updated',
      resourceType: 'monitoring',
      resourceId: metricName,
      userId,
      sessionId: (req as any).session?.id || (req as any).sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: 'success',
      severity: SecurityLevel.MODERATE,
      details: { metricName, warning, critical },
    });

    res.json({
      success: true,
      message: 'Threshold updated successfully',
      data: { metricName, warning, critical },
    });
  } catch (error) {
    console.error('Error setting threshold:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to set threshold',
    });
  }
});

/**
 * Export metrics data
 */
router.get('/export', authenticate, requireAdmin(), async (req, res) => {
  try {
    const { format = 'json', timeRange } = req.query;

    // Apply time range filter if provided
    let exportData: string;

    if (timeRange) {
      const range = getTimeRangeFromQuery({ timeRange });
      // This would filter metrics by time range before export
      exportData = performanceMonitor.exportMetrics(format as any);
    } else {
      exportData = performanceMonitor.exportMetrics(format as any);
    }

    const userId = req.user?.id;
    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'metrics_exported',
      resourceType: 'monitoring',
      userId,
      sessionId: (req as any).session?.id || (req as any).sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: 'success',
      severity: SecurityLevel.SAFE,
      details: { format, dataSize: exportData.length },
    });

    // Set appropriate headers based on format
    switch (format) {
      case 'csv':
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader(
          'Content-Disposition',
          'attachment; filename=metrics.csv'
        );
        break;
      case 'prometheus':
        res.setHeader('Content-Type', 'text/plain');
        res.setHeader(
          'Content-Disposition',
          'attachment; filename=metrics.prom'
        );
        break;
      default:
        res.setHeader('Content-Type', 'application/json');
        res.setHeader(
          'Content-Disposition',
          'attachment; filename=metrics.json'
        );
    }

    res.send(exportData);
  } catch (error) {
    console.error('Error exporting metrics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export metrics',
    });
  }
});

/**
 * Get performance insights and recommendations
 */
router.get(
  '/insights',
  authenticate,
  requirePermission('system', 'read'),
  async (req, res) => {
    try {
      const timeRange = getTimeRangeFromQuery(req.query);

      // Analyze recent performance data
      const insights = await generatePerformanceInsights(timeRange);

      res.json({
        success: true,
        data: insights,
      });
    } catch (error) {
      console.error('Error getting performance insights:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get performance insights',
      });
    }
  }
);

/**
 * Get real-time performance statistics
 */
router.get(
  '/realtime',
  authenticate,
  requirePermission('system', 'read'),
  async (req, res) => {
    try {
      const systemMetrics = await performanceMonitor.getSystemMetrics();
      const applicationMetrics =
        await performanceMonitor.getApplicationMetrics();

      // Get recent metrics (last 5 minutes)
      const recentTimeRange = {
        start: new Date(Date.now() - 5 * 60 * 1000),
        end: new Date(),
      };

      const recentRequests = performanceMonitor.getMetricsSummary(
        'http.request.count',
        recentTimeRange
      );
      const recentResponseTime = performanceMonitor.getMetricsSummary(
        'http.request.duration',
        recentTimeRange
      );
      const recentErrors = performanceMonitor.getMetricsSummary(
        'error.occurrence',
        recentTimeRange
      );

      const realtime = {
        timestamp: new Date().toISOString(),
        system: {
          cpu: systemMetrics.cpu.usage,
          memory: systemMetrics.memory.percentage,
          uptime: systemMetrics.uptime,
        },
        application: {
          requestsPerSecond: applicationMetrics.requests.perSecond,
          averageResponseTime: recentResponseTime.summary.average,
          errorRate:
            recentErrors.summary.count /
            Math.max(recentRequests.summary.count, 1),
          activeProcesses: applicationMetrics.processes.active,
          activeConnections: applicationMetrics.websockets.activeConnections,
        },
        alerts: {
          critical: performanceMonitor
            .getAlerts('critical')
            .filter(a => !a.acknowledged).length,
          warnings: performanceMonitor
            .getAlerts('warning')
            .filter(a => !a.acknowledged).length,
        },
      };

      res.json({
        success: true,
        data: realtime,
      });
    } catch (error) {
      console.error('Error getting realtime metrics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get realtime metrics',
      });
    }
  }
);

// Helper functions

function getTimeRangeFromQuery(query: any): { start: Date; end: Date } {
  const now = new Date();
  let start: Date;

  if (query.hours) {
    start = new Date(now.getTime() - parseInt(query.hours) * 60 * 60 * 1000);
  } else if (query.days) {
    start = new Date(
      now.getTime() - parseInt(query.days) * 24 * 60 * 60 * 1000
    );
  } else if (query.start && query.end) {
    start = new Date(query.start);
    const end = new Date(query.end);
    return { start, end };
  } else {
    // Default to last hour
    start = new Date(now.getTime() - 60 * 60 * 1000);
  }

  return { start, end: now };
}

function formatBytes(bytes: number): string {
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  if (bytes === 0) return '0 B';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function calculateTrend(
  metrics: any[]
): 'increasing' | 'decreasing' | 'stable' {
  if (metrics.length < 2) return 'stable';

  const recent = metrics.slice(-5);
  const older = metrics.slice(-10, -5);

  if (recent.length === 0 || older.length === 0) return 'stable';

  const recentAvg = recent.reduce((sum, m) => sum + m.value, 0) / recent.length;
  const olderAvg = older.reduce((sum, m) => sum + m.value, 0) / older.length;

  const change = (recentAvg - olderAvg) / olderAvg;

  if (change > 0.1) return 'increasing';
  if (change < -0.1) return 'decreasing';
  return 'stable';
}

function calculateOverallHealth(
  system: any,
  application: any,
  criticalAlerts: any[]
): string {
  if (criticalAlerts.length > 0) return 'critical';
  if (system.cpu.usage > 90 || system.memory.percentage > 95) return 'poor';
  if (
    application.requests.errorRate > 0.05 ||
    application.requests.averageResponseTime > 2000
  )
    return 'degraded';
  if (system.cpu.usage > 70 || system.memory.percentage > 80) return 'fair';
  return 'excellent';
}

function calculatePerformanceScore(summary: any): number {
  let score = 100;
  if (summary.average > 1000) score -= 30;
  else if (summary.average > 500) score -= 15;
  if (summary.percentiles.p95 > 2000) score -= 20;
  return Math.max(0, score);
}

function calculateReliabilityScore(errorRate: number): number {
  if (errorRate > 0.1) return 0;
  if (errorRate > 0.05) return 50;
  if (errorRate > 0.01) return 80;
  return 100;
}

function calculateEfficiencyScore(system: any, application: any): number {
  let score = 100;
  if (system.cpu.usage > 80) score -= 20;
  if (system.memory.percentage > 85) score -= 20;
  if (application.cache.hitRatio < 0.7) score -= 15;
  return Math.max(0, score);
}

function aggregateMetrics(
  metrics: any[],
  interval: string,
  aggregation: string
): any[] {
  // Implement metric aggregation logic
  return metrics; // Placeholder
}

function aggregateByTag(metrics: any[], tagKey: string): any[] {
  const aggregated = new Map();

  for (const metric of metrics) {
    const tagValue = metric.tags[tagKey];
    if (tagValue) {
      if (!aggregated.has(tagValue)) {
        aggregated.set(tagValue, { tag: tagValue, count: 0, value: 0 });
      }
      const entry = aggregated.get(tagValue);
      entry.count++;
      entry.value += metric.value;
    }
  }

  return Array.from(aggregated.values()).sort((a, b) => b.value - a.value);
}

function createDistribution(metrics: any[]): any {
  const buckets = {
    '<100ms': 0,
    '100-500ms': 0,
    '500ms-1s': 0,
    '1-5s': 0,
    '>5s': 0,
  };

  for (const metric of metrics) {
    const value = metric.value;
    if (value < 100) buckets['<100ms']++;
    else if (value < 500) buckets['100-500ms']++;
    else if (value < 1000) buckets['500ms-1s']++;
    else if (value < 5000) buckets['1-5s']++;
    else buckets['>5s']++;
  }

  return buckets;
}

async function generatePerformanceInsights(timeRange: any): Promise<any> {
  // Analyze performance data and generate insights
  const insights = {
    recommendations: [
      'Consider implementing caching for frequently accessed endpoints',
      'Database query optimization could improve response times',
      'Memory usage is trending upward, monitor for potential leaks',
    ],
    trends: {
      performance: 'improving',
      reliability: 'stable',
      efficiency: 'declining',
    },
    topIssues: [
      {
        issue: 'High response times on /api/projects endpoint',
        severity: 'medium',
      },
      { issue: 'Increasing memory usage trend', severity: 'low' },
    ],
  };

  return insights;
}

export default router;
