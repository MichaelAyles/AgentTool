import { Router } from 'express';
import { authenticate } from '../auth/middleware.js';
import { requireAdmin, requirePermission } from '../auth/permissions.js';
import {
  adapterLifecycleManager,
  AdapterStatus,
} from '../adapters/lifecycle-manager.js';
import {
  comprehensiveAuditLogger,
  AuditCategory,
} from '../security/audit-logger.js';
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
 * Get all adapter statuses
 */
router.get(
  '/status',
  authenticate,
  requirePermission('adapter', 'read'),
  async (req, res) => {
    try {
      const statuses = adapterLifecycleManager.getAllAdapterStatuses();
      const statusArray = Array.from(statuses.entries()).map(
        ([adapterId, status]) => ({
          adapterId,
          status,
          health: adapterLifecycleManager.getAdapterHealth(adapterId),
          metrics: adapterLifecycleManager.getAdapterMetrics(adapterId),
        })
      );

      res.json({
        success: true,
        adapters: statusArray,
        totalCount: statusArray.length,
        statusCounts: Object.values(AdapterStatus).reduce(
          (acc, status) => {
            acc[status] = statusArray.filter(a => a.status === status).length;
            return acc;
          },
          {} as Record<AdapterStatus, number>
        ),
      });
    } catch (error) {
      console.error('Error getting adapter statuses:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get adapter statuses',
      });
    }
  }
);

/**
 * Get adapters by status
 */
router.get(
  '/status/:status',
  authenticate,
  requirePermission('adapter', 'read'),
  async (req, res) => {
    try {
      const { status } = req.params;
      const sanitizedStatus = sanitizeInput(status) as AdapterStatus;

      if (!Object.values(AdapterStatus).includes(sanitizedStatus)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid adapter status',
          validStatuses: Object.values(AdapterStatus),
        });
      }

      const adapterIds =
        adapterLifecycleManager.getAdaptersByStatus(sanitizedStatus);
      const adapters = adapterIds.map(adapterId => ({
        adapterId,
        status: sanitizedStatus,
        health: adapterLifecycleManager.getAdapterHealth(adapterId),
        metrics: adapterLifecycleManager.getAdapterMetrics(adapterId),
      }));

      res.json({
        success: true,
        status: sanitizedStatus,
        adapters,
        count: adapters.length,
      });
    } catch (error) {
      console.error('Error getting adapters by status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get adapters by status',
      });
    }
  }
);

/**
 * Get detailed adapter information
 */
router.get(
  '/:adapterId',
  authenticate,
  requirePermission('adapter', 'read'),
  async (req, res) => {
    try {
      const { adapterId } = req.params;
      const sanitizedAdapterId = sanitizeInput(adapterId);

      const health =
        adapterLifecycleManager.getAdapterHealth(sanitizedAdapterId);
      const metrics =
        adapterLifecycleManager.getAdapterMetrics(sanitizedAdapterId);
      const history =
        adapterLifecycleManager.getAdapterLifecycleHistory(sanitizedAdapterId);

      if (!health && !metrics) {
        return res.status(404).json({
          success: false,
          message: 'Adapter not found',
        });
      }

      res.json({
        success: true,
        adapter: {
          adapterId: sanitizedAdapterId,
          health,
          metrics,
          recentHistory: history.slice(-10), // Last 10 events
        },
      });
    } catch (error) {
      console.error('Error getting adapter details:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get adapter details',
      });
    }
  }
);

/**
 * Start an adapter
 */
router.post(
  '/:adapterId/start',
  authenticate,
  requirePermission('adapter', 'write'),
  async (req, res) => {
    try {
      const { adapterId } = req.params;
      const userId = req.user?.id;
      const sanitizedAdapterId = sanitizeInput(adapterId);

      const success =
        await adapterLifecycleManager.startAdapter(sanitizedAdapterId);

      if (!success) {
        return res.status(400).json({
          success: false,
          message:
            'Failed to start adapter - adapter may not be in a startable state',
        });
      }

      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.SYSTEM_CHANGES,
        action: 'adapter_started',
        resourceType: 'adapter',
        resourceId: adapterId,
        userId,
        sessionId: req.session?.id || req.sessionID,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        outcome: 'success',
        severity: SecurityLevel.MODERATE,
        details: {
          adapterId: sanitizedAdapterId,
        },
      });

      res.json({
        success: true,
        message: 'Adapter started successfully',
        adapterId: sanitizedAdapterId,
      });
    } catch (error) {
      console.error('Error starting adapter:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to start adapter',
      });
    }
  }
);

/**
 * Stop an adapter
 */
router.post(
  '/:adapterId/stop',
  authenticate,
  requirePermission('adapter', 'write'),
  async (req, res) => {
    try {
      const { adapterId } = req.params;
      const { graceful = true } = req.body;
      const userId = req.user?.id;
      const sanitizedAdapterId = sanitizeInput(adapterId);

      const success = await adapterLifecycleManager.stopAdapter(
        sanitizedAdapterId,
        graceful
      );

      if (!success) {
        return res.status(400).json({
          success: false,
          message: 'Failed to stop adapter',
        });
      }

      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.SYSTEM_CHANGES,
        action: 'adapter_stopped',
        resourceType: 'adapter',
        resourceId: adapterId,
        userId,
        sessionId: req.session?.id || req.sessionID,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        outcome: 'success',
        severity: SecurityLevel.MODERATE,
        details: {
          adapterId: sanitizedAdapterId,
          graceful,
        },
      });

      res.json({
        success: true,
        message: `Adapter ${graceful ? 'stopped' : 'terminated'} successfully`,
        adapterId: sanitizedAdapterId,
      });
    } catch (error) {
      console.error('Error stopping adapter:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to stop adapter',
      });
    }
  }
);

