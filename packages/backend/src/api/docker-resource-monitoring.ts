import { Router } from 'express';
import { authenticate } from '../auth/middleware.js';
import { requireAdmin, requirePermission } from '../auth/permissions.js';
import { resourceMonitor } from '../docker/resource-monitor.js';
import { comprehensiveAuditLogger, AuditCategory } from '../security/audit-logger.js';
import { SecurityLevel } from '../security/types.js';

const router = Router();

/**
 * Get resource metrics for a specific container
 */
router.get('/containers/:containerId/metrics', authenticate, requirePermission('container', 'read'), async (req, res) => {
  try {
    const { containerId } = req.params;
    const { timeRange = '3600000' } = req.query; // Default 1 hour
    
    const metrics = resourceMonitor.getMetrics(containerId);
    const trends = resourceMonitor.getResourceTrends(containerId, parseInt(timeRange as string));
    const prediction = resourceMonitor.predictResourceUsage(containerId, 30);
    
    if (metrics.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No metrics found for container',
      });
    }

    const latest = metrics[metrics.length - 1];
    
    res.json({
      success: true,
      data: {
        latest,
        trends,
        prediction,
        metricsCount: metrics.length,
        timeRange: parseInt(timeRange as string),
      },
    });
  } catch (error) {
    console.error('Error getting container metrics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get container metrics',
    });
  }
});

/**
 * Get all container metrics summary
 */
router.get('/containers/metrics', authenticate, requirePermission('container', 'read'), async (req, res) => {
  try {
    const summary = resourceMonitor.getUtilizationSummary();
    const allAlerts = resourceMonitor.getAllAlerts();
    
    res.json({
      success: true,
      data: {
        summary,
        recentAlerts: allAlerts.slice(0, 10), // Last 10 alerts
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error getting metrics summary:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get metrics summary',
    });
  }
});

/**
 * Set resource limits for a container
 */
router.post('/containers/:containerId/limits', authenticate, requirePermission('container', 'update'), async (req, res) => {
  try {
    const { containerId } = req.params;
    const limits = req.body;

    // Validate limits
    if (!limits.cpu || !limits.memory || !limits.processes) {
      return res.status(400).json({
        success: false,
        message: 'CPU, memory, and process limits are required',
      });
    }

    const success = await resourceMonitor.setResourceLimits(containerId, limits);

    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'resource_limits_updated',
      resourceType: 'container',
      resourceId: containerId,
      userId: req.user?.id,
      sessionId: (req as any).session?.id || (req as any).sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: success ? 'success' : 'failure',
      severity: SecurityLevel.MODERATE,
      details: {
        containerId,
        limits,
      },
    });

    if (success) {
      res.json({
        success: true,
        message: 'Resource limits updated successfully',
        data: limits,
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to update resource limits',
      });
    }
  } catch (error) {
    console.error('Error setting resource limits:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to set resource limits',
      error: (error as Error).message,
    });
  }
});

/**
 * Get resource limits for a container
 */
router.get('/containers/:containerId/limits', authenticate, requirePermission('container', 'read'), async (req, res) => {
  try {
    const { containerId } = req.params;
    
    const limits = resourceMonitor.getLimits(containerId);
    
    if (!limits) {
      return res.status(404).json({
        success: false,
        message: 'No resource limits found for container',
      });
    }

    res.json({
      success: true,
      data: limits,
    });
  } catch (error) {
    console.error('Error getting resource limits:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get resource limits',
    });
  }
});

/**
 * Get resource alerts for a container
 */
router.get('/containers/:containerId/alerts', authenticate, requirePermission('container', 'read'), async (req, res) => {
  try {
    const { containerId } = req.params;
    
    const alerts = resourceMonitor.getAlerts(containerId);
    const activeAlerts = alerts.filter(a => !a.acknowledged);
    
    res.json({
      success: true,
      data: {
        alerts,
        activeAlerts,
        total: alerts.length,
        active: activeAlerts.length,
      },
    });
  } catch (error) {
    console.error('Error getting container alerts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get container alerts',
    });
  }
});

/**
 * Get all resource alerts
 */
router.get('/alerts', authenticate, requirePermission('system', 'read'), async (req, res) => {
  try {
    const allAlerts = resourceMonitor.getAllAlerts();
    const { severity, limit = '50' } = req.query;
    
    let filteredAlerts = allAlerts;
    
    // Filter by severity if provided
    if (severity) {
      filteredAlerts = allAlerts.filter(a => a.severity === severity);
    }
    
    // Limit results
    const limitNum = parseInt(limit as string);
    if (limitNum > 0) {
      filteredAlerts = filteredAlerts.slice(0, limitNum);
    }

    const summary = {
      total: allAlerts.length,
      bySeverity: {
        warning: allAlerts.filter(a => a.severity === 'warning').length,
        critical: allAlerts.filter(a => a.severity === 'critical').length,
      },
      byType: {
        cpu: allAlerts.filter(a => a.type === 'cpu').length,
        memory: allAlerts.filter(a => a.type === 'memory').length,
        network: allAlerts.filter(a => a.type === 'network').length,
        disk: allAlerts.filter(a => a.type === 'disk').length,
        processes: allAlerts.filter(a => a.type === 'processes').length,
      },
    };

    res.json({
      success: true,
      data: {
        summary,
        alerts: filteredAlerts,
      },
    });
  } catch (error) {
    console.error('Error getting resource alerts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get resource alerts',
    });
  }
});

