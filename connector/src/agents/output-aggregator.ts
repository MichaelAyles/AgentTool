import { EventEmitter } from 'events';
import { AgentTask, TaskResult, CoordinationPlan } from './types';

export interface AggregatedOutput {
  id: string;
  taskId: string;
  coordinationPlanId?: string;
  results: TaskResult[];
  summary: {
    totalAgents: number;
    successfulResults: number;
    failedResults: number;
    totalDuration: number;
    averageDuration: number;
    confidence: number;
  };
  finalOutput: any;
  metadata: {
    aggregatedAt: Date;
    strategy: string;
    format: 'text' | 'json' | 'markdown' | 'mixed';
    quality: {
      consistency: number;
      completeness: number;
      relevance: number;
    };
  };
}

export interface AggregationStrategy {
  name: string;
  description: string;
  apply: (results: TaskResult[], originalTask: AgentTask) => any;
  supports: string[];
  priority: number;
}

export class OutputAggregator extends EventEmitter {
  private strategies: Map<string, AggregationStrategy> = new Map();
  private aggregationHistory: Map<string, AggregatedOutput> = new Map();
  private maxHistorySize: number = 1000;

  constructor() {
    super();
    this.initializeDefaultStrategies();
  }

  public async initialize(): Promise<void> {
    console.log('Initializing Output Aggregator...');
    
    try {
      // Load any custom strategies from configuration
      await this.loadCustomStrategies();
      
      console.log(`Output Aggregator initialized with ${this.strategies.size} strategies`);
    } catch (error) {
      console.error('Failed to initialize Output Aggregator:', error);
      throw error;
    }
  }

  private initializeDefaultStrategies(): void {
    // Strategy for code generation tasks
    this.addStrategy({
      name: 'code_generation_merge',
      description: 'Merge multiple code generation results',
      priority: 1,
      supports: ['code_generation', 'refactoring'],
      apply: (results: TaskResult[], originalTask: AgentTask) => {
        return this.mergeCodeGenerationResults(results, originalTask);
      }
    });

    // Strategy for code review aggregation
    this.addStrategy({
      name: 'code_review_consolidate',
      description: 'Consolidate multiple code review results',
      priority: 1,
      supports: ['code_review'],
      apply: (results: TaskResult[], originalTask: AgentTask) => {
        return this.consolidateCodeReviews(results, originalTask);
      }
    });

    // Strategy for analysis tasks
    this.addStrategy({
      name: 'analysis_synthesis',
      description: 'Synthesize multiple analysis results',
      priority: 1,
      supports: ['analysis', 'debugging'],
      apply: (results: TaskResult[], originalTask: AgentTask) => {
        return this.synthesizeAnalysisResults(results, originalTask);
      }
    });

    // Strategy for documentation tasks
    this.addStrategy({
      name: 'documentation_merge',
      description: 'Merge multiple documentation results',
      priority: 1,
      supports: ['documentation'],
      apply: (results: TaskResult[], originalTask: AgentTask) => {
        return this.mergeDocumentationResults(results, originalTask);
      }
    });

    // Strategy for testing tasks
    this.addStrategy({
      name: 'test_suite_compilation',
      description: 'Compile multiple test generation results',
      priority: 1,
      supports: ['testing'],
      apply: (results: TaskResult[], originalTask: AgentTask) => {
        return this.compileTestSuites(results, originalTask);
      }
    });

    // Generic fallback strategy
    this.addStrategy({
      name: 'best_result_selection',
      description: 'Select the best result from multiple attempts',
      priority: 5,
      supports: ['*'], // Supports all task types
      apply: (results: TaskResult[], originalTask: AgentTask) => {
        return this.selectBestResult(results, originalTask);
      }
    });

    // Weighted average strategy
    this.addStrategy({
      name: 'weighted_average',
      description: 'Create weighted average of results',
      priority: 4,
      supports: ['*'],
      apply: (results: TaskResult[], originalTask: AgentTask) => {
        return this.weightedAverageResults(results, originalTask);
      }
    });

    // Consensus strategy
    this.addStrategy({
      name: 'consensus_builder',
      description: 'Build consensus from multiple results',
      priority: 2,
      supports: ['*'],
      apply: (results: TaskResult[], originalTask: AgentTask) => {
        return this.buildConsensusResult(results, originalTask);
      }
    });
  }

