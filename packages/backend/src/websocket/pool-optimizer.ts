import { EventEmitter } from 'events';
import {
  getConnectionPool,
  ConnectionMetadata,
  ConnectionQuality,
  PoolStatistics,
} from './connection-pool.js';
import { structuredLogger } from '../middleware/logging.js';

export interface OptimizationConfig {
  enableAutomaticScaling: boolean;
  enableConnectionUpgrading: boolean;
  enableLoadBalancing: boolean;
  targetPoolEfficiency: number;
  maxLatencyThreshold: number;
  minLatencyThreshold: number;
  connectionUpgradeThreshold: number;
  connectionDowngradeThreshold: number;
  scalingCooldownPeriod: number;
  optimizationInterval: number;
  enablePreemptiveCleanup: boolean;
  qualityCheckInterval: number;
}

export interface OptimizationMetrics {
  totalOptimizations: number;
  connectionsUpgraded: number;
  connectionsDowngraded: number;
  connectionsCleaned: number;
  poolEfficiencyHistory: number[];
  latencyHistory: number[];
  lastOptimization: Date;
  optimizationEffectiveness: number;
  recommendations: OptimizationRecommendation[];
}

export interface OptimizationRecommendation {
  type: 'capacity' | 'performance' | 'cleanup' | 'configuration';
  priority: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  action?: string;
  estimatedImpact?: string;
  implementable?: boolean;
}

export interface ConnectionGroupMetrics {
  userId?: string;
  ipAddress?: string;
  connectionCount: number;
  averageLatency: number;
  averageQuality: number;
  totalDataTransferred: number;
  averageMessageCount: number;
  riskScore: number;
}

export class PoolOptimizer extends EventEmitter {
  private config: OptimizationConfig;
  private metrics: OptimizationMetrics;
  private optimizationTimer?: NodeJS.Timeout;
  private qualityCheckTimer?: NodeJS.Timeout;
  private lastScalingOperation = 0;
  private isOptimizing = false;

  constructor(config: Partial<OptimizationConfig> = {}) {
    super();

    this.config = {
      enableAutomaticScaling: true,
      enableConnectionUpgrading: true,
      enableLoadBalancing: true,
      targetPoolEfficiency: 0.75,
      maxLatencyThreshold: 200,
      minLatencyThreshold: 50,
      connectionUpgradeThreshold: 50,
      connectionDowngradeThreshold: 500,
      scalingCooldownPeriod: 60000, // 1 minute
      optimizationInterval: 30000, // 30 seconds
      enablePreemptiveCleanup: true,
      qualityCheckInterval: 15000, // 15 seconds
      ...config,
    };

    this.metrics = this.initializeMetrics();
    this.startOptimization();
  }

  /**
   * Start the optimization process
   */
  startOptimization(): void {
    if (this.optimizationTimer) {
      return;
    }

    this.optimizationTimer = setInterval(() => {
      this.performOptimization();
    }, this.config.optimizationInterval);

    this.qualityCheckTimer = setInterval(() => {
      this.performQualityCheck();
    }, this.config.qualityCheckInterval);

    structuredLogger.info('Pool optimizer started', {
      optimizationInterval: this.config.optimizationInterval,
      qualityCheckInterval: this.config.qualityCheckInterval,
    });
  }

  /**
   * Stop the optimization process
   */
  stopOptimization(): void {
    if (this.optimizationTimer) {
      clearInterval(this.optimizationTimer);
      this.optimizationTimer = undefined;
    }

    if (this.qualityCheckTimer) {
      clearInterval(this.qualityCheckTimer);
      this.qualityCheckTimer = undefined;
    }

    structuredLogger.info('Pool optimizer stopped');
  }

