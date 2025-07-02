import { promises as fs } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import type { SuccessCriteria, ValidationResult } from '../api/validation.js';

export interface ValidationConfig {
  workspaceRoot: string;
  tempDir?: string;
  timeout?: number;
  defaultCommands?: {
    lint?: string;
    typecheck?: string;
    test?: string;
    build?: string;
    security?: string;
  };
}

export interface TaskExecution {
  taskId: string;
  prompt: string;
  adapter: string;
  projectPath: string;
  fileChanges: FileChange[];
  successCriteria: SuccessCriteria;
}

export interface FileChange {
  path: string;
  content: string;
  operation: 'create' | 'update' | 'delete';
}

export interface ValidationStep {
  name: string;
  command: string;
  workingDir: string;
  timeout: number;
  successCriteria: any;
}

export class ValidationService {
  private config: ValidationConfig;
  private activeValidations = new Map<string, Promise<ValidationResult>>();

  constructor(config: ValidationConfig) {
    this.config = {
      tempDir: '/tmp/vibe-code-validation',
      timeout: 300000, // 5 minutes default
      defaultCommands: {
        lint: 'npm run lint',
        typecheck: 'npm run typecheck',
        test: 'npm test',
        build: 'npm run build',
        security: 'npm audit',
      },
      ...config,
    };
  }

  /**
   * Start validation pipeline for a completed task
   */
  async validateTask(execution: TaskExecution): Promise<ValidationResult> {
    const { taskId, successCriteria, projectPath, fileChanges } = execution;

    // Prevent duplicate validations
    if (this.activeValidations.has(taskId)) {
      return this.activeValidations.get(taskId)!;
    }

    const validationPromise = this._executeValidation(execution);
    this.activeValidations.set(taskId, validationPromise);

    try {
      const result = await validationPromise;
      return result;
    } finally {
      this.activeValidations.delete(taskId);
    }
  }

  /**
   * Execute the complete validation pipeline
   */
  private async _executeValidation(execution: TaskExecution): Promise<ValidationResult> {
    const { taskId, successCriteria, projectPath, fileChanges } = execution;
    
    const result: ValidationResult = {
      task_id: taskId,
      status: 'running',
      success_criteria: successCriteria,
      overall_success: false,
      created_at: new Date().toISOString(),
      validation_results: {},
    };

    try {
      // Step 1: Create temporary workspace
      const tempWorkspace = await this.createTemporaryWorkspace(projectPath, fileChanges);
      
      // Step 2: Run validation steps
      const validationSteps = this.buildValidationSteps(successCriteria, tempWorkspace);
      
      for (const step of validationSteps) {
        const stepResult = await this.executeValidationStep(step);
        this.updateValidationResult(result, step.name, stepResult, step.successCriteria);
      }

      // Step 3: Determine overall success
      result.overall_success = this.determineOverallSuccess(result, successCriteria);
      result.status = 'completed';
      result.completed_at = new Date().toISOString();

      // Step 4: Cleanup temporary workspace
      await this.cleanupTemporaryWorkspace(tempWorkspace);

    } catch (error) {
      result.status = 'failed';
      result.error_message = error instanceof Error ? error.message : 'Unknown error occurred';
      result.completed_at = new Date().toISOString();
    }

    return result;
  }

  /**
   * Create a temporary workspace with the AI-generated changes applied
   */
  async createTemporaryWorkspace(projectPath: string, fileChanges: FileChange[]): Promise<string> {
    const tempWorkspace = path.join(this.config.tempDir!, `validation-${uuidv4()}`);
    
    // Create temp directory
    await fs.mkdir(tempWorkspace, { recursive: true });
    
    // Copy original project files
    await this.copyProjectFiles(projectPath, tempWorkspace);
    
    // Apply file changes
    for (const change of fileChanges) {
      const targetPath = path.join(tempWorkspace, change.path);
      
      switch (change.operation) {
        case 'create':
        case 'update':
          await fs.mkdir(path.dirname(targetPath), { recursive: true });
          await fs.writeFile(targetPath, change.content, 'utf8');
          break;
        case 'delete':
          try {
            await fs.unlink(targetPath);
          } catch (error) {
            // File might not exist, continue
          }
          break;
      }
    }
    
    return tempWorkspace;
  }

  /**
   * Build validation steps based on success criteria
   */
  private buildValidationSteps(criteria: SuccessCriteria, workspace: string): ValidationStep[] {
    const steps: ValidationStep[] = [];

    if (criteria.lint) {
      steps.push({
        name: 'lint',
        command: this.config.defaultCommands!.lint!,
        workingDir: workspace,
        timeout: this.config.timeout!,
        successCriteria: criteria.lint,
      });
    }

    if (criteria.type_check) {
      steps.push({
        name: 'type_check',
        command: this.config.defaultCommands!.typecheck!,
        workingDir: workspace,
        timeout: this.config.timeout!,
        successCriteria: criteria.type_check,
      });
    }

    if (criteria.tests) {
      steps.push({
        name: 'tests',
        command: this.config.defaultCommands!.test!,
        workingDir: workspace,
        timeout: this.config.timeout!,
        successCriteria: criteria.tests,
      });
    }

    if (criteria.build) {
      steps.push({
        name: 'build',
        command: this.config.defaultCommands!.build!,
        workingDir: workspace,
        timeout: this.config.timeout!,
        successCriteria: criteria.build,
      });
    }

    if (criteria.security) {
      steps.push({
        name: 'security',
        command: this.config.defaultCommands!.security!,
        workingDir: workspace,
        timeout: this.config.timeout!,
        successCriteria: criteria.security,
      });
    }

    return steps;
  }

