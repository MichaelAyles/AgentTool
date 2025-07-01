import { EventEmitter } from 'events';
import { SecurityLevel, SecurityEventType } from '../security/types.js';
import { comprehensiveAuditLogger, AuditCategory } from '../security/audit-logger.js';
import { DangerousModeSession } from './controller.js';
import { MonitoringAlert } from './monitoring.js';
import { AutoDisableEvent } from './auto-disable.js';
import { TimeoutEvent } from './timeout-manager.js';

// Notification types
export enum NotificationType {
  SECURITY_ALERT = 'security_alert',
  TIMEOUT_WARNING = 'timeout_warning',
  AUTO_DISABLE = 'auto_disable',
  EMERGENCY_DISABLE = 'emergency_disable',
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  RISK_THRESHOLD_EXCEEDED = 'risk_threshold_exceeded',
  SESSION_EXTENDED = 'session_extended',
  DANGEROUS_MODE_ENABLED = 'dangerous_mode_enabled',
  DANGEROUS_MODE_DISABLED = 'dangerous_mode_disabled',
  COMMAND_BLOCKED = 'command_blocked',
  SYSTEM_OVERLOAD = 'system_overload'
}

// Notification delivery methods
export enum DeliveryMethod {
  REAL_TIME = 'real_time',        // WebSocket/SSE
  EMAIL = 'email',                // Email notifications
  SMS = 'sms',                    // SMS alerts
  SLACK = 'slack',                // Slack integration
  WEBHOOK = 'webhook',            // Custom webhook
  IN_APP = 'in_app',             // In-application notifications
  DESKTOP = 'desktop',            // Desktop notifications
  PUSH = 'push'                   // Push notifications
}

// Notification priority levels
export enum NotificationPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
  EMERGENCY = 'emergency'
}

// Notification configuration
export interface NotificationConfig {
  type: NotificationType;
  enabled: boolean;
  deliveryMethods: DeliveryMethod[];
  priority: NotificationPriority;
  throttleMs: number; // Minimum time between same notifications
  escalationDelayMs: number; // Time before escalating unacknowledged notifications
  autoAcknowledge: boolean;
  customTemplate?: string;
  customRecipients?: string[];
}

// Notification message
export interface NotificationMessage {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  details: Record<string, any>;
  priority: NotificationPriority;
  severity: SecurityLevel;
  timestamp: Date;
  userId?: string;
  sessionId?: string;
  acknowledged: boolean;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
  deliveryMethods: DeliveryMethod[];
  deliveryStatus: Record<DeliveryMethod, 'pending' | 'sent' | 'delivered' | 'failed'>;
  escalated: boolean;
  escalatedAt?: Date;
  expiresAt?: Date;
}

// Notification recipient
export interface NotificationRecipient {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  slackUserId?: string;
  webhookUrl?: string;
  deliveryPreferences: {
    types: NotificationType[];
    methods: DeliveryMethod[];
    minPriority: NotificationPriority;
    quietHours?: { start: string; end: string };
    timezone?: string;
  };
  roles: string[];
  isActive: boolean;
}

// Notification template
export interface NotificationTemplate {
  type: NotificationType;
  title: string;
  messageTemplate: string;
  emailTemplate?: string;
  smsTemplate?: string;
  variables: string[];
}

