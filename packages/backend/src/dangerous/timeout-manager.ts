import { EventEmitter } from 'events';
import { SecurityLevel } from '../security/types.js';
import { dangerousModeController, DangerousModeSession, DangerousModeState } from './controller.js';
import { dangerousSecurityMonitor } from './monitoring.js';
import { comprehensiveAuditLogger, AuditCategory } from '../security/audit-logger.js';
import { SecurityWarningService, WarningType } from './warnings.js';

// Timeout trigger types
export enum TimeoutTrigger {
  DURATION_EXCEEDED = 'duration_exceeded',
  INACTIVITY = 'inactivity',
  RISK_THRESHOLD = 'risk_threshold',
  COMMAND_FREQUENCY = 'command_frequency',
  FAILED_COMMANDS = 'failed_commands',
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  SYSTEM_LOAD = 'system_load',
  EMERGENCY = 'emergency',
  ADMIN_OVERRIDE = 'admin_override'
}

// Timeout configuration
export interface TimeoutConfig {
  maxDuration: number; // milliseconds
  inactivityTimeout: number; // milliseconds
  maxRiskScore: number;
  maxCommandsPerMinute: number;
  maxFailedCommands: number;
  warningIntervals: number[]; // milliseconds before expiry to show warnings
  emergencyDisableEnabled: boolean;
  systemLoadThreshold: number; // CPU percentage
  gracePeriod: number; // milliseconds to allow user to extend session
}

// Timeout event
export interface TimeoutEvent {
  sessionId: string;
  userId: string;
  trigger: TimeoutTrigger;
  remainingTime: number;
  canExtend: boolean;
  warningLevel: SecurityLevel;
  metadata: Record<string, any>;
}

// Extension request
export interface ExtensionRequest {
  sessionId: string;
  userId: string;
  requestedDuration: number;
  reason: string;
  userRole: string;
}

const DEFAULT_CONFIG: TimeoutConfig = {
  maxDuration: 30 * 60 * 1000, // 30 minutes
  inactivityTimeout: 10 * 60 * 1000, // 10 minutes
  maxRiskScore: 100,
  maxCommandsPerMinute: 15,
  maxFailedCommands: 5,
  warningIntervals: [
    5 * 60 * 1000,  // 5 minutes
    2 * 60 * 1000,  // 2 minutes
    1 * 60 * 1000,  // 1 minute
    30 * 1000,      // 30 seconds
  ],
  emergencyDisableEnabled: true,
  systemLoadThreshold: 85,
  gracePeriod: 2 * 60 * 1000, // 2 minutes
};

export class DangerousTimeoutManager extends EventEmitter {
  private config: TimeoutConfig;
  private sessionTimers: Map<string, NodeJS.Timeout> = new Map();
  private inactivityTimers: Map<string, NodeJS.Timeout> = new Map();
  private warningTimers: Map<string, NodeJS.Timeout[]> = new Map();
  private lastActivity: Map<string, Date> = new Map();
  private extensionRequests: Map<string, ExtensionRequest> = new Map();
  private systemMonitorInterval?: NodeJS.Timeout;

  constructor(config: Partial<TimeoutConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.startSystemMonitoring();
    this.setupEventListeners();
  }

  /**
   * Start timeout management for a session
   */
  startTimeoutManagement(session: DangerousModeSession): void {
    if (session.state !== DangerousModeState.ENABLED || !session.expiresAt) {
      return;
    }

    this.clearTimeouts(session.sessionId);

    const remainingTime = session.expiresAt.getTime() - Date.now();
    
    // Set main timeout
    const mainTimeout = setTimeout(() => {
      this.triggerTimeout(session.sessionId, TimeoutTrigger.DURATION_EXCEEDED, {
        originalDuration: this.config.maxDuration,
        actualDuration: Date.now() - (session.enabledAt?.getTime() || Date.now()),
      });
    }, remainingTime);
    
    this.sessionTimers.set(session.sessionId, mainTimeout);

    // Set warning timers
    this.setupWarningTimers(session.sessionId, remainingTime);

    // Set inactivity timer
    this.startInactivityTimer(session.sessionId);

    // Track activity
    this.lastActivity.set(session.sessionId, new Date());
  }

