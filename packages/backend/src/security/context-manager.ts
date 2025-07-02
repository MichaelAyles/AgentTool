import {
  SecurityContext,
  SecurityEvent,
  SecurityEventType,
  SecurityLevel,
  SecurityPolicy,
  SecurityAuditLog,
} from './types.js';
import { UserRole } from '../auth/types.js';
import { structuredLogger } from '../middleware/logging.js';
import { EventEmitter } from 'events';

// Default security policy
const DEFAULT_SECURITY_POLICY: SecurityPolicy = {
  maxRequestsPerMinute: 60,
  maxRequestsPerHour: 1000,
  maxSessionDuration: 24 * 60 * 60 * 1000, // 24 hours
  maxConcurrentSessions: 5,
  dangerousModeTimeout: 30 * 60 * 1000, // 30 minutes
  dangerousModeRequiresConfirmation: true,
  maxRiskScore: 100,
  riskScoreDecayRate: 0.1, // per minute
  maxViolationsPerHour: 10,
  violationLockoutDuration: 60 * 60 * 1000, // 1 hour
  maxActiveProjects: 10,
  maxActiveProcesses: 20,
};

export class SecurityContextManager extends EventEmitter {
  private contexts: Map<string, SecurityContext> = new Map();
  private policy: SecurityPolicy = DEFAULT_SECURITY_POLICY;
  private auditLog: SecurityAuditLog[] = [];
  private eventHistory: SecurityEvent[] = [];

  constructor() {
    super();
    this.startRiskScoreDecay();
    this.startSessionCleanup();
  }

  /**
   * Create a new security context for a user session
   */
  createContext(params: {
    userId: string;
    sessionId: string;
    role: UserRole;
    ipAddress: string;
    userAgent: string;
    dangerousModeEnabled?: boolean;
    location?: any;
    device?: any;
  }): SecurityContext {
    const context: SecurityContext = {
      userId: params.userId,
      sessionId: params.sessionId,
      role: params.role,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      createdAt: new Date(),
      lastActivity: new Date(),
      dangerousModeEnabled: params.dangerousModeEnabled || false,
      dangerousModeEnabledAt: params.dangerousModeEnabled
        ? new Date()
        : undefined,
      securityLevel: this.calculateSecurityLevel(
        params.role,
        params.dangerousModeEnabled
      ),
      activeProjects: [],
      activeSessions: [],
      grantedPermissions: [],
      riskScore: 0,
      violationCount: 0,
      requestCount: 0,
      requestWindowStart: new Date(),
      location: params.location,
      device: params.device,
    };

    this.contexts.set(params.sessionId, context);

    // Log context creation
    this.logSecurityEvent({
      type: SecurityEventType.LOGIN,
      severity: SecurityLevel.SAFE,
      userId: params.userId,
      sessionId: params.sessionId,
      ipAddress: params.ipAddress,
      outcome: 'success',
      metadata: {
        role: params.role,
        userAgent: params.userAgent,
        location: params.location,
      },
    });

    this.emit('contextCreated', context);
    return context;
  }

  /**
   * Get security context by session ID
   */
  getContext(sessionId: string): SecurityContext | undefined {
    return this.contexts.get(sessionId);
  }

  /**
   * Update user activity timestamp
   */
  updateActivity(sessionId: string): void {
    const context = this.contexts.get(sessionId);
    if (context) {
      context.lastActivity = new Date();
      this.incrementRequestCount(context);
    }
  }

  /**
   * Enable dangerous mode for a user
   */
  enableDangerousMode(
    sessionId: string,
    confirmation: boolean = false
  ): boolean {
    const context = this.contexts.get(sessionId);
    if (!context) return false;

    if (this.policy.dangerousModeRequiresConfirmation && !confirmation) {
      this.logSecurityEvent({
        type: SecurityEventType.DANGEROUS_MODE_ENABLED,
        severity: SecurityLevel.DANGEROUS,
        userId: context.userId,
        sessionId: sessionId,
        ipAddress: context.ipAddress,
        outcome: 'blocked',
        metadata: { reason: 'confirmation_required' },
      });
      return false;
    }

    context.dangerousModeEnabled = true;
    context.dangerousModeEnabledAt = new Date();
    context.securityLevel = SecurityLevel.DANGEROUS;

    this.logSecurityEvent({
      type: SecurityEventType.DANGEROUS_MODE_ENABLED,
      severity: SecurityLevel.DANGEROUS,
      userId: context.userId,
      sessionId: sessionId,
      ipAddress: context.ipAddress,
      outcome: 'success',
      metadata: { confirmation },
    });

    // Schedule automatic disable
    setTimeout(() => {
      this.disableDangerousMode(sessionId);
    }, this.policy.dangerousModeTimeout);

    this.emit('dangerousModeEnabled', context);
    return true;
  }

