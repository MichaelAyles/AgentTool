import { Redis } from 'ioredis';
import { EventEmitter } from 'events';
import { structuredLogger } from '../middleware/logging.js';

export interface CacheConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
  keyPrefix: string;
  defaultTTL: number;
  maxRetries: number;
  retryDelayOnFailover: number;
  enableOfflineQueue: boolean;
  lazyConnect: boolean;
  connectTimeout: number;
  commandTimeout: number;
}

export interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  ttl: number;
  tags: string[];
  version: number;
}

export interface CacheStatistics {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  errors: number;
  hitRatio: number;
  avgResponseTime: number;
  totalMemoryUsage: number;
  connectedClients: number;
  lastUpdated: Date;
}

export interface CacheStrategy {
  name: string;
  ttl: number;
  tags: string[];
  compression: boolean;
  serializationMethod: 'json' | 'msgpack' | 'custom';
  invalidationStrategy: 'ttl' | 'manual' | 'tag-based' | 'event-driven';
}

export class RedisCacheManager extends EventEmitter {
  private redis: Redis;
  private config: CacheConfig;
  private stats: CacheStatistics;
  private strategies = new Map<string, CacheStrategy>();
  private operationQueue: Array<() => Promise<void>> = [];
  private isProcessingQueue = false;
  private compressionEnabled = true;

  constructor(config: Partial<CacheConfig> = {}) {
    super();

    this.config = {
      host: config.host || process.env.REDIS_HOST || 'localhost',
      port: config.port || parseInt(process.env.REDIS_PORT || '6379'),
      password: config.password || process.env.REDIS_PASSWORD,
      db: config.db || 0,
      keyPrefix: config.keyPrefix || 'vibecode:',
      defaultTTL: config.defaultTTL || 3600, // 1 hour
      maxRetries: config.maxRetries || 3,
      retryDelayOnFailover: config.retryDelayOnFailover || 100,
      enableOfflineQueue: config.enableOfflineQueue ?? true,
      lazyConnect: config.lazyConnect ?? true,
      connectTimeout: config.connectTimeout || 10000,
      commandTimeout: config.commandTimeout || 5000,
    };

    this.stats = this.initializeStats();
    this.initializeRedis();
    this.initializeDefaultStrategies();
    this.startMetricsCollection();
  }

  private initializeRedis(): void {
    this.redis = new Redis({
      host: this.config.host,
      port: this.config.port,
      password: this.config.password,
      db: this.config.db,
      keyPrefix: this.config.keyPrefix,
      maxRetriesPerRequest: this.config.maxRetries,
      retryDelayOnFailover: this.config.retryDelayOnFailover,
      enableOfflineQueue: this.config.enableOfflineQueue,
      lazyConnect: this.config.lazyConnect,
      connectTimeout: this.config.connectTimeout,
      commandTimeout: this.config.commandTimeout,
    });

    this.redis.on('connect', () => {
      structuredLogger.info('Redis cache connected', {
        host: this.config.host,
        port: this.config.port,
        db: this.config.db,
      });
      this.emit('connected');
    });

    this.redis.on('error', error => {
      this.stats.errors++;
      structuredLogger.error('Redis cache error', error);
      this.emit('error', error);
    });

    this.redis.on('close', () => {
      structuredLogger.warn('Redis cache connection closed');
      this.emit('disconnected');
    });

    this.redis.on('reconnecting', delay => {
      structuredLogger.info('Redis cache reconnecting', { delay });
      this.emit('reconnecting', delay);
    });
  }

