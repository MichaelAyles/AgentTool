import { spawn } from 'child_process';
import path from 'path';
import { promises as fs } from 'fs';
import { parseStringPromise } from 'xml2js';

export interface TestConfig {
  timeout: number;
  frameworks: {
    jest?: string;
    mocha?: string;
    vitest?: string;
    playwright?: string;
    cypress?: string;
    jasmine?: string;
    ava?: string;
    tap?: string;
  };
  outputFormats: {
    json?: boolean;
    junit?: boolean;
    coverage?: boolean;
    tap?: boolean;
  };
  coverageThreshold?: {
    statements?: number;
    branches?: number;
    functions?: number;
    lines?: number;
  };
}

export interface TestSuite {
  name: string;
  tests: TestCase[];
  duration: number;
  status: 'passed' | 'failed' | 'skipped';
  errors: string[];
}

export interface TestCase {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  error?: {
    message: string;
    stack?: string;
    type?: string;
  };
  assertions?: {
    passed: number;
    failed: number;
    total: number;
  };
}

export interface CoverageReport {
  statements: {
    total: number;
    covered: number;
    percentage: number;
  };
  branches: {
    total: number;
    covered: number;
    percentage: number;
  };
  functions: {
    total: number;
    covered: number;
    percentage: number;
  };
  lines: {
    total: number;
    covered: number;
    percentage: number;
  };
  files: FileCoverage[];
}

export interface FileCoverage {
  path: string;
  statements: { percentage: number; total: number; covered: number };
  branches: { percentage: number; total: number; covered: number };
  functions: { percentage: number; total: number; covered: number };
  lines: { percentage: number; total: number; covered: number };
  uncoveredLines: number[];
}

export interface TestRunResult {
  framework: string;
  success: boolean;
  exitCode: number;
  duration: number;
  output: {
    raw: string;
    parsed?: any;
  };
  summary: {
    total_tests: number;
    passed: number;
    failed: number;
    skipped: number;
    suites: number;
    assertions?: number;
  };
  suites: TestSuite[];
  coverage?: CoverageReport;
  performance?: {
    slowest_tests: Array<{
      name: string;
      duration: number;
      suite: string;
    }>;
    avg_test_duration: number;
    total_test_time: number;
  };
}

export interface TestReport {
  workspace_id: string;
  project_path: string;
  timestamp: string;
  duration: number;
  overall_success: boolean;
  results: TestRunResult[];
  aggregated_summary: {
    total_tests: number;
    passed: number;
    failed: number;
    skipped: number;
    frameworks_run: string[];
    frameworks_passed: string[];
    frameworks_failed: string[];
    coverage_met: boolean;
    coverage_summary?: CoverageReport;
  };
}

export class TestRunner {
  private config: TestConfig;

  constructor(config: Partial<TestConfig> = {}) {
    this.config = {
      timeout: 600000, // 10 minutes
      frameworks: {
        jest: 'npm test',
        mocha: 'npx mocha',
        vitest: 'npx vitest run',
        playwright: 'npx playwright test',
        cypress: 'npx cypress run',
        jasmine: 'npx jasmine',
        ava: 'npx ava',
        tap: 'npx tap',
      },
      outputFormats: {
        json: true,
        junit: false,
        coverage: true,
        tap: false,
      },
      coverageThreshold: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
      ...config,
    };
  }

  /**
   * Run comprehensive test suite on a workspace
   */
  async runTests(workspacePath: string, workspaceId: string): Promise<TestReport> {
    const startTime = Date.now();
    const results: TestRunResult[] = [];

    // Detect available test frameworks
    const availableFrameworks = await this.detectTestFrameworks(workspacePath);

    // Run each available framework
    for (const framework of availableFrameworks) {
      try {
        const result = await this.runFramework(framework, workspacePath);
        results.push(result);
      } catch (error) {
        // Create error result for failed framework
        results.push({
          framework,
          success: false,
          exitCode: -1,
          duration: 0,
          output: {
            raw: `Failed to run ${framework}: ${error}`,
          },
          summary: {
            total_tests: 0,
            passed: 0,
            failed: 1,
            skipped: 0,
            suites: 0,
          },
          suites: [],
        });
      }
    }

    const duration = Date.now() - startTime;

    // Generate aggregated summary
    const aggregatedSummary = this.generateAggregatedSummary(results);

    return {
      workspace_id: workspaceId,
      project_path: workspacePath,
      timestamp: new Date().toISOString(),
      duration,
      overall_success: aggregatedSummary.frameworks_failed.length === 0 && aggregatedSummary.failed === 0,
      results,
      aggregated_summary: aggregatedSummary,
    };
  }

