import { Router } from 'express';
import { authenticate } from '../auth/middleware.js';
import { requireAdmin, requirePermission } from '../auth/permissions.js';
import { orchestrationManager } from '../docker/orchestration-manager.js';
import { serviceMesh } from '../docker/service-mesh.js';
import { comprehensiveAuditLogger, AuditCategory } from '../security/audit-logger.js';
import { SecurityLevel } from '../security/types.js';

const router = Router();

/**
 * Deploy a new service or application
 */
router.post('/deployments', authenticate, requirePermission('deployment', 'create'), async (req, res) => {
  try {
    const deploymentConfig = req.body;

    if (!deploymentConfig.name || !deploymentConfig.namespace || !deploymentConfig.services) {
      return res.status(400).json({
        success: false,
        message: 'Deployment name, namespace, and services are required',
      });
    }

    // Check if user has permission for dangerous profiles
    const hasDangerousProfile = deploymentConfig.services.some((service: any) => 
      service.securityProfile === 'DANGEROUS'
    );
    
    if (hasDangerousProfile && req.user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin role required for dangerous security profiles',
      });
    }

    const deploymentId = await orchestrationManager.deploy(deploymentConfig);

    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'deployment_created',
      resourceType: 'deployment',
      resourceId: deploymentId,
      userId: req.user?.id,
      sessionId: (req as any).session?.id || (req as any).sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: 'success',
      severity: hasDangerousProfile ? SecurityLevel.HIGH : SecurityLevel.MODERATE,
      details: {
        name: deploymentConfig.name,
        namespace: deploymentConfig.namespace,
        services: deploymentConfig.services.length,
        strategy: deploymentConfig.strategy,
        hasDangerousProfile,
      },
    });

    res.status(201).json({
      success: true,
      data: {
        deploymentId,
        config: deploymentConfig,
      },
    });
  } catch (error) {
    console.error('Error creating deployment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create deployment',
      error: (error as Error).message,
    });
  }
});

/**
 * Get deployment information
 */
router.get('/deployments/:deploymentId', authenticate, requirePermission('deployment', 'read'), async (req, res) => {
  try {
    const { deploymentId } = req.params;
    
    const deployment = orchestrationManager.getDeployment(deploymentId);
    if (!deployment) {
      return res.status(404).json({
        success: false,
        message: 'Deployment not found',
      });
    }

    // Get additional metrics
    const instances = Array.from(deployment.instances.values());
    const summary = {
      status: deployment.status,
      desiredReplicas: deployment.desiredReplicas,
      runningReplicas: deployment.runningReplicas,
      readyReplicas: deployment.readyReplicas,
      version: deployment.version,
      uptime: Date.now() - deployment.createdAt.getTime(),
      services: deployment.config.services.map(service => ({
        name: service.name,
        replicas: service.replicas,
        image: service.image,
        securityProfile: service.securityProfile,
        instances: instances.filter(i => i.serviceDefinition.name === service.name).map(i => ({
          id: i.id,
          status: i.status,
          health: i.health,
          restarts: i.restarts,
          node: i.node,
        })),
      })),
    };

    res.json({
      success: true,
      data: {
        deployment,
        summary,
      },
    });
  } catch (error) {
    console.error('Error getting deployment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get deployment information',
    });
  }
});

/**
 * List deployments
 */
router.get('/deployments', authenticate, requirePermission('deployment', 'read'), async (req, res) => {
  try {
    const { namespace, status, limit = '50' } = req.query;
    
    let deployments = orchestrationManager.listDeployments(namespace as string);
    
    // Filter by status if provided
    if (status) {
      deployments = deployments.filter(d => d.status === status);
    }
    
    // Limit results
    const limitNum = parseInt(limit as string);
    if (limitNum > 0) {
      deployments = deployments.slice(0, limitNum);
    }

    const summary = {
      total: deployments.length,
      byStatus: {
        running: deployments.filter(d => d.status === 'running').length,
        deploying: deployments.filter(d => d.status === 'deploying').length,
        updating: deployments.filter(d => d.status === 'updating').length,
        failed: deployments.filter(d => d.status === 'failed').length,
        stopped: deployments.filter(d => d.status === 'stopped').length,
      },
      totalInstances: deployments.reduce((sum, d) => sum + d.instances.size, 0),
      totalMemoryUsage: deployments.reduce((sum, d) => 
        sum + Array.from(d.instances.values()).reduce((instanceSum, i) => 
          instanceSum + i.serviceDefinition.resources.memory, 0
        ), 0
      ),
    };

    res.json({
      success: true,
      data: {
        summary,
        deployments: deployments.map(d => ({
          id: d.id,
          name: d.config.name,
          namespace: d.config.namespace,
          status: d.status,
          services: d.config.services.length,
          instances: d.instances.size,
          desiredReplicas: d.desiredReplicas,
          runningReplicas: d.runningReplicas,
          readyReplicas: d.readyReplicas,
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
          version: d.version,
        })),
      },
    });
  } catch (error) {
    console.error('Error listing deployments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to list deployments',
    });
  }
});