  private initializeDefaultStrategies(): void {
    // Query result caching strategy
    this.registerStrategy('query-results', {
      name: 'query-results',
      ttl: 1800, // 30 minutes
      tags: ['database', 'queries'],
      compression: true,
      serializationMethod: 'json',
      invalidationStrategy: 'tag-based',
    });

    // Session data caching strategy
    this.registerStrategy('sessions', {
      name: 'sessions',
      ttl: 3600, // 1 hour
      tags: ['auth', 'sessions'],
      compression: false,
      serializationMethod: 'json',
      invalidationStrategy: 'ttl',
    });

    // API response caching strategy
    this.registerStrategy('api-responses', {
      name: 'api-responses',
      ttl: 300, // 5 minutes
      tags: ['api', 'responses'],
      compression: true,
      serializationMethod: 'json',
      invalidationStrategy: 'manual',
    });

    // Process metrics caching strategy
    this.registerStrategy('process-metrics', {
      name: 'process-metrics',
      ttl: 60, // 1 minute
      tags: ['monitoring', 'metrics'],
      compression: false,
      serializationMethod: 'json',
      invalidationStrategy: 'ttl',
    });

    // File system caching strategy
    this.registerStrategy('file-system', {
      name: 'file-system',
      ttl: 900, // 15 minutes
      tags: ['filesystem', 'projects'],
      compression: true,
      serializationMethod: 'json',
      invalidationStrategy: 'event-driven',
    });
  }

  /**
   * Register a caching strategy
   */
  registerStrategy(name: string, strategy: CacheStrategy): void {
    this.strategies.set(name, strategy);
    structuredLogger.info('Cache strategy registered', { name, strategy });
  }

  /**
   * Get data from cache
   */
  async get<T = any>(key: string, strategyName?: string): Promise<T | null> {
    const startTime = Date.now();

    try {
      const strategy = strategyName ? this.strategies.get(strategyName) : null;
      const fullKey = this.buildKey(key, strategy);

      const cached = await this.redis.get(fullKey);
      const responseTime = Date.now() - startTime;

      if (cached) {
        this.stats.hits++;
        this.updateAvgResponseTime(responseTime);

        const entry: CacheEntry<T> = JSON.parse(cached);

        // Check if entry has expired based on custom TTL
        if (this.isExpired(entry)) {
          await this.delete(key, strategyName);
          this.stats.misses++;
          return null;
        }

        this.emit('hit', {
          key: fullKey,
          responseTime,
          strategy: strategyName,
        });
        return entry.data;
      } else {
        this.stats.misses++;
        this.emit('miss', {
          key: fullKey,
          responseTime,
          strategy: strategyName,
        });
        return null;
      }
    } catch (error) {
      this.stats.errors++;
      structuredLogger.error('Cache get error', error as Error, {
        key,
        strategy: strategyName,
      });
      return null;
    }
  }

  /**
   * Set data in cache
   */
  async set<T = any>(
    key: string,
    data: T,
    options: {
      strategyName?: string;
      ttl?: number;
      tags?: string[];
      version?: number;
    } = {}
  ): Promise<boolean> {
    const startTime = Date.now();

    try {
      const strategy = options.strategyName
        ? this.strategies.get(options.strategyName)
        : null;
      const fullKey = this.buildKey(key, strategy);
      const ttl = options.ttl || strategy?.ttl || this.config.defaultTTL;
      const tags = options.tags || strategy?.tags || [];

      const entry: CacheEntry<T> = {
        data,
        timestamp: Date.now(),
        ttl,
        tags,
        version: options.version || 1,
      };

      const serializedData = JSON.stringify(entry);
      const result = await this.redis.setex(fullKey, ttl, serializedData);

      // Store key in tag sets for tag-based invalidation
      if (tags.length > 0) {
        await this.addToTagSets(fullKey, tags);
      }

      const responseTime = Date.now() - startTime;
      this.stats.sets++;
      this.updateAvgResponseTime(responseTime);

      this.emit('set', {
        key: fullKey,
        ttl,
        tags,
        responseTime,
        strategy: options.strategyName,
      });

      return result === 'OK';
    } catch (error) {
      this.stats.errors++;
      structuredLogger.error('Cache set error', error as Error, {
        key,
        strategy: options.strategyName,
      });
      return false;
    }
  }

  /**
   * Delete data from cache
   */
  async delete(key: string, strategyName?: string): Promise<boolean> {
    try {
      const strategy = strategyName ? this.strategies.get(strategyName) : null;
      const fullKey = this.buildKey(key, strategy);

      const result = await this.redis.del(fullKey);

      if (result > 0) {
        this.stats.deletes++;
        this.emit('delete', { key: fullKey, strategy: strategyName });
        return true;
      }

      return false;
    } catch (error) {
      this.stats.errors++;
      structuredLogger.error('Cache delete error', error as Error, {
        key,
        strategy: strategyName,
      });
      return false;
    }
  }