  /**
   * Run a specific test framework
   */
  async runFramework(framework: string, workspacePath: string): Promise<TestRunResult> {
    const command = await this.getFrameworkCommand(framework, workspacePath);
    if (!command) {
      throw new Error(`No command configured for framework: ${framework}`);
    }

    const startTime = Date.now();
    const result = await this.executeCommand(command, workspacePath);
    const duration = Date.now() - startTime;

    // Parse output based on framework
    const parsed = await this.parseFrameworkOutput(framework, result.stdout, result.stderr, workspacePath);

    // Extract performance metrics
    const performance = this.extractPerformanceMetrics(parsed);

    return {
      framework,
      success: result.exitCode === 0,
      exitCode: result.exitCode,
      duration,
      output: {
        raw: result.stdout + result.stderr,
        parsed,
      },
      summary: this.extractSummary(framework, parsed, result.stdout),
      suites: this.extractTestSuites(framework, parsed),
      coverage: await this.extractCoverage(framework, workspacePath, parsed),
      performance,
    };
  }

  /**
   * Detect available test frameworks in the workspace
   */
  private async detectTestFrameworks(workspacePath: string): Promise<string[]> {
    const frameworks: string[] = [];

    // Check package.json for dependencies and scripts
    const packageJsonPath = path.join(workspacePath, 'package.json');
    try {
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
      const scripts = packageJson.scripts || {};

      // Check for framework dependencies
      if (deps.jest || scripts.test?.includes('jest')) frameworks.push('jest');
      if (deps.mocha || scripts.test?.includes('mocha')) frameworks.push('mocha');
      if (deps.vitest || scripts.test?.includes('vitest')) frameworks.push('vitest');
      if (deps['@playwright/test'] || scripts['test:e2e']?.includes('playwright')) frameworks.push('playwright');
      if (deps.cypress || scripts['test:e2e']?.includes('cypress')) frameworks.push('cypress');
      if (deps.jasmine) frameworks.push('jasmine');
      if (deps.ava) frameworks.push('ava');
      if (deps.tap) frameworks.push('tap');

      // Default to Jest if test script exists but no specific framework detected
      if (scripts.test && frameworks.length === 0) {
        frameworks.push('jest');
      }
    } catch (error) {
      console.warn('Could not read package.json:', error);
    }

    // Check for framework-specific config files
    const configFiles = {
      jest: ['jest.config.js', 'jest.config.json', 'jest.config.ts'],
      mocha: ['.mocharc.json', '.mocharc.yml', 'mocha.opts'],
      vitest: ['vitest.config.js', 'vitest.config.ts'],
      playwright: ['playwright.config.js', 'playwright.config.ts'],
      cypress: ['cypress.config.js', 'cypress.config.ts'],
      jasmine: ['jasmine.json'],
      ava: ['ava.config.js'],
      tap: ['.taprc'],
    };

    for (const [framework, configs] of Object.entries(configFiles)) {
      if (!frameworks.includes(framework)) {
        const hasConfig = await this.hasAnyFile(workspacePath, configs);
        if (hasConfig) {
          frameworks.push(framework);
        }
      }
    }

    return frameworks;
  }

  /**
   * Get the appropriate command for a framework
   */
  private async getFrameworkCommand(framework: string, workspacePath: string): Promise<string | null> {
    const packageJsonPath = path.join(workspacePath, 'package.json');
    
    try {
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
      const scripts = packageJson.scripts || {};

      // Prefer package.json scripts
      switch (framework) {
        case 'jest':
          if (scripts.test) return 'npm test';
          return 'npx jest --json --coverage';
        
        case 'mocha':
          if (scripts.test?.includes('mocha')) return 'npm test';
          return 'npx mocha --reporter json';
        
        case 'vitest':
          if (scripts.test?.includes('vitest')) return 'npm test';
          return 'npx vitest run --reporter=json';
        
        case 'playwright':
          if (scripts['test:e2e']) return 'npm run test:e2e';
          return 'npx playwright test --reporter=json';
        
        case 'cypress':
          if (scripts['test:e2e']?.includes('cypress')) return 'npm run test:e2e';
          return 'npx cypress run --reporter json';
        
        default:
          return this.config.frameworks[framework as keyof typeof this.config.frameworks] || null;
      }
    } catch {
      return this.config.frameworks[framework as keyof typeof this.config.frameworks] || null;
    }
  }

  /**
   * Execute command in workspace
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
        env: { 
          ...process.env, 
          NODE_ENV: 'test',
          CI: 'true', // Enable CI mode for better test output
        },
      });

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`Test timed out after ${this.config.timeout}ms: ${command}`));
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
   * Parse framework-specific output
   */
  private async parseFrameworkOutput(
    framework: string,
    stdout: string,
    stderr: string,
    workspacePath: string
  ): Promise<any> {
    try {
      switch (framework) {
        case 'jest':
          return this.parseJestOutput(stdout, stderr);
        
        case 'mocha':
          return this.parseMochaOutput(stdout);
        
        case 'vitest':
          return this.parseVitestOutput(stdout);
        
        case 'playwright':
          return this.parsePlaywrightOutput(stdout);
        
        case 'cypress':
          return this.parseCypressOutput(stdout);
        
        default:
          return this.parseGenericOutput(stdout, stderr);
      }
    } catch (error) {
      return {
        raw: stdout + stderr,
        parse_error: `Failed to parse ${framework} output: ${error}`,
      };
    }
  }