/**
 * Update a deployment
 */
router.put('/deployments/:deploymentId', authenticate, requirePermission('deployment', 'update'), async (req, res) => {
  try {
    const { deploymentId } = req.params;
    const updates = req.body;

    const success = await orchestrationManager.updateDeployment(deploymentId, updates);

    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'deployment_updated',
      resourceType: 'deployment',
      resourceId: deploymentId,
      userId: req.user?.id,
      sessionId: (req as any).session?.id || (req as any).sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: success ? 'success' : 'failure',
      severity: SecurityLevel.MODERATE,
      details: {
        deploymentId,
        updates: Object.keys(updates),
      },
    });

    if (success) {
      res.json({
        success: true,
        message: 'Deployment updated successfully',
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to update deployment',
      });
    }
  } catch (error) {
    console.error('Error updating deployment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update deployment',
      error: (error as Error).message,
    });
  }
});

/**
 * Scale a service within a deployment
 */
router.post('/deployments/:deploymentId/services/:serviceName/scale', 
  authenticate, requirePermission('deployment', 'update'), async (req, res) => {
  try {
    const { deploymentId, serviceName } = req.params;
    const { replicas } = req.body;

    if (typeof replicas !== 'number' || replicas < 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid replicas number is required',
      });
    }

    const success = await orchestrationManager.scaleService(deploymentId, serviceName, replicas);

    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'service_scaled',
      resourceType: 'deployment',
      resourceId: deploymentId,
      userId: req.user?.id,
      sessionId: (req as any).session?.id || (req as any).sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: success ? 'success' : 'failure',
      severity: SecurityLevel.MODERATE,
      details: {
        deploymentId,
        serviceName,
        replicas,
      },
    });

    if (success) {
      res.json({
        success: true,
        message: 'Service scaled successfully',
        data: { serviceName, replicas },
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to scale service',
      });
    }
  } catch (error) {
    console.error('Error scaling service:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to scale service',
      error: (error as Error).message,
    });
  }
});

/**
 * Stop a deployment
 */
router.post('/deployments/:deploymentId/stop', authenticate, requirePermission('deployment', 'delete'), async (req, res) => {
  try {
    const { deploymentId } = req.params;

    const success = await orchestrationManager.stopDeployment(deploymentId);

    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'deployment_stopped',
      resourceType: 'deployment',
      resourceId: deploymentId,
      userId: req.user?.id,
      sessionId: (req as any).session?.id || (req as any).sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: success ? 'success' : 'failure',
      severity: SecurityLevel.MODERATE,
      details: { deploymentId },
    });

    if (success) {
      res.json({
        success: true,
        message: 'Deployment stopped successfully',
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Deployment not found or could not be stopped',
      });
    }
  } catch (error) {
    console.error('Error stopping deployment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to stop deployment',
    });
  }
});

/**
 * Set auto-scaling policy
 */
