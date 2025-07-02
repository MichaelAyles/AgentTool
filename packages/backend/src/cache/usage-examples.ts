/**
 * Cache Integration Examples
 *
 * This file demonstrates how to integrate Redis caching throughout the application
 */

import { cacheManager } from './redis-cache-manager.js';
import {
  cacheMiddleware,
  apiCacheMiddleware,
  sessionCacheMiddleware,
} from './cache-middleware.js';
import {
  Cacheable,
  CacheEvict,
  CacheKeyGenerators,
} from './cache-decorators.js';
import { cacheService } from '../services/cache-service.js';

// Example 1: Database Service with Caching
export class DatabaseServiceExample {
  @Cacheable({
    strategy: 'query-results',
    ttl: 1800, // 30 minutes
    tags: ['database', 'users'],
    keyGenerator: (userId: string) => `user:${userId}`,
  })
  async getUserById(userId: string) {
    // Simulated database call
    console.log('Fetching user from database:', userId);
    return { id: userId, name: 'John Doe', email: 'john@example.com' };
  }

  @Cacheable({
    strategy: 'query-results',
    ttl: 900, // 15 minutes
    tags: ['database', 'projects'],
    keyGenerator: (userId: string) => `user:${userId}:projects`,
  })
  async getUserProjects(userId: string) {
    console.log('Fetching user projects from database:', userId);
    return [
      { id: '1', name: 'Project A', userId },
      { id: '2', name: 'Project B', userId },
    ];
  }

  @CacheEvict({
    tags: ['database', 'users'],
  })
  async updateUser(userId: string, userData: any) {
    console.log('Updating user in database:', userId);
    // Database update logic here
    return { ...userData, id: userId, updatedAt: new Date() };
  }

  @CacheEvict({
    tags: ['database', 'projects'],
    condition: (userId: string) => Boolean(userId),
  })
  async createProject(userId: string, projectData: any) {
    console.log('Creating project for user:', userId);
    return { ...projectData, id: Date.now().toString(), userId };
  }
}

// Example 2: API Service with Manual Caching
export class ApiServiceExample {
  async getAdapterList() {
    const cacheKey = 'adapters:list';

    // Try cache first
    let adapters = await cacheManager.get(cacheKey, 'api-responses');

    if (!adapters) {
      // Fetch from source
      console.log('Fetching adapters from registry');
      adapters = [
        { name: 'claude-code', version: '1.0.0', status: 'active' },
        { name: 'gemini-cli', version: '0.9.0', status: 'active' },
      ];

      // Cache for 5 minutes
      await cacheManager.set(cacheKey, adapters, {
        strategyName: 'api-responses',
        ttl: 300,
        tags: ['adapters', 'registry'],
      });
    }

    return adapters;
  }

  async getProjectMetrics(projectId: string) {
    const cacheKey = CacheKeyGenerators.byProject(projectId, 'metrics');

    // Check cache
    let metrics = await cacheManager.get(cacheKey, 'process-metrics');

    if (!metrics) {
      console.log('Computing project metrics:', projectId);
      metrics = {
        sessions: 15,
        commands: 342,
        uptime: '2h 30m',
        lastActivity: new Date().toISOString(),
      };

      // Cache for 1 minute (metrics change frequently)
      await cacheManager.set(cacheKey, metrics, {
        strategyName: 'process-metrics',
        ttl: 60,
        tags: ['metrics', 'projects'],
      });
    }

    return metrics;
  }

  async invalidateProjectData(projectId: string) {
    // Invalidate all project-related cache
    await cacheManager.invalidateByTags(['projects', `project:${projectId}`]);
    console.log('Project cache invalidated:', projectId);
  }
}

// Example 3: Express Middleware Usage
export function setupCacheMiddleware(app: any) {
  // Cache all GET requests to /api/adapters for 5 minutes
  app.get(
    '/api/adapters',
    apiCacheMiddleware({ ttl: 300, tags: ['adapters'] }),
    (req: any, res: any) => {
      res.json([
        { name: 'claude-code', status: 'active' },
        { name: 'gemini-cli', status: 'active' },
      ]);
    }
  );

  // Cache user-specific project lists for 10 minutes
  app.get(
    '/api/projects',
    cacheMiddleware({
      strategy: 'api-responses',
      ttl: 600,
      tags: ['projects'],
      keyGenerator: req => `user:${req.user?.id}:projects`,
      skipCondition: req => req.user?.role === 'admin', // Don't cache for admins
    }),
    (req: any, res: any) => {
      // Fetch user projects
      res.json([{ id: '1', name: 'My Project' }]);
    }
  );

  // Session-specific caching
  app.get(
    '/api/session-data',
    sessionCacheMiddleware({ ttl: 3600 }),
    (req: any, res: any) => {
      res.json({
        sessionId: req.session?.id,
        preferences: { theme: 'dark', layout: 'compact' },
      });
    }
  );
}

