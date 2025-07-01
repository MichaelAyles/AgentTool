import { Router } from 'express';
import { authenticate } from '../auth/middleware.js';
import { requireAdmin, requirePermission } from '../auth/permissions.js';
import { sandboxManager } from '../docker/sandbox-manager.js';
import { SECURITY_PROFILES, SecurityPolicyEnforcer, profileManager } from '../docker/security-profiles.js';
import { containerRegistry } from '../docker/container-registry.js';
import { comprehensiveAuditLogger, AuditCategory } from '../security/audit-logger.js';
import { SecurityLevel } from '../security/types.js';

const router = Router();

/**
 * Create a new sandbox instance
 */
router.post('/sandboxes', authenticate, requirePermission('sandbox', 'create'), async (req, res) => {
  try {
    const { 
      securityProfile = 'SAFE_MODE',
      image,
      customConfig = {},
      workingDir,
      memoryLimit,
      cpuLimit,
      timeout,
    } = req.body;

    // Get security profile
    const profile = profileManager.getProfile(securityProfile);
    if (!profile) {
      return res.status(400).json({
        success: false,
        message: `Security profile '${securityProfile}' not found`,
      });
    }

    // Check if user has permission for this profile risk level
    if (profile.riskLevel === 'dangerous' && req.user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin role required for dangerous security profile',
      });
    }

    // Build sandbox configuration
    const sandboxConfig = {
      ...profile.config,
      ...customConfig,
      image: image || profile.config.image,
      workingDir: workingDir || profile.config.workingDir,
      memoryLimit: memoryLimit || profile.config.memoryLimit,
      cpuLimit: cpuLimit || profile.config.cpuLimit,
      timeout: timeout || profile.config.timeout,
    };

    // Create sandbox
    const sandboxId = await sandboxManager.createSandbox(sandboxConfig);

    // Log audit event
    const userId = req.user?.id;
    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'sandbox_created',
      resourceType: 'sandbox',
      resourceId: sandboxId,
      userId,
      sessionId: (req as any).session?.id || (req as any).sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: 'success',
      severity: profile.riskLevel === 'dangerous' ? SecurityLevel.HIGH : SecurityLevel.MODERATE,
      details: {
        securityProfile,
        riskLevel: profile.riskLevel,
        image: sandboxConfig.image,
        memoryLimit: sandboxConfig.memoryLimit,
        cpuLimit: sandboxConfig.cpuLimit,
      },
    });

    res.status(201).json({
      success: true,
      data: {
        sandboxId,
        securityProfile,
        riskLevel: profile.riskLevel,
        config: sandboxConfig,
        recommendations: SecurityPolicyEnforcer.getSecurityRecommendations(profile),
      },
    });
  } catch (error) {
    console.error('Error creating sandbox:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create sandbox',
      error: (error as Error).message,
    });
  }
});

/**
 * Execute command in sandbox
 */