  /**
   * Disable dangerous mode for a user
   */
  disableDangerousMode(sessionId: string): void {
    const context = this.contexts.get(sessionId);
    if (!context) return;

    context.dangerousModeEnabled = false;
    context.dangerousModeEnabledAt = undefined;
    context.securityLevel = this.calculateSecurityLevel(context.role, false);

    this.logSecurityEvent({
      type: SecurityEventType.DANGEROUS_MODE_DISABLED,
      severity: SecurityLevel.SAFE,
      userId: context.userId,
      sessionId: sessionId,
      ipAddress: context.ipAddress,
      outcome: 'success',
      metadata: {},
    });

    this.emit('dangerousModeDisabled', context);
  }

  /**
   * Record a security violation
   */
  recordViolation(
    sessionId: string,
    violation: {
      type: SecurityEventType;
      severity: SecurityLevel;
      resource?: string;
      action?: string;
      metadata?: Record<string, any>;
    }
  ): void {
    const context = this.contexts.get(sessionId);
    if (!context) return;

    context.violationCount++;
    context.lastViolation = new Date();

    // Increase risk score based on severity
    const riskIncrease = this.getRiskScoreIncrease(violation.severity);
    context.riskScore = Math.min(
      context.riskScore + riskIncrease,
      this.policy.maxRiskScore
    );

    this.logSecurityEvent({
      type: violation.type,
      severity: violation.severity,
      userId: context.userId,
      sessionId: sessionId,
      ipAddress: context.ipAddress,
      resource: violation.resource,
      action: violation.action,
      outcome: 'failure',
      metadata: violation.metadata || {},
      riskScore: context.riskScore,
    });

    // Check if user should be locked out
    if (this.shouldLockoutUser(context)) {
      this.lockoutUser(sessionId);
    }

    this.emit('violationRecorded', { context, violation });
  }

  /**
   * Add a project to user's active projects
   */
  addActiveProject(sessionId: string, projectId: string): boolean {
    const context = this.contexts.get(sessionId);
    if (!context) return false;

    if (context.activeProjects.length >= this.policy.maxActiveProjects) {
      this.recordViolation(sessionId, {
        type: SecurityEventType.SECURITY_VIOLATION,
        severity: SecurityLevel.MODERATE,
        resource: 'project',
        action: 'limit_exceeded',
        metadata: { projectId, limit: this.policy.maxActiveProjects },
      });
      return false;
    }

    if (!context.activeProjects.includes(projectId)) {
      context.activeProjects.push(projectId);

      this.logSecurityEvent({
        type: SecurityEventType.RESOURCE_ACCESS,
        severity: SecurityLevel.SAFE,
        userId: context.userId,
        sessionId: sessionId,
        ipAddress: context.ipAddress,
        resource: 'project',
        action: 'access',
        outcome: 'success',
        metadata: { projectId },
      });
    }

    return true;
  }

  /**
   * Remove a project from user's active projects
   */
  removeActiveProject(sessionId: string, projectId: string): void {
    const context = this.contexts.get(sessionId);
    if (!context) return;

    const index = context.activeProjects.indexOf(projectId);
    if (index > -1) {
      context.activeProjects.splice(index, 1);
    }
  }

  /**
   * Check if a request is within rate limits
   */
  checkRateLimit(sessionId: string): boolean {
    const context = this.contexts.get(sessionId);
    if (!context) return false;

    const now = new Date();
    const windowStart = context.requestWindowStart;
    const minutesSinceWindowStart =
      (now.getTime() - windowStart.getTime()) / (1000 * 60);

    // Reset window if more than an hour has passed
    if (minutesSinceWindowStart > 60) {
      context.requestCount = 0;
      context.requestWindowStart = now;
      return true;
    }

    // Check per-minute limit
    if (
      minutesSinceWindowStart < 1 &&
      context.requestCount >= this.policy.maxRequestsPerMinute
    ) {
      this.recordViolation(sessionId, {
        type: SecurityEventType.SECURITY_VIOLATION,
        severity: SecurityLevel.MODERATE,
        action: 'rate_limit_exceeded',
        metadata: { limit: 'per_minute', count: context.requestCount },
      });
      return false;
    }

    // Check per-hour limit
    if (context.requestCount >= this.policy.maxRequestsPerHour) {
      this.recordViolation(sessionId, {
        type: SecurityEventType.SECURITY_VIOLATION,
        severity: SecurityLevel.DANGEROUS,
        action: 'rate_limit_exceeded',
        metadata: { limit: 'per_hour', count: context.requestCount },
      });
      return false;
    }

    return true;
  }

  /**
   * Get security metrics
   */
  getSecurityMetrics(): any {
    const now = new Date();
    const activeContexts = Array.from(this.contexts.values());

    return {
      timestamp: now,
      activeUsers: new Set(activeContexts.map(c => c.userId)).size,
      activeSessions: activeContexts.length,
      averageRiskScore:
        activeContexts.reduce((sum, c) => sum + c.riskScore, 0) /
          activeContexts.length || 0,
      dangerousModeSessions: activeContexts.filter(c => c.dangerousModeEnabled)
        .length,
      highRiskSessions: activeContexts.filter(c => c.riskScore > 50).length,
      recentViolations: this.eventHistory.filter(
        e =>
          e.outcome === 'failure' &&
          now.getTime() - e.timestamp.getTime() < 60 * 60 * 1000 // last hour
      ).length,
    };
  }