  /**
   * Perform a manual optimization cycle
   */
  async performOptimization(): Promise<void> {
    if (this.isOptimizing) {
      return;
    }

    this.isOptimizing = true;
    const startTime = Date.now();

    try {
      const connectionPool = getConnectionPool();
      const poolStats = connectionPool.getStatistics();

      // Record metrics
      this.recordPoolMetrics(poolStats);

      // Generate recommendations
      const recommendations = this.generateRecommendations(poolStats);
      this.metrics.recommendations = recommendations;

      // Execute automatic optimizations
      const optimizationResults = await this.executeOptimizations(
        poolStats,
        recommendations
      );

      // Update metrics
      this.updateOptimizationMetrics(optimizationResults);
      this.metrics.lastOptimization = new Date();
      this.metrics.totalOptimizations++;

      const duration = Date.now() - startTime;
      structuredLogger.info('Pool optimization completed', {
        duration,
        recommendations: recommendations.length,
        optimizations: optimizationResults.length,
      });

      this.emit('optimizationCompleted', {
        metrics: this.metrics,
        recommendations,
        optimizations: optimizationResults,
        duration,
      });
    } catch (error) {
      structuredLogger.error('Pool optimization failed', error as Error);
      this.emit('optimizationFailed', { error });
    } finally {
      this.isOptimizing = false;
    }
  }

  /**
   * Perform connection quality checks
   */
  performQualityCheck(): void {
    try {
      const connectionPool = getConnectionPool();
      const poolStats = connectionPool.getStatistics();

      // Check for degraded connections
      const degradedConnections = this.identifyDegradedConnections();

      if (degradedConnections.length > 0) {
        this.handleDegradedConnections(degradedConnections);
      }

      // Check for optimization opportunities
      const connectionGroups = this.analyzeConnectionGroups();
      this.checkConnectionGroupRisks(connectionGroups);
    } catch (error) {
      structuredLogger.error('Quality check failed', error as Error);
    }
  }

  /**
   * Get current optimization metrics
   */
  getMetrics(): OptimizationMetrics {
    return { ...this.metrics };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<OptimizationConfig>): void {
    this.config = { ...this.config, ...newConfig };

    // Restart timers if intervals changed
    if (newConfig.optimizationInterval || newConfig.qualityCheckInterval) {
      this.stopOptimization();
      this.startOptimization();
    }

    this.emit('configUpdated', this.config);
  }

  /**
   * Force connection upgrade for specific connections
   */
  upgradeConnections(socketIds: string[]): number {
    const connectionPool = getConnectionPool();
    let upgradedCount = 0;

    for (const socketId of socketIds) {
      const connection = connectionPool.getConnection(socketId);
      if (connection && this.canUpgradeConnection(connection)) {
        if (this.upgradeConnection(socketId)) {
          upgradedCount++;
        }
      }
    }

    this.metrics.connectionsUpgraded += upgradedCount;
    return upgradedCount;
  }

  /**
   * Force cleanup of idle or problematic connections
   */
  cleanupConnections(criteria: {
    maxIdleTime?: number;
    maxLatency?: number;
    minQuality?: ConnectionQuality;
  }): number {
    const connectionPool = getConnectionPool();
    const connectionsToRemove: string[] = [];

    // Identify connections to remove based on criteria
    const allConnections = this.getAllConnections();

    for (const connection of allConnections) {
      if (this.shouldCleanupConnection(connection, criteria)) {
        connectionsToRemove.push(connection.socketId);
      }
    }

    // Remove connections
    let cleanedCount = 0;
    for (const socketId of connectionsToRemove) {
      if (connectionPool.removeConnection(socketId, 'optimizer_cleanup')) {
        cleanedCount++;
      }
    }

    this.metrics.connectionsCleaned += cleanedCount;
    return cleanedCount;
  }

  // Private methods

  private recordPoolMetrics(poolStats: PoolStatistics): void {
    this.metrics.poolEfficiencyHistory.push(poolStats.poolEfficiency);
    this.metrics.latencyHistory.push(poolStats.averagePingLatency);

    // Keep only recent history (last 100 measurements)
    if (this.metrics.poolEfficiencyHistory.length > 100) {
      this.metrics.poolEfficiencyHistory.shift();
    }
    if (this.metrics.latencyHistory.length > 100) {
      this.metrics.latencyHistory.shift();
    }
  }

