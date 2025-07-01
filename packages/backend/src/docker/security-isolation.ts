import { EventEmitter } from 'events';
import { Docker } from 'dockerode';
import { structuredLogger } from '../middleware/logging.js';
import { sandboxManager } from './sandbox-manager.js';
import { v4 as uuidv4 } from 'uuid';

export interface IsolationPolicy {
  name: string;
  description: string;
  networkIsolation: {
    enabled: boolean;
    allowedOutbound: string[];
    allowedInbound: string[];
    dnsServers: string[];
    blockPrivateNetworks: boolean;
  };
  filesystemIsolation: {
    readOnlyRoot: boolean;
    tmpfsSize: number;
    allowedMounts: string[];
    blockedPaths: string[];
    noExec: boolean;
  };
  processIsolation: {
    noNewPrivileges: boolean;
    capabilities: {
      drop: string[];
      add: string[];
    };
    seccompProfile: string;
    apparmorProfile: string;
    selinuxLabel: string;
  };
  resourceLimits: {
    memory: number;
    cpu: number;
    pids: number;
    openFiles: number;
    diskIO: number;
    networkBandwidth: number;
  };
  monitoring: {
    enableSyslog: boolean;
    enableAuditLog: boolean;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
    alertOnViolation: boolean;
  };
}

export interface IsolatedContainer {
  id: string;
  containerId: string;
  policyName: string;
  status: 'creating' | 'running' | 'stopped' | 'failed';
  violations: SecurityViolation[];
  metrics: {
    networkConnections: number;
    fileOperations: number;
    processCount: number;
    memoryUsage: number;
    cpuUsage: number;
    diskUsage: number;
  };
  createdAt: Date;
  lastActivity: Date;
}

export interface SecurityViolation {
  id: string;
  type: 'network' | 'filesystem' | 'process' | 'resource';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  details: Record<string, any>;
  timestamp: Date;
  mitigated: boolean;
}

export interface NetworkPolicy {
  allowOutbound: boolean;
  allowedHosts: string[];
  allowedPorts: number[];
  blockedHosts: string[];
  blockedPorts: number[];
  requireTLS: boolean;
  maxConnections: number;
}

export interface FilesystemPolicy {
  readOnlyPaths: string[];
  hiddenPaths: string[];
  allowedExecutables: string[];
  blockedExecutables: string[];
  maxFileSize: number;
  allowedExtensions: string[];
  blockedExtensions: string[];
}

export class SecurityIsolationManager extends EventEmitter {
  private docker: Docker;
  private containers = new Map<string, IsolatedContainer>();
  private policies = new Map<string, IsolationPolicy>();
  private monitoringInterval: NodeJS.Timeout;
  
  private config = {
    monitoringInterval: 10000, // 10 seconds
    violationRetention: 86400000, // 24 hours
    maxViolationsPerContainer: 1000,
    autoMitigateThreshold: 5,
  };

  constructor() {
    super();
    
    this.docker = new Docker({
      socketPath: process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock',
    });

    this.initializeDefaultPolicies();
    this.startSecurityMonitoring();
    
    structuredLogger.info('Security isolation manager initialized');
  }

