import { securityNotificationService } from './notifications.js';
import { dangerousModeController } from './controller.js';
import { dangerousSecurityMonitor } from './monitoring.js';
import { dangerousTimeoutManager } from './timeout-manager.js';
import { autoDisableService } from './auto-disable.js';

/**
 * Integration service that connects all dangerous mode components
 * with the notification system for comprehensive security alerting
 */
export class DangerousModeIntegration {
  private initialized = false;

  /**
   * Initialize the integration between all dangerous mode components
   */
  initialize(): void {
    if (this.initialized) {
      return;
    }

    this.setupDangerousModeControllerIntegration();
    this.setupSecurityMonitorIntegration();
    this.setupTimeoutManagerIntegration();
    this.setupAutoDisableIntegration();

    this.initialized = true;
    console.log('✅ Dangerous mode integration initialized');
  }

  /**
   * Setup integration with dangerous mode controller
   */
  private setupDangerousModeControllerIntegration(): void {
    // Dangerous mode enabled
    dangerousModeController.on(
      'dangerousModeEnabled',
      async ({ sessionId, userId, expiresAt }) => {
        const session = dangerousModeController.getSessionStatus(sessionId);
        if (session) {
          await securityNotificationService.sendSessionChangeNotification(
            'dangerous_mode_enabled',
            session,
            {
              expiresAt: expiresAt?.toISOString(),
              activationCount: session.activationCount,
            }
          );
        }
      }
    );

    // Dangerous mode disabled
    dangerousModeController.on(
      'dangerousModeDisabled',
      async ({ sessionId, userId, reason }) => {
        const session = dangerousModeController.getSessionStatus(sessionId);
        if (session) {
          await securityNotificationService.sendSessionChangeNotification(
            'dangerous_mode_disabled',
            session,
            {
              disableReason: reason,
              finalRiskScore: session.riskScore,
              totalCommands: session.commandsExecuted,
              warningsGenerated: session.warnings.length,
            }
          );
        }
      }
    );

    // Dangerous warnings
    dangerousModeController.on(
      'dangerousWarning',
      async ({ sessionId, userId, warning }) => {
        if (warning.type === 'command_blocked') {
          await securityNotificationService.sendCommandBlockedNotification(
            warning.metadata.command,
            warning.message,
            userId,
            sessionId,
            {
              warningId: warning.id,
              warningType: warning.type,
              severity: warning.severity,
              metadata: warning.metadata,
            }
          );
        }
      }
    );

    // Confirmation required
    dangerousModeController.on(
      'confirmationRequired',
      async ({ sessionId, userId, confirmationCode }) => {
        // This could trigger a notification if needed
        console.log(
          `Confirmation required for session ${sessionId}: ${confirmationCode}`
        );
      }
    );

    // Emergency disable all
    dangerousModeController.on(
      'emergencyDisableAll',
      async ({ reason, affectedSessions }) => {
        await securityNotificationService.sendEmergencyDisableNotification(
          reason,
          affectedSessions
        );
      }
    );
  }

  /**
   * Setup integration with security monitor
   */
  private setupSecurityMonitorIntegration(): void {
    // Security alerts
    dangerousSecurityMonitor.on('securityAlert', async alert => {
      await securityNotificationService.sendSecurityAlert(alert);
    });

    // Alert acknowledged
    dangerousSecurityMonitor.on('alertAcknowledged', async alert => {
      // Log acknowledgment
      console.log(`Security alert ${alert.id} acknowledged`);
    });

    // Emergency disable triggered by monitor
    dangerousSecurityMonitor.on('emergencyDisable', async ({ reason }) => {
      await securityNotificationService.sendEmergencyDisableNotification(
        `Security monitor triggered: ${reason}`,
        []
      );
    });
  }

  /**
   * Setup integration with timeout manager
   */
  private setupTimeoutManagerIntegration(): void {
    // Timeout triggered
    dangerousTimeoutManager.on('timeoutTriggered', async event => {
      // Send timeout warning notification
      await securityNotificationService.sendTimeoutWarning(event);
    });

    // Timeout warning
    dangerousTimeoutManager.on(
      'timeoutWarning',
      async ({ sessionId, userId, warning }) => {
        // This is handled by timeoutTriggered event, but we could add specific logic here
        console.log(`Timeout warning for session ${sessionId}`);
      }
    );

    // Extension requires approval
    dangerousTimeoutManager.on(
      'extensionRequiresApproval',
      async ({ sessionId, userId, requestedDuration, reason }) => {
        // Send notification to admins about extension request
        await securityNotificationService.sendSecurityAlert({
          id: `ext_approval_${Date.now()}`,
          type: 'threshold_exceeded',
          severity: 'moderate',
          sessionId,
          userId,
          message: `Extension approval required for session ${sessionId}`,
          details: {
            requestedDuration,
            reason,
            requiresApproval: true,
          },
          timestamp: new Date(),
          action: 'warn',
          acknowledged: false,
        });
      }
    );

    // Session extended
    dangerousTimeoutManager.on(
      'sessionExtended',
      async ({ sessionId, userId, newExpiresAt, extensionDuration }) => {
        const session = dangerousModeController.getSessionStatus(sessionId);
        if (session) {
          await securityNotificationService.sendSessionChangeNotification(
            'dangerous_mode_enabled', // Treat as re-enabling
            session,
            {
              action: 'session_extended',
              newExpiresAt: newExpiresAt.toISOString(),
              extensionDuration,
              previousActivationCount: session.activationCount,
            }
          );
        }
      }
    );

    // Grace period started
    dangerousTimeoutManager.on(
      'gracePeriodStarted',
      async ({ sessionId, trigger, gracePeriod, metadata }) => {
        await securityNotificationService.sendTimeoutWarning({
          sessionId,
          userId: '', // Will be filled by the service
          trigger,
          remainingTime: gracePeriod,
          canExtend: true,
          warningLevel: 'moderate',
          metadata: {
            ...metadata,
            isGracePeriod: true,
          },
        });
      }
    );

    // Emergency disable all
    dangerousTimeoutManager.on('emergencyDisableAll', async ({ reason }) => {
      await securityNotificationService.sendEmergencyDisableNotification(
        `Timeout manager triggered: ${reason}`,
        []
      );
    });
  }

