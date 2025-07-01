import { promises as fs } from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { structuredLogger } from '../middleware/logging.js';
import type { DeploymentConfig, ServiceDefinition } from './orchestration-manager.js';

export interface ComposeService {
  image: string;
  container_name?: string;
  ports?: string[];
  environment?: Record<string, string>;
  volumes?: string[];
  networks?: string[];
  depends_on?: string[];
  restart?: 'no' | 'always' | 'on-failure' | 'unless-stopped';
  deploy?: {
    replicas?: number;
    resources?: {
      limits?: {
        cpus?: string;
        memory?: string;
      };
      reservations?: {
        cpus?: string;
        memory?: string;
      };
    };
    restart_policy?: {
      condition?: 'none' | 'on-failure' | 'any';
      delay?: string;
      max_attempts?: number;
      window?: string;
    };
  };
  healthcheck?: {
    test: string | string[];
    interval?: string;
    timeout?: string;
    retries?: number;
    start_period?: string;
  };
  labels?: Record<string, string>;
  command?: string | string[];
  entrypoint?: string | string[];
  working_dir?: string;
  user?: string;
  security_opt?: string[];
  cap_add?: string[];
  cap_drop?: string[];
  read_only?: boolean;
}

export interface ComposeConfig {
  version: string;
  services: Record<string, ComposeService>;
  networks?: Record<string, any>;
  volumes?: Record<string, any>;
  configs?: Record<string, any>;
  secrets?: Record<string, any>;
}

