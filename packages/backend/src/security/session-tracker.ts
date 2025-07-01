import { securityContextManager } from './context-manager.js';
import { SecurityEventType, SecurityLevel } from './types.js';
import { UserRole } from '../auth/types.js';
import { Database } from '../database/index.js';
import { Request } from 'express';

export class SecuritySessionTracker {
  private db: Database;

  constructor(database: Database) {
    this.db = database;
  }

  /**
   * Initialize security context when user logs in
   */
  initializeSession(params: {
    userId: string;
    sessionId: string;
    role: UserRole;
    req: Request;
    dangerousModeEnabled?: boolean;
  }) {
    const ipAddress = this.getClientIP(params.req);
    const userAgent = params.req.headers['user-agent'] || 'unknown';
    const location = this.extractLocationInfo(params.req);
    const device = this.extractDeviceInfo(params.req);

    const context = securityContextManager.createContext({
      userId: params.userId,
      sessionId: params.sessionId,
      role: params.role,
      ipAddress,
      userAgent,
      dangerousModeEnabled: params.dangerousModeEnabled,
      location,
      device,
    });

    return context;
  }

  /**
   * Track request activity
   */
  trackRequest(sessionId: string, req: Request): boolean {
    const context = securityContextManager.getContext(sessionId);
    if (!context) return false;

    // Update activity timestamp
    securityContextManager.updateActivity(sessionId);

    // Check rate limits
    if (!securityContextManager.checkRateLimit(sessionId)) {
      return false;
    }

    // Track suspicious patterns
    this.detectSuspiciousActivity(sessionId, req);

    return true;
  }

  /**
   * Track resource access
   */
  trackResourceAccess(sessionId: string, resource: string, action: string, success: boolean) {
    const context = securityContextManager.getContext(sessionId);
    if (!context) return;

    if (resource === 'project' && action === 'access' && success) {
      // Extract project ID from the action context if available
      const projectId = this.extractProjectId(resource);
      if (projectId) {
        securityContextManager.addActiveProject(sessionId, projectId);
      }
    }

    // Log the access attempt
    securityContextManager.emit('securityEvent', {
      id: `access_${Date.now()}`,
      type: SecurityEventType.RESOURCE_ACCESS,
      severity: success ? SecurityLevel.SAFE : SecurityLevel.MODERATE,
      timestamp: new Date(),
      userId: context.userId,
      sessionId: sessionId,
      ipAddress: context.ipAddress,
      resource,
      action,
      outcome: success ? 'success' : 'failure',
      metadata: {},
    });
  }

  /**
   * Track dangerous command execution
   */
  trackDangerousCommand(sessionId: string, command: string, args: string[], success: boolean) {
    const context = securityContextManager.getContext(sessionId);
    if (!context) return;

    // Record as dangerous activity
    securityContextManager.recordViolation(sessionId, {
      type: SecurityEventType.DANGEROUS_COMMAND_EXECUTED,
      severity: SecurityLevel.DANGEROUS,
      action: 'command_execution',
      metadata: {
        command,
        args,
        success,
        timestamp: new Date().toISOString(),
      },
    });

    // If not in dangerous mode, this is a violation
    if (!context.dangerousModeEnabled) {
      securityContextManager.recordViolation(sessionId, {
        type: SecurityEventType.SECURITY_VIOLATION,
        severity: SecurityLevel.DANGEROUS,
        action: 'unauthorized_dangerous_command',
        metadata: { command, args },
      });
    }
  }

  /**
   * Track permission escalation attempts
   */
  trackPermissionEscalation(sessionId: string, attemptedRole: UserRole, success: boolean) {
    const context = securityContextManager.getContext(sessionId);
    if (!context) return;

    const severity = success ? SecurityLevel.CRITICAL : SecurityLevel.DANGEROUS;

    securityContextManager.recordViolation(sessionId, {
      type: SecurityEventType.PERMISSION_ESCALATION,
      severity,
      action: 'role_escalation',
      metadata: {
        currentRole: context.role,
        attemptedRole,
        success,
      },
    });
  }

  /**
   * Track configuration changes
   */
  trackConfigurationChange(sessionId: string, configType: string, changes: Record<string, any>) {
    const context = securityContextManager.getContext(sessionId);
    if (!context) return;

    securityContextManager.emit('securityEvent', {
      id: `config_${Date.now()}`,
      type: SecurityEventType.CONFIGURATION_CHANGED,
      severity: SecurityLevel.MODERATE,
      timestamp: new Date(),
      userId: context.userId,
      sessionId: sessionId,
      ipAddress: context.ipAddress,
      resource: 'configuration',
      action: 'modify',
      outcome: 'success',
      metadata: {
        configType,
        changes,
      },
    });
  }

