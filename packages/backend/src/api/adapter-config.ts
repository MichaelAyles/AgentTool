import { Router } from 'express';
import { authenticate } from '../auth/middleware.js';
import { requirePermission } from '../auth/permissions.js';
import { comprehensiveAuditLogger, AuditCategory } from '../security/audit-logger.js';
import { SecurityLevel } from '../security/types.js';
import { adapterConfigManager } from '../services/adapter-config-manager.js';

const router = Router();

// Input sanitization function
const sanitizeInput = (input: string): string => {
  if (typeof input !== 'string') return '';
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim();
};

/**
 * Get all adapter schemas
 */
router.get('/schemas', authenticate, requirePermission('adapter', 'read'), async (req, res) => {
  try {
    const schemas = adapterConfigManager.getAllSchemas();
    
    res.json({
      success: true,
      data: schemas,
    });
  } catch (error) {
    console.error('Error getting adapter schemas:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get adapter schemas',
    });
  }
});

/**
 * Get schema for a specific adapter
 */
router.get('/schemas/:adapterId', authenticate, requirePermission('adapter', 'read'), async (req, res) => {
  try {
    const adapterId = sanitizeInput(req.params.adapterId);
    const schema = adapterConfigManager.getSchema(adapterId);
    
    if (!schema) {
      return res.status(404).json({
        success: false,
        error: 'Schema not found',
      });
    }
    
    res.json({
      success: true,
      data: schema,
    });
  } catch (error) {
    console.error('Error getting adapter schema:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get adapter schema',
    });
  }
});

/**
 * Register a new adapter schema
 */
router.post('/schemas/:adapterId', authenticate, requirePermission('adapter', 'configure'), async (req, res) => {
  try {
    const adapterId = sanitizeInput(req.params.adapterId);
    const schema = req.body;
    const userId = req.user?.id || 'unknown';
    
    if (!schema || !schema.name || !schema.version) {
      return res.status(400).json({
        success: false,
        error: 'Invalid schema: name and version are required',
      });
    }
    
    await adapterConfigManager.registerSchema(adapterId, schema);
    
    res.status(201).json({
      success: true,
      message: 'Schema registered successfully',
    });
  } catch (error) {
    console.error('Error registering adapter schema:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to register adapter schema',
    });
  }
});

/**
 * Get all configurations for an adapter
 */
router.get('/configurations/:adapterId', authenticate, requirePermission('adapter', 'read'), async (req, res) => {
  try {
    const adapterId = sanitizeInput(req.params.adapterId);
    const configurations = adapterConfigManager.getAdapterConfigurations(adapterId);
    
    res.json({
      success: true,
      data: configurations,
    });
  } catch (error) {
    console.error('Error getting adapter configurations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get adapter configurations',
    });
  }
});

/**
 * Get active configuration for an adapter
 */
router.get('/configurations/:adapterId/active', authenticate, requirePermission('adapter', 'read'), async (req, res) => {
  try {
    const adapterId = sanitizeInput(req.params.adapterId);
    const activeConfig = adapterConfigManager.getActiveConfiguration(adapterId);
    
    if (!activeConfig) {
      return res.status(404).json({
        success: false,
        error: 'No active configuration found',
      });
    }
    
    res.json({
      success: true,
      data: activeConfig,
    });
  } catch (error) {
    console.error('Error getting active configuration:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get active configuration',
    });
  }
});

/**
 * Create a new configuration
 */
router.post('/configurations/:adapterId', authenticate, requirePermission('adapter', 'configure'), async (req, res) => {
  try {
    const adapterId = sanitizeInput(req.params.adapterId);
    const {
      name,
      description,
      configuration,
      isDefault = false,
      environment = 'development',
      tags = [],
      metadata = {},
    } = req.body;
    const userId = req.user?.id || 'unknown';
    
    if (!name || !configuration) {
      return res.status(400).json({
        success: false,
        error: 'Name and configuration are required',
      });
    }
    
    const newConfig = await adapterConfigManager.createConfiguration(
      adapterId,
      {
        adapterId,
        adapterVersion: '1.0.0', // TODO: Get from adapter registry
        name: sanitizeInput(name),
        description: description ? sanitizeInput(description) : undefined,
        isActive: false,
        isDefault,
        configuration,
        createdBy: userId,
        environment,
        tags: Array.isArray(tags) ? tags.map(tag => sanitizeInput(tag)) : [],
        metadata,
      },
      userId
    );
    
    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'adapter_configuration_created_via_api',
      resourceType: 'adapter_configuration',
      resourceId: newConfig.id,
      userId,
      sessionId: req.session?.id || req.sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: 'success',
      severity: SecurityLevel.SAFE,
      details: {
        adapterId,
        configurationName: newConfig.name,
        isDefault,
        environment,
      },
    });
    
    res.status(201).json({
      success: true,
      data: newConfig,
    });
  } catch (error) {
    console.error('Error creating configuration:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create configuration',
    });
  }
});