const DEFAULT_CONFIGS: Record<NotificationType, Omit<NotificationConfig, 'type'>> = {
  [NotificationType.SECURITY_ALERT]: {
    enabled: true,
    deliveryMethods: [DeliveryMethod.REAL_TIME, DeliveryMethod.EMAIL],
    priority: NotificationPriority.HIGH,
    throttleMs: 30000, // 30 seconds
    escalationDelayMs: 5 * 60 * 1000, // 5 minutes
    autoAcknowledge: false,
  },
  [NotificationType.TIMEOUT_WARNING]: {
    enabled: true,
    deliveryMethods: [DeliveryMethod.REAL_TIME, DeliveryMethod.IN_APP],
    priority: NotificationPriority.MEDIUM,
    throttleMs: 60000, // 1 minute
    escalationDelayMs: 2 * 60 * 1000, // 2 minutes
    autoAcknowledge: true,
  },
  [NotificationType.AUTO_DISABLE]: {
    enabled: true,
    deliveryMethods: [DeliveryMethod.REAL_TIME, DeliveryMethod.EMAIL, DeliveryMethod.SLACK],
    priority: NotificationPriority.HIGH,
    throttleMs: 10000, // 10 seconds
    escalationDelayMs: 3 * 60 * 1000, // 3 minutes
    autoAcknowledge: false,
  },
  [NotificationType.EMERGENCY_DISABLE]: {
    enabled: true,
    deliveryMethods: [DeliveryMethod.REAL_TIME, DeliveryMethod.EMAIL, DeliveryMethod.SMS, DeliveryMethod.SLACK],
    priority: NotificationPriority.EMERGENCY,
    throttleMs: 0, // No throttling for emergencies
    escalationDelayMs: 1 * 60 * 1000, // 1 minute
    autoAcknowledge: false,
  },
  [NotificationType.SUSPICIOUS_ACTIVITY]: {
    enabled: true,
    deliveryMethods: [DeliveryMethod.REAL_TIME, DeliveryMethod.EMAIL],
    priority: NotificationPriority.HIGH,
    throttleMs: 60000, // 1 minute
    escalationDelayMs: 10 * 60 * 1000, // 10 minutes
    autoAcknowledge: false,
  },
  [NotificationType.RISK_THRESHOLD_EXCEEDED]: {
    enabled: true,
    deliveryMethods: [DeliveryMethod.REAL_TIME, DeliveryMethod.IN_APP],
    priority: NotificationPriority.MEDIUM,
    throttleMs: 120000, // 2 minutes
    escalationDelayMs: 15 * 60 * 1000, // 15 minutes
    autoAcknowledge: true,
  },
  [NotificationType.SESSION_EXTENDED]: {
    enabled: true,
    deliveryMethods: [DeliveryMethod.REAL_TIME, DeliveryMethod.EMAIL],
    priority: NotificationPriority.MEDIUM,
    throttleMs: 300000, // 5 minutes
    escalationDelayMs: 30 * 60 * 1000, // 30 minutes
    autoAcknowledge: true,
  },
  [NotificationType.DANGEROUS_MODE_ENABLED]: {
    enabled: true,
    deliveryMethods: [DeliveryMethod.REAL_TIME, DeliveryMethod.EMAIL],
    priority: NotificationPriority.MEDIUM,
    throttleMs: 60000, // 1 minute
    escalationDelayMs: 20 * 60 * 1000, // 20 minutes
    autoAcknowledge: true,
  },
  [NotificationType.DANGEROUS_MODE_DISABLED]: {
    enabled: true,
    deliveryMethods: [DeliveryMethod.REAL_TIME, DeliveryMethod.IN_APP],
    priority: NotificationPriority.LOW,
    throttleMs: 60000, // 1 minute
    escalationDelayMs: 60 * 60 * 1000, // 1 hour
    autoAcknowledge: true,
  },
  [NotificationType.COMMAND_BLOCKED]: {
    enabled: true,
    deliveryMethods: [DeliveryMethod.REAL_TIME, DeliveryMethod.IN_APP],
    priority: NotificationPriority.MEDIUM,
    throttleMs: 30000, // 30 seconds
    escalationDelayMs: 10 * 60 * 1000, // 10 minutes
    autoAcknowledge: true,
  },
  [NotificationType.SYSTEM_OVERLOAD]: {
    enabled: true,
    deliveryMethods: [DeliveryMethod.REAL_TIME, DeliveryMethod.EMAIL, DeliveryMethod.SMS],
    priority: NotificationPriority.CRITICAL,
    throttleMs: 120000, // 2 minutes
    escalationDelayMs: 5 * 60 * 1000, // 5 minutes
    autoAcknowledge: false,
  },
};

