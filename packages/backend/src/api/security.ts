import { Router } from 'express';
import { authenticate } from '../auth/middleware.js';
import { asyncHandler } from '../middleware/error-handler.js';
import { createSecuritySessionTracker } from '../security/session-tracker.js';
import { securityEventLogger } from '../security/event-logger.js';
import { SecurityEventType, SecurityLevel } from '../security/types.js';
import { requirePermission, requireAdmin } from '../auth/permissions.js';
import { Database } from '../database/index.js';

const router = Router();

// Get current user's security status
router.get(
  '/status',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const securityTracker = req.app.get('securityTracker');

    if (!securityTracker) {
      return res.status(500).json({ error: 'Security tracking not available' });
    }

    const sessionSecurity = securityTracker.getSessionSecurity(user.sessionId);

    if (!sessionSecurity) {
      return res.status(404).json({ error: 'Security context not found' });
    }

    res.json({
      success: true,
      data: {
        sessionId: sessionSecurity.sessionId,
        securityLevel: sessionSecurity.securityLevel,
        riskScore: sessionSecurity.riskScore,
        dangerousModeEnabled: sessionSecurity.dangerousModeEnabled,
        timeUntilDangerousDisable: sessionSecurity.timeUntilDangerousDisable,
        violationCount: sessionSecurity.violationCount,
        activeProjects: sessionSecurity.activeProjects,
        lastActivity: sessionSecurity.lastActivity,
        requestCount: sessionSecurity.requestCount,
      },
    });
  })
);

// Enable dangerous mode
router.post(
  '/dangerous-mode/enable',
  authenticate,
  requirePermission('dangerous', 'execute'),
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const { confirmation } = req.body;
    const securityTracker = req.app.get('securityTracker');

    if (!securityTracker) {
      return res.status(500).json({ error: 'Security tracking not available' });
    }

    const success = securityTracker.enableDangerousMode(
      user.sessionId,
      confirmation
    );

    if (!success) {
      return res.status(400).json({
        error: 'Failed to enable dangerous mode',
        code: 'DANGEROUS_MODE_ENABLE_FAILED',
        requiresConfirmation: true,
      });
    }

    res.json({
      success: true,
      message: 'Dangerous mode enabled',
      data: {
        enabled: true,
        timeout: 30 * 60 * 1000, // 30 minutes in milliseconds
      },
    });
  })
);

// Disable dangerous mode
router.post(
  '/dangerous-mode/disable',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const securityTracker = req.app.get('securityTracker');

    if (!securityTracker) {
      return res.status(500).json({ error: 'Security tracking not available' });
    }

    securityTracker.disableDangerousMode(user.sessionId);

    res.json({
      success: true,
      message: 'Dangerous mode disabled',
      data: {
        enabled: false,
      },
    });
  })
);

// Get security events for current user
router.get(
  '/events',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const { limit = 50, severity, since } = req.query;

    const filter: any = { userId: user.id };

    if (severity) {
      filter.severity = severity as SecurityLevel;
    }

    if (since) {
      filter.since = new Date(since as string);
    }

    const events = securityEventLogger.getRecentEvents(Number(limit), filter);

    res.json({
      success: true,
      data: events.map(event => ({
        id: event.id,
        type: event.type,
        severity: event.severity,
        timestamp: event.timestamp,
        resource: event.resource,
        action: event.action,
        outcome: event.outcome,
        metadata: event.metadata,
      })),
    });
  })
);

// Get security metrics (admin only)
router.get(
  '/metrics',
  authenticate,
  requireAdmin(),
  asyncHandler(async (req, res) => {
    const securityTracker = req.app.get('securityTracker');

    if (!securityTracker) {
      return res.status(500).json({ error: 'Security tracking not available' });
    }

    const metrics = securityTracker.getSecurityMetrics();
    const statistics = securityEventLogger.getSecurityStatistics();

    res.json({
      success: true,
      data: {
        metrics,
        statistics,
        timestamp: new Date(),
      },
    });
  })
);

// Get audit log (admin only)
router.get(
  '/audit',
  authenticate,
  requireAdmin(),
  asyncHandler(async (req, res) => {
    const { limit = 100, userId, category, level, since } = req.query;

    const filter: any = {};

    if (userId) filter.userId = userId as string;
    if (category) filter.category = category as string;
    if (level) filter.level = level as string;
    if (since) filter.since = new Date(since as string);

    const auditLog = securityEventLogger.getAuditLog(Number(limit), filter);

    res.json({
      success: true,
      data: auditLog,
    });
  })
);

// Export security logs (admin only)
router.get(
  '/export',
  authenticate,
  requireAdmin(),
  asyncHandler(async (req, res) => {
    const { format = 'json', startDate, endDate, userId, severity } = req.query;

    const filter: any = {};

    if (startDate) filter.startDate = new Date(startDate as string);
    if (endDate) filter.endDate = new Date(endDate as string);
    if (userId) filter.userId = userId as string;
    if (severity) filter.severity = severity as SecurityLevel;

    const exportData = securityEventLogger.exportLogs(
      format as 'json' | 'csv',
      filter
    );

    const filename = `security-logs-${new Date().toISOString().split('T')[0]}.${format}`;
    const contentType = format === 'json' ? 'application/json' : 'text/csv';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(exportData);
  })
);

// Security configuration (admin only)
router.get(
  '/config',
  authenticate,
  requireAdmin(),
  asyncHandler(async (req, res) => {
    // In a real implementation, this would come from a configuration store
    const config = {
      maxRequestsPerMinute: 60,
      maxRequestsPerHour: 1000,
      dangerousModeTimeout: 30 * 60 * 1000,
      maxRiskScore: 100,
      riskScoreDecayRate: 0.1,
      maxViolationsPerHour: 10,
      violationLockoutDuration: 60 * 60 * 1000,
      maxActiveProjects: 10,
      maxActiveProcesses: 20,
    };

    res.json({
      success: true,
      data: config,
    });
  })
);

// Update security configuration (admin only)
router.put(
  '/config',
  authenticate,
  requireAdmin(),
  asyncHandler(async (req, res) => {
    const updates = req.body;

    // In a real implementation, this would update the configuration store
    // and notify the security context manager

    securityEventLogger.logEvent({
      id: `config_update_${Date.now()}`,
      type: SecurityEventType.CONFIGURATION_CHANGED,
      severity: SecurityLevel.MODERATE,
      timestamp: new Date(),
      userId: req.user!.id,
      sessionId: req.user!.sessionId,
      ipAddress: req.ip || 'unknown',
      resource: 'security_config',
      action: 'update',
      outcome: 'success',
      metadata: { updates },
    });

    res.json({
      success: true,
      message: 'Security configuration updated',
      data: updates,
    });
  })
);

// Test security alert (admin only, development mode only)
if (process.env.NODE_ENV === 'development') {
  router.post(
    '/test-alert',
    authenticate,
    requireAdmin(),
    asyncHandler(async (req, res) => {
      const { alertType } = req.body;

      // Trigger a test security event
      securityEventLogger.logEvent({
        id: `test_${Date.now()}`,
        type: alertType || SecurityEventType.SECURITY_VIOLATION,
        severity: SecurityLevel.MODERATE,
        timestamp: new Date(),
        userId: req.user!.id,
        sessionId: req.user!.sessionId,
        ipAddress: req.ip || 'unknown',
        resource: 'test',
        action: 'test_alert',
        outcome: 'success',
        metadata: { test: true },
      });

      res.json({
        success: true,
        message: 'Test security alert triggered',
      });
    })
  );
}

export default router;
