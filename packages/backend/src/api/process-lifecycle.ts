import { Router } from 'express';
import { authenticate } from '../auth/middleware.js';
import { requireAdmin, requirePermission } from '../auth/permissions.js';
import { processLifecycleManager } from '../processes/lifecycle-manager.js';
import {
  processStateMachine,
  ProcessState,
  ProcessEvent,
} from '../processes/state-machine.js';
import {
  comprehensiveAuditLogger,
  AuditCategory,
} from '../security/audit-logger.js';
import { SecurityLevel } from '../security/types.js';

// Simple input sanitization function
const sanitizeInput = (input: string): string => {
  if (typeof input !== 'string') return '';
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim();
};

const router = Router();

/**
 * Get process lifecycle statistics
 */
router.get(
  '/stats',
  authenticate,
  requirePermission('system', 'read'),
  async (req, res) => {
    try {
      const stats = processLifecycleManager.getSystemStatistics();

      res.json({
        success: true,
        stats,
      });
    } catch (error) {
      console.error('Error getting lifecycle stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get lifecycle statistics',
      });
    }
  }
);

/**
 * Get all active processes
 */
router.get(
  '/active',
  authenticate,
  requirePermission('session', 'read'),
  async (req, res) => {
    try {
      const activeProcesses = processLifecycleManager.getActiveProcesses();
      const processDetails = [];

      for (const sessionId of activeProcesses) {
        const context = processStateMachine.getContext(sessionId);
        const state = processStateMachine.getState(sessionId);
        const health = processLifecycleManager.getProcessHealth(sessionId);
        const metrics = processLifecycleManager.getProcessMetrics(sessionId);

        if (context && state) {
          processDetails.push({
            sessionId,
            state,
            adapterName: context.adapterName,
            command: context.command,
            userId: context.userId,
            startTime: context.startTime,
            dangerousModeEnabled: context.dangerousModeEnabled,
            healthy: health?.healthy || false,
            resourceUsage: health?.resourceUsage,
            totalRuntime: metrics?.totalRuntime || 0,
          });
        }
      }

      res.json({
        success: true,
        activeProcesses: processDetails,
        count: processDetails.length,
      });
    } catch (error) {
      console.error('Error getting active processes:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get active processes',
      });
    }
  }
);

/**
 * Create a new process
 */
router.post(
  '/create',
  authenticate,
  requirePermission('session', 'create'),
  async (req, res) => {
    try {
      const {
        sessionId,
        adapterName,
        command,
        args,
        workingDirectory,
        environment,
        dangerousModeEnabled = false,
        resourceLimits,
      } = req.body;
      const userId = req.user?.id;

      if (!sessionId || !adapterName) {
        return res.status(400).json({
          success: false,
          message: 'Session ID and adapter name are required',
        });
      }

      // Check if process already exists
      const existingState = processStateMachine.getState(
        sanitizeInput(sessionId)
      );
      if (existingState) {
        return res.status(409).json({
          success: false,
          message: 'Process with this session ID already exists',
        });
      }

      const success = await processLifecycleManager.createProcess({
        sessionId: sanitizeInput(sessionId),
        userId,
        adapterName: sanitizeInput(adapterName),
        command: command ? sanitizeInput(command) : undefined,
        args: args ? args.map(sanitizeInput) : undefined,
        workingDirectory: workingDirectory
          ? sanitizeInput(workingDirectory)
          : undefined,
        environment: environment || {},
        dangerousModeEnabled,
        resourceLimits,
      });

      if (!success) {
        return res.status(500).json({
          success: false,
          message: 'Failed to create process',
        });
      }

      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.SYSTEM_CHANGES,
        action: 'process_created',
        resourceType: 'process',
        resourceId: sessionId,
        userId,
        sessionId: req.session?.id || req.sessionID,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        outcome: 'success',
        severity: dangerousModeEnabled
          ? SecurityLevel.DANGEROUS
          : SecurityLevel.SAFE,
        details: {
          processSessionId: sessionId,
          adapterName,
          command,
          dangerousModeEnabled,
        },
      });

      res.status(201).json({
        success: true,
        message: 'Process created and started successfully',
        sessionId,
      });
    } catch (error) {
      console.error('Error creating process:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create process',
      });
    }
  }
);

/**
 * Get process status
 */
