import { EventEmitter } from 'events';
import { structuredLogger } from '../middleware/logging.js';

export interface QueryAnalysis {
  queryPattern: string;
  executionCount: number;
  totalTime: number;
  averageTime: number;
  minTime: number;
  maxTime: number;
  lastExecuted: Date;
  indexesUsed: string[];
  scanCount: number;
  performance: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
  recommendations: QueryRecommendation[];
}

export interface QueryRecommendation {
  type: 'index' | 'query_rewrite' | 'schema_change' | 'cache_strategy';
  priority: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  implementation: string;
  estimatedImpact: string;
  effort: 'low' | 'medium' | 'high';
}

export interface QueryPlan {
  id: number;
  parent: number;
  notused: number;
  detail: string;
}

export interface IndexAnalysis {
  indexName: string;
  tableName: string;
  columns: string[];
  isUnique: boolean;
  usageCount: number;
  efficiency: number;
  recommendations: string[];
}

export interface TableAnalysis {
  tableName: string;
  rowCount: number;
  avgRowSize: number;
  totalSize: number;
  indexCount: number;
  queryFrequency: number;
  slowQueryCount: number;
  recommendations: string[];
}

export class QueryAnalyzer extends EventEmitter {
  private queryStats = new Map<string, QueryAnalysis>();
  private indexUsage = new Map<string, number>();
  private tableStats = new Map<string, TableAnalysis>();
  private queryHistory: Array<{
    query: string;
    time: number;
    timestamp: Date;
    plan?: QueryPlan[];
  }> = [];
  
  private config = {
    maxHistorySize: 1000,
    slowQueryThreshold: 100, // ms
    analysisInterval: 60000, // 1 minute
    enableAutoOptimization: true,
    enableQueryPlanAnalysis: true,
  };

  constructor() {
    super();
    this.startPeriodicAnalysis();
  }

  /**
   * Record a query execution for analysis
   */
  recordQuery(
    query: string, 
    executionTime: number, 
    indexesUsed: string[] = [],
    queryPlan?: QueryPlan[]
  ): void {
    const normalizedQuery = this.normalizeQuery(query);
    const now = new Date();

    // Update query statistics
    let stats = this.queryStats.get(normalizedQuery);
    if (!stats) {
      stats = {
        queryPattern: normalizedQuery,
        executionCount: 0,
        totalTime: 0,
        averageTime: 0,
        minTime: Infinity,
        maxTime: 0,
        lastExecuted: now,
        indexesUsed: [],
        scanCount: 0,
        performance: 'excellent',
        recommendations: [],
      };
      this.queryStats.set(normalizedQuery, stats);
    }

    // Update statistics
    stats.executionCount++;
    stats.totalTime += executionTime;
    stats.averageTime = stats.totalTime / stats.executionCount;
    stats.minTime = Math.min(stats.minTime, executionTime);
    stats.maxTime = Math.max(stats.maxTime, executionTime);
    stats.lastExecuted = now;

    // Track index usage
    for (const index of indexesUsed) {
      stats.indexesUsed = [...new Set([...stats.indexesUsed, index])];
      this.indexUsage.set(index, (this.indexUsage.get(index) || 0) + 1);
    }

    // Check for table scans
    if (queryPlan && this.hasTableScan(queryPlan)) {
      stats.scanCount++;
    }

    // Update performance rating
    stats.performance = this.calculatePerformanceRating(stats);

    // Generate recommendations
    stats.recommendations = this.generateQueryRecommendations(stats, queryPlan);

    // Add to history
    this.queryHistory.push({
      query: normalizedQuery,
      time: executionTime,
      timestamp: now,
      plan: queryPlan,
    });

    // Trim history if needed
    if (this.queryHistory.length > this.config.maxHistorySize) {
      this.queryHistory.shift();
    }

    // Emit events for slow queries
    if (executionTime > this.config.slowQueryThreshold) {
      this.emit('slowQuery', {
        query: normalizedQuery,
        executionTime,
        stats,
        plan: queryPlan,
      });
    }
  }