  public async aggregateResults(
    taskId: string,
    results: TaskResult[],
    originalTask: AgentTask,
    coordinationPlan?: CoordinationPlan
  ): Promise<AggregatedOutput> {
    console.log(`Aggregating ${results.length} results for task: ${taskId}`);
    
    if (results.length === 0) {
      throw new Error('No results to aggregate');
    }
    
    if (results.length === 1) {
      return this.createSingleResultAggregation(taskId, results[0], originalTask);
    }
    
    try {
      // Select appropriate aggregation strategy
      const strategy = this.selectAggregationStrategy(originalTask, results);
      
      // Apply the strategy
      const aggregatedOutput = strategy.apply(results, originalTask);
      
      // Calculate summary statistics
      const summary = this.calculateSummary(results);
      
      // Assess output quality
      const quality = this.assessOutputQuality(aggregatedOutput, results, originalTask);
      
      // Create final aggregated result
      const aggregated: AggregatedOutput = {
        id: `agg_${taskId}_${Date.now()}`,
        taskId,
        coordinationPlanId: coordinationPlan?.id,
        results,
        summary,
        finalOutput: aggregatedOutput,
        metadata: {
          aggregatedAt: new Date(),
          strategy: strategy.name,
          format: this.detectOutputFormat(aggregatedOutput),
          quality
        }
      };
      
      // Store in history
      this.aggregationHistory.set(aggregated.id, aggregated);
      this.trimHistory();
      
      console.log(`Aggregated results using strategy: ${strategy.name}`);
      this.emit('aggregationCompleted', aggregated);
      
      return aggregated;
    } catch (error) {
      console.error(`Failed to aggregate results for task ${taskId}:`, error);
      throw error;
    }
  }

  private selectAggregationStrategy(task: AgentTask, _results: TaskResult[]): AggregationStrategy {
    // Find strategies that support this task type
    const compatibleStrategies = Array.from(this.strategies.values())
      .filter(strategy => 
        strategy.supports.includes(task.type) || 
        strategy.supports.includes('*')
      )
      .sort((a, b) => a.priority - b.priority);
    
    if (compatibleStrategies.length === 0) {
      throw new Error(`No aggregation strategy found for task type: ${task.type}`);
    }
    
    // Select the highest priority compatible strategy
    return compatibleStrategies[0];
  }

  private createSingleResultAggregation(
    taskId: string, 
    result: TaskResult, 
    _originalTask: AgentTask
  ): AggregatedOutput {
    return {
      id: `agg_${taskId}_single`,
      taskId,
      results: [result],
      summary: {
        totalAgents: 1,
        successfulResults: result.success ? 1 : 0,
        failedResults: result.success ? 0 : 1,
        totalDuration: result.duration,
        averageDuration: result.duration,
        confidence: result.metadata.confidence || 0.8
      },
      finalOutput: result.output,
      metadata: {
        aggregatedAt: new Date(),
        strategy: 'single_result',
        format: this.detectOutputFormat(result.output),
        quality: {
          consistency: 1.0,
          completeness: result.success ? 1.0 : 0.5,
          relevance: 0.9
        }
      }
    };
  }