router.get(
  '/:sessionId/status',
  authenticate,
  requirePermission('session', 'read'),
  async (req, res) => {
    try {
      const { sessionId } = req.params;
      const sanitizedSessionId = sanitizeInput(sessionId);

      const state = processStateMachine.getState(sanitizedSessionId);
      const context = processStateMachine.getContext(sanitizedSessionId);
      const health =
        processLifecycleManager.getProcessHealth(sanitizedSessionId);
      const metrics =
        processLifecycleManager.getProcessMetrics(sanitizedSessionId);
      const history =
        processStateMachine.getLifecycleHistory(sanitizedSessionId);

      if (!state || !context) {
        return res.status(404).json({
          success: false,
          message: 'Process not found',
        });
      }

      res.json({
        success: true,
        process: {
          sessionId: sanitizedSessionId,
          state,
          context: {
            userId: context.userId,
            adapterName: context.adapterName,
            command: context.command,
            args: context.args,
            workingDirectory: context.workingDirectory,
            startTime: context.startTime,
            endTime: context.endTime,
            dangerousModeEnabled: context.dangerousModeEnabled,
            pid: context.pid,
            exitCode: context.exitCode,
          },
          health,
          metrics,
          recentHistory: history.slice(-10), // Last 10 events
        },
      });
    } catch (error) {
      console.error('Error getting process status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get process status',
      });
    }
  }
);

/**
 * Pause a process
 */
router.post(
  '/:sessionId/pause',
  authenticate,
  requirePermission('session', 'write'),
  async (req, res) => {
    try {
      const { sessionId } = req.params;
      const userId = req.user?.id;
      const sanitizedSessionId = sanitizeInput(sessionId);

      const success =
        await processLifecycleManager.pauseProcess(sanitizedSessionId);

      if (!success) {
        return res.status(400).json({
          success: false,
          message:
            'Failed to pause process - process may not be in a pausable state',
        });
      }

      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.SYSTEM_CHANGES,
        action: 'process_paused',
        resourceType: 'process',
        resourceId: sessionId,
        userId,
        sessionId: req.session?.id || req.sessionID,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        outcome: 'success',
        severity: SecurityLevel.SAFE,
        details: {
          processSessionId: sessionId,
        },
      });

      res.json({
        success: true,
        message: 'Process paused successfully',
      });
    } catch (error) {
      console.error('Error pausing process:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to pause process',
      });
    }
  }
);

/**
 * Resume a process
 */
router.post(
  '/:sessionId/resume',
  authenticate,
  requirePermission('session', 'write'),
  async (req, res) => {
    try {
      const { sessionId } = req.params;
      const userId = req.user?.id;
      const sanitizedSessionId = sanitizeInput(sessionId);

      const success =
        await processLifecycleManager.resumeProcess(sanitizedSessionId);

      if (!success) {
        return res.status(400).json({
          success: false,
          message: 'Failed to resume process - process may not be paused',
        });
      }

      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.SYSTEM_CHANGES,
        action: 'process_resumed',
        resourceType: 'process',
        resourceId: sessionId,
        userId,
        sessionId: req.session?.id || req.sessionID,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        outcome: 'success',
        severity: SecurityLevel.SAFE,
        details: {
          processSessionId: sessionId,
        },
      });

      res.json({
        success: true,
        message: 'Process resumed successfully',
      });
    } catch (error) {
      console.error('Error resuming process:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to resume process',
      });
    }
  }
);

/**
 * Stop a process
 */
router.post(
  '/:sessionId/stop',
  authenticate,
  requirePermission('session', 'write'),
  async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { graceful = true } = req.body;
      const userId = req.user?.id;
      const sanitizedSessionId = sanitizeInput(sessionId);

      const success = await processLifecycleManager.stopProcess(
        sanitizedSessionId,
        graceful
      );

      if (!success) {
        return res.status(400).json({
          success: false,
          message: 'Failed to stop process',
        });
      }

      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.SYSTEM_CHANGES,
        action: 'process_stopped',
        resourceType: 'process',
        resourceId: sessionId,
        userId,
        sessionId: req.session?.id || req.sessionID,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        outcome: 'success',
        severity: SecurityLevel.MODERATE,
        details: {
          processSessionId: sessionId,
          graceful,
        },
      });

      res.json({
        success: true,
        message: `Process ${graceful ? 'stopped' : 'terminated'} successfully`,
      });
    } catch (error) {
      console.error('Error stopping process:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to stop process',
      });
    }
  }
);

/**
 * Restart a process
 */