  /**
   * Get multiple keys at once
   */
  async mget<T = any>(
    keys: string[],
    strategyName?: string
  ): Promise<(T | null)[]> {
    try {
      const strategy = strategyName ? this.strategies.get(strategyName) : null;
      const fullKeys = keys.map(key => this.buildKey(key, strategy));

      const results = await this.redis.mget(...fullKeys);

      return results.map((result, index) => {
        if (result) {
          try {
            const entry: CacheEntry<T> = JSON.parse(result);
            if (!this.isExpired(entry)) {
              this.stats.hits++;
              return entry.data;
            } else {
              // Schedule deletion of expired entry
              this.queueOperation(() => this.delete(keys[index], strategyName));
            }
          } catch (parseError) {
            structuredLogger.error('Cache parse error', parseError as Error, {
              key: keys[index],
            });
          }
        }
        this.stats.misses++;
        return null;
      });
    } catch (error) {
      this.stats.errors++;
      structuredLogger.error('Cache mget error', error as Error, {
        keys,
        strategy: strategyName,
      });
      return keys.map(() => null);
    }
  }

  /**
   * Set multiple key-value pairs at once
   */
  async mset<T = any>(
    entries: Array<{ key: string; data: T; options?: any }>,
    strategyName?: string
  ): Promise<boolean> {
    try {
      const strategy = strategyName ? this.strategies.get(strategyName) : null;
      const pipeline = this.redis.pipeline();

      for (const entry of entries) {
        const fullKey = this.buildKey(entry.key, strategy);
        const ttl =
          entry.options?.ttl || strategy?.ttl || this.config.defaultTTL;
        const tags = entry.options?.tags || strategy?.tags || [];

        const cacheEntry: CacheEntry<T> = {
          data: entry.data,
          timestamp: Date.now(),
          ttl,
          tags,
          version: entry.options?.version || 1,
        };

        pipeline.setex(fullKey, ttl, JSON.stringify(cacheEntry));

        // Add to tag sets
        if (tags.length > 0) {
          for (const tag of tags) {
            pipeline.sadd(`${this.config.keyPrefix}tags:${tag}`, fullKey);
          }
        }
      }

      const results = await pipeline.exec();
      const success =
        results?.every(result => result && result[1] === 'OK') ?? false;

      if (success) {
        this.stats.sets += entries.length;
      }

      return success;
    } catch (error) {
      this.stats.errors++;
      structuredLogger.error('Cache mset error', error as Error, {
        entries: entries.length,
        strategy: strategyName,
      });
      return false;
    }
  }

  /**
   * Invalidate cache by tags
   */
  async invalidateByTags(tags: string[]): Promise<number> {
    try {
      let totalDeleted = 0;

      for (const tag of tags) {
        const tagKey = `${this.config.keyPrefix}tags:${tag}`;
        const keys = await this.redis.smembers(tagKey);

        if (keys.length > 0) {
          const deleted = await this.redis.del(...keys);
          totalDeleted += deleted;

          // Remove the tag set itself
          await this.redis.del(tagKey);
        }
      }

      this.emit('invalidated', { tags, keysDeleted: totalDeleted });
      return totalDeleted;
    } catch (error) {
      this.stats.errors++;
      structuredLogger.error('Cache invalidation error', error as Error, {
        tags,
      });
      return 0;
    }
  }