export class SecurityNotificationService extends EventEmitter {
  private configurations: Map<NotificationType, NotificationConfig> = new Map();
  private notifications: Map<string, NotificationMessage> = new Map();
  private recipients: Map<string, NotificationRecipient> = new Map();
  private templates: Map<NotificationType, NotificationTemplate> = new Map();
  private throttleTracker: Map<string, Date> = new Map();
  private escalationTimers: Map<string, NodeJS.Timeout> = new Map();
  private deliveryHandlers: Map<DeliveryMethod, (message: NotificationMessage, recipient?: NotificationRecipient) => Promise<boolean>> = new Map();

  constructor() {
    super();
    this.initializeDefaultConfigurations();
    this.initializeDefaultTemplates();
    this.setupDeliveryHandlers();
    this.startCleanupProcess();
  }

  /**
   * Send a security alert notification
   */
  async sendSecurityAlert(alert: MonitoringAlert): Promise<void> {
    const notification = await this.createNotification({
      type: NotificationType.SECURITY_ALERT,
      title: '🚨 Security Alert',
      message: alert.message,
      details: {
        alertId: alert.id,
        alertType: alert.type,
        severity: alert.severity,
        sessionId: alert.sessionId,
        userId: alert.userId,
        action: alert.action,
        ...alert.details,
      },
      priority: this.mapSeverityToPriority(alert.severity),
      severity: alert.severity,
      userId: alert.userId,
      sessionId: alert.sessionId,
    });

    await this.deliverNotification(notification);
  }

  /**
   * Send a timeout warning notification
   */
  async sendTimeoutWarning(event: TimeoutEvent): Promise<void> {
    const notification = await this.createNotification({
      type: NotificationType.TIMEOUT_WARNING,
      title: '⏰ Session Timeout Warning',
      message: `Your dangerous mode session will expire in ${Math.round(event.remainingTime / 60000)} minutes`,
      details: {
        remainingTime: event.remainingTime,
        trigger: event.trigger,
        canExtend: event.canExtend,
        ...event.metadata,
      },
      priority: this.mapSeverityToPriority(event.warningLevel),
      severity: event.warningLevel,
      userId: event.userId,
      sessionId: event.sessionId,
    });

    await this.deliverNotification(notification);
  }

  /**
   * Send an auto-disable notification
   */
  async sendAutoDisableNotification(event: AutoDisableEvent): Promise<void> {
    const notification = await this.createNotification({
      type: NotificationType.AUTO_DISABLE,
      title: '🛑 Dangerous Mode Auto-Disabled',
      message: `Dangerous mode was automatically disabled: ${event.trigger}`,
      details: {
        trigger: event.trigger,
        evidence: event.evidence,
        canAppeal: event.canAppeal,
        appealDeadline: event.appealDeadline,
      },
      priority: this.mapSeverityToPriority(event.severity),
      severity: event.severity,
      userId: event.userId,
      sessionId: event.sessionId,
    });

    await this.deliverNotification(notification);
  }

  /**
   * Send an emergency disable notification
   */
  async sendEmergencyDisableNotification(reason: string, affectedSessions: string[]): Promise<void> {
    const notification = await this.createNotification({
      type: NotificationType.EMERGENCY_DISABLE,
      title: '🚨 EMERGENCY: All Dangerous Mode Sessions Disabled',
      message: `Emergency disable triggered: ${reason}`,
      details: {
        reason,
        affectedSessions,
        timestamp: new Date().toISOString(),
      },
      priority: NotificationPriority.EMERGENCY,
      severity: SecurityLevel.CRITICAL,
    });

    // Send to all admin users
    const adminRecipients = Array.from(this.recipients.values())
      .filter(r => r.roles.includes('admin') && r.isActive);

    for (const recipient of adminRecipients) {
      await this.deliverToRecipient(notification, recipient);
    }
  }