  private generateRecommendations(
    poolStats: PoolStatistics
  ): OptimizationRecommendation[] {
    const recommendations: OptimizationRecommendation[] = [];

    // Pool efficiency recommendations
    if (poolStats.poolEfficiency > 0.9) {
      recommendations.push({
        type: 'capacity',
        priority: 'high',
        message:
          'Pool efficiency is very high (>90%). Consider increasing max connections.',
        action: 'increase_capacity',
        estimatedImpact:
          'Prevents connection rejections and improves user experience',
        implementable: true,
      });
    } else if (poolStats.poolEfficiency < 0.3) {
      recommendations.push({
        type: 'capacity',
        priority: 'medium',
        message:
          'Pool efficiency is low (<30%). Consider reducing max connections to save resources.',
        action: 'decrease_capacity',
        estimatedImpact:
          'Reduces memory usage and improves resource efficiency',
        implementable: true,
      });
    }

    // Latency recommendations
    if (poolStats.averagePingLatency > this.config.maxLatencyThreshold) {
      recommendations.push({
        type: 'performance',
        priority: 'high',
        message: `Average latency is high (${Math.round(poolStats.averagePingLatency)}ms). Check network conditions.`,
        action: 'optimize_network',
        estimatedImpact: 'Improves responsiveness and user experience',
        implementable: false,
      });
    }

    // Connection quality recommendations
    const qualityDistribution = poolStats.connectionsByQuality;
    const totalConnections = poolStats.totalConnections;

    if (
      qualityDistribution.poor &&
      qualityDistribution.poor / totalConnections > 0.2
    ) {
      recommendations.push({
        type: 'cleanup',
        priority: 'medium',
        message:
          'High percentage of poor quality connections (>20%). Consider cleanup.',
        action: 'cleanup_poor_connections',
        estimatedImpact: 'Improves overall pool performance',
        implementable: true,
      });
    }

    // Connection distribution recommendations
    this.analyzeConnectionDistribution(poolStats, recommendations);

    return recommendations;
  }

  private analyzeConnectionDistribution(
    poolStats: PoolStatistics,
    recommendations: OptimizationRecommendation[]
  ): void {
    // Check for IP concentration
    const ipConnections = Object.values(poolStats.connectionsPerIP);
    const maxConnectionsPerIP = Math.max(...ipConnections);

    if (maxConnectionsPerIP > 20) {
      recommendations.push({
        type: 'configuration',
        priority: 'medium',
        message: `High connection concentration from single IP (${maxConnectionsPerIP} connections).`,
        action: 'review_ip_limits',
        estimatedImpact: 'Prevents potential abuse and improves fairness',
        implementable: true,
      });
    }

    // Check for user concentration
    const userConnections = Object.values(poolStats.connectionsPerUser);
    const maxConnectionsPerUser = Math.max(...userConnections);

    if (maxConnectionsPerUser > 10) {
      recommendations.push({
        type: 'configuration',
        priority: 'low',
        message: `High connection count for single user (${maxConnectionsPerUser} connections).`,
        action: 'review_user_limits',
        estimatedImpact: 'Ensures fair resource distribution',
        implementable: true,
      });
    }
  }

  private async executeOptimizations(
    poolStats: PoolStatistics,
    recommendations: OptimizationRecommendation[]
  ): Promise<string[]> {
    const executedOptimizations: string[] = [];

    for (const recommendation of recommendations) {
      if (!recommendation.implementable || !recommendation.action) {
        continue;
      }

      try {
        switch (recommendation.action) {
          case 'cleanup_poor_connections':
            const cleanedCount = this.cleanupConnections({
              minQuality: ConnectionQuality.FAIR,
            });
            if (cleanedCount > 0) {
              executedOptimizations.push(
                `Cleaned up ${cleanedCount} poor quality connections`
              );
            }
            break;

          case 'optimize_network':
            if (this.config.enableConnectionUpgrading) {
              const upgradedCount = this.optimizeConnectionTransports();
              if (upgradedCount > 0) {
                executedOptimizations.push(
                  `Optimized ${upgradedCount} connection transports`
                );
              }
            }
            break;

          case 'increase_capacity':
            // This would require configuration changes at runtime
            executedOptimizations.push(
              'Recommended capacity increase (manual action required)'
            );
            break;

          case 'decrease_capacity':
            // This would require configuration changes at runtime
            executedOptimizations.push(
              'Recommended capacity decrease (manual action required)'
            );
            break;
        }
      } catch (error) {
        structuredLogger.error(
          'Optimization execution failed',
          error as Error,
          {
            action: recommendation.action,
          }
        );
      }
    }

    return executedOptimizations;
  }

  private identifyDegradedConnections(): string[] {
    const connectionPool = getConnectionPool();
    const degradedConnections: string[] = [];

    const allConnections = this.getAllConnections();

    for (const connection of allConnections) {
      if (this.isConnectionDegraded(connection)) {
        degradedConnections.push(connection.socketId);
      }
    }

    return degradedConnections;
  }

