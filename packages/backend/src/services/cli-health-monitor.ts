import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { cliInstaller } from './cli-installer.js';
import {
  comprehensiveAuditLogger,
  AuditCategory,
} from '../security/audit-logger.js';
import { SecurityLevel } from '../security/types.js';

// CLI Health Types
export interface CLIHealthStatus {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  availability: 'available' | 'unavailable' | 'partial';
  version?: string;
  lastChecked: Date;
  responseTime?: number;
  errors: string[];
  warnings: string[];
  metadata: {
    installPath?: string;
    executablePath?: string;
    configPath?: string;
    isGlobal: boolean;
    dependencies: CLIDependencyStatus[];
  };
  healthChecks: HealthCheckResult[];
  performance: PerformanceMetrics;
}

export interface CLIDependencyStatus {
  name: string;
  required: boolean;
  status: 'available' | 'missing' | 'outdated';
  version?: string;
  requiredVersion?: string;
}

export interface HealthCheckResult {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  timestamp: Date;
  duration: number;
  details?: any;
}

export interface PerformanceMetrics {
  averageResponseTime: number;
  uptime: number;
  successRate: number;
  lastSuccessfulCommand: Date | null;
  commandCount: number;
  errorCount: number;
}

export interface CLIMonitoringConfig {
  checkInterval: number; // milliseconds
  timeout: number; // milliseconds
  retryAttempts: number;
  enablePerformanceMonitoring: boolean;
  enableDeepHealthChecks: boolean;
  alertThresholds: {
    responseTime: number;
    errorRate: number;
    consecutiveFailures: number;
  };
}

export class CLIHealthMonitor extends EventEmitter {
  private static instance: CLIHealthMonitor;
  private healthStatuses: Map<string, CLIHealthStatus> = new Map();
  private monitoringIntervals: Map<string, NodeJS.Timeout> = new Map();
  private config: CLIMonitoringConfig;
  private isInitialized = false;

  constructor() {
    super();
    this.config = {
      checkInterval: 30000, // 30 seconds
      timeout: 10000, // 10 seconds
      retryAttempts: 3,
      enablePerformanceMonitoring: true,
      enableDeepHealthChecks: true,
      alertThresholds: {
        responseTime: 5000, // 5 seconds
        errorRate: 0.1, // 10%
        consecutiveFailures: 3,
      },
    };
  }

  static getInstance(): CLIHealthMonitor {
    if (!CLIHealthMonitor.instance) {
      CLIHealthMonitor.instance = new CLIHealthMonitor();
    }
    return CLIHealthMonitor.instance;
  }

  /**
   * Initialize the CLI health monitor
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Get all supported CLIs and start monitoring them
      const supportedCLIs = cliInstaller.getSupportedCLIs();

      for (const cliName of supportedCLIs) {
        await this.initializeCLIMonitoring(cliName);
      }

      // Set up cleanup handlers
      process.on('SIGTERM', () => this.cleanup());
      process.on('SIGINT', () => this.cleanup());

      this.isInitialized = true;
      this.emit('initialized');

      console.log('✅ CLI health monitor initialized');
    } catch (error) {
      console.error('❌ Failed to initialize CLI health monitor:', error);
      throw error;
    }
  }

  /**
   * Start monitoring a specific CLI
   */
  async startMonitoring(cliName: string): Promise<void> {
    if (this.monitoringIntervals.has(cliName)) {
      console.warn(`Already monitoring CLI: ${cliName}`);
      return;
    }

    await this.initializeCLIMonitoring(cliName);

    // Start periodic health checks
    const interval = setInterval(async () => {
      try {
        await this.performHealthCheck(cliName);
      } catch (error) {
        console.error(`Health check failed for ${cliName}:`, error);
      }
    }, this.config.checkInterval);

    this.monitoringIntervals.set(cliName, interval);
    this.emit('monitoringStarted', cliName);

    console.log(`📊 Started monitoring CLI: ${cliName}`);
  }