/**
 * Restart an adapter
 */
router.post(
  '/:adapterId/restart',
  authenticate,
  requirePermission('adapter', 'write'),
  async (req, res) => {
    try {
      const { adapterId } = req.params;
      const userId = req.user?.id;
      const sanitizedAdapterId = sanitizeInput(adapterId);

      const success =
        await adapterLifecycleManager.restartAdapter(sanitizedAdapterId);

      if (!success) {
        return res.status(400).json({
          success: false,
          message: 'Failed to restart adapter',
        });
      }

      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.SYSTEM_CHANGES,
        action: 'adapter_restarted',
        resourceType: 'adapter',
        resourceId: adapterId,
        userId,
        sessionId: req.session?.id || req.sessionID,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        outcome: 'success',
        severity: SecurityLevel.MODERATE,
        details: {
          adapterId: sanitizedAdapterId,
        },
      });

      res.json({
        success: true,
        message: 'Adapter restarted successfully',
        adapterId: sanitizedAdapterId,
      });
    } catch (error) {
      console.error('Error restarting adapter:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to restart adapter',
      });
    }
  }
);

/**
 * Get adapter health status
 */
router.get(
  '/:adapterId/health',
  authenticate,
  requirePermission('adapter', 'read'),
  async (req, res) => {
    try {
      const { adapterId } = req.params;
      const sanitizedAdapterId = sanitizeInput(adapterId);

      const health =
        adapterLifecycleManager.getAdapterHealth(sanitizedAdapterId);

      if (!health) {
        return res.status(404).json({
          success: false,
          message: 'Adapter not found',
        });
      }

      res.json({
        success: true,
        adapterId: sanitizedAdapterId,
        health,
      });
    } catch (error) {
      console.error('Error getting adapter health:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get adapter health',
      });
    }
  }
);

/**
 * Get adapter metrics
 */
router.get(
  '/:adapterId/metrics',
  authenticate,
  requirePermission('adapter', 'read'),
  async (req, res) => {
    try {
      const { adapterId } = req.params;
      const sanitizedAdapterId = sanitizeInput(adapterId);

      const metrics =
        adapterLifecycleManager.getAdapterMetrics(sanitizedAdapterId);

      if (!metrics) {
        return res.status(404).json({
          success: false,
          message: 'Adapter not found',
        });
      }

      res.json({
        success: true,
        adapterId: sanitizedAdapterId,
        metrics,
      });
    } catch (error) {
      console.error('Error getting adapter metrics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get adapter metrics',
      });
    }
  }
);

/**
 * Get adapter lifecycle history
 */
router.get(
  '/:adapterId/history',
  authenticate,
  requirePermission('adapter', 'read'),
  async (req, res) => {
    try {
      const { adapterId } = req.params;
      const { limit = '50' } = req.query;
      const sanitizedAdapterId = sanitizeInput(adapterId);
      const limitNum = Math.min(parseInt(limit as string) || 50, 100);

      const history = adapterLifecycleManager.getAdapterLifecycleHistory(
        sanitizedAdapterId,
        limitNum
      );

      if (history.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Adapter not found or no history available',
        });
      }

      res.json({
        success: true,
        adapterId: sanitizedAdapterId,
        history: history.reverse(), // Show newest first
        count: history.length,
        limit: limitNum,
      });
    } catch (error) {
      console.error('Error getting adapter history:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get adapter history',
      });
    }
  }
);

/**
 * Emergency shutdown all adapters (admin only)
 */
router.post(
  '/emergency-shutdown',
  authenticate,
  requireAdmin(),
  async (req, res) => {
    try {
      const { reason = 'manual_shutdown' } = req.body;
      const userId = req.user?.id;
      const sanitizedReason = sanitizeInput(reason);

      await adapterLifecycleManager.emergencyShutdown(sanitizedReason);

      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.SYSTEM_CHANGES,
        action: 'adapters_emergency_shutdown',
        resourceType: 'adapter_system',
        userId,
        sessionId: req.session?.id || req.sessionID,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        outcome: 'success',
        severity: SecurityLevel.CRITICAL,
        details: {
          reason: sanitizedReason,
          triggeredBy: 'admin',
        },
      });

      res.json({
        success: true,
        message: 'Emergency shutdown initiated for all adapters',
        reason: sanitizedReason,
      });
    } catch (error) {
      console.error('Error during emergency shutdown:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to initiate emergency shutdown',
      });
    }
  }
);

/**
 * Get adapter lifecycle metadata
 */
router.get(
  '/metadata/states',
  authenticate,
  requirePermission('adapter', 'read'),
  (req, res) => {
    res.json({
      success: true,
      metadata: {
        statuses: Object.values(AdapterStatus),
        statusDescriptions: {
          [AdapterStatus.UNLOADED]: 'Adapter is not loaded',
          [AdapterStatus.LOADING]: 'Adapter is being loaded',
          [AdapterStatus.LOADED]: 'Adapter is loaded but not started',
          [AdapterStatus.INITIALIZING]: 'Adapter is initializing',
          [AdapterStatus.READY]: 'Adapter is ready and operational',
          [AdapterStatus.DEGRADED]:
            'Adapter is operational but with reduced performance',
          [AdapterStatus.ERROR]: 'Adapter has encountered an error',
          [AdapterStatus.UNLOADING]: 'Adapter is being unloaded',
          [AdapterStatus.FAILED]: 'Adapter has failed to load or start',
        },
      },
    });
  }
);

export default router;
