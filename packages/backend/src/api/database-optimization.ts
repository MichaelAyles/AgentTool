import { Router } from 'express';
import { authenticate } from '../auth/middleware.js';
import { requireAdmin, requirePermission } from '../auth/permissions.js';
import { optimizedDb } from '../database/optimized-database.js';
import { getQueryAnalyzer } from '../database/query-analyzer.js';
import { comprehensiveAuditLogger, AuditCategory } from '../security/audit-logger.js';
import { SecurityLevel } from '../security/types.js';

const router = Router();

// Simple input sanitization function
const sanitizeInput = (input: string): string => {
  if (typeof input !== 'string') return '';
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim();
};

/**
 * Get database performance metrics
 */
router.get('/metrics', authenticate, requirePermission('system', 'read'), async (req, res) => {
  try {
    const dbInfo = optimizedDb.getDatabaseInfo();
    const queryMetrics = optimizedDb.getQueryMetrics();
    const analyzer = getQueryAnalyzer();
    const analysisReport = analyzer.getAnalysisReport();

    const metrics = {
      database: {
        path: dbInfo.path,
        size: {
          pageSize: dbInfo.pageSize,
          pageCount: dbInfo.pageCount,
          totalSize: (dbInfo.pageSize * dbInfo.pageCount) / (1024 * 1024), // MB
        },
        configuration: {
          journalMode: dbInfo.journalMode,
          synchronous: dbInfo.synchronous,
          cacheSize: dbInfo.cacheSize,
          foreignKeys: dbInfo.foreignKeys,
        },
        tables: dbInfo.tableSizes,
      },
      queries: {
        total: queryMetrics.queryCount,
        averageTime: Math.round(queryMetrics.averageTime * 100) / 100,
        totalTime: Math.round(queryMetrics.totalTime),
        slowQueries: queryMetrics.slowQueries.length,
        cache: {
          hits: queryMetrics.cacheHits,
          misses: queryMetrics.cacheMisses,
          hitRatio: queryMetrics.cacheHits + queryMetrics.cacheMisses > 0 
            ? Math.round((queryMetrics.cacheHits / (queryMetrics.cacheHits + queryMetrics.cacheMisses)) * 100) 
            : 0,
        },
      },
      analysis: {
        totalQueries: analysisReport.summary.totalQueries,
        slowQueries: analysisReport.summary.slowQueries,
        averageExecutionTime: Math.round(analysisReport.summary.averageExecutionTime * 100) / 100,
        recommendations: analysisReport.recommendations.length,
        performance: calculateOverallPerformance(queryMetrics, analysisReport),
      },
      timestamp: new Date().toISOString(),
    };

    res.json({
      success: true,
      metrics,
    });
  } catch (error) {
    console.error('Error getting database metrics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get database metrics',
    });
  }
});

/**
 * Get detailed query analysis
 */
router.get('/analysis', authenticate, requirePermission('system', 'read'), async (req, res) => {
  try {
    const { 
      limit = '50', 
      sortBy = 'averageTime', 
      order = 'desc',
      performance = 'all' 
    } = req.query;

    const analyzer = getQueryAnalyzer();
    const report = analyzer.getAnalysisReport();

    // Filter by performance if specified
    let queries = report.queries;
    if (performance !== 'all') {
      queries = queries.filter(q => q.performance === performance);
    }

    // Sort queries
    const sortField = sanitizeInput(sortBy as string);
    const sortOrder = order === 'asc' ? 1 : -1;
    
    queries.sort((a: any, b: any) => {
      const aVal = a[sortField] || 0;
      const bVal = b[sortField] || 0;
      return (aVal - bVal) * sortOrder;
    });

    // Limit results
    const limitNum = Math.min(parseInt(limit as string) || 50, 200);
    queries = queries.slice(0, limitNum);

    const analysis = {
      summary: report.summary,
      queries: queries.map(q => ({
        ...q,
        recommendations: q.recommendations.length,
      })),
      indexUsage: Array.from(report.indexUsage.entries()).map(([index, count]) => ({
        index,
        usageCount: count,
      })),
      globalRecommendations: report.recommendations,
    };

    res.json({
      success: true,
      analysis,
      pagination: {
        limit: limitNum,
        total: report.queries.length,
        sortBy: sortField,
        order,
      },
    });
  } catch (error) {
    console.error('Error getting query analysis:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get query analysis',
    });
  }
});