/**
 * Get a specific configuration
 */
router.get('/configuration/:configId', authenticate, requirePermission('adapter', 'read'), async (req, res) => {
  try {
    const configId = sanitizeInput(req.params.configId);
    const configuration = adapterConfigManager.getConfiguration(configId);
    
    if (!configuration) {
      return res.status(404).json({
        success: false,
        error: 'Configuration not found',
      });
    }
    
    res.json({
      success: true,
      data: configuration,
    });
  } catch (error) {
    console.error('Error getting configuration:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get configuration',
    });
  }
});

/**
 * Update a configuration
 */
router.put('/configuration/:configId', authenticate, requirePermission('adapter', 'configure'), async (req, res) => {
  try {
    const configId = sanitizeInput(req.params.configId);
    const {
      name,
      description,
      configuration,
      tags,
      metadata,
      changeReason,
    } = req.body;
    const userId = req.user?.id || 'unknown';
    
    const updates: any = {};
    
    if (name !== undefined) updates.name = sanitizeInput(name);
    if (description !== undefined) updates.description = sanitizeInput(description);
    if (configuration !== undefined) updates.configuration = configuration;
    if (tags !== undefined) updates.tags = Array.isArray(tags) ? tags.map(tag => sanitizeInput(tag)) : [];
    if (metadata !== undefined) updates.metadata = metadata;
    
    const updatedConfig = await adapterConfigManager.updateConfiguration(
      configId,
      updates,
      userId,
      changeReason ? sanitizeInput(changeReason) : undefined
    );
    
    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'adapter_configuration_updated_via_api',
      resourceType: 'adapter_configuration',
      resourceId: configId,
      userId,
      sessionId: req.session?.id || req.sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: 'success',
      severity: SecurityLevel.SAFE,
      details: {
        adapterId: updatedConfig.adapterId,
        configurationName: updatedConfig.name,
        changes: Object.keys(updates),
        changeReason,
      },
    });
    
    res.json({
      success: true,
      data: updatedConfig,
    });
  } catch (error) {
    console.error('Error updating configuration:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update configuration',
    });
  }
});

/**
 * Delete a configuration
 */
router.delete('/configuration/:configId', authenticate, requirePermission('adapter', 'configure'), async (req, res) => {
  try {
    const configId = sanitizeInput(req.params.configId);
    const userId = req.user?.id || 'unknown';
    
    const configuration = adapterConfigManager.getConfiguration(configId);
    if (!configuration) {
      return res.status(404).json({
        success: false,
        error: 'Configuration not found',
      });
    }
    
    await adapterConfigManager.deleteConfiguration(configId, userId);
    
    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'adapter_configuration_deleted_via_api',
      resourceType: 'adapter_configuration',
      resourceId: configId,
      userId,
      sessionId: req.session?.id || req.sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: 'success',
      severity: SecurityLevel.MODERATE,
      details: {
        adapterId: configuration.adapterId,
        configurationName: configuration.name,
      },
    });
    
    res.json({
      success: true,
      message: 'Configuration deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting configuration:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete configuration',
    });
  }
});

/**
 * Set active configuration for an adapter
 */
router.post('/configurations/:adapterId/active/:configId', authenticate, requirePermission('adapter', 'configure'), async (req, res) => {
  try {
    const adapterId = sanitizeInput(req.params.adapterId);
    const configId = sanitizeInput(req.params.configId);
    const userId = req.user?.id || 'unknown';
    
    await adapterConfigManager.setActiveConfiguration(adapterId, configId, userId);
    
    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'adapter_active_configuration_set_via_api',
      resourceType: 'adapter_configuration',
      resourceId: configId,
      userId,
      sessionId: req.session?.id || req.sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: 'success',
      severity: SecurityLevel.MODERATE,
      details: {
        adapterId,
        configId,
      },
    });
    
    res.json({
      success: true,
      message: 'Active configuration set successfully',
    });
  } catch (error) {
    console.error('Error setting active configuration:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to set active configuration',
    });
  }
});