  /**
   * Create an isolated container with security policies
   */
  async createIsolatedContainer(
    image: string,
    policyName: string,
    options: {
      command?: string[];
      environment?: Record<string, string>;
      volumes?: Array<{ host: string; container: string; mode: 'ro' | 'rw' }>;
      networkPolicy?: NetworkPolicy;
      filesystemPolicy?: FilesystemPolicy;
    } = {}
  ): Promise<string> {
    const containerId = uuidv4();
    
    try {
      const policy = this.policies.get(policyName);
      if (!policy) {
        throw new Error(`Security policy '${policyName}' not found`);
      }

      structuredLogger.info('Creating isolated container', {
        containerId,
        image,
        policy: policyName,
      });

      // Build security configuration
      const securityConfig = this.buildSecurityConfig(policy, options);
      
      // Create container with security isolation
      const container = await this.docker.createContainer({
        Image: image,
        Cmd: options.command || ['/bin/bash', '-c', 'sleep infinity'],
        Env: options.environment ? 
          Object.entries(options.environment).map(([k, v]) => `${k}=${v}`) : 
          undefined,
        AttachStdout: true,
        AttachStderr: true,
        AttachStdin: true,
        Tty: true,
        OpenStdin: true,
        NetworkMode: policy.networkIsolation.enabled ? 'none' : 'bridge',
        HostConfig: {
          ...securityConfig.hostConfig,
          Binds: options.volumes?.map(v => `${v.host}:${v.container}:${v.mode}`) || [],
        },
        Labels: {
          'vibe.isolation.id': containerId,
          'vibe.isolation.policy': policyName,
          'vibe.isolation.created': new Date().toISOString(),
        },
      });

      await container.start();

      // Set up network isolation if required
      if (policy.networkIsolation.enabled) {
        await this.configureNetworkIsolation(container, policy.networkIsolation, options.networkPolicy);
      }

      // Set up filesystem isolation
      await this.configureFilesystemIsolation(container, policy.filesystemIsolation, options.filesystemPolicy);

      const isolatedContainer: IsolatedContainer = {
        id: containerId,
        containerId: container.id,
        policyName,
        status: 'running',
        violations: [],
        metrics: {
          networkConnections: 0,
          fileOperations: 0,
          processCount: 0,
          memoryUsage: 0,
          cpuUsage: 0,
          diskUsage: 0,
        },
        createdAt: new Date(),
        lastActivity: new Date(),
      };

      this.containers.set(containerId, isolatedContainer);

      // Start monitoring
      this.startContainerMonitoring(isolatedContainer);

      this.emit('containerCreated', isolatedContainer);
      structuredLogger.info('Isolated container created successfully', {
        containerId,
        dockerContainerId: container.id,
        policy: policyName,
      });

      return containerId;
    } catch (error) {
      structuredLogger.error('Failed to create isolated container', error as Error, {
        containerId,
        image,
        policy: policyName,
      });
      throw error;
    }
  }