  /**
   * Get session security status
   */
  getSessionSecurity(sessionId: string) {
    const context = securityContextManager.getContext(sessionId);
    if (!context) return null;

    return {
      sessionId: context.sessionId,
      userId: context.userId,
      securityLevel: context.securityLevel,
      riskScore: context.riskScore,
      dangerousModeEnabled: context.dangerousModeEnabled,
      violationCount: context.violationCount,
      activeProjects: context.activeProjects.length,
      lastActivity: context.lastActivity,
      requestCount: context.requestCount,
      timeUntilDangerousDisable: context.dangerousModeEnabledAt ? 
        Math.max(0, (context.dangerousModeEnabledAt.getTime() + 30 * 60 * 1000) - Date.now()) : 0,
    };
  }

  /**
   * Clean up session
   */
  cleanupSession(sessionId: string) {
    securityContextManager.destroyContext(sessionId);
  }

  /**
   * Enable dangerous mode with confirmation
   */
  enableDangerousMode(sessionId: string, confirmation: boolean = false): boolean {
    return securityContextManager.enableDangerousMode(sessionId, confirmation);
  }

  /**
   * Disable dangerous mode
   */
  disableDangerousMode(sessionId: string): void {
    securityContextManager.disableDangerousMode(sessionId);
  }

  /**
   * Get security metrics for monitoring
   */
  getSecurityMetrics() {
    return securityContextManager.getSecurityMetrics();
  }

  // Private helper methods

  private getClientIP(req: Request): string {
    return (req.headers['x-forwarded-for'] as string)?.split(',')[0] || 
           (req.headers['x-real-ip'] as string) ||
           req.connection.remoteAddress ||
           req.socket.remoteAddress ||
           'unknown';
  }

  private extractLocationInfo(req: Request) {
    // Extract location from headers if available (e.g., from CloudFlare, AWS, etc.)
    const country = req.headers['cf-ipcountry'] as string || 
                   req.headers['x-country-code'] as string;
    const region = req.headers['cf-region'] as string ||
                  req.headers['x-region'] as string;
    const city = req.headers['cf-ipcity'] as string ||
                req.headers['x-city'] as string;

    if (country || region || city) {
      return { country, region, city };
    }

    return undefined;
  }

  private extractDeviceInfo(req: Request) {
    const userAgent = req.headers['user-agent'] || '';
    
    // Basic device detection
    let deviceType = 'desktop';
    if (/mobile/i.test(userAgent)) {
      deviceType = 'mobile';
    } else if (/tablet/i.test(userAgent)) {
      deviceType = 'tablet';
    }

    // Basic OS detection
    let os = 'unknown';
    if (/windows/i.test(userAgent)) {
      os = 'Windows';
    } else if (/mac/i.test(userAgent)) {
      os = 'macOS';
    } else if (/linux/i.test(userAgent)) {
      os = 'Linux';
    } else if (/android/i.test(userAgent)) {
      os = 'Android';
    } else if (/ios/i.test(userAgent)) {
      os = 'iOS';
    }

    // Basic browser detection
    let browser = 'unknown';
    if (/chrome/i.test(userAgent)) {
      browser = 'Chrome';
    } else if (/firefox/i.test(userAgent)) {
      browser = 'Firefox';
    } else if (/safari/i.test(userAgent)) {
      browser = 'Safari';
    } else if (/edge/i.test(userAgent)) {
      browser = 'Edge';
    }

    return {
      type: deviceType,
      os,
      browser,
    };
  }

  private extractProjectId(resource: string): string | null {
    // This would extract project ID from resource identifier
    // For now, return null as project ID should be passed explicitly
    return null;
  }

  private detectSuspiciousActivity(sessionId: string, req: Request) {
    const context = securityContextManager.getContext(sessionId);
    if (!context) return;

    const suspiciousPatterns = [
      // Multiple rapid requests
      () => context.requestCount > 50 && 
            (Date.now() - context.requestWindowStart.getTime()) < 60 * 1000,
      
      // Unusual user agent
      () => !req.headers['user-agent'] || 
            /bot|crawler|spider|scraper/i.test(req.headers['user-agent'] || ''),
      
      // Missing common headers
      () => !req.headers['accept'] || !req.headers['accept-language'],
      
      // Suspicious paths
      () => req.path.includes('..') || 
            req.path.includes('<script>') ||
            /\.(php|asp|jsp)$/i.test(req.path),
    ];

    const suspiciousCount = suspiciousPatterns.filter(pattern => pattern()).length;
    
    if (suspiciousCount >= 2) {
      securityContextManager.recordViolation(sessionId, {
        type: SecurityEventType.SUSPICIOUS_ACTIVITY,
        severity: SecurityLevel.MODERATE,
        action: 'suspicious_pattern_detected',
        metadata: {
          path: req.path,
          userAgent: req.headers['user-agent'],
          suspiciousCount,
          requestCount: context.requestCount,
        },
      });
    }
  }
}

// Export factory function
export function createSecuritySessionTracker(database: Database): SecuritySessionTracker {
  return new SecuritySessionTracker(database);
}