import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';
import * as os from 'os';
import { structuredLogger } from '../middleware/logging.js';

export interface PerformanceMetric {
  id: string;
  name: string;
  value: number;
  unit: string;
  timestamp: Date;
  tags: Record<string, string>;
  metadata?: Record<string, any>;
}

export interface SystemMetrics {
  cpu: {
    usage: number;
    loadAverage: number[];
    cores: number;
  };
  memory: {
    total: number;
    used: number;
    free: number;
    percentage: number;
  };
  network: {
    bytesIn: number;
    bytesOut: number;
    packetsIn: number;
    packetsOut: number;
  };
  disk: {
    totalSpace: number;
    freeSpace: number;
    usedSpace: number;
    percentage: number;
  };
  uptime: number;
  timestamp: Date;
}

export interface ApplicationMetrics {
  requests: {
    total: number;
    perSecond: number;
    averageResponseTime: number;
    errorRate: number;
  };
  processes: {
    active: number;
    total: number;
    averageMemory: number;
    averageCPU: number;
  };
  cache: {
    hitRatio: number;
    avgResponseTime: number;
    totalOperations: number;
    errorRate: number;
  };
  database: {
    connections: number;
    queriesPerSecond: number;
    averageQueryTime: number;
    slowQueries: number;
  };
  websockets: {
    activeConnections: number;
    messagesPerSecond: number;
    averageLatency: number;
    disconnectionRate: number;
  };
  adapters: {
    [adapterName: string]: {
      sessions: number;
      commands: number;
      averageExecutionTime: number;
      errorRate: number;
    };
  };
}

export interface PerformanceAlert {
  id: string;
  level: 'info' | 'warning' | 'error' | 'critical';
  metric: string;
  threshold: number;
  currentValue: number;
  message: string;
  timestamp: Date;
  acknowledged: boolean;
}

export class PerformanceMonitor extends EventEmitter {
  private metrics = new Map<string, PerformanceMetric[]>();
  private alerts = new Map<string, PerformanceAlert>();
  private thresholds = new Map<string, { warning: number; critical: number }>();
  private collectors = new Map<string, () => Promise<any>>();
  private timers = new Map<string, NodeJS.Timeout>();

  private config = {
    collectionInterval: 30000, // 30 seconds
    retentionPeriod: 86400000, // 24 hours
    maxMetricsPerType: 2880, // 24 hours at 30-second intervals
    alertCooldown: 300000, // 5 minutes
    enableSystemMetrics: true,
    enableApplicationMetrics: true,
    enableCustomMetrics: true,
  };

  private lastCpuInfo: os.CpuInfo[] = [];
  private lastNetworkStats: any = {};
  private requestStats = {
    total: 0,
    errors: 0,
    responseTimes: [] as number[],
    lastReset: Date.now(),
  };

  constructor(
    config: Partial<typeof PerformanceMonitor.prototype.config> = {}
  ) {
    super();

    Object.assign(this.config, config);

    this.setupDefaultThresholds();
    this.setupDefaultCollectors();
    this.startCollection();

    structuredLogger.info('Performance monitor initialized', {
      collectionInterval: this.config.collectionInterval,
      retentionPeriod: this.config.retentionPeriod,
    });
  }

