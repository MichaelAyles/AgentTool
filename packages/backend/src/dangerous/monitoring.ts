import { EventEmitter } from 'events';
import { SecurityLevel, SecurityEventType } from '../security/types.js';
import { securityEventLogger } from '../security/event-logger.js';
import {
  comprehensiveAuditLogger,
  AuditCategory,
} from '../security/audit-logger.js';
import {
  dangerousModeController,
  DangerousModeSession,
  DangerousModeState,
} from './controller.js';
import { SecurityWarningService, WarningType } from './warnings.js';

// Monitoring threshold configuration
export interface MonitoringThresholds {
  maxCommandsPerMinute: number;
  maxRiskScoreIncrease: number;
  maxSessionDuration: number; // milliseconds
  maxActivationsPerHour: number;
  maxFailedCommandsPerSession: number;
  suspiciousPatternThreshold: number;
  emergencyDisableThreshold: number;
}

// Security pattern detection
export interface SecurityPattern {
  id: string;
  name: string;
  description: string;
  severity: SecurityLevel;
  detectFunction: (context: MonitoringContext) => boolean;
  action: 'warn' | 'disable' | 'emergency';
  metadata: Record<string, any>;
}

// Monitoring context
export interface MonitoringContext {
  session: DangerousModeSession;
  recentCommands: CommandExecution[];
  systemMetrics: SystemMetrics;
  userBehavior: UserBehaviorMetrics;
  timeWindow: number; // minutes
}

// Command execution tracking
export interface CommandExecution {
  command: string;
  args: string[];
  timestamp: Date;
  risk: string;
  outcome: 'success' | 'failure' | 'blocked';
  duration?: number;
  exitCode?: number;
  resourcesAccessed: string[];
}

// System metrics
export interface SystemMetrics {
  cpuUsage: number;
  memoryUsage: number;
  diskActivity: number;
  networkActivity: number;
  processCount: number;
  fileSystemChanges: number;
}

// User behavior metrics
export interface UserBehaviorMetrics {
  commandFrequency: number;
  errorRate: number;
  typingSpeed: number;
  sessionPattern: string;
  repeatCommands: number;
  uniqueCommands: number;
}

// Monitoring alert
export interface MonitoringAlert {
  id: string;
  type: 'threshold_exceeded' | 'pattern_detected' | 'anomaly_detected';
  severity: SecurityLevel;
  sessionId: string;
  userId: string;
  message: string;
  details: Record<string, any>;
  timestamp: Date;
  action: 'warn' | 'disable' | 'emergency';
  acknowledged: boolean;
}

const DEFAULT_THRESHOLDS: MonitoringThresholds = {
  maxCommandsPerMinute: 10,
  maxRiskScoreIncrease: 50,
  maxSessionDuration: 30 * 60 * 1000, // 30 minutes
  maxActivationsPerHour: 3,
  maxFailedCommandsPerSession: 5,
  suspiciousPatternThreshold: 3,
  emergencyDisableThreshold: 100,
};

export class DangerousSecurityMonitor extends EventEmitter {
  private thresholds: MonitoringThresholds;
  private commandHistory: Map<string, CommandExecution[]> = new Map();
  private activeAlerts: Map<string, MonitoringAlert> = new Map();
  private securityPatterns: SecurityPattern[] = [];
  private monitoringActive = true;

  constructor(thresholds: Partial<MonitoringThresholds> = {}) {
    super();
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
    this.setupSecurityPatterns();
    this.startMonitoring();
  }

