import { spawn } from 'child_process';
import path from 'path';
import { promises as fs } from 'fs';

export interface AnalysisConfig {
  timeout: number;
  commands: {
    eslint?: string;
    prettier?: string;
    typescript?: string;
    jshint?: string;
    stylelint?: string;
    markdownlint?: string;
  };
  outputFormats: {
    json?: boolean;
    junit?: boolean;
    checkstyle?: boolean;
  };
}

export interface AnalysisResult {
  tool: string;
  success: boolean;
  exitCode: number;
  duration: number;
  output: {
    raw: string;
    parsed?: any;
  };
  metrics: {
    errors: number;
    warnings: number;
    info: number;
    files_checked: number;
    lines_checked?: number;
  };
  issues: Issue[];
}

export interface Issue {
  file: string;
  line: number;
  column: number;
  severity: 'error' | 'warning' | 'info';
  rule: string;
  message: string;
  source?: string;
}

export interface StaticAnalysisReport {
  workspace_id: string;
  project_path: string;
  timestamp: string;
  duration: number;
  overall_success: boolean;
  results: AnalysisResult[];
  summary: {
    total_files: number;
    total_issues: number;
    errors: number;
    warnings: number;
    info: number;
    tools_run: string[];
    tools_passed: string[];
    tools_failed: string[];
  };
}

export class StaticAnalysisRunner {
  private config: AnalysisConfig;

  constructor(config: Partial<AnalysisConfig> = {}) {
    this.config = {
      timeout: 300000, // 5 minutes
      commands: {
        eslint: 'npx eslint --format json .',
        prettier: 'npx prettier --check .',
        typescript: 'npx tsc --noEmit --pretty false',
        jshint: 'npx jshint --reporter unix .',
        stylelint: 'npx stylelint "**/*.{css,scss,sass}" --formatter json',
        markdownlint: 'npx markdownlint **/*.md --json',
      },
      outputFormats: {
        json: true,
        junit: false,
        checkstyle: false,
      },
      ...config,
    };
  }

  /**
   * Run comprehensive static analysis on a workspace
   */
  async runAnalysis(workspacePath: string, workspaceId: string): Promise<StaticAnalysisReport> {
    const startTime = Date.now();
    const results: AnalysisResult[] = [];

    // Detect available tools and configuration files
    const availableTools = await this.detectAvailableTools(workspacePath);

    // Run each available tool
    for (const tool of availableTools) {
      try {
        const result = await this.runTool(tool, workspacePath);
        results.push(result);
      } catch (error) {
        // Create error result for failed tool
        results.push({
          tool,
          success: false,
          exitCode: -1,
          duration: 0,
          output: {
            raw: `Failed to run ${tool}: ${error}`,
          },
          metrics: {
            errors: 1,
            warnings: 0,
            info: 0,
            files_checked: 0,
          },
          issues: [{
            file: 'tool_execution',
            line: 0,
            column: 0,
            severity: 'error',
            rule: 'tool_failure',
            message: `Failed to execute ${tool}: ${error}`,
          }],
        });
      }
    }

    const duration = Date.now() - startTime;

    // Generate summary
    const summary = this.generateSummary(results);

    return {
      workspace_id: workspaceId,
      project_path: workspacePath,
      timestamp: new Date().toISOString(),
      duration,
      overall_success: summary.tools_failed.length === 0,
      results,
      summary,
    };
  }

  /**
   * Run a specific static analysis tool
   */
  async runTool(tool: string, workspacePath: string): Promise<AnalysisResult> {
    const command = this.config.commands[tool as keyof typeof this.config.commands];
    if (!command) {
      throw new Error(`No command configured for tool: ${tool}`);
    }

    const startTime = Date.now();
    const result = await this.executeCommand(command, workspacePath);
    const duration = Date.now() - startTime;

    // Parse output based on tool type
    const parsed = await this.parseToolOutput(tool, result.stdout, result.stderr);

    return {
      tool,
      success: result.exitCode === 0,
      exitCode: result.exitCode,
      duration,
      output: {
        raw: result.stdout + result.stderr,
        parsed,
      },
      metrics: this.extractMetrics(tool, parsed, result.stdout),
      issues: this.extractIssues(tool, parsed, result.stdout, result.stderr),
    };
  }