  /**
   * Destroy a security context
   */
  destroyContext(sessionId: string): void {
    const context = this.contexts.get(sessionId);
    if (context) {
      this.logSecurityEvent({
        type: SecurityEventType.LOGOUT,
        severity: SecurityLevel.SAFE,
        userId: context.userId,
        sessionId: sessionId,
        ipAddress: context.ipAddress,
        outcome: 'success',
        metadata: {},
      });

      this.contexts.delete(sessionId);
      this.emit('contextDestroyed', context);
    }
  }

  // Private helper methods

  private calculateSecurityLevel(
    role: UserRole,
    dangerousMode: boolean
  ): SecurityLevel {
    if (dangerousMode) return SecurityLevel.DANGEROUS;
    if (role === UserRole.ADMIN) return SecurityLevel.MODERATE;
    return SecurityLevel.SAFE;
  }

  private getRiskScoreIncrease(severity: SecurityLevel): number {
    switch (severity) {
      case SecurityLevel.SAFE:
        return 1;
      case SecurityLevel.MODERATE:
        return 5;
      case SecurityLevel.DANGEROUS:
        return 15;
      case SecurityLevel.CRITICAL:
        return 30;
      default:
        return 1;
    }
  }

  private shouldLockoutUser(context: SecurityContext): boolean {
    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const recentViolations = this.eventHistory.filter(
      e =>
        e.userId === context.userId &&
        e.outcome === 'failure' &&
        e.timestamp > hourAgo
    ).length;

    return recentViolations >= this.policy.maxViolationsPerHour;
  }

  private lockoutUser(sessionId: string): void {
    const context = this.contexts.get(sessionId);
    if (!context) return;

    this.logSecurityEvent({
      type: SecurityEventType.SECURITY_VIOLATION,
      severity: SecurityLevel.CRITICAL,
      userId: context.userId,
      sessionId: sessionId,
      ipAddress: context.ipAddress,
      outcome: 'blocked',
      metadata: { reason: 'lockout', violationCount: context.violationCount },
    });

    // Schedule context destruction
    setTimeout(() => {
      this.destroyContext(sessionId);
    }, this.policy.violationLockoutDuration);

    this.emit('userLockedOut', context);
  }

  private incrementRequestCount(context: SecurityContext): void {
    const now = new Date();
    const minutesSinceWindowStart =
      (now.getTime() - context.requestWindowStart.getTime()) / (1000 * 60);

    if (minutesSinceWindowStart >= 60) {
      context.requestCount = 1;
      context.requestWindowStart = now;
    } else {
      context.requestCount++;
    }
  }

  private logSecurityEvent(
    event: Omit<SecurityEvent, 'id' | 'timestamp'>
  ): void {
    const securityEvent: SecurityEvent = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      ...event,
    };

    this.eventHistory.push(securityEvent);

    // Keep only last 10000 events in memory
    if (this.eventHistory.length > 10000) {
      this.eventHistory = this.eventHistory.slice(-5000);
    }

    // Log to structured logger
    structuredLogger.info('Security event', {
      securityEvent: securityEvent,
      category: 'security',
    });

    this.emit('securityEvent', securityEvent);
  }

  private startRiskScoreDecay(): void {
    setInterval(() => {
      for (const context of this.contexts.values()) {
        if (context.riskScore > 0) {
          context.riskScore = Math.max(
            0,
            context.riskScore - this.policy.riskScoreDecayRate
          );
        }
      }
    }, 60 * 1000); // Every minute
  }

  private startSessionCleanup(): void {
    setInterval(
      () => {
        const now = new Date();
        const expiredSessions: string[] = [];

        for (const [sessionId, context] of this.contexts.entries()) {
          const sessionAge = now.getTime() - context.createdAt.getTime();
          const inactivityTime = now.getTime() - context.lastActivity.getTime();

          if (
            sessionAge > this.policy.maxSessionDuration ||
            inactivityTime > 2 * 60 * 60 * 1000
          ) {
            expiredSessions.push(sessionId);
          }
        }

        for (const sessionId of expiredSessions) {
          this.logSecurityEvent({
            type: SecurityEventType.SESSION_EXPIRED,
            severity: SecurityLevel.SAFE,
            userId: this.contexts.get(sessionId)!.userId,
            sessionId: sessionId,
            ipAddress: this.contexts.get(sessionId)!.ipAddress,
            outcome: 'success',
            metadata: {},
          });
          this.destroyContext(sessionId);
        }
      },
      15 * 60 * 1000
    ); // Every 15 minutes
  }
}

// Export singleton instance
export const securityContextManager = new SecurityContextManager();