export interface ComposeStack {
  id: string;
  name: string;
  config: ComposeConfig;
  filePath: string;
  status: 'stopped' | 'starting' | 'running' | 'stopping' | 'failed';
  services: Record<string, {
    status: string;
    health: string;
    ports: string[];
    image: string;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

export class ComposeManager extends EventEmitter {
  private stacks = new Map<string, ComposeStack>();
  private stacksDirectory: string;

  constructor(stacksDirectory: string = '/tmp/vibe-compose-stacks') {
    super();
    this.stacksDirectory = stacksDirectory;
    this.initializeDirectory();
  }

  /**
   * Create Docker Compose configuration from deployment config
   */
  async createComposeStack(
    name: string,
    deploymentConfig: DeploymentConfig
  ): Promise<string> {
    try {
      const stackId = `${name}-${Date.now()}`;
      const composeConfig = this.convertToComposeConfig(deploymentConfig);
      const filePath = join(this.stacksDirectory, `${stackId}.yml`);

      // Write compose file
      await this.writeComposeFile(filePath, composeConfig);

      const stack: ComposeStack = {
        id: stackId,
        name,
        config: composeConfig,
        filePath,
        status: 'stopped',
        services: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      this.stacks.set(stackId, stack);

      structuredLogger.info('Compose stack created', {
        stackId,
        name,
        services: Object.keys(composeConfig.services).length,
      });

      return stackId;
    } catch (error) {
      structuredLogger.error('Failed to create compose stack', error as Error, { name });
      throw error;
    }
  }

  /**
   * Deploy a compose stack
   */
  async deployStack(stackId: string): Promise<boolean> {
    const stack = this.stacks.get(stackId);
    if (!stack) {
      throw new Error(`Stack ${stackId} not found`);
    }

    try {
      stack.status = 'starting';
      this.emit('stackStatusChanged', stack);

      const result = await this.runDockerComposeCommand(stack.filePath, ['up', '-d']);
      
      if (result.success) {
        stack.status = 'running';
        stack.updatedAt = new Date();
        
        // Update service status
        await this.updateStackServiceStatus(stack);
        
        this.emit('stackDeployed', stack);
        structuredLogger.info('Stack deployed successfully', { stackId, name: stack.name });
        return true;
      } else {
        stack.status = 'failed';
        this.emit('stackFailed', stack);
        structuredLogger.error('Stack deployment failed', new Error(result.error), { stackId });
        return false;
      }
    } catch (error) {
      stack.status = 'failed';
      this.emit('stackFailed', stack);
      structuredLogger.error('Stack deployment error', error as Error, { stackId });
      return false;
    }
  }

  /**
   * Stop a compose stack
   */
  async stopStack(stackId: string): Promise<boolean> {
    const stack = this.stacks.get(stackId);
    if (!stack) {
      throw new Error(`Stack ${stackId} not found`);
    }

    try {
      stack.status = 'stopping';
      this.emit('stackStatusChanged', stack);

      const result = await this.runDockerComposeCommand(stack.filePath, ['down']);
      
      if (result.success) {
        stack.status = 'stopped';
        stack.updatedAt = new Date();
        stack.services = {};
        
        this.emit('stackStopped', stack);
        structuredLogger.info('Stack stopped successfully', { stackId, name: stack.name });
        return true;
      } else {
        structuredLogger.error('Stack stop failed', new Error(result.error), { stackId });
        return false;
      }
    } catch (error) {
      structuredLogger.error('Stack stop error', error as Error, { stackId });
      return false;
    }
  }

  /**
   * Scale a service in a stack
   */
  async scaleService(
    stackId: string,
    serviceName: string,
    replicas: number
  ): Promise<boolean> {
    const stack = this.stacks.get(stackId);
    if (!stack) {
      throw new Error(`Stack ${stackId} not found`);
    }

    try {
      const result = await this.runDockerComposeCommand(
        stack.filePath,
        ['up', '-d', '--scale', `${serviceName}=${replicas}`, '--no-recreate']
      );

      if (result.success) {
        await this.updateStackServiceStatus(stack);
        stack.updatedAt = new Date();
        
        this.emit('serviceScaled', { stackId, serviceName, replicas });
        structuredLogger.info('Service scaled successfully', {
          stackId,
          serviceName,
          replicas,
        });
        return true;
      } else {
        structuredLogger.error('Service scaling failed', new Error(result.error), {
          stackId,
          serviceName,
        });
        return false;
      }
    } catch (error) {
      structuredLogger.error('Service scaling error', error as Error, {
        stackId,
        serviceName,
      });
      return false;
    }
  }

  /**
   * Update a stack configuration
   */
  async updateStack(
    stackId: string,
    newDeploymentConfig: DeploymentConfig
  ): Promise<boolean> {
    const stack = this.stacks.get(stackId);
    if (!stack) {
      throw new Error(`Stack ${stackId} not found`);
    }

    try {
      const newComposeConfig = this.convertToComposeConfig(newDeploymentConfig);
      
      // Backup old file
      const backupPath = `${stack.filePath}.backup`;
      await fs.copyFile(stack.filePath, backupPath);

      // Write new configuration
      await this.writeComposeFile(stack.filePath, newComposeConfig);

      // Update stack
      const result = await this.runDockerComposeCommand(stack.filePath, ['up', '-d']);

      if (result.success) {
        stack.config = newComposeConfig;
        stack.updatedAt = new Date();
        
        await this.updateStackServiceStatus(stack);
        
        this.emit('stackUpdated', stack);
        structuredLogger.info('Stack updated successfully', { stackId, name: stack.name });
        
        // Remove backup
        await fs.unlink(backupPath);
        return true;
      } else {
        // Restore backup on failure
        await fs.copyFile(backupPath, stack.filePath);
        await fs.unlink(backupPath);
        
        structuredLogger.error('Stack update failed, restored backup', new Error(result.error), {
          stackId,
        });
        return false;
      }
    } catch (error) {
      structuredLogger.error('Stack update error', error as Error, { stackId });
      return false;
    }
  }

  /**
   * Get stack logs
   */
  async getStackLogs(
    stackId: string,
    serviceName?: string,
    options: {
      follow?: boolean;
      tail?: number;
      since?: string;
    } = {}
  ): Promise<{
    success: boolean;
    logs?: string;
    error?: string;
  }> {
    const stack = this.stacks.get(stackId);
    if (!stack) {
      throw new Error(`Stack ${stackId} not found`);
    }

    try {
      const args = ['logs'];
      
      if (options.follow) args.push('-f');
      if (options.tail) args.push('--tail', options.tail.toString());
      if (options.since) args.push('--since', options.since);
      
      if (serviceName) {
        args.push(serviceName);
      }

      const result = await this.runDockerComposeCommand(stack.filePath, args);
      return result;
    } catch (error) {
      structuredLogger.error('Failed to get stack logs', error as Error, { stackId });
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Execute command in service container
   */
  async executeInService(
    stackId: string,
    serviceName: string,
    command: string[]
  ): Promise<{
    success: boolean;
    output?: string;
    error?: string;
  }> {
    const stack = this.stacks.get(stackId);
    if (!stack) {
      throw new Error(`Stack ${stackId} not found`);
    }

    try {
      const args = ['exec', '-T', serviceName, ...command];
      const result = await this.runDockerComposeCommand(stack.filePath, args);
      return result;
    } catch (error) {
      structuredLogger.error('Failed to execute command in service', error as Error, {
        stackId,
        serviceName,
        command,
      });
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * List all stacks
   */
  listStacks(): ComposeStack[] {
    return Array.from(this.stacks.values());
  }

  /**
   * Get specific stack
   */
  getStack(stackId: string): ComposeStack | undefined {
    return this.stacks.get(stackId);
  }

  /**
   * Remove a stack
   */
  async removeStack(stackId: string): Promise<boolean> {
    const stack = this.stacks.get(stackId);
    if (!stack) {
      return false;
    }

    try {
      // Stop stack first
      if (stack.status === 'running') {
        await this.stopStack(stackId);
      }

      // Remove compose file
      await fs.unlink(stack.filePath);

      // Remove from memory
      this.stacks.delete(stackId);

      this.emit('stackRemoved', stack);
      structuredLogger.info('Stack removed', { stackId, name: stack.name });
      return true;
    } catch (error) {
      structuredLogger.error('Failed to remove stack', error as Error, { stackId });
      return false;
    }
  }

  // Private methods

  private async initializeDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.stacksDirectory, { recursive: true });
    } catch (error) {
      structuredLogger.error('Failed to initialize stacks directory', error as Error);
      throw error;
    }
  }

  private convertToComposeConfig(deploymentConfig: DeploymentConfig): ComposeConfig {
    const services: Record<string, ComposeService> = {};
    const networks: Record<string, any> = {};

    // Create default network
    networks[deploymentConfig.namespace] = {
      driver: 'bridge',
    };

    for (const service of deploymentConfig.services) {
      const composeService: ComposeService = {
        image: service.image,
        container_name: `${deploymentConfig.name}-${service.name}`,
        environment: service.environment,
        networks: [deploymentConfig.namespace],
        restart: service.restartPolicy,
        labels: {
          ...service.labels,
          'vibe.deployment': deploymentConfig.name,
          'vibe.service': service.name,
          'vibe.namespace': deploymentConfig.namespace,
        },
      };

      // Add volumes
      if (service.volumes && service.volumes.length > 0) {
        composeService.volumes = service.volumes.map(
          v => `${v.host}:${v.container}:${v.mode}`
        );
      }

      // Add resource limits
      if (service.resources) {
        composeService.deploy = {
          replicas: service.replicas,
          resources: {
            limits: {
              cpus: (service.resources.cpu / 1000).toString(), // Convert to CPU units
              memory: `${Math.floor(service.resources.memory / 1024 / 1024)}M`, // Convert to MB
            },
          },
          restart_policy: {
            condition: service.restartPolicy === 'never' ? 'none' : 'on-failure',
            max_attempts: 3,
          },
        };
      }

      // Add health check
      if (service.healthCheck) {
        composeService.healthcheck = {
          test: service.healthCheck.command.split(' '),
          interval: `${service.healthCheck.interval}ms`,
          timeout: `${service.healthCheck.timeout}ms`,
          retries: service.healthCheck.retries,
        };
      }

      // Add security options based on security profile
      const securityOpt = ['no-new-privileges:true'];
      composeService.security_opt = securityOpt;
      composeService.cap_drop = ['ALL'];
      composeService.read_only = false; // Could be set based on security profile

      services[service.name] = composeService;
    }

    return {
      version: '3.8',
      services,
      networks,
    };
  }

  private async writeComposeFile(filePath: string, config: ComposeConfig): Promise<void> {
    const yaml = this.convertToYaml(config);
    await fs.writeFile(filePath, yaml, 'utf8');
  }

  private convertToYaml(config: ComposeConfig): string {
    // Simple YAML conversion - in production, use a proper YAML library
    let yaml = `version: '${config.version}'\n\n`;

    // Services
    yaml += 'services:\n';
    for (const [name, service] of Object.entries(config.services)) {
      yaml += `  ${name}:\n`;
      yaml += `    image: ${service.image}\n`;
      
      if (service.container_name) {
        yaml += `    container_name: ${service.container_name}\n`;
      }
      
      if (service.environment) {
        yaml += '    environment:\n';
        for (const [key, value] of Object.entries(service.environment)) {
          yaml += `      ${key}: "${value}"\n`;
        }
      }
      
      if (service.volumes) {
        yaml += '    volumes:\n';
        for (const volume of service.volumes) {
          yaml += `      - ${volume}\n`;
        }
      }
      
      if (service.networks) {
        yaml += '    networks:\n';
        for (const network of service.networks) {
          yaml += `      - ${network}\n`;
        }
      }
      
      if (service.restart) {
        yaml += `    restart: ${service.restart}\n`;
      }
      
      if (service.labels) {
        yaml += '    labels:\n';
        for (const [key, value] of Object.entries(service.labels)) {
          yaml += `      ${key}: "${value}"\n`;
        }
      }
      
      if (service.healthcheck) {
        yaml += '    healthcheck:\n';
        yaml += `      test: [${service.healthcheck.test.map(t => `"${t}"`).join(', ')}]\n`;
        if (service.healthcheck.interval) {
          yaml += `      interval: ${service.healthcheck.interval}\n`;
        }
        if (service.healthcheck.timeout) {
          yaml += `      timeout: ${service.healthcheck.timeout}\n`;
        }
        if (service.healthcheck.retries) {
          yaml += `      retries: ${service.healthcheck.retries}\n`;
        }
      }
      
      if (service.deploy) {
        yaml += '    deploy:\n';
        if (service.deploy.replicas) {
          yaml += `      replicas: ${service.deploy.replicas}\n`;
        }
        if (service.deploy.resources) {
          yaml += '      resources:\n';
          if (service.deploy.resources.limits) {
            yaml += '        limits:\n';
            if (service.deploy.resources.limits.cpus) {
              yaml += `          cpus: '${service.deploy.resources.limits.cpus}'\n`;
            }
            if (service.deploy.resources.limits.memory) {
              yaml += `          memory: ${service.deploy.resources.limits.memory}\n`;
            }
          }
        }
      }
      
      yaml += '\n';
    }

    // Networks
    if (config.networks) {
      yaml += 'networks:\n';
      for (const [name, network] of Object.entries(config.networks)) {
        yaml += `  ${name}:\n`;
        if (network.driver) {
          yaml += `    driver: ${network.driver}\n`;
        }
      }
    }

    return yaml;
  }

  private async runDockerComposeCommand(
    filePath: string,
    args: string[]
  ): Promise<{
    success: boolean;
    logs?: string;
    error?: string;
  }> {
    return new Promise((resolve) => {
      const command = spawn('docker-compose', ['-f', filePath, ...args], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      command.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      command.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      command.on('close', (code) => {
        if (code === 0) {
          resolve({
            success: true,
            logs: stdout,
          });
        } else {
          resolve({
            success: false,
            error: stderr || stdout,
          });
        }
      });

      command.on('error', (error) => {
        resolve({
          success: false,
          error: error.message,
        });
      });
    });
  }

  private async updateStackServiceStatus(stack: ComposeStack): Promise<void> {
    try {
      const result = await this.runDockerComposeCommand(stack.filePath, ['ps', '--format', 'json']);
      
      if (result.success && result.logs) {
        // Parse service status from docker-compose ps output
        // This is a simplified version - actual implementation would parse JSON
        stack.services = {};
        
        for (const serviceName of Object.keys(stack.config.services)) {
          stack.services[serviceName] = {
            status: 'running', // Would parse from actual output
            health: 'healthy',
            ports: [],
            image: stack.config.services[serviceName].image,
          };
        }
      }
    } catch (error) {
      structuredLogger.error('Failed to update service status', error as Error, {
        stackId: stack.id,
      });
    }
  }
}

// Export singleton instance
export const composeManager = new ComposeManager();