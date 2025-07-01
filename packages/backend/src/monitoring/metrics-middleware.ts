import { Request, Response, NextFunction } from 'express';
import { performance } from 'perf_hooks';
import { performanceMonitor } from './performance-monitor.js';
import { structuredLogger } from '../middleware/logging.js';

/**
 * Express middleware for collecting HTTP request metrics
 */
export function metricsMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = performance.now();
    const startTimestamp = Date.now();

    // Record request start
    performanceMonitor.recordMetric('http.request.started', 1, 'count', {
      method: req.method,
      path: sanitizePath(req.path),
      user_agent: req.get('user-agent')?.split(' ')[0] || 'unknown',
    });

    // Override end method to capture response metrics
    const originalEnd = res.end;
    let isFinished = false;

    res.end = function(chunk?: any, encoding?: any, cb?: any) {
      if (!isFinished) {
        isFinished = true;
        
        const responseTime = performance.now() - startTime;
        const responseSize = Buffer.isBuffer(chunk) ? chunk.length : 
                           typeof chunk === 'string' ? Buffer.byteLength(chunk) : 0;

        // Record detailed metrics
        performanceMonitor.recordRequest(responseTime, res.statusCode, req.path);
        
        performanceMonitor.recordMetric('http.response.size', responseSize, 'bytes', {
          method: req.method,
          status_code: res.statusCode.toString(),
          path: sanitizePath(req.path),
        });

        performanceMonitor.recordMetric('http.response.completed', 1, 'count', {
          method: req.method,
          status_code: res.statusCode.toString(),
          path: sanitizePath(req.path),
          response_time_bucket: getResponseTimeBucket(responseTime),
        });

        // Log slow requests
        if (responseTime > 1000) {
          structuredLogger.warn('Slow HTTP request detected', {
            method: req.method,
            path: req.path,
            responseTime: Math.round(responseTime),
            statusCode: res.statusCode,
            userAgent: req.get('user-agent'),
            ip: req.ip,
          });
        }

        // Add performance headers
        res.setHeader('X-Response-Time', `${responseTime.toFixed(2)}ms`);
        res.setHeader('X-Response-Size', responseSize.toString());
      }

      return originalEnd.call(this, chunk, encoding, cb);
    };

    next();
  };
}

/**
 * Middleware for tracking API endpoint usage
 */
export function apiUsageMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const endpoint = `${req.method} ${sanitizePath(req.path)}`;
    const userId = req.user?.id || 'anonymous';
    const userRole = req.user?.role || 'guest';

    // Track API usage by user
    performanceMonitor.recordMetric('api.usage.by_user', 1, 'count', {
      user_id: userId,
      user_role: userRole,
      endpoint,
    });

    // Track API usage by endpoint
    performanceMonitor.recordMetric('api.usage.by_endpoint', 1, 'count', {
      endpoint,
      method: req.method,
    });

    next();
  };
}

/**
 * Middleware for tracking database query performance
 */
export function databaseMetricsMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Add query tracking to request context
    (req as any).trackQuery = (queryName: string, executionTime: number, rowCount?: number) => {
      performanceMonitor.recordMetric('database.query.duration', executionTime, 'ms', {
        query_name: queryName,
        endpoint: sanitizePath(req.path),
      });

      if (rowCount !== undefined) {
        performanceMonitor.recordMetric('database.query.rows', rowCount, 'count', {
          query_name: queryName,
        });
      }

      // Track slow queries
      if (executionTime > 500) {
        performanceMonitor.recordMetric('database.slow_query', 1, 'count', {
          query_name: queryName,
          execution_time: executionTime.toString(),
        });
      }
    };

    next();
  };
}

/**
 * Middleware for tracking cache performance
 */
export function cacheMetricsMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Add cache tracking to request context
    (req as any).trackCache = (operation: 'hit' | 'miss' | 'set' | 'delete', key: string, responseTime?: number) => {
      performanceMonitor.recordMetric(`cache.${operation}`, 1, 'count', {
        cache_key: key.substring(0, 50), // Truncate long keys
        endpoint: sanitizePath(req.path),
      });

      if (responseTime !== undefined) {
        performanceMonitor.recordMetric('cache.response_time', responseTime, 'ms', {
          operation,
          endpoint: sanitizePath(req.path),
        });
      }
    };

    next();
  };
}

/**
 * Middleware for tracking process/session metrics
 */
export function processMetricsMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Add process tracking to request context
    (req as any).trackProcess = (
      action: 'create' | 'terminate' | 'command' | 'error',
      sessionId: string,
      metadata?: Record<string, any>
    ) => {
      performanceMonitor.recordMetric(`process.${action}`, 1, 'count', {
        session_id: sessionId,
        adapter: metadata?.adapter || 'unknown',
        user_id: req.user?.id || 'anonymous',
      });

      if (metadata?.executionTime) {
        performanceMonitor.recordMetric('process.execution_time', metadata.executionTime, 'ms', {
          session_id: sessionId,
          adapter: metadata.adapter || 'unknown',
        });
      }

      if (metadata?.memoryUsage) {
        performanceMonitor.recordMetric('process.memory_usage', metadata.memoryUsage, 'bytes', {
          session_id: sessionId,
          adapter: metadata.adapter || 'unknown',
        });
      }
    };

    next();
  };
}

