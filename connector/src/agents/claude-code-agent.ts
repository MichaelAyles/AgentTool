import { BaseAgent, AgentTask, AgentConfig, AgentMessage, TaskResult, AgentCapability } from './types';
import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';

export class ClaudeCodeAgent extends BaseAgent {
  private activeProcesses: Map<string, ChildProcess> = new Map();
  private claudeCodePath: string = 'claude';
  private sessionManager: Map<string, any> = new Map();

  constructor(config?: Partial<AgentConfig>) {
    const defaultConfig: AgentConfig = {
      id: 'claude-code-agent',
      name: 'Claude Code Integration Agent',
      type: 'ai_integration',
      capabilities: [
        {
          name: 'code_generation',
          description: 'Generate code using Claude AI',
          category: 'code',
          requirements: ['claude-code', 'file_system_access']
        },
        {
          name: 'code_review',
          description: 'Review and analyze code with Claude AI',
          category: 'analysis',
          requirements: ['claude-code', 'code_analysis']
        },
        {
          name: 'debugging_assistance',
          description: 'Debug code issues with Claude AI',
          category: 'analysis',
          requirements: ['claude-code', 'error_analysis']
        },
        {
          name: 'documentation_generation',
          description: 'Generate documentation with Claude AI',
          category: 'communication',
          requirements: ['claude-code', 'markdown_generation']
        },
        {
          name: 'code_refactoring',
          description: 'Refactor and improve code with Claude AI',
          category: 'code',
          requirements: ['claude-code', 'code_modification']
        },
        {
          name: 'test_generation',
          description: 'Generate test cases with Claude AI',
          category: 'code',
          requirements: ['claude-code', 'testing_frameworks']
        }
      ],
      tools: ['claude-code'],
      maxConcurrentTasks: 3,
      priority: 2,
      timeout: 180000, // 3 minutes
      retryAttempts: 2,
      healthCheckInterval: 45000 // 45 seconds
    };

    const mergedConfig = { ...defaultConfig, ...config };
    super(mergedConfig);
  }

  public async initialize(): Promise<void> {
    console.log(`Initializing Claude Code Agent: ${this.config.id}`);
    
    try {
      // Check if claude-code is available
      await this.verifyClaudeCodeInstallation();
      
      // Initialize session management
      this.initializeSessionManagement();
      
      // Start health monitoring
      await this.startHealthCheck();
      
      this.updateStatus({ state: 'idle' });
      console.log(`Claude Code Agent ${this.config.id} initialized successfully`);
    } catch (error) {
      console.error(`Failed to initialize Claude Code Agent:`, error);
      this.updateStatus({ state: 'error' });
      throw error;
    }
  }

