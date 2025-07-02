import {
  SecurityEvent,
  SecurityEventType,
  SecurityLevel,
  SecurityAuditLog,
  SecurityAlert,
  SecurityAlertAction,
} from './types.js';
import { structuredLogger } from '../middleware/logging.js';
import { EventEmitter } from 'events';

export class SecurityEventLogger extends EventEmitter {
  private auditLog: SecurityAuditLog[] = [];
  private alerts: Map<string, SecurityAlert> = new Map();
  private alertCounters: Map<string, { count: number; windowStart: Date }> =
    new Map();
  private eventBuffer: SecurityEvent[] = [];
  private bufferSize = 1000;
  private flushInterval = 5000; // 5 seconds

  constructor() {
    super();
    this.setupDefaultAlerts();
    this.startEventFlushing();
  }

  /**
   * Log a security event
   */
  logEvent(event: SecurityEvent): void {
    // Add to buffer
    this.eventBuffer.push(event);

    // Log to structured logger immediately for critical events
    if (event.severity === SecurityLevel.CRITICAL) {
      this.logToPersistentStorage(event);
    }

    // Check alerts
    this.checkAlerts(event);

    // Create audit log entry
    this.createAuditLogEntry(event);

    // Emit event for real-time monitoring
    this.emit('securityEvent', event);

    // Log to console for debugging in development
    if (process.env.NODE_ENV === 'development') {
      console.log(
        `[SECURITY] ${event.type}: ${event.outcome} - User: ${event.userId}, IP: ${event.ipAddress}`
      );
    }
  }

  /**
   * Log multiple events as a batch
   */
  logEventBatch(events: SecurityEvent[]): void {
    for (const event of events) {
      this.logEvent(event);
    }
  }

