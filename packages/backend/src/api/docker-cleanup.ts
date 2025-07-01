import { Router } from 'express';
import { authenticate } from '../auth/middleware.js';
import { requireAdmin, requirePermission } from '../auth/permissions.js';
import { containerCleanup } from '../docker/container-cleanup.js';
import { comprehensiveAuditLogger, AuditCategory } from '../security/audit-logger.js';
import { SecurityLevel } from '../security/types.js';

const router = Router();

/**
 * Get all cleanup rules
 */
router.get('/rules', authenticate, requirePermission('container', 'read'), async (req, res) => {
  try {
    const rules = containerCleanup.getRules();
    
    res.json({
      success: true,
      data: {
        rules,
        total: rules.length,
        enabled: rules.filter(r => r.enabled).length,
      },
    });
  } catch (error) {
    console.error('Error getting cleanup rules:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get cleanup rules',
    });
  }
});

/**
 * Get a specific cleanup rule
 */
router.get('/rules/:ruleId', authenticate, requirePermission('container', 'read'), async (req, res) => {
  try {
    const { ruleId } = req.params;
    
    const rule = containerCleanup.getRule(ruleId);
    if (!rule) {
      return res.status(404).json({
        success: false,
        message: 'Cleanup rule not found',
      });
    }

    res.json({
      success: true,
      data: rule,
    });
  } catch (error) {
    console.error('Error getting cleanup rule:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get cleanup rule',
    });
  }
});

/**
 * Create a new cleanup rule
 */
router.post('/rules', authenticate, requireAdmin(), async (req, res) => {
  try {
    const rule = req.body;

    if (!rule.id || !rule.name || !rule.schedule) {
      return res.status(400).json({
        success: false,
        message: 'Rule ID, name, and schedule are required',
      });
    }

    // Set defaults
    rule.enabled = rule.enabled !== false;
    rule.dryRun = rule.dryRun !== false;
    rule.conditions = rule.conditions || {};
    rule.actions = rule.actions || {};
    rule.retentionPolicy = rule.retentionPolicy || {};

    containerCleanup.addRule(rule);

    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'cleanup_rule_created',
      resourceType: 'cleanup_rule',
      resourceId: rule.id,
      userId: req.user?.id,
      sessionId: (req as any).session?.id || (req as any).sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: 'success',
      severity: SecurityLevel.MODERATE,
      details: {
        ruleId: rule.id,
        name: rule.name,
        enabled: rule.enabled,
        schedule: rule.schedule,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Cleanup rule created successfully',
      data: rule,
    });
  } catch (error) {
    console.error('Error creating cleanup rule:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create cleanup rule',
      error: (error as Error).message,
    });
  }
});

/**
 * Update a cleanup rule
 */
router.put('/rules/:ruleId', authenticate, requireAdmin(), async (req, res) => {
  try {
    const { ruleId } = req.params;
    const updates = req.body;

    const existingRule = containerCleanup.getRule(ruleId);
    if (!existingRule) {
      return res.status(404).json({
        success: false,
        message: 'Cleanup rule not found',
      });
    }

    const updatedRule = { ...existingRule, ...updates, id: ruleId };
    containerCleanup.addRule(updatedRule);

    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'cleanup_rule_updated',
      resourceType: 'cleanup_rule',
      resourceId: ruleId,
      userId: req.user?.id,
      sessionId: (req as any).session?.id || (req as any).sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: 'success',
      severity: SecurityLevel.MODERATE,
      details: {
        ruleId,
        updates: Object.keys(updates),
      },
    });

    res.json({
      success: true,
      message: 'Cleanup rule updated successfully',
      data: updatedRule,
    });
  } catch (error) {
    console.error('Error updating cleanup rule:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update cleanup rule',
      error: (error as Error).message,
    });
  }
});

/**
 * Delete a cleanup rule
 */
router.delete('/rules/:ruleId', authenticate, requireAdmin(), async (req, res) => {
  try {
    const { ruleId } = req.params;

    const success = containerCleanup.removeRule(ruleId);

    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'cleanup_rule_deleted',
      resourceType: 'cleanup_rule',
      resourceId: ruleId,
      userId: req.user?.id,
      sessionId: (req as any).session?.id || (req as any).sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: success ? 'success' : 'failure',
      severity: SecurityLevel.MODERATE,
      details: { ruleId },
    });

    if (success) {
      res.json({
        success: true,
        message: 'Cleanup rule deleted successfully',
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Cleanup rule not found',
      });
    }
  } catch (error) {
    console.error('Error deleting cleanup rule:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete cleanup rule',
    });
  }
});

/**
 * Enable or disable a cleanup rule
 */
router.post('/rules/:ruleId/toggle', authenticate, requireAdmin(), async (req, res) => {
  try {
    const { ruleId } = req.params;
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'Enabled status must be a boolean',
      });
    }

    const success = containerCleanup.toggleRule(ruleId, enabled);

    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'cleanup_rule_toggled',
      resourceType: 'cleanup_rule',
      resourceId: ruleId,
      userId: req.user?.id,
      sessionId: (req as any).session?.id || (req as any).sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: success ? 'success' : 'failure',
      severity: SecurityLevel.SAFE,
      details: { ruleId, enabled },
    });

    if (success) {
      res.json({
        success: true,
        message: `Cleanup rule ${enabled ? 'enabled' : 'disabled'} successfully`,
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Cleanup rule not found',
      });
    }
  } catch (error) {
    console.error('Error toggling cleanup rule:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle cleanup rule',
    });
  }
});