router.post('/sandboxes/:sandboxId/execute', authenticate, requirePermission('sandbox', 'execute'), async (req, res) => {
  try {
    const { sandboxId } = req.params;
    const { command, args = [], workingDirectory, environment, stdin, timeout, user } = req.body;

    if (!command) {
      return res.status(400).json({
        success: false,
        message: 'Command is required',
      });
    }

    // Get sandbox information
    const sandbox = sandboxManager.getSandbox(sandboxId);
    if (!sandbox) {
      return res.status(404).json({
        success: false,
        message: 'Sandbox not found',
      });
    }

    // Get security profile for validation
    const profile = profileManager.getProfile(sandbox.config.environmentVariables?.SECURITY_PROFILE || 'SAFE_MODE');
    if (!profile) {
      return res.status(500).json({
        success: false,
        message: 'Security profile configuration error',
      });
    }

    // Validate command against security policy
    const fullCommand = [command, ...args].join(' ');
    const validation = SecurityPolicyEnforcer.validateCommand(fullCommand, profile);
    
    if (!validation.allowed) {
      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.SECURITY_VIOLATIONS,
        action: 'command_blocked',
        resourceType: 'sandbox',
        resourceId: sandboxId,
        userId: req.user?.id,
        sessionId: (req as any).session?.id || (req as any).sessionID,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        outcome: 'blocked',
        severity: SecurityLevel.HIGH,
        details: {
          command: fullCommand,
          violations: validation.violations,
          riskLevel: validation.riskLevel,
        },
      });

      return res.status(403).json({
        success: false,
        message: 'Command blocked by security policy',
        violations: validation.violations,
        riskLevel: validation.riskLevel,
      });
    }

    // Validate environment variables if provided
    if (environment) {
      const envValidation = SecurityPolicyEnforcer.validateEnvironment(environment, profile);
      if (!envValidation.allowed) {
        return res.status(403).json({
          success: false,
          message: 'Environment variables blocked by security policy',
          violations: envValidation.violations,
        });
      }
    }

    // Execute command
    const result = await sandboxManager.executeCommand(sandboxId, {
      command,
      args,
      workingDirectory,
      environment,
      stdin,
      timeout,
      user,
    });

    // Log successful execution
    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_OPERATIONS,
      action: 'command_executed',
      resourceType: 'sandbox',
      resourceId: sandboxId,
      userId: req.user?.id,
      sessionId: (req as any).session?.id || (req as any).sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: result.exitCode === 0 ? 'success' : 'failure',
      severity: SecurityLevel.SAFE,
      details: {
        command: fullCommand,
        exitCode: result.exitCode,
        executionTime: result.executionTime,
        securityViolations: result.securityViolations.length,
        memoryUsage: result.resourceUsage.memory,
        cpuUsage: result.resourceUsage.cpu,
      },
    });

    res.json({
      success: true,
      data: {
        result,
        validation: {
          securityViolations: validation.violations,
          riskLevel: validation.riskLevel,
        },
      },
    });
  } catch (error) {
    console.error('Error executing command in sandbox:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to execute command',
      error: (error as Error).message,
    });
  }
});

/**
 * Get sandbox information
 */
router.get('/sandboxes/:sandboxId', authenticate, requirePermission('sandbox', 'read'), async (req, res) => {
  try {
    const { sandboxId } = req.params;
    
    const sandbox = sandboxManager.getSandbox(sandboxId);
    if (!sandbox) {
      return res.status(404).json({
        success: false,
        message: 'Sandbox not found',
      });
    }

    // Get current resource statistics
    const stats = await sandboxManager.getSandboxStats(sandboxId);

    res.json({
      success: true,
      data: {
        sandbox,
        stats,
      },
    });
  } catch (error) {
    console.error('Error getting sandbox info:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get sandbox information',
    });
  }
});

/**
 * List all sandboxes
 */
router.get('/sandboxes', authenticate, requirePermission('sandbox', 'read'), async (req, res) => {
  try {
    const { status, userId, limit = '50' } = req.query;
    
    let sandboxes = sandboxManager.listSandboxes();
    
    // Filter by status if provided
    if (status) {
      sandboxes = sandboxes.filter(sandbox => sandbox.status === status);
    }
    
    // Filter by user if provided and user is admin
    if (userId && req.user?.role === 'admin') {
      // Would need to track sandbox ownership
    }
    
    // Limit results
    const limitNum = parseInt(limit as string);
    if (limitNum > 0) {
      sandboxes = sandboxes.slice(0, limitNum);
    }

    const summary = {
      total: sandboxes.length,
      byStatus: {
        running: sandboxes.filter(s => s.status === 'running').length,
        stopped: sandboxes.filter(s => s.status === 'stopped').length,
        error: sandboxes.filter(s => s.status === 'error').length,
      },
      totalMemoryUsage: sandboxes.reduce((sum, s) => sum + s.resourceUsage.memory, 0),
      totalCpuUsage: sandboxes.reduce((sum, s) => sum + s.resourceUsage.cpu, 0),
    };

    res.json({
      success: true,
      data: {
        summary,
        sandboxes,
      },
    });
  } catch (error) {
    console.error('Error listing sandboxes:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to list sandboxes',
    });
  }
});