  /**
   * Parse Jest output
   */
  private parseJestOutput(stdout: string, stderr: string): any {
    try {
      // Jest outputs JSON when --json flag is used
      const jsonMatch = stdout.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Fallback to text parsing
    }
    
    return { raw: stdout + stderr };
  }

  /**
   * Parse Mocha JSON output
   */
  private parseMochaOutput(stdout: string): any {
    try {
      return JSON.parse(stdout);
    } catch {
      return { raw: stdout };
    }
  }

  /**
   * Parse Vitest output
   */
  private parseVitestOutput(stdout: string): any {
    try {
      // Look for JSON output in Vitest
      const lines = stdout.split('\n');
      for (const line of lines) {
        if (line.trim().startsWith('{') && line.includes('"testResults"')) {
          return JSON.parse(line);
        }
      }
    } catch {
      // Fallback
    }
    
    return { raw: stdout };
  }

  /**
   * Parse Playwright output
   */
  private parsePlaywrightOutput(stdout: string): any {
    try {
      return JSON.parse(stdout);
    } catch {
      return { raw: stdout };
    }
  }

  /**
   * Parse Cypress output
   */
  private parseCypressOutput(stdout: string): any {
    try {
      return JSON.parse(stdout);
    } catch {
      return { raw: stdout };
    }
  }

  /**
   * Parse generic test output
   */
  private parseGenericOutput(stdout: string, stderr: string): any {
    const lines = (stdout + stderr).split('\n');
    const tests = [];
    let passed = 0;
    let failed = 0;
    let skipped = 0;

    for (const line of lines) {
      if (line.includes('✓') || line.includes('PASS')) {
        passed++;
        tests.push({ status: 'passed', name: line.trim() });
      } else if (line.includes('✗') || line.includes('FAIL')) {
        failed++;
        tests.push({ status: 'failed', name: line.trim() });
      } else if (line.includes('⊘') || line.includes('SKIP')) {
        skipped++;
        tests.push({ status: 'skipped', name: line.trim() });
      }
    }

    return {
      summary: { passed, failed, skipped, total: passed + failed + skipped },
      tests,
      raw: stdout + stderr,
    };
  }

  /**
   * Extract test summary
   */
  private extractSummary(framework: string, parsed: any, rawOutput: string): TestRunResult['summary'] {
    const summary = {
      total_tests: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      suites: 0,
      assertions: 0,
    };

    try {
      switch (framework) {
        case 'jest':
          if (parsed.numTotalTests !== undefined) {
            summary.total_tests = parsed.numTotalTests;
            summary.passed = parsed.numPassedTests || 0;
            summary.failed = parsed.numFailedTests || 0;
            summary.skipped = parsed.numPendingTests || 0;
            summary.suites = parsed.numTotalTestSuites || 0;
          }
          break;

        case 'mocha':
          if (parsed.stats) {
            summary.total_tests = parsed.stats.tests || 0;
            summary.passed = parsed.stats.passes || 0;
            summary.failed = parsed.stats.failures || 0;
            summary.skipped = parsed.stats.pending || 0;
            summary.suites = parsed.stats.suites || 0;
          }
          break;

        default:
          if (parsed.summary) {
            Object.assign(summary, parsed.summary);
          }
      }
    } catch (error) {
      console.warn(`Failed to extract summary for ${framework}:`, error);
    }

    return summary;
  }