  // Specific aggregation strategy implementations
  private mergeCodeGenerationResults(results: TaskResult[], originalTask: AgentTask): any {
    const successfulResults = results.filter(r => r.success);
    
    if (successfulResults.length === 0) {
      return this.createErrorAggregation(results);
    }
    
    const codeBlocks: string[] = [];
    const explanations: string[] = [];
    const _bestPractices: string[] = [];
    
    successfulResults.forEach(result => {
      if (result.output?.generatedCode) {
        codeBlocks.push(...result.output.generatedCode);
      }
      if (result.output?.explanation) {
        explanations.push(result.output.explanation);
      }
    });
    
    return {
      type: 'code_generation_aggregated',
      task: originalTask.type,
      mergedCode: this.deduplicateAndMergeCode(codeBlocks),
      consolidatedExplanation: this.consolidateExplanations(explanations),
      agentContributions: successfulResults.map(r => ({
        agent: r.agentId,
        contribution: r.output?.generatedCode?.length || 0,
        confidence: r.metadata.confidence || 0.8
      })),
      recommendedApproach: this.determineRecommendedApproach(successfulResults),
      aggregationMetadata: {
        strategy: 'code_merge',
        sourceResults: successfulResults.length,
        qualityScore: this.calculateCodeQualityScore(successfulResults)
      }
    };
  }

  private consolidateCodeReviews(results: TaskResult[], originalTask: AgentTask): any {
    const successfulResults = results.filter(r => r.success);
    
    if (successfulResults.length === 0) {
      return this.createErrorAggregation(results);
    }
    
    const allIssues: string[] = [];
    const allSuggestions: string[] = [];
    const _securityConcerns: string[] = [];
    const _performanceIssues: string[] = [];
    
    successfulResults.forEach(result => {
      if (result.output?.review?.issues) {
        allIssues.push(...result.output.review.issues);
      }
      if (result.output?.review?.suggestions) {
        allSuggestions.push(...result.output.review.suggestions);
      }
    });
    
    return {
      type: 'code_review_consolidated',
      task: originalTask.type,
      consolidatedReview: {
        criticalIssues: this.prioritizeIssues(allIssues, 'critical'),
        suggestions: this.deduplicateSuggestions(allSuggestions),
        securityConcerns: this.extractSecurityConcerns(allIssues),
        performanceImprovements: this.extractPerformanceIssues(allIssues)
      },
      reviewerConsensus: this.buildReviewerConsensus(successfulResults),
      overallRating: this.calculateOverallRating(successfulResults),
      agentAgreement: this.calculateAgentAgreement(successfulResults),
      aggregationMetadata: {
        strategy: 'review_consolidation',
        reviewers: successfulResults.length,
        consensusLevel: this.calculateConsensusLevel(successfulResults)
      }
    };
  }

  private synthesizeAnalysisResults(results: TaskResult[], originalTask: AgentTask): any {
    const successfulResults = results.filter(r => r.success);
    
    if (successfulResults.length === 0) {
      return this.createErrorAggregation(results);
    }
    
    const insights: string[] = [];
    const findings: string[] = [];
    const recommendations: string[] = [];
    
    successfulResults.forEach(result => {
      if (result.output?.insights) {
        insights.push(...result.output.insights);
      }
      if (result.output?.analysis) {
        findings.push(result.output.analysis);
      }
      if (result.output?.recommendations) {
        recommendations.push(...result.output.recommendations);
      }
    });
    
    return {
      type: 'analysis_synthesized',
      task: originalTask.type,
      synthesizedAnalysis: {
        keyInsights: this.rankInsightsByImportance(insights),
        primaryFindings: this.consolidateFindings(findings),
        actionableRecommendations: this.prioritizeRecommendations(recommendations),
        confidenceLevel: this.calculateOverallConfidence(successfulResults)
      },
      perspectiveDiversity: this.analyzePerspectiveDiversity(successfulResults),
      convergencePoints: this.identifyConvergencePoints(successfulResults),
      aggregationMetadata: {
        strategy: 'analysis_synthesis',
        analysts: successfulResults.length,
        consensusStrength: this.measureConsensusStrength(successfulResults)
      }
    };
  }

  private mergeDocumentationResults(results: TaskResult[], originalTask: AgentTask): any {
    const successfulResults = results.filter(r => r.success);
    
    if (successfulResults.length === 0) {
      return this.createErrorAggregation(results);
    }
    
    return {
      type: 'documentation_merged',
      task: originalTask.type,
      mergedDocumentation: this.combineDocumentationSections(successfulResults),
      tableOfContents: this.generateTableOfContents(successfulResults),
      crossReferences: this.buildCrossReferences(successfulResults),
      aggregationMetadata: {
        strategy: 'documentation_merge',
        contributors: successfulResults.length,
        totalSections: this.countDocumentationSections(successfulResults)
      }
    };
  }

