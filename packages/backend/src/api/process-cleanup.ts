import { Router } from 'express';
import { authenticate } from '../auth/middleware.js';
import { requireAdmin, requirePermission } from '../auth/permissions.js';
import { processCleanupHandler } from '../processes/cleanup-handler.js';
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
 * Get cleanup statistics
 */
router.get('/stats', authenticate, requirePermission('system', 'read'), async (req, res) => {
  try {
    const stats = processCleanupHandler.getCleanupStatistics();
    
    res.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error('Error getting cleanup stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get cleanup statistics',
    });
  }
});

/**
 * Perform cleanup for a specific session
 */
router.post('/:sessionId/cleanup', authenticate, requirePermission('session', 'write'), async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { reason = 'manual', priority = 2 } = req.body;
    const userId = req.user?.id;
    const sanitizedSessionId = sanitizeInput(sessionId);
    const sanitizedReason = sanitizeInput(reason);

    const results = await processCleanupHandler.performCleanup(
      sanitizedSessionId,
      sanitizedReason,
      priority
    );

    const successfulOperations = results.filter(r => r.success).length;
    const totalOperations = results.length;

    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'process_cleanup_manual',
      resourceType: 'process',
      resourceId: sessionId,
      userId,
      sessionId: req.session?.id || req.sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: successfulOperations === totalOperations ? 'success' : 'partial',
      severity: SecurityLevel.MODERATE,
      details: {
        processSessionId: sessionId,
        reason: sanitizedReason,
        totalOperations,
        successfulOperations,
        cleanupResults: results.map(r => ({
          operation: r.operation,
          success: r.success,
          duration: r.duration,
          resourcesReleased: r.resourcesReleased,
        })),
      },
    });

    res.json({
      success: true,
      message: `Cleanup completed: ${successfulOperations}/${totalOperations} operations successful`,
      results,
      summary: {
        totalOperations,
        successfulOperations,
        totalDuration: results.reduce((sum, r) => sum + r.duration, 0),
        resourcesReleased: results.reduce((sum, r) => ({
          processes: sum.processes + r.resourcesReleased.processes,
          files: sum.files + r.resourcesReleased.files,
          directories: sum.directories + r.resourcesReleased.directories,
          memoryBytes: sum.memoryBytes + r.resourcesReleased.memoryBytes,
        }), { processes: 0, files: 0, directories: 0, memoryBytes: 0 }),
      },
    });
  } catch (error) {
    console.error('Error performing cleanup:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to perform cleanup',
      error: (error as Error).message,
    });
  }
});

/**
 * Get cleanup history for a session
 */
router.get('/:sessionId/history', authenticate, requirePermission('session', 'read'), async (req, res) => {
  try {
    const { sessionId } = req.params;
    const sanitizedSessionId = sanitizeInput(sessionId);

    const history = processCleanupHandler.getCleanupHistory(sanitizedSessionId);

    res.json({
      success: true,
      history,
      count: history.length,
    });
  } catch (error) {
    console.error('Error getting cleanup history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get cleanup history',
    });
  }
});

/**
 * Handle process error (internal endpoint)
 */
router.post('/:sessionId/handle-error', authenticate, requirePermission('session', 'write'), async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { error, errorContext = {} } = req.body;
    const userId = req.user?.id;
    const sanitizedSessionId = sanitizeInput(sessionId);

    if (!error || !error.message) {
      return res.status(400).json({
        success: false,
        message: 'Error object with message is required',
      });
    }

    const recovered = await processCleanupHandler.handleProcessError(
      sanitizedSessionId,
      new Error(error.message),
      { ...errorContext, userId }
    );

    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'process_error_handled',
      resourceType: 'process',
      resourceId: sessionId,
      userId,
      sessionId: req.session?.id || req.sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: recovered ? 'success' : 'failure',
      severity: recovered ? SecurityLevel.MODERATE : SecurityLevel.DANGEROUS,
      details: {
        processSessionId: sessionId,
        errorMessage: error.message,
        recovered,
        errorContext,
      },
    });

    res.json({
      success: true,
      recovered,
      message: recovered ? 'Error handled and process recovered' : 'Error handled but recovery failed',
    });
  } catch (error) {
    console.error('Error handling process error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to handle process error',
    });
  }
});

/**
 * Emergency cleanup all processes (admin only)
 */
router.post('/emergency', authenticate, requireAdmin(), async (req, res) => {
  try {
    const { reason = 'manual_emergency' } = req.body;
    const userId = req.user?.id;
    const sanitizedReason = sanitizeInput(reason);

    await processCleanupHandler.emergencyCleanup(sanitizedReason);

    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'emergency_cleanup',
      resourceType: 'process_system',
      userId,
      sessionId: req.session?.id || req.sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: 'success',
      severity: SecurityLevel.CRITICAL,
      details: {
        reason: sanitizedReason,
        triggeredBy: 'admin',
        triggerMethod: 'api',
      },
    });

    res.json({
      success: true,
      message: 'Emergency cleanup completed',
      reason: sanitizedReason,
    });
  } catch (error) {
    console.error('Error during emergency cleanup:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to perform emergency cleanup',
    });
  }
});

/**
 * Test cleanup handler (development only)
 */
if (process.env.NODE_ENV !== 'production') {
  router.post('/test', authenticate, requireAdmin(), async (req, res) => {
    try {
      const { operation = 'memory_cleanup' } = req.body;
      
      // Create a test session for cleanup testing
      const testSessionId = `test_${Date.now()}`;
      
      res.json({
        success: true,
        message: 'Test cleanup endpoint available in development mode',
        testSessionId,
        note: 'This endpoint is for testing cleanup operations',
      });
    } catch (error) {
      console.error('Error in test cleanup:', error);
      res.status(500).json({
        success: false,
        message: 'Test cleanup failed',
      });
    }
  });
}

export default router;