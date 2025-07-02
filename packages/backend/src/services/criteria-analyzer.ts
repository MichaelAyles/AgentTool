import type { SuccessCriteria } from '../api/validation.js';
import type { StaticAnalysisReport } from './static-analysis-runner.js';
import type { TestReport } from './test-runner.js';

export interface CriteriaAnalysisResult {
  criteria_name: string;
  met: boolean;
  score: number; // 0-100
  details: {
    expected: any;
    actual: any;
    message: string;
    recommendations?: string[];
  };
  evidence: {
    source:
      | 'static_analysis'
      | 'test_results'
      | 'build'
      | 'security'
      | 'performance'
      | 'custom';
    data: any;
  }[];
}

export interface ValidationReport {
  task_id: string;
  timestamp: string;
  overall_success: boolean;
  overall_score: number; // 0-100
  criteria_results: CriteriaAnalysisResult[];
  summary: {
    total_criteria: number;
    met_criteria: number;
    failed_criteria: number;
    critical_failures: string[];
    warnings: string[];
    recommendations: string[];
  };
  execution_context: {
    workspace_id: string;
    project_path: string;
    validation_duration: number;
    static_analysis?: StaticAnalysisReport;
    test_results?: TestReport;
    build_results?: any;
    security_results?: any;
    performance_results?: any;
  };
}

export interface ReportTemplate {
  name: string;
  format: 'html' | 'markdown' | 'json' | 'junit' | 'pdf';
  sections: ReportSection[];
  styling?: {
    theme: 'default' | 'dark' | 'minimal';
    colors: Record<string, string>;
    fonts: Record<string, string>;
  };
}

export interface ReportSection {
  type:
    | 'summary'
    | 'criteria'
    | 'details'
    | 'recommendations'
    | 'evidence'
    | 'charts';
  title: string;
  content?: string;
  data_source?: string;
  filters?: Record<string, any>;
}

export class CriteriaAnalyzer {
  private templates = new Map<string, ReportTemplate>();

  constructor() {
    this.initializeDefaultTemplates();
  }

  /**
   * Analyze validation results against success criteria
   */
  async analyzeResults(
    taskId: string,
    successCriteria: SuccessCriteria,
    staticAnalysis?: StaticAnalysisReport,
    testResults?: TestReport,
    buildResults?: any,
    securityResults?: any,
    performanceResults?: any
  ): Promise<ValidationReport> {
    const analysisResults: CriteriaAnalysisResult[] = [];

    // Analyze each criterion
    if (successCriteria.lint) {
      const result = this.analyzeLintCriteria(
        successCriteria.lint,
        staticAnalysis
      );
      analysisResults.push(result);
    }

    if (successCriteria.type_check) {
      const result = this.analyzeTypeCheckCriteria(
        successCriteria.type_check,
        staticAnalysis
      );
      analysisResults.push(result);
    }

    if (successCriteria.tests) {
      const result = this.analyzeTestCriteria(
        successCriteria.tests,
        testResults
      );
      analysisResults.push(result);
    }

    if (successCriteria.build) {
      const result = this.analyzeBuildCriteria(
        successCriteria.build,
        buildResults
      );
      analysisResults.push(result);
    }

    if (successCriteria.security) {
      const result = this.analyzeSecurityCriteria(
        successCriteria.security,
        securityResults
      );
      analysisResults.push(result);
    }

    if (successCriteria.performance) {
      const result = this.analyzePerformanceCriteria(
        successCriteria.performance,
        performanceResults
      );
      analysisResults.push(result);
    }

    if (successCriteria.custom) {
      const results = this.analyzeCustomCriteria(successCriteria.custom, {
        static: staticAnalysis,
        tests: testResults,
        build: buildResults,
        security: securityResults,
        performance: performanceResults,
      });
      analysisResults.push(...results);
    }

    // Calculate overall metrics
    const overallSuccess = analysisResults.every(r => r.met);
    const overallScore =
      analysisResults.length > 0
        ? analysisResults.reduce((sum, r) => sum + r.score, 0) /
          analysisResults.length
        : 0;

    // Generate summary
    const summary = this.generateSummary(analysisResults);

    return {
      task_id: taskId,
      timestamp: new Date().toISOString(),
      overall_success: overallSuccess,
      overall_score: overallScore,
      criteria_results: analysisResults,
      summary,
      execution_context: {
        workspace_id:
          staticAnalysis?.workspace_id ||
          testResults?.workspace_id ||
          'unknown',
        project_path:
          staticAnalysis?.project_path ||
          testResults?.project_path ||
          'unknown',
        validation_duration:
          (staticAnalysis?.duration || 0) + (testResults?.duration || 0),
        static_analysis: staticAnalysis,
        test_results: testResults,
        build_results: buildResults,
        security_results: securityResults,
        performance_results: performanceResults,
      },
    };
  }