  /**
   * Detect which static analysis tools are available and configured
   */
  private async detectAvailableTools(workspacePath: string): Promise<string[]> {
    const tools: string[] = [];

    // Check for configuration files and package.json scripts
    const configFiles = {
      eslint: ['.eslintrc.js', '.eslintrc.json', '.eslintrc.yml', '.eslintrc.yaml'],
      prettier: ['.prettierrc', '.prettierrc.json', '.prettierrc.yml', 'prettier.config.js'],
      typescript: ['tsconfig.json'],
      jshint: ['.jshintrc'],
      stylelint: ['.stylelintrc.json', '.stylelintrc.yml', 'stylelint.config.js'],
      markdownlint: ['.markdownlint.json', '.markdownlintrc'],
    };

    for (const [tool, configs] of Object.entries(configFiles)) {
      const hasConfig = await this.hasAnyFile(workspacePath, configs);
      const hasScript = await this.hasPackageScript(workspacePath, tool);
      
      if (hasConfig || hasScript) {
        tools.push(tool);
      }
    }

    // Always include TypeScript if tsconfig.json exists
    if (await this.fileExists(path.join(workspacePath, 'tsconfig.json'))) {
      if (!tools.includes('typescript')) {
        tools.push('typescript');
      }
    }

    return tools;
  }

