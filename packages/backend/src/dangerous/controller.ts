import { EventEmitter } from 'events';
import { SecurityLevel, SecurityEventType } from '../security/types.js';
import { securityEventLogger } from '../security/event-logger.js';
import { comprehensiveAuditLogger, AuditCategory } from '../security/audit-logger.js';
import { CommandValidator, CommandRisk } from '../security/command-validator.js';

// Dangerous mode states
export enum DangerousModeState {
  DISABLED = 'disabled',
  PENDING_CONFIRMATION = 'pending_confirmation',
  ENABLED = 'enabled',
  COOLDOWN = 'cooldown',
  SUSPENDED = 'suspended'
}

// Dangerous mode configuration
export interface DangerousModeConfig {
  maxDuration: number; // milliseconds
  cooldownPeriod: number; // milliseconds
  maxActivationsPerHour: number;
  requireConfirmation: boolean;
  requireReason: boolean;
  allowedRoles: string[];
  autoDisableOnSuspiciousActivity: boolean;
  maxRiskScore: number;
  emergencyDisableEnabled: boolean;
}

// Dangerous mode session
export interface DangerousModeSession {
  sessionId: string;
  userId: string;
  state: DangerousModeState;
  enabledAt?: Date;
  expiresAt?: Date;
  reason?: string;
  confirmationCode?: string;
  activationCount: number;
  lastActivation?: Date;
  warnings: DangerousWarning[];
  commandsExecuted: number;
  riskScore: number;
}

// Warning types for dangerous mode
export interface DangerousWarning {
  id: string;
  type: 'timeout_warning' | 'risk_increase' | 'suspicious_activity' | 'command_blocked';
  message: string;
  timestamp: Date;
  severity: SecurityLevel;
  metadata: Record<string, any>;
}

const DEFAULT_CONFIG: DangerousModeConfig = {
  maxDuration: 30 * 60 * 1000, // 30 minutes
  cooldownPeriod: 15 * 60 * 1000, // 15 minutes
  maxActivationsPerHour: 3,
  requireConfirmation: true,
  requireReason: true,
  allowedRoles: ['admin', 'user'], // viewers cannot enable dangerous mode
  autoDisableOnSuspiciousActivity: true,
  maxRiskScore: 80,
  emergencyDisableEnabled: true,
};

export class DangerousModeController extends EventEmitter {
  private sessions: Map<string, DangerousModeSession> = new Map();
  private config: DangerousModeConfig;
  private emergencyStop = false;

  constructor(config: Partial<DangerousModeConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.startPeriodicCleanup();
    this.startWarningSystem();
  }

  /**
   * Request to enable dangerous mode
   */
  async requestDangerousMode(params: {
    sessionId: string;
    userId: string;
    userRole: string;
    reason?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<{
    success: boolean;
    state: DangerousModeState;
    confirmationCode?: string;
    message: string;
    expiresAt?: Date;
    warnings?: string[];
  }> {
    const { sessionId, userId, userRole, reason, ipAddress, userAgent } = params;

    // Check if emergency stop is active
    if (this.emergencyStop) {
      await this.auditDangerousAction('enable_request', sessionId, userId, 'blocked', {
        reason: 'emergency_stop_active',
        ipAddress,
        userAgent,
      });
      
      return {
        success: false,
        state: DangerousModeState.SUSPENDED,
        message: 'Dangerous mode is temporarily disabled due to emergency stop',
      };
    }

    // Check role permissions
    if (!this.config.allowedRoles.includes(userRole.toLowerCase())) {
      await this.auditDangerousAction('enable_request', sessionId, userId, 'blocked', {
        reason: 'insufficient_role',
        role: userRole,
        ipAddress,
      });
      
      return {
        success: false,
        state: DangerousModeState.DISABLED,
        message: `Role '${userRole}' is not allowed to enable dangerous mode`,
      };
    }

    // Check if reason is required
    if (this.config.requireReason && !reason) {
      return {
        success: false,
        state: DangerousModeState.DISABLED,
        message: 'Reason is required to enable dangerous mode',
      };
    }

    // Get or create session
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = this.createSession(sessionId, userId);
    }

    // Check activation limits
    const activationCheck = this.checkActivationLimits(session);
    if (!activationCheck.allowed) {
      await this.auditDangerousAction('enable_request', sessionId, userId, 'blocked', {
        reason: 'activation_limit_exceeded',
        count: session.activationCount,
        limit: this.config.maxActivationsPerHour,
      });
      
      return {
        success: false,
        state: session.state,
        message: activationCheck.message,
      };
    }

    // Check cooldown period
    if (session.state === DangerousModeState.COOLDOWN) {
      return {
        success: false,
        state: session.state,
        message: 'Must wait for cooldown period to expire',
      };
    }

    // Generate confirmation code if required
    if (this.config.requireConfirmation) {
      const confirmationCode = this.generateConfirmationCode();
      session.confirmationCode = confirmationCode;
      session.state = DangerousModeState.PENDING_CONFIRMATION;
      session.reason = reason;

      await this.auditDangerousAction('enable_request', sessionId, userId, 'pending_confirmation', {
        reason,
        confirmationRequired: true,
        ipAddress,
      });

      this.emit('confirmationRequired', { sessionId, userId, confirmationCode });

      return {
        success: true,
        state: session.state,
        confirmationCode,
        message: 'Confirmation code generated. Use it to confirm dangerous mode activation.',
      };
    }

    // Enable directly if no confirmation required
    return this.enableDangerousMode(sessionId, { reason });
  }

  /**
   * Confirm and enable dangerous mode
   */
  async confirmDangerousMode(
    sessionId: string,
    confirmationCode: string,
    additionalParams?: { reason?: string }
  ): Promise<{
    success: boolean;
    state: DangerousModeState;
    message: string;
    expiresAt?: Date;
  }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return {
        success: false,
        state: DangerousModeState.DISABLED,
        message: 'Session not found',
      };
    }