  /**
   * Generate a formatted report
   */
  async generateReport(
    validationReport: ValidationReport,
    templateName: string = 'default',
    options: {
      includeDetails?: boolean;
      includeEvidence?: boolean;
      format?: 'html' | 'markdown' | 'json';
    } = {}
  ): Promise<string> {
    const template =
      this.templates.get(templateName) || this.templates.get('default')!;
    const format = options.format || template.format;

    switch (format) {
      case 'html':
        return this.generateHtmlReport(validationReport, template, options);
      case 'markdown':
        return this.generateMarkdownReport(validationReport, template, options);
      case 'json':
        return JSON.stringify(validationReport, null, 2);
      default:
        throw new Error(`Unsupported report format: ${format}`);
    }
  }

  /**
   * Analyze lint criteria
   */
  private analyzeLintCriteria(
    criteria: NonNullable<SuccessCriteria['lint']>,
    staticAnalysis?: StaticAnalysisReport
  ): CriteriaAnalysisResult {
    const eslintResult = staticAnalysis?.results.find(r => r.tool === 'eslint');
    const prettierResult = staticAnalysis?.results.find(
      r => r.tool === 'prettier'
    );

    const actualErrors =
      (eslintResult?.summary.errors || 0) +
      (prettierResult?.summary.errors || 0);
    const actualWarnings =
      (eslintResult?.summary.warnings || 0) +
      (prettierResult?.summary.warnings || 0);

    const errorsPass = actualErrors <= criteria.errors;
    const warningsPass =
      !criteria.warnings || actualWarnings <= criteria.warnings;
    const met = errorsPass && warningsPass;

    const score = met
      ? 100
      : Math.max(0, 100 - actualErrors * 10 - actualWarnings * 2);

    const recommendations = [];
    if (!errorsPass) {
      recommendations.push(
        `Fix ${actualErrors} linting errors (maximum allowed: ${criteria.errors})`
      );
    }
    if (!warningsPass) {
      recommendations.push(
        `Reduce warnings to ${criteria.warnings} or fewer (current: ${actualWarnings})`
      );
    }

    return {
      criteria_name: 'lint',
      met,
      score,
      details: {
        expected: criteria,
        actual: { errors: actualErrors, warnings: actualWarnings },
        message: met
          ? 'Linting criteria met successfully'
          : `Linting criteria failed: ${actualErrors} errors (max ${criteria.errors})`,
        recommendations,
      },
      evidence: staticAnalysis
        ? [
            {
              source: 'static_analysis',
              data: { eslint: eslintResult, prettier: prettierResult },
            },
          ]
        : [],
    };
  }

  /**
   * Analyze type check criteria
   */
  private analyzeTypeCheckCriteria(
    criteria: NonNullable<SuccessCriteria['type_check']>,
    staticAnalysis?: StaticAnalysisReport
  ): CriteriaAnalysisResult {
    const typescriptResult = staticAnalysis?.results.find(
      r => r.tool === 'typescript'
    );
    const actualErrors = typescriptResult?.summary.errors || 0;

    const statusPass = criteria.status === 'pass' ? actualErrors === 0 : true;
    const errorsPass = !criteria.errors || actualErrors <= criteria.errors;
    const met = statusPass && errorsPass;

    const score = met ? 100 : Math.max(0, 100 - actualErrors * 15);

    const recommendations = [];
    if (!statusPass) {
      recommendations.push('Fix all TypeScript compilation errors');
    }
    if (!errorsPass) {
      recommendations.push(
        `Reduce TypeScript errors to ${criteria.errors} or fewer (current: ${actualErrors})`
      );
    }

    return {
      criteria_name: 'type_check',
      met,
      score,
      details: {
        expected: criteria,
        actual: {
          status: actualErrors === 0 ? 'pass' : 'fail',
          errors: actualErrors,
        },
        message: met
          ? 'Type checking criteria met successfully'
          : `Type checking failed: ${actualErrors} errors`,
        recommendations,
      },
      evidence: typescriptResult
        ? [
            {
              source: 'static_analysis',
              data: typescriptResult,
            },
          ]
        : [],
    };
  }