  /**
   * Analyze database schema for optimization opportunities
   */
  analyzeSchema(database: any): {
    tables: TableAnalysis[];
    indexes: IndexAnalysis[];
    recommendations: QueryRecommendation[];
  } {
    const tables = this.analyzeTableUsage(database);
    const indexes = this.analyzeIndexEfficiency(database);
    const schemaRecommendations = this.generateSchemaRecommendations(tables, indexes);

    return {
      tables,
      indexes,
      recommendations: schemaRecommendations,
    };
  }

  /**
   * Get comprehensive query analysis report
   */
  getAnalysisReport(): {
    summary: {
      totalQueries: number;
      slowQueries: number;
      averageExecutionTime: number;
      topSlowQueries: QueryAnalysis[];
      mostFrequentQueries: QueryAnalysis[];
    };
    queries: QueryAnalysis[];
    indexUsage: Map<string, number>;
    recommendations: QueryRecommendation[];
  } {
    const queries = Array.from(this.queryStats.values());
    const slowQueries = queries.filter(q => q.averageTime > this.config.slowQueryThreshold);
    
    const topSlowQueries = queries
      .sort((a, b) => b.averageTime - a.averageTime)
      .slice(0, 10);

    const mostFrequentQueries = queries
      .sort((a, b) => b.executionCount - a.executionCount)
      .slice(0, 10);

    const totalExecutionTime = queries.reduce((sum, q) => sum + q.totalTime, 0);
    const totalQueries = queries.reduce((sum, q) => sum + q.executionCount, 0);

    const globalRecommendations = this.generateGlobalRecommendations(queries);

    return {
      summary: {
        totalQueries,
        slowQueries: slowQueries.length,
        averageExecutionTime: totalQueries > 0 ? totalExecutionTime / totalQueries : 0,
        topSlowQueries,
        mostFrequentQueries,
      },
      queries,
      indexUsage: this.indexUsage,
      recommendations: globalRecommendations,
    };
  }

  /**
   * Get optimization suggestions for a specific query
   */
  optimizeQuery(query: string): {
    originalQuery: string;
    optimizedQuery: string;
    explanation: string;
    estimatedImprovement: string;
    recommendations: QueryRecommendation[];
  } {
    const normalizedQuery = this.normalizeQuery(query);
    const stats = this.queryStats.get(normalizedQuery);

    // Basic query optimization patterns
    const optimizations = this.applyQueryOptimizations(query);
    const recommendations = stats ? stats.recommendations : [];

    return {
      originalQuery: query,
      optimizedQuery: optimizations.optimizedQuery,
      explanation: optimizations.explanation,
      estimatedImprovement: optimizations.estimatedImprovement,
      recommendations,
    };
  }

  /**
   * Suggest indexes based on query patterns
   */
  suggestIndexes(): Array<{
    tableName: string;
    columns: string[];
    type: 'btree' | 'unique' | 'partial' | 'composite';
    reason: string;
    priority: 'low' | 'medium' | 'high';
    estimatedImpact: string;
  }> {
    const suggestions: Array<any> = [];
    
    // Analyze WHERE clauses for index opportunities
    for (const [queryPattern, stats] of this.queryStats) {
      const whereColumns = this.extractWhereColumns(queryPattern);
      const orderByColumns = this.extractOrderByColumns(queryPattern);
      const tableName = this.extractTableName(queryPattern);

      if (tableName && stats.averageTime > this.config.slowQueryThreshold) {
        // Suggest indexes for WHERE clauses
        if (whereColumns.length > 0) {
          suggestions.push({
            tableName,
            columns: whereColumns,
            type: whereColumns.length > 1 ? 'composite' : 'btree',
            reason: `Frequent WHERE clause filtering on ${whereColumns.join(', ')}`,
            priority: stats.averageTime > 500 ? 'high' : 'medium',
            estimatedImpact: `Could improve query time by 60-80%`,
          });
        }

        // Suggest indexes for ORDER BY clauses
        if (orderByColumns.length > 0) {
          suggestions.push({
            tableName,
            columns: orderByColumns,
            type: 'btree',
            reason: `Frequent ORDER BY on ${orderByColumns.join(', ')}`,
            priority: 'medium',
            estimatedImpact: `Could eliminate sorting overhead`,
          });
        }
      }
    }

    return suggestions;
  }