  /**
   * Setup integration with auto-disable service
   */
  private setupAutoDisableIntegration(): void {
    // Auto-disable triggered
    autoDisableService.on('autoDisableTriggered', async event => {
      await securityNotificationService.sendAutoDisableNotification(event);
    });

    // Auto-disable notifications could also trigger additional escalations
    autoDisableService.on('autoDisableTriggered', async event => {
      // If this is a critical auto-disable, send additional notifications
      if (
        event.severity === 'critical' ||
        event.trigger === 'privilege_escalation_attempt'
      ) {
        await securityNotificationService.sendEmergencyDisableNotification(
          `Critical auto-disable: ${event.trigger}`,
          [event.sessionId]
        );
      }
    });
  }

  /**
   * Register default notification recipients
   */
  registerDefaultRecipients(): void {
    // Register system admin recipient
    securityNotificationService.registerRecipient({
      id: 'system-admin',
      name: 'System Administrator',
      email: 'admin@vibecode.local',
      deliveryPreferences: {
        types: [
          'security_alert',
          'emergency_disable',
          'auto_disable',
          'suspicious_activity',
          'system_overload',
        ],
        methods: ['real_time', 'email', 'in_app'],
        minPriority: 'medium',
      },
      roles: ['admin'],
      isActive: true,
    });

    // Register security team recipient
    securityNotificationService.registerRecipient({
      id: 'security-team',
      name: 'Security Team',
      email: 'security@vibecode.local',
      deliveryPreferences: {
        types: [
          'security_alert',
          'emergency_disable',
          'auto_disable',
          'suspicious_activity',
          'risk_threshold_exceeded',
        ],
        methods: ['real_time', 'email', 'slack'],
        minPriority: 'high',
      },
      roles: ['admin', 'security'],
      isActive: true,
    });

    // Register development team recipient for less critical notifications
    securityNotificationService.registerRecipient({
      id: 'dev-team',
      name: 'Development Team',
      email: 'dev@vibecode.local',
      deliveryPreferences: {
        types: [
          'dangerous_mode_enabled',
          'dangerous_mode_disabled',
          'session_extended',
          'timeout_warning',
        ],
        methods: ['real_time', 'in_app'],
        minPriority: 'low',
        quietHours: { start: '18', end: '08' }, // After hours quiet time
      },
      roles: ['user', 'developer'],
      isActive: true,
    });
  }

  /**
   * Send a test notification for all integrated systems
   */
  async sendTestNotifications(): Promise<void> {
    try {
      // Test security alert
      await securityNotificationService.sendSecurityAlert({
        id: 'test_alert_' + Date.now(),
        type: 'pattern_detected',
        severity: 'moderate',
        sessionId: 'test-session',
        userId: 'test-user',
        message: 'Test security alert from integration system',
        details: {
          isTest: true,
          source: 'integration_test',
        },
        timestamp: new Date(),
        action: 'warn',
        acknowledged: false,
      });

      // Test timeout warning
      await securityNotificationService.sendTimeoutWarning({
        sessionId: 'test-session',
        userId: 'test-user',
        trigger: 'duration_exceeded',
        remainingTime: 5 * 60 * 1000, // 5 minutes
        canExtend: true,
        warningLevel: 'moderate',
        metadata: {
          isTest: true,
          source: 'integration_test',
        },
      });

      console.log('✅ Test notifications sent successfully');
    } catch (error) {
      console.error('❌ Failed to send test notifications:', error);
    }
  }

  /**
   * Get integration status
   */
  getStatus(): {
    initialized: boolean;
    componentsConnected: {
      controller: boolean;
      monitor: boolean;
      timeoutManager: boolean;
      autoDisable: boolean;
    };
    notificationService: {
      totalNotifications: number;
      activeRecipients: number;
    };
  } {
    const stats = securityNotificationService.getNotificationStats();

    return {
      initialized: this.initialized,
      componentsConnected: {
        controller:
          dangerousModeController.listenerCount('dangerousModeEnabled') > 0,
        monitor: dangerousSecurityMonitor.listenerCount('securityAlert') > 0,
        timeoutManager:
          dangerousTimeoutManager.listenerCount('timeoutTriggered') > 0,
        autoDisable:
          autoDisableService.listenerCount('autoDisableTriggered') > 0,
      },
      notificationService: {
        totalNotifications: stats.total,
        activeRecipients: 3, // Default recipients registered
      },
    };
  }
}

// Export singleton instance
export const dangerousModeIntegration = new DangerousModeIntegration();