  private async testCommand(command: string): Promise<boolean> {
    return new Promise((resolve) => {
      const childProcess = spawn(command, ['--version'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      childProcess.on('error', () => resolve(false));
      childProcess.on('close', (code) => resolve(code === 0));
    });
  }

  private async verifyClaudeCodeInstallation(): Promise<void> {
    const possibleCommands = ['claude-code', 'claude'];
    
    for (const command of possibleCommands) {
      if (await this.testCommand(command)) {
        this.claudeCodePath = command;
        console.log(`Found Claude Code command: ${command}`);
        return;
      }
    }
    
    return new Promise((resolve, reject) => {
      const childProcess = spawn(this.claudeCodePath, ['--version'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let output = '';
      let error = '';

      childProcess.stdout?.on('data', (data: any) => {
        output += data.toString();
      });

      childProcess.stderr?.on('data', (data: any) => {
        error += data.toString();
      });

      childProcess.on('close', (code: any) => {
        if (code === 0) {
          console.log(`Claude Code version: ${output.trim()}`);
          resolve();
        } else {
          reject(new Error(`Claude Code not available: ${error || 'Command failed'}`));
        }
      });

      childProcess.on('error', (err: any) => {
        reject(new Error(`Failed to execute claude-code: ${err.message}`));
      });
    });
  }

  private initializeSessionManagement(): void {
    // Set up session cleanup
    setInterval(() => {
      this.cleanupInactiveSessions();
    }, 300000); // Clean up every 5 minutes
  }

  public async processTask(task: AgentTask): Promise<TaskResult> {
    const startTime = Date.now();
    console.log(`Claude Code Agent processing task: ${task.id} (${task.type})`);

    try {
      let result: any;

      switch (task.type) {
        case 'code_generation':
          result = await this.handleCodeGeneration(task);
          break;
        case 'code_review':
          result = await this.handleCodeReview(task);
          break;
        case 'debugging':
          result = await this.handleDebugging(task);
          break;
        case 'documentation':
          result = await this.handleDocumentation(task);
          break;
        case 'refactoring':
          result = await this.handleRefactoring(task);
          break;
        case 'testing':
          result = await this.handleTestGeneration(task);
          break;
        default:
          result = await this.handleGenericTask(task);
      }

      const duration = Date.now() - startTime;

      return {
        taskId: task.id,
        agentId: this.config.id,
        success: true,
        output: result,
        duration,
        metadata: {
          completedAt: new Date(),
          resourcesUsed: ['claude-code'],
          outputSize: JSON.stringify(result).length,
          confidence: 0.95
        }
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`Claude Code Agent failed to process task ${task.id}:`, error);

      return {
        taskId: task.id,
        agentId: this.config.id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration,
        metadata: {
          completedAt: new Date(),
          resourcesUsed: ['claude-code'],
          outputSize: 0
        }
      };
    }
  }

  private async handleCodeGeneration(task: AgentTask): Promise<any> {
    console.log('Handling code generation task');
    
    const prompt = this.buildCodeGenerationPrompt(task);
    const args = [
      'generate',
      '--prompt', prompt
    ];

    // Add context-specific arguments
    if (task.context.workingDirectory) {
      args.push('--directory', task.context.workingDirectory);
    }

    if (task.context.files?.length) {
      args.push('--context-files', task.context.files.join(','));
    }

    const result = await this.executeClaudeCode(task.id, args);
    
    // Post-process the result to extract generated code
    const processedResult = this.processCodeGenerationResult(result, task);
    
    return processedResult;
  }

  private async handleCodeReview(task: AgentTask): Promise<any> {
    console.log('Handling code review task');
    
    const prompt = this.buildCodeReviewPrompt(task);
    const args = [
      'review',
      '--prompt', prompt
    ];

    if (task.context.files?.length) {
      args.push('--files', task.context.files.join(','));
    }

    if (task.context.workingDirectory) {
      args.push('--directory', task.context.workingDirectory);
    }

    const result = await this.executeClaudeCode(task.id, args);
    return this.processCodeReviewResult(result, task);
  }

  private async handleDebugging(task: AgentTask): Promise<any> {
    console.log('Handling debugging task');
    
    const prompt = this.buildDebuggingPrompt(task);
    const args = [
      'debug',
      '--prompt', prompt
    ];

    if (task.context.previousOutput) {
      args.push('--error-context', task.context.previousOutput);
    }

    if (task.context.workingDirectory) {
      args.push('--directory', task.context.workingDirectory);
    }

    const result = await this.executeClaudeCode(task.id, args);
    return this.processDebuggingResult(result, task);
  }

  private async handleDocumentation(task: AgentTask): Promise<any> {
    console.log('Handling documentation task');
    
    const prompt = this.buildDocumentationPrompt(task);
    const args = [
      'document',
      '--prompt', prompt,
      '--format', 'markdown'
    ];

    if (task.context.files?.length) {
      args.push('--files', task.context.files.join(','));
    }

    if (task.context.workingDirectory) {
      args.push('--directory', task.context.workingDirectory);
    }

    const result = await this.executeClaudeCode(task.id, args);
    return this.processDocumentationResult(result, task);
  }

  private async handleRefactoring(task: AgentTask): Promise<any> {
    console.log('Handling refactoring task');
    
    const prompt = this.buildRefactoringPrompt(task);
    const args = [
      'refactor',
      '--prompt', prompt
    ];

    if (task.context.files?.length) {
      args.push('--files', task.context.files.join(','));
    }

    if (task.context.workingDirectory) {
      args.push('--directory', task.context.workingDirectory);
    }

    const result = await this.executeClaudeCode(task.id, args);
    return this.processRefactoringResult(result, task);
  }

  private async handleTestGeneration(task: AgentTask): Promise<any> {
    console.log('Handling test generation task');
    
    const prompt = this.buildTestGenerationPrompt(task);
    const args = [
      'test',
      '--prompt', prompt
    ];

    if (task.context.files?.length) {
      args.push('--files', task.context.files.join(','));
    }

    if (task.context.workingDirectory) {
      args.push('--directory', task.context.workingDirectory);
    }

    const result = await this.executeClaudeCode(task.id, args);
    return this.processTestGenerationResult(result, task);
  }

  private async handleGenericTask(task: AgentTask): Promise<any> {
    console.log('Handling generic task');
    
    const prompt = task.description || 'Complete the requested task';
    const args = [
      'assist',
      '--prompt', prompt
    ];

    if (task.context.workingDirectory) {
      args.push('--directory', task.context.workingDirectory);
    }

    const result = await this.executeClaudeCode(task.id, args);
    return this.processGenericResult(result, task);
  }

  private async executeClaudeCode(taskId: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      console.log(`Executing claude-code with args: ${args.join(' ')}`);
      
      const childProcess = spawn(this.claudeCodePath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          CLAUDE_API_TIMEOUT: '180000' // 3 minutes
        }
      });

      this.activeProcesses.set(taskId, childProcess);

      let output = '';
      let error = '';

      childProcess.stdout?.on('data', (data: any) => {
        const chunk = data.toString();
        output += chunk;
        
        // Emit real-time output for streaming
        this.sendMessage({
          type: 'status_update',
          toAgent: 'middle-manager',
          priority: 'low',
          data: {
            taskId,
            type: 'stdout',
            chunk
          }
        });
      });

      childProcess.stderr?.on('data', (data: any) => {
        const chunk = data.toString();
        error += chunk;
        
        this.sendMessage({
          type: 'status_update',
          toAgent: 'middle-manager',
          priority: 'medium',
          data: {
            taskId,
            type: 'stderr',
            chunk
          }
        });
      });

      childProcess.on('close', (code: any) => {
        this.activeProcesses.delete(taskId);
        
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`Claude Code process failed with code ${code}: ${error}`));
        }
      });

