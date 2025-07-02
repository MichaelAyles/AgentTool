import { EventEmitter } from 'events';
import Docker from 'dockerode';
import { structuredLogger } from '../middleware/logging.js';
import { sandboxManager } from './sandbox-manager.js';
import { orchestrationManager } from './orchestration-manager.js';
import { v4 as uuidv4 } from 'uuid';

export interface ResourceMetrics {
  containerId: string;
  timestamp: Date;
  cpu: {
    usage: number; // Percentage
    throttled: number;
    system: number;
    user: number;
  };
  memory: {
    usage: number; // Bytes
    limit: number; // Bytes
    percentage: number;
    cache: number;
    rss: number;
    swap: number;
  };
  network: {
    rxBytes: number;
    txBytes: number;
    rxPackets: number;
    txPackets: number;
    rxErrors: number;
    txErrors: number;
  };
  disk: {
    readBytes: number;
    writeBytes: number;
    readOps: number;
    writeOps: number;
  };
  processes: {
    running: number;
    sleeping: number;
    stopped: number;
    zombie: number;
  };
}

export interface ResourceLimit {
  containerId: string;
  cpu: {
    cores: number; // Number of CPU cores
    percentage: number; // Max CPU percentage
  };
  memory: {
    limit: number; // Bytes
    swap: number; // Bytes
    reservation: number; // Bytes
  };
  network: {
    bandwidth: number; // Bytes per second
    connections: number; // Max connections
  };
  disk: {
    readRate: number; // Bytes per second
    writeRate: number; // Bytes per second
    space: number; // Bytes
  };
  processes: {
    max: number; // Max process count
  };
}

export interface ResourceAlert {
  id: string;
  containerId: string;
  type: 'cpu' | 'memory' | 'network' | 'disk' | 'processes';
  severity: 'warning' | 'critical';
  threshold: number;
  currentValue: number;
  message: string;
  timestamp: Date;
  acknowledged: boolean;
}

export interface ThresholdConfig {
  cpu: {
    warning: number; // Percentage
    critical: number; // Percentage
  };
  memory: {
    warning: number; // Percentage
    critical: number; // Percentage
  };
  network: {
    warning: number; // Bytes per second
    critical: number; // Bytes per second
  };
  disk: {
    warning: number; // Bytes per second
    critical: number; // Bytes per second
  };
  processes: {
    warning: number; // Process count
    critical: number; // Process count
  };
}

export class ResourceMonitor extends EventEmitter {
  private docker: Docker;
  private metrics = new Map<string, ResourceMetrics[]>();
  private limits = new Map<string, ResourceLimit>();
  private alerts = new Map<string, ResourceAlert[]>();
  private monitoringInterval: NodeJS.Timeout;
  private activeContainers = new Set<string>();

  private config = {
    monitoringInterval: 5000, // 5 seconds
    metricsRetention: 3600000, // 1 hour
    maxMetricsPerContainer: 720, // 1 hour at 5-second intervals
    alertCooldown: 300000, // 5 minutes
  };

  private defaultThresholds: ThresholdConfig = {
    cpu: { warning: 70, critical: 90 },
    memory: { warning: 80, critical: 95 },
    network: { warning: 100 * 1024 * 1024, critical: 200 * 1024 * 1024 }, // 100MB/s, 200MB/s
    disk: { warning: 50 * 1024 * 1024, critical: 100 * 1024 * 1024 }, // 50MB/s, 100MB/s
    processes: { warning: 100, critical: 200 },
  };

  constructor() {
    super();

    this.docker = new Docker({
      socketPath: process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock',
    });

    this.startMonitoring();
    this.startCleanupTask();

    // Listen for container events
    sandboxManager.on('containerCreated', container => {
      this.addContainer(container.id);
    });

    sandboxManager.on('containerDestroyed', ({ containerId }) => {
      this.removeContainer(containerId);
    });

    structuredLogger.info('Resource monitor initialized');
  }

