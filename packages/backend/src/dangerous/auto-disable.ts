import { EventEmitter } from 'events';
import { SecurityLevel, SecurityEventType } from '../security/types.js';
import {
  dangerousModeController,
  DangerousModeSession,
  DangerousModeState,
} from './controller.js';
import { dangerousTimeoutManager, TimeoutTrigger } from './timeout-manager.js';
import { dangerousSecurityMonitor } from './monitoring.js';
import {
  comprehensiveAuditLogger,
  AuditCategory,
} from '../security/audit-logger.js';

// Auto-disable trigger types
export enum AutoDisableTrigger {
  RISK_SCORE_EXCEEDED = 'risk_score_exceeded',
  FAILED_COMMAND_THRESHOLD = 'failed_command_threshold',
  SUSPICIOUS_PATTERN_DETECTED = 'suspicious_pattern_detected',
  RAPID_FIRE_COMMANDS = 'rapid_fire_commands',
  PRIVILEGE_ESCALATION_ATTEMPT = 'privilege_escalation_attempt',
  SYSTEM_RESOURCE_EXHAUSTION = 'system_resource_exhaustion',
  MULTIPLE_SECURITY_VIOLATIONS = 'multiple_security_violations',
  UNAUTHORIZED_ACCESS_ATTEMPT = 'unauthorized_access_attempt',
  BLACKLISTED_COMMAND_SEQUENCE = 'blacklisted_command_sequence',
  ANOMALOUS_BEHAVIOR = 'anomalous_behavior',
}

// Auto-disable configuration
export interface AutoDisableConfig {
  enabled: boolean;
  riskScoreThreshold: number;
  failedCommandThreshold: number;
  rapidFireThreshold: number; // commands per minute
  violationCountThreshold: number;
  cooldownAfterDisable: number; // milliseconds
  emergencyPatterns: string[];
  whitelistedUsers: string[];
  escalationChain: string[]; // User IDs to notify
}

// Auto-disable event
export interface AutoDisableEvent {
  sessionId: string;
  userId: string;
  trigger: AutoDisableTrigger;
  severity: SecurityLevel;
  evidence: Record<string, any>;
  timestamp: Date;
  canAppeal: boolean;
  appealDeadline?: Date;
}

// Behavior baseline for anomaly detection
interface UserBaseline {
  userId: string;
  averageCommandsPerMinute: number;
  commonCommands: string[];
  typicalSessionDuration: number;
  errorRate: number;
  lastUpdated: Date;
}

const DEFAULT_CONFIG: AutoDisableConfig = {
  enabled: true,
  riskScoreThreshold: 80,
  failedCommandThreshold: 5,
  rapidFireThreshold: 20,
  violationCountThreshold: 3,
  cooldownAfterDisable: 15 * 60 * 1000, // 15 minutes
  emergencyPatterns: [
    'rm -rf /',
    'chmod 777 /',
    'passwd root',
    'mkfs',
    'dd if=/dev/zero',
    'iptables -F',
    'shutdown',
    'reboot',
  ],
  whitelistedUsers: [], // Admin users who bypass some checks
  escalationChain: [], // Users to notify on auto-disable
};

export class AutoDisableService extends EventEmitter {
  private config: AutoDisableConfig;
  private violationCounts: Map<string, number> = new Map();
  private userBaselines: Map<string, UserBaseline> = new Map();
  private disabledSessions: Map<string, { until: Date; reason: string }> =
    new Map();
  private monitoringInterval?: NodeJS.Timeout;

  constructor(config: Partial<AutoDisableConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.setupEventListeners();
    this.startMonitoring();
  }