  /**
   * Analyze test criteria
   */
  private analyzeTestCriteria(
    criteria: NonNullable<SuccessCriteria['tests']>,
    testResults?: TestReport
  ): CriteriaAnalysisResult {
    const summary = testResults?.aggregated_summary;
    const actualStatus = summary?.failed === 0 ? 'pass' : 'fail';
    const actualCoverage = summary?.coverage_summary?.lines.percentage || 0;

    const statusPass =
      criteria.status === 'pass' ? actualStatus === 'pass' : true;
    const coveragePass =
      !criteria.coverage || actualCoverage >= criteria.coverage;
    const met = statusPass && coveragePass;

    let score = 100;
    if (!statusPass) score -= 50;
    if (!coveragePass)
      score -= Math.min(50, (criteria.coverage! - actualCoverage) * 2);
    score = Math.max(0, score);

    const recommendations = [];
    if (!statusPass) {
      recommendations.push(`Fix ${summary?.failed || 0} failing tests`);
    }
    if (!coveragePass) {
      recommendations.push(
        `Increase test coverage to ${criteria.coverage}% (current: ${actualCoverage.toFixed(1)}%)`
      );
    }

    return {
      criteria_name: 'tests',
      met,
      score,
      details: {
        expected: criteria,
        actual: {
          status: actualStatus,
          coverage: actualCoverage,
          passed: summary?.passed || 0,
          failed: summary?.failed || 0,
        },
        message: met
          ? 'Test criteria met successfully'
          : `Test criteria failed: ${summary?.failed || 0} failing tests`,
        recommendations,
      },
      evidence: testResults
        ? [
            {
              source: 'test_results',
              data: testResults,
            },
          ]
        : [],
    };
  }

  /**
   * Analyze build criteria
   */
  private analyzeBuildCriteria(
    criteria: NonNullable<SuccessCriteria['build']>,
    buildResults?: any
  ): CriteriaAnalysisResult {
    const actualStatus = buildResults?.success ? 'pass' : 'fail';
    const actualWarnings = buildResults?.warnings || 0;

    const statusPass =
      criteria.status === 'pass' ? actualStatus === 'pass' : true;
    const warningsPass =
      !criteria.warnings || actualWarnings <= criteria.warnings;
    const met = statusPass && warningsPass;

    const score = met ? 100 : (statusPass ? 50 : 0) + (warningsPass ? 50 : 0);

    return {
      criteria_name: 'build',
      met,
      score,
      details: {
        expected: criteria,
        actual: { status: actualStatus, warnings: actualWarnings },
        message: met
          ? 'Build criteria met successfully'
          : 'Build criteria failed',
        recommendations: !met ? ['Fix build errors and reduce warnings'] : [],
      },
      evidence: buildResults
        ? [
            {
              source: 'build',
              data: buildResults,
            },
          ]
        : [],
    };
  }

  /**
   * Analyze security criteria
   */
  private analyzeSecurityCriteria(
    criteria: NonNullable<SuccessCriteria['security']>,
    securityResults?: any
  ): CriteriaAnalysisResult {
    const actualVulnerabilities = securityResults?.vulnerabilities || 0;
    const actualSeverity = securityResults?.highest_severity || 'low';

    const vulnerabilitiesPass =
      actualVulnerabilities <= criteria.vulnerabilities;
    const severityPass =
      !criteria.severity ||
      this.compareSeverity(actualSeverity, criteria.severity) <= 0;
    const met = vulnerabilitiesPass && severityPass;

    const score = met ? 100 : Math.max(0, 100 - actualVulnerabilities * 10);

    return {
      criteria_name: 'security',
      met,
      score,
      details: {
        expected: criteria,
        actual: {
          vulnerabilities: actualVulnerabilities,
          severity: actualSeverity,
        },
        message: met
          ? 'Security criteria met successfully'
          : `Security criteria failed: ${actualVulnerabilities} vulnerabilities`,
        recommendations: !met ? ['Address security vulnerabilities'] : [],
      },
      evidence: securityResults
        ? [
            {
              source: 'security',
              data: securityResults,
            },
          ]
        : [],
    };
  }