/**
 * Acknowledge a resource alert
 */
router.post('/alerts/:alertId/acknowledge', authenticate, requirePermission('system', 'update'), async (req, res) => {
  try {
    const { alertId } = req.params;
    
    const success = resourceMonitor.acknowledgeAlert(alertId);

    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'alert_acknowledged',
      resourceType: 'alert',
      resourceId: alertId,
      userId: req.user?.id,
      sessionId: (req as any).session?.id || (req as any).sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: success ? 'success' : 'failure',
      severity: SecurityLevel.SAFE,
      details: { alertId },
    });

    if (success) {
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
});

/**
 * Get resource usage predictions
 */
router.get('/containers/:containerId/predictions', authenticate, requirePermission('container', 'read'), async (req, res) => {
  try {
    const { containerId } = req.params;
    const { forecastMinutes = '30' } = req.query;
    
    const prediction = resourceMonitor.predictResourceUsage(
      containerId, 
      parseInt(forecastMinutes as string)
    );
    
    res.json({
      success: true,
      data: {
        prediction,
        forecastMinutes: parseInt(forecastMinutes as string),
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error getting resource predictions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get resource predictions',
    });
  }
});

/**
 * Get system resource overview
 */
router.get('/system/overview', authenticate, requirePermission('system', 'read'), async (req, res) => {
  try {
    const summary = resourceMonitor.getUtilizationSummary();
    const criticalAlerts = resourceMonitor.getAllAlerts().filter(a => a.severity === 'critical');
    
    // Calculate system health score
    let healthScore = 100;
    if (summary.averageCpuUsage > 80) healthScore -= 20;
    if (summary.averageMemoryUsage > 80) healthScore -= 20;
    if (criticalAlerts.length > 0) healthScore -= 30;
    if (summary.activeAlerts > 10) healthScore -= 20;
    
    const healthStatus = healthScore >= 80 ? 'healthy' : 
                        healthScore >= 60 ? 'warning' : 'critical';

    res.json({
      success: true,
      data: {
        summary,
        healthScore: Math.max(0, healthScore),
        healthStatus,
        criticalAlerts: criticalAlerts.length,
        systemMetrics: {
          containers: summary.totalContainers,
          avgCpu: Math.round(summary.averageCpuUsage * 100) / 100,
          avgMemory: Math.round(summary.averageMemoryUsage * 100) / 100,
          totalMemoryGB: Math.round(summary.totalMemoryUsed / 1024 / 1024 / 1024 * 100) / 100,
        },
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error getting system overview:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get system overview',
    });
  }
});

/**
 * Export metrics data
 */
router.get('/containers/:containerId/export', authenticate, requirePermission('container', 'read'), async (req, res) => {
  try {
    const { containerId } = req.params;
    const { format = 'json', timeRange = '86400000' } = req.query; // Default 24 hours
    
    const metrics = resourceMonitor.getMetrics(containerId);
    const cutoff = new Date(Date.now() - parseInt(timeRange as string));
    const filteredMetrics = metrics.filter(m => m.timestamp >= cutoff);
    
    if (filteredMetrics.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No metrics found for the specified time range',
      });
    }

    const exportData = {
      containerId,
      timeRange: parseInt(timeRange as string),
      exportedAt: new Date().toISOString(),
      metricsCount: filteredMetrics.length,
      metrics: filteredMetrics,
    };

    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.DATA_ACCESS,
      action: 'metrics_exported',
      resourceType: 'container',
      resourceId: containerId,
      userId: req.user?.id,
      sessionId: (req as any).session?.id || (req as any).sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: 'success',
      severity: SecurityLevel.SAFE,
      details: {
        containerId,
        format,
        timeRange,
        metricsCount: filteredMetrics.length,
      },
    });

    if (format === 'csv') {
      // Convert to CSV format
      const csvHeader = 'timestamp,cpu_usage,memory_usage,memory_percentage,network_rx,network_tx,disk_read,disk_write,processes\n';
      const csvData = filteredMetrics.map(m => 
        `${m.timestamp.toISOString()},${m.cpu.usage},${m.memory.usage},${m.memory.percentage},${m.network.rxBytes},${m.network.txBytes},${m.disk.readBytes},${m.disk.writeBytes},${m.processes.running}`
      ).join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="container-${containerId}-metrics.csv"`);
      res.send(csvHeader + csvData);
    } else {
      res.json({
        success: true,
        data: exportData,
      });
    }
  } catch (error) {
    console.error('Error exporting metrics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export metrics',
    });
  }
});

export default router;