  /**
   * Send a dangerous mode session change notification
   */
  async sendSessionChangeNotification(
    type: NotificationType.DANGEROUS_MODE_ENABLED | NotificationType.DANGEROUS_MODE_DISABLED,
    session: DangerousModeSession,
    details: Record<string, any> = {}
  ): Promise<void> {
    const isEnabled = type === NotificationType.DANGEROUS_MODE_ENABLED;
    
    const notification = await this.createNotification({
      type,
      title: isEnabled ? '🔓 Dangerous Mode Enabled' : '🔒 Dangerous Mode Disabled',
      message: isEnabled 
        ? `Dangerous mode enabled for session ${session.sessionId}`
        : `Dangerous mode disabled for session ${session.sessionId}`,
      details: {
        sessionId: session.sessionId,
        userId: session.userId,
        reason: session.reason,
        riskScore: session.riskScore,
        commandsExecuted: session.commandsExecuted,
        ...details,
      },
      priority: NotificationPriority.MEDIUM,
      severity: SecurityLevel.MODERATE,
      userId: session.userId,
      sessionId: session.sessionId,
    });

    await this.deliverNotification(notification);
  }

  /**
   * Send a command blocked notification
   */
  async sendCommandBlockedNotification(
    command: string,
    reason: string,
    userId: string,
    sessionId: string,
    details: Record<string, any> = {}
  ): Promise<void> {
    const notification = await this.createNotification({
      type: NotificationType.COMMAND_BLOCKED,
      title: '🚫 Command Blocked',
      message: `Command "${command}" was blocked: ${reason}`,
      details: {
        command,
        reason,
        ...details,
      },
      priority: NotificationPriority.MEDIUM,
      severity: SecurityLevel.MODERATE,
      userId,
      sessionId,
    });

    await this.deliverNotification(notification);
  }