  /**
   * Analyze performance criteria
   */
  private analyzePerformanceCriteria(
    criteria: NonNullable<SuccessCriteria['performance']>,
    performanceResults?: any
  ): CriteriaAnalysisResult {
    const actualResponseTime = performanceResults?.response_time || 0;
    const actualMemoryUsage = performanceResults?.memory_usage || 0;

    const responseTimePass =
      !criteria.max_response_time ||
      actualResponseTime <= criteria.max_response_time;
    const memoryPass =
      !criteria.max_memory_usage ||
      actualMemoryUsage <= criteria.max_memory_usage;
    const met = responseTimePass && memoryPass;

    const score = met ? 100 : 50;

    return {
      criteria_name: 'performance',
      met,
      score,
      details: {
        expected: criteria,
        actual: {
          response_time: actualResponseTime,
          memory_usage: actualMemoryUsage,
        },
        message: met
          ? 'Performance criteria met successfully'
          : 'Performance criteria failed',
        recommendations: !met ? ['Optimize performance'] : [],
      },
      evidence: performanceResults
        ? [
            {
              source: 'performance',
              data: performanceResults,
            },
          ]
        : [],
    };
  }

  /**
   * Analyze custom criteria
   */
  private analyzeCustomCriteria(
    customCriteria: Record<string, any>,
    allResults: Record<string, any>
  ): CriteriaAnalysisResult[] {
    const results: CriteriaAnalysisResult[] = [];

    for (const [name, criteria] of Object.entries(customCriteria)) {
      results.push({
        criteria_name: `custom_${name}`,
        met: true, // TODO: Implement custom criteria evaluation
        score: 100,
        details: {
          expected: criteria,
          actual: 'Not implemented',
          message: 'Custom criteria evaluation not yet implemented',
          recommendations: ['Implement custom criteria evaluation logic'],
        },
        evidence: [
          {
            source: 'custom',
            data: criteria,
          },
        ],
      });
    }

    return results;
  }

  /**
   * Generate analysis summary
   */
  private generateSummary(
    results: CriteriaAnalysisResult[]
  ): ValidationReport['summary'] {
    const totalCriteria = results.length;
    const metCriteria = results.filter(r => r.met).length;
    const failedCriteria = totalCriteria - metCriteria;

    const criticalFailures = results
      .filter(r => !r.met && r.score < 50)
      .map(r => r.criteria_name);

    const warnings = results
      .filter(r => !r.met && r.score >= 50)
      .map(r => r.criteria_name);

    const recommendations = results
      .flatMap(r => r.details.recommendations || [])
      .filter((rec, index, arr) => arr.indexOf(rec) === index); // Remove duplicates

    return {
      total_criteria: totalCriteria,
      met_criteria: metCriteria,
      failed_criteria: failedCriteria,
      critical_failures: criticalFailures,
      warnings,
      recommendations,
    };
  }

