import { promises as fs } from 'fs';
import path from 'path';
import { db } from '../database/index.js';
import type { ValidationReport } from './criteria-analyzer.js';
import type { CorrectionSession } from './self-correction-service.js';
import type { SuccessCriteria } from '../api/validation.js';

export interface StoredValidationResult {
  id: string;
  task_id: string;
  user_id: string;
  project_path: string;
  original_prompt: string;
  success_criteria: SuccessCriteria;
  validation_report: ValidationReport;
  correction_session?: CorrectionSession;
  status: 'completed' | 'failed' | 'corrected';
  created_at: string;
  updated_at: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface ValidationQuery {
  user_id?: string;
  project_path?: string;
  status?: string;
  date_from?: string;
  date_to?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
  sort_by?: 'created_at' | 'updated_at' | 'overall_score';
  sort_order?: 'asc' | 'desc';
}

export interface ValidationStatistics {
  total_validations: number;
  successful_validations: number;
  failed_validations: number;
  corrected_validations: number;
  average_score: number;
  success_rate: number;
  correction_rate: number;
  criteria_breakdown: Record<
    string,
    {
      total: number;
      passed: number;
      failed: number;
      success_rate: number;
    }
  >;
  trend_data: Array<{
    date: string;
    validations: number;
    success_rate: number;
    average_score: number;
  }>;
}

export interface ValidationExport {
  format: 'json' | 'csv' | 'xlsx' | 'pdf';
  data: StoredValidationResult[];
  metadata: {
    exported_at: string;
    exported_by: string;
    total_records: number;
    filters_applied: ValidationQuery;
  };
}

export class ValidationStorage {
  private reportsDir: string;

  constructor(reportsDir: string = '/var/lib/vibe-code/validation-reports') {
    this.reportsDir = reportsDir;
    this.ensureReportsDirectory();
  }

  /**
   * Store validation result
   */
  async store(
    taskId: string,
    userId: string,
    projectPath: string,
    originalPrompt: string,
    successCriteria: SuccessCriteria,
    validationReport: ValidationReport,
    correctionSession?: CorrectionSession,
    tags: string[] = [],
    metadata: Record<string, any> = {}
  ): Promise<StoredValidationResult> {
    const id = `validation_${taskId}_${Date.now()}`;

    const status: StoredValidationResult['status'] = correctionSession
      ? 'corrected'
      : validationReport.overall_success
        ? 'completed'
        : 'failed';

    const result: StoredValidationResult = {
      id,
      task_id: taskId,
      user_id: userId,
      project_path: projectPath,
      original_prompt: originalPrompt,
      success_criteria: successCriteria,
      validation_report: validationReport,
      correction_session: correctionSession,
      status,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      tags,
      metadata,
    };

    // Store in database
    await this.storeInDatabase(result);

    // Store detailed report as file
    await this.storeReportFile(result);

    return result;
  }

  /**
   * Retrieve validation result by ID
   */
  async get(id: string): Promise<StoredValidationResult | null> {
    try {
      const result = db
        .prepare(
          `
        SELECT * FROM validation_results WHERE id = ?
      `
        )
        .get(id) as any;

      if (!result) return null;

      return this.deserializeResult(result);
    } catch (error) {
      console.error('Error retrieving validation result:', error);
      return null;
    }
  }

  /**
   * Query validation results
   */
  async query(query: ValidationQuery): Promise<{
    results: StoredValidationResult[];
    total: number;
    hasMore: boolean;
  }> {
    try {
      const { whereClause, params } = this.buildWhereClause(query);
      const limit = query.limit || 50;
      const offset = query.offset || 0;
      const sortBy = query.sort_by || 'created_at';
      const sortOrder = query.sort_order || 'desc';

      // Get total count
      const countQuery = `
        SELECT COUNT(*) as total 
        FROM validation_results 
        ${whereClause}
      `;
      const totalResult = db.prepare(countQuery).get(...params) as {
        total: number;
      };
      const total = totalResult.total;

      // Get results
      const resultsQuery = `
        SELECT * FROM validation_results 
        ${whereClause}
        ORDER BY ${sortBy} ${sortOrder}
        LIMIT ? OFFSET ?
      `;
      const results = db
        .prepare(resultsQuery)
        .all(...params, limit, offset) as any[];

      const deserializedResults = results.map(r => this.deserializeResult(r));

      return {
        results: deserializedResults,
        total,
        hasMore: offset + results.length < total,
      };
    } catch (error) {
      console.error('Error querying validation results:', error);
      return { results: [], total: 0, hasMore: false };
    }
  }

