import { Request, Response, NextFunction } from 'express';
import { cacheManager } from './redis-cache-manager.js';
import { structuredLogger } from '../middleware/logging.js';

export interface CacheMiddlewareOptions {
  strategy?: string;
  ttl?: number;
  tags?: string[];
  keyGenerator?: (req: Request) => string;
  skipCondition?: (req: Request, res: Response) => boolean;
  vary?: string[];
  includeHeaders?: string[];
  excludeHeaders?: string[];
  onHit?: (req: Request, res: Response, data: any) => void;
  onMiss?: (req: Request, res: Response) => void;
  onError?: (req: Request, res: Response, error: Error) => void;
}

/**
 * Express middleware for HTTP response caching
 */
export function cacheMiddleware(options: CacheMiddlewareOptions = {}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Skip caching for non-GET requests by default
    if (req.method !== 'GET') {
      return next();
    }

    // Check skip condition
    if (options.skipCondition && options.skipCondition(req, res)) {
      return next();
    }

    try {
      const cacheKey = options.keyGenerator
        ? options.keyGenerator(req)
        : generateDefaultCacheKey(req, options);

      // Try to get from cache
      const cached = await cacheManager.get(cacheKey, options.strategy);

      if (cached) {
        // Cache hit
        const { statusCode, headers, body, timestamp } = cached;

        // Set headers
        if (headers) {
          for (const [key, value] of Object.entries(headers)) {
            res.setHeader(key, value as string);
          }
        }

        // Add cache headers
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('X-Cache-Key', cacheKey);
        res.setHeader('X-Cache-Timestamp', timestamp);

        // Handle Vary headers
        if (options.vary) {
          res.setHeader('Vary', options.vary.join(', '));
        }

        if (options.onHit) {
          options.onHit(req, res, cached);
        }

        structuredLogger.debug('HTTP cache hit', {
          method: req.method,
          url: req.originalUrl,
          cacheKey,
          strategy: options.strategy,
        });

        return res.status(statusCode).send(body);
      }

      // Cache miss - intercept response
      const originalSend = res.send;
      const originalJson = res.json;
      const originalStatus = res.status;
      let statusCode = 200;
      let responseData: any;

      // Override status method to capture status code
      res.status = function (code: number) {
        statusCode = code;
        return originalStatus.call(this, code);
      };

      // Override send method
      res.send = function (data: any) {
        responseData = data;
        return originalSend.call(this, data);
      };

      // Override json method
      res.json = function (data: any) {
        responseData = data;
        return originalJson.call(this, data);
      };

      // Add response finished handler
      res.on('finish', async () => {
        try {
          // Only cache successful responses
          if (statusCode >= 200 && statusCode < 300 && responseData) {
            const headers = extractHeaders(res, options);

            const cacheData = {
              statusCode,
              headers,
              body: responseData,
              timestamp: new Date().toISOString(),
            };

            await cacheManager.set(cacheKey, cacheData, {
              strategyName: options.strategy,
              ttl: options.ttl,
              tags: options.tags,
            });

            structuredLogger.debug('HTTP response cached', {
              method: req.method,
              url: req.originalUrl,
              cacheKey,
              statusCode,
              strategy: options.strategy,
            });
          }
        } catch (error) {
          if (options.onError) {
            options.onError(req, res, error as Error);
          }
          structuredLogger.error('HTTP cache storage error', error as Error, {
            method: req.method,
            url: req.originalUrl,
            cacheKey,
          });
        }
      });

      // Add cache miss headers
      res.setHeader('X-Cache', 'MISS');
      res.setHeader('X-Cache-Key', cacheKey);

      if (options.onMiss) {
        options.onMiss(req, res);
      }

      next();
    } catch (error) {
      if (options.onError) {
        options.onError(req, res, error as Error);
      }
      structuredLogger.error('HTTP cache middleware error', error as Error, {
        method: req.method,
        url: req.originalUrl,
      });
      next();
    }
  };
}

/**
 * Middleware for cache invalidation
 */
export function cacheInvalidationMiddleware(options: {
  tags?: string[];
  keys?: string[];
  pattern?: RegExp;
  condition?: (req: Request, res: Response) => boolean;
}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Execute next middleware first
    next();

    // Invalidate cache after response
    res.on('finish', async () => {
      try {
        // Check condition
        if (options.condition && !options.condition(req, res)) {
          return;
        }

        // Only invalidate on successful mutations
        if (
          req.method !== 'GET' &&
          res.statusCode >= 200 &&
          res.statusCode < 300
        ) {
          if (options.tags) {
            const deleted = await cacheManager.invalidateByTags(options.tags);
            structuredLogger.info('Cache invalidated by tags', {
              tags: options.tags,
              deleted,
              method: req.method,
              url: req.originalUrl,
            });
          }

          if (options.keys) {
            for (const key of options.keys) {
              await cacheManager.delete(key);
            }
            structuredLogger.info('Cache keys invalidated', {
              keys: options.keys,
              method: req.method,
              url: req.originalUrl,
            });
          }
        }
      } catch (error) {
        structuredLogger.error('Cache invalidation error', error as Error, {
          method: req.method,
          url: req.originalUrl,
        });
      }
    });
  };
}