  /**
   * Extract test suites
   */
  private extractTestSuites(framework: string, parsed: any): TestSuite[] {
    const suites: TestSuite[] = [];

    try {
      switch (framework) {
        case 'jest':
          if (parsed.testResults) {
            for (const result of parsed.testResults) {
              const suite: TestSuite = {
                name: result.name,
                tests: result.assertionResults?.map((test: any) => ({
                  name: test.title,
                  status: test.status === 'passed' ? 'passed' : test.status === 'failed' ? 'failed' : 'skipped',
                  duration: test.duration || 0,
                  error: test.failureMessages?.length > 0 ? {
                    message: test.failureMessages[0],
                  } : undefined,
                })) || [],
                duration: result.endTime - result.startTime,
                status: result.status === 'passed' ? 'passed' : 'failed',
                errors: result.message ? [result.message] : [],
              };
              suites.push(suite);
            }
          }
          break;

        case 'mocha':
          if (parsed.tests) {
            const suiteMap = new Map<string, TestSuite>();
            
            for (const test of parsed.tests) {
              const suiteName = test.fullTitle?.split(' ')[0] || 'default';
              
              if (!suiteMap.has(suiteName)) {
                suiteMap.set(suiteName, {
                  name: suiteName,
                  tests: [],
                  duration: 0,
                  status: 'passed',
                  errors: [],
                });
              }
              
              const suite = suiteMap.get(suiteName)!;
              suite.tests.push({
                name: test.title,
                status: test.state === 'passed' ? 'passed' : test.state === 'failed' ? 'failed' : 'skipped',
                duration: test.duration || 0,
                error: test.err ? {
                  message: test.err.message,
                  stack: test.err.stack,
                } : undefined,
              });
              
              suite.duration += test.duration || 0;
              if (test.state === 'failed') {
                suite.status = 'failed';
              }
            }
            
            suites.push(...suiteMap.values());
          }
          break;
      }
    } catch (error) {
      console.warn(`Failed to extract test suites for ${framework}:`, error);
    }

    return suites;
  }

  /**
   * Extract coverage information
   */
  private async extractCoverage(
    framework: string,
    workspacePath: string,
    parsed: any
  ): Promise<CoverageReport | undefined> {
    try {
      // Look for coverage in parsed output first
      if (parsed.coverageMap || parsed.coverage) {
        return this.parseCoverageFromParsed(parsed);
      }

      // Look for coverage files
      const coveragePaths = [
        path.join(workspacePath, 'coverage/coverage-final.json'),
        path.join(workspacePath, 'coverage/lcov-report/index.html'),
        path.join(workspacePath, 'coverage/clover.xml'),
      ];

      for (const coveragePath of coveragePaths) {
        if (await this.fileExists(coveragePath)) {
          return await this.parseCoverageFile(coveragePath);
        }
      }
    } catch (error) {
      console.warn('Failed to extract coverage:', error);
    }

    return undefined;
  }

  /**
   * Extract performance metrics
   */
  private extractPerformanceMetrics(parsed: any): TestRunResult['performance'] {
    try {
      const allTests: Array<{ name: string; duration: number; suite: string }> = [];
      
      if (parsed.testResults) {
        for (const result of parsed.testResults) {
          for (const test of result.assertionResults || []) {
            if (test.duration) {
              allTests.push({
                name: test.title,
                duration: test.duration,
                suite: result.name,
              });
            }
          }
        }
      }

      if (allTests.length === 0) return undefined;

      const sortedTests = allTests.sort((a, b) => b.duration - a.duration);
      const totalTime = allTests.reduce((sum, test) => sum + test.duration, 0);

      return {
        slowest_tests: sortedTests.slice(0, 10),
        avg_test_duration: totalTime / allTests.length,
        total_test_time: totalTime,
      };
    } catch {
      return undefined;
    }
  }

  /**
   * Generate aggregated summary
   */
  private generateAggregatedSummary(results: TestRunResult[]): TestReport['aggregated_summary'] {
    const summary = {
      total_tests: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      frameworks_run: [] as string[],
      frameworks_passed: [] as string[],
      frameworks_failed: [] as string[],
      coverage_met: false,
      coverage_summary: undefined as CoverageReport | undefined,
    };

    for (const result of results) {
      summary.frameworks_run.push(result.framework);
      
      if (result.success && result.summary.failed === 0) {
        summary.frameworks_passed.push(result.framework);
      } else {
        summary.frameworks_failed.push(result.framework);
      }

      summary.total_tests += result.summary.total_tests;
      summary.passed += result.summary.passed;
      summary.failed += result.summary.failed;
      summary.skipped += result.summary.skipped;

      // Use the first available coverage report
      if (!summary.coverage_summary && result.coverage) {
        summary.coverage_summary = result.coverage;
        summary.coverage_met = this.checkCoverageThreshold(result.coverage);
      }
    }

    return summary;
  }

  /**
   * Check if coverage meets threshold
   */
  private checkCoverageThreshold(coverage: CoverageReport): boolean {
    const threshold = this.config.coverageThreshold!;
    
    return (
      coverage.statements.percentage >= (threshold.statements || 0) &&
      coverage.branches.percentage >= (threshold.branches || 0) &&
      coverage.functions.percentage >= (threshold.functions || 0) &&
      coverage.lines.percentage >= (threshold.lines || 0)
    );
  }

  // Helper methods
  private parseCoverageFromParsed(parsed: any): CoverageReport | undefined {
    // Implementation would parse coverage from test framework output
    return undefined;
  }

  private async parseCoverageFile(filePath: string): Promise<CoverageReport | undefined> {
    // Implementation would parse coverage files (JSON, XML, HTML)
    return undefined;
  }

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
}

// Export singleton instance
export const testRunner = new TestRunner();