  /**
   * Record a custom performance metric
   */
  recordMetric(
    name: string,
    value: number,
    unit: string = 'count',
    tags: Record<string, string> = {},
    metadata?: Record<string, any>
  ): void {
    const metric: PerformanceMetric = {
      id: `${name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      value,
      unit,
      timestamp: new Date(),
      tags,
      metadata,
    };

    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }

    const metricArray = this.metrics.get(name)!;
    metricArray.push(metric);

    // Trim old metrics
    if (metricArray.length > this.config.maxMetricsPerType) {
      metricArray.splice(0, metricArray.length - this.config.maxMetricsPerType);
    }

    // Check thresholds
    this.checkThresholds(name, value);

    this.emit('metric', metric);
  }

  /**
   * Start a performance timer
   */
  startTimer(name: string, tags: Record<string, string> = {}): () => void {
    const startTime = performance.now();

    return () => {
      const duration = performance.now() - startTime;
      this.recordMetric(`${name}.duration`, duration, 'ms', tags);
    };
  }

  /**
   * Record HTTP request metrics
   */
  recordRequest(responseTime: number, statusCode: number, path: string): void {
    this.requestStats.total++;
    this.requestStats.responseTimes.push(responseTime);

    if (statusCode >= 400) {
      this.requestStats.errors++;
    }

    // Trim response times array to last 1000 requests
    if (this.requestStats.responseTimes.length > 1000) {
      this.requestStats.responseTimes.shift();
    }

    this.recordMetric('http.request.count', 1, 'count', {
      status_code: statusCode.toString(),
      path: this.sanitizePath(path),
    });

    this.recordMetric('http.request.duration', responseTime, 'ms', {
      status_code: statusCode.toString(),
      path: this.sanitizePath(path),
    });
  }

  /**
   * Get system metrics
   */
  async getSystemMetrics(): Promise<SystemMetrics> {
    const cpuInfo = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    // Calculate CPU usage
    let cpuUsage = 0;
    if (this.lastCpuInfo.length > 0) {
      cpuUsage = this.calculateCpuUsage(this.lastCpuInfo, cpuInfo);
    }
    this.lastCpuInfo = cpuInfo;

    return {
      cpu: {
        usage: cpuUsage,
        loadAverage: os.loadavg(),
        cores: cpuInfo.length,
      },
      memory: {
        total: totalMem,
        used: usedMem,
        free: freeMem,
        percentage: (usedMem / totalMem) * 100,
      },
      network: {
        bytesIn: 0, // Would need platform-specific implementation
        bytesOut: 0,
        packetsIn: 0,
        packetsOut: 0,
      },
      disk: {
        totalSpace: 0, // Would need fs.statSync implementation
        freeSpace: 0,
        usedSpace: 0,
        percentage: 0,
      },
      uptime: os.uptime(),
      timestamp: new Date(),
    };
  }

  /**
   * Get application metrics
   */
  async getApplicationMetrics(): Promise<ApplicationMetrics> {
    const now = Date.now();
    const timeSinceReset = (now - this.requestStats.lastReset) / 1000;

    const requestsPerSecond =
      timeSinceReset > 0 ? this.requestStats.total / timeSinceReset : 0;

    const avgResponseTime =
      this.requestStats.responseTimes.length > 0
        ? this.requestStats.responseTimes.reduce((a, b) => a + b, 0) /
          this.requestStats.responseTimes.length
        : 0;

    const errorRate =
      this.requestStats.total > 0
        ? this.requestStats.errors / this.requestStats.total
        : 0;

    return {
      requests: {
        total: this.requestStats.total,
        perSecond: requestsPerSecond,
        averageResponseTime: avgResponseTime,
        errorRate,
      },
      processes: {
        active: 0, // Would integrate with process manager
        total: 0,
        averageMemory: 0,
        averageCPU: 0,
      },
      cache: {
        hitRatio: 0, // Would integrate with cache manager
        avgResponseTime: 0,
        totalOperations: 0,
        errorRate: 0,
      },
      database: {
        connections: 0, // Would integrate with database manager
        queriesPerSecond: 0,
        averageQueryTime: 0,
        slowQueries: 0,
      },
      websockets: {
        activeConnections: 0, // Would integrate with WebSocket manager
        messagesPerSecond: 0,
        averageLatency: 0,
        disconnectionRate: 0,
      },
      adapters: {}, // Would integrate with adapter registry
    };
  }

  /**
   * Get performance metrics summary
   */
  getMetricsSummary(
    metricName?: string,
    timeRange?: { start: Date; end: Date }
  ): {
    metrics: PerformanceMetric[];
    summary: {
      count: number;
      average: number;
      min: number;
      max: number;
      percentiles: { p50: number; p95: number; p99: number };
    };
  } {
    let allMetrics: PerformanceMetric[] = [];

    if (metricName) {
      allMetrics = this.metrics.get(metricName) || [];
    } else {
      for (const metricArray of this.metrics.values()) {
        allMetrics.push(...metricArray);
      }
    }

    // Filter by time range
    if (timeRange) {
      allMetrics = allMetrics.filter(
        m => m.timestamp >= timeRange.start && m.timestamp <= timeRange.end
      );
    }

    const values = allMetrics.map(m => m.value).sort((a, b) => a - b);
    const count = values.length;

    if (count === 0) {
      return {
        metrics: allMetrics,
        summary: {
          count: 0,
          average: 0,
          min: 0,
          max: 0,
          percentiles: { p50: 0, p95: 0, p99: 0 },
        },
      };
    }

    const sum = values.reduce((a, b) => a + b, 0);
    const average = sum / count;
    const min = values[0];
    const max = values[count - 1];

    const percentiles = {
      p50: this.calculatePercentile(values, 50),
      p95: this.calculatePercentile(values, 95),
      p99: this.calculatePercentile(values, 99),
    };

    return {
      metrics: allMetrics,
      summary: {
        count,
        average,
        min,
        max,
        percentiles,
      },
    };
  }

  /**
   * Get active alerts
   */
  getAlerts(level?: PerformanceAlert['level']): PerformanceAlert[] {
    const alerts = Array.from(this.alerts.values());

    if (level) {
      return alerts.filter(alert => alert.level === level);
    }

    return alerts;
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.acknowledged = true;
      this.emit('alertAcknowledged', alert);
      return true;
    }
    return false;
  }

  /**
   * Set custom threshold for a metric
   */
  setThreshold(metricName: string, warning: number, critical: number): void {
    this.thresholds.set(metricName, { warning, critical });
    structuredLogger.info('Threshold set', { metricName, warning, critical });
  }

  /**
   * Register a custom metric collector
   */
  registerCollector(
    name: string,
    collector: () => Promise<any>,
    interval?: number
  ): void {
    this.collectors.set(name, collector);

    if (interval) {
      const timer = setInterval(async () => {
        try {
          await collector();
        } catch (error) {
          structuredLogger.error('Collector error', error as Error, {
            collector: name,
          });
        }
      }, interval);

      this.timers.set(name, timer);
    }

    structuredLogger.info('Metric collector registered', {
      name,
      hasInterval: !!interval,
    });
  }

  /**
   * Export metrics data
   */
  exportMetrics(format: 'json' | 'csv' | 'prometheus' = 'json'): string {
    const allMetrics: PerformanceMetric[] = [];

    for (const metricArray of this.metrics.values()) {
      allMetrics.push(...metricArray);
    }

    switch (format) {
      case 'csv':
        return this.exportAsCSV(allMetrics);
      case 'prometheus':
        return this.exportAsPrometheus(allMetrics);
      default:
        return JSON.stringify(
          {
            timestamp: new Date().toISOString(),
            totalMetrics: allMetrics.length,
            metrics: allMetrics,
            alerts: Array.from(this.alerts.values()),
          },
          null,
          2
        );
    }
  }

  /**
   * Clean up old metrics and alerts
   */
  cleanup(): void {
    const cutoff = new Date(Date.now() - this.config.retentionPeriod);
    let cleaned = 0;

    for (const [name, metricArray] of this.metrics.entries()) {
      const originalLength = metricArray.length;
      const filtered = metricArray.filter(m => m.timestamp > cutoff);

      if (filtered.length !== originalLength) {
        this.metrics.set(name, filtered);
        cleaned += originalLength - filtered.length;
      }
    }

    // Clean up acknowledged alerts older than 1 hour
    const alertCutoff = new Date(Date.now() - 3600000);
    for (const [id, alert] of this.alerts.entries()) {
      if (alert.acknowledged && alert.timestamp < alertCutoff) {
        this.alerts.delete(id);
      }
    }

    if (cleaned > 0) {
      structuredLogger.info('Metrics cleanup completed', { cleaned });
    }
  }

  /**
   * Close the performance monitor
   */
  close(): void {
    for (const timer of this.timers.values()) {
      clearInterval(timer);
    }

    this.timers.clear();
    this.removeAllListeners();

    structuredLogger.info('Performance monitor closed');
  }

  // Private methods

  private setupDefaultThresholds(): void {
    this.setThreshold('cpu.usage', 70, 90);
    this.setThreshold('memory.percentage', 80, 95);
    this.setThreshold('http.request.duration', 1000, 5000);
    this.setThreshold('http.request.error_rate', 0.05, 0.1);
    this.setThreshold('cache.hit_ratio', 0.5, 0.3);
    this.setThreshold('database.query_time', 500, 2000);
  }

  private setupDefaultCollectors(): void {
    if (this.config.enableSystemMetrics) {
      this.registerCollector(
        'system-metrics',
        async () => {
          const metrics = await this.getSystemMetrics();

          this.recordMetric('cpu.usage', metrics.cpu.usage, 'percent');
          this.recordMetric(
            'memory.percentage',
            metrics.memory.percentage,
            'percent'
          );
          this.recordMetric('memory.used', metrics.memory.used, 'bytes');
          this.recordMetric(
            'load.average',
            metrics.cpu.loadAverage[0],
            'count'
          );
        },
        this.config.collectionInterval
      );
    }

    if (this.config.enableApplicationMetrics) {
      this.registerCollector(
        'app-metrics',
        async () => {
          const metrics = await this.getApplicationMetrics();

          this.recordMetric(
            'requests.per_second',
            metrics.requests.perSecond,
            'rps'
          );
          this.recordMetric(
            'requests.avg_response_time',
            metrics.requests.averageResponseTime,
            'ms'
          );
          this.recordMetric(
            'requests.error_rate',
            metrics.requests.errorRate,
            'percent'
          );
        },
        this.config.collectionInterval
      );
    }
  }

  private startCollection(): void {
    // Start cleanup interval
    setInterval(() => {
      this.cleanup();
    }, this.config.retentionPeriod / 24); // Clean up every hour

    structuredLogger.info('Performance collection started');
  }

  private checkThresholds(metricName: string, value: number): void {
    const threshold = this.thresholds.get(metricName);
    if (!threshold) return;

    let level: PerformanceAlert['level'] | null = null;
    let message = '';

    if (value >= threshold.critical) {
      level = 'critical';
      message = `${metricName} is critically high: ${value}`;
    } else if (value >= threshold.warning) {
      level = 'warning';
      message = `${metricName} is above warning threshold: ${value}`;
    }

    if (level) {
      const alertId = `${metricName}-${level}`;
      const existingAlert = this.alerts.get(alertId);

      // Only create new alert if none exists or if it's been acknowledged and enough time has passed
      if (
        !existingAlert ||
        (existingAlert.acknowledged &&
          Date.now() - existingAlert.timestamp.getTime() >
            this.config.alertCooldown)
      ) {
        const alert: PerformanceAlert = {
          id: alertId,
          level,
          metric: metricName,
          threshold:
            level === 'critical' ? threshold.critical : threshold.warning,
          currentValue: value,
          message,
          timestamp: new Date(),
          acknowledged: false,
        };

        this.alerts.set(alertId, alert);
        this.emit('alert', alert);

        structuredLogger.warn('Performance alert triggered', {
          alertId,
          level,
          metric: metricName,
          value,
          threshold: alert.threshold,
        });
      }
    }
  }

  private calculateCpuUsage(
    oldCpus: os.CpuInfo[],
    newCpus: os.CpuInfo[]
  ): number {
    if (oldCpus.length !== newCpus.length) return 0;

    let totalOldIdle = 0;
    let totalOldTick = 0;
    let totalNewIdle = 0;
    let totalNewTick = 0;

    for (let i = 0; i < oldCpus.length; i++) {
      const oldCpu = oldCpus[i];
      const newCpu = newCpus[i];

      for (const type in oldCpu.times) {
        totalOldTick += (oldCpu.times as any)[type];
        totalNewTick += (newCpu.times as any)[type];
      }

      totalOldIdle += oldCpu.times.idle;
      totalNewIdle += newCpu.times.idle;
    }

    const totalOldUsage = totalOldTick - totalOldIdle;
    const totalNewUsage = totalNewTick - totalNewIdle;
    const totalUsageDiff = totalNewUsage - totalOldUsage;
    const totalTickDiff = totalNewTick - totalOldTick;

    return totalTickDiff === 0 ? 0 : (totalUsageDiff / totalTickDiff) * 100;
  }

  private calculatePercentile(values: number[], percentile: number): number {
    const index = Math.ceil((percentile / 100) * values.length) - 1;
    return values[index] || 0;
  }

  private sanitizePath(path: string): string {
    // Replace dynamic path segments with placeholders
    return path
      .replace(/\/\d+/g, '/:id')
      .replace(/\/[a-f0-9-]{36}/g, '/:uuid')
      .replace(/\/[a-f0-9-]{24}/g, '/:objectid');
  }

  private exportAsCSV(metrics: PerformanceMetric[]): string {
    const headers = ['timestamp', 'name', 'value', 'unit', 'tags'];
    const rows = metrics.map(m => [
      m.timestamp.toISOString(),
      m.name,
      m.value.toString(),
      m.unit,
      JSON.stringify(m.tags),
    ]);

    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }

  private exportAsPrometheus(metrics: PerformanceMetric[]): string {
    const metricGroups = new Map<string, PerformanceMetric[]>();

    for (const metric of metrics) {
      if (!metricGroups.has(metric.name)) {
        metricGroups.set(metric.name, []);
      }
      metricGroups.get(metric.name)!.push(metric);
    }

    let output = '';

    for (const [name, metricArray] of metricGroups) {
      const latest = metricArray[metricArray.length - 1];
      const prometheusName = name.replace(/[^a-zA-Z0-9_]/g, '_');

      output += `# HELP ${prometheusName} ${latest.unit}\n`;
      output += `# TYPE ${prometheusName} gauge\n`;

      const tags = Object.entries(latest.tags)
        .map(([k, v]) => `${k}="${v}"`)
        .join(',');

      output += `${prometheusName}{${tags}} ${latest.value} ${latest.timestamp.getTime()}\n`;
    }

    return output;
  }
}

// Export singleton instance
export const performanceMonitor = new PerformanceMonitor();