router.post(
  '/:sessionId/restart',
  authenticate,
  requirePermission('session', 'write'),
  async (req, res) => {
    try {
      const { sessionId } = req.params;
      const userId = req.user?.id;
      const sanitizedSessionId = sanitizeInput(sessionId);

      const success =
        await processLifecycleManager.restartProcess(sanitizedSessionId);

      if (!success) {
        return res.status(400).json({
          success: false,
          message: 'Failed to restart process',
        });
      }

      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.SYSTEM_CHANGES,
        action: 'process_restarted',
        resourceType: 'process',
        resourceId: sessionId,
        userId,
        sessionId: req.session?.id || req.sessionID,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        outcome: 'success',
        severity: SecurityLevel.MODERATE,
        details: {
          processSessionId: sessionId,
        },
      });

      res.json({
        success: true,
        message: 'Process restarted successfully',
      });
    } catch (error) {
      console.error('Error restarting process:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to restart process',
      });
    }
  }
);

/**
 * Trigger a specific event on a process (admin only)
 */
router.post(
  '/:sessionId/event',
  authenticate,
  requireAdmin(),
  async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { event, metadata = {} } = req.body;
      const userId = req.user?.id;
      const sanitizedSessionId = sanitizeInput(sessionId);

      if (!Object.values(ProcessEvent).includes(event)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid process event',
        });
      }

      const success = await processStateMachine.triggerEvent(
        sanitizedSessionId,
        event,
        metadata
      );

      if (!success) {
        return res.status(400).json({
          success: false,
          message: 'Failed to trigger event - invalid state transition',
        });
      }

      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.SYSTEM_CHANGES,
        action: 'process_event_triggered',
        resourceType: 'process',
        resourceId: sessionId,
        userId,
        sessionId: req.session?.id || req.sessionID,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        outcome: 'success',
        severity: SecurityLevel.MODERATE,
        details: {
          processSessionId: sessionId,
          event,
          metadata,
        },
      });

      res.json({
        success: true,
        message: 'Event triggered successfully',
        event,
      });
    } catch (error) {
      console.error('Error triggering process event:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to trigger process event',
      });
    }
  }
);

/**
 * Get process lifecycle history
 */
router.get(
  '/:sessionId/history',
  authenticate,
  requirePermission('session', 'read'),
  async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { limit = '50', offset = '0' } = req.query;
      const sanitizedSessionId = sanitizeInput(sessionId);

      const history =
        processStateMachine.getLifecycleHistory(sanitizedSessionId);

      if (history.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Process not found or no history available',
        });
      }

      const limitNum = Math.min(parseInt(limit as string) || 50, 100);
      const offsetNum = Math.max(parseInt(offset as string) || 0, 0);

      const paginatedHistory = history
        .reverse() // Show newest first
        .slice(offsetNum, offsetNum + limitNum);

      res.json({
        success: true,
        history: paginatedHistory,
        total: history.length,
        limit: limitNum,
        offset: offsetNum,
      });
    } catch (error) {
      console.error('Error getting process history:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get process history',
      });
    }
  }
);

/**
 * Cleanup terminated processes (admin only)
 */
router.post('/cleanup', authenticate, requireAdmin(), async (req, res) => {
  try {
    const userId = req.user?.id;

    const cleanedCount =
      await processLifecycleManager.cleanupTerminatedProcesses();

    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'processes_cleaned',
      resourceType: 'process_system',
      userId,
      sessionId: req.session?.id || req.sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: 'success',
      severity: SecurityLevel.SAFE,
      details: {
        cleanedCount,
      },
    });

    res.json({
      success: true,
      message: `Cleaned up ${cleanedCount} terminated processes`,
      cleanedCount,
    });
  } catch (error) {
    console.error('Error cleaning up processes:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cleanup processes',
    });
  }
});

/**
 * Emergency shutdown all processes (admin only)
 */
router.post(
  '/emergency-shutdown',
  authenticate,
  requireAdmin(),
  async (req, res) => {
    try {
      const { reason = 'manual_shutdown' } = req.body;
      const userId = req.user?.id;

      await processLifecycleManager.emergencyShutdown(sanitizeInput(reason));

      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.SYSTEM_CHANGES,
        action: 'emergency_shutdown',
        resourceType: 'process_system',
        userId,
        sessionId: req.session?.id || req.sessionID,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        outcome: 'success',
        severity: SecurityLevel.CRITICAL,
        details: {
          reason,
          triggeredBy: 'admin',
        },
      });

      res.json({
        success: true,
        message: 'Emergency shutdown initiated',
        reason,
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
 * Get available process states and events
 */
router.get('/metadata', authenticate, (req, res) => {
  res.json({
    success: true,
    metadata: {
      states: Object.values(ProcessState),
      events: Object.values(ProcessEvent),
    },
  });
});

export default router;