  /**
   * Monitor a command execution
   */
  async monitorCommandExecution(
    sessionId: string,
    execution: CommandExecution
  ): Promise<void> {
    if (!this.monitoringActive) return;

    // Track command history
    const history = this.commandHistory.get(sessionId) || [];
    history.push(execution);

    // Keep only last 100 commands per session
    if (history.length > 100) {
      history.splice(0, history.length - 100);
    }
    this.commandHistory.set(sessionId, history);

    // Get session and check monitoring
    const session = dangerousModeController.getSessionStatus(sessionId);
    if (!session || session.state !== DangerousModeState.ENABLED) {
      return;
    }

    // Perform threshold checks
    await this.checkThresholds(session, execution);

    // Perform pattern detection
    await this.detectSecurityPatterns(session);

    // Update user behavior metrics
    await this.updateUserBehaviorMetrics(sessionId, execution);

    // Log monitoring event
    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SECURITY_EVENTS,
      action: 'command_monitored',
      resourceType: 'dangerous_command',
      userId: session.userId,
      sessionId,
      outcome: execution.outcome,
      severity: this.mapOutcomeToSeverity(execution.outcome),
      details: {
        command: execution.command,
        risk: execution.risk,
        duration: execution.duration,
        resourcesAccessed: execution.resourcesAccessed,
      },
    });
  }

  /**
   * Monitor session activity
   */
  async monitorSessionActivity(sessionId: string): Promise<void> {
    if (!this.monitoringActive) return;

    const session = dangerousModeController.getSessionStatus(sessionId);
    if (!session || session.state !== DangerousModeState.ENABLED) {
      return;
    }

    // Check session duration
    if (session.enabledAt) {
      const duration = Date.now() - session.enabledAt.getTime();
      if (duration > this.thresholds.maxSessionDuration) {
        await this.createAlert({
          type: 'threshold_exceeded',
          severity: SecurityLevel.MODERATE,
          sessionId,
          userId: session.userId,
          message: 'Session duration exceeded maximum allowed time',
          details: {
            duration,
            maxDuration: this.thresholds.maxSessionDuration,
            threshold: 'maxSessionDuration',
          },
          action: 'warn',
        });
      }
    }

    // Check activation frequency
    if (session.activationCount > this.thresholds.maxActivationsPerHour) {
      await this.createAlert({
        type: 'threshold_exceeded',
        severity: SecurityLevel.DANGEROUS,
        sessionId,
        userId: session.userId,
        message: 'Too many dangerous mode activations in short period',
        details: {
          activationCount: session.activationCount,
          maxActivations: this.thresholds.maxActivationsPerHour,
          threshold: 'maxActivationsPerHour',
        },
        action: 'disable',
      });
    }
  }

  /**
   * Monitor system-wide dangerous mode usage
   */
  async monitorSystemUsage(): Promise<{
    activeSessions: number;
    totalCommands: number;
    riskDistribution: Record<string, number>;
    alertCount: number;
    averageSessionDuration: number;
  }> {
    const sessions = Array.from(this.commandHistory.keys());
    const activeSessions = sessions.length;

    let totalCommands = 0;
    let totalDuration = 0;
    const riskDistribution: Record<string, number> = {
      safe: 0,
      moderate: 0,
      dangerous: 0,
      critical: 0,
    };

    for (const sessionId of sessions) {
      const history = this.commandHistory.get(sessionId) || [];
      totalCommands += history.length;

      // Calculate risk distribution
      for (const cmd of history) {
        riskDistribution[cmd.risk] = (riskDistribution[cmd.risk] || 0) + 1;
      }

      // Calculate session duration
      const session = dangerousModeController.getSessionStatus(sessionId);
      if (session?.enabledAt) {
        const duration = Date.now() - session.enabledAt.getTime();
        totalDuration += duration;
      }
    }

    const averageSessionDuration =
      activeSessions > 0 ? totalDuration / activeSessions : 0;

    return {
      activeSessions,
      totalCommands,
      riskDistribution,
      alertCount: this.activeAlerts.size,
      averageSessionDuration,
    };
  }

  /**
   * Get security alerts for a session or all sessions
   */
  getSecurityAlerts(sessionId?: string): MonitoringAlert[] {
    const alerts = Array.from(this.activeAlerts.values());

    if (sessionId) {
      return alerts.filter(alert => alert.sessionId === sessionId);
    }

    return alerts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(alertId: string, userId: string): Promise<boolean> {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) return false;

    alert.acknowledged = true;

    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SECURITY_EVENTS,
      action: 'alert_acknowledged',
      resourceType: 'security_alert',
      resourceId: alertId,
      userId,
      outcome: 'success',
      severity: SecurityLevel.SAFE,
      details: {
        alertType: alert.type,
        originalSeverity: alert.severity,
      },
    });

    this.emit('alertAcknowledged', alert);
    return true;
  }

  /**
   * Emergency disable all dangerous mode sessions
   */
  async emergencyDisableAll(reason: string): Promise<void> {
    this.monitoringActive = false;

    await dangerousModeController.emergencyDisableAll(reason);

    await this.createAlert({
      type: 'anomaly_detected',
      severity: SecurityLevel.CRITICAL,
      sessionId: 'system',
      userId: 'system',
      message: 'Emergency disable triggered for all dangerous mode sessions',
      details: {
        reason,
        timestamp: new Date().toISOString(),
        affectedSessions: Array.from(this.commandHistory.keys()),
      },
      action: 'emergency',
    });

    this.emit('emergencyDisable', { reason });
  }

  /**
   * Generate monitoring report
   */
  generateReport(timeRange: { start: Date; end: Date }): {
    period: { start: Date; end: Date };
    sessions: {
      total: number;
      successful: number;
      terminated: number;
      averageDuration: number;
    };
    commands: {
      total: number;
      byRisk: Record<string, number>;
      failed: number;
      blocked: number;
    };
    alerts: {
      total: number;
      bySeverity: Record<SecurityLevel, number>;
      acknowledged: number;
    };
    patterns: {
      detected: number;
      types: Record<string, number>;
    };
    recommendations: string[];
  } {
    // Implementation would analyze historical data
    // For now, return current state snapshot
    const alerts = Array.from(this.activeAlerts.values());
    const alertsBySeverity = alerts.reduce(
      (acc, alert) => {
        acc[alert.severity] = (acc[alert.severity] || 0) + 1;
        return acc;
      },
      {} as Record<SecurityLevel, number>
    );

    return {
      period: timeRange,
      sessions: {
        total: this.commandHistory.size,
        successful: this.commandHistory.size,
        terminated: 0,
        averageDuration: 0,
      },
      commands: {
        total: Array.from(this.commandHistory.values()).reduce(
          (sum, cmds) => sum + cmds.length,
          0
        ),
        byRisk: { safe: 0, moderate: 0, dangerous: 0, critical: 0 },
        failed: 0,
        blocked: 0,
      },
      alerts: {
        total: alerts.length,
        bySeverity: alertsBySeverity,
        acknowledged: alerts.filter(a => a.acknowledged).length,
      },
      patterns: {
        detected: 0,
        types: {},
      },
      recommendations: this.generateRecommendations(),
    };
  }

  // Private methods

  private setupSecurityPatterns(): void {
    this.securityPatterns = [
      {
        id: 'rapid_fire_commands',
        name: 'Rapid Fire Commands',
        description: 'User executing commands at an unusually high rate',
        severity: SecurityLevel.MODERATE,
        detectFunction: context => {
          const recentCommands = context.recentCommands.filter(
            cmd => Date.now() - cmd.timestamp.getTime() < 60000 // Last minute
          );
          return recentCommands.length > this.thresholds.maxCommandsPerMinute;
        },
        action: 'warn',
        metadata: { threshold: this.thresholds.maxCommandsPerMinute },
      },

      {
        id: 'high_risk_sequence',
        name: 'High Risk Command Sequence',
        description: 'Multiple high-risk commands executed in sequence',
        severity: SecurityLevel.DANGEROUS,
        detectFunction: context => {
          const recentRiskyCommands = context.recentCommands.filter(
            cmd =>
              ['dangerous', 'critical'].includes(cmd.risk) &&
              Date.now() - cmd.timestamp.getTime() < 300000 // Last 5 minutes
          );
          return recentRiskyCommands.length >= 3;
        },
        action: 'disable',
        metadata: { sequence_threshold: 3 },
      },

      {
        id: 'failed_command_spike',
        name: 'Failed Command Spike',
        description: 'High number of failed command executions',
        severity: SecurityLevel.MODERATE,
        detectFunction: context => {
          const failedCommands = context.recentCommands.filter(
            cmd => cmd.outcome === 'failure'
          );
          return (
            failedCommands.length > this.thresholds.maxFailedCommandsPerSession
          );
        },
        action: 'warn',
        metadata: {
          failure_threshold: this.thresholds.maxFailedCommandsPerSession,
        },
      },

      {
        id: 'escalation_attempt',
        name: 'Privilege Escalation Attempt',
        description: 'Commands suggesting privilege escalation attempts',
        severity: SecurityLevel.DANGEROUS,
        detectFunction: context => {
          const escalationCommands = ['sudo', 'su', 'chmod 777', 'passwd'];
          return context.recentCommands.some(cmd =>
            escalationCommands.some(esc =>
              cmd.command.toLowerCase().includes(esc)
            )
          );
        },
        action: 'disable',
        metadata: {
          escalation_commands: ['sudo', 'su', 'chmod 777', 'passwd'],
        },
      },

      {
        id: 'system_exploration',
        name: 'System Exploration Pattern',
        description: 'Pattern suggesting system reconnaissance',
        severity: SecurityLevel.MODERATE,
        detectFunction: context => {
          const explorationCommands = [
            'find /',
            'ls /etc',
            'cat /etc/passwd',
            'ps aux',
          ];
          const matches = context.recentCommands.filter(cmd =>
            explorationCommands.some(exp => cmd.command.includes(exp))
          );
          return matches.length >= 3;
        },
        action: 'warn',
        metadata: { exploration_threshold: 3 },
      },
    ];
  }

  private async checkThresholds(
    session: DangerousModeSession,
    execution: CommandExecution
  ): Promise<void> {
    // Check command frequency
    const recentCommands = this.getRecentCommands(session.sessionId, 60000); // Last minute
    if (recentCommands.length > this.thresholds.maxCommandsPerMinute) {
      await this.createAlert({
        type: 'threshold_exceeded',
        severity: SecurityLevel.MODERATE,
        sessionId: session.sessionId,
        userId: session.userId,
        message: 'Command execution rate exceeded threshold',
        details: {
          commandsPerMinute: recentCommands.length,
          threshold: this.thresholds.maxCommandsPerMinute,
        },
        action: 'warn',
      });
    }

    // Check risk score increase
    if (session.riskScore > this.thresholds.maxRiskScoreIncrease) {
      await this.createAlert({
        type: 'threshold_exceeded',
        severity: SecurityLevel.DANGEROUS,
        sessionId: session.sessionId,
        userId: session.userId,
        message: 'Risk score exceeded safe threshold',
        details: {
          currentRiskScore: session.riskScore,
          threshold: this.thresholds.maxRiskScoreIncrease,
        },
        action: 'disable',
      });
    }
  }

  private async detectSecurityPatterns(
    session: DangerousModeSession
  ): Promise<void> {
    const recentCommands = this.getRecentCommands(session.sessionId, 600000); // Last 10 minutes

    const context: MonitoringContext = {
      session,
      recentCommands,
      systemMetrics: this.getSystemMetrics(),
      userBehavior: this.getUserBehaviorMetrics(session.sessionId),
      timeWindow: 10,
    };

    for (const pattern of this.securityPatterns) {
      if (pattern.detectFunction(context)) {
        await this.createAlert({
          type: 'pattern_detected',
          severity: pattern.severity,
          sessionId: session.sessionId,
          userId: session.userId,
          message: `Security pattern detected: ${pattern.name}`,
          details: {
            patternId: pattern.id,
            description: pattern.description,
            metadata: pattern.metadata,
          },
          action: pattern.action,
        });

        // Execute pattern action
        if (pattern.action === 'disable') {
          await dangerousModeController.disableDangerousMode(
            session.sessionId,
            'suspicious_activity'
          );
        } else if (pattern.action === 'emergency') {
          await this.emergencyDisableAll(`Pattern detected: ${pattern.name}`);
        }
      }
    }
  }

  private async createAlert(
    alertData: Omit<MonitoringAlert, 'id' | 'timestamp' | 'acknowledged'>
  ): Promise<void> {
    const alert: MonitoringAlert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      timestamp: new Date(),
      acknowledged: false,
      ...alertData,
    };

    this.activeAlerts.set(alert.id, alert);

    // Auto-remove alerts after 1 hour
    setTimeout(
      () => {
        this.activeAlerts.delete(alert.id);
      },
      60 * 60 * 1000
    );

    this.emit('securityAlert', alert);

    // Log to audit system
    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SECURITY_EVENTS,
      action: 'security_alert_created',
      resourceType: 'security_monitoring',
      resourceId: alert.id,
      userId: alert.userId,
      sessionId: alert.sessionId,
      outcome: 'success',
      severity: alert.severity,
      details: {
        alertType: alert.type,
        message: alert.message,
        action: alert.action,
        details: alert.details,
      },
    });
  }

  private getRecentCommands(
    sessionId: string,
    timeWindow: number
  ): CommandExecution[] {
    const history = this.commandHistory.get(sessionId) || [];
    const cutoff = Date.now() - timeWindow;
    return history.filter(cmd => cmd.timestamp.getTime() > cutoff);
  }

  private getSystemMetrics(): SystemMetrics {
    // In a real implementation, this would gather actual system metrics
    return {
      cpuUsage: Math.random() * 100,
      memoryUsage: Math.random() * 100,
      diskActivity: Math.random() * 100,
      networkActivity: Math.random() * 100,
      processCount: Math.floor(Math.random() * 500) + 100,
      fileSystemChanges: Math.floor(Math.random() * 50),
    };
  }

  private getUserBehaviorMetrics(sessionId: string): UserBehaviorMetrics {
    const history = this.getRecentCommands(sessionId, 600000); // Last 10 minutes

    return {
      commandFrequency: history.length / 10, // Commands per minute
      errorRate:
        history.filter(cmd => cmd.outcome === 'failure').length /
          history.length || 0,
      typingSpeed: 0, // Would need to track typing patterns
      sessionPattern: 'normal', // Would analyze command patterns
      repeatCommands: this.countRepeatedCommands(history),
      uniqueCommands: new Set(history.map(cmd => cmd.command)).size,
    };
  }

  private countRepeatedCommands(commands: CommandExecution[]): number {
    const commandCounts = new Map<string, number>();

    for (const cmd of commands) {
      const key = `${cmd.command} ${cmd.args.join(' ')}`;
      commandCounts.set(key, (commandCounts.get(key) || 0) + 1);
    }

    return Array.from(commandCounts.values()).filter(count => count > 1).length;
  }

  private async updateUserBehaviorMetrics(
    sessionId: string,
    execution: CommandExecution
  ): Promise<void> {
    // Update behavior tracking
    // Implementation would maintain behavioral baselines and detect anomalies
  }

  private mapOutcomeToSeverity(outcome: string): SecurityLevel {
    switch (outcome) {
      case 'success':
        return SecurityLevel.SAFE;
      case 'failure':
        return SecurityLevel.MODERATE;
      case 'blocked':
        return SecurityLevel.DANGEROUS;
      default:
        return SecurityLevel.SAFE;
    }
  }

  private generateRecommendations(): string[] {
    const recommendations: string[] = [];

    if (this.activeAlerts.size > 5) {
      recommendations.push(
        'High number of active security alerts - review dangerous mode policies'
      );
    }

    const systemUsage = Array.from(this.commandHistory.values()).reduce(
      (sum, cmds) => sum + cmds.length,
      0
    );
    if (systemUsage > 100) {
      recommendations.push(
        'High dangerous mode usage - consider training users on safe alternatives'
      );
    }

    return recommendations;
  }

  private startMonitoring(): void {
    // Periodic monitoring checks
    setInterval(async () => {
      if (!this.monitoringActive) return;

      // Monitor all active sessions
      for (const sessionId of this.commandHistory.keys()) {
        await this.monitorSessionActivity(sessionId);
      }
    }, 30 * 1000); // Every 30 seconds

    // Cleanup old command history
    setInterval(
      () => {
        const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24 hours

        for (const [sessionId, history] of this.commandHistory.entries()) {
          const filtered = history.filter(
            cmd => cmd.timestamp.getTime() > cutoff
          );

          if (filtered.length === 0) {
            this.commandHistory.delete(sessionId);
          } else {
            this.commandHistory.set(sessionId, filtered);
          }
        }
      },
      60 * 60 * 1000
    ); // Every hour
  }
}

// Export singleton instance
export const dangerousSecurityMonitor = new DangerousSecurityMonitor();