  /**
   * Check if auto-disable should be triggered for a session
   */
  async checkAutoDisable(
    sessionId: string,
    trigger: AutoDisableTrigger,
    evidence: Record<string, any>
  ): Promise<boolean> {
    if (!this.config.enabled) {
      return false;
    }

    const session = dangerousModeController.getSessionStatus(sessionId);
    if (!session || session.state !== DangerousModeState.ENABLED) {
      return false;
    }

    // Check if user is whitelisted
    if (this.config.whitelistedUsers.includes(session.userId)) {
      await this.logWhitelistBypass(session, trigger, evidence);
      return false;
    }

    // Check if session is in cooldown
    const cooldownInfo = this.disabledSessions.get(sessionId);
    if (cooldownInfo && Date.now() < cooldownInfo.until.getTime()) {
      return false; // Still in cooldown
    }

    // Evaluate trigger severity
    const shouldDisable = await this.evaluateTrigger(
      session,
      trigger,
      evidence
    );

    if (shouldDisable) {
      await this.triggerAutoDisable(session, trigger, evidence);
      return true;
    }

    return false;
  }

  /**
   * Force auto-disable for a session
   */
  async forceAutoDisable(
    sessionId: string,
    trigger: AutoDisableTrigger,
    evidence: Record<string, any>,
    adminUserId?: string
  ): Promise<void> {
    const session = dangerousModeController.getSessionStatus(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    await this.triggerAutoDisable(session, trigger, {
      ...evidence,
      forcedBy: adminUserId,
      forced: true,
    });
  }

  /**
   * Check user behavior patterns for anomalies
   */
  async analyzeUserBehavior(sessionId: string): Promise<{
    isAnomalous: boolean;
    anomalies: string[];
    confidence: number;
  }> {
    const session = dangerousModeController.getSessionStatus(sessionId);
    if (!session) {
      return { isAnomalous: false, anomalies: [], confidence: 0 };
    }

    const baseline = this.getUserBaseline(session.userId);
    const anomalies: string[] = [];
    let anomalyScore = 0;

    // Analyze command frequency
    const currentRate = this.calculateCommandRate(session);
    if (currentRate > baseline.averageCommandsPerMinute * 2) {
      anomalies.push(
        `Command rate ${currentRate.toFixed(1)}/min exceeds baseline ${baseline.averageCommandsPerMinute.toFixed(1)}/min`
      );
      anomalyScore += 30;
    }

    // Analyze error rate
    const currentErrorRate = this.calculateErrorRate(session);
    if (currentErrorRate > baseline.errorRate * 1.5) {
      anomalies.push(
        `Error rate ${(currentErrorRate * 100).toFixed(1)}% exceeds baseline ${(baseline.errorRate * 100).toFixed(1)}%`
      );
      anomalyScore += 20;
    }

    // Analyze command diversity
    const commandDiversity = this.calculateCommandDiversity(session);
    if (commandDiversity.unusualCommands > 3) {
      anomalies.push(
        `${commandDiversity.unusualCommands} unusual commands detected`
      );
      anomalyScore += 25;
    }

    // Check for time-based anomalies
    const timeAnomalies = this.detectTimeAnomalies(session, baseline);
    anomalies.push(...timeAnomalies);
    anomalyScore += timeAnomalies.length * 15;

    const confidence = Math.min(anomalyScore / 100, 1);
    const isAnomalous = confidence > 0.6;

    if (isAnomalous) {
      await this.checkAutoDisable(
        sessionId,
        AutoDisableTrigger.ANOMALOUS_BEHAVIOR,
        {
          anomalies,
          confidence,
          anomalyScore,
        }
      );
    }

    return { isAnomalous, anomalies, confidence };
  }

  /**
   * Update user behavior baseline
   */
  updateUserBaseline(userId: string, sessionData: DangerousModeSession): void {
    const existing = this.userBaselines.get(userId);

    const newBaseline: UserBaseline = {
      userId,
      averageCommandsPerMinute: this.calculateCommandRate(sessionData),
      commonCommands: this.extractCommonCommands(sessionData),
      typicalSessionDuration: sessionData.enabledAt
        ? Date.now() - sessionData.enabledAt.getTime()
        : 0,
      errorRate: this.calculateErrorRate(sessionData),
      lastUpdated: new Date(),
    };

    if (existing) {
      // Merge with existing baseline using weighted average
      newBaseline.averageCommandsPerMinute =
        existing.averageCommandsPerMinute * 0.7 +
        newBaseline.averageCommandsPerMinute * 0.3;

      newBaseline.errorRate =
        existing.errorRate * 0.7 + newBaseline.errorRate * 0.3;

      // Merge common commands
      const combinedCommands = [
        ...existing.commonCommands,
        ...newBaseline.commonCommands,
      ];
      newBaseline.commonCommands = [...new Set(combinedCommands)].slice(0, 20); // Keep top 20
    }

    this.userBaselines.set(userId, newBaseline);
  }

  /**
   * Get auto-disable statistics
   */
  getAutoDisableStats(): {
    totalDisables: number;
    disablesByTrigger: Record<AutoDisableTrigger, number>;
    activeViolations: number;
    cooldownSessions: number;
  } {
    const disablesByTrigger = Object.values(AutoDisableTrigger).reduce(
      (acc, trigger) => {
        acc[trigger] = 0;
        return acc;
      },
      {} as Record<AutoDisableTrigger, number>
    );

    const now = new Date();
    const cooldownSessions = Array.from(this.disabledSessions.values()).filter(
      info => info.until > now
    ).length;

    return {
      totalDisables: this.disabledSessions.size,
      disablesByTrigger,
      activeViolations: this.violationCounts.size,
      cooldownSessions,
    };
  }

  // Private methods

  private setupEventListeners(): void {
    // Listen for command validations
    dangerousModeController.on(
      'dangerousModeEnabled',
      ({ sessionId, userId }) => {
        this.violationCounts.delete(sessionId);
      }
    );

    dangerousModeController.on(
      'dangerousModeDisabled',
      ({ sessionId, reason }) => {
        if (reason === 'suspicious_activity') {
          const session = dangerousModeController.getSessionStatus(sessionId);
          if (session) {
            this.updateUserBaseline(session.userId, session);
          }
        }
      }
    );

    // Listen for security alerts
    dangerousSecurityMonitor.on('securityAlert', async alert => {
      const triggerMap: Record<string, AutoDisableTrigger> = {
        rapid_fire_commands: AutoDisableTrigger.RAPID_FIRE_COMMANDS,
        high_risk_sequence: AutoDisableTrigger.BLACKLISTED_COMMAND_SEQUENCE,
        failed_command_spike: AutoDisableTrigger.FAILED_COMMAND_THRESHOLD,
        escalation_attempt: AutoDisableTrigger.PRIVILEGE_ESCALATION_ATTEMPT,
      };

      const trigger = triggerMap[alert.details.patternId];
      if (trigger) {
        await this.checkAutoDisable(alert.sessionId, trigger, {
          alertId: alert.id,
          patternId: alert.details.patternId,
          alertDetails: alert.details,
        });
      }
    });

    // Listen for timeout events
    dangerousTimeoutManager.on('timeoutTriggered', async event => {
      if (event.trigger === TimeoutTrigger.RISK_THRESHOLD) {
        await this.checkAutoDisable(
          event.sessionId,
          AutoDisableTrigger.RISK_SCORE_EXCEEDED,
          event.metadata
        );
      }
    });
  }

  private async evaluateTrigger(
    session: DangerousModeSession,
    trigger: AutoDisableTrigger,
    evidence: Record<string, any>
  ): Promise<boolean> {
    switch (trigger) {
      case AutoDisableTrigger.RISK_SCORE_EXCEEDED:
        return session.riskScore >= this.config.riskScoreThreshold;

      case AutoDisableTrigger.FAILED_COMMAND_THRESHOLD:
        return (
          this.countFailedCommands(session) >=
          this.config.failedCommandThreshold
        );

      case AutoDisableTrigger.RAPID_FIRE_COMMANDS:
        return (
          this.calculateCommandRate(session) >= this.config.rapidFireThreshold
        );

      case AutoDisableTrigger.MULTIPLE_SECURITY_VIOLATIONS:
        const violations = this.violationCounts.get(session.sessionId) || 0;
        return violations >= this.config.violationCountThreshold;

      case AutoDisableTrigger.BLACKLISTED_COMMAND_SEQUENCE:
        return this.detectBlacklistedSequence(evidence);

      case AutoDisableTrigger.PRIVILEGE_ESCALATION_ATTEMPT:
      case AutoDisableTrigger.SUSPICIOUS_PATTERN_DETECTED:
        return true; // These are always serious

      case AutoDisableTrigger.ANOMALOUS_BEHAVIOR:
        return evidence.confidence > 0.7;

      default:
        return false;
    }
  }

  private async triggerAutoDisable(
    session: DangerousModeSession,
    trigger: AutoDisableTrigger,
    evidence: Record<string, any>
  ): Promise<void> {
    const event: AutoDisableEvent = {
      sessionId: session.sessionId,
      userId: session.userId,
      trigger,
      severity: this.getTriggerSeverity(trigger),
      evidence,
      timestamp: new Date(),
      canAppeal: this.canAppealDisable(trigger),
      appealDeadline: this.canAppealDisable(trigger)
        ? new Date(Date.now() + 24 * 60 * 60 * 1000)
        : undefined,
    };

    // Increment violation count
    const violations = this.violationCounts.get(session.sessionId) || 0;
    this.violationCounts.set(session.sessionId, violations + 1);

    // Set cooldown period
    this.disabledSessions.set(session.sessionId, {
      until: new Date(Date.now() + this.config.cooldownAfterDisable),
      reason: trigger,
    });

    // Disable the session
    await dangerousModeController.disableDangerousMode(
      session.sessionId,
      'suspicious_activity'
    );

    // Log the auto-disable
    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SECURITY_EVENTS,
      action: 'auto_disable_triggered',
      resourceType: 'dangerous_session',
      resourceId: session.sessionId,
      userId: session.userId,
      sessionId: session.sessionId,
      outcome: 'success',
      severity: event.severity,
      details: {
        trigger,
        evidence,
        violationCount: violations + 1,
        canAppeal: event.canAppeal,
      },
    });