  /**
   * Execute a single validation step
   */
  private async executeValidationStep(step: ValidationStep): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
    duration: number;
  }> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      let stdout = '';
      let stderr = '';

      const [command, ...args] = step.command.split(' ');
      const child = spawn(command, args, {
        cwd: step.workingDir,
        stdio: 'pipe',
        shell: true,
      });

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`Validation step '${step.name}' timed out after ${step.timeout}ms`));
      }, step.timeout);

      child.on('close', (exitCode) => {
        clearTimeout(timeout);
        const duration = Date.now() - startTime;
        
        resolve({
          exitCode: exitCode || 0,
          stdout,
          stderr,
          duration,
        });
      });

      child.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  /**
   * Update validation result with step results
   */
  private updateValidationResult(
    result: ValidationResult,
    stepName: string,
    stepResult: any,
    criteria: any
  ): void {
    if (!result.validation_results) {
      result.validation_results = {};
    }

    const output = `${stepResult.stdout}\n${stepResult.stderr}`.trim();

    switch (stepName) {
      case 'lint':
        result.validation_results.lint = {
          passed: stepResult.exitCode === 0 && this.checkLintCriteria(stepResult, criteria),
          errors: this.extractLintErrors(stepResult.stdout),
          warnings: this.extractLintWarnings(stepResult.stdout),
          output,
        };
        break;

      case 'type_check':
        result.validation_results.type_check = {
          passed: stepResult.exitCode === 0,
          errors: this.extractTypeErrors(stepResult.stderr),
          output,
        };
        break;

      case 'tests':
        result.validation_results.tests = {
          passed: stepResult.exitCode === 0 && criteria.status === 'pass',
          coverage: this.extractTestCoverage(stepResult.stdout),
          output,
          errors: stepResult.exitCode !== 0 ? [stepResult.stderr] : [],
        };
        break;

      case 'build':
        result.validation_results.build = {
          passed: stepResult.exitCode === 0,
          warnings: this.extractBuildWarnings(stepResult.stdout),
          output,
        };
        break;

      case 'security':
        const vulnerabilities = this.extractSecurityVulnerabilities(stepResult.stdout);
        result.validation_results.security = {
          passed: vulnerabilities <= (criteria.vulnerabilities || 0),
          vulnerabilities,
          output,
        };
        break;
    }
  }

  /**
   * Determine if overall validation passed
   */
  private determineOverallSuccess(result: ValidationResult, criteria: SuccessCriteria): boolean {
    const results = result.validation_results;
    if (!results) return false;

    // All defined criteria must pass
    if (criteria.lint && !results.lint?.passed) return false;
    if (criteria.type_check && !results.type_check?.passed) return false;
    if (criteria.tests && !results.tests?.passed) return false;
    if (criteria.build && !results.build?.passed) return false;
    if (criteria.security && !results.security?.passed) return false;

    return true;
  }

  /**
   * Copy project files to temporary workspace
   */
  private async copyProjectFiles(source: string, destination: string): Promise<void> {
    try {
      await this.recursiveCopy(source, destination);
    } catch (error) {
      throw new Error(`Failed to copy project files: ${error}`);
    }
  }

  /**
   * Recursively copy files/directories
   */
  private async recursiveCopy(src: string, dest: string): Promise<void> {
    const stat = await fs.stat(src);
    
    if (stat.isDirectory()) {
      await fs.mkdir(dest, { recursive: true });
      const files = await fs.readdir(src);
      
      for (const file of files) {
        // Skip node_modules, .git, and other common directories
        if (['node_modules', '.git', 'dist', 'build', '.next'].includes(file)) {
          continue;
        }
        
        await this.recursiveCopy(
          path.join(src, file),
          path.join(dest, file)
        );
      }
    } else {
      await fs.copyFile(src, dest);
    }
  }

  /**
   * Cleanup temporary workspace
   */
  private async cleanupTemporaryWorkspace(workspace: string): Promise<void> {
    try {
      await fs.rm(workspace, { recursive: true, force: true });
    } catch (error) {
      console.warn(`Failed to cleanup temporary workspace: ${workspace}`, error);
    }
  }

  // Helper methods for parsing tool outputs
  private checkLintCriteria(result: any, criteria: any): boolean {
    const errors = this.extractLintErrors(result.stdout);
    return errors <= (criteria.errors || 0);
  }

  private extractLintErrors(output: string): number {
    const errorMatches = output.match(/(\d+)\s+error/gi);
    return errorMatches ? parseInt(errorMatches[0].match(/\d+/)![0]) : 0;
  }

  private extractLintWarnings(output: string): number {
    const warningMatches = output.match(/(\d+)\s+warning/gi);
    return warningMatches ? parseInt(warningMatches[0].match(/\d+/)![0]) : 0;
  }

  private extractTypeErrors(output: string): number {
    const errorLines = output.split('\n').filter(line => 
      line.includes('error TS') || line.includes('Error:')
    );
    return errorLines.length;
  }

  private extractTestCoverage(output: string): number | undefined {
    const coverageMatch = output.match(/All files\s+\|\s+([\d.]+)/);
    return coverageMatch ? parseFloat(coverageMatch[1]) : undefined;
  }

  private extractBuildWarnings(output: string): number {
    const warningLines = output.split('\n').filter(line => 
      line.toLowerCase().includes('warning')
    );
    return warningLines.length;
  }

  private extractSecurityVulnerabilities(output: string): number {
    const vulnMatch = output.match(/found (\d+) vulnerabilities/);
    return vulnMatch ? parseInt(vulnMatch[1]) : 0;
  }
}

// Export singleton instance
export const validationService = new ValidationService({
  workspaceRoot: process.cwd(),
});