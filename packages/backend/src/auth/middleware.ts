import { Request, Response, NextFunction } from 'express';
import { authService } from './auth-service.js';
import { db } from '../database/index.js';
import { JWTPayload } from './types.js';
import { structuredLogger } from '../middleware/logging.js';
import { createSecuritySessionTracker } from '../security/session-tracker.js';
import { SecurityEventType, SecurityLevel } from '../security/types.js';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: string;
        sessionId: string;
      };
    }
  }
}

/**
 * Middleware to authenticate requests using JWT tokens
 */
export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get token from Authorization header or cookie
    let token: string | undefined;
    
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (req.cookies?.auth_token) {
      token = req.cookies.auth_token;
    }

    if (!token) {
      return res.status(401).json({ error: 'Authentication token required' });
    }

    // Verify token
    const payload: JWTPayload = await authService.verifyToken(token);

    // Get user details
    const user = await db.getUserById(payload.userId);
    if (!user || !user.active) {
      return res.status(401).json({ error: 'User not found or inactive' });
    }

    // Attach user to request
    req.user = {
      id: user.id,
      role: user.role,
      sessionId: payload.sessionId,
    };

    // Initialize security context if not already present
    if (req.app.get('securityTracker')) {
      const securityTracker = req.app.get('securityTracker');
      const context = securityTracker.getSessionSecurity(payload.sessionId);
      
      if (!context) {
        // Initialize security context for this session
        securityTracker.initializeSession({
          userId: user.id,
          sessionId: payload.sessionId,
          role: user.role,
          req,
          dangerousModeEnabled: user.settings?.dangerousModeEnabled || false,
        });
      }
    }

    // Log successful authentication
    structuredLogger.debug('Request authenticated', {
      userId: user.id,
      path: req.path,
      method: req.method,
      sessionId: payload.sessionId,
    });

    next();
  } catch (error) {
    structuredLogger.warn('Authentication failed', error, {
      path: req.path,
      method: req.method,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
    });

    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

/**
 * Optional authentication middleware - doesn't fail if no token
 */
export const optionalAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get token from Authorization header or cookie
    let token: string | undefined;
    
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (req.cookies?.auth_token) {
      token = req.cookies.auth_token;
    }

    if (token) {
      try {
        // Verify token
        const payload: JWTPayload = await authService.verifyToken(token);

        // Get user details
        const user = await db.getUserById(payload.userId);
        if (user && user.active) {
          // Attach user to request
          req.user = {
            id: user.id,
            role: user.role,
            sessionId: payload.sessionId,
          };
        }
      } catch (error) {
        // Token invalid, but continue without user
        structuredLogger.debug('Optional auth failed', error, {
          path: req.path,
          method: req.method,
        });
      }
    }

    next();
  } catch (error) {
    // Don't fail the request, just continue without user
    next();
  }
};

/**
 * Middleware to check for admin role
 */
export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  next();
};

/**
 * Middleware to check for specific roles
 */
export const requireRole = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        required: allowedRoles,
        current: req.user.role,
      });
    }

    next();
  };
};

/**
 * Middleware to require authentication only for certain environments
 */
export const requireAuthInProduction = (req: Request, res: Response, next: NextFunction) => {
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (!isProduction) {
    // In development, create a mock user if none exists
    if (!req.user) {
      req.user = {
        id: 'dev-user',
        role: 'admin',
        sessionId: 'dev-session',
      };
    }
    return next();
  }

  // In production, require actual authentication
  return authenticate(req, res, next);
};

/**
 * Middleware to extract and validate API key authentication
 */
export const authenticateApiKey = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const apiKey = req.headers['x-api-key'] as string;
    
    if (!apiKey) {
      return res.status(401).json({ error: 'API key required' });
    }

    // TODO: Validate API key against database
    // For now, check against environment variable
    const validApiKey = process.env.API_KEY;
    if (!validApiKey || apiKey !== validApiKey) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    // Create a service user context
    req.user = {
      id: 'api-service',
      role: 'admin',
      sessionId: 'api-session',
    };

    structuredLogger.debug('API key authenticated', {
      path: req.path,
      method: req.method,
    });

    next();
  } catch (error) {
    structuredLogger.warn('API key authentication failed', error, {
      path: req.path,
      method: req.method,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
    });

    return res.status(401).json({ error: 'API key authentication failed' });
  }
};

/**
 * Middleware to rate limit authentication attempts
 */
export const authRateLimit = (() => {
  const attempts = new Map<string, { count: number; lastAttempt: number }>();
  const maxAttempts = 5;
  const windowMs = 15 * 60 * 1000; // 15 minutes

  return (req: Request, res: Response, next: NextFunction) => {
    const identifier = req.ip || 'unknown';
    const now = Date.now();

    const userAttempts = attempts.get(identifier);
    
    if (userAttempts) {
      // Reset counter if window has passed
      if (now - userAttempts.lastAttempt > windowMs) {
        attempts.delete(identifier);
      } else if (userAttempts.count >= maxAttempts) {
        return res.status(429).json({
          error: 'Too many authentication attempts',
          retryAfter: Math.ceil((windowMs - (now - userAttempts.lastAttempt)) / 1000),
        });
      }
    }

    // Continue with request
    next();

    // If auth failed (determined by response status), increment counter
    const originalSend = res.send;
    res.send = function(data) {
      if (res.statusCode === 401 || res.statusCode === 403) {
        const current = attempts.get(identifier) || { count: 0, lastAttempt: 0 };
        attempts.set(identifier, {
          count: current.count + 1,
          lastAttempt: now,
        });
      }
      return originalSend.call(this, data);
    };
  };
})();