    // Emit event
    this.emit('autoDisableTriggered', event);

    // Notify escalation chain
    await this.notifyEscalationChain(event);
  }

  private getUserBaseline(userId: string): UserBaseline {
    return (
      this.userBaselines.get(userId) || {
        userId,
        averageCommandsPerMinute: 2,
        commonCommands: [],
        typicalSessionDuration: 15 * 60 * 1000,
        errorRate: 0.1,
        lastUpdated: new Date(),
      }
    );
  }

  private calculateCommandRate(session: DangerousModeSession): number {
    if (!session.enabledAt) return 0;
    const sessionDuration = Date.now() - session.enabledAt.getTime();
    const minutes = sessionDuration / (60 * 1000);
    return minutes > 0 ? session.commandsExecuted / minutes : 0;
  }

  private calculateErrorRate(session: DangerousModeSession): number {
    // This would need to be tracked in the session data
    // For now, return a mock value
    return Math.random() * 0.2;
  }

  private calculateCommandDiversity(session: DangerousModeSession): {
    uniqueCommands: number;
    unusualCommands: number;
  } {
    // This would analyze actual command history
    // For now, return mock values
    return {
      uniqueCommands: Math.floor(Math.random() * 10) + 1,
      unusualCommands: Math.floor(Math.random() * 3),
    };
  }

  private extractCommonCommands(session: DangerousModeSession): string[] {
    // This would extract actual commands from session history
    // For now, return mock data
    return ['ls', 'cd', 'cat', 'grep'];
  }

  private detectTimeAnomalies(
    session: DangerousModeSession,
    baseline: UserBaseline
  ): string[] {
    const anomalies: string[] = [];

    if (!session.enabledAt) return anomalies;

    const sessionDuration = Date.now() - session.enabledAt.getTime();
    if (sessionDuration > baseline.typicalSessionDuration * 2) {
      anomalies.push('Session duration significantly longer than baseline');
    }

    // Check time of day (simplified)
    const hour = new Date().getHours();
    if (hour < 6 || hour > 22) {
      anomalies.push('Session during unusual hours');
    }

    return anomalies;
  }

  private countFailedCommands(session: DangerousModeSession): number {
    // This would count actual failed commands from session history
    // For now, return a mock value based on session state
    return Math.floor(Math.random() * 3);
  }

  private detectBlacklistedSequence(evidence: Record<string, any>): boolean {
    const command = evidence.command || '';
    return this.config.emergencyPatterns.some(pattern =>
      command.toLowerCase().includes(pattern.toLowerCase())
    );
  }

  private getTriggerSeverity(trigger: AutoDisableTrigger): SecurityLevel {
    switch (trigger) {
      case AutoDisableTrigger.PRIVILEGE_ESCALATION_ATTEMPT:
      case AutoDisableTrigger.BLACKLISTED_COMMAND_SEQUENCE:
      case AutoDisableTrigger.SYSTEM_RESOURCE_EXHAUSTION:
        return SecurityLevel.CRITICAL;

      case AutoDisableTrigger.RISK_SCORE_EXCEEDED:
      case AutoDisableTrigger.SUSPICIOUS_PATTERN_DETECTED:
      case AutoDisableTrigger.MULTIPLE_SECURITY_VIOLATIONS:
        return SecurityLevel.DANGEROUS;

      default:
        return SecurityLevel.MODERATE;
    }
  }

  private canAppealDisable(trigger: AutoDisableTrigger): boolean {
    // Critical triggers cannot be appealed
    return ![
      AutoDisableTrigger.PRIVILEGE_ESCALATION_ATTEMPT,
      AutoDisableTrigger.BLACKLISTED_COMMAND_SEQUENCE,
      AutoDisableTrigger.SYSTEM_RESOURCE_EXHAUSTION,
    ].includes(trigger);
  }

  private async notifyEscalationChain(event: AutoDisableEvent): Promise<void> {
    for (const adminUserId of this.config.escalationChain) {
      // In a real implementation, this would send notifications
      console.log(
        `Notifying admin ${adminUserId} of auto-disable event`,
        event
      );
    }
  }

  private async logWhitelistBypass(
    session: DangerousModeSession,
    trigger: AutoDisableTrigger,
    evidence: Record<string, any>
  ): Promise<void> {
    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SECURITY_EVENTS,
      action: 'auto_disable_whitelist_bypass',
      resourceType: 'dangerous_session',
      resourceId: session.sessionId,
      userId: session.userId,
      sessionId: session.sessionId,
      outcome: 'success',
      severity: SecurityLevel.MODERATE,
      details: {
        trigger,
        evidence,
        whitelistedUser: true,
      },
    });
  }

  private startMonitoring(): void {
    this.monitoringInterval = setInterval(async () => {
      // Perform periodic checks on all active sessions
      for (const [sessionId] of dangerousTimeoutManager['sessionTimers']) {
        const session = dangerousModeController.getSessionStatus(sessionId);
        if (session && session.state === DangerousModeState.ENABLED) {
          await this.analyzeUserBehavior(sessionId);
        }
      }

      // Clean up old violation counts
      this.cleanupOldViolations();
    }, 60 * 1000); // Every minute
  }

  private cleanupOldViolations(): void {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24 hours

    for (const [sessionId, info] of this.disabledSessions.entries()) {
      if (info.until.getTime() < cutoff) {
        this.disabledSessions.delete(sessionId);
        this.violationCounts.delete(sessionId);
      }
    }
  }
}

// Export singleton instance
export const autoDisableService = new AutoDisableService();