  /**
   * Get recent security events
   */
  getRecentEvents(
    limit: number = 100,
    filter?: {
      userId?: string;
      eventType?: SecurityEventType;
      severity?: SecurityLevel;
      since?: Date;
    }
  ): SecurityEvent[] {
    let events = [...this.eventBuffer];

    if (filter) {
      events = events.filter(event => {
        if (filter.userId && event.userId !== filter.userId) return false;
        if (filter.eventType && event.type !== filter.eventType) return false;
        if (filter.severity && event.severity !== filter.severity) return false;
        if (filter.since && event.timestamp < filter.since) return false;
        return true;
      });
    }

    return events
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Get audit log entries
   */
  getAuditLog(
    limit: number = 100,
    filter?: {
      userId?: string;
      category?: string;
      level?: string;
      since?: Date;
    }
  ): SecurityAuditLog[] {
    let entries = [...this.auditLog];

    if (filter) {
      entries = entries.filter(entry => {
        if (filter.userId && entry.userId !== filter.userId) return false;
        if (filter.category && entry.category !== filter.category) return false;
        if (filter.level && entry.level !== filter.level) return false;
        if (filter.since && entry.timestamp < filter.since) return false;
        return true;
      });
    }

    return entries
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Add a security alert
   */
  addAlert(alert: SecurityAlert): void {
    this.alerts.set(alert.id, alert);
    this.alertCounters.set(alert.id, { count: 0, windowStart: new Date() });
  }

  /**
   * Remove a security alert
   */
  removeAlert(alertId: string): void {
    this.alerts.delete(alertId);
    this.alertCounters.delete(alertId);
  }

  /**
   * Get security statistics
   */
  getSecurityStatistics(timeWindow: number = 24): {
    totalEvents: number;
    eventsByType: Record<SecurityEventType, number>;
    eventsBySeverity: Record<SecurityLevel, number>;
    alertsTriggered: number;
    topUsers: Array<{ userId: string; eventCount: number }>;
    topIPs: Array<{ ipAddress: string; eventCount: number }>;
  } {
    const now = new Date();
    const windowStart = new Date(now.getTime() - timeWindow * 60 * 60 * 1000);

    const recentEvents = this.eventBuffer.filter(
      event => event.timestamp >= windowStart
    );

    // Count events by type
    const eventsByType = {} as Record<SecurityEventType, number>;
    for (const type of Object.values(SecurityEventType)) {
      eventsByType[type] = recentEvents.filter(e => e.type === type).length;
    }

    // Count events by severity
    const eventsBySeverity = {} as Record<SecurityLevel, number>;
    for (const severity of Object.values(SecurityLevel)) {
      eventsBySeverity[severity] = recentEvents.filter(
        e => e.severity === severity
      ).length;
    }

    // Top users by event count
    const userCounts = new Map<string, number>();
    recentEvents.forEach(event => {
      userCounts.set(event.userId, (userCounts.get(event.userId) || 0) + 1);
    });
    const topUsers = Array.from(userCounts.entries())
      .map(([userId, eventCount]) => ({ userId, eventCount }))
      .sort((a, b) => b.eventCount - a.eventCount)
      .slice(0, 10);

    // Top IPs by event count
    const ipCounts = new Map<string, number>();
    recentEvents.forEach(event => {
      ipCounts.set(event.ipAddress, (ipCounts.get(event.ipAddress) || 0) + 1);
    });
    const topIPs = Array.from(ipCounts.entries())
      .map(([ipAddress, eventCount]) => ({ ipAddress, eventCount }))
      .sort((a, b) => b.eventCount - a.eventCount)
      .slice(0, 10);

    return {
      totalEvents: recentEvents.length,
      eventsByType,
      eventsBySeverity,
      alertsTriggered: this.getTriggeredAlertsCount(windowStart),
      topUsers,
      topIPs,
    };
  }

  /**
   * Export security logs for analysis
   */
  exportLogs(
    format: 'json' | 'csv' = 'json',
    filter?: {
      startDate?: Date;
      endDate?: Date;
      userId?: string;
      severity?: SecurityLevel;
    }
  ): string {
    let events = [...this.eventBuffer];

    if (filter) {
      events = events.filter(event => {
        if (filter.startDate && event.timestamp < filter.startDate)
          return false;
        if (filter.endDate && event.timestamp > filter.endDate) return false;
        if (filter.userId && event.userId !== filter.userId) return false;
        if (filter.severity && event.severity !== filter.severity) return false;
        return true;
      });
    }

    if (format === 'json') {
      return JSON.stringify(events, null, 2);
    } else {
      // CSV format
      const headers = [
        'timestamp',
        'type',
        'severity',
        'userId',
        'sessionId',
        'ipAddress',
        'resource',
        'action',
        'outcome',
      ];
      const rows = events.map(event => [
        event.timestamp.toISOString(),
        event.type,
        event.severity,
        event.userId,
        event.sessionId,
        event.ipAddress,
        event.resource || '',
        event.action || '',
        event.outcome,
      ]);

      return [headers, ...rows].map(row => row.join(',')).join('\n');
    }
  }

  // Private methods

  private setupDefaultAlerts(): void {
    // Multiple failed login attempts
    this.addAlert({
      id: 'failed-login-attempts',
      name: 'Multiple Failed Login Attempts',
      description:
        'User has multiple failed login attempts in a short time window',
      severity: SecurityLevel.MODERATE,
      enabled: true,
      eventTypes: [SecurityEventType.LOGIN_FAILED],
      threshold: 5,
      timeWindow: 15, // minutes
      actions: [
        { type: 'log', config: { level: 'warn' } },
        { type: 'email', config: { template: 'security-alert' } },
      ],
    });

    // Dangerous mode abuse
    this.addAlert({
      id: 'dangerous-mode-abuse',
      name: 'Dangerous Mode Abuse',
      description: 'User is frequently enabling dangerous mode',
      severity: SecurityLevel.DANGEROUS,
      enabled: true,
      eventTypes: [SecurityEventType.DANGEROUS_MODE_ENABLED],
      threshold: 3,
      timeWindow: 60, // minutes
      actions: [
        { type: 'log', config: { level: 'error' } },
        { type: 'email', config: { template: 'security-alert' } },
        { type: 'disable_user', config: { duration: 3600 } }, // 1 hour
      ],
    });

    // Permission escalation attempts
    this.addAlert({
      id: 'permission-escalation',
      name: 'Permission Escalation Attempts',
      description: 'User is attempting to escalate permissions',
      severity: SecurityLevel.CRITICAL,
      enabled: true,
      eventTypes: [SecurityEventType.PERMISSION_ESCALATION],
      threshold: 1,
      timeWindow: 5, // minutes
      actions: [
        { type: 'log', config: { level: 'error' } },
        { type: 'email', config: { template: 'critical-security-alert' } },
        { type: 'terminate_session', config: {} },
      ],
    });

    // High violation count
    this.addAlert({
      id: 'high-violation-count',
      name: 'High Security Violation Count',
      description: 'User has accumulated many security violations',
      severity: SecurityLevel.DANGEROUS,
      enabled: true,
      eventTypes: [SecurityEventType.SECURITY_VIOLATION],
      threshold: 10,
      timeWindow: 60, // minutes
      actions: [
        { type: 'log', config: { level: 'warn' } },
        { type: 'email', config: { template: 'security-alert' } },
      ],
    });
  }

  private checkAlerts(event: SecurityEvent): void {
    for (const [alertId, alert] of this.alerts.entries()) {
      if (!alert.enabled || !alert.eventTypes.includes(event.type)) {
        continue;
      }

      const counter = this.alertCounters.get(alertId);
      if (!counter) continue;

      const now = new Date();
      const windowDuration = alert.timeWindow * 60 * 1000; // Convert to milliseconds

      // Reset counter if window has expired
      if (now.getTime() - counter.windowStart.getTime() > windowDuration) {
        counter.count = 1;
        counter.windowStart = now;
      } else {
        counter.count++;
      }

      // Check if threshold is reached
      if (counter.count >= alert.threshold) {
        this.triggerAlert(alert, event, counter.count);

        // Reset counter after triggering
        counter.count = 0;
        counter.windowStart = now;
      }
    }
  }

  private triggerAlert(
    alert: SecurityAlert,
    triggeringEvent: SecurityEvent,
    count: number
  ): void {
    const alertData = {
      alert,
      triggeringEvent,
      count,
      timestamp: new Date(),
    };

    // Execute alert actions
    for (const action of alert.actions) {
      this.executeAlertAction(action, alertData);
    }

    // Log alert trigger
    this.createAuditLogEntry({
      id: `alert_${Date.now()}`,
      type: SecurityEventType.SECURITY_VIOLATION,
      severity: alert.severity,
      timestamp: new Date(),
      userId: triggeringEvent.userId,
      sessionId: triggeringEvent.sessionId,
      ipAddress: triggeringEvent.ipAddress,
      outcome: 'success',
      metadata: {
        alertId: alert.id,
        alertName: alert.name,
        count,
        threshold: alert.threshold,
      },
    });

    // Emit alert event
    this.emit('alertTriggered', alertData);
  }

  private executeAlertAction(
    action: SecurityAlertAction,
    alertData: any
  ): void {
    switch (action.type) {
      case 'log':
        const level = action.config.level || 'info';
        structuredLogger[level as keyof typeof structuredLogger](
          'Security alert triggered',
          {
            alert: alertData.alert.name,
            count: alertData.count,
            event: alertData.triggeringEvent,
          }
        );
        break;

      case 'email':
        // In a real implementation, this would send an email
        structuredLogger.info('Security alert email would be sent', {
          template: action.config.template,
          alert: alertData.alert.name,
        });
        break;

      case 'webhook':
        // In a real implementation, this would call a webhook
        structuredLogger.info('Security alert webhook would be called', {
          url: action.config.url,
          alert: alertData.alert.name,
        });
        break;

      case 'disable_user':
        // Emit event for user management system to handle
        this.emit('disableUser', {
          userId: alertData.triggeringEvent.userId,
          duration: action.config.duration,
          reason: `Security alert: ${alertData.alert.name}`,
        });
        break;

      case 'terminate_session':
        // Emit event for session management system to handle
        this.emit('terminateSession', {
          sessionId: alertData.triggeringEvent.sessionId,
          reason: `Security alert: ${alertData.alert.name}`,
        });
        break;
    }
  }

  private createAuditLogEntry(event: SecurityEvent): void {
    const auditEntry: SecurityAuditLog = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: event.timestamp,
      level: this.getLogLevel(event.severity),
      category: this.getEventCategory(event.type),
      event: event.type,
      userId: event.userId,
      sessionId: event.sessionId,
      ipAddress: event.ipAddress,
      message: this.formatEventMessage(event),
      data: {
        resource: event.resource,
        action: event.action,
        outcome: event.outcome,
        metadata: event.metadata,
        riskScore: event.riskScore,
      },
      correlationId: event.id,
    };

    this.auditLog.push(auditEntry);

    // Keep only last 5000 audit entries in memory
    if (this.auditLog.length > 5000) {
      this.auditLog = this.auditLog.slice(-2500);
    }
  }

  private getLogLevel(
    severity: SecurityLevel
  ): 'info' | 'warn' | 'error' | 'critical' {
    switch (severity) {
      case SecurityLevel.SAFE:
        return 'info';
      case SecurityLevel.MODERATE:
        return 'warn';
      case SecurityLevel.DANGEROUS:
        return 'error';
      case SecurityLevel.CRITICAL:
        return 'critical';
      default:
        return 'info';
    }
  }

  private getEventCategory(eventType: SecurityEventType): string {
    if (
      [
        SecurityEventType.LOGIN,
        SecurityEventType.LOGOUT,
        SecurityEventType.LOGIN_FAILED,
      ].includes(eventType)
    ) {
      return 'auth';
    }
    if (
      [
        SecurityEventType.ACCESS_GRANTED,
        SecurityEventType.ACCESS_DENIED,
      ].includes(eventType)
    ) {
      return 'access';
    }
    if (
      [
        SecurityEventType.RESOURCE_ACCESS,
        SecurityEventType.RESOURCE_MODIFIED,
      ].includes(eventType)
    ) {
      return 'resource';
    }
    if (
      [
        SecurityEventType.SECURITY_VIOLATION,
        SecurityEventType.SUSPICIOUS_ACTIVITY,
      ].includes(eventType)
    ) {
      return 'violation';
    }
    return 'system';
  }

  private formatEventMessage(event: SecurityEvent): string {
    return `${event.type} - ${event.outcome} for user ${event.userId} from ${event.ipAddress}`;
  }

  private getTriggeredAlertsCount(since: Date): number {
    return this.auditLog.filter(
      entry =>
        entry.timestamp >= since && entry.message.includes('alert triggered')
    ).length;
  }

  private startEventFlushing(): void {
    setInterval(() => {
      if (this.eventBuffer.length > 0) {
        const eventsToFlush = this.eventBuffer.splice(
          0,
          Math.min(100, this.eventBuffer.length)
        );
        for (const event of eventsToFlush) {
          this.logToPersistentStorage(event);
        }
      }
    }, this.flushInterval);
  }

  private logToPersistentStorage(event: SecurityEvent): void {
    // In a real implementation, this would write to a database or log file
    structuredLogger.info('Security event', {
      securityEvent: event,
      category: 'security-audit',
    });
  }
}

// Export singleton instance
export const securityEventLogger = new SecurityEventLogger();