/**
 * Middleware for tracking WebSocket metrics
 */
export function websocketMetricsMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Add WebSocket tracking to request context
    (req as any).trackWebSocket = (
      event: 'connect' | 'disconnect' | 'message' | 'error',
      socketId: string,
      metadata?: Record<string, any>
    ) => {
      performanceMonitor.recordMetric(`websocket.${event}`, 1, 'count', {
        socket_id: socketId,
        user_id: req.user?.id || 'anonymous',
      });

      if (metadata?.messageSize) {
        performanceMonitor.recordMetric('websocket.message_size', metadata.messageSize, 'bytes', {
          socket_id: socketId,
          message_type: metadata.messageType || 'unknown',
        });
      }

      if (metadata?.latency) {
        performanceMonitor.recordMetric('websocket.latency', metadata.latency, 'ms', {
          socket_id: socketId,
        });
      }
    };

    next();
  };
}

/**
 * Middleware for tracking errors and exceptions
 */
export function errorMetricsMiddleware() {
  return (err: Error, req: Request, res: Response, next: NextFunction) => {
    // Track error occurrence
    performanceMonitor.recordMetric('error.occurrence', 1, 'count', {
      error_type: err.constructor.name,
      status_code: res.statusCode.toString(),
      endpoint: sanitizePath(req.path),
      method: req.method,
    });

    // Track error by user
    if (req.user) {
      performanceMonitor.recordMetric('error.by_user', 1, 'count', {
        user_id: req.user.id,
        user_role: req.user.role,
        error_type: err.constructor.name,
      });
    }

    // Log structured error data
    structuredLogger.error('HTTP error tracked', err, {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      userId: req.user?.id,
      userAgent: req.get('user-agent'),
      ip: req.ip,
    });

    next(err);
  };
}

/**
 * Middleware for collecting custom business metrics
 */
export function businessMetricsMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Add business metrics tracking to request context
    (req as any).trackBusiness = (metric: string, value: number, tags: Record<string, string> = {}) => {
      performanceMonitor.recordMetric(`business.${metric}`, value, 'count', {
        ...tags,
        endpoint: sanitizePath(req.path),
        user_id: req.user?.id || 'anonymous',
        user_role: req.user?.role || 'guest',
      });
    };

    next();
  };
}

/**
 * Combined middleware that includes all metric tracking
 */
export function comprehensiveMetricsMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Apply all tracking capabilities
    metricsMiddleware()(req, res, () => {
      apiUsageMiddleware()(req, res, () => {
        databaseMetricsMiddleware()(req, res, () => {
          cacheMetricsMiddleware()(req, res, () => {
            processMetricsMiddleware()(req, res, () => {
              websocketMetricsMiddleware()(req, res, () => {
                businessMetricsMiddleware()(req, res, next);
              });
            });
          });
        });
      });
    });
  };
}

// Helper functions

function sanitizePath(path: string): string {
  // Replace dynamic segments with placeholders for better aggregation
  return path
    .replace(/\/\d+/g, '/:id')
    .replace(/\/[a-f0-9-]{36}/g, '/:uuid')
    .replace(/\/[a-f0-9-]{24}/g, '/:objectid')
    .replace(/\/[a-zA-Z0-9_-]{20,}/g, '/:token');
}

function getResponseTimeBucket(responseTime: number): string {
  if (responseTime < 100) return 'fast';
  if (responseTime < 500) return 'medium';
  if (responseTime < 1000) return 'slow';
  if (responseTime < 5000) return 'very_slow';
  return 'critical';
}

/**
 * Performance timing decorator for service methods
 */
export function timed(metricName?: string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const name = metricName || `${target.constructor.name}.${propertyName}`;

    descriptor.value = async function (...args: any[]) {
      const timer = performanceMonitor.startTimer(name, {
        class: target.constructor.name,
        method: propertyName,
      });

      try {
        const result = await originalMethod.apply(this, args);
        
        // Track success
        performanceMonitor.recordMetric(`${name}.success`, 1, 'count');
        
        return result;
      } catch (error) {
        // Track error
        performanceMonitor.recordMetric(`${name}.error`, 1, 'count', {
          error_type: (error as Error).constructor.name,
        });
        
        throw error;
      } finally {
        timer();
      }
    };

    return descriptor;
  };
}

/**
 * Rate limiting metrics middleware
 */
export function rateLimitMetricsMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const originalJson = res.json;
    
    res.json = function(body: any) {
      // Check if this is a rate limit response
      if (res.statusCode === 429) {
        performanceMonitor.recordMetric('rate_limit.exceeded', 1, 'count', {
          endpoint: sanitizePath(req.path),
          user_id: req.user?.id || 'anonymous',
          ip: req.ip || 'unknown',
        });
      }
      
      return originalJson.call(this, body);
    };
    
    next();
  };
}