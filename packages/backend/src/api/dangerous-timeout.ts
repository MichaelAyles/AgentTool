import { Router } from 'express';
import { authenticate } from '../auth/middleware.js';
import { requireAdmin } from '../auth/permissions.js';
// Simple input sanitization function
const sanitizeInput = (input: string): string => {
  if (typeof input !== 'string') return '';
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim();
};
import { dangerousTimeoutManager } from '../dangerous/timeout-manager.js';
import { autoDisableService } from '../dangerous/auto-disable.js';
import {
  comprehensiveAuditLogger,
  AuditCategory,
} from '../security/audit-logger.js';
import { SecurityLevel } from '../security/types.js';

const router = Router();

/**
 * Get timeout status for current session
 */
router.get('/status', authenticate, async (req, res) => {
  try {
    const sessionId = req.session?.id || req.sessionID;

    const timeoutStatus = dangerousTimeoutManager.getTimeoutStatus(sessionId);

    if (!timeoutStatus) {
      return res.json({
        hasTimeout: false,
        message: 'No active dangerous mode session',
      });
    }

    res.json({
      success: true,
      status: timeoutStatus,
    });
  } catch (error) {
    console.error('Error getting timeout status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get timeout status',
    });
  }
});

/**
 * Request session extension
 */
router.post('/extend', authenticate, async (req, res) => {
  try {
    const { duration, reason } = req.body;
    const sessionId = req.session?.id || req.sessionID;
    const userId = req.user?.id;
    const userRole = req.user?.role || 'user';

    // Validate inputs
    const sanitizedReason = sanitizeInput(reason || '');
    const requestedDuration = parseInt(duration) * 60 * 1000; // Convert minutes to milliseconds

    if (
      !requestedDuration ||
      requestedDuration <= 0 ||
      requestedDuration > 60 * 60 * 1000
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid duration. Must be between 1 and 60 minutes.',
      });
    }

    const result = await dangerousTimeoutManager.requestExtension({
      sessionId,
      userId,
      requestedDuration,
      reason: sanitizedReason,
      userRole,
    });

    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.DANGEROUS_OPERATIONS,
      action: 'extension_requested',
      resourceType: 'dangerous_session',
      resourceId: sessionId,
      userId,
      sessionId,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: result.success ? 'success' : 'failure',
      severity: SecurityLevel.MODERATE,
      details: {
        requestedDuration,
        reason: sanitizedReason,
        requiresApproval: result.requiresApproval,
      },
    });

    res.json(result);
  } catch (error) {
    console.error('Error requesting extension:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to request extension',
    });
  }
});

/**
 * Grant extension (admin only)
 */
router.post(
  '/grant-extension',
  authenticate,
  requireAdmin(),
  async (req, res) => {
    try {
      const { sessionId, duration, reason, userId } = req.body;
      const adminUserId = req.user?.id;

      // Validate inputs
      const sanitizedReason = sanitizeInput(reason || '');
      const requestedDuration = parseInt(duration) * 60 * 1000;

      if (!sessionId || !userId || !requestedDuration) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields',
        });
      }

      const result = await dangerousTimeoutManager.grantExtension({
        sessionId: sanitizeInput(sessionId),
        userId: sanitizeInput(userId),
        requestedDuration,
        reason: sanitizedReason,
        userRole: 'admin',
      });

      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.DANGEROUS_OPERATIONS,
        action: 'extension_granted',
        resourceType: 'dangerous_session',
        resourceId: sessionId,
        userId: adminUserId,
        sessionId: req.session?.id || req.sessionID,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        outcome: result.success ? 'success' : 'failure',
        severity: SecurityLevel.MODERATE,
        details: {
          targetSessionId: sessionId,
          targetUserId: userId,
          requestedDuration,
          reason: sanitizedReason,
        },
      });

      res.json(result);
    } catch (error) {
      console.error('Error granting extension:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to grant extension',
      });
    }
  }
);