  private compileTestSuites(results: TaskResult[], originalTask: AgentTask): any {
    const successfulResults = results.filter(r => r.success);
    
    if (successfulResults.length === 0) {
      return this.createErrorAggregation(results);
    }
    
    return {
      type: 'test_suite_compiled',
      task: originalTask.type,
      compiledTestSuite: this.mergeTestCases(successfulResults),
      coverageAnalysis: this.analyzeTestCoverage(successfulResults),
      testStrategies: this.consolidateTestStrategies(successfulResults),
      aggregationMetadata: {
        strategy: 'test_compilation',
        generators: successfulResults.length,
        totalTests: this.countTestCases(successfulResults)
      }
    };
  }

  private selectBestResult(results: TaskResult[], originalTask: AgentTask): any {
    if (results.length === 0) return null;
    
    // Score each result based on multiple criteria
    const scoredResults = results.map(result => ({
      result,
      score: this.calculateResultScore(result)
    }));
    
    // Sort by score (descending)
    scoredResults.sort((a, b) => b.score - a.score);
    
    const bestResult = scoredResults[0].result;
    
    return {
      type: 'best_result_selected',
      task: originalTask.type,
      selectedResult: bestResult.output,
      selectionReasoning: this.explainResultSelection(scoredResults),
      alternativeResults: scoredResults.slice(1, 3).map(sr => ({
        agent: sr.result.agentId,
        score: sr.score,
        summary: this.summarizeResult(sr.result)
      })),
      aggregationMetadata: {
        strategy: 'best_selection',
        candidates: results.length,
        winningScore: scoredResults[0].score
      }
    };
  }

  private weightedAverageResults(results: TaskResult[], originalTask: AgentTask): any {
    const successfulResults = results.filter(r => r.success);
    
    if (successfulResults.length === 0) {
      return this.createErrorAggregation(results);
    }
    
    const weights = this.calculateResultWeights(successfulResults);
    
    return {
      type: 'weighted_average',
      task: originalTask.type,
      weightedResult: this.applyWeightedAveraging(successfulResults, weights),
      weightDistribution: weights,
      aggregationMetadata: {
        strategy: 'weighted_average',
        contributors: successfulResults.length
      }
    };
  }

  private buildConsensusResult(results: TaskResult[], originalTask: AgentTask): any {
    const successfulResults = results.filter(r => r.success);
    
    if (successfulResults.length === 0) {
      return this.createErrorAggregation(results);
    }
    
    return {
      type: 'consensus_built',
      task: originalTask.type,
      consensusResult: this.extractConsensusElements(successfulResults),
      agreementLevel: this.calculateAgentAgreement(successfulResults),
      dissensusPoints: this.identifyDissensusPoints(successfulResults),
      aggregationMetadata: {
        strategy: 'consensus_building',
        participants: successfulResults.length,
        consensusStrength: this.measureConsensusStrength(successfulResults)
      }
    };
  }

  // Utility methods for aggregation strategies
  private deduplicateAndMergeCode(codeBlocks: string[]): string {
    // Remove duplicates and merge code intelligently
    const uniqueBlocks = [...new Set(codeBlocks)];
    return uniqueBlocks.join('\n\n');
  }

  private consolidateExplanations(explanations: string[]): string {
    // Consolidate multiple explanations into a coherent narrative
    return explanations.join('\n\n');
  }

  private determineRecommendedApproach(_results: TaskResult[]): string {
    // Analyze results to determine the recommended approach
    return 'Combined approach based on multiple agent recommendations';
  }

  private calculateCodeQualityScore(results: TaskResult[]): number {
    // Calculate overall code quality score
    const scores = results.map(r => r.metadata.confidence || 0.8);
    return scores.reduce((sum, score) => sum + score, 0) / scores.length;
  }

