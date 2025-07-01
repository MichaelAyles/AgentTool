import { EventEmitter } from 'events';
import { Docker } from 'dockerode';
import { structuredLogger } from '../middleware/logging.js';
import { v4 as uuidv4 } from 'uuid';

export interface SandboxConfig {
  image: string;
  workingDir: string;
  mountPath: string;
  memoryLimit: number;
  cpuLimit: number;
  networkMode: 'none' | 'bridge' | 'host';
  readOnly: boolean;
  timeout: number;
  allowedCommands: string[];
  blockedCommands: string[];
  environmentVariables: Record<string, string>;
  volumes: Array<{ host: string; container: string; mode: 'ro' | 'rw' }>;
}

export interface SandboxInstance {
  id: string;
  containerId: string;
  config: SandboxConfig;
  status: 'creating' | 'running' | 'stopped' | 'error';
  createdAt: Date;
  lastActivity: Date;
  resourceUsage: {
    memory: number;
    cpu: number;
    diskIO: number;
    networkIO: number;
  };
}

export interface ExecutionOptions {
  command: string;
  args: string[];
  workingDirectory?: string;
  environment?: Record<string, string>;
  stdin?: string;
  timeout?: number;
  user?: string;
}

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  executionTime: number;
  resourceUsage: {
    memory: number;
    cpu: number;
  };
  securityViolations: string[];
}

export class DockerSandboxManager extends EventEmitter {
  private docker: Docker;
  private sandboxes = new Map<string, SandboxInstance>();
  private defaultConfig: SandboxConfig;
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    super();
    
    this.docker = new Docker({
      socketPath: process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock',
    });

    this.defaultConfig = {
      image: 'ubuntu:22.04',
      workingDir: '/workspace',
      mountPath: '/tmp/vibe-sandbox',
      memoryLimit: 512 * 1024 * 1024, // 512MB
      cpuLimit: 0.5, // 50% of one CPU core
      networkMode: 'none',
      readOnly: false,
      timeout: 300000, // 5 minutes
      allowedCommands: [
        'ls', 'cat', 'echo', 'pwd', 'cd', 'mkdir', 'touch', 'rm', 'mv', 'cp',
        'grep', 'find', 'head', 'tail', 'wc', 'sort', 'uniq',
        'python3', 'node', 'npm', 'yarn', 'git', 'curl', 'wget',
      ],
      blockedCommands: [
        'sudo', 'su', 'passwd', 'chown', 'chmod', 'mount', 'umount',
        'systemctl', 'service', 'crontab', 'at', 'nc', 'netcat',
        'iptables', 'ufw', 'firewall', 'reboot', 'shutdown', 'halt',
      ],
      environmentVariables: {
        PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
        HOME: '/workspace',
        USER: 'sandbox',
        SHELL: '/bin/bash',
      },
      volumes: [],
    };

    // Start cleanup process
    this.cleanupInterval = setInterval(() => {
      this.cleanupInactiveSandboxes();
    }, 60000); // Every minute