  // Private methods

  private normalizeQuery(query: string): string {
    // Remove specific values and normalize for pattern recognition
    return query
      .replace(/\b\d+\b/g, '?')                    // Replace numbers
      .replace(/'[^']*'/g, '?')                    // Replace string literals
      .replace(/\s+/g, ' ')                       // Normalize whitespace
      .replace(/\b(IN\s*\([^)]+\))/gi, 'IN (?)')  // Normalize IN clauses
      .trim()
      .toLowerCase();
  }

  private hasTableScan(queryPlan: QueryPlan[]): boolean {
    return queryPlan.some(step => 
      step.detail.toLowerCase().includes('scan') && 
      !step.detail.toLowerCase().includes('index')
    );
  }

  private calculatePerformanceRating(stats: QueryAnalysis): 'excellent' | 'good' | 'fair' | 'poor' | 'critical' {
    const avgTime = stats.averageTime;
    const scanRatio = stats.scanCount / stats.executionCount;

    if (avgTime > 1000 || scanRatio > 0.5) return 'critical';
    if (avgTime > 500 || scanRatio > 0.3) return 'poor';
    if (avgTime > 200 || scanRatio > 0.1) return 'fair';
    if (avgTime > 50) return 'good';
    return 'excellent';
  }

  private generateQueryRecommendations(stats: QueryAnalysis, queryPlan?: QueryPlan[]): QueryRecommendation[] {
    const recommendations: QueryRecommendation[] = [];

    // High execution time recommendations
    if (stats.averageTime > 500) {
      recommendations.push({
        type: 'index',
        priority: 'high',
        description: 'Query has high average execution time',
        implementation: 'Add appropriate indexes for WHERE and JOIN clauses',
        estimatedImpact: 'Could reduce execution time by 60-80%',
        effort: 'medium',
      });
    }

    // Table scan recommendations
    if (stats.scanCount > stats.executionCount * 0.1) {
      recommendations.push({
        type: 'index',
        priority: 'high',
        description: 'Query frequently performs table scans',
        implementation: 'Add indexes on filtered columns',
        estimatedImpact: 'Eliminate table scans, improve performance by 10-100x',
        effort: 'low',
      });
    }

    // Frequent query caching recommendations
    if (stats.executionCount > 100 && stats.averageTime > 50) {
      recommendations.push({
        type: 'cache_strategy',
        priority: 'medium',
        description: 'Frequently executed query with moderate execution time',
        implementation: 'Implement query result caching',
        estimatedImpact: 'Reduce database load by 70-90%',
        effort: 'medium',
      });
    }

    return recommendations;
  }

  private analyzeTableUsage(database: any): TableAnalysis[] {
    // This would analyze actual table statistics
    // For now, return mock data structure
    return [];
  }

  private analyzeIndexEfficiency(database: any): IndexAnalysis[] {
    // This would analyze actual index usage statistics
    // For now, return mock data structure
    return [];
  }

  private generateSchemaRecommendations(tables: TableAnalysis[], indexes: IndexAnalysis[]): QueryRecommendation[] {
    const recommendations: QueryRecommendation[] = [];

    // Add recommendations based on table and index analysis
    return recommendations;
  }

  private generateGlobalRecommendations(queries: QueryAnalysis[]): QueryRecommendation[] {
    const recommendations: QueryRecommendation[] = [];

    const slowQueries = queries.filter(q => q.performance === 'poor' || q.performance === 'critical');
    const frequentQueries = queries.filter(q => q.executionCount > 50);

    if (slowQueries.length > queries.length * 0.1) {
      recommendations.push({
        type: 'index',
        priority: 'high',
        description: 'High percentage of slow queries detected',
        implementation: 'Review and add missing indexes',
        estimatedImpact: 'Significant overall performance improvement',
        effort: 'medium',
      });
    }

    if (frequentQueries.length > 10) {
      recommendations.push({
        type: 'cache_strategy',
        priority: 'medium',
        description: 'Many frequently executed queries found',
        implementation: 'Implement query result caching strategy',
        estimatedImpact: 'Reduce database load significantly',
        effort: 'medium',
      });
    }

    return recommendations;
  }

  private applyQueryOptimizations(query: string): {
    optimizedQuery: string;
    explanation: string;
    estimatedImprovement: string;
  } {
    let optimizedQuery = query;
    const optimizations: string[] = [];

    // Replace SELECT * with specific columns (basic detection)
    if (query.toLowerCase().includes('select *')) {
      optimizations.push('Replace SELECT * with specific column names');
    }

    // Suggest LIMIT for potentially large result sets
    if (!query.toLowerCase().includes('limit') && query.toLowerCase().includes('select')) {
      optimizations.push('Consider adding LIMIT clause for large result sets');
    }

    // Basic WHERE clause optimization
    if (query.toLowerCase().includes('where')) {
      optimizations.push('Ensure WHERE clause columns are indexed');
    }

    return {
      optimizedQuery,
      explanation: optimizations.join('; '),
      estimatedImprovement: optimizations.length > 0 ? '20-50% performance improvement' : 'No optimizations found',
    };
  }

  private extractWhereColumns(query: string): string[] {
    const whereMatch = query.match(/where\s+(.+?)(?:\s+order\s+by|\s+group\s+by|\s+limit|$)/i);
    if (!whereMatch) return [];

    const whereClause = whereMatch[1];
    const columns: string[] = [];
    
    // Simple column extraction (could be more sophisticated)
    const columnMatches = whereClause.match(/(\w+)\s*[=<>!]/g);
    if (columnMatches) {
      columns.push(...columnMatches.map(match => match.replace(/\s*[=<>!].*/, '')));
    }

    return [...new Set(columns)];
  }

  private extractOrderByColumns(query: string): string[] {
    const orderByMatch = query.match(/order\s+by\s+(.+?)(?:\s+limit|$)/i);
    if (!orderByMatch) return [];

    return orderByMatch[1]
      .split(',')
      .map(col => col.trim().replace(/\s+(asc|desc)$/i, ''))
      .filter(col => col.length > 0);
  }

  private extractTableName(query: string): string | null {
    const fromMatch = query.match(/from\s+(\w+)/i);
    return fromMatch ? fromMatch[1] : null;
  }

  private startPeriodicAnalysis(): void {
    setInterval(() => {
      this.performPeriodicAnalysis();
    }, this.config.analysisInterval);
  }

  private performPeriodicAnalysis(): void {
    const report = this.getAnalysisReport();
    
    if (report.summary.slowQueries > 0) {
      structuredLogger.warn('Slow queries detected', {
        slowQueryCount: report.summary.slowQueries,
        averageTime: Math.round(report.summary.averageExecutionTime),
      });
      
      this.emit('analysisComplete', {
        type: 'performance_warning',
        data: report,
      });
    }

    // Auto-optimization if enabled
    if (this.config.enableAutoOptimization) {
      const criticalQueries = report.queries.filter(q => q.performance === 'critical');
      if (criticalQueries.length > 0) {
        this.emit('optimizationRequired', {
          queries: criticalQueries,
          recommendations: report.recommendations,
        });
      }
    }
  }

  /**
   * Clear analysis data
   */
  clearAnalysis(): void {
    this.queryStats.clear();
    this.indexUsage.clear();
    this.tableStats.clear();
    this.queryHistory.length = 0;
    
    structuredLogger.info('Query analysis data cleared');
  }

  /**
   * Export analysis data for external processing
   */
  exportAnalysisData(): any {
    return {
      queryStats: Array.from(this.queryStats.entries()),
      indexUsage: Array.from(this.indexUsage.entries()),
      tableStats: Array.from(this.tableStats.entries()),
      queryHistory: this.queryHistory,
      config: this.config,
    };
  }
}

// Singleton instance
let queryAnalyzerInstance: QueryAnalyzer | null = null;

export function getQueryAnalyzer(): QueryAnalyzer {
  if (!queryAnalyzerInstance) {
    queryAnalyzerInstance = new QueryAnalyzer();
  }
  return queryAnalyzerInstance;
}

export function resetQueryAnalyzer(): void {
  if (queryAnalyzerInstance) {
    queryAnalyzerInstance.removeAllListeners();
  }
  queryAnalyzerInstance = null;
}