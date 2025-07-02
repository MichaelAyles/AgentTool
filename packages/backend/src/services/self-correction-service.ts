import type {
  ValidationReport,
  CriteriaAnalysisResult,
} from './criteria-analyzer.js';
import type { SuccessCriteria, TaskRequest } from '../api/validation.js';
import type { FileChange } from './workspace-manager.js';

export interface CorrectionConfig {
  maxAttempts: number;
  retryDelay: number;
  enabledCriteria: string[];
  correctionStrategies: {
    lint?: CorrectionStrategy;
    type_check?: CorrectionStrategy;
    tests?: CorrectionStrategy;
    build?: CorrectionStrategy;
    security?: CorrectionStrategy;
  };
}

export interface CorrectionStrategy {
  enabled: boolean;
  maxAttempts: number;
  promptTemplate: string;
  includeContext: boolean;
  includeOriginalPrompt: boolean;
  includeErrorDetails: boolean;
}

export interface CorrectionAttempt {
  attempt_number: number;
  timestamp: string;
  failed_criteria: string[];
  correction_prompt: string;
  file_changes: FileChange[];
  validation_result?: ValidationReport;
  success: boolean;
  duration: number;
  error_message?: string;
}

export interface CorrectionSession {
  session_id: string;
  task_id: string;
  original_prompt: string;
  original_criteria: SuccessCriteria;
  attempts: CorrectionAttempt[];
  final_success: boolean;
  total_duration: number;
  created_at: string;
  completed_at?: string;
  final_validation?: ValidationReport;
}

export interface CorrectionResult {
  success: boolean;
  session: CorrectionSession;
  final_validation: ValidationReport;
  improvements: {
    criteria_before: number;
    criteria_after: number;
    score_improvement: number;
    attempts_used: number;
  };
}

export class SelfCorrectionService {
  private config: CorrectionConfig;
  private activeSessions = new Map<string, CorrectionSession>();

  constructor(config: Partial<CorrectionConfig> = {}) {
    this.config = {
      maxAttempts: 3,
      retryDelay: 5000,
      enabledCriteria: ['lint', 'type_check', 'tests', 'build'],
      correctionStrategies: {
        lint: {
          enabled: true,
          maxAttempts: 2,
          promptTemplate: this.getLintCorrectionTemplate(),
          includeContext: true,
          includeOriginalPrompt: true,
          includeErrorDetails: true,
        },
        type_check: {
          enabled: true,
          maxAttempts: 3,
          promptTemplate: this.getTypeCheckCorrectionTemplate(),
          includeContext: true,
          includeOriginalPrompt: true,
          includeErrorDetails: true,
        },
        tests: {
          enabled: true,
          maxAttempts: 2,
          promptTemplate: this.getTestCorrectionTemplate(),
          includeContext: true,
          includeOriginalPrompt: false,
          includeErrorDetails: true,
        },
        build: {
          enabled: true,
          maxAttempts: 2,
          promptTemplate: this.getBuildCorrectionTemplate(),
          includeContext: true,
          includeOriginalPrompt: true,
          includeErrorDetails: true,
        },
        security: {
          enabled: false, // Security fixes require careful human review
          maxAttempts: 1,
          promptTemplate: this.getSecurityCorrectionTemplate(),
          includeContext: true,
          includeOriginalPrompt: true,
          includeErrorDetails: true,
        },
      },
      ...config,
    };
  }

  /**
   * Start self-correction process for failed validation
   */
  async startCorrectionSession(
    taskId: string,
    originalPrompt: string,
    originalCriteria: SuccessCriteria,
    failedValidation: ValidationReport,
    adapterService: any // Interface to re-run AI tasks
  ): Promise<CorrectionResult> {
    const sessionId = `correction_${taskId}_${Date.now()}`;

    const session: CorrectionSession = {
      session_id: sessionId,
      task_id: taskId,
      original_prompt: originalPrompt,
      original_criteria: originalCriteria,
      attempts: [],
      final_success: false,
      total_duration: 0,
      created_at: new Date().toISOString(),
    };

    this.activeSessions.set(sessionId, session);

    try {
      const result = await this.executeCorrectionLoop(
        session,
        failedValidation,
        adapterService
      );

      session.completed_at = new Date().toISOString();
      session.final_success = result.success;
      session.final_validation = result.final_validation;

      return result;
    } catch (error) {
      session.completed_at = new Date().toISOString();
      throw error;
    } finally {
      this.activeSessions.delete(sessionId);
    }
  }