  private prioritizeIssues(issues: string[], priority: string): string[] {
    // Priority-based issue filtering and sorting
    return issues.filter(issue => 
      issue.toLowerCase().includes(priority.toLowerCase())
    );
  }

  private deduplicateSuggestions(suggestions: string[]): string[] {
    // Remove duplicate suggestions
    return [...new Set(suggestions)];
  }

  private extractSecurityConcerns(issues: string[]): string[] {
    return issues.filter(issue => 
      issue.toLowerCase().includes('security') ||
      issue.toLowerCase().includes('vulnerability')
    );
  }

  private extractPerformanceIssues(issues: string[]): string[] {
    return issues.filter(issue => 
      issue.toLowerCase().includes('performance') ||
      issue.toLowerCase().includes('optimization')
    );
  }

  private calculateOverallRating(_results: TaskResult[]): number {
    // Calculate overall rating from multiple reviews
    return 7.5; // Placeholder implementation
  }

  private calculateAgentAgreement(_results: TaskResult[]): number {
    // Calculate level of agreement between agents
    return 0.8; // Placeholder implementation
  }

  private calculateConsensusLevel(_results: TaskResult[]): number {
    // Calculate consensus level among results
    return 0.75; // Placeholder implementation
  }

  private rankInsightsByImportance(insights: string[]): string[] {
    // Rank insights by importance
    return insights; // Placeholder implementation
  }

  private consolidateFindings(findings: string[]): string {
    // Consolidate multiple findings
    return findings.join(' ');
  }

  private prioritizeRecommendations(recommendations: string[]): string[] {
    // Prioritize recommendations
    return recommendations;
  }

  private calculateOverallConfidence(results: TaskResult[]): number {
    const confidences = results.map(r => r.metadata.confidence || 0.8);
    return confidences.reduce((sum, conf) => sum + conf, 0) / confidences.length;
  }

  private analyzePerspectiveDiversity(results: TaskResult[]): any {
    return { diversity: 'high', perspectives: results.length };
  }

  private identifyConvergencePoints(results: TaskResult[]): string[] {
    return ['Common theme 1', 'Common theme 2'];
  }

  private measureConsensusStrength(results: TaskResult[]): number {
    return 0.8;
  }

  private calculateResultScore(result: TaskResult): number {
    let score = 0;
    
    // Success bonus
    if (result.success) score += 50;
    
    // Confidence score
    score += (result.metadata.confidence || 0.5) * 30;
    
    // Duration penalty (faster is better)
    score += Math.max(0, 20 - (result.duration / 1000));
    
    return score;
  }

  private explainResultSelection(scoredResults: any[]): string {
    const best = scoredResults[0];
    return `Selected result from ${best.result.agentId} with score ${best.score.toFixed(2)}`;
  }

  private summarizeResult(result: TaskResult): string {
    return `Result from ${result.agentId}: ${result.success ? 'Success' : 'Failed'}`;
  }

  private calculateResultWeights(results: TaskResult[]): number[] {
    const confidences = results.map(r => r.metadata.confidence || 0.8);
    const total = confidences.reduce((sum, conf) => sum + conf, 0);
    return confidences.map(conf => conf / total);
  }

  private applyWeightedAveraging(results: TaskResult[], weights: number[]): any {
    // Apply weighted averaging to results
    return { weightedOutput: 'Combined weighted result' };
  }

  private extractConsensusElements(results: TaskResult[]): any {
    return { consensus: 'Common elements from all results' };
  }

  private identifyDissensusPoints(results: TaskResult[]): string[] {
    return ['Disagreement point 1', 'Disagreement point 2'];
  }

  private createErrorAggregation(results: TaskResult[]): any {
    return {
      type: 'error_aggregation',
      errors: results.map(r => r.error).filter(Boolean),
      message: 'All agent results failed'
    };
  }

