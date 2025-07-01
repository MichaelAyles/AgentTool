import { Request, Response, NextFunction } from 'express';
import { RateLimitError, UnauthorizedError } from './error-handler.js';

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const rateLimitStore: RateLimitStore = {};

export const rateLimit = (options: {
  windowMs: number;
  max: number;
  message?: string;
  keyGenerator?: (req: Request) => string;
}) => {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes
    max = 100,
    message = 'Too many requests',
    keyGenerator = (req: Request) => req.ip,
  } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    const key = keyGenerator(req);
    const now = Date.now();
    
    // Clean up expired entries
    if (rateLimitStore[key] && now > rateLimitStore[key].resetTime) {
      delete rateLimitStore[key];
    }
    
    if (!rateLimitStore[key]) {
      rateLimitStore[key] = {
        count: 1,
        resetTime: now + windowMs,
      };
    } else {
      rateLimitStore[key].count++;
    }
    
    const { count, resetTime } = rateLimitStore[key];
    
    // Set rate limit headers
    res.set({
      'X-RateLimit-Limit': max.toString(),
      'X-RateLimit-Remaining': Math.max(0, max - count).toString(),
      'X-RateLimit-Reset': new Date(resetTime).toISOString(),
    });
    
    if (count > max) {
      throw new RateLimitError(message);
    }
    
    next();
  };
};

export const cors = (options: {
  origin?: string | string[] | boolean;
  methods?: string[];
  credentials?: boolean;
  maxAge?: number;
} = {}) => {
  const {
    origin = '*',
    methods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials = false,
    maxAge = 86400, // 24 hours
  } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    const requestOrigin = req.headers.origin;
    
    // Set Access-Control-Allow-Origin
    if (origin === true) {
      res.setHeader('Access-Control-Allow-Origin', requestOrigin || '*');
    } else if (typeof origin === 'string') {
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else if (Array.isArray(origin)) {
      if (requestOrigin && origin.includes(requestOrigin)) {
        res.setHeader('Access-Control-Allow-Origin', requestOrigin);
      }
    }
    
    // Set other CORS headers
    res.setHeader('Access-Control-Allow-Methods', methods.join(', '));
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.setHeader('Access-Control-Max-Age', maxAge.toString());
    
    if (credentials) {
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    
    next();
  };
};

export const helmet = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    
    // Content Security Policy
    res.setHeader('Content-Security-Policy', [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "connect-src 'self' ws: wss:",
      "font-src 'self'",
      "object-src 'none'",
      "media-src 'self'",
      "frame-src 'none'",
    ].join('; '));
    
    next();
  };
};

export const apiKeyAuth = (options: {
  header?: string;
  query?: string;
  apiKeys?: string[];
}) => {
  const {
    header = 'x-api-key',
    query = 'api_key',
    apiKeys = process.env.API_KEYS?.split(',') || [],
  } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    const apiKey = req.headers[header] as string || req.query[query] as string;
    
    if (!apiKey) {
      throw new UnauthorizedError('API key is required');
    }
    
    if (!apiKeys.includes(apiKey)) {
      throw new UnauthorizedError('Invalid API key');
    }
    
    next();
  };
};

export const sanitizeInput = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Basic input sanitization
    const sanitize = (obj: any): any => {
      if (typeof obj === 'string') {
        // Remove potential XSS patterns
        return obj
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/javascript:/gi, '')
          .replace(/on\w+\s*=/gi, '');
      }
      
      if (Array.isArray(obj)) {
        return obj.map(sanitize);
      }
      
      if (obj && typeof obj === 'object') {
        const sanitized: any = {};
        for (const [key, value] of Object.entries(obj)) {
          sanitized[key] = sanitize(value);
        }
        return sanitized;
      }
      
      return obj;
    };
    
    if (req.body) {
      req.body = sanitize(req.body);
    }
    
    if (req.query) {
      req.query = sanitize(req.query);
    }
    
    next();
  };
};