  /**
   * Execute the correction loop
   */
  private async executeCorrectionLoop(
    session: CorrectionSession,
    initialValidation: ValidationReport,
    adapterService: any
  ): Promise<CorrectionResult> {
    const startTime = Date.now();
    let currentValidation = initialValidation;
    let attemptNumber = 0;

    while (
      attemptNumber < this.config.maxAttempts &&
      !currentValidation.overall_success
    ) {
      attemptNumber++;

      // Identify correctable failed criteria
      const correctableFailures =
        this.identifyCorrectableFailures(currentValidation);

      if (correctableFailures.length === 0) {
        console.log('No correctable failures found, stopping correction loop');
        break;
      }

      // Generate correction prompt
      const correctionPrompt = this.generateCorrectionPrompt(
        session.original_prompt,
        session.original_criteria,
        correctableFailures,
        currentValidation,
        attemptNumber
      );

      // Create correction attempt
      const attempt: CorrectionAttempt = {
        attempt_number: attemptNumber,
        timestamp: new Date().toISOString(),
        failed_criteria: correctableFailures.map(f => f.criteria_name),
        correction_prompt: correctionPrompt,
        file_changes: [],
        success: false,
        duration: 0,
      };

      try {
        const attemptStartTime = Date.now();

        // Execute correction with AI adapter
        console.log(
          `Starting correction attempt ${attemptNumber}/${this.config.maxAttempts}`
        );

        const correctionResult = await this.executeCorrectionWithAdapter(
          correctionPrompt,
          session.original_criteria,
          adapterService
        );

        attempt.file_changes = correctionResult.fileChanges;
        attempt.validation_result = correctionResult.validationResult;
        attempt.success = correctionResult.validationResult.overall_success;
        attempt.duration = Date.now() - attemptStartTime;

        // Update current validation
        currentValidation = correctionResult.validationResult;

        console.log(
          `Correction attempt ${attemptNumber} completed: ${attempt.success ? 'SUCCESS' : 'FAILED'}`
        );

        // Add delay before next attempt
        if (!attempt.success && attemptNumber < this.config.maxAttempts) {
          await this.delay(this.config.retryDelay);
        }
      } catch (error) {
        attempt.error_message =
          error instanceof Error ? error.message : String(error);
        attempt.duration = Date.now() - startTime;
        console.error(`Correction attempt ${attemptNumber} failed:`, error);
      }

      session.attempts.push(attempt);

      // Break if we achieved success
      if (currentValidation.overall_success) {
        break;
      }
    }

    session.total_duration = Date.now() - startTime;

    // Calculate improvements
    const improvements = this.calculateImprovements(
      initialValidation,
      currentValidation,
      session.attempts.length
    );

    return {
      success: currentValidation.overall_success,
      session,
      final_validation: currentValidation,
      improvements,
    };
  }

  /**
   * Identify failures that can be automatically corrected
   */
  private identifyCorrectableFailures(
    validation: ValidationReport
  ): CriteriaAnalysisResult[] {
    return validation.criteria_results.filter(result => {
      if (result.met) return false;

      // Check if this criterion type is enabled for correction
      const criteriaType = result.criteria_name.replace('custom_', '');
      return (
        this.config.enabledCriteria.includes(criteriaType) &&
        this.config.correctionStrategies[
          criteriaType as keyof typeof this.config.correctionStrategies
        ]?.enabled
      );
    });
  }

  /**
   * Generate correction prompt based on failed criteria
   */
  private generateCorrectionPrompt(
    originalPrompt: string,
    originalCriteria: SuccessCriteria,
    failures: CriteriaAnalysisResult[],
    validation: ValidationReport,
    attemptNumber: number
  ): string {
    const failuresByType = new Map<string, CriteriaAnalysisResult[]>();

    for (const failure of failures) {
      const type = failure.criteria_name.replace('custom_', '');
      if (!failuresByType.has(type)) {
        failuresByType.set(type, []);
      }
      failuresByType.get(type)!.push(failure);
    }

    let prompt = '';

    // Add context about this being a correction attempt
    prompt += `CORRECTION ATTEMPT ${attemptNumber}\n\n`;
    prompt += `The previous implementation failed validation. Please analyze the errors and fix the issues.\n\n`;

    // Add original context if strategies require it
    const includeOriginal = Array.from(failuresByType.keys()).some(type => {
      const strategy =
        this.config.correctionStrategies[
          type as keyof typeof this.config.correctionStrategies
        ];
      return strategy?.includeOriginalPrompt;
    });

    if (includeOriginal) {
      prompt += `ORIGINAL REQUEST:\n${originalPrompt}\n\n`;
    }

    // Add specific correction instructions for each failure type
    for (const [type, typeFailures] of failuresByType.entries()) {
      const strategy =
        this.config.correctionStrategies[
          type as keyof typeof this.config.correctionStrategies
        ];
      if (!strategy) continue;

      prompt += `${type.toUpperCase()} ISSUES TO FIX:\n`;

      for (const failure of typeFailures) {
        prompt += `- ${failure.details.message}\n`;

        if (strategy.includeErrorDetails && failure.evidence.length > 0) {
          for (const evidence of failure.evidence) {
            if (evidence.data && typeof evidence.data === 'object') {
              if (evidence.data.output) {
                prompt += `  Error details: ${evidence.data.output}\n`;
              }
              if (evidence.data.issues) {
                prompt += `  Issues found: ${JSON.stringify(evidence.data.issues, null, 2)}\n`;
              }
            }
          }
        }

        if (failure.details.recommendations) {
          prompt += `  Recommendations:\n`;
          for (const rec of failure.details.recommendations) {
            prompt += `    - ${rec}\n`;
          }
        }
      }

      prompt += '\n';
      prompt += strategy.promptTemplate.replace('{type}', type) + '\n\n';
    }

    // Add success criteria reminder
    prompt += `IMPORTANT: The solution must meet these criteria:\n`;
    for (const failure of failures) {
      prompt += `- ${failure.criteria_name}: ${JSON.stringify(failure.details.expected)}\n`;
    }

    prompt +=
      '\nPlease provide the corrected implementation that addresses all the above issues.';

    return prompt;
  }

