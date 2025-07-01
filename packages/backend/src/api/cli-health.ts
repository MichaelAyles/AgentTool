import { Router } from 'express';
import { authenticate } from '../auth/middleware.js';
import { requirePermission } from '../auth/permissions.js';
import {
  comprehensiveAuditLogger,
  AuditCategory,
} from '../security/audit-logger.js';
import { SecurityLevel } from '../security/types.js';
import { cliHealthMonitor } from '../services/cli-health-monitor.js';

const router = Router();

/**
 * Get health status for all monitored CLIs
 */
router.get(
  '/status',
  authenticate,
  requirePermission('cli', 'read'),
  async (req, res) => {
    try {
      const healthStatuses = cliHealthMonitor.getAllHealthStatuses();

      res.json({
        success: true,
        data: healthStatuses,
        metadata: {
          totalCLIs: healthStatuses.length,
          healthyCLIs: healthStatuses.filter(s => s.status === 'healthy')
            .length,
          unhealthyCLIs: healthStatuses.filter(s => s.status === 'unhealthy')
            .length,
          degradedCLIs: healthStatuses.filter(s => s.status === 'degraded')
            .length,
          lastUpdate: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error('Error getting CLI health status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get CLI health status',
      });
    }
  }
);

/**
 * Get health status for a specific CLI
 */
router.get(
  '/status/:cliName',
  authenticate,
  requirePermission('cli', 'read'),
  async (req, res) => {
    try {
      const { cliName } = req.params;
      const healthStatus = cliHealthMonitor.getHealthStatus(cliName);

      if (!healthStatus) {
        return res.status(404).json({
          success: false,
          error: 'CLI not found or not being monitored',
        });
      }

      res.json({
        success: true,
        data: healthStatus,
      });
    } catch (error) {
      console.error('Error getting CLI health status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get CLI health status',
      });
    }
  }
);

/**
 * Perform immediate health check for a specific CLI
 */
router.post(
  '/check/:cliName',
  authenticate,
  requirePermission('cli', 'manage'),
  async (req, res) => {
    try {
      const { cliName } = req.params;
      const userId = req.user?.id || 'unknown';

      const healthStatus = await cliHealthMonitor.performHealthCheck(cliName);

      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.SYSTEM_MONITORING,
        action: 'cli_health_check_requested',
        resourceType: 'cli_tool',
        resourceId: cliName,
        userId,
        sessionId: req.session?.id || req.sessionID,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        outcome: 'success',
        severity: SecurityLevel.SAFE,
        details: {
          cliName,
          status: healthStatus.status,
          availability: healthStatus.availability,
        },
      });

      res.json({
        success: true,
        data: healthStatus,
      });
    } catch (error) {
      console.error('Error performing health check:', error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to perform health check',
      });
    }
  }
);

/**
 * Start monitoring a CLI
 */
router.post(
  '/monitor/:cliName/start',
  authenticate,
  requirePermission('cli', 'manage'),
  async (req, res) => {
    try {
      const { cliName } = req.params;
      const userId = req.user?.id || 'unknown';

      await cliHealthMonitor.startMonitoring(cliName);

      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.SYSTEM_CONFIGURATION,
        action: 'cli_monitoring_started',
        resourceType: 'cli_tool',
        resourceId: cliName,
        userId,
        sessionId: req.session?.id || req.sessionID,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        outcome: 'success',
        severity: SecurityLevel.SAFE,
        details: {
          cliName,
        },
      });

      res.json({
        success: true,
        message: `Started monitoring CLI: ${cliName}`,
      });
    } catch (error) {
      console.error('Error starting CLI monitoring:', error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to start monitoring',
      });
    }
  }
);

/**
 * Stop monitoring a CLI
 */
router.post(
  '/monitor/:cliName/stop',
  authenticate,
  requirePermission('cli', 'manage'),
  async (req, res) => {
    try {
      const { cliName } = req.params;
      const userId = req.user?.id || 'unknown';

      cliHealthMonitor.stopMonitoring(cliName);

      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.SYSTEM_CONFIGURATION,
        action: 'cli_monitoring_stopped',
        resourceType: 'cli_tool',
        resourceId: cliName,
        userId,
        sessionId: req.session?.id || req.sessionID,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        outcome: 'success',
        severity: SecurityLevel.SAFE,
        details: {
          cliName,
        },
      });

      res.json({
        success: true,
        message: `Stopped monitoring CLI: ${cliName}`,
      });
    } catch (error) {
      console.error('Error stopping CLI monitoring:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to stop monitoring',
      });
    }
  }
);

/**
 * Get detailed diagnostics for a CLI
 */
router.get(
  '/diagnostics/:cliName',
  authenticate,
  requirePermission('cli', 'read'),
  async (req, res) => {
    try {
      const { cliName } = req.params;

      const diagnostics = await cliHealthMonitor.getDiagnostics(cliName);

      res.json({
        success: true,
        data: diagnostics,
      });
    } catch (error) {
      console.error('Error getting CLI diagnostics:', error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to get diagnostics',
      });
    }
  }
);

/**
 * Get monitoring configuration
 */