  /**
   * Execute a command in the workspace
   */
  private async executeCommand(
    command: string,
    workspacePath: string
  ): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }> {
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';

      const [cmd, ...args] = command.split(' ');
      const child = spawn(cmd, args, {
        cwd: workspacePath,
        stdio: 'pipe',
        shell: true,
        env: { ...process.env, NODE_ENV: 'production' },
      });

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`Command timed out after ${this.config.timeout}ms: ${command}`));
      }, this.config.timeout);

      child.on('close', (exitCode) => {
        clearTimeout(timeout);
        resolve({
          exitCode: exitCode || 0,
          stdout,
          stderr,
        });
      });

      child.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  /**
   * Parse tool-specific output
   */
  private async parseToolOutput(
    tool: string,
    stdout: string,
    stderr: string
  ): Promise<any> {
    try {
      switch (tool) {
        case 'eslint':
          return this.parseESLintOutput(stdout);
        
        case 'prettier':
          return this.parsePrettierOutput(stdout, stderr);
        
        case 'typescript':
          return this.parseTypeScriptOutput(stderr);
        
        case 'jshint':
          return this.parseJSHintOutput(stdout);
        
        case 'stylelint':
          return this.parseStylelintOutput(stdout);
        
        case 'markdownlint':
          return this.parseMarkdownlintOutput(stdout);
        
        default:
          return { raw: stdout + stderr };
      }
    } catch (error) {
      return { 
        raw: stdout + stderr,
        parse_error: `Failed to parse ${tool} output: ${error}`,
      };
    }
  }

  /**
   * Parse ESLint JSON output
   */
  private parseESLintOutput(output: string): any {
    try {
      return JSON.parse(output);
    } catch {
      // Fallback to text parsing
      return { raw: output };
    }
  }

  /**
   * Parse Prettier output
   */
  private parsePrettierOutput(stdout: string, stderr: string): any {
    const issues = [];
    const lines = stderr.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      if (line.includes('[error]')) {
        const match = line.match(/\[error\]\s+(.+?):\s+(.+)/);
        if (match) {
          issues.push({
            file: match[1],
            message: match[2],
            severity: 'error',
          });
        }
      }
    }

    return {
      issues,
      raw: stdout + stderr,
    };
  }

  /**
   * Parse TypeScript compiler output
   */
  private parseTypeScriptOutput(stderr: string): any {
    const issues = [];
    const lines = stderr.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      const match = line.match(/(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+TS(\d+):\s+(.+)/);
      if (match) {
        issues.push({
          file: match[1],
          line: parseInt(match[2]),
          column: parseInt(match[3]),
          severity: match[4],
          rule: `TS${match[5]}`,
          message: match[6],
        });
      }
    }

    return {
      issues,
      raw: stderr,
    };
  }

  /**
   * Parse JSHint output
   */
  private parseJSHintOutput(output: string): any {
    const issues = [];
    const lines = output.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      const match = line.match(/(.+?):(\d+):(\d+):\s+(.+)/);
      if (match) {
        issues.push({
          file: match[1],
          line: parseInt(match[2]),
          column: parseInt(match[3]),
          message: match[4],
          severity: 'warning',
        });
      }
    }

    return {
      issues,
      raw: output,
    };
  }

  /**
   * Parse Stylelint JSON output
   */
  private parseStylelintOutput(output: string): any {
    try {
      return JSON.parse(output);
    } catch {
      return { raw: output };
    }
  }

  /**
   * Parse Markdownlint JSON output
   */
  private parseMarkdownlintOutput(output: string): any {
    try {
      return JSON.parse(output);
    } catch {
      return { raw: output };
    }
  }

  /**
   * Extract metrics from parsed output
   */
  private extractMetrics(tool: string, parsed: any, rawOutput: string): AnalysisResult['metrics'] {
    const metrics = {
      errors: 0,
      warnings: 0,
      info: 0,
      files_checked: 0,
      lines_checked: 0,
    };

    try {
      switch (tool) {
        case 'eslint':
          if (Array.isArray(parsed)) {
            metrics.files_checked = parsed.length;
            for (const file of parsed) {
              metrics.errors += file.errorCount || 0;
              metrics.warnings += file.warningCount || 0;
            }
          }
          break;

        case 'typescript':
          if (parsed.issues) {
            metrics.errors = parsed.issues.filter((i: any) => i.severity === 'error').length;
            metrics.warnings = parsed.issues.filter((i: any) => i.severity === 'warning').length;
            metrics.files_checked = new Set(parsed.issues.map((i: any) => i.file)).size;
          }
          break;

        case 'prettier':
          if (parsed.issues) {
            metrics.errors = parsed.issues.length;
            metrics.files_checked = new Set(parsed.issues.map((i: any) => i.file)).size;
          }
          break;

        default:
          // Generic parsing for other tools
          const errorMatches = rawOutput.match(/(\d+)\s+error/gi);
          const warningMatches = rawOutput.match(/(\d+)\s+warning/gi);
          
          if (errorMatches) {
            metrics.errors = parseInt(errorMatches[0].match(/\d+/)![0]);
          }
          if (warningMatches) {
            metrics.warnings = parseInt(warningMatches[0].match(/\d+/)![0]);
          }
      }
    } catch (error) {
      console.warn(`Failed to extract metrics for ${tool}:`, error);
    }

    return metrics;
  }

  /**
   * Extract standardized issues from parsed output
   */
  private extractIssues(tool: string, parsed: any, stdout: string, stderr: string): Issue[] {
    const issues: Issue[] = [];

    try {
      switch (tool) {
        case 'eslint':
          if (Array.isArray(parsed)) {
            for (const file of parsed) {
              for (const message of file.messages || []) {
                issues.push({
                  file: file.filePath,
                  line: message.line || 0,
                  column: message.column || 0,
                  severity: message.severity === 2 ? 'error' : 'warning',
                  rule: message.ruleId || 'unknown',
                  message: message.message,
                  source: message.source,
                });
              }
            }
          }
          break;

        case 'typescript':
          if (parsed.issues) {
            issues.push(...parsed.issues);
          }
          break;

        case 'prettier':
          if (parsed.issues) {
            for (const issue of parsed.issues) {
              issues.push({
                file: issue.file,
                line: 0,
                column: 0,
                severity: 'error' as const,
                rule: 'formatting',
                message: issue.message,
              });
            }
          }
          break;

        default:
          // Generic issue extraction
          if (parsed.issues) {
            issues.push(...parsed.issues);
          }
      }
    } catch (error) {
      console.warn(`Failed to extract issues for ${tool}:`, error);
    }

    return issues;
  }

  /**
   * Generate analysis summary
   */
  private generateSummary(results: AnalysisResult[]): StaticAnalysisReport['summary'] {
    const summary = {
      total_files: 0,
      total_issues: 0,
      errors: 0,
      warnings: 0,
      info: 0,
      tools_run: [] as string[],
      tools_passed: [] as string[],
      tools_failed: [] as string[],
    };

    const filesChecked = new Set<string>();

    for (const result of results) {
      summary.tools_run.push(result.tool);
      
      if (result.success) {
        summary.tools_passed.push(result.tool);
      } else {
        summary.tools_failed.push(result.tool);
      }

      summary.errors += result.metrics.errors;
      summary.warnings += result.metrics.warnings;
      summary.info += result.metrics.info;
      summary.total_issues += result.issues.length;

      // Track unique files
      for (const issue of result.issues) {
        filesChecked.add(issue.file);
      }
    }

    summary.total_files = filesChecked.size;

    return summary;
  }

  // Helper methods
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async hasAnyFile(basePath: string, files: string[]): Promise<boolean> {
    for (const file of files) {
      if (await this.fileExists(path.join(basePath, file))) {
        return true;
      }
    }
    return false;
  }

  private async hasPackageScript(workspacePath: string, scriptName: string): Promise<boolean> {
    try {
      const packageJsonPath = path.join(workspacePath, 'package.json');
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
      return packageJson.scripts && packageJson.scripts[scriptName];
    } catch {
      return false;
    }
  }
}

// Export singleton instance
export const staticAnalysisRunner = new StaticAnalysisRunner();