// Example 4: Process Manager with Caching
export class ProcessManagerExample {
  @Cacheable({
    strategy: 'process-metrics',
    ttl: 60, // 1 minute
    tags: ['processes', 'metrics'],
    keyGenerator: () => 'processes:all:metrics',
  })
  async getAllProcessMetrics() {
    console.log('Computing all process metrics');
    return {
      totalProcesses: 5,
      activeProcesses: 3,
      totalMemory: 512,
      totalCPU: 45.2,
      timestamp: new Date().toISOString(),
    };
  }

  @Cacheable({
    strategy: 'process-metrics',
    ttl: 30, // 30 seconds
    tags: ['processes', 'session'],
    keyGenerator: (sessionId: string) =>
      CacheKeyGenerators.bySession(sessionId, 'metrics'),
  })
  async getSessionMetrics(sessionId: string) {
    console.log('Computing session metrics:', sessionId);
    return {
      sessionId,
      memory: 128,
      cpu: 12.5,
      uptime: 1800,
      commands: 24,
    };
  }

  @CacheEvict({
    tags: ['processes', 'metrics'],
  })
  async terminateSession(sessionId: string) {
    console.log('Terminating session:', sessionId);
    // Process termination logic
    return { sessionId, status: 'terminated' };
  }
}

// Example 5: File System Service with Caching
export class FileSystemServiceExample {
  @Cacheable({
    strategy: 'file-system',
    ttl: 900, // 15 minutes
    tags: ['filesystem', 'directories'],
    keyGenerator: (path: string) =>
      `fs:dir:${Buffer.from(path).toString('base64')}`,
  })
  async getDirectoryContents(path: string) {
    console.log('Reading directory:', path);
    // Simulated file system read
    return [
      { name: 'src', type: 'directory', size: 0 },
      { name: 'package.json', type: 'file', size: 1024 },
      { name: 'README.md', type: 'file', size: 2048 },
    ];
  }

  @CacheEvict({
    tags: ['filesystem'],
    condition: (path: string) => !path.includes('node_modules'), // Don't invalidate for node_modules
  })
  async writeFile(path: string, content: string) {
    console.log('Writing file:', path);
    // File write logic
    return { path, size: content.length, written: true };
  }
}

// Example 6: Background Cache Management
export class CacheMaintenanceExample {
  async performMaintenanceTasks() {
    // Clear expired entries
    await this.clearExpiredEntries();

    // Warm frequently accessed data
    await this.warmFrequentData();

    // Optimize cache strategies
    await this.optimizeStrategies();

    // Generate cache report
    return this.generateCacheReport();
  }

  private async clearExpiredEntries() {
    // This would be implemented in the cache manager
    console.log('Clearing expired cache entries');
  }

  private async warmFrequentData() {
    // Preload commonly accessed data
    const frequentUsers = ['user1', 'user2', 'user3'];

    for (const userId of frequentUsers) {
      await cacheService.warmCache('projects', [userId]);
    }

    console.log('Cache warming completed');
  }

  private async optimizeStrategies() {
    const optimization = await cacheService.optimizeCacheStrategies();
    console.log('Cache optimization:', optimization);
  }

  private async generateCacheReport() {
    const stats = cacheManager.getStats();
    const health = await cacheManager.getHealth();

    return {
      summary: {
        hitRatio: `${(stats.hitRatio * 100).toFixed(1)}%`,
        avgResponseTime: `${stats.avgResponseTime.toFixed(1)}ms`,
        totalOperations: stats.hits + stats.misses + stats.sets + stats.deletes,
        errorRate: `${((stats.errors / (stats.hits + stats.misses + stats.sets + stats.deletes || 1)) * 100).toFixed(2)}%`,
      },
      health: health.status,
      recommendations: [
        'Cache performance is optimal',
        'Consider increasing TTL for stable data',
        'Monitor memory usage trends',
      ],
      timestamp: new Date().toISOString(),
    };
  }
}

// Example 7: Cache Event Handling
export function setupCacheEventHandlers() {
  cacheManager.on('hit', data => {
    console.log('Cache hit:', data.key, `(${data.responseTime}ms)`);
  });

  cacheManager.on('miss', data => {
    console.log('Cache miss:', data.key, `(${data.responseTime}ms)`);
  });

  cacheManager.on('error', error => {
    console.error('Cache error:', error.message);
    // Could trigger alerts or fallback mechanisms
  });

  cacheManager.on('connected', () => {
    console.log('Cache connected successfully');
  });

  cacheManager.on('disconnected', () => {
    console.warn(
      'Cache disconnected - operations will fall back to direct calls'
    );
  });
}

// Usage Examples Summary:
/*

1. Decorator-based caching for service methods
2. Manual cache operations in API services  
3. Express middleware for HTTP response caching
4. Process and metrics caching with short TTLs
5. File system caching with path-based keys
6. Background maintenance and optimization
7. Event-driven cache monitoring

Key Benefits:
- Improved response times for frequently accessed data
- Reduced database load
- Scalable caching strategies per data type
- Automatic cache invalidation on data changes
- Comprehensive monitoring and analytics
- Graceful fallbacks when cache is unavailable

*/
