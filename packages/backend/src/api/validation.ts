import { Router } from 'express';
import { asyncHandler } from '../middleware/error-handler.js';
import { requirePermission } from '../auth/permissions.js';
import { v4 as uuidv4 } from 'uuid';
import { validationStorage } from '../services/validation-storage.js';
import { criteriaAnalyzer } from '../services/criteria-analyzer.js';
import { selfCorrectionService } from '../services/self-correction-service.js';

const router = Router();

export interface SuccessCriteria {
  tests?: {
    status: 'pass' | 'fail';
    coverage?: number;
    suites?: string[];
  };
  lint?: {
    errors: number;
    warnings?: number;
    rules?: string[];
  };
  type_check?: {
    status: 'pass' | 'fail';
    errors?: number;
  };
  build?: {
    status: 'pass' | 'fail';
    warnings?: number;
  };
  security?: {
    vulnerabilities: number;
    severity?: 'low' | 'medium' | 'high' | 'critical';
  };
  performance?: {
    max_response_time?: number;
    max_memory_usage?: number;
  };
  custom?: Record<string, any>;
}

export interface TaskRequest {
  prompt: string;
  success_criteria?: SuccessCriteria;
  adapter?: string;
  project_path?: string;
  timeout?: number;
}

export interface ValidationResult {
  task_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  success_criteria: SuccessCriteria;
  validation_results?: {
    tests?: {
      passed: boolean;
      coverage?: number;
      output: string;
      errors?: string[];
    };
    lint?: {
      passed: boolean;
      errors: number;
      warnings: number;
      output: string;
    };
    type_check?: {
      passed: boolean;
      errors: number;
      output: string;
    };
    build?: {
      passed: boolean;
      warnings: number;
      output: string;
    };
    security?: {
      passed: boolean;
      vulnerabilities: number;
      severity?: string;
      output: string;
    };
    performance?: {
      passed: boolean;
      response_time?: number;
      memory_usage?: number;
      output: string;
    };
    custom?: Record<string, any>;
  };
  overall_success: boolean;
  created_at: string;
  completed_at?: string;
  error_message?: string;
}

// In-memory storage for validation results (would be replaced with database in production)
const validationResults = new Map<string, ValidationResult>();

/**
 * Submit a new task with success criteria for validation
 */
router.post(
  '/tasks',
  requirePermission('task', 'create'),
  asyncHandler(async (req, res) => {
    const { prompt, success_criteria, adapter, project_path, timeout } =
      req.body as TaskRequest;

    if (!prompt) {
      return res.status(400).json({ error: 'prompt is required' });
    }

    const taskId = uuidv4();
    const result: ValidationResult = {
      task_id: taskId,
      status: 'pending',
      success_criteria: success_criteria || {},
      overall_success: false,
      created_at: new Date().toISOString(),
    };

    validationResults.set(taskId, result);

    // TODO: Integrate with lifecycle manager to start task execution
    console.log('Task submitted:', {
      taskId,
      prompt: prompt.substring(0, 100) + '...',
      success_criteria,
      adapter,
      project_path,
    });

    res.status(201).json({
      task_id: taskId,
      status: 'pending',
      message: 'Task submitted for execution and validation',
    });
  })
);

/**
 * Get validation result for a specific task
 */
router.get(
  '/tasks/:taskId',
  requirePermission('task', 'read'),
  asyncHandler(async (req, res) => {
    const { taskId } = req.params;
    const result = validationResults.get(taskId);

    if (!result) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json(result);
  })
);

/**
 * Get all validation results for the current user
 */
router.get(
  '/tasks',
  requirePermission('task', 'read'),
  asyncHandler(async (req, res) => {
    const { status, limit = 50, offset = 0 } = req.query;

    let results = Array.from(validationResults.values());

    if (status) {
      results = results.filter(r => r.status === status);
    }

    results.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    const paginatedResults = results.slice(
      Number(offset),
      Number(offset) + Number(limit)
    );

    res.json({
      results: paginatedResults,
      total: results.length,
      limit: Number(limit),
      offset: Number(offset),
    });
  })
);

/**
 * Update task status (used internally by validation service)
 */