  /**
   * Clear all cache data
   */
  async clear(): Promise<boolean> {
    try {
      await this.redis.flushdb();
      this.emit('cleared');
      return true;
    } catch (error) {
      this.stats.errors++;
      structuredLogger.error('Cache clear error', error as Error);
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStatistics {
    return {
      ...this.stats,
      hitRatio:
        this.stats.hits + this.stats.misses > 0
          ? this.stats.hits / (this.stats.hits + this.stats.misses)
          : 0,
      lastUpdated: new Date(),
    };
  }

  /**
   * Get cache health status
   */
  async getHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    redis: {
      connected: boolean;
      memory: number;
      clients: number;
      uptime: number;
    };
    performance: {
      hitRatio: number;
      avgResponseTime: number;
      errorRate: number;
    };
  }> {
    try {
      const info = await this.redis.info();
      const memoryInfo = await this.redis.info('memory');
      const clientsInfo = await this.redis.info('clients');

      const connected = this.redis.status === 'ready';
      const hitRatio =
        this.stats.hits + this.stats.misses > 0
          ? this.stats.hits / (this.stats.hits + this.stats.misses)
          : 0;
      const errorRate =
        this.stats.errors /
        (this.stats.hits +
          this.stats.misses +
          this.stats.sets +
          this.stats.deletes || 1);

      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      if (!connected || errorRate > 0.1) {
        status = 'unhealthy';
      } else if (hitRatio < 0.5 || this.stats.avgResponseTime > 100) {
        status = 'degraded';
      }

      return {
        status,
        redis: {
          connected,
          memory: this.parseInfoValue(memoryInfo, 'used_memory') || 0,
          clients: this.parseInfoValue(clientsInfo, 'connected_clients') || 0,
          uptime: this.parseInfoValue(info, 'uptime_in_seconds') || 0,
        },
        performance: {
          hitRatio,
          avgResponseTime: this.stats.avgResponseTime,
          errorRate,
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        redis: { connected: false, memory: 0, clients: 0, uptime: 0 },
        performance: { hitRatio: 0, avgResponseTime: 0, errorRate: 1 },
      };
    }
  }

  // Private helper methods

  private buildKey(key: string, strategy?: CacheStrategy | null): string {
    if (strategy) {
      return `${strategy.name}:${key}`;
    }
    return key;
  }

  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp > entry.ttl * 1000;
  }

  private async addToTagSets(key: string, tags: string[]): Promise<void> {
    if (tags.length === 0) return;

    const pipeline = this.redis.pipeline();
    for (const tag of tags) {
      pipeline.sadd(`${this.config.keyPrefix}tags:${tag}`, key);
    }
    await pipeline.exec();
  }

  private updateAvgResponseTime(responseTime: number): void {
    const totalOps =
      this.stats.hits +
      this.stats.misses +
      this.stats.sets +
      this.stats.deletes;
    this.stats.avgResponseTime =
      (this.stats.avgResponseTime * (totalOps - 1) + responseTime) / totalOps;
  }

  private queueOperation(operation: () => Promise<void>): void {
    this.operationQueue.push(operation);
    if (!this.isProcessingQueue) {
      this.processQueue();
    }
  }

  private async processQueue(): Promise<void> {
    this.isProcessingQueue = true;

    while (this.operationQueue.length > 0) {
      const operation = this.operationQueue.shift();
      if (operation) {
        try {
          await operation();
        } catch (error) {
          structuredLogger.error('Queue operation error', error as Error);
        }
      }
    }

    this.isProcessingQueue = false;
  }

  private initializeStats(): CacheStatistics {
    return {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0,
      hitRatio: 0,
      avgResponseTime: 0,
      totalMemoryUsage: 0,
      connectedClients: 0,
      lastUpdated: new Date(),
    };
  }

  private startMetricsCollection(): void {
    setInterval(async () => {
      try {
        const health = await this.getHealth();
        this.stats.totalMemoryUsage = health.redis.memory;
        this.stats.connectedClients = health.redis.clients;

        this.emit('metricsUpdated', this.getStats());
      } catch (error) {
        structuredLogger.error('Metrics collection error', error as Error);
      }
    }, 30000); // Every 30 seconds
  }

  private parseInfoValue(infoString: string, key: string): number | null {
    const match = infoString.match(new RegExp(`${key}:(\\d+)`));
    return match ? parseInt(match[1], 10) : null;
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    await this.redis.quit();
    this.emit('closed');
  }
}

// Factory function for easy initialization
export function createCacheManager(
  config?: Partial<CacheConfig>
): RedisCacheManager {
  return new RedisCacheManager(config);
}

// Export default instance for backward compatibility
export const cacheManager = createCacheManager();