  /**
   * Get validation statistics
   */
  async getStatistics(
    query: Partial<ValidationQuery> = {}
  ): Promise<ValidationStatistics> {
    try {
      const { whereClause, params } = this.buildWhereClause(query);

      // Basic statistics
      const basicStats = db
        .prepare(
          `
        SELECT 
          COUNT(*) as total_validations,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successful_validations,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_validations,
          SUM(CASE WHEN status = 'corrected' THEN 1 ELSE 0 END) as corrected_validations,
          AVG(overall_score) as average_score
        FROM validation_results 
        ${whereClause}
      `
        )
        .get(...params) as any;

      const successRate =
        basicStats.total_validations > 0
          ? (basicStats.successful_validations +
              basicStats.corrected_validations) /
            basicStats.total_validations
          : 0;

      const correctionRate =
        basicStats.total_validations > 0
          ? basicStats.corrected_validations / basicStats.total_validations
          : 0;

      // Criteria breakdown
      const criteriaStats = await this.getCriteriaBreakdown(query);

      // Trend data (last 30 days)
      const trendData = await this.getTrendData(query);

      return {
        total_validations: basicStats.total_validations,
        successful_validations: basicStats.successful_validations,
        failed_validations: basicStats.failed_validations,
        corrected_validations: basicStats.corrected_validations,
        average_score: basicStats.average_score || 0,
        success_rate: successRate,
        correction_rate: correctionRate,
        criteria_breakdown: criteriaStats,
        trend_data: trendData,
      };
    } catch (error) {
      console.error('Error getting validation statistics:', error);
      return {
        total_validations: 0,
        successful_validations: 0,
        failed_validations: 0,
        corrected_validations: 0,
        average_score: 0,
        success_rate: 0,
        correction_rate: 0,
        criteria_breakdown: {},
        trend_data: [],
      };
    }
  }

  /**
   * Export validation results
   */
  async export(
    query: ValidationQuery,
    format: ValidationExport['format'],
    exportedBy: string
  ): Promise<ValidationExport> {
    const { results, total } = await this.query({ ...query, limit: 10000 }); // Large limit for export

    const exportData: ValidationExport = {
      format,
      data: results,
      metadata: {
        exported_at: new Date().toISOString(),
        exported_by: exportedBy,
        total_records: total,
        filters_applied: query,
      },
    };

    return exportData;
  }

  /**
   * Delete validation result
   */
  async delete(id: string): Promise<boolean> {
    try {
      const result = db
        .prepare(
          `
        DELETE FROM validation_results WHERE id = ?
      `
        )
        .run(id);

      // Also delete report file
      await this.deleteReportFile(id);

      return result.changes > 0;
    } catch (error) {
      console.error('Error deleting validation result:', error);
      return false;
    }
  }

  /**
   * Update validation result
   */
  async update(
    id: string,
    updates: Partial<
      Pick<StoredValidationResult, 'tags' | 'metadata' | 'status'>
    >
  ): Promise<boolean> {
    try {
      const setParts = [];
      const params = [];

      if (updates.tags) {
        setParts.push('tags = ?');
        params.push(JSON.stringify(updates.tags));
      }

      if (updates.metadata) {
        setParts.push('metadata = ?');
        params.push(JSON.stringify(updates.metadata));
      }

      if (updates.status) {
        setParts.push('status = ?');
        params.push(updates.status);
      }

      if (setParts.length === 0) return false;

      setParts.push('updated_at = ?');
      params.push(new Date().toISOString());
      params.push(id);

      const result = db
        .prepare(
          `
        UPDATE validation_results 
        SET ${setParts.join(', ')}
        WHERE id = ?
      `
        )
        .run(...params);

      return result.changes > 0;
    } catch (error) {
      console.error('Error updating validation result:', error);
      return false;
    }
  }