  /**
   * Add a container to monitoring
   */
  addContainer(containerId: string): void {
    this.activeContainers.add(containerId);

    if (!this.metrics.has(containerId)) {
      this.metrics.set(containerId, []);
    }

    if (!this.alerts.has(containerId)) {
      this.alerts.set(containerId, []);
    }

    structuredLogger.info('Container added to resource monitoring', {
      containerId,
    });
  }

  /**
   * Remove a container from monitoring
   */
  removeContainer(containerId: string): void {
    this.activeContainers.delete(containerId);

    structuredLogger.info('Container removed from resource monitoring', {
      containerId,
    });
  }

  /**
   * Set resource limits for a container
   */
  async setResourceLimits(
    containerId: string,
    limits: ResourceLimit
  ): Promise<boolean> {
    try {
      const container = this.docker.getContainer(containerId);

      // Update container with new limits
      await container.update({
        Memory: limits.memory.limit,
        MemorySwap: limits.memory.swap,
        MemoryReservation: limits.memory.reservation,
        CpuQuota: Math.floor(limits.cpu.percentage * 1000), // Convert to CPU quota
        CpuPeriod: 100000,
        PidsLimit: limits.processes.max,
        BlkioDeviceReadBps: [{ Path: '/dev/sda', Rate: limits.disk.readRate }],
        BlkioDeviceWriteBps: [
          { Path: '/dev/sda', Rate: limits.disk.writeRate },
        ],
      });

      this.limits.set(containerId, limits);

      this.emit('limitsUpdated', { containerId, limits });
      structuredLogger.info('Resource limits updated', { containerId, limits });

      return true;
    } catch (error) {
      structuredLogger.error('Failed to set resource limits', error as Error, {
        containerId,
      });
      return false;
    }
  }

  /**
   * Get current resource metrics for a container
   */
  getMetrics(containerId: string): ResourceMetrics[] {
    return this.metrics.get(containerId) || [];
  }

  /**
   * Get resource limits for a container
   */
  getLimits(containerId: string): ResourceLimit | undefined {
    return this.limits.get(containerId);
  }

  /**
   * Get active alerts for a container
   */
  getAlerts(containerId: string): ResourceAlert[] {
    return this.alerts.get(containerId) || [];
  }

