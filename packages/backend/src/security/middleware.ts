import { Request, Response, NextFunction } from 'express';
import { createSecuritySessionTracker } from './session-tracker.js';
import { securityEventLogger } from './event-logger.js';
import { SecurityEventType, SecurityLevel } from './types.js';
import { Database } from '../database/index.js';

// Extend Express Request to include security context
declare global {
  namespace Express {
    interface Request {
      securityTracker?: ReturnType<typeof createSecuritySessionTracker>;
      securityContext?: {
        sessionId: string;
        userId: string;
        riskScore: number;
        securityLevel: SecurityLevel;
        dangerousModeEnabled: boolean;
      };
    }
  }
}

/**
 * Initialize security tracking for requests
 */
export function initializeSecurityMiddleware(database: Database) {
  const securityTracker = createSecuritySessionTracker(database);

  return (req: Request, res: Response, next: NextFunction) => {
    req.securityTracker = securityTracker;
    next();
  };
}

/**
 * Track request activity and enforce security policies
 */
export function securityTrackingMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    const securityTracker = req.securityTracker;

    if (!user || !securityTracker) {
      return next();
    }

    // Track the request
    const allowed = securityTracker.trackRequest(user.sessionId, req);

    if (!allowed) {
      // Request was blocked due to security policy
      return res.status(429).json({
        error: 'Request blocked by security policy',
        code: 'SECURITY_POLICY_VIOLATION',
      });
    }

    // Add security context to request
    const sessionSecurity = securityTracker.getSessionSecurity(user.sessionId);
    if (sessionSecurity) {
      req.securityContext = {
        sessionId: sessionSecurity.sessionId,
        userId: sessionSecurity.userId,
        riskScore: sessionSecurity.riskScore,
        securityLevel: sessionSecurity.securityLevel,
        dangerousModeEnabled: sessionSecurity.dangerousModeEnabled,
      };
    }

    next();
  };
}

/**
 * Log successful API responses for audit trail
 */
export function securityAuditMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const originalSend = res.send;
    const originalJson = res.json;

    // Intercept response to log successful operations
    res.send = function (body) {
      logApiResponse(req, res, body);
      return originalSend.call(this, body);
    };

    res.json = function (body) {
      logApiResponse(req, res, body);
      return originalJson.call(this, body);
    };

    next();
  };
}

/**
 * Require dangerous mode for specific routes
 */
export function requireDangerousMode() {
  return (req: Request, res: Response, next: NextFunction) => {
    const securityContext = req.securityContext;

    if (!securityContext) {
      return res.status(401).json({
        error: 'Security context required',
        code: 'SECURITY_CONTEXT_MISSING',
      });
    }

    if (!securityContext.dangerousModeEnabled) {
      // Log unauthorized dangerous operation attempt
      securityEventLogger.logEvent({
        id: `dangerous_${Date.now()}`,
        type: SecurityEventType.SECURITY_VIOLATION,
        severity: SecurityLevel.DANGEROUS,
        timestamp: new Date(),
        userId: securityContext.userId,
        sessionId: securityContext.sessionId,
        ipAddress: getClientIP(req),
        resource: 'dangerous_operation',
        action: 'unauthorized_access',
        outcome: 'blocked',
        metadata: {
          path: req.path,
          method: req.method,
        },
      });

      return res.status(403).json({
        error: 'Dangerous mode required for this operation',
        code: 'DANGEROUS_MODE_REQUIRED',
        action: 'enable_dangerous_mode',
      });
    }

    next();
  };
}

/**
 * Block high-risk users
 */
export function blockHighRiskUsers(threshold: number = 75) {
  return (req: Request, res: Response, next: NextFunction) => {
    const securityContext = req.securityContext;

    if (!securityContext) {
      return next();
    }

    if (securityContext.riskScore >= threshold) {
      securityEventLogger.logEvent({
        id: `blocked_${Date.now()}`,
        type: SecurityEventType.ACCESS_DENIED,
        severity: SecurityLevel.DANGEROUS,
        timestamp: new Date(),
        userId: securityContext.userId,
        sessionId: securityContext.sessionId,
        ipAddress: getClientIP(req),
        resource: req.path,
        action: 'high_risk_block',
        outcome: 'blocked',
        metadata: {
          riskScore: securityContext.riskScore,
          threshold,
        },
      });

      return res.status(403).json({
        error: 'Access denied due to high risk score',
        code: 'HIGH_RISK_USER_BLOCKED',
        riskScore: securityContext.riskScore,
      });
    }

    next();
  };
}

/**
 * Enhanced rate limiting with security context
 */