/**
 * Execute a cleanup rule manually
 */
router.post('/rules/:ruleId/execute', authenticate, requirePermission('container', 'delete'), async (req, res) => {
  try {
    const { ruleId } = req.params;
    const { dryRun = false } = req.body;

    const result = await containerCleanup.executeRule(ruleId, dryRun);

    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'cleanup_rule_executed',
      resourceType: 'cleanup_rule',
      resourceId: ruleId,
      userId: req.user?.id,
      sessionId: (req as any).session?.id || (req as any).sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: 'success',
      severity: dryRun ? SecurityLevel.SAFE : SecurityLevel.MODERATE,
      details: {
        ruleId,
        dryRun,
        containersRemoved: result.containersRemoved,
        volumesRemoved: result.volumesRemoved,
        bytesFreed: result.bytesFreed,
      },
    });

    res.json({
      success: true,
      message: 'Cleanup rule executed successfully',
      data: result,
    });
  } catch (error) {
    console.error('Error executing cleanup rule:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to execute cleanup rule',
      error: (error as Error).message,
    });
  }
});

/**
 * Execute all cleanup rules
 */
router.post('/execute-all', authenticate, requireAdmin(), async (req, res) => {
  try {
    const { dryRun = false } = req.body;

    const results = await containerCleanup.executeAllRules(dryRun);

    const totalRemoved = results.reduce((sum, r) => sum + r.containersRemoved, 0);
    const totalBytesFreed = results.reduce((sum, r) => sum + r.bytesFreed, 0);

    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'all_cleanup_rules_executed',
      resourceType: 'cleanup_system',
      resourceId: 'all',
      userId: req.user?.id,
      sessionId: (req as any).session?.id || (req as any).sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: 'success',
      severity: dryRun ? SecurityLevel.SAFE : SecurityLevel.HIGH,
      details: {
        dryRun,
        rulesExecuted: results.length,
        totalContainersRemoved: totalRemoved,
        totalBytesFreed,
      },
    });

    res.json({
      success: true,
      message: 'All cleanup rules executed successfully',
      data: {
        results,
        summary: {
          rulesExecuted: results.length,
          totalContainersRemoved: totalRemoved,
          totalBytesFreed,
        },
      },
    });
  } catch (error) {
    console.error('Error executing all cleanup rules:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to execute all cleanup rules',
      error: (error as Error).message,
    });
  }
});

/**
 * Force cleanup specific containers
 */
router.post('/force-cleanup', authenticate, requireAdmin(), async (req, res) => {
  try {
    const { containerIds, removeVolumes = false, removeImages = false, gracePeriod = 30000 } = req.body;

    if (!Array.isArray(containerIds) || containerIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Container IDs array is required',
      });
    }

    const result = await containerCleanup.forceCleanup(containerIds, {
      removeVolumes,
      removeImages,
      gracePeriod,
    });

    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'force_cleanup_executed',
      resourceType: 'containers',
      resourceId: containerIds.join(','),
      userId: req.user?.id,
      sessionId: (req as any).session?.id || (req as any).sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: 'success',
      severity: SecurityLevel.HIGH,
      details: {
        containerCount: containerIds.length,
        successful: result.successful.length,
        failed: result.failed.length,
        removeVolumes,
        removeImages,
      },
    });

    res.json({
      success: true,
      message: 'Force cleanup completed',
      data: result,
    });
  } catch (error) {
    console.error('Error performing force cleanup:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to perform force cleanup',
      error: (error as Error).message,
    });
  }
});

/**
 * Get cleanup statistics
 */
router.get('/stats', authenticate, requirePermission('system', 'read'), async (req, res) => {
  try {
    const stats = containerCleanup.getStats();
    
    res.json({
      success: true,
      data: stats,
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
 * Get cleanup history
 */
router.get('/history', authenticate, requirePermission('system', 'read'), async (req, res) => {
  try {
    const { limit = '50' } = req.query;
    
    const history = containerCleanup.getHistory(parseInt(limit as string));
    
    res.json({
      success: true,
      data: {
        history,
        total: history.length,
      },
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
 * Get cleanup overview dashboard
 */
router.get('/overview', authenticate, requirePermission('system', 'read'), async (req, res) => {
  try {
    const stats = containerCleanup.getStats();
    const rules = containerCleanup.getRules();
    const recentHistory = containerCleanup.getHistory(10);
    
    const overview = {
      stats,
      rules: {
        total: rules.length,
        enabled: rules.filter(r => r.enabled).length,
        disabled: rules.filter(r => !r.enabled).length,
        dryRunOnly: rules.filter(r => r.dryRun).length,
      },
      recentActivity: recentHistory.map(h => ({
        ruleId: h.ruleId,
        ruleName: h.ruleName,
        timestamp: h.timestamp,
        containersRemoved: h.containersRemoved,
        bytesFreed: h.bytesFreed,
        success: h.errors.length === 0,
        dryRun: h.dryRun,
      })),
      systemHealth: {
        lastRunSuccess: stats.lastSuccess && stats.lastError ? 
          stats.lastSuccess.getTime() > stats.lastError.getTime() : 
          !!stats.lastSuccess,
        daysSinceLastRun: stats.lastRun ? 
          Math.floor((Date.now() - stats.lastRun.getTime()) / 86400000) : 
          null,
        averageRunTime: Math.round(stats.averageRunTime),
      },
    };

    res.json({
      success: true,
      data: overview,
    });
  } catch (error) {
    console.error('Error getting cleanup overview:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get cleanup overview',
    });
  }
});

export default router;