      childProcess.on('error', (err: any) => {
        this.activeProcesses.delete(taskId);
        reject(new Error(`Failed to execute claude-code: ${err.message}`));
      });

      // Set timeout
      setTimeout(() => {
        if (this.activeProcesses.has(taskId)) {
          childProcess.kill('SIGTERM');
          this.activeProcesses.delete(taskId);
          reject(new Error('Claude Code execution timeout'));
        }
      }, this.config.timeout);
    });
  }

  // Prompt building methods
  private buildCodeGenerationPrompt(task: AgentTask): string {
    let prompt = `Generate code based on the following requirements:\n\n`;
    prompt += `Task: ${task.description}\n`;
    
    if (task.context.userInput) {
      prompt += `User Requirements: ${task.context.userInput}\n`;
    }
    
    if (task.context.workingDirectory) {
      prompt += `Working Directory: ${task.context.workingDirectory}\n`;
    }
    
    if (task.context.files?.length) {
      prompt += `Context Files: ${task.context.files.join(', ')}\n`;
    }
    
    prompt += `\nPlease generate clean, well-documented code that meets the requirements.`;
    
    return prompt;
  }

  private buildCodeReviewPrompt(task: AgentTask): string {
    let prompt = `Review the following code and provide detailed feedback:\n\n`;
    prompt += `Review Focus: ${task.description}\n`;
    
    if (task.context.userInput) {
      prompt += `Specific Areas: ${task.context.userInput}\n`;
    }
    
    prompt += `\nPlease provide:
1. Overall code quality assessment
2. Specific issues and improvements
3. Security considerations
4. Performance suggestions
5. Best practice recommendations`;
    
    return prompt;
  }

  private buildDebuggingPrompt(task: AgentTask): string {
    let prompt = `Help debug the following issue:\n\n`;
    prompt += `Problem: ${task.description}\n`;
    
    if (task.context.userInput) {
      prompt += `Error Details: ${task.context.userInput}\n`;
    }
    
    if (task.context.previousOutput) {
      prompt += `Error Output: ${task.context.previousOutput}\n`;
    }
    
    prompt += `\nPlease provide:
1. Root cause analysis
2. Step-by-step solution
3. Code fixes if needed
4. Prevention strategies`;
    
    return prompt;
  }

  private buildDocumentationPrompt(task: AgentTask): string {
    let prompt = `Generate documentation for the following:\n\n`;
    prompt += `Documentation Type: ${task.description}\n`;
    
    if (task.context.userInput) {
      prompt += `Specific Requirements: ${task.context.userInput}\n`;
    }
    
    prompt += `\nPlease create comprehensive documentation including:
1. Overview and purpose
2. Usage instructions
3. API reference (if applicable)
4. Examples
5. Troubleshooting guide`;
    
    return prompt;
  }

  private buildRefactoringPrompt(task: AgentTask): string {
    let prompt = `Refactor the following code:\n\n`;
    prompt += `Refactoring Goal: ${task.description}\n`;
    
    if (task.context.userInput) {
      prompt += `Specific Requirements: ${task.context.userInput}\n`;
    }
    
    prompt += `\nPlease:
1. Improve code structure and readability
2. Optimize performance where possible
3. Follow best practices
4. Maintain existing functionality
5. Add comments for complex logic`;
    
    return prompt;
  }

  private buildTestGenerationPrompt(task: AgentTask): string {
    let prompt = `Generate tests for the following code:\n\n`;
    prompt += `Test Requirements: ${task.description}\n`;
    
    if (task.context.userInput) {
      prompt += `Specific Test Cases: ${task.context.userInput}\n`;
    }
    
    prompt += `\nPlease create:
1. Unit tests for all functions
2. Integration tests where appropriate
3. Edge case testing
4. Error handling tests
5. Performance tests if relevant`;
    
    return prompt;
  }

  // Result processing methods
  private processCodeGenerationResult(output: string, task: AgentTask): any {
    return {
      type: 'code_generation',
      taskId: task.id,
      generatedCode: this.extractCodeBlocks(output),
      explanation: this.extractExplanation(output),
      fullOutput: output,
      timestamp: new Date()
    };
  }

  private processCodeReviewResult(output: string, task: AgentTask): any {
    return {
      type: 'code_review',
      taskId: task.id,
      review: this.parseReviewOutput(output),
      fullOutput: output,
      timestamp: new Date()
    };
  }

  private processDebuggingResult(output: string, task: AgentTask): any {
    return {
      type: 'debugging',
      taskId: task.id,
      analysis: this.parseDebuggingOutput(output),
      fullOutput: output,
      timestamp: new Date()
    };
  }

  private processDocumentationResult(output: string, task: AgentTask): any {
    return {
      type: 'documentation',
      taskId: task.id,
      documentation: output,
      fullOutput: output,
      timestamp: new Date()
    };
  }

  private processRefactoringResult(output: string, task: AgentTask): any {
    return {
      type: 'refactoring',
      taskId: task.id,
      refactoredCode: this.extractCodeBlocks(output),
      explanation: this.extractExplanation(output),
      fullOutput: output,
      timestamp: new Date()
    };
  }

  private processTestGenerationResult(output: string, task: AgentTask): any {
    return {
      type: 'test_generation',
      taskId: task.id,
      testCode: this.extractCodeBlocks(output),
      explanation: this.extractExplanation(output),
      fullOutput: output,
      timestamp: new Date()
    };
  }

  private processGenericResult(output: string, task: AgentTask): any {
    return {
      type: 'generic',
      taskId: task.id,
      result: output,
      fullOutput: output,
      timestamp: new Date()
    };
  }

  // Utility methods for parsing output
  private extractCodeBlocks(text: string): string[] {
    const codeBlockRegex = /```[\w]*\n([\s\S]*?)\n```/g;
    const matches = [];
    let match;
    
    while ((match = codeBlockRegex.exec(text)) !== null) {
      matches.push(match[1]);
    }
    
    return matches;
  }

  private extractExplanation(text: string): string {
    // Remove code blocks and extract explanation text
    const withoutCodeBlocks = text.replace(/```[\s\S]*?```/g, '');
    return withoutCodeBlocks.trim();
  }

  private parseReviewOutput(output: string): any {
    // Parse structured review output
    const sections = {
      summary: '',
      issues: [],
      suggestions: [],
      bestPractices: []
    };

    const lines = output.split('\n');
    let currentSection = 'summary';
    
    for (const line of lines) {
      if (line.includes('Issues') || line.includes('Problems')) {
        currentSection = 'issues';
      } else if (line.includes('Suggestions') || line.includes('Improvements')) {
        currentSection = 'suggestions';
      } else if (line.includes('Best Practices')) {
        currentSection = 'bestPractices';
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        const item = line.substring(2).trim();
        if (currentSection !== 'summary') {
          (sections as any)[currentSection].push(item);
        }
      } else if (currentSection === 'summary' && line.trim()) {
        sections.summary += line + '\n';
      }
    }

    return sections;
  }

  private parseDebuggingOutput(output: string): any {
    return {
      rootCause: this.extractSection(output, 'Root Cause', 'Solution'),
      solution: this.extractSection(output, 'Solution', 'Prevention'),
      prevention: this.extractSection(output, 'Prevention', null),
      fullAnalysis: output
    };
  }

  private extractSection(text: string, startMarker: string, endMarker: string | null): string {
    const startIndex = text.indexOf(startMarker);
    if (startIndex === -1) return '';
    
    let endIndex = text.length;
    if (endMarker) {
      const endMarkerIndex = text.indexOf(endMarker, startIndex);
      if (endMarkerIndex !== -1) {
        endIndex = endMarkerIndex;
      }
    }
    
    return text.substring(startIndex + startMarker.length, endIndex).trim();
  }

  private cleanupInactiveSessions(): void {
    const now = Date.now();
    const maxAge = 3600000; // 1 hour
    
    for (const [sessionId, session] of this.sessionManager) {
      if (now - session.lastActivity > maxAge) {
        this.sessionManager.delete(sessionId);
        console.log(`Cleaned up inactive session: ${sessionId}`);
      }
    }
  }

  protected async handleMessage(message: AgentMessage): Promise<void> {
    switch (message.type) {
      case 'task_assignment':
        if (message.data.task) {
          await this.assignTask(message.data.task);
        }
        break;
        
      case 'coordination':
        // Handle coordination messages from middle manager
        console.log(`Claude Code Agent received coordination message: ${message.data.action}`);
        break;
        
      default:
        console.log(`Claude Code Agent received unhandled message type: ${message.type}`);
    }
  }

  public async shutdown(): Promise<void> {
    console.log(`Shutting down Claude Code Agent: ${this.config.id}`);
    
    // Kill all active processes
    for (const [taskId, process] of this.activeProcesses) {
      console.log(`Terminating claude-code process for task: ${taskId}`);
      process.kill('SIGTERM');
    }
    
    this.activeProcesses.clear();
    this.sessionManager.clear();
    
    this.updateStatus({ state: 'offline' });
    console.log(`Claude Code Agent ${this.config.id} shut down successfully`);
  }
}