    structuredLogger.info('Docker sandbox manager initialized');
  }

  /**
   * Create a new sandbox instance
   */
  async createSandbox(config: Partial<SandboxConfig> = {}): Promise<string> {
    const sandboxId = uuidv4();
    const fullConfig = { ...this.defaultConfig, ...config };

    try {
      structuredLogger.info('Creating sandbox', { sandboxId, config: fullConfig });

      // Create container
      const container = await this.docker.createContainer({
        Image: fullConfig.image,
        WorkingDir: fullConfig.workingDir,
        Cmd: ['/bin/bash', '-c', 'sleep infinity'], // Keep container running
        AttachStdout: true,
        AttachStderr: true,
        AttachStdin: true,
        Tty: true,
        OpenStdin: true,
        NetworkMode: fullConfig.networkMode,
        HostConfig: {
          Memory: fullConfig.memoryLimit,
          CpuQuota: Math.floor(fullConfig.cpuLimit * 100000), // Docker uses microseconds
          CpuPeriod: 100000,
          ReadonlyRootfs: fullConfig.readOnly,
          Binds: fullConfig.volumes.map(v => `${v.host}:${v.container}:${v.mode}`),
          SecurityOpt: [
            'no-new-privileges:true',
            'seccomp:unconfined', // Could be more restrictive
          ],
          CapDrop: ['ALL'],
          CapAdd: [], // No capabilities by default
          Ulimits: [
            { Name: 'nofile', Soft: 1024, Hard: 1024 },
            { Name: 'nproc', Soft: 64, Hard: 64 },
          ],
        },
        Env: Object.entries(fullConfig.environmentVariables).map(([k, v]) => `${k}=${v}`),
        User: 'sandbox:sandbox',
        Labels: {
          'vibe.sandbox.id': sandboxId,
          'vibe.sandbox.created': new Date().toISOString(),
        },
      });

      await container.start();

      const sandbox: SandboxInstance = {
        id: sandboxId,
        containerId: container.id,
        config: fullConfig,
        status: 'running',
        createdAt: new Date(),
        lastActivity: new Date(),
        resourceUsage: {
          memory: 0,
          cpu: 0,
          diskIO: 0,
          networkIO: 0,
        },
      };

      this.sandboxes.set(sandboxId, sandbox);

      // Set up resource monitoring
      this.startResourceMonitoring(sandboxId);

      this.emit('sandboxCreated', sandbox);
      structuredLogger.info('Sandbox created successfully', { sandboxId, containerId: container.id });

      return sandboxId;
    } catch (error) {
      structuredLogger.error('Failed to create sandbox', error as Error, { sandboxId });
      throw new Error(`Failed to create sandbox: ${(error as Error).message}`);
    }
  }

  /**
   * Execute a command in a sandbox
   */
  async executeCommand(
    sandboxId: string,
    options: ExecutionOptions
  ): Promise<ExecutionResult> {
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox) {
      throw new Error(`Sandbox ${sandboxId} not found`);
    }

    if (sandbox.status !== 'running') {
      throw new Error(`Sandbox ${sandboxId} is not running`);
    }

    const startTime = Date.now();
    const securityViolations: string[] = [];

    try {
      // Security checks
      const command = options.command.toLowerCase();
      
      // Check if command is allowed
      if (!sandbox.config.allowedCommands.some(allowed => command.includes(allowed))) {
        securityViolations.push(`Command not in allowed list: ${options.command}`);
      }

      // Check if command is blocked
      if (sandbox.config.blockedCommands.some(blocked => command.includes(blocked))) {
        securityViolations.push(`Command is blocked: ${options.command}`);
        throw new Error(`Command blocked for security reasons: ${options.command}`);
      }

      // Check for dangerous patterns
      const dangerousPatterns = [
        /rm\s+-rf\s+\//, // rm -rf /
        />\s*\/dev\//, // Redirecting to device files
        /\/proc\//, // Accessing proc filesystem
        /\/sys\//, // Accessing sys filesystem
        /sudo|su\s/, // Privilege escalation
        /&&|;|\|/, // Command chaining (could be made more restrictive)
      ];

      for (const pattern of dangerousPatterns) {
        if (pattern.test(options.command)) {
          securityViolations.push(`Dangerous pattern detected: ${pattern.source}`);
        }
      }

      structuredLogger.info('Executing command in sandbox', {
        sandboxId,
        command: options.command,
        args: options.args,
        securityViolations,
      });

      // Get container
      const container = this.docker.getContainer(sandbox.containerId);

      // Prepare execution command
      const fullCommand = [options.command, ...options.args].join(' ');
      
      // Create exec instance
      const exec = await container.exec({
        Cmd: ['/bin/bash', '-c', fullCommand],
        AttachStdout: true,
        AttachStderr: true,
        AttachStdin: true,
        Tty: false,
        WorkingDir: options.workingDirectory || sandbox.config.workingDir,
        Env: options.environment ? 
          Object.entries(options.environment).map(([k, v]) => `${k}=${v}`) : 
          undefined,
        User: options.user || 'sandbox:sandbox',
      });

      // Start execution with timeout
      const timeout = options.timeout || sandbox.config.timeout;
      const executionPromise = this.executeWithTimeout(exec, options.stdin, timeout);
      
      const result = await executionPromise;
      const executionTime = Date.now() - startTime;

      // Update sandbox activity
      sandbox.lastActivity = new Date();

      // Get resource usage
      const stats = await container.stats({ stream: false });
      const resourceUsage = this.parseContainerStats(stats);

      const executionResult: ExecutionResult = {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        executionTime,
        resourceUsage,
        securityViolations,
      };

      this.emit('commandExecuted', {
        sandboxId,
        command: options.command,
        result: executionResult,
      });

      structuredLogger.info('Command executed successfully', {
        sandboxId,
        command: options.command,
        exitCode: result.exitCode,
        executionTime,
        securityViolations: securityViolations.length,
      });

      return executionResult;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      structuredLogger.error('Command execution failed', error as Error, {
        sandboxId,
        command: options.command,
        executionTime,
      });

      return {
        stdout: '',
        stderr: (error as Error).message,
        exitCode: -1,
        executionTime,
        resourceUsage: { memory: 0, cpu: 0 },
        securityViolations,
      };
    }
  }

  /**
   * Get sandbox information
   */
  getSandbox(sandboxId: string): SandboxInstance | undefined {
    return this.sandboxes.get(sandboxId);
  }

  /**
   * List all sandboxes
   */
  listSandboxes(): SandboxInstance[] {
    return Array.from(this.sandboxes.values());
  }

  /**
   * Stop and remove a sandbox
   */
  async destroySandbox(sandboxId: string): Promise<boolean> {
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox) {
      return false;
    }

    try {
      const container = this.docker.getContainer(sandbox.containerId);
      
      // Stop container
      await container.stop({ t: 10 }); // 10 second grace period
      
      // Remove container
      await container.remove({ force: true });
      
      // Remove from tracking
      this.sandboxes.delete(sandboxId);
      
      this.emit('sandboxDestroyed', { sandboxId });
      structuredLogger.info('Sandbox destroyed', { sandboxId });
      
      return true;
    } catch (error) {
      structuredLogger.error('Failed to destroy sandbox', error as Error, { sandboxId });
      return false;
    }
  }

  /**
   * Get sandbox resource usage
   */
  async getSandboxStats(sandboxId: string): Promise<any> {
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox) {
      throw new Error(`Sandbox ${sandboxId} not found`);
    }

    try {
      const container = this.docker.getContainer(sandbox.containerId);
      const stats = await container.stats({ stream: false });
      return this.parseContainerStats(stats);
    } catch (error) {
      structuredLogger.error('Failed to get sandbox stats', error as Error, { sandboxId });
      throw error;
    }
  }

  /**
   * Clean up inactive sandboxes
   */
  private async cleanupInactiveSandboxes(): Promise<void> {
    const now = Date.now();
    const maxIdleTime = 30 * 60 * 1000; // 30 minutes
    
    for (const [sandboxId, sandbox] of this.sandboxes.entries()) {
      const idleTime = now - sandbox.lastActivity.getTime();
      
      if (idleTime > maxIdleTime) {
        structuredLogger.info('Cleaning up inactive sandbox', { sandboxId, idleTime });
        await this.destroySandbox(sandboxId);
      }
    }
  }

  /**
   * Start resource monitoring for a sandbox
   */
  private startResourceMonitoring(sandboxId: string): void {
    const monitoringInterval = setInterval(async () => {
      try {
        const stats = await this.getSandboxStats(sandboxId);
        const sandbox = this.sandboxes.get(sandboxId);
        
        if (sandbox) {
          sandbox.resourceUsage = stats;
          
          // Check for resource violations
          if (stats.memory > sandbox.config.memoryLimit * 0.9) {
            this.emit('resourceWarning', {
              sandboxId,
              type: 'memory',
              usage: stats.memory,
              limit: sandbox.config.memoryLimit,
            });
          }
          
          if (stats.cpu > sandbox.config.cpuLimit * 0.9) {
            this.emit('resourceWarning', {
              sandboxId,
              type: 'cpu',
              usage: stats.cpu,
              limit: sandbox.config.cpuLimit,
            });
          }
        }
      } catch (error) {
        // Sandbox might have been destroyed
        clearInterval(monitoringInterval);
      }
    }, 10000); // Every 10 seconds

    // Store interval reference to clean up later
    setTimeout(() => {
      clearInterval(monitoringInterval);
    }, 24 * 60 * 60 * 1000); // Stop monitoring after 24 hours
  }

  /**
   * Execute command with timeout
   */
  private async executeWithTimeout(
    exec: any,
    stdin?: string,
    timeout: number = 30000
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise(async (resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Command execution timed out after ${timeout}ms`));
      }, timeout);

      try {
        const stream = await exec.start({ hijack: true, stdin: !!stdin });
        
        if (stdin) {
          stream.write(stdin);
          stream.end();
        }

        let stdout = '';
        let stderr = '';

        stream.on('data', (chunk: Buffer) => {
          const data = chunk.toString();
          // Docker multiplexes stdout/stderr - need to demux
          if (chunk[0] === 1) {
            stdout += data.slice(8); // Remove Docker header
          } else if (chunk[0] === 2) {
            stderr += data.slice(8); // Remove Docker header
          }
        });

        stream.on('end', async () => {
          try {
            const { ExitCode } = await exec.inspect();
            clearTimeout(timer);
            resolve({
              stdout: stdout.trim(),
              stderr: stderr.trim(),
              exitCode: ExitCode,
            });
          } catch (error) {
            clearTimeout(timer);
            reject(error);
          }
        });

        stream.on('error', (error: Error) => {
          clearTimeout(timer);
          reject(error);
        });
      } catch (error) {
        clearTimeout(timer);
        reject(error);
      }
    });
  }

  /**
   * Parse container statistics
   */
  private parseContainerStats(stats: any): { memory: number; cpu: number } {
    const memoryUsage = stats.memory_stats?.usage || 0;
    
    // Calculate CPU percentage
    const cpuDelta = stats.cpu_stats?.cpu_usage?.total_usage - 
                    (stats.precpu_stats?.cpu_usage?.total_usage || 0);
    const systemDelta = stats.cpu_stats?.system_cpu_usage - 
                       (stats.precpu_stats?.system_cpu_usage || 0);
    const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * 100 : 0;

    return {
      memory: memoryUsage,
      cpu: cpuPercent,
    };
  }

  /**
   * Close the sandbox manager
   */
  async close(): Promise<void> {
    clearInterval(this.cleanupInterval);
    
    // Destroy all active sandboxes
    const destroyPromises = Array.from(this.sandboxes.keys()).map(id => 
      this.destroySandbox(id)
    );
    
    await Promise.allSettled(destroyPromises);
    
    this.removeAllListeners();
    structuredLogger.info('Docker sandbox manager closed');
  }
}

// Export singleton instance
export const sandboxManager = new DockerSandboxManager();