  /**
   * Initialize database tables
   */
  async initializeDatabase(): Promise<void> {
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS validation_results (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          project_path TEXT NOT NULL,
          original_prompt TEXT NOT NULL,
          success_criteria TEXT NOT NULL,
          validation_report TEXT NOT NULL,
          correction_session TEXT,
          status TEXT NOT NULL,
          overall_score REAL NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          tags TEXT,
          metadata TEXT,
          INDEX idx_user_id (user_id),
          INDEX idx_project_path (project_path),
          INDEX idx_status (status),
          INDEX idx_created_at (created_at)
        )
      `);
    } catch (error) {
      console.error('Error initializing validation database:', error);
      throw error;
    }
  }

  // Private helper methods

  private async ensureReportsDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.reportsDir, { recursive: true });
    } catch (error) {
      console.error('Error creating reports directory:', error);
    }
  }

  private async storeInDatabase(result: StoredValidationResult): Promise<void> {
    db.prepare(
      `
      INSERT INTO validation_results (
        id, task_id, user_id, project_path, original_prompt, 
        success_criteria, validation_report, correction_session, 
        status, overall_score, created_at, updated_at, tags, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      result.id,
      result.task_id,
      result.user_id,
      result.project_path,
      result.original_prompt,
      JSON.stringify(result.success_criteria),
      JSON.stringify(result.validation_report),
      result.correction_session
        ? JSON.stringify(result.correction_session)
        : null,
      result.status,
      result.validation_report.overall_score,
      result.created_at,
      result.updated_at,
      JSON.stringify(result.tags || []),
      JSON.stringify(result.metadata || {})
    );
  }

  private async storeReportFile(result: StoredValidationResult): Promise<void> {
    try {
      const reportPath = path.join(this.reportsDir, `${result.id}.json`);
      await fs.writeFile(reportPath, JSON.stringify(result, null, 2));
    } catch (error) {
      console.warn('Failed to store report file:', error);
    }
  }

  private async deleteReportFile(id: string): Promise<void> {
    try {
      const reportPath = path.join(this.reportsDir, `${id}.json`);
      await fs.unlink(reportPath);
    } catch (error) {
      // File might not exist, ignore error
    }
  }

  private deserializeResult(row: any): StoredValidationResult {
    return {
      id: row.id,
      task_id: row.task_id,
      user_id: row.user_id,
      project_path: row.project_path,
      original_prompt: row.original_prompt,
      success_criteria: JSON.parse(row.success_criteria),
      validation_report: JSON.parse(row.validation_report),
      correction_session: row.correction_session
        ? JSON.parse(row.correction_session)
        : undefined,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at,
      tags: JSON.parse(row.tags || '[]'),
      metadata: JSON.parse(row.metadata || '{}'),
    };
  }

  private buildWhereClause(query: ValidationQuery): {
    whereClause: string;
    params: any[];
  } {
    const conditions = [];
    const params = [];

    if (query.user_id) {
      conditions.push('user_id = ?');
      params.push(query.user_id);
    }

    if (query.project_path) {
      conditions.push('project_path LIKE ?');
      params.push(`%${query.project_path}%`);
    }

    if (query.status) {
      conditions.push('status = ?');
      params.push(query.status);
    }

    if (query.date_from) {
      conditions.push('created_at >= ?');
      params.push(query.date_from);
    }

    if (query.date_to) {
      conditions.push('created_at <= ?');
      params.push(query.date_to);
    }

    if (query.tags && query.tags.length > 0) {
      const tagConditions = query.tags.map(() => 'tags LIKE ?').join(' OR ');
      conditions.push(`(${tagConditions})`);
      params.push(...query.tags.map(tag => `%"${tag}"%`));
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    return { whereClause, params };
  }

  private async getCriteriaBreakdown(
    query: Partial<ValidationQuery>
  ): Promise<ValidationStatistics['criteria_breakdown']> {
    // This would parse validation_report JSON to extract criteria statistics
    // For now, return empty object
    return {};
  }

  private async getTrendData(
    query: Partial<ValidationQuery>
  ): Promise<ValidationStatistics['trend_data']> {
    // This would generate trend data over time
    // For now, return empty array
    return [];
  }
}

// Export singleton instance
export const validationStorage = new ValidationStorage();