/**
 * Middleware for adding cache headers
 */
export function cacheHeadersMiddleware(options: {
  maxAge?: number;
  sMaxAge?: number;
  mustRevalidate?: boolean;
  noCache?: boolean;
  noStore?: boolean;
  private?: boolean;
  public?: boolean;
  immutable?: boolean;
  staleWhileRevalidate?: number;
  staleIfError?: number;
}) {
  return (req: Request, res: Response, next: NextFunction) => {
    const cacheControl: string[] = [];

    if (options.private) cacheControl.push('private');
    if (options.public) cacheControl.push('public');
    if (options.noCache) cacheControl.push('no-cache');
    if (options.noStore) cacheControl.push('no-store');
    if (options.mustRevalidate) cacheControl.push('must-revalidate');
    if (options.immutable) cacheControl.push('immutable');

    if (options.maxAge !== undefined) {
      cacheControl.push(`max-age=${options.maxAge}`);
    }

    if (options.sMaxAge !== undefined) {
      cacheControl.push(`s-maxage=${options.sMaxAge}`);
    }

    if (options.staleWhileRevalidate !== undefined) {
      cacheControl.push(
        `stale-while-revalidate=${options.staleWhileRevalidate}`
      );
    }

    if (options.staleIfError !== undefined) {
      cacheControl.push(`stale-if-error=${options.staleIfError}`);
    }

    if (cacheControl.length > 0) {
      res.setHeader('Cache-Control', cacheControl.join(', '));
    }

    next();
  };
}

/**
 * Session-based cache middleware
 */
export function sessionCacheMiddleware(
  options: {
    strategy?: string;
    ttl?: number;
    keyPrefix?: string;
  } = {}
) {
  return cacheMiddleware({
    strategy: options.strategy || 'sessions',
    ttl: options.ttl || 3600,
    keyGenerator: req => {
      const sessionId = (req as any).session?.id || (req as any).sessionID;
      const prefix = options.keyPrefix || 'session';
      return `${prefix}:${sessionId}:${req.method}:${req.originalUrl}`;
    },
    tags: ['sessions', 'user-data'],
  });
}

/**
 * API response cache middleware
 */
export function apiCacheMiddleware(
  options: {
    ttl?: number;
    tags?: string[];
    varyByUser?: boolean;
    varyByRole?: boolean;
  } = {}
) {
  return cacheMiddleware({
    strategy: 'api-responses',
    ttl: options.ttl || 300,
    tags: options.tags || ['api', 'responses'],
    keyGenerator: req => {
      let key = `api:${req.method}:${req.originalUrl}`;

      if (options.varyByUser && req.user) {
        key += `:user:${req.user.id}`;
      }

      if (options.varyByRole && req.user) {
        key += `:role:${req.user.role}`;
      }

      return key;
    },
    vary: ['Authorization', 'User-Agent'],
  });
}

// Helper functions

function generateDefaultCacheKey(
  req: Request,
  options: CacheMiddlewareOptions
): string {
  const baseKey = `${req.method}:${req.originalUrl}`;

  // Include query parameters
  const queryString = new URLSearchParams(req.query as any).toString();
  const key = queryString ? `${baseKey}?${queryString}` : baseKey;

  // Include user ID if available
  if (req.user) {
    return `user:${req.user.id}:${key}`;
  }

  return key;
}

function extractHeaders(
  res: Response,
  options: CacheMiddlewareOptions
): Record<string, string> {
  const headers: Record<string, string> = {};

  // Include specific headers
  if (options.includeHeaders) {
    for (const header of options.includeHeaders) {
      const value = res.getHeader(header);
      if (value) {
        headers[header] = String(value);
      }
    }
  } else {
    // Default headers to cache
    const defaultHeaders = ['content-type', 'etag', 'last-modified'];
    for (const header of defaultHeaders) {
      const value = res.getHeader(header);
      if (value) {
        headers[header] = String(value);
      }
    }
  }

  // Exclude specific headers
  if (options.excludeHeaders) {
    for (const header of options.excludeHeaders) {
      delete headers[header];
    }
  }

  return headers;
}