router.get(
  '/config',
  authenticate,
  requirePermission('cli', 'read'),
  async (req, res) => {
    try {
      const config = cliHealthMonitor.getConfig();

      res.json({
        success: true,
        data: config,
      });
    } catch (error) {
      console.error('Error getting monitoring config:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get monitoring configuration',
      });
    }
  }
);

/**
 * Update monitoring configuration
 */
router.put(
  '/config',
  authenticate,
  requirePermission('cli', 'manage'),
  async (req, res) => {
    try {
      const userId = req.user?.id || 'unknown';
      const configUpdates = req.body;

      // Validate configuration updates
      const allowedFields = [
        'checkInterval',
        'timeout',
        'retryAttempts',
        'enablePerformanceMonitoring',
        'enableDeepHealthChecks',
        'alertThresholds',
      ];

      const filteredUpdates: any = {};
      for (const [key, value] of Object.entries(configUpdates)) {
        if (allowedFields.includes(key)) {
          filteredUpdates[key] = value;
        }
      }

      cliHealthMonitor.updateConfig(filteredUpdates);
      const newConfig = cliHealthMonitor.getConfig();

      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.SYSTEM_CONFIGURATION,
        action: 'cli_monitoring_config_updated',
        resourceType: 'system_config',
        resourceId: 'cli_health_monitor',
        userId,
        sessionId: req.session?.id || req.sessionID,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        outcome: 'success',
        severity: SecurityLevel.MODERATE,
        details: {
          updates: filteredUpdates,
          newConfig,
        },
      });

      res.json({
        success: true,
        data: newConfig,
        message: 'Monitoring configuration updated successfully',
      });
    } catch (error) {
      console.error('Error updating monitoring config:', error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to update configuration',
      });
    }
  }
);

/**
 * Get performance metrics for all CLIs
 */
router.get(
  '/metrics',
  authenticate,
  requirePermission('cli', 'read'),
  async (req, res) => {
    try {
      const healthStatuses = cliHealthMonitor.getAllHealthStatuses();

      const metrics = {
        overview: {
          totalCLIs: healthStatuses.length,
          healthyCLIs: healthStatuses.filter(s => s.status === 'healthy')
            .length,
          degradedCLIs: healthStatuses.filter(s => s.status === 'degraded')
            .length,
          unhealthyCLIs: healthStatuses.filter(s => s.status === 'unhealthy')
            .length,
          unknownCLIs: healthStatuses.filter(s => s.status === 'unknown')
            .length,
        },
        performance: {
          averageResponseTime:
            healthStatuses.reduce((sum, s) => sum + (s.responseTime || 0), 0) /
            healthStatuses.length,
          totalCommands: healthStatuses.reduce(
            (sum, s) => sum + s.performance.commandCount,
            0
          ),
          totalErrors: healthStatuses.reduce(
            (sum, s) => sum + s.performance.errorCount,
            0
          ),
          overallSuccessRate:
            healthStatuses.length > 0
              ? healthStatuses.reduce(
                  (sum, s) => sum + s.performance.successRate,
                  0
                ) / healthStatuses.length
              : 1.0,
        },
        cliMetrics: healthStatuses.map(status => ({
          name: status.name,
          status: status.status,
          availability: status.availability,
          responseTime: status.responseTime,
          performance: status.performance,
          lastChecked: status.lastChecked,
          errorCount: status.errors.length,
          warningCount: status.warnings.length,
        })),
      };

      res.json({
        success: true,
        data: metrics,
      });
    } catch (error) {
      console.error('Error getting CLI metrics:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get CLI metrics',
      });
    }
  }
);

/**
 * Get health history for a CLI (if implemented)
 */
router.get(
  '/history/:cliName',
  authenticate,
  requirePermission('cli', 'read'),
  async (req, res) => {
    try {
      const { cliName } = req.params;
      const { limit = 100, offset = 0 } = req.query;

      // This would require implementing history storage
      // For now, return the current health checks
      const healthStatus = cliHealthMonitor.getHealthStatus(cliName);

      if (!healthStatus) {
        return res.status(404).json({
          success: false,
          error: 'CLI not found or not being monitored',
        });
      }

      res.json({
        success: true,
        data: {
          cliName,
          history: healthStatus.healthChecks.slice(
            parseInt(offset as string, 10),
            parseInt(offset as string, 10) + parseInt(limit as string, 10)
          ),
          total: healthStatus.healthChecks.length,
        },
      });
    } catch (error) {
      console.error('Error getting CLI health history:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get health history',
      });
    }
  }
);

/**
 * Export health status as JSON
 */
router.get(
  '/export',
  authenticate,
  requirePermission('cli', 'read'),
  async (req, res) => {
    try {
      const { format = 'json' } = req.query;
      const healthStatuses = cliHealthMonitor.getAllHealthStatuses();

      const exportData = {
        timestamp: new Date().toISOString(),
        format: 'vibe-code-cli-health',
        version: '1.0',
        data: healthStatuses,
      };

      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="cli-health-${Date.now()}.json"`
        );
        res.json(exportData);
      } else {
        res.status(400).json({
          success: false,
          error: 'Unsupported format. Only JSON is currently supported.',
        });
      }
    } catch (error) {
      console.error('Error exporting health status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to export health status',
      });
    }
  }
);

export default router;
