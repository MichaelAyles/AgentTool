import { EventEmitter } from 'events';
import { sandboxManager } from './sandbox-manager.js';
import { SECURITY_PROFILES, profileManager } from './security-profiles.js';
import { containerRegistry } from './container-registry.js';
import { structuredLogger } from '../middleware/logging.js';
import { v4 as uuidv4 } from 'uuid';

export interface ServiceDefinition {
  name: string;
  image: string;
  replicas: number;
  securityProfile: string;
  resources: {
    memory: number;
    cpu: number;
    disk: number;
  };
  environment: Record<string, string>;
  volumes: Array<{ host: string; container: string; mode: 'ro' | 'rw' }>;
  networks: string[];
  healthCheck: {
    command: string;
    interval: number;
    timeout: number;
    retries: number;
  };
  restartPolicy: 'never' | 'on-failure' | 'always';
  labels: Record<string, string>;
}

export interface DeploymentConfig {
  name: string;
  namespace: string;
  services: ServiceDefinition[];
  strategy: 'rolling' | 'blue-green' | 'canary';
  maxUnavailable: number;
  maxSurge: number;
  progressDeadline: number;
  rollbackOnFailure: boolean;
}

export interface ServiceInstance {
  id: string;
  serviceDefinition: ServiceDefinition;
  sandboxId: string;
  status: 'pending' | 'running' | 'stopping' | 'stopped' | 'failed';
  health: 'healthy' | 'unhealthy' | 'unknown';
  createdAt: Date;
  lastHealthCheck: Date;
  restarts: number;
  node: string;
  metadata: Record<string, any>;
}

export interface Deployment {
  id: string;
  config: DeploymentConfig;
  status: 'deploying' | 'running' | 'updating' | 'failed' | 'stopped';
  instances: Map<string, ServiceInstance>;
  desiredReplicas: number;
  runningReplicas: number;
  readyReplicas: number;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export interface ScalingPolicy {
  name: string;
  deployment: string;
  service: string;
  minReplicas: number;
  maxReplicas: number;
  targetCPU: number;
  targetMemory: number;
  scaleUpCooldown: number;
  scaleDownCooldown: number;
  enabled: boolean;
}

export class OrchestrationManager extends EventEmitter {
  private deployments = new Map<string, Deployment>();
  private scalingPolicies = new Map<string, ScalingPolicy>();
  private healthCheckInterval: NodeJS.Timeout;
  private scalingInterval: NodeJS.Timeout;
  private loadBalancers = new Map<string, LoadBalancer>();
  
  private config = {
    healthCheckInterval: 30000, // 30 seconds
    scalingCheckInterval: 60000, // 1 minute
    maxConcurrentOperations: 10,
    defaultHealthTimeout: 10000,
    defaultProgressDeadline: 300000, // 5 minutes
  };

  constructor() {
    super();
    
    this.startHealthMonitoring();
    this.startAutoScaling();
    
    structuredLogger.info('Orchestration manager initialized');
  }

  /**
   * Deploy a new service or update existing deployment
   */
  async deploy(config: DeploymentConfig): Promise<string> {
    const deploymentId = uuidv4();
    
    try {
      structuredLogger.info('Starting deployment', { 
        deploymentId, 
        name: config.name,
        namespace: config.namespace,
        services: config.services.length 
      });

      // Validate deployment configuration
      const validation = this.validateDeploymentConfig(config);
      if (!validation.valid) {
        throw new Error(`Invalid deployment config: ${validation.errors.join(', ')}`);
      }

      // Create deployment object
      const deployment: Deployment = {
        id: deploymentId,
        config,
        status: 'deploying',
        instances: new Map(),
        desiredReplicas: config.services.reduce((sum, svc) => sum + svc.replicas, 0),
        runningReplicas: 0,
        readyReplicas: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 1,
      };

      this.deployments.set(deploymentId, deployment);

      // Deploy services based on strategy
      switch (config.strategy) {
        case 'rolling':
          await this.executeRollingDeployment(deployment);
          break;
        case 'blue-green':
          await this.executeBlueGreenDeployment(deployment);
          break;
        case 'canary':
          await this.executeCanaryDeployment(deployment);
          break;
        default:
          throw new Error(`Unknown deployment strategy: ${config.strategy}`);
      }

      deployment.status = 'running';
      deployment.updatedAt = new Date();

      this.emit('deploymentComplete', deployment);
      structuredLogger.info('Deployment completed successfully', { 
        deploymentId, 
        name: config.name,
        runningReplicas: deployment.runningReplicas 
      });

      return deploymentId;
    } catch (error) {
      const deployment = this.deployments.get(deploymentId);
      if (deployment) {
        deployment.status = 'failed';
        deployment.updatedAt = new Date();
      }

      structuredLogger.error('Deployment failed', error as Error, { 
        deploymentId, 
        name: config.name 
      });
      throw error;
    }
  }