router.put(
  '/tasks/:taskId/status',
  requirePermission('task', 'update'),
  asyncHandler(async (req, res) => {
    const { taskId } = req.params;
    const { status, validation_results, overall_success, error_message } =
      req.body;

    const result = validationResults.get(taskId);
    if (!result) {
      return res.status(404).json({ error: 'Task not found' });
    }

    result.status = status;
    if (validation_results) {
      result.validation_results = validation_results;
    }
    if (typeof overall_success === 'boolean') {
      result.overall_success = overall_success;
    }
    if (error_message) {
      result.error_message = error_message;
    }
    if (status === 'completed' || status === 'failed') {
      result.completed_at = new Date().toISOString();
    }

    validationResults.set(taskId, result);

    res.json(result);
  })
);

/**
 * Delete a validation result
 */
router.delete(
  '/tasks/:taskId',
  requirePermission('task', 'delete'),
  asyncHandler(async (req, res) => {
    const { taskId } = req.params;

    if (!validationResults.has(taskId)) {
      return res.status(404).json({ error: 'Task not found' });
    }

    validationResults.delete(taskId);
    res.status(204).send();
  })
);

/**
 * Get validation statistics
 */
router.get(
  '/stats',
  requirePermission('task', 'read'),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const query = { user_id: userId, ...req.query };
    const stats = await validationStorage.getStatistics(query);
    res.json(stats);
  })
);

/**
 * Generate validation report
 */
router.get(
  '/tasks/:taskId/report',
  requirePermission('task', 'read'),
  asyncHandler(async (req, res) => {
    const { taskId } = req.params;
    const {
      template = 'default',
      format = 'html',
      includeDetails = true,
    } = req.query;

    const validationResult = await validationStorage.get(taskId);
    if (!validationResult) {
      return res.status(404).json({ error: 'Validation result not found' });
    }

    const report = await criteriaAnalyzer.generateReport(
      validationResult.validation_report,
      template as string,
      {
        includeDetails: includeDetails === 'true',
        includeEvidence: true,
        format: format as any,
      }
    );

    const contentType =
      format === 'html'
        ? 'text/html'
        : format === 'json'
          ? 'application/json'
          : 'text/plain';

    res.setHeader('Content-Type', contentType);
    res.send(report);
  })
);

/**
 * Start self-correction for failed validation
 */
router.post(
  '/tasks/:taskId/correct',
  requirePermission('task', 'update'),
  asyncHandler(async (req, res) => {
    const { taskId } = req.params;
    const { enable_self_correction = true, max_attempts = 3 } = req.body;

    if (!enable_self_correction) {
      return res.status(400).json({ error: 'Self-correction is disabled' });
    }

    const validationResult = await validationStorage.get(taskId);
    if (!validationResult) {
      return res.status(404).json({ error: 'Validation result not found' });
    }

    if (validationResult.validation_report.overall_success) {
      return res.status(400).json({ error: 'Validation already successful' });
    }

    // TODO: Integrate with adapter service for actual correction
    const mockAdapterService = {}; // This would be the real adapter service

    try {
      const correctionResult =
        await selfCorrectionService.startCorrectionSession(
          taskId,
          validationResult.original_prompt,
          validationResult.success_criteria,
          validationResult.validation_report,
          mockAdapterService
        );

      // Update storage with correction results
      if (correctionResult.success) {
        await validationStorage.update(taskId, {
          status: 'corrected',
          metadata: {
            ...validationResult.metadata,
            correction_session: correctionResult.session,
          },
        });
      }

      res.json({
        success: correctionResult.success,
        session_id: correctionResult.session.session_id,
        attempts_used: correctionResult.improvements.attempts_used,
        score_improvement: correctionResult.improvements.score_improvement,
        final_validation: correctionResult.final_validation,
      });
    } catch (error) {
      res.status(500).json({
        error: 'Self-correction failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  })
);

/**
 * Export validation results
 */
router.post(
  '/export',
  requirePermission('task', 'read'),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { format = 'json', filters = {} } = req.body;

    const query = { user_id: userId, ...filters };
    const exportData = await validationStorage.export(query, format, userId);

    const filename = `validation-export-${Date.now()}.${format}`;

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/octet-stream');

    if (format === 'json') {
      res.json(exportData);
    } else {
      // TODO: Implement other export formats (CSV, Excel, PDF)
      res
        .status(501)
        .json({ error: `Export format ${format} not yet implemented` });
    }
  })
);

/**
 * Search validation results
 */
router.post(
  '/search',
  requirePermission('task', 'read'),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const query = { user_id: userId, ...req.body };

    const results = await validationStorage.query(query);
    res.json(results);
  })
);

export default router;