  /**
   * Update activity timestamp for a session
   */
  updateActivity(sessionId: string): void {
    this.lastActivity.set(sessionId, new Date());
    
    // Restart inactivity timer
    this.startInactivityTimer(sessionId);
  }

  /**
   * Request session extension
   */
  async requestExtension(request: ExtensionRequest): Promise<{
    success: boolean;
    message: string;
    newExpiresAt?: Date;
    requiresApproval?: boolean;
  }> {
    const session = dangerousModeController.getSessionStatus(request.sessionId);
    if (!session || session.state !== DangerousModeState.ENABLED) {
      return {
        success: false,
        message: 'Session not found or not active',
      };
    }

    // Check if extension is allowed
    const extensionCheck = this.canExtendSession(session, request);
    if (!extensionCheck.allowed) {
      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.DANGEROUS_OPERATIONS,
        action: 'extension_denied',
        resourceType: 'dangerous_session',
        resourceId: request.sessionId,
        userId: request.userId,
        sessionId: request.sessionId,
        outcome: 'failure',
        severity: SecurityLevel.MODERATE,
        details: {
          reason: extensionCheck.reason,
          requestedDuration: request.requestedDuration,
          currentRiskScore: session.riskScore,
        },
      });

      return {
        success: false,
        message: extensionCheck.reason,
      };
    }

    // Admin approval required for long extensions
    if (request.requestedDuration > 15 * 60 * 1000 && request.userRole !== 'admin') {
      this.extensionRequests.set(request.sessionId, request);
      
      this.emit('extensionRequiresApproval', {
        sessionId: request.sessionId,
        userId: request.userId,
        requestedDuration: request.requestedDuration,
        reason: request.reason,
      });

      return {
        success: true,
        message: 'Extension request submitted for admin approval',
        requiresApproval: true,
      };
    }

    // Grant extension
    return this.grantExtension(request);
  }

  /**
   * Grant session extension
   */
  async grantExtension(request: ExtensionRequest): Promise<{
    success: boolean;
    message: string;
    newExpiresAt?: Date;
  }> {
    const session = dangerousModeController.getSessionStatus(request.sessionId);
    if (!session || session.state !== DangerousModeState.ENABLED) {
      return {
        success: false,
        message: 'Session not found or not active',
      };
    }

    const newExpiresAt = new Date(Date.now() + request.requestedDuration);
    session.expiresAt = newExpiresAt;

    // Restart timeout management with new duration
    this.startTimeoutManagement(session);

    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.DANGEROUS_OPERATIONS,
      action: 'session_extended',
      resourceType: 'dangerous_session',
      resourceId: request.sessionId,
      userId: request.userId,
      sessionId: request.sessionId,
      outcome: 'success',
      severity: SecurityLevel.MODERATE,
      details: {
        previousExpiresAt: session.expiresAt?.toISOString(),
        newExpiresAt: newExpiresAt.toISOString(),
        extensionDuration: request.requestedDuration,
        reason: request.reason,
      },
    });

    this.emit('sessionExtended', {
      sessionId: request.sessionId,
      userId: request.userId,
      newExpiresAt,
      extensionDuration: request.requestedDuration,
    });

    return {
      success: true,
      message: `Session extended until ${newExpiresAt.toLocaleString()}`,
      newExpiresAt,
    };
  }

  /**
   * Trigger automatic timeout
   */
  async triggerTimeout(
    sessionId: string, 
    trigger: TimeoutTrigger, 
    metadata: Record<string, any> = {}
  ): Promise<void> {
    const session = dangerousModeController.getSessionStatus(sessionId);
    if (!session || session.state !== DangerousModeState.ENABLED) {
      return;
    }

    const timeoutEvent: TimeoutEvent = {
      sessionId,
      userId: session.userId,
      trigger,
      remainingTime: session.expiresAt ? session.expiresAt.getTime() - Date.now() : 0,
      canExtend: this.canExtendSession(session, {
        sessionId,
        userId: session.userId,
        requestedDuration: 15 * 60 * 1000,
        reason: 'timeout_extension',
        userRole: 'user',
      }).allowed,
      warningLevel: this.getTimeoutSeverity(trigger),
      metadata,
    };

    // Emit timeout event
    this.emit('timeoutTriggered', timeoutEvent);

    // Provide grace period for critical triggers
    if (this.shouldProvideGracePeriod(trigger)) {
      await this.provideGracePeriod(sessionId, trigger, metadata);
      return;
    }

    // Disable dangerous mode
    const disableReason = this.mapTriggerToDisableReason(trigger);
    await dangerousModeController.disableDangerousMode(sessionId, disableReason);

    // Clean up timers
    this.clearTimeouts(sessionId);

    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.DANGEROUS_OPERATIONS,
      action: 'automatic_timeout',
      resourceType: 'dangerous_session',
      resourceId: sessionId,
      userId: session.userId,
      sessionId,
      outcome: 'success',
      severity: timeoutEvent.warningLevel,
      details: {
        trigger,
        remainingTime: timeoutEvent.remainingTime,
        metadata,
      },
    });
  }

  /**
   * Emergency disable all sessions
   */
  async emergencyDisableAll(reason: string): Promise<void> {
    if (!this.config.emergencyDisableEnabled) {
      return;
    }

    // Clear all timeouts
    for (const sessionId of this.sessionTimers.keys()) {
      this.clearTimeouts(sessionId);
    }

    // Trigger emergency disable through controller
    await dangerousModeController.emergencyDisableAll(reason);

    // Stop system monitoring temporarily
    if (this.systemMonitorInterval) {
      clearInterval(this.systemMonitorInterval);
      setTimeout(() => this.startSystemMonitoring(), 5 * 60 * 1000); // Resume after 5 minutes
    }

    this.emit('emergencyDisableAll', { reason });
  }

  /**
   * Get timeout status for a session
   */
  getTimeoutStatus(sessionId: string): {
    hasTimeout: boolean;
    remainingTime: number;
    inactivityTime: number;
    nextWarning: number;
    canExtend: boolean;
  } | null {
    const session = dangerousModeController.getSessionStatus(sessionId);
    if (!session || session.state !== DangerousModeState.ENABLED) {
      return null;
    }

    const remainingTime = session.expiresAt ? Math.max(0, session.expiresAt.getTime() - Date.now()) : 0;
    const lastActivity = this.lastActivity.get(sessionId);
    const inactivityTime = lastActivity ? Date.now() - lastActivity.getTime() : 0;

    // Find next warning
    let nextWarning = 0;
    for (const interval of this.config.warningIntervals) {
      if (remainingTime > interval) {
        nextWarning = interval;
        break;
      }
    }

    return {
      hasTimeout: this.sessionTimers.has(sessionId),
      remainingTime,
      inactivityTime,
      nextWarning,
      canExtend: this.canExtendSession(session, {
        sessionId,
        userId: session.userId,
        requestedDuration: 15 * 60 * 1000,
        reason: 'status_check',
        userRole: 'user',
      }).allowed,
    };
  }

  // Private methods

  private setupEventListeners(): void {
    // Listen for dangerous mode events
    dangerousModeController.on('dangerousModeEnabled', ({ sessionId }) => {
      const session = dangerousModeController.getSessionStatus(sessionId);
      if (session) {
        this.startTimeoutManagement(session);
      }
    });

    dangerousModeController.on('dangerousModeDisabled', ({ sessionId }) => {
      this.clearTimeouts(sessionId);
      this.lastActivity.delete(sessionId);
      this.extensionRequests.delete(sessionId);
    });

    // Listen for security monitoring events
    dangerousSecurityMonitor.on('securityAlert', (alert) => {
      if (alert.action === 'disable' || alert.action === 'emergency') {
        this.triggerTimeout(alert.sessionId, TimeoutTrigger.SUSPICIOUS_ACTIVITY, {
          alertId: alert.id,
          alertType: alert.type,
          severity: alert.severity,
        });
      }
    });
  }

  private setupWarningTimers(sessionId: string, remainingTime: number): void {
    const timers: NodeJS.Timeout[] = [];

    for (const interval of this.config.warningIntervals) {
      if (remainingTime > interval) {
        const warningTime = remainingTime - interval;
        const timer = setTimeout(() => {
          this.showTimeoutWarning(sessionId, interval);
        }, warningTime);
        timers.push(timer);
      }
    }

    this.warningTimers.set(sessionId, timers);
  }

  private startInactivityTimer(sessionId: string): void {
    // Clear existing inactivity timer
    const existingTimer = this.inactivityTimers.get(sessionId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new inactivity timer
    const timer = setTimeout(() => {
      this.triggerTimeout(sessionId, TimeoutTrigger.INACTIVITY, {
        inactivityDuration: this.config.inactivityTimeout,
      });
    }, this.config.inactivityTimeout);

    this.inactivityTimers.set(sessionId, timer);
  }

  private async showTimeoutWarning(sessionId: string, remainingTime: number): Promise<void> {
    const session = dangerousModeController.getSessionStatus(sessionId);
    if (!session) return;

    const warning = SecurityWarningService.generateTimeoutWarning({
      remainingTime,
      commandsExecuted: session.commandsExecuted,
      riskScore: session.riskScore,
    });

    this.emit('timeoutWarning', {
      sessionId,
      userId: session.userId,
      warning,
    });
  }

  private clearTimeouts(sessionId: string): void {
    // Clear main timeout
    const mainTimer = this.sessionTimers.get(sessionId);
    if (mainTimer) {
      clearTimeout(mainTimer);
      this.sessionTimers.delete(sessionId);
    }

    // Clear inactivity timer
    const inactivityTimer = this.inactivityTimers.get(sessionId);
    if (inactivityTimer) {
      clearTimeout(inactivityTimer);
      this.inactivityTimers.delete(sessionId);
    }

    // Clear warning timers
    const warningTimers = this.warningTimers.get(sessionId);
    if (warningTimers) {
      for (const timer of warningTimers) {
        clearTimeout(timer);
      }
      this.warningTimers.delete(sessionId);
    }
  }

  private canExtendSession(
    session: DangerousModeSession, 
    request: Partial<ExtensionRequest>
  ): { allowed: boolean; reason: string } {
    // Check activation count
    if (session.activationCount >= 3) {
      return { allowed: false, reason: 'Maximum daily activations exceeded' };
    }

    // Check risk score
    if (session.riskScore > this.config.maxRiskScore * 0.8) {
      return { allowed: false, reason: 'Risk score too high for extension' };
    }

    // Check if too many extensions already granted
    const maxExtensions = 2;
    if (session.activationCount > maxExtensions) {
      return { allowed: false, reason: 'Maximum extensions per session exceeded' };
    }

    // Check requested duration
    const maxExtensionDuration = 30 * 60 * 1000; // 30 minutes
    if (request.requestedDuration && request.requestedDuration > maxExtensionDuration) {
      return { allowed: false, reason: 'Requested extension duration too long' };
    }

    return { allowed: true, reason: 'Extension allowed' };
  }

  private shouldProvideGracePeriod(trigger: TimeoutTrigger): boolean {
    return [
      TimeoutTrigger.DURATION_EXCEEDED,
      TimeoutTrigger.INACTIVITY,
    ].includes(trigger);
  }

  private async provideGracePeriod(
    sessionId: string, 
    trigger: TimeoutTrigger, 
    metadata: Record<string, any>
  ): Promise<void> {
    this.emit('gracePeriodStarted', {
      sessionId,
      trigger,
      gracePeriod: this.config.gracePeriod,
      metadata,
    });

    // Wait for grace period
    setTimeout(async () => {
      // Check if user has taken action during grace period
      const session = dangerousModeController.getSessionStatus(sessionId);
      if (!session || session.state !== DangerousModeState.ENABLED) {
        return; // Already disabled
      }

      // If no action taken, disable
      const disableReason = this.mapTriggerToDisableReason(trigger);
      await dangerousModeController.disableDangerousMode(sessionId, disableReason);
      this.clearTimeouts(sessionId);
    }, this.config.gracePeriod);
  }

  private mapTriggerToDisableReason(trigger: TimeoutTrigger): 'timeout' | 'suspicious_activity' | 'emergency' {
    switch (trigger) {
      case TimeoutTrigger.SUSPICIOUS_ACTIVITY:
      case TimeoutTrigger.RISK_THRESHOLD:
      case TimeoutTrigger.COMMAND_FREQUENCY:
      case TimeoutTrigger.FAILED_COMMANDS:
        return 'suspicious_activity';
      case TimeoutTrigger.EMERGENCY:
      case TimeoutTrigger.SYSTEM_LOAD:
        return 'emergency';
      default:
        return 'timeout';
    }
  }

  private getTimeoutSeverity(trigger: TimeoutTrigger): SecurityLevel {
    switch (trigger) {
      case TimeoutTrigger.EMERGENCY:
      case TimeoutTrigger.SYSTEM_LOAD:
        return SecurityLevel.CRITICAL;
      case TimeoutTrigger.SUSPICIOUS_ACTIVITY:
      case TimeoutTrigger.RISK_THRESHOLD:
        return SecurityLevel.DANGEROUS;
      case TimeoutTrigger.COMMAND_FREQUENCY:
      case TimeoutTrigger.FAILED_COMMANDS:
        return SecurityLevel.MODERATE;
      default:
        return SecurityLevel.SAFE;
    }
  }

  private startSystemMonitoring(): void {
    this.systemMonitorInterval = setInterval(async () => {
      // Monitor system load
      const systemLoad = await this.getSystemLoad();
      if (systemLoad > this.config.systemLoadThreshold) {
        await this.emergencyDisableAll(`High system load: ${systemLoad}%`);
      }

      // Monitor sessions for various triggers
      for (const [sessionId] of this.sessionTimers.entries()) {
        const session = dangerousModeController.getSessionStatus(sessionId);
        if (!session || session.state !== DangerousModeState.ENABLED) {
          continue;
        }

        // Check risk score
        if (session.riskScore > this.config.maxRiskScore) {
          await this.triggerTimeout(sessionId, TimeoutTrigger.RISK_THRESHOLD, {
            riskScore: session.riskScore,
            threshold: this.config.maxRiskScore,
          });
        }

        // Check command frequency
        const lastActivity = this.lastActivity.get(sessionId);
        if (lastActivity) {
          const timeSinceLastActivity = Date.now() - lastActivity.getTime();
          const commandsPerMinute = session.commandsExecuted / (timeSinceLastActivity / 60000);
          
          if (commandsPerMinute > this.config.maxCommandsPerMinute) {
            await this.triggerTimeout(sessionId, TimeoutTrigger.COMMAND_FREQUENCY, {
              commandsPerMinute,
              threshold: this.config.maxCommandsPerMinute,
            });
          }
        }
      }
    }, 30 * 1000); // Check every 30 seconds
  }

  private async getSystemLoad(): Promise<number> {
    // In a real implementation, this would get actual system load
    // For now, return a mock value
    return Math.random() * 100;
  }
}

// Export singleton instance
export const dangerousTimeoutManager = new DangerousTimeoutManager();