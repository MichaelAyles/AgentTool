import { 
  SecurityAuditLog, 
  SecurityEvent, 
  SecurityEventType, 
  SecurityLevel 
} from './types.js';
import { structuredLogger } from '../middleware/logging.js';
import { EventEmitter } from 'events';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

// Audit log categories
export enum AuditCategory {
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization', 
  RESOURCE_ACCESS = 'resource_access',
  SYSTEM_CHANGES = 'system_changes',
  SECURITY_EVENTS = 'security_events',
  USER_MANAGEMENT = 'user_management',
  DANGEROUS_OPERATIONS = 'dangerous_operations',
  DATA_ACCESS = 'data_access',
  CONFIGURATION = 'configuration',
  COMPLIANCE = 'compliance'
}

// Audit retention policies
export interface AuditRetentionPolicy {
  category: AuditCategory;
  retentionDays: number;
  archiveAfterDays: number;
  compressionEnabled: boolean;
  encryptionRequired: boolean;
}

// Audit export formats
export type AuditExportFormat = 'json' | 'csv' | 'xml' | 'syslog';

// Compliance frameworks
export enum ComplianceFramework {
  SOX = 'sox',
  HIPAA = 'hipaa',
  PCI_DSS = 'pci_dss',
  GDPR = 'gdpr',
  SOC2 = 'soc2',
  ISO27001 = 'iso27001'
}

export class ComprehensiveAuditLogger extends EventEmitter {
  private auditBuffer: SecurityAuditLog[] = [];
  private persistentLogs: Map<string, SecurityAuditLog[]> = new Map();
  private retentionPolicies: Map<AuditCategory, AuditRetentionPolicy> = new Map();
  private auditDirectory: string;
  private bufferSize = 1000;
  private flushInterval = 10000; // 10 seconds
  private rotationSize = 100 * 1024 * 1024; // 100MB
  private currentLogFile: string;

  constructor(auditDirectory: string = './audit-logs') {
    super();
    this.auditDirectory = auditDirectory;
    this.currentLogFile = this.generateLogFileName();
    this.setupRetentionPolicies();
    this.startPeriodicFlush();
    this.startLogRotation();
    this.ensureAuditDirectory();
  }

  /**
   * Log a comprehensive audit entry
   */
  async logAuditEvent(event: {
    category: AuditCategory;
    action: string;
    resourceType: string;
    resourceId?: string;
    userId?: string;
    sessionId?: string;
    ipAddress?: string;
    userAgent?: string;
    outcome: 'success' | 'failure' | 'error';
    severity: SecurityLevel;
    details: Record<string, any>;
    compliance?: ComplianceFramework[];
    sensitive?: boolean;
  }): Promise<void> {
    const auditEntry: SecurityAuditLog = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      level: this.getLogLevel(event.severity),
      category: event.category,
      event: this.mapActionToEventType(event.action),
      userId: event.userId,
      sessionId: event.sessionId,
      ipAddress: event.ipAddress,
      message: this.formatAuditMessage(event),
      data: {
        action: event.action,
        resourceType: event.resourceType,
        resourceId: event.resourceId,
        outcome: event.outcome,
        userAgent: event.userAgent,
        details: event.details,
        compliance: event.compliance,
        sensitive: event.sensitive || false,
      },
      correlationId: event.sessionId,
    };

    // Add to buffer
    this.auditBuffer.push(auditEntry);

    // Emit for real-time processing
    this.emit('auditEvent', auditEntry);

    // Immediate persistence for critical events
    if (event.severity === SecurityLevel.CRITICAL || event.outcome === 'failure') {
      await this.persistAuditEntry(auditEntry);
    }