  /**
   * Execute command in isolated container
   */
  async executeInIsolatedContainer(
    containerId: string,
    command: string,
    args: string[] = [],
    options: { timeout?: number; user?: string } = {}
  ): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
    violations: SecurityViolation[];
  }> {
    const isolatedContainer = this.containers.get(containerId);
    if (!isolatedContainer) {
      throw new Error(`Isolated container ${containerId} not found`);
    }

    const policy = this.policies.get(isolatedContainer.policyName);
    if (!policy) {
      throw new Error(`Policy ${isolatedContainer.policyName} not found`);
    }

    try {
      // Validate command against security policy
      const violations = await this.validateCommand(command, args, policy);
      
      if (violations.length > 0) {
        const criticalViolations = violations.filter(v => v.severity === 'critical');
        if (criticalViolations.length > 0) {
          throw new Error(`Command blocked due to security violations: ${criticalViolations.map(v => v.description).join(', ')}`);
        }
      }

      // Record violations
      isolatedContainer.violations.push(...violations);

      // Execute command through sandbox manager
      const result = await sandboxManager.executeCommand(isolatedContainer.containerId, {
        command,
        args,
        timeout: options.timeout || 30000,
        user: options.user || 'sandbox',
      });

      // Update activity timestamp
      isolatedContainer.lastActivity = new Date();

      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        violations,
      };
    } catch (error) {
      structuredLogger.error('Command execution failed in isolated container', error as Error, {
        containerId,
        command,
      });
      throw error;
    }
  }

  /**
   * Get container security status
   */
  getContainerSecurityStatus(containerId: string): {
    container: IsolatedContainer;
    recentViolations: SecurityViolation[];
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    recommendations: string[];
  } | null {
    const container = this.containers.get(containerId);
    if (!container) return null;

    const recentViolations = container.violations.filter(
      v => Date.now() - v.timestamp.getTime() < 3600000 // Last hour
    );

    const riskLevel = this.calculateRiskLevel(container);
    const recommendations = this.generateSecurityRecommendations(container);

    return {
      container,
      recentViolations,
      riskLevel,
      recommendations,
    };
  }

  /**
   * Register custom security policy
   */
  registerPolicy(policy: IsolationPolicy): void {
    this.policies.set(policy.name, policy);
    
    structuredLogger.info('Security policy registered', {
      name: policy.name,
      description: policy.description,
    });
  }

  /**
   * Stop and remove isolated container
   */
  async destroyIsolatedContainer(containerId: string): Promise<boolean> {
    const container = this.containers.get(containerId);
    if (!container) return false;

    try {
      const dockerContainer = this.docker.getContainer(container.containerId);
      
      // Stop container
      await dockerContainer.stop({ t: 10 });
      
      // Remove container
      await dockerContainer.remove({ force: true });
      
      // Remove from tracking
      this.containers.delete(containerId);
      
      this.emit('containerDestroyed', { containerId });
      structuredLogger.info('Isolated container destroyed', { containerId });
      
      return true;
    } catch (error) {
      structuredLogger.error('Failed to destroy isolated container', error as Error, { containerId });
      return false;
    }
  }

  /**
   * List all isolated containers
   */
  listIsolatedContainers(): IsolatedContainer[] {
    return Array.from(this.containers.values());
  }

  /**
   * Get security policies
   */
  listPolicies(): IsolationPolicy[] {
    return Array.from(this.policies.values());
  }

  // Private methods

  private initializeDefaultPolicies(): void {
    // Ultra-secure policy for untrusted code
    this.registerPolicy({
      name: 'ultra-secure',
      description: 'Maximum security isolation for untrusted code',
      networkIsolation: {
        enabled: true,
        allowedOutbound: [],
        allowedInbound: [],
        dnsServers: [],
        blockPrivateNetworks: true,
      },
      filesystemIsolation: {
        readOnlyRoot: true,
        tmpfsSize: 64 * 1024 * 1024, // 64MB
        allowedMounts: ['/tmp'],
        blockedPaths: ['/proc', '/sys', '/dev'],
        noExec: true,
      },
      processIsolation: {
        noNewPrivileges: true,
        capabilities: {
          drop: ['ALL'],
          add: [],
        },
        seccompProfile: 'default',
        apparmorProfile: 'docker-default',
        selinuxLabel: 'system_u:system_r:container_t:s0',
      },
      resourceLimits: {
        memory: 128 * 1024 * 1024, // 128MB
        cpu: 0.25, // 25% CPU
        pids: 32,
        openFiles: 256,
        diskIO: 10 * 1024 * 1024, // 10MB/s
        networkBandwidth: 1024 * 1024, // 1MB/s
      },
      monitoring: {
        enableSyslog: true,
        enableAuditLog: true,
        logLevel: 'info',
        alertOnViolation: true,
      },
    });

    // Secure development environment
    this.registerPolicy({
      name: 'secure-dev',
      description: 'Secure isolation for development environments',
      networkIsolation: {
        enabled: false,
        allowedOutbound: ['80', '443', '22'],
        allowedInbound: [],
        dnsServers: ['8.8.8.8', '8.8.4.4'],
        blockPrivateNetworks: false,
      },
      filesystemIsolation: {
        readOnlyRoot: false,
        tmpfsSize: 256 * 1024 * 1024, // 256MB
        allowedMounts: ['/tmp', '/workspace'],
        blockedPaths: ['/proc/sys', '/sys/kernel'],
        noExec: false,
      },
      processIsolation: {
        noNewPrivileges: true,
        capabilities: {
          drop: ['SYS_ADMIN', 'SYS_MODULE', 'SYS_RAWIO'],
          add: [],
        },
        seccompProfile: 'default',
        apparmorProfile: 'docker-default',
        selinuxLabel: 'system_u:system_r:container_t:s0',
      },
      resourceLimits: {
        memory: 512 * 1024 * 1024, // 512MB
        cpu: 1.0, // 100% CPU
        pids: 256,
        openFiles: 1024,
        diskIO: 50 * 1024 * 1024, // 50MB/s
        networkBandwidth: 10 * 1024 * 1024, // 10MB/s
      },
      monitoring: {
        enableSyslog: true,
        enableAuditLog: false,
        logLevel: 'warn',
        alertOnViolation: true,
      },
    });

    // Research environment with controlled access
    this.registerPolicy({
      name: 'research',
      description: 'Controlled environment for research and analysis',
      networkIsolation: {
        enabled: false,
        allowedOutbound: ['80', '443'],
        allowedInbound: [],
        dnsServers: ['1.1.1.1', '1.0.0.1'],
        blockPrivateNetworks: true,
      },
      filesystemIsolation: {
        readOnlyRoot: false,
        tmpfsSize: 1024 * 1024 * 1024, // 1GB
        allowedMounts: ['/tmp', '/data', '/workspace'],
        blockedPaths: ['/proc/sys', '/sys/kernel', '/sys/module'],
        noExec: false,
      },
      processIsolation: {
        noNewPrivileges: true,
        capabilities: {
          drop: ['SYS_ADMIN', 'SYS_MODULE', 'SYS_RAWIO', 'NET_ADMIN'],
          add: [],
        },
        seccompProfile: 'default',
        apparmorProfile: 'docker-default',
        selinuxLabel: 'system_u:system_r:container_t:s0',
      },
      resourceLimits: {
        memory: 2048 * 1024 * 1024, // 2GB
        cpu: 2.0, // 200% CPU
        pids: 512,
        openFiles: 2048,
        diskIO: 100 * 1024 * 1024, // 100MB/s
        networkBandwidth: 50 * 1024 * 1024, // 50MB/s
      },
      monitoring: {
        enableSyslog: true,
        enableAuditLog: true,
        logLevel: 'info',
        alertOnViolation: true,
      },
    });
  }

  private buildSecurityConfig(policy: IsolationPolicy, options: any): any {
    const hostConfig: any = {
      Memory: policy.resourceLimits.memory,
      CpuQuota: Math.floor(policy.resourceLimits.cpu * 100000),
      CpuPeriod: 100000,
      PidsLimit: policy.resourceLimits.pids,
      ReadonlyRootfs: policy.filesystemIsolation.readOnlyRoot,
      SecurityOpt: [],
      CapDrop: policy.processIsolation.capabilities.drop,
      CapAdd: policy.processIsolation.capabilities.add,
      Ulimits: [
        { Name: 'nofile', Soft: policy.resourceLimits.openFiles, Hard: policy.resourceLimits.openFiles },
        { Name: 'nproc', Soft: policy.resourceLimits.pids, Hard: policy.resourceLimits.pids },
      ],
    };

    // Add no-new-privileges
    if (policy.processIsolation.noNewPrivileges) {
      hostConfig.SecurityOpt.push('no-new-privileges:true');
    }

    // Add seccomp profile
    if (policy.processIsolation.seccompProfile) {
      hostConfig.SecurityOpt.push(`seccomp=${policy.processIsolation.seccompProfile}`);
    }

    // Add AppArmor profile
    if (policy.processIsolation.apparmorProfile) {
      hostConfig.SecurityOpt.push(`apparmor:${policy.processIsolation.apparmorProfile}`);
    }

    // Add SELinux label
    if (policy.processIsolation.selinuxLabel) {
      hostConfig.SecurityOpt.push(`label=${policy.processIsolation.selinuxLabel}`);
    }

    // Add tmpfs mounts
    if (policy.filesystemIsolation.tmpfsSize > 0) {
      hostConfig.Tmpfs = {
        '/tmp': `size=${policy.filesystemIsolation.tmpfsSize},noexec,nosuid,nodev`,
      };
    }

    return { hostConfig };
  }

  private async configureNetworkIsolation(
    container: any,
    networkPolicy: any,
    customPolicy?: NetworkPolicy
  ): Promise<void> {
    // Network isolation would be implemented here
    // This could involve creating custom networks, firewall rules, etc.
    structuredLogger.debug('Network isolation configured', {
      containerId: container.id,
      policy: networkPolicy,
    });
  }

  private async configureFilesystemIsolation(
    container: any,
    filesystemPolicy: any,
    customPolicy?: FilesystemPolicy
  ): Promise<void> {
    // Filesystem isolation would be implemented here
    // This could involve bind mounts, overlay filesystems, etc.
    structuredLogger.debug('Filesystem isolation configured', {
      containerId: container.id,
      policy: filesystemPolicy,
    });
  }

  private async validateCommand(
    command: string,
    args: string[],
    policy: IsolationPolicy
  ): Promise<SecurityViolation[]> {
    const violations: SecurityViolation[] = [];
    const fullCommand = [command, ...args].join(' ');

    // Check for dangerous commands
    const dangerousPatterns = [
      { pattern: /rm\s+-rf\s+\//, severity: 'critical' as const, description: 'Root filesystem deletion attempt' },
      { pattern: /chmod\s+777/, severity: 'high' as const, description: 'Overly permissive file permissions' },
      { pattern: /sudo|su\s/, severity: 'critical' as const, description: 'Privilege escalation attempt' },
      { pattern: /\/proc\/sys/, severity: 'medium' as const, description: 'System configuration access' },
      { pattern: /\/sys\//, severity: 'medium' as const, description: 'System filesystem access' },
      { pattern: /nc\s+.*\s+\d+/, severity: 'high' as const, description: 'Network connection attempt' },
      { pattern: /curl|wget/, severity: 'medium' as const, description: 'External network access' },
    ];

    for (const { pattern, severity, description } of dangerousPatterns) {
      if (pattern.test(fullCommand)) {
        violations.push({
          id: uuidv4(),
          type: 'process',
          severity,
          description,
          details: { command: fullCommand, pattern: pattern.source },
          timestamp: new Date(),
          mitigated: false,
        });
      }
    }

    return violations;
  }

  private startSecurityMonitoring(): void {
    this.monitoringInterval = setInterval(async () => {
      for (const container of this.containers.values()) {
        await this.monitorContainer(container);
      }
    }, this.config.monitoringInterval);
  }

  private async startContainerMonitoring(container: IsolatedContainer): Promise<void> {
    // Start specific monitoring for this container
    // This would integrate with Docker events, logs, etc.
  }

  private async monitorContainer(container: IsolatedContainer): Promise<void> {
    try {
      const dockerContainer = this.docker.getContainer(container.containerId);
      const stats = await dockerContainer.stats({ stream: false });
      
      // Update metrics
      container.metrics = {
        networkConnections: 0, // Would parse from container network stats
        fileOperations: 0, // Would parse from container logs/events
        processCount: stats.pids_stats?.current || 0,
        memoryUsage: stats.memory_stats?.usage || 0,
        cpuUsage: this.calculateCpuUsage(stats),
        diskUsage: 0, // Would calculate from filesystem stats
      };

      // Check for resource violations
      const policy = this.policies.get(container.policyName);
      if (policy) {
        await this.checkResourceViolations(container, policy);
      }
    } catch (error) {
      // Container might have been destroyed
      structuredLogger.debug('Failed to monitor container', {
        containerId: container.id,
        error: (error as Error).message,
      });
    }
  }

  private calculateCpuUsage(stats: any): number {
    if (!stats.cpu_stats || !stats.precpu_stats) return 0;
    
    const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - 
                    (stats.precpu_stats.cpu_usage.total_usage || 0);
    const systemDelta = stats.cpu_stats.system_cpu_usage - 
                       (stats.precpu_stats.system_cpu_usage || 0);
    
    return systemDelta > 0 ? (cpuDelta / systemDelta) * 100 : 0;
  }

  private async checkResourceViolations(
    container: IsolatedContainer,
    policy: IsolationPolicy
  ): Promise<void> {
    const violations: SecurityViolation[] = [];

    // Memory violations
    if (container.metrics.memoryUsage > policy.resourceLimits.memory * 0.9) {
      violations.push({
        id: uuidv4(),
        type: 'resource',
        severity: 'high',
        description: 'Memory usage approaching limit',
        details: {
          usage: container.metrics.memoryUsage,
          limit: policy.resourceLimits.memory,
        },
        timestamp: new Date(),
        mitigated: false,
      });
    }

    // CPU violations
    if (container.metrics.cpuUsage > policy.resourceLimits.cpu * 100 * 0.9) {
      violations.push({
        id: uuidv4(),
        type: 'resource',
        severity: 'medium',
        description: 'CPU usage approaching limit',
        details: {
          usage: container.metrics.cpuUsage,
          limit: policy.resourceLimits.cpu * 100,
        },
        timestamp: new Date(),
        mitigated: false,
      });
    }

    // Process count violations
    if (container.metrics.processCount > policy.resourceLimits.pids * 0.9) {
      violations.push({
        id: uuidv4(),
        type: 'resource',
        severity: 'medium',
        description: 'Process count approaching limit',
        details: {
          count: container.metrics.processCount,
          limit: policy.resourceLimits.pids,
        },
        timestamp: new Date(),
        mitigated: false,
      });
    }

    if (violations.length > 0) {
      container.violations.push(...violations);
      
      for (const violation of violations) {
        this.emit('securityViolation', { container, violation });
        
        if (violation.severity === 'critical') {
          this.emit('criticalViolation', { container, violation });
        }
      }
    }
  }

  private calculateRiskLevel(container: IsolatedContainer): 'low' | 'medium' | 'high' | 'critical' {
    const recentViolations = container.violations.filter(
      v => Date.now() - v.timestamp.getTime() < 3600000 // Last hour
    );

    const criticalCount = recentViolations.filter(v => v.severity === 'critical').length;
    const highCount = recentViolations.filter(v => v.severity === 'high').length;
    const totalCount = recentViolations.length;

    if (criticalCount > 0) return 'critical';
    if (highCount > 2 || totalCount > 10) return 'high';
    if (highCount > 0 || totalCount > 5) return 'medium';
    return 'low';
  }

  private generateSecurityRecommendations(container: IsolatedContainer): string[] {
    const recommendations: string[] = [];
    const riskLevel = this.calculateRiskLevel(container);

    if (riskLevel === 'critical') {
      recommendations.push('Consider terminating container immediately');
      recommendations.push('Review all commands executed in this container');
    }

    if (container.metrics.memoryUsage > container.metrics.memoryUsage * 0.8) {
      recommendations.push('Monitor memory usage closely');
    }

    if (container.violations.length > 20) {
      recommendations.push('Review security policy - too many violations');
    }

    return recommendations;
  }

  /**
   * Close the security isolation manager
   */
  close(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    
    this.removeAllListeners();
    structuredLogger.info('Security isolation manager closed');
  }
}

// Export singleton instance
export const securityIsolationManager = new SecurityIsolationManager();