  /**
   * Get all active alerts
   */
  getAllAlerts(): ResourceAlert[] {
    const allAlerts: ResourceAlert[] = [];
    for (const alerts of this.alerts.values()) {
      allAlerts.push(...alerts.filter(a => !a.acknowledged));
    }
    return allAlerts.sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
    );
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string): boolean {
    for (const alerts of this.alerts.values()) {
      const alert = alerts.find(a => a.id === alertId);
      if (alert) {
        alert.acknowledged = true;
        this.emit('alertAcknowledged', alert);
        return true;
      }
    }
    return false;
  }

  /**
   * Get resource utilization summary
   */
  getUtilizationSummary(): {
    totalContainers: number;
    averageCpuUsage: number;
    averageMemoryUsage: number;
    totalMemoryUsed: number;
    activeAlerts: number;
    criticalAlerts: number;
  } {
    const containers = Array.from(this.activeContainers);
    let totalCpu = 0;
    let totalMemoryUsed = 0;
    let validMetrics = 0;

    for (const containerId of containers) {
      const metrics = this.metrics.get(containerId);
      if (metrics && metrics.length > 0) {
        const latest = metrics[metrics.length - 1];
        totalCpu += latest.cpu.usage;
        totalMemoryUsed += latest.memory.usage;
        validMetrics++;
      }
    }

    const allAlerts = this.getAllAlerts();

    return {
      totalContainers: containers.length,
      averageCpuUsage: validMetrics > 0 ? totalCpu / validMetrics : 0,
      averageMemoryUsage: validMetrics > 0 ? totalMemoryUsed / validMetrics : 0,
      totalMemoryUsed,
      activeAlerts: allAlerts.length,
      criticalAlerts: allAlerts.filter(a => a.severity === 'critical').length,
    };
  }

  /**
   * Get resource trends for a container
   */
  getResourceTrends(
    containerId: string,
    timeRange: number = 3600000
  ): {
    cpu: Array<{ timestamp: Date; value: number }>;
    memory: Array<{ timestamp: Date; value: number }>;
    network: Array<{ timestamp: Date; rx: number; tx: number }>;
  } {
    const metrics = this.metrics.get(containerId) || [];
    const cutoff = new Date(Date.now() - timeRange);
    const recentMetrics = metrics.filter(m => m.timestamp >= cutoff);

    return {
      cpu: recentMetrics.map(m => ({
        timestamp: m.timestamp,
        value: m.cpu.usage,
      })),
      memory: recentMetrics.map(m => ({
        timestamp: m.timestamp,
        value: m.memory.percentage,
      })),
      network: recentMetrics.map(m => ({
        timestamp: m.timestamp,
        rx: m.network.rxBytes,
        tx: m.network.txBytes,
      })),
    };
  }

  /**
   * Predict resource usage based on trends
   */
  predictResourceUsage(
    containerId: string,
    forecastMinutes: number = 30
  ): {
    cpu: { predicted: number; confidence: number };
    memory: { predicted: number; confidence: number };
    alerts: string[];
  } {
    const metrics = this.metrics.get(containerId) || [];
    if (metrics.length < 10) {
      return {
        cpu: { predicted: 0, confidence: 0 },
        memory: { predicted: 0, confidence: 0 },
        alerts: ['Insufficient data for prediction'],
      };
    }

    // Simple linear regression for trend analysis
    const recent = metrics.slice(-20); // Last 20 data points
    const cpuTrend = this.calculateTrend(recent.map(m => m.cpu.usage));
    const memoryTrend = this.calculateTrend(
      recent.map(m => m.memory.percentage)
    );

    const forecastIntervals =
      (forecastMinutes * 60 * 1000) / this.config.monitoringInterval;
    const predictedCpu = Math.max(
      0,
      Math.min(100, cpuTrend.predicted + cpuTrend.slope * forecastIntervals)
    );
    const predictedMemory = Math.max(
      0,
      Math.min(
        100,
        memoryTrend.predicted + memoryTrend.slope * forecastIntervals
      )
    );

    const alerts: string[] = [];
    if (predictedCpu > this.defaultThresholds.cpu.warning) {
      alerts.push(
        `CPU usage may exceed ${this.defaultThresholds.cpu.warning}% in ${forecastMinutes} minutes`
      );
    }
    if (predictedMemory > this.defaultThresholds.memory.warning) {
      alerts.push(
        `Memory usage may exceed ${this.defaultThresholds.memory.warning}% in ${forecastMinutes} minutes`
      );
    }

    return {
      cpu: { predicted: predictedCpu, confidence: cpuTrend.confidence },
      memory: {
        predicted: predictedMemory,
        confidence: memoryTrend.confidence,
      },
      alerts,
    };
  }

  // Private methods

  private startMonitoring(): void {
    this.monitoringInterval = setInterval(async () => {
      for (const containerId of this.activeContainers) {
        await this.collectMetrics(containerId);
      }
    }, this.config.monitoringInterval);
  }

  private async collectMetrics(containerId: string): Promise<void> {
    try {
      const container = this.docker.getContainer(containerId);
      const stats = await container.stats({ stream: false });

      const metrics: ResourceMetrics = {
        containerId,
        timestamp: new Date(),
        cpu: this.calculateCpuMetrics(stats),
        memory: this.calculateMemoryMetrics(stats),
        network: this.calculateNetworkMetrics(stats),
        disk: this.calculateDiskMetrics(stats),
        processes: this.calculateProcessMetrics(stats),
      };

      // Store metrics
      const containerMetrics = this.metrics.get(containerId) || [];
      containerMetrics.push(metrics);

      // Limit stored metrics
      if (containerMetrics.length > this.config.maxMetricsPerContainer) {
        containerMetrics.splice(
          0,
          containerMetrics.length - this.config.maxMetricsPerContainer
        );
      }

      this.metrics.set(containerId, containerMetrics);

      // Check for threshold violations
      this.checkThresholds(containerId, metrics);

      this.emit('metricsCollected', metrics);
    } catch (error) {
      // Container might have been destroyed
      structuredLogger.debug('Failed to collect metrics for container', {
        containerId,
        error: (error as Error).message,
      });
    }
  }

  private calculateCpuMetrics(stats: any): ResourceMetrics['cpu'] {
    const cpuDelta =
      stats.cpu_stats?.cpu_usage?.total_usage -
      (stats.precpu_stats?.cpu_usage?.total_usage || 0);
    const systemDelta =
      stats.cpu_stats?.system_cpu_usage -
      (stats.precpu_stats?.system_cpu_usage || 0);

    const usage = systemDelta > 0 ? (cpuDelta / systemDelta) * 100 : 0;

    return {
      usage: Math.min(100, Math.max(0, usage)),
      throttled: stats.cpu_stats?.throttling_data?.throttled_time || 0,
      system: stats.cpu_stats?.cpu_usage?.usage_in_kernelmode || 0,
      user: stats.cpu_stats?.cpu_usage?.usage_in_usermode || 0,
    };
  }

  private calculateMemoryMetrics(stats: any): ResourceMetrics['memory'] {
    const usage = stats.memory_stats?.usage || 0;
    const limit = stats.memory_stats?.limit || 0;
    const cache = stats.memory_stats?.stats?.cache || 0;

    return {
      usage,
      limit,
      percentage: limit > 0 ? (usage / limit) * 100 : 0,
      cache,
      rss: stats.memory_stats?.stats?.rss || 0,
      swap: stats.memory_stats?.stats?.swap || 0,
    };
  }

  private calculateNetworkMetrics(stats: any): ResourceMetrics['network'] {
    const networks = stats.networks || {};
    let rxBytes = 0,
      txBytes = 0,
      rxPackets = 0,
      txPackets = 0,
      rxErrors = 0,
      txErrors = 0;

    for (const network of Object.values(networks) as any[]) {
      rxBytes += network.rx_bytes || 0;
      txBytes += network.tx_bytes || 0;
      rxPackets += network.rx_packets || 0;
      txPackets += network.tx_packets || 0;
      rxErrors += network.rx_errors || 0;
      txErrors += network.tx_errors || 0;
    }

    return { rxBytes, txBytes, rxPackets, txPackets, rxErrors, txErrors };
  }

  private calculateDiskMetrics(stats: any): ResourceMetrics['disk'] {
    const blkio = stats.blkio_stats?.io_service_bytes_recursive || [];
    let readBytes = 0,
      writeBytes = 0;

    for (const entry of blkio) {
      if (entry.op === 'Read') readBytes += entry.value || 0;
      if (entry.op === 'Write') writeBytes += entry.value || 0;
    }

    const ioOps = stats.blkio_stats?.io_serviced_recursive || [];
    let readOps = 0,
      writeOps = 0;

    for (const entry of ioOps) {
      if (entry.op === 'Read') readOps += entry.value || 0;
      if (entry.op === 'Write') writeOps += entry.value || 0;
    }

    return { readBytes, writeBytes, readOps, writeOps };
  }

  private calculateProcessMetrics(stats: any): ResourceMetrics['processes'] {
    // This would need to be enhanced with actual process counting
    return {
      running: stats.pids_stats?.current || 0,
      sleeping: 0,
      stopped: 0,
      zombie: 0,
    };
  }

  private checkThresholds(containerId: string, metrics: ResourceMetrics): void {
    const limits = this.limits.get(containerId);
    const alerts = this.alerts.get(containerId) || [];

    // Check CPU threshold
    if (metrics.cpu.usage > this.defaultThresholds.cpu.critical) {
      this.createAlert(
        containerId,
        'cpu',
        'critical',
        this.defaultThresholds.cpu.critical,
        metrics.cpu.usage,
        `Critical CPU usage: ${metrics.cpu.usage.toFixed(1)}%`
      );
    } else if (metrics.cpu.usage > this.defaultThresholds.cpu.warning) {
      this.createAlert(
        containerId,
        'cpu',
        'warning',
        this.defaultThresholds.cpu.warning,
        metrics.cpu.usage,
        `High CPU usage: ${metrics.cpu.usage.toFixed(1)}%`
      );
    }

    // Check Memory threshold
    if (metrics.memory.percentage > this.defaultThresholds.memory.critical) {
      this.createAlert(
        containerId,
        'memory',
        'critical',
        this.defaultThresholds.memory.critical,
        metrics.memory.percentage,
        `Critical memory usage: ${metrics.memory.percentage.toFixed(1)}%`
      );
    } else if (
      metrics.memory.percentage > this.defaultThresholds.memory.warning
    ) {
      this.createAlert(
        containerId,
        'memory',
        'warning',
        this.defaultThresholds.memory.warning,
        metrics.memory.percentage,
        `High memory usage: ${metrics.memory.percentage.toFixed(1)}%`
      );
    }

    // Check process count if limits are set
    if (limits && metrics.processes.running > limits.processes.max * 0.9) {
      this.createAlert(
        containerId,
        'processes',
        'warning',
        limits.processes.max,
        metrics.processes.running,
        `High process count: ${metrics.processes.running}`
      );
    }
  }

  private createAlert(
    containerId: string,
    type: ResourceAlert['type'],
    severity: ResourceAlert['severity'],
    threshold: number,
    currentValue: number,
    message: string
  ): void {
    const alerts = this.alerts.get(containerId) || [];

    // Check for recent similar alerts (cooldown)
    const recentAlert = alerts.find(
      a =>
        a.type === type &&
        a.severity === severity &&
        Date.now() - a.timestamp.getTime() < this.config.alertCooldown
    );

    if (recentAlert) return;

    const alert: ResourceAlert = {
      id: uuidv4(),
      containerId,
      type,
      severity,
      threshold,
      currentValue,
      message,
      timestamp: new Date(),
      acknowledged: false,
    };

    alerts.push(alert);
    this.alerts.set(containerId, alerts);

    this.emit('alertCreated', alert);
    structuredLogger.warn('Resource alert created', {
      containerId,
      type,
      severity,
      message,
    });
  }

  private calculateTrend(values: number[]): {
    predicted: number;
    slope: number;
    confidence: number;
  } {
    if (values.length < 2) {
      return { predicted: values[0] || 0, slope: 0, confidence: 0 };
    }

    // Simple linear regression
    const n = values.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const meanX = x.reduce((a, b) => a + b) / n;
    const meanY = values.reduce((a, b) => a + b) / n;

    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < n; i++) {
      numerator += (x[i] - meanX) * (values[i] - meanY);
      denominator += (x[i] - meanX) ** 2;
    }

    const slope = denominator === 0 ? 0 : numerator / denominator;
    const intercept = meanY - slope * meanX;
    const predicted = intercept + slope * (n - 1);

    // Calculate R-squared for confidence
    let totalSumSquares = 0;
    let residualSumSquares = 0;

    for (let i = 0; i < n; i++) {
      const predicted = intercept + slope * i;
      totalSumSquares += (values[i] - meanY) ** 2;
      residualSumSquares += (values[i] - predicted) ** 2;
    }

    const rSquared =
      totalSumSquares === 0 ? 0 : 1 - residualSumSquares / totalSumSquares;
    const confidence = Math.max(0, Math.min(1, rSquared));

    return { predicted, slope, confidence };
  }

  private startCleanupTask(): void {
    setInterval(() => {
      const cutoff = new Date(Date.now() - this.config.metricsRetention);

      for (const [containerId, metrics] of this.metrics.entries()) {
        const filtered = metrics.filter(m => m.timestamp >= cutoff);
        this.metrics.set(containerId, filtered);
      }

      for (const [containerId, alerts] of this.alerts.entries()) {
        const filtered = alerts.filter(a => a.timestamp >= cutoff);
        this.alerts.set(containerId, filtered);
      }
    }, 300000); // Clean up every 5 minutes
  }

  /**
   * Close the resource monitor
   */
  close(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    this.removeAllListeners();
    structuredLogger.info('Resource monitor closed');
  }
}

// Export singleton instance
export const resourceMonitor = new ResourceMonitor();