  private isConnectionDegraded(connection: ConnectionMetadata): boolean {
    return (
      connection.connectionQuality === ConnectionQuality.DEGRADED ||
      connection.connectionQuality === ConnectionQuality.POOR ||
      connection.pingLatency > this.config.connectionDowngradeThreshold ||
      Date.now() - connection.lastActivity.getTime() > 300000 // 5 minutes idle
    );
  }

  private handleDegradedConnections(degradedConnections: string[]): void {
    const connectionPool = getConnectionPool();
    let handledCount = 0;

    for (const socketId of degradedConnections) {
      const connection = connectionPool.getConnection(socketId);
      if (!connection) continue;

      // Try to upgrade connection first
      if (this.canUpgradeConnection(connection)) {
        if (this.upgradeConnection(socketId)) {
          handledCount++;
          continue;
        }
      }

      // If upgrade fails and connection is very poor, consider removal
      if (connection.connectionQuality === ConnectionQuality.DEGRADED) {
        if (connectionPool.removeConnection(socketId, 'quality_degraded')) {
          handledCount++;
          this.metrics.connectionsCleaned++;
        }
      }
    }

    if (handledCount > 0) {
      structuredLogger.info('Handled degraded connections', {
        degradedCount: degradedConnections.length,
        handledCount,
      });
    }
  }

  private analyzeConnectionGroups(): ConnectionGroupMetrics[] {
    const connectionPool = getConnectionPool();
    const poolStats = connectionPool.getStatistics();
    const groups: ConnectionGroupMetrics[] = [];

    // Analyze by user
    for (const [userId, connectionCount] of Object.entries(
      poolStats.connectionsPerUser
    )) {
      const userConnections = connectionPool.getUserConnections(userId);
      const metrics = this.calculateGroupMetrics(userConnections);

      groups.push({
        userId,
        connectionCount,
        ...metrics,
      });
    }

    // Analyze by IP
    for (const [ipAddress, connectionCount] of Object.entries(
      poolStats.connectionsPerIP
    )) {
      const ipConnections = this.getConnectionsByIP(ipAddress);
      const metrics = this.calculateGroupMetrics(ipConnections);

      groups.push({
        ipAddress,
        connectionCount,
        ...metrics,
      });
    }

    return groups;
  }

  private calculateGroupMetrics(
    connections: ConnectionMetadata[]
  ): Omit<ConnectionGroupMetrics, 'userId' | 'ipAddress' | 'connectionCount'> {
    if (connections.length === 0) {
      return {
        averageLatency: 0,
        averageQuality: 0,
        totalDataTransferred: 0,
        averageMessageCount: 0,
        riskScore: 0,
      };
    }

    const totalLatency = connections.reduce(
      (sum, conn) => sum + conn.pingLatency,
      0
    );
    const totalDataTransferred = connections.reduce(
      (sum, conn) => sum + conn.dataTransferred,
      0
    );
    const totalMessageCount = connections.reduce(
      (sum, conn) => sum + conn.messageCount,
      0
    );

    const qualitySum = connections.reduce((sum, conn) => {
      switch (conn.connectionQuality) {
        case ConnectionQuality.EXCELLENT:
          return sum + 5;
        case ConnectionQuality.GOOD:
          return sum + 4;
        case ConnectionQuality.FAIR:
          return sum + 3;
        case ConnectionQuality.POOR:
          return sum + 2;
        case ConnectionQuality.DEGRADED:
          return sum + 1;
        default:
          return sum + 0;
      }
    }, 0);

    const averageLatency = totalLatency / connections.length;
    const averageQuality = qualitySum / connections.length;
    const averageMessageCount = totalMessageCount / connections.length;

    // Calculate risk score (0-100, higher is more risky)
    let riskScore = 0;
    riskScore += Math.min(30, (connections.length - 1) * 3); // Connection count risk
    riskScore += Math.min(30, Math.max(0, (averageLatency - 100) / 10)); // Latency risk
    riskScore += Math.min(20, (5 - averageQuality) * 4); // Quality risk
    riskScore += Math.min(20, Math.max(0, (averageMessageCount - 100) / 10)); // Message rate risk

    return {
      averageLatency,
      averageQuality,
      totalDataTransferred,
      averageMessageCount,
      riskScore: Math.min(100, riskScore),
    };
  }