router.post('/deployments/:deploymentId/services/:serviceName/autoscale', 
  authenticate, requirePermission('deployment', 'update'), async (req, res) => {
  try {
    const { deploymentId, serviceName } = req.params;
    const {
      minReplicas,
      maxReplicas,
      targetCPU = 70,
      targetMemory = 80,
      scaleUpCooldown = 300000,
      scaleDownCooldown = 600000,
      enabled = true,
    } = req.body;

    if (!minReplicas || !maxReplicas || minReplicas > maxReplicas) {
      return res.status(400).json({
        success: false,
        message: 'Valid minReplicas and maxReplicas are required',
      });
    }

    const policy = {
      name: `${deploymentId}-${serviceName}-autoscale`,
      deployment: deploymentId,
      service: serviceName,
      minReplicas,
      maxReplicas,
      targetCPU,
      targetMemory,
      scaleUpCooldown,
      scaleDownCooldown,
      enabled,
    };

    orchestrationManager.setScalingPolicy(policy);

    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'autoscaling_policy_set',
      resourceType: 'deployment',
      resourceId: deploymentId,
      userId: req.user?.id,
      sessionId: (req as any).session?.id || (req as any).sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: 'success',
      severity: SecurityLevel.SAFE,
      details: {
        deploymentId,
        serviceName,
        policy,
      },
    });

    res.json({
      success: true,
      message: 'Auto-scaling policy set successfully',
      data: policy,
    });
  } catch (error) {
    console.error('Error setting auto-scaling policy:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to set auto-scaling policy',
    });
  }
});

/**
 * Get orchestration statistics
 */
router.get('/stats', authenticate, requirePermission('system', 'read'), async (req, res) => {
  try {
    const orchestrationStats = orchestrationManager.getOrchestrationStats();
    const serviceMeshMetrics = serviceMesh.getMetrics();
    const circuitBreakerStatus = serviceMesh.getCircuitBreakerStatus();

    const stats = {
      orchestration: orchestrationStats,
      serviceMesh: {
        totalServices: Object.keys(serviceMeshMetrics).length,
        totalRequests: Object.values(serviceMeshMetrics).reduce((sum, m) => sum + m.requests.total, 0),
        successRate: calculateSuccessRate(serviceMeshMetrics),
        averageLatency: calculateAverageLatency(serviceMeshMetrics),
        circuitBreakers: {
          total: circuitBreakerStatus.length,
          open: circuitBreakerStatus.filter(cb => cb.state === 'open').length,
          halfOpen: circuitBreakerStatus.filter(cb => cb.state === 'half-open').length,
        },
      },
      timestamp: new Date().toISOString(),
    };

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Error getting orchestration stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get orchestration statistics',
    });
  }
});

/**
 * Service mesh routes
 */

/**
 * Register a service endpoint
 */
router.post('/services/register', authenticate, requirePermission('service', 'create'), async (req, res) => {
  try {
    const endpoint = req.body;

    if (!endpoint.serviceName || !endpoint.host || !endpoint.port) {
      return res.status(400).json({
        success: false,
        message: 'serviceName, host, and port are required',
      });
    }

    endpoint.id = endpoint.id || `${endpoint.serviceName}-${endpoint.host}-${endpoint.port}`;
    endpoint.weight = endpoint.weight || 1;
    endpoint.health = endpoint.health || 'unknown';
    endpoint.metadata = endpoint.metadata || {};
    endpoint.tags = endpoint.tags || [];

    serviceMesh.registerService(endpoint);

    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'service_registered',
      resourceType: 'service',
      resourceId: endpoint.id,
      userId: req.user?.id,
      sessionId: (req as any).session?.id || (req as any).sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: 'success',
      severity: SecurityLevel.SAFE,
      details: {
        serviceName: endpoint.serviceName,
        host: endpoint.host,
        port: endpoint.port,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Service endpoint registered successfully',
      data: endpoint,
    });
  } catch (error) {
    console.error('Error registering service:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to register service endpoint',
    });
  }
});

/**
 * Deregister a service endpoint
 */
router.delete('/services/:serviceName/endpoints/:endpointId', 
  authenticate, requirePermission('service', 'delete'), async (req, res) => {
  try {
    const { serviceName, endpointId } = req.params;

    const success = serviceMesh.deregisterService(serviceName, endpointId);

    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'service_deregistered',
      resourceType: 'service',
      resourceId: endpointId,
      userId: req.user?.id,
      sessionId: (req as any).session?.id || (req as any).sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: success ? 'success' : 'failure',
      severity: SecurityLevel.SAFE,
      details: { serviceName, endpointId },
    });

    if (success) {
      res.json({
        success: true,
        message: 'Service endpoint deregistered successfully',
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Service endpoint not found',
      });
    }
  } catch (error) {
    console.error('Error deregistering service:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to deregister service endpoint',
    });
  }
});