/**
 * Validate a configuration against its schema
 */
router.post('/configuration/:configId/validate', authenticate, requirePermission('adapter', 'read'), async (req, res) => {
  try {
    const configId = sanitizeInput(req.params.configId);
    const configuration = adapterConfigManager.getConfiguration(configId);
    
    if (!configuration) {
      return res.status(404).json({
        success: false,
        error: 'Configuration not found',
      });
    }
    
    const schema = adapterConfigManager.getSchema(configuration.adapterId);
    if (!schema) {
      return res.status(404).json({
        success: false,
        error: 'Schema not found for this adapter',
      });
    }
    
    const validation = await adapterConfigManager.validateConfiguration(
      configuration.configuration,
      schema,
      configuration.adapterId
    );
    
    res.json({
      success: true,
      data: validation,
    });
  } catch (error) {
    console.error('Error validating configuration:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate configuration',
    });
  }
});

/**
 * Get configuration history
 */
router.get('/configuration/:configId/history', authenticate, requirePermission('adapter', 'read'), async (req, res) => {
  try {
    const configId = sanitizeInput(req.params.configId);
    const history = adapterConfigManager.getConfigurationHistory(configId);
    
    res.json({
      success: true,
      data: history,
    });
  } catch (error) {
    console.error('Error getting configuration history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get configuration history',
    });
  }
});

/**
 * Create configuration template
 */
router.post('/templates', authenticate, requirePermission('adapter', 'configure'), async (req, res) => {
  try {
    const {
      name,
      description,
      adapterId,
      configuration,
      isPublic = false,
      tags = [],
    } = req.body;
    const userId = req.user?.id || 'unknown';
    
    if (!name || !adapterId || !configuration) {
      return res.status(400).json({
        success: false,
        error: 'Name, adapterId, and configuration are required',
      });
    }
    
    const template = await adapterConfigManager.createTemplate(
      {
        name: sanitizeInput(name),
        description: description ? sanitizeInput(description) : undefined,
        adapterId: sanitizeInput(adapterId),
        configuration,
        isPublic,
        tags: Array.isArray(tags) ? tags.map(tag => sanitizeInput(tag)) : [],
      },
      userId
    );
    
    res.status(201).json({
      success: true,
      data: template,
    });
  } catch (error) {
    console.error('Error creating template:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create template',
    });
  }
});

/**
 * Export configuration as JSON
 */
router.get('/configuration/:configId/export', authenticate, requirePermission('adapter', 'read'), async (req, res) => {
  try {
    const configId = sanitizeInput(req.params.configId);
    const configuration = adapterConfigManager.getConfiguration(configId);
    
    if (!configuration) {
      return res.status(404).json({
        success: false,
        error: 'Configuration not found',
      });
    }
    
    const exportData = {
      metadata: {
        exportedAt: new Date().toISOString(),
        adapterId: configuration.adapterId,
        configurationName: configuration.name,
        version: configuration.adapterVersion,
      },
      schema: adapterConfigManager.getSchema(configuration.adapterId),
      configuration: configuration.configuration,
    };
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${configuration.name}-config.json"`);
    res.json(exportData);
  } catch (error) {
    console.error('Error exporting configuration:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export configuration',
    });
  }
});

/**
 * Import configuration from JSON
 */
router.post('/configuration/import', authenticate, requirePermission('adapter', 'configure'), async (req, res) => {
  try {
    const { importData, name } = req.body;
    const userId = req.user?.id || 'unknown';
    
    if (!importData || !importData.metadata || !importData.configuration) {
      return res.status(400).json({
        success: false,
        error: 'Invalid import data format',
      });
    }
    
    const { adapterId } = importData.metadata;
    const configName = sanitizeInput(name || `Imported ${importData.metadata.configurationName}`);
    
    const newConfig = await adapterConfigManager.createConfiguration(
      adapterId,
      {
        adapterId,
        adapterVersion: importData.metadata.version || '1.0.0',
        name: configName,
        description: `Imported from ${importData.metadata.configurationName}`,
        isActive: false,
        isDefault: false,
        configuration: importData.configuration,
        createdBy: userId,
        environment: 'development',
        tags: ['imported'],
        metadata: {
          importedAt: new Date(),
          originalName: importData.metadata.configurationName,
        },
      },
      userId
    );
    
    res.status(201).json({
      success: true,
      data: newConfig,
    });
  } catch (error) {
    console.error('Error importing configuration:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to import configuration',
    });
  }
});

export default router;