  /**
   * Generate HTML report
   */
  private async generateHtmlReport(
    report: ValidationReport,
    template: ReportTemplate,
    options: any
  ): Promise<string> {
    const successIcon = '✅';
    const failIcon = '❌';
    const warningIcon = '⚠️';

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Validation Report - ${report.task_id}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 5px; }
        .success { color: #28a745; }
        .failure { color: #dc3545; }
        .warning { color: #ffc107; }
        .criteria { margin: 20px 0; }
        .criteria-item { border: 1px solid #ddd; margin: 10px 0; padding: 15px; border-radius: 5px; }
        .score { font-weight: bold; font-size: 1.2em; }
        .recommendations { background: #fff3cd; padding: 10px; border-radius: 5px; margin: 10px 0; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Validation Report</h1>
        <p><strong>Task ID:</strong> ${report.task_id}</p>
        <p><strong>Timestamp:</strong> ${report.timestamp}</p>
        <p><strong>Overall Status:</strong> 
            <span class="${report.overall_success ? 'success' : 'failure'}">
                ${report.overall_success ? successIcon : failIcon} 
                ${report.overall_success ? 'PASSED' : 'FAILED'}
            </span>
        </p>
        <p><strong>Overall Score:</strong> <span class="score">${report.overall_score.toFixed(1)}/100</span></p>
    </div>

    <div class="criteria">
        <h2>Criteria Results</h2>
        ${report.criteria_results
          .map(
            result => `
            <div class="criteria-item">
                <h3>
                    ${result.met ? successIcon : failIcon} 
                    ${result.criteria_name.toUpperCase()}
                    <span class="score">(${result.score}/100)</span>
                </h3>
                <p><strong>Status:</strong> ${result.details.message}</p>
                ${
                  result.details.recommendations &&
                  result.details.recommendations.length > 0
                    ? `
                    <div class="recommendations">
                        <strong>Recommendations:</strong>
                        <ul>
                            ${result.details.recommendations.map(rec => `<li>${rec}</li>`).join('')}
                        </ul>
                    </div>
                `
                    : ''
                }
            </div>
        `
          )
          .join('')}
    </div>

    <div class="summary">
        <h2>Summary</h2>
        <p><strong>Total Criteria:</strong> ${report.summary.total_criteria}</p>
        <p><strong>Met:</strong> <span class="success">${report.summary.met_criteria}</span></p>
        <p><strong>Failed:</strong> <span class="failure">${report.summary.failed_criteria}</span></p>
        
        ${
          report.summary.critical_failures.length > 0
            ? `
            <div class="recommendations">
                <strong>Critical Failures:</strong>
                <ul>
                    ${report.summary.critical_failures.map(failure => `<li>${failure}</li>`).join('')}
                </ul>
            </div>
        `
            : ''
        }
        
        ${
          report.summary.recommendations.length > 0
            ? `
            <div class="recommendations">
                <strong>All Recommendations:</strong>
                <ul>
                    ${report.summary.recommendations.map(rec => `<li>${rec}</li>`).join('')}
                </ul>
            </div>
        `
            : ''
        }
    </div>
</body>
</html>
    `;

    return html.trim();
  }

  /**
   * Generate Markdown report
   */
  private async generateMarkdownReport(
    report: ValidationReport,
    template: ReportTemplate,
    options: any
  ): Promise<string> {
    const successIcon = '✅';
    const failIcon = '❌';

    return `
# Validation Report

**Task ID:** ${report.task_id}  
**Timestamp:** ${report.timestamp}  
**Overall Status:** ${report.overall_success ? successIcon : failIcon} ${report.overall_success ? 'PASSED' : 'FAILED'}  
**Overall Score:** ${report.overall_score.toFixed(1)}/100

## Criteria Results

${report.criteria_results
  .map(
    result => `
### ${result.met ? successIcon : failIcon} ${result.criteria_name.toUpperCase()} (${result.score}/100)

**Status:** ${result.details.message}

${
  result.details.recommendations && result.details.recommendations.length > 0
    ? `
**Recommendations:**
${result.details.recommendations.map(rec => `- ${rec}`).join('\n')}
`
    : ''
}
`
  )
  .join('')}

## Summary

- **Total Criteria:** ${report.summary.total_criteria}
- **Met:** ${report.summary.met_criteria}
- **Failed:** ${report.summary.failed_criteria}

${
  report.summary.critical_failures.length > 0
    ? `
### Critical Failures
${report.summary.critical_failures.map(failure => `- ${failure}`).join('\n')}
`
    : ''
}

${
  report.summary.recommendations.length > 0
    ? `
### All Recommendations
${report.summary.recommendations.map(rec => `- ${rec}`).join('\n')}
`
    : ''
}
    `.trim();
  }

  /**
   * Compare severity levels
   */
  private compareSeverity(a: string, b: string): number {
    const levels = { low: 1, medium: 2, high: 3, critical: 4 };
    return (
      (levels[a as keyof typeof levels] || 1) -
      (levels[b as keyof typeof levels] || 1)
    );
  }

  /**
   * Initialize default report templates
   */
  private initializeDefaultTemplates(): void {
    this.templates.set('default', {
      name: 'Default Report',
      format: 'html',
      sections: [
        { type: 'summary', title: 'Executive Summary' },
        { type: 'criteria', title: 'Criteria Analysis' },
        { type: 'recommendations', title: 'Recommendations' },
        { type: 'evidence', title: 'Supporting Evidence' },
      ],
    });

    this.templates.set('minimal', {
      name: 'Minimal Report',
      format: 'markdown',
      sections: [
        { type: 'summary', title: 'Summary' },
        { type: 'criteria', title: 'Results' },
      ],
    });
  }
}

// Export singleton instance
export const criteriaAnalyzer = new CriteriaAnalyzer();