/**
 * Get optimization recommendations
 */
router.get('/recommendations', authenticate, requirePermission('system', 'read'), async (req, res) => {
  try {
    const analyzer = getQueryAnalyzer();
    const report = analyzer.getAnalysisReport();
    const indexSuggestions = analyzer.suggestIndexes();

    const recommendations = {
      query: report.recommendations,
      indexes: indexSuggestions,
      summary: {
        totalRecommendations: report.recommendations.length + indexSuggestions.length,
        critical: report.recommendations.filter(r => r.priority === 'critical').length,
        high: report.recommendations.filter(r => r.priority === 'high').length,
        medium: report.recommendations.filter(r => r.priority === 'medium').length,
        low: report.recommendations.filter(r => r.priority === 'low').length,
      },
      prioritized: [
        ...report.recommendations,
        ...indexSuggestions.map(idx => ({
          type: 'index' as const,
          priority: idx.priority,
          description: `Add index on ${idx.tableName}(${idx.columns.join(', ')})`,
          implementation: `CREATE INDEX idx_${idx.tableName}_${idx.columns.join('_')} ON ${idx.tableName}(${idx.columns.join(', ')})`,
          estimatedImpact: idx.estimatedImpact,
          effort: 'low' as const,
        })),
      ].sort((a, b) => {
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        return (priorityOrder as any)[a.priority] - (priorityOrder as any)[b.priority];
      }),
    };

    res.json({
      success: true,
      recommendations,
    });
  } catch (error) {
    console.error('Error getting recommendations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get optimization recommendations',
    });
  }
});

/**
 * Optimize a specific query
 */
router.post('/optimize-query', authenticate, requirePermission('system', 'write'), async (req, res) => {
  try {
    const { query } = req.body;
    
    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Query is required and must be a string',
      });
    }

    const analyzer = getQueryAnalyzer();
    const optimization = analyzer.optimizeQuery(query);

    const userId = req.user?.id;
    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'query_optimization_requested',
      resourceType: 'database',
      userId,
      sessionId: (req as any).session?.id || (req as any).sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: 'success',
      severity: SecurityLevel.SAFE,
      details: {
        originalQuery: query.substring(0, 200) + (query.length > 200 ? '...' : ''),
        optimizationsFound: optimization.recommendations.length,
      },
    });

    res.json({
      success: true,
      optimization,
    });
  } catch (error) {
    console.error('Error optimizing query:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to optimize query',
    });
  }
});

/**
 * Run database optimization
 */
router.post('/optimize', authenticate, requireAdmin(), async (req, res) => {
  try {
    const startTime = Date.now();
    
    // Run database optimization
    optimizedDb.optimizeDatabase();
    
    const duration = Date.now() - startTime;
    const userId = req.user?.id;

    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'database_optimized',
      resourceType: 'database',
      userId,
      sessionId: (req as any).session?.id || (req as any).sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: 'success',
      severity: SecurityLevel.MODERATE,
      details: {
        duration,
        optimizationType: 'full_optimization',
      },
    });

    res.json({
      success: true,
      message: 'Database optimization completed successfully',
      duration,
    });
  } catch (error) {
    console.error('Error running database optimization:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to run database optimization',
    });
  }
});

/**
 * Clear query cache
 */
router.post('/cache/clear', authenticate, requireAdmin(), async (req, res) => {
  try {
    optimizedDb.clearQueryCache();

    const userId = req.user?.id;
    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'query_cache_cleared',
      resourceType: 'database',
      userId,
      sessionId: (req as any).session?.id || (req as any).sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: 'success',
      severity: SecurityLevel.SAFE,
      details: {},
    });

    res.json({
      success: true,
      message: 'Query cache cleared successfully',
    });
  } catch (error) {
    console.error('Error clearing query cache:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear query cache',
    });
  }
});

/**
 * Get slow query details
 */