  /**
   * Acknowledge a notification
   */
  async acknowledgeNotification(notificationId: string, acknowledgedBy: string): Promise<boolean> {
    const notification = this.notifications.get(notificationId);
    if (!notification || notification.acknowledged) {
      return false;
    }

    notification.acknowledged = true;
    notification.acknowledgedAt = new Date();
    notification.acknowledgedBy = acknowledgedBy;

    // Cancel escalation timer
    const escalationTimer = this.escalationTimers.get(notificationId);
    if (escalationTimer) {
      clearTimeout(escalationTimer);
      this.escalationTimers.delete(notificationId);
    }

    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SECURITY_EVENTS,
      action: 'notification_acknowledged',
      resourceType: 'security_notification',
      resourceId: notificationId,
      userId: acknowledgedBy,
      outcome: 'success',
      severity: SecurityLevel.SAFE,
      details: {
        notificationType: notification.type,
        originalSeverity: notification.severity,
        acknowledgedAt: notification.acknowledgedAt?.toISOString(),
      },
    });

    this.emit('notificationAcknowledged', notification);
    return true;
  }

  /**
   * Get notifications for a user
   */
  getNotificationsForUser(
    userId: string,
    options: {
      includeAcknowledged?: boolean;
      limit?: number;
      sinceTimestamp?: Date;
      types?: NotificationType[];
    } = {}
  ): NotificationMessage[] {
    const {
      includeAcknowledged = false,
      limit = 50,
      sinceTimestamp,
      types,
    } = options;

    let notifications = Array.from(this.notifications.values())
      .filter(n => n.userId === userId || !n.userId); // Include global notifications

    if (!includeAcknowledged) {
      notifications = notifications.filter(n => !n.acknowledged);
    }

    if (sinceTimestamp) {
      notifications = notifications.filter(n => n.timestamp >= sinceTimestamp);
    }

    if (types && types.length > 0) {
      notifications = notifications.filter(n => types.includes(n.type));
    }

    // Sort by priority and timestamp
    notifications.sort((a, b) => {
      const priorityOrder = {
        [NotificationPriority.EMERGENCY]: 5,
        [NotificationPriority.CRITICAL]: 4,
        [NotificationPriority.HIGH]: 3,
        [NotificationPriority.MEDIUM]: 2,
        [NotificationPriority.LOW]: 1,
      };
      
      const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
      if (priorityDiff !== 0) return priorityDiff;
      
      return b.timestamp.getTime() - a.timestamp.getTime();
    });

    return notifications.slice(0, limit);
  }

  /**
   * Get notification statistics
   */
  getNotificationStats(): {
    total: number;
    unacknowledged: number;
    byType: Record<NotificationType, number>;
    byPriority: Record<NotificationPriority, number>;
    recentCount: number; // Last 24 hours
  } {
    const notifications = Array.from(this.notifications.values());
    const recent24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const byType = Object.values(NotificationType).reduce((acc, type) => {
      acc[type] = notifications.filter(n => n.type === type).length;
      return acc;
    }, {} as Record<NotificationType, number>);

    const byPriority = Object.values(NotificationPriority).reduce((acc, priority) => {
      acc[priority] = notifications.filter(n => n.priority === priority).length;
      return acc;
    }, {} as Record<NotificationPriority, number>);

    return {
      total: notifications.length,
      unacknowledged: notifications.filter(n => !n.acknowledged).length,
      byType,
      byPriority,
      recentCount: notifications.filter(n => n.timestamp >= recent24h).length,
    };
  }

  /**
   * Register a notification recipient
   */
  registerRecipient(recipient: NotificationRecipient): void {
    this.recipients.set(recipient.id, recipient);
  }

  /**
   * Update notification configuration
   */
  updateConfiguration(type: NotificationType, config: Partial<NotificationConfig>): void {
    const existing = this.configurations.get(type);
    if (existing) {
      this.configurations.set(type, { ...existing, ...config });
    }
  }

  // Private methods

  private async createNotification(params: {
    type: NotificationType;
    title: string;
    message: string;
    details: Record<string, any>;
    priority: NotificationPriority;
    severity: SecurityLevel;
    userId?: string;
    sessionId?: string;
  }): Promise<NotificationMessage> {
    const config = this.configurations.get(params.type)!;
    const notificationId = `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Check throttling
    const throttleKey = `${params.type}_${params.userId || 'global'}`;
    const lastNotification = this.throttleTracker.get(throttleKey);
    if (lastNotification && Date.now() - lastNotification.getTime() < config.throttleMs) {
      throw new Error(`Notification throttled: ${params.type}`);
    }

    const notification: NotificationMessage = {
      id: notificationId,
      type: params.type,
      title: params.title,
      message: params.message,
      details: params.details,
      priority: params.priority,
      severity: params.severity,
      timestamp: new Date(),
      userId: params.userId,
      sessionId: params.sessionId,
      acknowledged: false,
      deliveryMethods: config.deliveryMethods,
      deliveryStatus: config.deliveryMethods.reduce((acc, method) => {
        acc[method] = 'pending';
        return acc;
      }, {} as Record<DeliveryMethod, 'pending' | 'sent' | 'delivered' | 'failed'>),
      escalated: false,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    };

    this.notifications.set(notificationId, notification);
    this.throttleTracker.set(throttleKey, new Date());

    // Set up escalation timer if not auto-acknowledged
    if (!config.autoAcknowledge && config.escalationDelayMs > 0) {
      const escalationTimer = setTimeout(() => {
        this.escalateNotification(notification);
      }, config.escalationDelayMs);
      
      this.escalationTimers.set(notificationId, escalationTimer);
    } else if (config.autoAcknowledge) {
      // Auto-acknowledge after a short delay
      setTimeout(() => {
        this.acknowledgeNotification(notificationId, 'system');
      }, 5000);
    }

    return notification;
  }

  private async deliverNotification(notification: NotificationMessage): Promise<void> {
    // Find relevant recipients
    const recipients = Array.from(this.recipients.values()).filter(recipient => {
      if (!recipient.isActive) return false;
      
      // Check if recipient wants this type of notification
      if (!recipient.deliveryPreferences.types.includes(notification.type)) return false;
      
      // Check minimum priority
      const priorityOrder = {
        [NotificationPriority.LOW]: 1,
        [NotificationPriority.MEDIUM]: 2,
        [NotificationPriority.HIGH]: 3,
        [NotificationPriority.CRITICAL]: 4,
        [NotificationPriority.EMERGENCY]: 5,
      };
      
      const notificationPriorityLevel = priorityOrder[notification.priority];
      const recipientMinPriority = priorityOrder[recipient.deliveryPreferences.minPriority];
      
      if (notificationPriorityLevel < recipientMinPriority) return false;
      
      // Check quiet hours
      if (recipient.deliveryPreferences.quietHours) {
        const now = new Date();
        const currentHour = now.getHours();
        const quietStart = parseInt(recipient.deliveryPreferences.quietHours.start);
        const quietEnd = parseInt(recipient.deliveryPreferences.quietHours.end);
        
        // Skip quiet hours for non-emergency notifications
        if (notification.priority !== NotificationPriority.EMERGENCY && 
            currentHour >= quietStart && currentHour < quietEnd) {
          return false;
        }
      }
      
      return true;
    });

    // Deliver to specific user if notification is user-specific
    if (notification.userId) {
      const userRecipient = recipients.find(r => r.id === notification.userId);
      if (userRecipient) {
        await this.deliverToRecipient(notification, userRecipient);
      }
    } else {
      // Deliver to all relevant recipients
      for (const recipient of recipients) {
        await this.deliverToRecipient(notification, recipient);
      }
    }

    // Always deliver real-time notifications
    await this.deliverRealTime(notification);
  }

  private async deliverToRecipient(notification: NotificationMessage, recipient: NotificationRecipient): Promise<void> {
    const relevantMethods = notification.deliveryMethods.filter(method =>
      recipient.deliveryPreferences.methods.includes(method)
    );

    for (const method of relevantMethods) {
      const handler = this.deliveryHandlers.get(method);
      if (handler) {
        try {
          const success = await handler(notification, recipient);
          notification.deliveryStatus[method] = success ? 'delivered' : 'failed';
        } catch (error) {
          console.error(`Failed to deliver notification via ${method}:`, error);
          notification.deliveryStatus[method] = 'failed';
        }
      }
    }
  }

  private async deliverRealTime(notification: NotificationMessage): Promise<void> {
    // Emit for real-time listeners (WebSocket/SSE)
    this.emit('realTimeNotification', notification);
    notification.deliveryStatus[DeliveryMethod.REAL_TIME] = 'delivered';
  }

  private async escalateNotification(notification: NotificationMessage): Promise<void> {
    if (notification.acknowledged || notification.escalated) return;

    notification.escalated = true;
    notification.escalatedAt = new Date();

    // Create escalation notification
    const escalationNotification = await this.createNotification({
      type: NotificationType.SECURITY_ALERT,
      title: '⚠️ Unacknowledged Security Notification',
      message: `Security notification "${notification.title}" requires acknowledgment`,
      details: {
        originalNotificationId: notification.id,
        originalType: notification.type,
        originalTimestamp: notification.timestamp.toISOString(),
        escalationReason: 'unacknowledged_timeout',
      },
      priority: NotificationPriority.HIGH,
      severity: SecurityLevel.DANGEROUS,
      userId: notification.userId,
      sessionId: notification.sessionId,
    });

    await this.deliverNotification(escalationNotification);
  }

  private mapSeverityToPriority(severity: SecurityLevel): NotificationPriority {
    switch (severity) {
      case SecurityLevel.SAFE: return NotificationPriority.LOW;
      case SecurityLevel.MODERATE: return NotificationPriority.MEDIUM;
      case SecurityLevel.DANGEROUS: return NotificationPriority.HIGH;
      case SecurityLevel.CRITICAL: return NotificationPriority.CRITICAL;
      default: return NotificationPriority.MEDIUM;
    }
  }

  private initializeDefaultConfigurations(): void {
    for (const [type, config] of Object.entries(DEFAULT_CONFIGS)) {
      this.configurations.set(type as NotificationType, {
        type: type as NotificationType,
        ...config,
      });
    }
  }

  private initializeDefaultTemplates(): void {
    // Initialize default notification templates
    // This would be expanded with proper template engine integration
    const templates: NotificationTemplate[] = [
      {
        type: NotificationType.SECURITY_ALERT,
        title: 'Security Alert: {{alertType}}',
        messageTemplate: 'A security alert was triggered: {{message}}. Session: {{sessionId}}',
        variables: ['alertType', 'message', 'sessionId', 'userId'],
      },
      {
        type: NotificationType.TIMEOUT_WARNING,
        title: 'Session Timeout Warning',
        messageTemplate: 'Your dangerous mode session will expire in {{remainingTime}} minutes.',
        variables: ['remainingTime', 'sessionId'],
      },
      // Add more templates as needed
    ];

    for (const template of templates) {
      this.templates.set(template.type, template);
    }
  }

  private setupDeliveryHandlers(): void {
    // Real-time delivery (handled by emit)
    this.deliveryHandlers.set(DeliveryMethod.REAL_TIME, async (notification) => {
      this.emit('realTimeNotification', notification);
      return true;
    });

    // In-app delivery (stored for UI pickup)
    this.deliveryHandlers.set(DeliveryMethod.IN_APP, async (notification) => {
      this.emit('inAppNotification', notification);
      return true;
    });

    // Email delivery (mock implementation)
    this.deliveryHandlers.set(DeliveryMethod.EMAIL, async (notification, recipient) => {
      console.log(`📧 Email notification sent to ${recipient?.email}: ${notification.title}`);
      return true;
    });

    // SMS delivery (mock implementation)
    this.deliveryHandlers.set(DeliveryMethod.SMS, async (notification, recipient) => {
      console.log(`📱 SMS notification sent to ${recipient?.phone}: ${notification.title}`);
      return true;
    });

    // Slack delivery (mock implementation)
    this.deliveryHandlers.set(DeliveryMethod.SLACK, async (notification, recipient) => {
      console.log(`💬 Slack notification sent to ${recipient?.slackUserId}: ${notification.title}`);
      return true;
    });

    // Webhook delivery (mock implementation)
    this.deliveryHandlers.set(DeliveryMethod.WEBHOOK, async (notification, recipient) => {
      console.log(`🔗 Webhook notification sent to ${recipient?.webhookUrl}: ${notification.title}`);
      return true;
    });
  }

  private startCleanupProcess(): void {
    // Clean up old notifications every hour
    setInterval(() => {
      const now = new Date();
      const notificationsToDelete: string[] = [];

      for (const [id, notification] of this.notifications.entries()) {
        if (notification.expiresAt && notification.expiresAt < now) {
          notificationsToDelete.push(id);
        }
      }

      for (const id of notificationsToDelete) {
        this.notifications.delete(id);
        
        // Clean up escalation timer
        const timer = this.escalationTimers.get(id);
        if (timer) {
          clearTimeout(timer);
          this.escalationTimers.delete(id);
        }
      }

      // Clean up old throttle entries
      const throttleCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      for (const [key, timestamp] of this.throttleTracker.entries()) {
        if (timestamp < throttleCutoff) {
          this.throttleTracker.delete(key);
        }
      }
    }, 60 * 60 * 1000); // Every hour
  }
}

// Export singleton instance
export const securityNotificationService = new SecurityNotificationService();