  /**
   * Stop monitoring a specific CLI
   */
  stopMonitoring(cliName: string): void {
    const interval = this.monitoringIntervals.get(cliName);
    if (interval) {
      clearInterval(interval);
      this.monitoringIntervals.delete(cliName);
      this.emit('monitoringStopped', cliName);
      console.log(`⏹️ Stopped monitoring CLI: ${cliName}`);
    }
  }

  /**
   * Get health status for a specific CLI
   */
  getHealthStatus(cliName: string): CLIHealthStatus | null {
    return this.healthStatuses.get(cliName) || null;
  }

  /**
   * Get health status for all monitored CLIs
   */
  getAllHealthStatuses(): CLIHealthStatus[] {
    return Array.from(this.healthStatuses.values());
  }

  /**
   * Perform immediate health check for a CLI
   */
  async performHealthCheck(cliName: string): Promise<CLIHealthStatus> {
    const startTime = Date.now();
    let status = this.healthStatuses.get(cliName);

    if (!status) {
      status = await this.createInitialHealthStatus(cliName);
      this.healthStatuses.set(cliName, status);
    }

    const healthChecks: HealthCheckResult[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Basic availability check
      const availabilityCheck = await this.checkAvailability(cliName);
      healthChecks.push(availabilityCheck);

      if (availabilityCheck.status === 'fail') {
        errors.push(availabilityCheck.message);
        status.availability = 'unavailable';
      } else {
        status.availability = 'available';
      }

      // Version check
      if (status.availability === 'available') {
        const versionCheck = await this.checkVersion(cliName);
        healthChecks.push(versionCheck);

        if (versionCheck.status === 'pass') {
          status.version = versionCheck.details?.version;
        } else if (versionCheck.status === 'warn') {
          warnings.push(versionCheck.message);
        }
      }

      // Dependencies check
      if (this.config.enableDeepHealthChecks) {
        const dependencyCheck = await this.checkDependencies(cliName);
        healthChecks.push(dependencyCheck);

        if (dependencyCheck.status === 'fail') {
          errors.push(dependencyCheck.message);
        } else if (dependencyCheck.status === 'warn') {
          warnings.push(dependencyCheck.message);
        }
      }

      // Configuration check
      const configCheck = await this.checkConfiguration(cliName);
      healthChecks.push(configCheck);

      if (configCheck.status === 'fail') {
        errors.push(configCheck.message);
      } else if (configCheck.status === 'warn') {
        warnings.push(configCheck.message);
      }

      // Performance check
      if (this.config.enablePerformanceMonitoring) {
        const performanceCheck = await this.checkPerformance(cliName);
        healthChecks.push(performanceCheck);

        if (performanceCheck.status === 'warn') {
          warnings.push(performanceCheck.message);
        }
      }

      // Update status
      status.errors = errors;
      status.warnings = warnings;
      status.healthChecks = healthChecks;
      status.lastChecked = new Date();
      status.responseTime = Date.now() - startTime;

      // Determine overall health status
      if (errors.length > 0) {
        status.status = 'unhealthy';
      } else if (warnings.length > 0) {
        status.status = 'degraded';
      } else {
        status.status = 'healthy';
      }

      // Update performance metrics
      this.updatePerformanceMetrics(status, errors.length === 0);

      // Check for alerts
      await this.checkAlerts(status);

      this.emit('healthCheckCompleted', status);
    } catch (error) {
      status.status = 'unknown';
      status.errors = [`Health check failed: ${(error as Error).message}`];
      status.lastChecked = new Date();

      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.SYSTEM_MONITORING,
        action: 'cli_health_check_failed',
        resourceType: 'cli_tool',
        resourceId: cliName,
        userId: 'system',
        outcome: 'failure',
        severity: SecurityLevel.MODERATE,
        details: {
          cliName,
          error: (error as Error).message,
        },
      });
    }

    return status;
  }

  /**
   * Get detailed diagnostics for a CLI
   */
  async getDiagnostics(cliName: string): Promise<{
    status: CLIHealthStatus;
    systemInfo: any;
    troubleshooting: string[];
    recommendations: string[];
  }> {
    const status = await this.performHealthCheck(cliName);

    const systemInfo = {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      environmentPath: process.env.PATH,
      homeDirectory: process.env.HOME || process.env.USERPROFILE,
      shellInfo: process.env.SHELL,
    };

    const troubleshooting: string[] = [];
    const recommendations: string[] = [];

    // Generate troubleshooting steps based on status
    if (status.availability === 'unavailable') {
      troubleshooting.push('CLI is not available in the system PATH');
      troubleshooting.push('Check if the CLI is properly installed');
      recommendations.push(
        'Try reinstalling the CLI using the installation manager'
      );
      recommendations.push(
        'Verify that the installation directory is in your PATH'
      );
    }

    if (status.errors.length > 0) {
      troubleshooting.push('CLI is reporting errors during health checks');
      recommendations.push(
        'Review the error messages and check CLI documentation'
      );
    }

    if (status.warnings.length > 0) {
      troubleshooting.push('CLI has warnings that may affect performance');
      recommendations.push('Address the warnings to improve CLI reliability');
    }

    if (status.performance.errorRate > this.config.alertThresholds.errorRate) {
      troubleshooting.push('CLI has a high error rate');
      recommendations.push('Consider updating the CLI to the latest version');
      recommendations.push('Check for known issues with the current version');
    }

    return {
      status,
      systemInfo,
      troubleshooting,
      recommendations,
    };
  }

  /**
   * Update monitoring configuration
   */
  updateConfig(newConfig: Partial<CLIMonitoringConfig>): void {
    this.config = { ...this.config, ...newConfig };

    // Restart monitoring with new configuration
    for (const cliName of this.monitoringIntervals.keys()) {
      this.stopMonitoring(cliName);
      this.startMonitoring(cliName);
    }

    this.emit('configUpdated', this.config);
  }

  /**
   * Get current monitoring configuration
   */
  getConfig(): CLIMonitoringConfig {
    return { ...this.config };
  }

  /**
   * Cleanup monitoring resources
   */
  cleanup(): void {
    for (const [cliName, interval] of this.monitoringIntervals) {
      clearInterval(interval);
    }
    this.monitoringIntervals.clear();
    this.emit('cleanup');
    console.log('🧹 CLI health monitor cleanup completed');
  }

  // Private methods

  private async initializeCLIMonitoring(cliName: string): Promise<void> {
    const status = await this.createInitialHealthStatus(cliName);
    this.healthStatuses.set(cliName, status);

    // Perform initial health check
    await this.performHealthCheck(cliName);
  }

  private async createInitialHealthStatus(
    cliName: string
  ): Promise<CLIHealthStatus> {
    return {
      name: cliName,
      status: 'unknown',
      availability: 'unknown',
      lastChecked: new Date(),
      errors: [],
      warnings: [],
      metadata: {
        isGlobal: false,
        dependencies: [],
      },
      healthChecks: [],
      performance: {
        averageResponseTime: 0,
        uptime: 0,
        successRate: 1.0,
        lastSuccessfulCommand: null,
        commandCount: 0,
        errorCount: 0,
      },
    };
  }

  private async checkAvailability(cliName: string): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      const availability = await cliInstaller.checkCLIAvailability(cliName);

      return {
        name: 'availability',
        status: availability.available ? 'pass' : 'fail',
        message: availability.available
          ? 'CLI is available'
          : 'CLI is not available',
        timestamp: new Date(),
        duration: Date.now() - startTime,
        details: availability,
      };
    } catch (error) {
      return {
        name: 'availability',
        status: 'fail',
        message: `Availability check failed: ${(error as Error).message}`,
        timestamp: new Date(),
        duration: Date.now() - startTime,
      };
    }
  }

  private async checkVersion(cliName: string): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      // Get version command for the CLI
      const versionCommand = this.getVersionCommand(cliName);
      if (!versionCommand) {
        return {
          name: 'version',
          status: 'warn',
          message: 'Version check not supported for this CLI',
          timestamp: new Date(),
          duration: Date.now() - startTime,
        };
      }

      const version = await this.executeCommand(versionCommand);

      return {
        name: 'version',
        status: 'pass',
        message: `Version check successful`,
        timestamp: new Date(),
        duration: Date.now() - startTime,
        details: { version: version.trim() },
      };
    } catch (error) {
      return {
        name: 'version',
        status: 'fail',
        message: `Version check failed: ${(error as Error).message}`,
        timestamp: new Date(),
        duration: Date.now() - startTime,
      };
    }
  }

  private async checkDependencies(cliName: string): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const cliInfo = cliInstaller.getCLIInfo(cliName);

    if (!cliInfo?.dependencies || cliInfo.dependencies.length === 0) {
      return {
        name: 'dependencies',
        status: 'pass',
        message: 'No dependencies to check',
        timestamp: new Date(),
        duration: Date.now() - startTime,
      };
    }

    const dependencyStatuses: CLIDependencyStatus[] = [];
    let hasErrors = false;
    let hasWarnings = false;

    for (const dep of cliInfo.dependencies) {
      try {
        const depAvailability = await cliInstaller.checkCLIAvailability(dep);
        const depStatus: CLIDependencyStatus = {
          name: dep,
          required: true,
          status: depAvailability.available ? 'available' : 'missing',
          version: depAvailability.version,
        };

        dependencyStatuses.push(depStatus);

        if (!depAvailability.available) {
          hasErrors = true;
        }
      } catch (error) {
        dependencyStatuses.push({
          name: dep,
          required: true,
          status: 'missing',
        });
        hasErrors = true;
      }
    }

    // Update the status metadata
    const status = this.healthStatuses.get(cliName);
    if (status) {
      status.metadata.dependencies = dependencyStatuses;
    }

    return {
      name: 'dependencies',
      status: hasErrors ? 'fail' : hasWarnings ? 'warn' : 'pass',
      message: hasErrors
        ? 'Some required dependencies are missing'
        : hasWarnings
          ? 'Some dependencies have warnings'
          : 'All dependencies are available',
      timestamp: new Date(),
      duration: Date.now() - startTime,
      details: { dependencies: dependencyStatuses },
    };
  }

  private async checkConfiguration(
    cliName: string
  ): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      // Check common configuration paths
      const configPaths = this.getConfigPaths(cliName);
      const configStatus = {
        hasConfig: false,
        configPaths: [] as string[],
        validConfig: false,
      };

      for (const configPath of configPaths) {
        if (existsSync(configPath)) {
          configStatus.hasConfig = true;
          configStatus.configPaths.push(configPath);
          configStatus.validConfig = true; // Assume valid if exists
        }
      }

      return {
        name: 'configuration',
        status: configStatus.validConfig ? 'pass' : 'warn',
        message: configStatus.hasConfig
          ? 'Configuration found and appears valid'
          : 'No configuration found (may use defaults)',
        timestamp: new Date(),
        duration: Date.now() - startTime,
        details: configStatus,
      };
    } catch (error) {
      return {
        name: 'configuration',
        status: 'warn',
        message: `Configuration check failed: ${(error as Error).message}`,
        timestamp: new Date(),
        duration: Date.now() - startTime,
      };
    }
  }

  private async checkPerformance(cliName: string): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const status = this.healthStatuses.get(cliName);

    if (!status) {
      return {
        name: 'performance',
        status: 'warn',
        message: 'No performance data available',
        timestamp: new Date(),
        duration: Date.now() - startTime,
      };
    }

    const { performance } = status;
    let healthStatus: 'pass' | 'warn' | 'fail' = 'pass';
    const issues: string[] = [];

    // Check response time
    if (
      performance.averageResponseTime > this.config.alertThresholds.responseTime
    ) {
      healthStatus = 'warn';
      issues.push(
        `High average response time: ${performance.averageResponseTime}ms`
      );
    }

    // Check error rate
    if (performance.errorRate > this.config.alertThresholds.errorRate) {
      healthStatus = 'warn';
      issues.push(
        `High error rate: ${(performance.errorRate * 100).toFixed(1)}%`
      );
    }

    return {
      name: 'performance',
      status: healthStatus,
      message:
        issues.length > 0
          ? issues.join('; ')
          : 'Performance is within acceptable limits',
      timestamp: new Date(),
      duration: Date.now() - startTime,
      details: { performance, issues },
    };
  }

  private updatePerformanceMetrics(
    status: CLIHealthStatus,
    success: boolean
  ): void {
    const { performance } = status;

    performance.commandCount++;
    if (!success) {
      performance.errorCount++;
    } else {
      performance.lastSuccessfulCommand = new Date();
    }

    performance.successRate =
      (performance.commandCount - performance.errorCount) /
      performance.commandCount;
    performance.errorRate = performance.errorCount / performance.commandCount;

    // Update average response time
    if (status.responseTime) {
      performance.averageResponseTime =
        (performance.averageResponseTime * (performance.commandCount - 1) +
          status.responseTime) /
        performance.commandCount;
    }
  }

  private async checkAlerts(status: CLIHealthStatus): Promise<void> {
    const { alertThresholds } = this.config;

    // Check for consecutive failures
    if (status.performance.errorCount >= alertThresholds.consecutiveFailures) {
      this.emit('alert', {
        type: 'consecutive_failures',
        severity: 'high',
        cliName: status.name,
        message: `CLI has ${status.performance.errorCount} consecutive failures`,
        status,
      });
    }

    // Check response time alert
    if (
      status.responseTime &&
      status.responseTime > alertThresholds.responseTime
    ) {
      this.emit('alert', {
        type: 'high_response_time',
        severity: 'medium',
        cliName: status.name,
        message: `CLI response time (${status.responseTime}ms) exceeds threshold`,
        status,
      });
    }

    // Check error rate alert
    if (status.performance.errorRate > alertThresholds.errorRate) {
      this.emit('alert', {
        type: 'high_error_rate',
        severity: 'medium',
        cliName: status.name,
        message: `CLI error rate (${(status.performance.errorRate * 100).toFixed(1)}%) exceeds threshold`,
        status,
      });
    }
  }

  private async executeCommand(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const [cmd, ...args] = command.split(' ');
      const process = spawn(cmd, args, {
        stdio: 'pipe',
        timeout: this.config.timeout,
      });

      let stdout = '';
      let stderr = '';

      process.stdout?.on('data', data => {
        stdout += data.toString();
      });

      process.stderr?.on('data', data => {
        stderr += data.toString();
      });

      process.on('close', code => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr}`));
        }
      });

      process.on('error', error => {
        reject(error);
      });
    });
  }

  private getVersionCommand(cliName: string): string | null {
    const versionCommands: Record<string, string> = {
      'claude-code': 'claude --version',
      node: 'node --version',
      npm: 'npm --version',
      git: 'git --version',
      python: 'python --version',
      pip: 'pip --version',
      bun: 'bun --version',
      docker: 'docker --version',
      kubectl: 'kubectl version --client',
    };

    return versionCommands[cliName] || null;
  }

  private getConfigPaths(cliName: string): string[] {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    const configPaths: Record<string, string[]> = {
      'claude-code': [
        join(home, '.claude', 'config.json'),
        join(home, '.config', 'claude', 'config.json'),
      ],
      git: [join(home, '.gitconfig'), join(home, '.config', 'git', 'config')],
      npm: [join(home, '.npmrc'), join(home, '.config', 'npm', 'config')],
    };

    return configPaths[cliName] || [];
  }

  /**
   * Trigger health check after CLI installation
   */
  async onCLIInstalled(cliName: string): Promise<void> {
    try {
      // Start monitoring the newly installed CLI
      await this.startMonitoring(cliName);

      // Perform immediate health check
      await this.performHealthCheck(cliName);

      this.emit('cliInstalled', cliName);
    } catch (error) {
      console.error(
        `Failed to start monitoring after CLI installation: ${cliName}`,
        error
      );
    }
  }

  /**
   * Handle CLI uninstallation
   */
  onCLIUninstalled(cliName: string): void {
    try {
      // Stop monitoring the uninstalled CLI
      this.stopMonitoring(cliName);

      // Remove health status
      this.healthStatuses.delete(cliName);

      this.emit('cliUninstalled', cliName);
    } catch (error) {
      console.error(
        `Failed to cleanup monitoring after CLI uninstallation: ${cliName}`,
        error
      );
    }
  }
}

// Export singleton instance
export const cliHealthMonitor = CLIHealthMonitor.getInstance();