  /**
   * Update an existing deployment
   */
  async updateDeployment(
    deploymentId: string, 
    updates: Partial<DeploymentConfig>
  ): Promise<boolean> {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment ${deploymentId} not found`);
    }

    try {
      structuredLogger.info('Updating deployment', { deploymentId, updates });

      deployment.status = 'updating';
      deployment.config = { ...deployment.config, ...updates };
      deployment.version++;
      deployment.updatedAt = new Date();

      // Execute update based on strategy
      await this.executeRollingUpdate(deployment);

      deployment.status = 'running';
      this.emit('deploymentUpdated', deployment);

      structuredLogger.info('Deployment updated successfully', { deploymentId });
      return true;
    } catch (error) {
      deployment.status = 'failed';
      structuredLogger.error('Deployment update failed', error as Error, { deploymentId });
      throw error;
    }
  }

  /**
   * Scale a service within a deployment
   */
  async scaleService(
    deploymentId: string, 
    serviceName: string, 
    replicas: number
  ): Promise<boolean> {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment ${deploymentId} not found`);
    }

    const service = deployment.config.services.find(s => s.name === serviceName);
    if (!service) {
      throw new Error(`Service ${serviceName} not found in deployment`);
    }

    try {
      structuredLogger.info('Scaling service', { 
        deploymentId, 
        serviceName, 
        currentReplicas: service.replicas,
        targetReplicas: replicas 
      });

      const oldReplicas = service.replicas;
      service.replicas = replicas;

      if (replicas > oldReplicas) {
        // Scale up
        await this.scaleUp(deployment, service, replicas - oldReplicas);
      } else if (replicas < oldReplicas) {
        // Scale down
        await this.scaleDown(deployment, service, oldReplicas - replicas);
      }

      deployment.desiredReplicas = deployment.config.services.reduce((sum, svc) => sum + svc.replicas, 0);
      deployment.updatedAt = new Date();

      this.emit('serviceScaled', { deploymentId, serviceName, replicas });
      structuredLogger.info('Service scaled successfully', { 
        deploymentId, 
        serviceName, 
        replicas 
      });

      return true;
    } catch (error) {
      structuredLogger.error('Service scaling failed', error as Error, { 
        deploymentId, 
        serviceName 
      });
      throw error;
    }
  }

  /**
   * Stop a deployment
   */
  async stopDeployment(deploymentId: string): Promise<boolean> {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment ${deploymentId} not found`);
    }

    try {
      structuredLogger.info('Stopping deployment', { deploymentId });

      deployment.status = 'stopping';

      // Stop all instances
      const stopPromises = Array.from(deployment.instances.values()).map(async (instance) => {
        try {
          await sandboxManager.destroySandbox(instance.sandboxId);
          instance.status = 'stopped';
        } catch (error) {
          structuredLogger.error('Failed to stop instance', error as Error, { 
            instanceId: instance.id 
          });
          instance.status = 'failed';
        }
      });

      await Promise.allSettled(stopPromises);

      deployment.status = 'stopped';
      deployment.runningReplicas = 0;
      deployment.readyReplicas = 0;
      deployment.updatedAt = new Date();

      this.emit('deploymentStopped', deployment);
      structuredLogger.info('Deployment stopped successfully', { deploymentId });

      return true;
    } catch (error) {
      structuredLogger.error('Failed to stop deployment', error as Error, { deploymentId });
      throw error;
    }
  }

  /**
   * Get deployment information
   */
  getDeployment(deploymentId: string): Deployment | undefined {
    return this.deployments.get(deploymentId);
  }

  /**
   * List all deployments
   */
  listDeployments(namespace?: string): Deployment[] {
    const deployments = Array.from(this.deployments.values());
    
    if (namespace) {
      return deployments.filter(d => d.config.namespace === namespace);
    }
    
    return deployments;
  }

  /**
   * Create or update scaling policy
   */
  setScalingPolicy(policy: ScalingPolicy): void {
    this.scalingPolicies.set(`${policy.deployment}:${policy.service}`, policy);
    
    structuredLogger.info('Scaling policy set', { 
      name: policy.name,
      deployment: policy.deployment,
      service: policy.service,
      minReplicas: policy.minReplicas,
      maxReplicas: policy.maxReplicas 
    });
  }

  /**
   * Get orchestration statistics
   */
  getOrchestrationStats(): {
    totalDeployments: number;
    runningDeployments: number;
    totalInstances: number;
    healthyInstances: number;
    totalMemoryUsage: number;
    totalCpuUsage: number;
    scalingPolicies: number;
  } {
    const deployments = Array.from(this.deployments.values());
    const allInstances = deployments.flatMap(d => Array.from(d.instances.values()));

    return {
      totalDeployments: deployments.length,
      runningDeployments: deployments.filter(d => d.status === 'running').length,
      totalInstances: allInstances.length,
      healthyInstances: allInstances.filter(i => i.health === 'healthy').length,
      totalMemoryUsage: allInstances.reduce((sum, i) => sum + i.serviceDefinition.resources.memory, 0),
      totalCpuUsage: allInstances.reduce((sum, i) => sum + i.serviceDefinition.resources.cpu, 0),
      scalingPolicies: this.scalingPolicies.size,
    };
  }

  // Private methods

  private async executeRollingDeployment(deployment: Deployment): Promise<void> {
    for (const service of deployment.config.services) {
      await this.deployService(deployment, service);
    }
  }

  private async executeBlueGreenDeployment(deployment: Deployment): Promise<void> {
    // Deploy to "green" environment
    const greenInstances = new Map<string, ServiceInstance>();
    
    for (const service of deployment.config.services) {
      const instances = await this.createServiceInstances(deployment, service);
      instances.forEach(instance => greenInstances.set(instance.id, instance));
    }

    // Wait for all instances to be healthy
    await this.waitForHealthyInstances(Array.from(greenInstances.values()));

    // Switch traffic (in a real implementation, this would update load balancers)
    deployment.instances = greenInstances;
    deployment.runningReplicas = greenInstances.size;
    deployment.readyReplicas = greenInstances.size;
  }

  private async executeCanaryDeployment(deployment: Deployment): Promise<void> {
    // Deploy a small percentage first
    const canaryPercentage = 0.1;
    
    for (const service of deployment.config.services) {
      const canaryReplicas = Math.max(1, Math.floor(service.replicas * canaryPercentage));
      
      // Deploy canary instances
      const canaryService = { ...service, replicas: canaryReplicas };
      await this.deployService(deployment, canaryService);
      
      // Monitor canary for success metrics
      await this.monitorCanaryDeployment(deployment, service.name);
      
      // Deploy remaining instances
      const remainingService = { ...service, replicas: service.replicas - canaryReplicas };
      await this.deployService(deployment, remainingService);
    }
  }

  private async executeRollingUpdate(deployment: Deployment): Promise<void> {
    for (const service of deployment.config.services) {
      await this.updateServiceInstances(deployment, service);
    }
  }

  private async deployService(deployment: Deployment, service: ServiceDefinition): Promise<void> {
    const instances = await this.createServiceInstances(deployment, service);
    
    instances.forEach(instance => {
      deployment.instances.set(instance.id, instance);
    });

    deployment.runningReplicas += instances.length;
    deployment.readyReplicas += instances.filter(i => i.health === 'healthy').length;
  }

  private async createServiceInstances(
    deployment: Deployment, 
    service: ServiceDefinition
  ): Promise<ServiceInstance[]> {
    const instances: ServiceInstance[] = [];
    
    for (let i = 0; i < service.replicas; i++) {
      const instance = await this.createServiceInstance(deployment, service, i);
      instances.push(instance);
    }
    
    return instances;
  }

  private async createServiceInstance(
    deployment: Deployment,
    service: ServiceDefinition,
    index: number
  ): Promise<ServiceInstance> {
    const instanceId = `${deployment.config.name}-${service.name}-${index}`;
    
    // Get security profile
    const profile = profileManager.getProfile(service.securityProfile);
    if (!profile) {
      throw new Error(`Security profile ${service.securityProfile} not found`);
    }

    // Create sandbox configuration
    const sandboxConfig = {
      ...profile.config,
      image: service.image,
      memoryLimit: service.resources.memory,
      cpuLimit: service.resources.cpu,
      environmentVariables: {
        ...profile.config.environmentVariables,
        ...service.environment,
        INSTANCE_ID: instanceId,
        SERVICE_NAME: service.name,
        DEPLOYMENT_NAME: deployment.config.name,
      },
      volumes: service.volumes,
    };

    // Create sandbox
    const sandboxId = await sandboxManager.createSandbox(sandboxConfig);

    const instance: ServiceInstance = {
      id: instanceId,
      serviceDefinition: service,
      sandboxId,
      status: 'running',
      health: 'unknown',
      createdAt: new Date(),
      lastHealthCheck: new Date(),
      restarts: 0,
      node: 'local', // In a distributed setup, this would be the actual node
      metadata: {
        deploymentId: deployment.id,
        serviceName: service.name,
        index,
      },
    };

    // Start health checking
    this.scheduleHealthCheck(instance);

    return instance;
  }

  private async scaleUp(
    deployment: Deployment, 
    service: ServiceDefinition, 
    replicas: number
  ): Promise<void> {
    const currentInstances = Array.from(deployment.instances.values())
      .filter(i => i.serviceDefinition.name === service.name);
    
    const startIndex = currentInstances.length;
    
    for (let i = 0; i < replicas; i++) {
      const instance = await this.createServiceInstance(deployment, service, startIndex + i);
      deployment.instances.set(instance.id, instance);
      deployment.runningReplicas++;
    }
  }

  private async scaleDown(
    deployment: Deployment, 
    service: ServiceDefinition, 
    replicas: number
  ): Promise<void> {
    const instances = Array.from(deployment.instances.values())
      .filter(i => i.serviceDefinition.name === service.name)
      .slice(-replicas); // Take the last N instances

    for (const instance of instances) {
      await sandboxManager.destroySandbox(instance.sandboxId);
      deployment.instances.delete(instance.id);
      deployment.runningReplicas--;
    }
  }

  private async updateServiceInstances(
    deployment: Deployment, 
    service: ServiceDefinition
  ): Promise<void> {
    const instances = Array.from(deployment.instances.values())
      .filter(i => i.serviceDefinition.name === service.name);

    // Rolling update: replace instances one by one
    for (const oldInstance of instances) {
      // Create new instance
      const newInstance = await this.createServiceInstance(deployment, service, oldInstance.metadata.index);
      
      // Wait for new instance to be healthy
      await this.waitForHealthyInstance(newInstance);
      
      // Remove old instance
      await sandboxManager.destroySandbox(oldInstance.sandboxId);
      deployment.instances.delete(oldInstance.id);
      
      // Add new instance
      deployment.instances.set(newInstance.id, newInstance);
    }
  }

  private async waitForHealthyInstance(instance: ServiceInstance): Promise<void> {
    const maxWait = 60000; // 1 minute
    const checkInterval = 5000; // 5 seconds
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      await this.performHealthCheck(instance);
      
      if (instance.health === 'healthy') {
        return;
      }
      
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    throw new Error(`Instance ${instance.id} failed to become healthy within timeout`);
  }

  private async waitForHealthyInstances(instances: ServiceInstance[]): Promise<void> {
    const promises = instances.map(instance => this.waitForHealthyInstance(instance));
    await Promise.all(promises);
  }

  private async monitorCanaryDeployment(deployment: Deployment, serviceName: string): Promise<void> {
    // Monitor metrics for a period
    const monitoringPeriod = 300000; // 5 minutes
    const checkInterval = 30000; // 30 seconds
    
    const startTime = Date.now();
    
    while (Date.now() - startTime < monitoringPeriod) {
      // Check canary instances health and metrics
      const canaryInstances = Array.from(deployment.instances.values())
        .filter(i => i.serviceDefinition.name === serviceName);
      
      const healthyCanaries = canaryInstances.filter(i => i.health === 'healthy').length;
      const healthRatio = healthyCanaries / canaryInstances.length;
      
      if (healthRatio < 0.8) {
        throw new Error(`Canary deployment failed: only ${healthRatio * 100}% healthy`);
      }
      
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
  }

  private scheduleHealthCheck(instance: ServiceInstance): void {
    setTimeout(() => {
      this.performHealthCheck(instance);
    }, instance.serviceDefinition.healthCheck.interval);
  }

  private async performHealthCheck(instance: ServiceInstance): Promise<void> {
    try {
      const result = await sandboxManager.executeCommand(instance.sandboxId, {
        command: instance.serviceDefinition.healthCheck.command,
        args: [],
        timeout: instance.serviceDefinition.healthCheck.timeout,
      });

      instance.health = result.exitCode === 0 ? 'healthy' : 'unhealthy';
      instance.lastHealthCheck = new Date();

      if (instance.health === 'unhealthy') {
        this.handleUnhealthyInstance(instance);
      }

      // Schedule next health check
      this.scheduleHealthCheck(instance);
    } catch (error) {
      instance.health = 'unhealthy';
      instance.lastHealthCheck = new Date();
      
      structuredLogger.error('Health check failed', error as Error, { 
        instanceId: instance.id 
      });
      
      this.handleUnhealthyInstance(instance);
    }
  }

  private async handleUnhealthyInstance(instance: ServiceInstance): Promise<void> {
    const maxRetries = instance.serviceDefinition.healthCheck.retries;
    
    if (instance.restarts < maxRetries) {
      // Restart instance
      try {
        await sandboxManager.destroySandbox(instance.sandboxId);
        
        // Create new sandbox with same configuration
        const sandboxId = await sandboxManager.createSandbox({
          image: instance.serviceDefinition.image,
          memoryLimit: instance.serviceDefinition.resources.memory,
          cpuLimit: instance.serviceDefinition.resources.cpu,
          environmentVariables: instance.serviceDefinition.environment,
        });

        instance.sandboxId = sandboxId;
        instance.restarts++;
        instance.status = 'running';
        
        structuredLogger.info('Instance restarted', { 
          instanceId: instance.id,
          restarts: instance.restarts 
        });
      } catch (error) {
        instance.status = 'failed';
        structuredLogger.error('Failed to restart instance', error as Error, { 
          instanceId: instance.id 
        });
      }
    } else {
      instance.status = 'failed';
      structuredLogger.error('Instance exceeded max restarts', { 
        instanceId: instance.id,
        maxRetries 
      });
    }
  }

  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(() => {
      // Health checks are handled individually per instance
      // This interval can be used for aggregate health monitoring
    }, this.config.healthCheckInterval);
  }

  private startAutoScaling(): void {
    this.scalingInterval = setInterval(async () => {
      for (const [key, policy] of this.scalingPolicies.entries()) {
        if (!policy.enabled) continue;

        await this.evaluateScalingPolicy(policy);
      }
    }, this.config.scalingCheckInterval);
  }

  private async evaluateScalingPolicy(policy: ScalingPolicy): Promise<void> {
    const deployment = this.deployments.get(policy.deployment);
    if (!deployment) return;

    const serviceInstances = Array.from(deployment.instances.values())
      .filter(i => i.serviceDefinition.name === policy.service);

    if (serviceInstances.length === 0) return;

    // Calculate average resource usage
    const avgCpu = await this.calculateAverageResourceUsage(serviceInstances, 'cpu');
    const avgMemory = await this.calculateAverageResourceUsage(serviceInstances, 'memory');

    const currentReplicas = serviceInstances.length;
    let targetReplicas = currentReplicas;

    // Scale up if resource usage is high
    if (avgCpu > policy.targetCPU || avgMemory > policy.targetMemory) {
      if (currentReplicas < policy.maxReplicas) {
        targetReplicas = Math.min(policy.maxReplicas, currentReplicas + 1);
      }
    }
    // Scale down if resource usage is low
    else if (avgCpu < policy.targetCPU * 0.5 && avgMemory < policy.targetMemory * 0.5) {
      if (currentReplicas > policy.minReplicas) {
        targetReplicas = Math.max(policy.minReplicas, currentReplicas - 1);
      }
    }

    if (targetReplicas !== currentReplicas) {
      structuredLogger.info('Auto-scaling triggered', {
        policy: policy.name,
        currentReplicas,
        targetReplicas,
        avgCpu,
        avgMemory,
      });

      await this.scaleService(policy.deployment, policy.service, targetReplicas);
    }
  }

  private async calculateAverageResourceUsage(
    instances: ServiceInstance[], 
    resource: 'cpu' | 'memory'
  ): Promise<number> {
    // This would integrate with actual resource monitoring
    // For now, return mock values
    return Math.random() * 100;
  }

  private validateDeploymentConfig(config: DeploymentConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.name) errors.push('Deployment name is required');
    if (!config.namespace) errors.push('Namespace is required');
    if (!config.services || config.services.length === 0) {
      errors.push('At least one service is required');
    }

    for (const service of config.services || []) {
      if (!service.name) errors.push('Service name is required');
      if (!service.image) errors.push('Service image is required');
      if (service.replicas < 1) errors.push('Service replicas must be at least 1');
      
      if (!profileManager.getProfile(service.securityProfile)) {
        errors.push(`Security profile ${service.securityProfile} not found`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Close the orchestration manager
   */
  close(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    if (this.scalingInterval) {
      clearInterval(this.scalingInterval);
    }
    
    this.removeAllListeners();
    structuredLogger.info('Orchestration manager closed');
  }
}

/**
 * Load balancer for distributing traffic
 */
class LoadBalancer {
  private instances: ServiceInstance[] = [];
  private algorithm: 'round-robin' | 'least-connections' | 'weighted' = 'round-robin';
  private currentIndex = 0;

  constructor(algorithm: 'round-robin' | 'least-connections' | 'weighted' = 'round-robin') {
    this.algorithm = algorithm;
  }

  addInstance(instance: ServiceInstance): void {
    this.instances.push(instance);
  }

  removeInstance(instanceId: string): void {
    this.instances = this.instances.filter(i => i.id !== instanceId);
  }

  getNextInstance(): ServiceInstance | null {
    const healthyInstances = this.instances.filter(i => i.health === 'healthy');
    
    if (healthyInstances.length === 0) {
      return null;
    }

    switch (this.algorithm) {
      case 'round-robin':
        const instance = healthyInstances[this.currentIndex % healthyInstances.length];
        this.currentIndex++;
        return instance;
      
      case 'least-connections':
        // Would need to track active connections
        return healthyInstances[0];
      
      case 'weighted':
        // Would implement weighted selection
        return healthyInstances[0];
      
      default:
        return healthyInstances[0];
    }
  }
}

// Export singleton instance
export const orchestrationManager = new OrchestrationManager();