router.get('/slow-queries', authenticate, requirePermission('system', 'read'), async (req, res) => {
  try {
    const { 
      limit = '20',
      threshold = '100' // ms
    } = req.query;

    const queryMetrics = optimizedDb.getQueryMetrics();
    const analyzer = getQueryAnalyzer();
    const report = analyzer.getAnalysisReport();

    const thresholdMs = parseInt(threshold as string);
    const limitNum = Math.min(parseInt(limit as string) || 20, 100);

    const slowQueries = [
      ...queryMetrics.slowQueries,
      ...report.summary.topSlowQueries.filter(q => q.averageTime >= thresholdMs),
    ]
    .sort((a, b) => {
      const aTime = 'time' in a ? a.time : a.averageTime;
      const bTime = 'time' in b ? b.time : b.averageTime;
      return bTime - aTime;
    })
    .slice(0, limitNum);

    const analysis = {
      threshold: thresholdMs,
      totalSlowQueries: slowQueries.length,
      queries: slowQueries.map(q => ({
        query: 'query' in q ? q.query : q.queryPattern,
        time: 'time' in q ? q.time : q.averageTime,
        timestamp: 'timestamp' in q ? q.timestamp : q.lastExecuted,
        executionCount: 'executionCount' in q ? q.executionCount : 1,
        performance: 'performance' in q ? q.performance : 'poor',
      })),
    };

    res.json({
      success: true,
      analysis,
    });
  } catch (error) {
    console.error('Error getting slow queries:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get slow queries',
    });
  }
});

/**
 * Get database schema information
 */
router.get('/schema', authenticate, requirePermission('system', 'read'), async (req, res) => {
  try {
    const analyzer = getQueryAnalyzer();
    const schemaAnalysis = analyzer.analyzeSchema(optimizedDb);
    const dbInfo = optimizedDb.getDatabaseInfo();

    const schema = {
      tables: schemaAnalysis.tables,
      indexes: schemaAnalysis.indexes,
      tableSizes: dbInfo.tableSizes,
      recommendations: schemaAnalysis.recommendations,
      summary: {
        totalTables: Object.keys(dbInfo.tableSizes).length,
        totalRows: Object.values(dbInfo.tableSizes).reduce((sum: number, count: number) => sum + count, 0),
        totalIndexes: schemaAnalysis.indexes.length,
        recommendationsCount: schemaAnalysis.recommendations.length,
      },
    };

    res.json({
      success: true,
      schema,
    });
  } catch (error) {
    console.error('Error getting schema information:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get schema information',
    });
  }
});

/**
 * Get database health status
 */
router.get('/health', authenticate, requirePermission('system', 'read'), async (req, res) => {
  try {
    const queryMetrics = optimizedDb.getQueryMetrics();
    const analyzer = getQueryAnalyzer();
    const report = analyzer.getAnalysisReport();
    const dbInfo = optimizedDb.getDatabaseInfo();

    const health = {
      status: calculateHealthStatus(queryMetrics, report),
      metrics: {
        queryPerformance: report.summary.averageExecutionTime < 50 ? 'excellent' : 
                         report.summary.averageExecutionTime < 100 ? 'good' : 
                         report.summary.averageExecutionTime < 200 ? 'fair' : 'poor',
        cacheEfficiency: queryMetrics.cacheHits + queryMetrics.cacheMisses > 0 
          ? queryMetrics.cacheHits / (queryMetrics.cacheHits + queryMetrics.cacheMisses) > 0.8 ? 'excellent' : 'good'
          : 'unknown',
        slowQueryRatio: report.summary.totalQueries > 0 
          ? report.summary.slowQueries / report.summary.totalQueries : 0,
      },
      issues: identifyHealthIssues(queryMetrics, report),
      recommendations: report.recommendations.filter(r => r.priority === 'critical' || r.priority === 'high').slice(0, 5),
      uptime: Date.now() - dbInfo.metrics.queryCount, // Approximate
    };

    res.json({
      success: true,
      health,
    });
  } catch (error) {
    console.error('Error getting database health:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get database health status',
    });
  }
});

/**
 * Export performance data
 */