  /**
   * Execute correction with adapter service
   */
  private async executeCorrectionWithAdapter(
    correctionPrompt: string,
    originalCriteria: SuccessCriteria,
    adapterService: any
  ): Promise<{
    fileChanges: FileChange[];
    validationResult: ValidationReport;
  }> {
    // This would integrate with the actual adapter service to:
    // 1. Submit the correction prompt to the AI
    // 2. Get the corrected code/files
    // 3. Apply changes to a new workspace
    // 4. Run validation again
    // 5. Return results

    // For now, return a mock implementation
    return {
      fileChanges: [],
      validationResult: {
        task_id: 'mock',
        timestamp: new Date().toISOString(),
        overall_success: false,
        overall_score: 50,
        criteria_results: [],
        summary: {
          total_criteria: 0,
          met_criteria: 0,
          failed_criteria: 0,
          critical_failures: [],
          warnings: [],
          recommendations: [],
        },
        execution_context: {
          workspace_id: 'mock',
          project_path: 'mock',
          validation_duration: 0,
        },
      },
    };
  }

  /**
   * Calculate improvements between validations
   */
  private calculateImprovements(
    initialValidation: ValidationReport,
    finalValidation: ValidationReport,
    attemptsUsed: number
  ): CorrectionResult['improvements'] {
    return {
      criteria_before: initialValidation.summary.met_criteria,
      criteria_after: finalValidation.summary.met_criteria,
      score_improvement:
        finalValidation.overall_score - initialValidation.overall_score,
      attempts_used: attemptsUsed,
    };
  }

  /**
   * Get correction session
   */
  getCorrectionSession(sessionId: string): CorrectionSession | null {
    return this.activeSessions.get(sessionId) || null;
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Correction prompt templates
  private getLintCorrectionTemplate(): string {
    return `
Please fix all linting errors and warnings in the code. Focus on:
- Syntax errors and violations
- Code style consistency
- Unused variables and imports
- Formatting issues

Make sure the fixed code follows the project's ESLint configuration and coding standards.
    `.trim();
  }

  private getTypeCheckCorrectionTemplate(): string {
    return `
Please fix all TypeScript type errors. Focus on:
- Type mismatches and incompatibilities
- Missing type definitions
- Incorrect type annotations
- Generic type issues
- Import/export type problems

Ensure all TypeScript compilation errors are resolved while maintaining type safety.
    `.trim();
  }

  private getTestCorrectionTemplate(): string {
    return `
Please fix the failing tests or add missing test coverage. Focus on:
- Fixing broken test assertions
- Updating tests to match code changes
- Adding tests for new functionality
- Improving test coverage where needed
- Ensuring all tests pass consistently

Make sure the test suite is comprehensive and all tests pass.
    `.trim();
  }

  private getBuildCorrectionTemplate(): string {
    return `
Please fix all build errors and warnings. Focus on:
- Compilation errors
- Missing dependencies
- Configuration issues
- Asset processing problems
- Build optimization warnings

Ensure the project builds successfully without errors.
    `.trim();
  }

  private getSecurityCorrectionTemplate(): string {
    return `
Please address the security vulnerabilities found. Focus on:
- Updating vulnerable dependencies
- Fixing security-sensitive code patterns
- Implementing proper input validation
- Adding security headers and configurations

Note: Security fixes require careful review. Only make changes you are confident about.
    `.trim();
  }
}

// Export singleton instance
export const selfCorrectionService = new SelfCorrectionService();