/**
 * Destroy a sandbox
 */
router.delete('/sandboxes/:sandboxId', authenticate, requirePermission('sandbox', 'delete'), async (req, res) => {
  try {
    const { sandboxId } = req.params;
    
    const success = await sandboxManager.destroySandbox(sandboxId);
    
    if (success) {
      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.SYSTEM_CHANGES,
        action: 'sandbox_destroyed',
        resourceType: 'sandbox',
        resourceId: sandboxId,
        userId: req.user?.id,
        sessionId: (req as any).session?.id || (req as any).sessionID,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        outcome: 'success',
        severity: SecurityLevel.SAFE,
        details: { sandboxId },
      });

      res.json({
        success: true,
        message: 'Sandbox destroyed successfully',
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Sandbox not found or could not be destroyed',
      });
    }
  } catch (error) {
    console.error('Error destroying sandbox:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to destroy sandbox',
    });
  }
});

/**
 * Get available security profiles
 */
router.get('/profiles', authenticate, requirePermission('sandbox', 'read'), async (req, res) => {
  try {
    const profiles = profileManager.listProfiles();
    
    // Filter profiles based on user role
    const filteredProfiles = profiles.filter(({ profile }) => {
      if (profile.riskLevel === 'dangerous' && req.user?.role !== 'admin') {
        return false;
      }
      return true;
    });

    const profilesWithRecommendations = filteredProfiles.map(({ name, profile }) => ({
      name,
      profile: {
        ...profile,
        recommendations: SecurityPolicyEnforcer.getSecurityRecommendations(profile),
      },
    }));

    res.json({
      success: true,
      data: {
        profiles: profilesWithRecommendations,
        recommended: {
          untrusted_code: profileManager.getRecommendedProfile('untrusted_code'),
          development: profileManager.getRecommendedProfile('development'),
          testing: profileManager.getRecommendedProfile('testing'),
          education: profileManager.getRecommendedProfile('education'),
        },
      },
    });
  } catch (error) {
    console.error('Error getting security profiles:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get security profiles',
    });
  }
});

/**
 * Validate command against security policy
 */
router.post('/validate', authenticate, requirePermission('sandbox', 'read'), async (req, res) => {
  try {
    const { command, securityProfile = 'SAFE_MODE', environment = {} } = req.body;

    if (!command) {
      return res.status(400).json({
        success: false,
        message: 'Command is required',
      });
    }

    const profile = profileManager.getProfile(securityProfile);
    if (!profile) {
      return res.status(400).json({
        success: false,
        message: `Security profile '${securityProfile}' not found`,
      });
    }

    const commandValidation = SecurityPolicyEnforcer.validateCommand(command, profile);
    const envValidation = SecurityPolicyEnforcer.validateEnvironment(environment, profile);

    res.json({
      success: true,
      data: {
        command: {
          allowed: commandValidation.allowed,
          violations: commandValidation.violations,
          riskLevel: commandValidation.riskLevel,
        },
        environment: {
          allowed: envValidation.allowed,
          violations: envValidation.violations,
        },
        profile: {
          name: securityProfile,
          riskLevel: profile.riskLevel,
          recommendations: SecurityPolicyEnforcer.getSecurityRecommendations(profile),
        },
      },
    });
  } catch (error) {
    console.error('Error validating command:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate command',
    });
  }
});

/**
 * Get container images
 */
router.get('/images', authenticate, requirePermission('system', 'read'), async (req, res) => {
  try {
    const images = await containerRegistry.listImages();
    const stats = await containerRegistry.getRegistryStats();

    res.json({
      success: true,
      data: {
        images,
        stats,
      },
    });
  } catch (error) {
    console.error('Error getting container images:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get container images',
    });
  }
});

/**
 * Build container image
 */