    // Log to structured logger for immediate availability
    structuredLogger.info('Audit event', {
      audit: auditEntry,
      category: 'audit',
    });
  }

  /**
   * Log authentication events
   */
  async logAuthentication(event: {
    action: 'login' | 'logout' | 'token_refresh' | 'password_change';
    userId?: string;
    sessionId?: string;
    ipAddress?: string;
    userAgent?: string;
    provider?: string;
    outcome: 'success' | 'failure';
    details: Record<string, any>;
  }): Promise<void> {
    await this.logAuditEvent({
      category: AuditCategory.AUTHENTICATION,
      action: event.action,
      resourceType: 'user_session',
      userId: event.userId,
      sessionId: event.sessionId,
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
      outcome: event.outcome,
      severity: event.outcome === 'failure' ? SecurityLevel.MODERATE : SecurityLevel.SAFE,
      details: {
        provider: event.provider,
        ...event.details,
      },
      compliance: [ComplianceFramework.SOX, ComplianceFramework.SOC2],
    });
  }

  /**
   * Log authorization events
   */
  async logAuthorization(event: {
    action: 'permission_check' | 'role_change' | 'access_denied';
    userId: string;
    sessionId: string;
    resource: string;
    permission: string;
    outcome: 'success' | 'failure';
    details: Record<string, any>;
  }): Promise<void> {
    await this.logAuditEvent({
      category: AuditCategory.AUTHORIZATION,
      action: event.action,
      resourceType: event.resource,
      userId: event.userId,
      sessionId: event.sessionId,
      outcome: event.outcome,
      severity: event.outcome === 'failure' ? SecurityLevel.MODERATE : SecurityLevel.SAFE,
      details: {
        permission: event.permission,
        ...event.details,
      },
      compliance: [ComplianceFramework.SOX, ComplianceFramework.SOC2],
    });
  }

  /**
   * Log resource access events
   */
  async logResourceAccess(event: {
    action: 'create' | 'read' | 'update' | 'delete' | 'execute';
    resourceType: string;
    resourceId: string;
    userId: string;
    sessionId: string;
    ipAddress?: string;
    outcome: 'success' | 'failure' | 'error';
    details: Record<string, any>;
  }): Promise<void> {
    await this.logAuditEvent({
      category: AuditCategory.RESOURCE_ACCESS,
      action: event.action,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      userId: event.userId,
      sessionId: event.sessionId,
      ipAddress: event.ipAddress,
      outcome: event.outcome,
      severity: this.getResourceAccessSeverity(event.action, event.outcome),
      details: event.details,
      compliance: [ComplianceFramework.SOX, ComplianceFramework.GDPR],
      sensitive: this.isResourceSensitive(event.resourceType),
    });
  }

  /**
   * Log dangerous operations
   */
  async logDangerousOperation(event: {
    action: string;
    command?: string;
    resourceType: string;
    userId: string;
    sessionId: string;
    ipAddress?: string;
    outcome: 'success' | 'failure' | 'blocked';
    details: Record<string, any>;
  }): Promise<void> {
    await this.logAuditEvent({
      category: AuditCategory.DANGEROUS_OPERATIONS,
      action: event.action,
      resourceType: event.resourceType,
      userId: event.userId,
      sessionId: event.sessionId,
      ipAddress: event.ipAddress,
      outcome: event.outcome,
      severity: SecurityLevel.DANGEROUS,
      details: {
        command: event.command,
        ...event.details,
      },
      compliance: [ComplianceFramework.SOX, ComplianceFramework.SOC2, ComplianceFramework.ISO27001],
    });
  }

  /**
   * Log system configuration changes
   */
  async logSystemChange(event: {
    action: string;
    component: string;
    changes: Record<string, any>;
    userId: string;
    sessionId: string;
    outcome: 'success' | 'failure';
  }): Promise<void> {
    await this.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: event.action,
      resourceType: 'system_configuration',
      resourceId: event.component,
      userId: event.userId,
      sessionId: event.sessionId,
      outcome: event.outcome,
      severity: SecurityLevel.MODERATE,
      details: {
        component: event.component,
        changes: event.changes,
      },
      compliance: [ComplianceFramework.SOX, ComplianceFramework.SOC2],
    });
  }

  /**
   * Get audit logs with filtering
   */
  getAuditLogs(filter: {
    category?: AuditCategory;
    userId?: string;
    startDate?: Date;
    endDate?: Date;
    severity?: SecurityLevel;
    outcome?: string;
    limit?: number;
    offset?: number;
  }): SecurityAuditLog[] {
    let logs = [...this.auditBuffer];

    // Add persistent logs if available
    for (const [category, categoryLogs] of this.persistentLogs.entries()) {
      if (!filter.category || category === filter.category) {
        logs.push(...categoryLogs);
      }
    }

    // Apply filters
    if (filter.category) {
      logs = logs.filter(log => log.category === filter.category);
    }
    if (filter.userId) {
      logs = logs.filter(log => log.userId === filter.userId);
    }
    if (filter.startDate) {
      logs = logs.filter(log => log.timestamp >= filter.startDate!);
    }
    if (filter.endDate) {
      logs = logs.filter(log => log.timestamp <= filter.endDate!);
    }
    if (filter.severity) {
      logs = logs.filter(log => this.getSecurityLevelFromLogLevel(log.level) === filter.severity);
    }
    if (filter.outcome) {
      logs = logs.filter(log => log.data.outcome === filter.outcome);
    }

    // Sort by timestamp (newest first)
    logs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Apply pagination
    const offset = filter.offset || 0;
    const limit = filter.limit || 100;
    return logs.slice(offset, offset + limit);
  }

  /**
   * Export audit logs in various formats
   */
  async exportAuditLogs(
    filter: Parameters<typeof this.getAuditLogs>[0],
    format: AuditExportFormat
  ): Promise<string> {
    const logs = this.getAuditLogs(filter);

    switch (format) {
      case 'json':
        return JSON.stringify(logs, null, 2);
      
      case 'csv':
        return this.exportAsCSV(logs);
      
      case 'xml':
        return this.exportAsXML(logs);
      
      case 'syslog':
        return this.exportAsSyslog(logs);
      
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  /**
   * Generate compliance report
   */
  generateComplianceReport(framework: ComplianceFramework, dateRange: {
    startDate: Date;
    endDate: Date;
  }): {
    framework: ComplianceFramework;
    period: { start: Date; end: Date };
    totalEvents: number;
    eventsByCategory: Record<AuditCategory, number>;
    securityIncidents: number;
    accessViolations: number;
    systemChanges: number;
    dataAccess: number;
    recommendations: string[];
  } {
    const logs = this.getAuditLogs({
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
    }).filter(log => log.data.compliance?.includes(framework));

    const eventsByCategory = logs.reduce((acc, log) => {
      acc[log.category] = (acc[log.category] || 0) + 1;
      return acc;
    }, {} as Record<AuditCategory, number>);

    const securityIncidents = logs.filter(log => 
      log.category === AuditCategory.SECURITY_EVENTS && 
      log.level === 'error'
    ).length;

    const accessViolations = logs.filter(log => 
      log.category === AuditCategory.AUTHORIZATION && 
      log.data.outcome === 'failure'
    ).length;

    const systemChanges = logs.filter(log => 
      log.category === AuditCategory.SYSTEM_CHANGES
    ).length;

    const dataAccess = logs.filter(log => 
      log.category === AuditCategory.DATA_ACCESS
    ).length;

    return {
      framework,
      period: dateRange,
      totalEvents: logs.length,
      eventsByCategory,
      securityIncidents,
      accessViolations,
      systemChanges,
      dataAccess,
      recommendations: this.generateRecommendations(framework, logs),
    };
  }

  /**
   * Archive old logs based on retention policy
   */
  async archiveOldLogs(): Promise<void> {
    const now = new Date();
    
    for (const [category, policy] of this.retentionPolicies.entries()) {
      const cutoffDate = new Date(now.getTime() - policy.retentionDays * 24 * 60 * 60 * 1000);
      
      // Find logs to archive
      const logsToArchive = this.auditBuffer.filter(log => 
        log.category === category && log.timestamp < cutoffDate
      );

      if (logsToArchive.length > 0) {
        await this.archiveLogs(logsToArchive, policy);
        
        // Remove from active buffer
        this.auditBuffer = this.auditBuffer.filter(log => 
          !(log.category === category && log.timestamp < cutoffDate)
        );
      }
    }
  }

  // Private helper methods

  private setupRetentionPolicies(): void {
    const defaultPolicy: AuditRetentionPolicy = {
      category: AuditCategory.AUTHENTICATION,
      retentionDays: 90,
      archiveAfterDays: 30,
      compressionEnabled: true,
      encryptionRequired: false,
    };

    // Set specific policies for different categories
    this.retentionPolicies.set(AuditCategory.AUTHENTICATION, { ...defaultPolicy, retentionDays: 365 });
    this.retentionPolicies.set(AuditCategory.AUTHORIZATION, { ...defaultPolicy, retentionDays: 365 });
    this.retentionPolicies.set(AuditCategory.DANGEROUS_OPERATIONS, { ...defaultPolicy, retentionDays: 2555, encryptionRequired: true }); // 7 years
    this.retentionPolicies.set(AuditCategory.SECURITY_EVENTS, { ...defaultPolicy, retentionDays: 1095 }); // 3 years
    this.retentionPolicies.set(AuditCategory.SYSTEM_CHANGES, { ...defaultPolicy, retentionDays: 730 }); // 2 years
    this.retentionPolicies.set(AuditCategory.RESOURCE_ACCESS, { ...defaultPolicy, retentionDays: 180 });
    this.retentionPolicies.set(AuditCategory.DATA_ACCESS, { ...defaultPolicy, retentionDays: 365, encryptionRequired: true });
    this.retentionPolicies.set(AuditCategory.USER_MANAGEMENT, { ...defaultPolicy, retentionDays: 365 });
    this.retentionPolicies.set(AuditCategory.CONFIGURATION, { ...defaultPolicy, retentionDays: 365 });
    this.retentionPolicies.set(AuditCategory.COMPLIANCE, { ...defaultPolicy, retentionDays: 2555, encryptionRequired: true });
  }

  private async ensureAuditDirectory(): Promise<void> {
    try {
      await mkdir(this.auditDirectory, { recursive: true });
    } catch (error) {
      console.error('Failed to create audit directory:', error);
    }
  }

  private generateLogFileName(): string {
    const date = new Date().toISOString().split('T')[0];
    return join(this.auditDirectory, `audit-${date}.log`);
  }

  private async persistAuditEntry(entry: SecurityAuditLog): Promise<void> {
    try {
      const logLine = JSON.stringify(entry) + '\n';
      await writeFile(this.currentLogFile, logLine, { flag: 'a' });
    } catch (error) {
      console.error('Failed to persist audit entry:', error);
    }
  }

  private startPeriodicFlush(): void {
    setInterval(async () => {
      if (this.auditBuffer.length > 0) {
        const entriesToFlush = this.auditBuffer.splice(0, Math.min(100, this.auditBuffer.length));
        for (const entry of entriesToFlush) {
          await this.persistAuditEntry(entry);
        }
      }
    }, this.flushInterval);
  }

  private startLogRotation(): void {
    setInterval(() => {
      // Check if current log file should be rotated
      // This is a simplified version - in production, you'd check file size
      const currentDate = new Date().toISOString().split('T')[0];
      const currentLogDate = this.currentLogFile.split('-').pop()?.split('.')[0];
      
      if (currentLogDate !== currentDate) {
        this.currentLogFile = this.generateLogFileName();
      }
    }, 60 * 60 * 1000); // Check every hour
  }

  private getLogLevel(severity: SecurityLevel): 'info' | 'warn' | 'error' | 'critical' {
    switch (severity) {
      case SecurityLevel.SAFE: return 'info';
      case SecurityLevel.MODERATE: return 'warn';
      case SecurityLevel.DANGEROUS: return 'error';
      case SecurityLevel.CRITICAL: return 'critical';
      default: return 'info';
    }
  }

  private getSecurityLevelFromLogLevel(level: string): SecurityLevel {
    switch (level) {
      case 'info': return SecurityLevel.SAFE;
      case 'warn': return SecurityLevel.MODERATE;
      case 'error': return SecurityLevel.DANGEROUS;
      case 'critical': return SecurityLevel.CRITICAL;
      default: return SecurityLevel.SAFE;
    }
  }

  private mapActionToEventType(action: string): SecurityEventType {
    const mapping: Record<string, SecurityEventType> = {
      'login': SecurityEventType.LOGIN,
      'logout': SecurityEventType.LOGOUT,
      'access_denied': SecurityEventType.ACCESS_DENIED,
      'permission_check': SecurityEventType.ACCESS_GRANTED,
      'dangerous_command': SecurityEventType.DANGEROUS_COMMAND_EXECUTED,
      'system_change': SecurityEventType.CONFIGURATION_CHANGED,
    };

    return mapping[action] || SecurityEventType.RESOURCE_ACCESS;
  }

  private formatAuditMessage(event: any): string {
    return `${event.action} on ${event.resourceType}${event.resourceId ? ':' + event.resourceId : ''} - ${event.outcome}`;
  }

  private getResourceAccessSeverity(action: string, outcome: string): SecurityLevel {
    if (outcome === 'failure' || outcome === 'error') {
      return SecurityLevel.MODERATE;
    }
    if (['delete', 'execute'].includes(action)) {
      return SecurityLevel.MODERATE;
    }
    return SecurityLevel.SAFE;
  }

  private isResourceSensitive(resourceType: string): boolean {
    const sensitiveTypes = ['user', 'password', 'token', 'key', 'secret', 'config'];
    return sensitiveTypes.some(type => resourceType.toLowerCase().includes(type));
  }

  private exportAsCSV(logs: SecurityAuditLog[]): string {
    const headers = ['timestamp', 'category', 'action', 'resourceType', 'userId', 'outcome', 'severity'];
    const rows = logs.map(log => [
      log.timestamp.toISOString(),
      log.category,
      log.data.action,
      log.data.resourceType,
      log.userId || '',
      log.data.outcome,
      log.level,
    ]);

    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }

  private exportAsXML(logs: SecurityAuditLog[]): string {
    const xmlLogs = logs.map(log => `
    <audit-entry id="${log.id}">
      <timestamp>${log.timestamp.toISOString()}</timestamp>
      <category>${log.category}</category>
      <action>${log.data.action}</action>
      <resource-type>${log.data.resourceType}</resource-type>
      <user-id>${log.userId || ''}</user-id>
      <outcome>${log.data.outcome}</outcome>
      <severity>${log.level}</severity>
      <message>${log.message}</message>
    </audit-entry>`).join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<audit-log>
  <generated>${new Date().toISOString()}</generated>
  <entries>${xmlLogs}
  </entries>
</audit-log>`;
  }

  private exportAsSyslog(logs: SecurityAuditLog[]): string {
    return logs.map(log => {
      const priority = this.getSyslogPriority(log.level);
      const facility = 16; // local0
      const prival = facility * 8 + priority;
      
      return `<${prival}>${log.timestamp.toISOString()} vibe-code audit: ${log.message}`;
    }).join('\n');
  }

  private getSyslogPriority(level: string): number {
    switch (level) {
      case 'critical': return 2;
      case 'error': return 3;
      case 'warn': return 4;
      case 'info': return 6;
      default: return 6;
    }
  }

  private async archiveLogs(logs: SecurityAuditLog[], policy: AuditRetentionPolicy): Promise<void> {
    // In a real implementation, this would compress and archive logs
    console.log(`Archiving ${logs.length} logs for category ${policy.category}`);
  }

  private generateRecommendations(framework: ComplianceFramework, logs: SecurityAuditLog[]): string[] {
    const recommendations: string[] = [];
    
    const failedLogins = logs.filter(log => 
      log.category === AuditCategory.AUTHENTICATION && log.data.outcome === 'failure'
    ).length;
    
    if (failedLogins > 100) {
      recommendations.push('High number of failed login attempts detected. Consider implementing stronger authentication controls.');
    }

    const privilegeEscalations = logs.filter(log => 
      log.category === AuditCategory.AUTHORIZATION && log.data.action === 'role_change'
    ).length;

    if (privilegeEscalations > 10) {
      recommendations.push('Multiple privilege escalations detected. Review user access controls and approval processes.');
    }

    return recommendations;
  }
}

// Export singleton instance
export const comprehensiveAuditLogger = new ComprehensiveAuditLogger();