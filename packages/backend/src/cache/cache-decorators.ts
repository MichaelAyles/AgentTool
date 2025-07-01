import { cacheManager } from './redis-cache-manager.js';
import { structuredLogger } from '../middleware/logging.js';

export interface CacheOptions {
  strategy?: string;
  ttl?: number;
  tags?: string[];
  keyGenerator?: (...args: any[]) => string;
  condition?: (...args: any[]) => boolean;
  version?: number;
}

/**
 * Cache decorator for method results
 */
export function Cacheable(options: CacheOptions = {}) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const cacheKey = options.keyGenerator 
        ? options.keyGenerator(...args)
        : `${target.constructor.name}:${propertyName}:${JSON.stringify(args)}`;

      // Check condition if provided
      if (options.condition && !options.condition(...args)) {
        return originalMethod.apply(this, args);
      }

      try {
        // Try to get from cache first
        const cached = await cacheManager.get(cacheKey, options.strategy);
        if (cached !== null) {
          structuredLogger.debug('Cache hit', { key: cacheKey, method: `${target.constructor.name}.${propertyName}` });
          return cached;
        }

        // Execute original method
        const result = await originalMethod.apply(this, args);

        // Cache the result
        await cacheManager.set(cacheKey, result, {
          strategyName: options.strategy,
          ttl: options.ttl,
          tags: options.tags,
          version: options.version,
        });

        structuredLogger.debug('Cache miss, result cached', { key: cacheKey, method: `${target.constructor.name}.${propertyName}` });
        return result;
      } catch (error) {
        structuredLogger.error('Cache decorator error', error as Error, { 
          key: cacheKey, 
          method: `${target.constructor.name}.${propertyName}` 
        });
        // Fall back to original method
        return originalMethod.apply(this, args);
      }
    };

    return descriptor;
  };
}

/**
 * Cache eviction decorator
 */
export function CacheEvict(options: { 
  strategy?: string; 
  keys?: string[]; 
  tags?: string[]; 
  allEntries?: boolean;
  condition?: (...args: any[]) => boolean;
}) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      // Execute original method first
      const result = await originalMethod.apply(this, args);

      // Check condition if provided
      if (options.condition && !options.condition(...args)) {
        return result;
      }

      try {
        if (options.allEntries) {
          // Clear all cache
          await cacheManager.clear();
          structuredLogger.info('Cache cleared', { method: `${target.constructor.name}.${propertyName}` });
        } else if (options.tags) {
          // Invalidate by tags
          const deleted = await cacheManager.invalidateByTags(options.tags);
          structuredLogger.info('Cache invalidated by tags', { 
            tags: options.tags, 
            deleted, 
            method: `${target.constructor.name}.${propertyName}` 
          });
        } else if (options.keys) {
          // Delete specific keys
          for (const key of options.keys) {
            await cacheManager.delete(key, options.strategy);
          }
          structuredLogger.info('Cache keys evicted', { 
            keys: options.keys, 
            method: `${target.constructor.name}.${propertyName}` 
          });
        }
      } catch (error) {
        structuredLogger.error('Cache eviction error', error as Error, { 
          method: `${target.constructor.name}.${propertyName}` 
        });
      }

      return result;
    };

    return descriptor;
  };
}

/**
 * Cache put decorator - always cache the result
 */
export function CachePut(options: CacheOptions = {}) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const result = await originalMethod.apply(this, args);

      // Check condition if provided
      if (options.condition && !options.condition(...args)) {
        return result;
      }

      const cacheKey = options.keyGenerator 
        ? options.keyGenerator(...args)
        : `${target.constructor.name}:${propertyName}:${JSON.stringify(args)}`;

      try {
        await cacheManager.set(cacheKey, result, {
          strategyName: options.strategy,
          ttl: options.ttl,
          tags: options.tags,
          version: options.version,
        });

        structuredLogger.debug('Result cached', { key: cacheKey, method: `${target.constructor.name}.${propertyName}` });
      } catch (error) {
        structuredLogger.error('Cache put error', error as Error, { 
          key: cacheKey, 
          method: `${target.constructor.name}.${propertyName}` 
        });
      }

      return result;
    };

    return descriptor;
  };
}

/**
 * Simple cache key generator utilities
 */
export const CacheKeyGenerators = {
  /**
   * Generate key from user ID and additional parameters
   */
  byUser: (userId: string, ...params: any[]) => `user:${userId}:${JSON.stringify(params)}`,

  /**
   * Generate key from project ID and additional parameters
   */
  byProject: (projectId: string, ...params: any[]) => `project:${projectId}:${JSON.stringify(params)}`,

  /**
   * Generate key from session ID and additional parameters
   */
  bySession: (sessionId: string, ...params: any[]) => `session:${sessionId}:${JSON.stringify(params)}`,

  /**
   * Generate key from adapter name and additional parameters
   */
  byAdapter: (adapterName: string, ...params: any[]) => `adapter:${adapterName}:${JSON.stringify(params)}`,

  /**
   * Generate key from timestamp-based bucketing (useful for time-series data)
   */
  byTimeBucket: (bucketSize: number, ...params: any[]) => {
    const bucket = Math.floor(Date.now() / (bucketSize * 1000));
    return `time:${bucket}:${JSON.stringify(params)}`;
  },

  /**
   * Generate key with hash for very long parameter lists
   */
  withHash: (...params: any[]) => {
    const paramString = JSON.stringify(params);
    const hash = require('crypto').createHash('md5').update(paramString).digest('hex');
    return `hash:${hash}`;
  },
};

/**
 * Cache condition utilities
 */
export const CacheConditions = {
  /**
   * Cache only for specific user roles
   */
  forRoles: (allowedRoles: string[]) => (user: any) => 
    user && user.role && allowedRoles.includes(user.role),

  /**
   * Cache only during business hours
   */
  duringBusinessHours: () => {
    const hour = new Date().getHours();
    return hour >= 9 && hour <= 17;
  },

  /**
   * Cache only for non-admin users
   */
  forNonAdmins: (user: any) => user && user.role !== 'admin',

  /**
   * Cache only for GET requests
   */
  forGetRequests: (req: any) => req && req.method === 'GET',

  /**
   * Cache only when data size is below threshold
   */
  belowSizeThreshold: (threshold: number) => (data: any) => 
    JSON.stringify(data).length <= threshold,
};