    if (session.state !== DangerousModeState.PENDING_CONFIRMATION) {
      return {
        success: false,
        state: session.state,
        message: 'No pending confirmation for this session',
      };
    }

    if (session.confirmationCode !== confirmationCode) {
      await this.auditDangerousAction('confirm_enable', sessionId, session.userId, 'blocked', {
        reason: 'invalid_confirmation_code',
        providedCode: confirmationCode,
      });
      
      return {
        success: false,
        state: session.state,
        message: 'Invalid confirmation code',
      };
    }

    return this.enableDangerousMode(sessionId, additionalParams);
  }

  /**
   * Enable dangerous mode
   */
  private async enableDangerousMode(
    sessionId: string,
    params?: { reason?: string }
  ): Promise<{
    success: boolean;
    state: DangerousModeState;
    message: string;
    expiresAt?: Date;
  }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return {
        success: false,
        state: DangerousModeState.DISABLED,
        message: 'Session not found',
      };
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.config.maxDuration);

    session.state = DangerousModeState.ENABLED;
    session.enabledAt = now;
    session.expiresAt = expiresAt;
    session.reason = params?.reason || session.reason;
    session.confirmationCode = undefined;
    session.activationCount++;
    session.lastActivation = now;
    session.commandsExecuted = 0;
    session.riskScore = 0;

    // Schedule automatic disable
    setTimeout(() => {
      this.disableDangerousMode(sessionId, 'timeout');
    }, this.config.maxDuration);

    await this.auditDangerousAction('enabled', sessionId, session.userId, 'success', {
      reason: session.reason,
      duration: this.config.maxDuration,
      expiresAt: expiresAt.toISOString(),
    });

    this.emit('dangerousModeEnabled', { sessionId, userId: session.userId, expiresAt });

    return {
      success: true,
      state: session.state,
      message: 'Dangerous mode enabled successfully',
      expiresAt,
    };
  }

  /**
   * Disable dangerous mode
   */
  async disableDangerousMode(
    sessionId: string,
    reason: 'user_request' | 'timeout' | 'emergency' | 'suspicious_activity' | 'admin_disable' = 'user_request'
  ): Promise<{
    success: boolean;
    state: DangerousModeState;
    message: string;
  }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return {
        success: false,
        state: DangerousModeState.DISABLED,
        message: 'Session not found',
      };
    }

    if (session.state !== DangerousModeState.ENABLED) {
      return {
        success: false,
        state: session.state,
        message: 'Dangerous mode is not currently enabled',
      };
    }

    const previousState = session.state;
    session.state = reason === 'emergency' ? DangerousModeState.SUSPENDED : DangerousModeState.COOLDOWN;
    session.enabledAt = undefined;
    session.expiresAt = undefined;

    // Set cooldown period
    if (session.state === DangerousModeState.COOLDOWN) {
      setTimeout(() => {
        if (session.state === DangerousModeState.COOLDOWN) {
          session.state = DangerousModeState.DISABLED;
        }
      }, this.config.cooldownPeriod);
    }

    await this.auditDangerousAction('disabled', sessionId, session.userId, 'success', {
      reason,
      previousState,
      commandsExecuted: session.commandsExecuted,
      finalRiskScore: session.riskScore,
    });

    this.emit('dangerousModeDisabled', { sessionId, userId: session.userId, reason });

    return {
      success: true,
      state: session.state,
      message: `Dangerous mode disabled (${reason})`,
    };
  }

  /**
   * Validate a command in dangerous mode
   */
  async validateDangerousCommand(
    sessionId: string,
    command: string,
    args: string[] = []
  ): Promise<{
    allowed: boolean;
    message: string;
    warnings: string[];
    riskIncrease: number;
  }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return {
        allowed: false,
        message: 'Session not found',
        warnings: [],
        riskIncrease: 0,
      };
    }

    if (session.state !== DangerousModeState.ENABLED) {
      return {
        allowed: false,
        message: 'Dangerous mode is not enabled',
        warnings: [],
        riskIncrease: 0,
      };
    }

    // Validate with command validator
    const validation = CommandValidator.validateCommand(command, args, {
      userId: session.userId,
      sessionId,
      dangerousModeEnabled: true,
      userRole: 'user', // This should come from session context
    });

    if (!validation.allowed) {
      await this.addWarning(session, {
        type: 'command_blocked',
        message: `Command blocked: ${validation.errors.join(', ')}`,
        severity: SecurityLevel.DANGEROUS,
        metadata: { command, args, errors: validation.errors },
      });

      return {
        allowed: false,
        message: validation.errors.join(', '),
        warnings: validation.warnings,
        riskIncrease: 0,
      };
    }

    // Calculate risk increase
    const riskIncrease = this.calculateCommandRisk(validation.classification.risk);
    session.riskScore += riskIncrease;
    session.commandsExecuted++;

    // Check if risk score exceeds threshold
    if (session.riskScore > this.config.maxRiskScore) {
      await this.disableDangerousMode(sessionId, 'suspicious_activity');
      
      return {
        allowed: false,
        message: 'Dangerous mode disabled due to high risk score',
        warnings: ['Risk score threshold exceeded'],
        riskIncrease,
      };
    }

    // Add warning if risk is increasing
    if (riskIncrease > 10) {
      await this.addWarning(session, {
        type: 'risk_increase',
        message: `High-risk command executed: ${command}`,
        severity: SecurityLevel.MODERATE,
        metadata: { command, args, riskIncrease, totalRisk: session.riskScore },
      });
    }

    await comprehensiveAuditLogger.logDangerousOperation({
      action: 'command_validated',
      command: `${command} ${args.join(' ')}`,
      resourceType: 'command',
      userId: session.userId,
      sessionId,
      outcome: 'success',
      details: {
        risk: validation.classification.risk,
        riskIncrease,
        totalRiskScore: session.riskScore,
        commandsExecuted: session.commandsExecuted,
      },
    });

    return {
      allowed: true,
      message: 'Command allowed',
      warnings: validation.warnings,
      riskIncrease,
    };
  }

  /**
   * Get session status
   */
  getSessionStatus(sessionId: string): DangerousModeSession | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Emergency disable all dangerous mode sessions
   */
  async emergencyDisableAll(reason: string): Promise<void> {
    this.emergencyStop = true;
    const affectedSessions: string[] = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.state === DangerousModeState.ENABLED) {
        await this.disableDangerousMode(sessionId, 'emergency');
        affectedSessions.push(sessionId);
      }
    }

    await comprehensiveAuditLogger.logSystemChange({
      action: 'emergency_disable_all',
      component: 'dangerous_mode',
      changes: { 
        emergencyStop: true, 
        reason,
        affectedSessions: affectedSessions.length,
      },
      userId: 'system',
      sessionId: 'emergency',
      outcome: 'success',
    });

    this.emit('emergencyDisableAll', { reason, affectedSessions });
  }

  /**
   * Clear emergency stop
   */
  async clearEmergencyStop(): Promise<void> {
    this.emergencyStop = false;
    
    await comprehensiveAuditLogger.logSystemChange({
      action: 'clear_emergency_stop',
      component: 'dangerous_mode',
      changes: { emergencyStop: false },
      userId: 'system',
      sessionId: 'emergency_clear',
      outcome: 'success',
    });

    this.emit('emergencyStopCleared');
  }

  // Private helper methods

  private createSession(sessionId: string, userId: string): DangerousModeSession {
    const session: DangerousModeSession = {
      sessionId,
      userId,
      state: DangerousModeState.DISABLED,
      activationCount: 0,
      warnings: [],
      commandsExecuted: 0,
      riskScore: 0,
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  private checkActivationLimits(session: DangerousModeSession): { allowed: boolean; message: string } {
    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // Reset count if last activation was more than an hour ago
    if (session.lastActivation && session.lastActivation < hourAgo) {
      session.activationCount = 0;
    }

    if (session.activationCount >= this.config.maxActivationsPerHour) {
      return {
        allowed: false,
        message: `Maximum activations per hour (${this.config.maxActivationsPerHour}) exceeded`,
      };
    }

    return { allowed: true, message: 'Activation allowed' };
  }

  private generateConfirmationCode(): string {
    return Math.random().toString(36).substr(2, 8).toUpperCase();
  }

  private calculateCommandRisk(risk: CommandRisk): number {
    switch (risk) {
      case CommandRisk.SAFE: return 1;
      case CommandRisk.MODERATE: return 5;
      case CommandRisk.DANGEROUS: return 15;
      case CommandRisk.CRITICAL: return 50;
      default: return 1;
    }
  }

  private async addWarning(session: DangerousModeSession, warning: Omit<DangerousWarning, 'id' | 'timestamp'>): Promise<void> {
    const fullWarning: DangerousWarning = {
      id: `warning_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      timestamp: new Date(),
      ...warning,
    };

    session.warnings.push(fullWarning);

    // Keep only last 10 warnings
    if (session.warnings.length > 10) {
      session.warnings = session.warnings.slice(-10);
    }

    this.emit('dangerousWarning', {
      sessionId: session.sessionId,
      userId: session.userId,
      warning: fullWarning,
    });
  }

  private async auditDangerousAction(
    action: string,
    sessionId: string,
    userId: string,
    outcome: 'success' | 'failure' | 'blocked' | 'pending_confirmation',
    details: Record<string, any>
  ): Promise<void> {
    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.DANGEROUS_OPERATIONS,
      action,
      resourceType: 'dangerous_mode',
      resourceId: sessionId,
      userId,
      sessionId,
      outcome: outcome === 'pending_confirmation' ? 'success' : outcome,
      severity: outcome === 'blocked' ? SecurityLevel.DANGEROUS : SecurityLevel.MODERATE,
      details,
    });
  }

  private startPeriodicCleanup(): void {
    setInterval(() => {
      const now = new Date();
      const sessionsToClean: string[] = [];

      for (const [sessionId, session] of this.sessions.entries()) {
        // Clean up expired sessions
        if (session.expiresAt && session.expiresAt < now) {
          this.disableDangerousMode(sessionId, 'timeout');
        }

        // Remove old disabled sessions
        if (session.state === DangerousModeState.DISABLED && 
            session.lastActivation && 
            now.getTime() - session.lastActivation.getTime() > 24 * 60 * 60 * 1000) {
          sessionsToClean.push(sessionId);
        }
      }

      // Clean up old sessions
      for (const sessionId of sessionsToClean) {
        this.sessions.delete(sessionId);
      }
    }, 60 * 1000); // Every minute
  }

  private startWarningSystem(): void {
    setInterval(() => {
      for (const [sessionId, session] of this.sessions.entries()) {
        if (session.state === DangerousModeState.ENABLED && session.expiresAt) {
          const timeUntilExpiry = session.expiresAt.getTime() - Date.now();
          
          // Warn at 5 minutes before expiry
          if (timeUntilExpiry <= 5 * 60 * 1000 && timeUntilExpiry > 4 * 60 * 1000) {
            this.addWarning(session, {
              type: 'timeout_warning',
              message: 'Dangerous mode will expire in 5 minutes',
              severity: SecurityLevel.MODERATE,
              metadata: { timeRemaining: timeUntilExpiry },
            });
          }
        }
      }
    }, 30 * 1000); // Every 30 seconds
  }
}

// Export singleton instance
export const dangerousModeController = new DangerousModeController();