/**
 * Create service route
 */
router.post('/routes', authenticate, requirePermission('service', 'create'), async (req, res) => {
  try {
    const route = req.body;

    if (!route.name || !route.serviceName || !route.path) {
      return res.status(400).json({
        success: false,
        message: 'Route name, serviceName, and path are required',
      });
    }

    route.id = route.id || `${route.serviceName}-${route.path.replace(/[^a-zA-Z0-9]/g, '_')}`;
    route.method = route.method || ['GET'];
    route.timeout = route.timeout || 30000;
    route.retries = route.retries || 3;
    route.circuitBreaker = route.circuitBreaker || {
      enabled: true,
      threshold: 5,
      timeout: 60000,
      halfOpenMax: 3,
    };
    route.loadBalancing = route.loadBalancing || {
      strategy: 'round_robin',
      healthCheck: true,
    };

    serviceMesh.createRoute(route);

    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'service_route_created',
      resourceType: 'service_route',
      resourceId: route.id,
      userId: req.user?.id,
      sessionId: (req as any).session?.id || (req as any).sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: 'success',
      severity: SecurityLevel.SAFE,
      details: {
        routeName: route.name,
        serviceName: route.serviceName,
        path: route.path,
        methods: route.method,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Service route created successfully',
      data: route,
    });
  } catch (error) {
    console.error('Error creating service route:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create service route',
    });
  }
});

/**
 * Set traffic policy
 */
router.post('/services/:serviceName/traffic-policy', 
  authenticate, requirePermission('service', 'update'), async (req, res) => {
  try {
    const { serviceName } = req.params;
    const policy = req.body;

    if (!policy.rules || !Array.isArray(policy.rules)) {
      return res.status(400).json({
        success: false,
        message: 'Traffic policy rules are required',
      });
    }

    policy.serviceName = serviceName;
    serviceMesh.setTrafficPolicy(policy);

    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'traffic_policy_set',
      resourceType: 'service',
      resourceId: serviceName,
      userId: req.user?.id,
      sessionId: (req as any).session?.id || (req as any).sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: 'success',
      severity: SecurityLevel.MODERATE,
      details: {
        serviceName,
        rulesCount: policy.rules.length,
      },
    });

    res.json({
      success: true,
      message: 'Traffic policy set successfully',
      data: policy,
    });
  } catch (error) {
    console.error('Error setting traffic policy:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to set traffic policy',
    });
  }
});

/**
 * Discover services
 */
router.get('/services/discover', authenticate, requirePermission('service', 'read'), async (req, res) => {
  try {
    const { serviceName } = req.query;
    
    const services = serviceMesh.discoverServices(serviceName as string);
    
    res.json({
      success: true,
      data: {
        services,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error discovering services:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to discover services',
    });
  }
});

/**
 * Get service mesh metrics
 */
router.get('/services/metrics', authenticate, requirePermission('service', 'read'), async (req, res) => {
  try {
    const { serviceName } = req.query;
    
    const metrics = serviceMesh.getMetrics(serviceName as string);
    const circuitBreakers = serviceMesh.getCircuitBreakerStatus();
    
    res.json({
      success: true,
      data: {
        metrics,
        circuitBreakers,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error getting service metrics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get service metrics',
    });
  }
});

// Helper functions

function calculateSuccessRate(metrics: Record<string, any>): number {
  const values = Object.values(metrics);
  if (values.length === 0) return 0;
  
  const totalRequests = values.reduce((sum: number, m: any) => sum + m.requests.total, 0);
  const totalSuccess = values.reduce((sum: number, m: any) => sum + m.requests.success, 0);
  
  return totalRequests > 0 ? (totalSuccess / totalRequests) * 100 : 0;
}

function calculateAverageLatency(metrics: Record<string, any>): number {
  const values = Object.values(metrics);
  if (values.length === 0) return 0;
  
  const totalLatency = values.reduce((sum: number, m: any) => sum + m.requests.latency.p50, 0);
  return totalLatency / values.length;
}

export default router;