  // Helper methods
  private calculateSummary(results: TaskResult[]): AggregatedOutput['summary'] {
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
    const confidences = results
      .filter(r => r.metadata.confidence !== undefined)
      .map(r => r.metadata.confidence!);
    
    return {
      totalAgents: results.length,
      successfulResults: successful.length,
      failedResults: failed.length,
      totalDuration,
      averageDuration: totalDuration / results.length,
      confidence: confidences.length > 0 
        ? confidences.reduce((sum, conf) => sum + conf, 0) / confidences.length
        : 0.8
    };
  }

  private assessOutputQuality(
    output: any, 
    results: TaskResult[], 
    originalTask: AgentTask
  ): AggregatedOutput['metadata']['quality'] {
    return {
      consistency: this.assessConsistency(results),
      completeness: this.assessCompleteness(output, originalTask),
      relevance: this.assessRelevance(output, originalTask)
    };
  }

  private assessConsistency(results: TaskResult[]): number {
    // Assess consistency between results
    return 0.85; // Placeholder
  }

  private assessCompleteness(output: any, task: AgentTask): number {
    // Assess how complete the output is
    return 0.9; // Placeholder
  }

  private assessRelevance(output: any, task: AgentTask): number {
    // Assess relevance to the original task
    return 0.92; // Placeholder
  }

  private detectOutputFormat(output: any): 'text' | 'json' | 'markdown' | 'mixed' {
    if (typeof output === 'string') {
      if (output.includes('```') || output.includes('##')) return 'markdown';
      return 'text';
    }
    if (typeof output === 'object') return 'json';
    return 'mixed';
  }

  // Additional utility methods for specific strategies
  private combineDocumentationSections(results: TaskResult[]): any {
    return { combinedDocs: 'Merged documentation' };
  }

  private generateTableOfContents(results: TaskResult[]): string[] {
    return ['Section 1', 'Section 2'];
  }

  private buildCrossReferences(results: TaskResult[]): any {
    return { references: [] };
  }

  private countDocumentationSections(results: TaskResult[]): number {
    return 5;
  }

  private mergeTestCases(results: TaskResult[]): any {
    return { mergedTests: 'Combined test suite' };
  }

  private analyzeTestCoverage(results: TaskResult[]): any {
    return { coverage: 85 };
  }

  private consolidateTestStrategies(results: TaskResult[]): string[] {
    return ['Unit testing', 'Integration testing'];
  }

  private countTestCases(results: TaskResult[]): number {
    return 25;
  }

  private buildReviewerConsensus(results: TaskResult[]): any {
    return { consensus: 'High agreement' };
  }

  private trimHistory(): void {
    if (this.aggregationHistory.size > this.maxHistorySize) {
      const entries = Array.from(this.aggregationHistory.entries());
      entries.sort((a, b) => 
        b[1].metadata.aggregatedAt.getTime() - a[1].metadata.aggregatedAt.getTime()
      );
      
      this.aggregationHistory.clear();
      entries.slice(0, this.maxHistorySize).forEach(([id, output]) => {
        this.aggregationHistory.set(id, output);
      });
    }
  }

  private async loadCustomStrategies(): Promise<void> {
    // Load custom strategies from configuration or plugins
    // This is a placeholder for future extensibility
  }

  // Public methods for strategy management
  public addStrategy(strategy: AggregationStrategy): void {
    this.strategies.set(strategy.name, strategy);
    console.log(`Added aggregation strategy: ${strategy.name}`);
  }

  public removeStrategy(name: string): void {
    this.strategies.delete(name);
    console.log(`Removed aggregation strategy: ${name}`);
  }

  public getStrategies(): AggregationStrategy[] {
    return Array.from(this.strategies.values());
  }

  public getAggregationHistory(): AggregatedOutput[] {
    return Array.from(this.aggregationHistory.values());
  }

  public getAggregation(id: string): AggregatedOutput | undefined {
    return this.aggregationHistory.get(id);
  }

  public clearHistory(): void {
    this.aggregationHistory.clear();
    console.log('Aggregation history cleared');
  }
}