router.get('/export', authenticate, requireAdmin(), async (req, res) => {
  try {
    const { format = 'json' } = req.query;
    
    const queryMetrics = optimizedDb.getQueryMetrics();
    const analyzer = getQueryAnalyzer();
    const analysisData = analyzer.exportAnalysisData();
    const dbInfo = optimizedDb.getDatabaseInfo();

    const exportData = {
      timestamp: new Date().toISOString(),
      database: dbInfo,
      queryMetrics,
      analysisData,
      summary: analyzer.getAnalysisReport().summary,
    };

    const userId = req.user?.id;
    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'database_performance_exported',
      resourceType: 'database',
      userId,
      sessionId: (req as any).session?.id || (req as any).sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: 'success',
      severity: SecurityLevel.SAFE,
      details: {
        format,
        dataSize: JSON.stringify(exportData).length,
      },
    });

    if (format === 'csv') {
      // Convert to CSV format for key metrics
      const csvData = convertToCSV(exportData);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=database-performance.csv');
      res.send(csvData);
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename=database-performance.json');
      res.json({
        success: true,
        data: exportData,
      });
    }
  } catch (error) {
    console.error('Error exporting performance data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export performance data',
    });
  }
});

// Helper functions

function calculateOverallPerformance(queryMetrics: any, analysisReport: any): string {
  let score = 100;
  
  // Query performance penalties
  if (analysisReport.summary.averageExecutionTime > 200) score -= 30;
  else if (analysisReport.summary.averageExecutionTime > 100) score -= 15;
  
  // Slow query penalties
  const slowQueryRatio = analysisReport.summary.totalQueries > 0 
    ? analysisReport.summary.slowQueries / analysisReport.summary.totalQueries 
    : 0;
  if (slowQueryRatio > 0.1) score -= 25;
  else if (slowQueryRatio > 0.05) score -= 10;
  
  // Cache performance bonus
  const cacheHitRatio = queryMetrics.cacheHits + queryMetrics.cacheMisses > 0 
    ? queryMetrics.cacheHits / (queryMetrics.cacheHits + queryMetrics.cacheMisses) 
    : 0;
  if (cacheHitRatio > 0.8) score += 10;
  
  if (score >= 90) return 'excellent';
  if (score >= 75) return 'good';
  if (score >= 60) return 'fair';
  if (score >= 40) return 'poor';
  return 'critical';
}

function calculateHealthStatus(queryMetrics: any, report: any): string {
  const avgTime = report.summary.averageExecutionTime;
  const slowQueryRatio = report.summary.totalQueries > 0 
    ? report.summary.slowQueries / report.summary.totalQueries 
    : 0;
  
  if (avgTime > 500 || slowQueryRatio > 0.2) return 'critical';
  if (avgTime > 200 || slowQueryRatio > 0.1) return 'warning';
  return 'healthy';
}

function identifyHealthIssues(queryMetrics: any, report: any): string[] {
  const issues: string[] = [];
  
  if (report.summary.averageExecutionTime > 200) {
    issues.push('High average query execution time');
  }
  
  if (report.summary.slowQueries > report.summary.totalQueries * 0.1) {
    issues.push('High percentage of slow queries');
  }
  
  const cacheHitRatio = queryMetrics.cacheHits + queryMetrics.cacheMisses > 0 
    ? queryMetrics.cacheHits / (queryMetrics.cacheHits + queryMetrics.cacheMisses) 
    : 0;
  if (cacheHitRatio < 0.7) {
    issues.push('Low cache hit ratio');
  }
  
  return issues;
}

function convertToCSV(data: any): string {
  // Simple CSV conversion for key metrics
  const rows = [
    ['Metric', 'Value'],
    ['Total Queries', data.queryMetrics.queryCount],
    ['Average Query Time (ms)', data.queryMetrics.averageTime],
    ['Slow Queries', data.queryMetrics.slowQueries.length],
    ['Cache Hit Ratio', `${((data.queryMetrics.cacheHits / (data.queryMetrics.cacheHits + data.queryMetrics.cacheMisses)) * 100).toFixed(2)}%`],
  ];
  
  return rows.map(row => row.join(',')).join('\n');
}

export default router;