router.post('/images/build', authenticate, requireAdmin(), async (req, res) => {
  try {
    const { name, tag, dockerfile, context, buildArgs = {}, labels = {}, options = {} } = req.body;

    if (!name || !tag || !dockerfile) {
      return res.status(400).json({
        success: false,
        message: 'Name, tag, and dockerfile are required',
      });
    }

    const buildResult = await containerRegistry.buildImage(name, tag, {
      dockerfile,
      context: context || '/tmp',
      buildArgs,
      labels: {
        ...labels,
        'vibe.built_by': req.user?.id || 'unknown',
        'vibe.built_at': new Date().toISOString(),
      },
      ...options,
    });

    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'image_built',
      resourceType: 'container_image',
      resourceId: `${name}:${tag}`,
      userId: req.user?.id,
      sessionId: (req as any).session?.id || (req as any).sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: buildResult.success ? 'success' : 'failure',
      severity: SecurityLevel.MODERATE,
      details: {
        name,
        tag,
        buildArgs,
        labels,
        success: buildResult.success,
      },
    });

    res.json({
      success: buildResult.success,
      data: buildResult,
    });
  } catch (error) {
    console.error('Error building image:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to build image',
    });
  }
});

/**
 * Pull container image
 */
router.post('/images/pull', authenticate, requireAdmin(), async (req, res) => {
  try {
    const { name, tag = 'latest' } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Image name is required',
      });
    }

    const pullResult = await containerRegistry.pullImage(name, tag);

    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'image_pulled',
      resourceType: 'container_image',
      resourceId: `${name}:${tag}`,
      userId: req.user?.id,
      sessionId: (req as any).session?.id || (req as any).sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: pullResult.success ? 'success' : 'failure',
      severity: SecurityLevel.SAFE,
      details: {
        name,
        tag,
        success: pullResult.success,
      },
    });

    res.json({
      success: pullResult.success,
      data: pullResult,
    });
  } catch (error) {
    console.error('Error pulling image:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to pull image',
    });
  }
});

/**
 * Remove container image
 */
router.delete('/images/:imageId', authenticate, requireAdmin(), async (req, res) => {
  try {
    const { imageId } = req.params;
    const { force = false } = req.query;

    const success = await containerRegistry.removeImage(imageId, Boolean(force));

    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'image_removed',
      resourceType: 'container_image',
      resourceId: imageId,
      userId: req.user?.id,
      sessionId: (req as any).session?.id || (req as any).sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: success ? 'success' : 'failure',
      severity: SecurityLevel.MODERATE,
      details: {
        imageId,
        force: Boolean(force),
        success,
      },
    });

    if (success) {
      res.json({
        success: true,
        message: 'Image removed successfully',
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Image not found or could not be removed',
      });
    }
  } catch (error) {
    console.error('Error removing image:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove image',
    });
  }
});

/**
 * Create sandbox images
 */
router.post('/images/create-sandbox-images', authenticate, requireAdmin(), async (req, res) => {
  try {
    const result = await containerRegistry.createSandboxImages();

    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'sandbox_images_created',
      resourceType: 'container_image',
      userId: req.user?.id,
      sessionId: (req as any).session?.id || (req as any).sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: result.success ? 'success' : 'failure',
      severity: SecurityLevel.MODERATE,
      details: {
        created: result.created,
        success: result.success,
      },
    });

    res.json({
      success: result.success,
      data: result,
    });
  } catch (error) {
    console.error('Error creating sandbox images:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create sandbox images',
    });
  }
});

/**
 * Cleanup unused images
 */
router.post('/images/cleanup', authenticate, requireAdmin(), async (req, res) => {
  try {
    const result = await containerRegistry.cleanupUnusedImages();

    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'images_cleaned_up',
      resourceType: 'container_image',
      userId: req.user?.id,
      sessionId: (req as any).session?.id || (req as any).sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: 'success',
      severity: SecurityLevel.SAFE,
      details: {
        removed: result.removed.length,
        spaceReclaimed: result.spaceReclaimed,
      },
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error cleaning up images:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cleanup images',
    });
  }
});

export default router;