  private checkConnectionGroupRisks(groups: ConnectionGroupMetrics[]): void {
    for (const group of groups) {
      if (group.riskScore > 70) {
        structuredLogger.warn('High risk connection group detected', {
          userId: group.userId,
          ipAddress: group.ipAddress,
          connectionCount: group.connectionCount,
          riskScore: group.riskScore,
        });

        this.emit('highRiskGroupDetected', group);
      }
    }
  }

  private canUpgradeConnection(connection: ConnectionMetadata): boolean {
    return (
      this.config.enableConnectionUpgrading &&
      connection.pingLatency < this.config.connectionUpgradeThreshold &&
      connection.connectionQuality >= ConnectionQuality.FAIR
    );
  }

  private upgradeConnection(socketId: string): boolean {
    // This would implement actual connection upgrade logic
    // For now, just log the attempt
    structuredLogger.info('Connection upgrade attempted', { socketId });
    this.metrics.connectionsUpgraded++;
    return true;
  }

  private optimizeConnectionTransports(): number {
    // This would implement transport optimization logic
    // For now, just return a mock count
    return 0;
  }

  private shouldCleanupConnection(
    connection: ConnectionMetadata,
    criteria: {
      maxIdleTime?: number;
      maxLatency?: number;
      minQuality?: ConnectionQuality;
    }
  ): boolean {
    const now = Date.now();
    const idleTime = now - connection.lastActivity.getTime();

    if (criteria.maxIdleTime && idleTime > criteria.maxIdleTime) {
      return true;
    }

    if (criteria.maxLatency && connection.pingLatency > criteria.maxLatency) {
      return true;
    }

    if (criteria.minQuality) {
      const qualityValues = {
        [ConnectionQuality.EXCELLENT]: 5,
        [ConnectionQuality.GOOD]: 4,
        [ConnectionQuality.FAIR]: 3,
        [ConnectionQuality.POOR]: 2,
        [ConnectionQuality.DEGRADED]: 1,
      };

      if (
        qualityValues[connection.connectionQuality] <
        qualityValues[criteria.minQuality]
      ) {
        return true;
      }
    }

    return false;
  }

  private getAllConnections(): ConnectionMetadata[] {
    // This would get all connections from the pool
    // For now, return empty array as placeholder
    return [];
  }

  private getConnectionsByIP(ipAddress: string): ConnectionMetadata[] {
    // This would get connections by IP from the pool
    // For now, return empty array as placeholder
    return [];
  }

  private updateOptimizationMetrics(optimizations: string[]): void {
    // Calculate effectiveness based on recent metrics
    const recentEfficiency = this.metrics.poolEfficiencyHistory.slice(-10);
    const recentLatency = this.metrics.latencyHistory.slice(-10);

    if (recentEfficiency.length >= 2 && recentLatency.length >= 2) {
      const efficiencyImprovement =
        recentEfficiency[recentEfficiency.length - 1] - recentEfficiency[0];
      const latencyImprovement =
        recentLatency[0] - recentLatency[recentLatency.length - 1];

      this.metrics.optimizationEffectiveness =
        (efficiencyImprovement + latencyImprovement / 100) * 50;
    }
  }

  private initializeMetrics(): OptimizationMetrics {
    return {
      totalOptimizations: 0,
      connectionsUpgraded: 0,
      connectionsDowngraded: 0,
      connectionsCleaned: 0,
      poolEfficiencyHistory: [],
      latencyHistory: [],
      lastOptimization: new Date(),
      optimizationEffectiveness: 0,
      recommendations: [],
    };
  }
}

// Singleton factory
let poolOptimizerInstance: PoolOptimizer | null = null;

export function createPoolOptimizer(
  config?: Partial<OptimizationConfig>
): PoolOptimizer {
  if (poolOptimizerInstance) {
    return poolOptimizerInstance;
  }

  poolOptimizerInstance = new PoolOptimizer(config);
  return poolOptimizerInstance;
}

export function getPoolOptimizer(): PoolOptimizer {
  if (!poolOptimizerInstance) {
    throw new Error(
      'Pool optimizer not initialized. Call createPoolOptimizer first.'
    );
  }
  return poolOptimizerInstance;
}

export function resetPoolOptimizer(): void {
  if (poolOptimizerInstance) {
    poolOptimizerInstance.stopOptimization();
  }
  poolOptimizerInstance = null;
}