/**
 * Emergency disable all sessions (admin only)
 */
router.post(
  '/emergency-disable',
  authenticate,
  requireAdmin(),
  async (req, res) => {
    try {
      const { reason } = req.body;
      const adminUserId = req.user?.id;

      const sanitizedReason = sanitizeInput(
        reason || 'Emergency disable by admin'
      );

      await dangerousTimeoutManager.emergencyDisableAll(sanitizedReason);

      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.SYSTEM_CHANGES,
        action: 'emergency_disable_all',
        resourceType: 'dangerous_mode_system',
        userId: adminUserId,
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
        message: 'Emergency disable triggered for all sessions',
      });
    } catch (error) {
      console.error('Error triggering emergency disable:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to trigger emergency disable',
      });
    }
  }
);

/**
 * Get auto-disable statistics (admin only)
 */
router.get(
  '/auto-disable/stats',
  authenticate,
  requireAdmin(),
  async (req, res) => {
    try {
      const stats = autoDisableService.getAutoDisableStats();

      res.json({
        success: true,
        stats,
      });
    } catch (error) {
      console.error('Error getting auto-disable stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get auto-disable statistics',
      });
    }
  }
);

/**
 * Force auto-disable for a session (admin only)
 */
router.post(
  '/auto-disable/force',
  authenticate,
  requireAdmin(),
  async (req, res) => {
    try {
      const { sessionId, trigger, evidence, reason } = req.body;
      const adminUserId = req.user?.id;

      if (!sessionId || !trigger) {
        return res.status(400).json({
          success: false,
          message: 'Session ID and trigger are required',
        });
      }

      await autoDisableService.forceAutoDisable(
        sanitizeInput(sessionId),
        trigger,
        {
          ...(evidence || {}),
          adminReason: sanitizeInput(reason || ''),
        },
        adminUserId
      );

      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.DANGEROUS_OPERATIONS,
        action: 'force_auto_disable',
        resourceType: 'dangerous_session',
        resourceId: sessionId,
        userId: adminUserId,
        sessionId: req.session?.id || req.sessionID,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        outcome: 'success',
        severity: SecurityLevel.DANGEROUS,
        details: {
          targetSessionId: sessionId,
          trigger,
          evidence,
          reason,
        },
      });

      res.json({
        success: true,
        message: 'Auto-disable forced successfully',
      });
    } catch (error) {
      console.error('Error forcing auto-disable:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to force auto-disable',
      });
    }
  }
);

/**
 * Analyze user behavior for current session
 */
router.get('/behavior-analysis', authenticate, async (req, res) => {
  try {
    const sessionId = req.session?.id || req.sessionID;

    const analysis = await autoDisableService.analyzeUserBehavior(sessionId);

    res.json({
      success: true,
      analysis,
    });
  } catch (error) {
    console.error('Error analyzing user behavior:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to analyze user behavior',
    });
  }
});

/**
 * Update timeout configuration (admin only)
 */
router.post('/config', authenticate, requireAdmin(), async (req, res) => {
  try {
    const { config } = req.body;
    const adminUserId = req.user?.id;

    // Validate configuration
    if (!config || typeof config !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Invalid configuration',
      });
    }

    // Create new timeout manager with updated config
    const newTimeoutManager = new (
      await import('../dangerous/timeout-manager.js')
    ).DangerousTimeoutManager(config);

    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.CONFIGURATION,
      action: 'timeout_config_updated',
      resourceType: 'timeout_configuration',
      userId: adminUserId,
      sessionId: req.session?.id || req.sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: 'success',
      severity: SecurityLevel.MODERATE,
      details: {
        newConfig: config,
      },
    });

    res.json({
      success: true,
      message: 'Timeout configuration updated',
    });
  } catch (error) {
    console.error('Error updating timeout configuration:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update timeout configuration',
    });
  }
});

export default router;