export function securityRateLimit() {
  return (req: Request, res: Response, next: NextFunction) => {
    const securityContext = req.securityContext;
    const securityTracker = req.securityTracker;

    if (!securityContext || !securityTracker) {
      return next();
    }

    // Adjust rate limits based on risk score
    const riskMultiplier = Math.max(0.1, 1 - securityContext.riskScore / 100);
    const allowedRequests = Math.floor(60 * riskMultiplier); // Base 60 requests per minute

    // This would integrate with the actual rate limiting logic
    // For now, we just log the adjusted limit
    if (securityContext.riskScore > 50) {
      securityEventLogger.logEvent({
        id: `rate_adjust_${Date.now()}`,
        type: SecurityEventType.SECURITY_VIOLATION,
        severity: SecurityLevel.MODERATE,
        timestamp: new Date(),
        userId: securityContext.userId,
        sessionId: securityContext.sessionId,
        ipAddress: getClientIP(req),
        resource: 'rate_limit',
        action: 'adjusted',
        outcome: 'success',
        metadata: {
          riskScore: securityContext.riskScore,
          adjustedLimit: allowedRequests,
          originalLimit: 60,
        },
      });
    }

    next();
  };
}

/**
 * Track resource access for security monitoring
 */
export function trackResourceAccess(
  resourceType: string,
  actionType: string = 'access'
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const securityTracker = req.securityTracker;
    const user = req.user;

    if (securityTracker && user) {
      // Track the resource access attempt
      const originalSend = res.send;
      const originalJson = res.json;

      const trackResponse = (statusCode: number) => {
        const success = statusCode >= 200 && statusCode < 300;
        securityTracker.trackResourceAccess(
          user.sessionId,
          resourceType,
          actionType,
          success
        );
      };

      res.send = function (body) {
        trackResponse(this.statusCode);
        return originalSend.call(this, body);
      };

      res.json = function (body) {
        trackResponse(this.statusCode);
        return originalJson.call(this, body);
      };
    }

    next();
  };
}

/**
 * Security header injection
 */
export function securityHeaders() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Add security headers
    res.setHeader(
      'X-Security-Context',
      req.securityContext ? 'active' : 'inactive'
    );

    if (req.securityContext) {
      res.setHeader('X-Risk-Score', req.securityContext.riskScore.toString());
      res.setHeader('X-Security-Level', req.securityContext.securityLevel);

      if (req.securityContext.dangerousModeEnabled) {
        res.setHeader('X-Dangerous-Mode', 'enabled');
      }
    }

    next();
  };
}

/**
 * Command validation for dangerous operations
 */
export function validateCommand() {
  return (req: Request, res: Response, next: NextFunction) => {
    const { command, args } = req.body;
    const securityTracker = req.securityTracker;
    const user = req.user;

    if (!command || !securityTracker || !user) {
      return next();
    }

    // List of dangerous commands that require special handling
    const dangerousCommands = [
      'rm',
      'del',
      'rmdir',
      'format',
      'fdisk',
      'dd',
      'mkfs',
      'mount',
      'umount',
      'chmod',
      'chown',
      'sudo',
      'su',
      'passwd',
      'useradd',
      'userdel',
      'systemctl',
      'service',
      'init',
      'iptables',
      'ufw',
      'firewall-cmd',
      'reboot',
      'shutdown',
      'halt',
    ];

    const isDangerous = dangerousCommands.some(dangerous =>
      command.toLowerCase().includes(dangerous)
    );

    if (isDangerous) {
      securityTracker.trackDangerousCommand(
        user.sessionId,
        command,
        args || [],
        false // We'll update this based on actual execution
      );

      // If not in dangerous mode, block the command
      if (!req.securityContext?.dangerousModeEnabled) {
        return res.status(403).json({
          error: 'Dangerous command blocked',
          code: 'DANGEROUS_COMMAND_BLOCKED',
          command,
          action: 'enable_dangerous_mode',
        });
      }
    }

    next();
  };
}

// Helper functions

function logApiResponse(req: Request, res: Response, body: any) {
  const user = req.user;

  if (!user) return;

  const isSuccess = res.statusCode >= 200 && res.statusCode < 300;
  const isError = res.statusCode >= 400;

  if (isError || (isSuccess && shouldLogSuccessfulOperation(req))) {
    securityEventLogger.logEvent({
      id: `api_${Date.now()}`,
      type: isSuccess
        ? SecurityEventType.RESOURCE_ACCESS
        : SecurityEventType.ACCESS_DENIED,
      severity: isError ? SecurityLevel.MODERATE : SecurityLevel.SAFE,
      timestamp: new Date(),
      userId: user.id,
      sessionId: user.sessionId,
      ipAddress: getClientIP(req),
      resource: req.path,
      action: req.method.toLowerCase(),
      outcome: isSuccess ? 'success' : 'failure',
      metadata: {
        statusCode: res.statusCode,
        userAgent: req.headers['user-agent'],
        responseSize:
          typeof body === 'string' ? body.length : JSON.stringify(body).length,
      },
    });
  }
}

function shouldLogSuccessfulOperation(req: Request): boolean {
  // Log successful operations for sensitive endpoints
  const sensitiveEndpoints = [
    '/api/auth',
    '/api/users',
    '/api/roles',
    '/api/processes',
    '/api/cli',
  ];

  return sensitiveEndpoints.some(endpoint => req.path.startsWith(endpoint));
}

function getClientIP(req: Request): string {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
    (req.headers['x-real-ip'] as string) ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    'unknown'
  );
}
