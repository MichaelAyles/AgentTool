import { BaseAgent, AgentTask, AgentConfig, AgentMessage, TaskResult } from './types';
import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';

export class GeminiAgent extends BaseAgent {
  private activeProcesses: Map<string, ChildProcess> = new Map();
  private geminiPath: string = 'gemini';
  private sessionManager: Map<string, any> = new Map();
  private pythonPath: string = 'python';

  constructor(config?: Partial<AgentConfig>) {
    const defaultConfig: AgentConfig = {
      id: 'gemini-agent',
      name: 'Gemini CLI Integration Agent',
      type: 'ai_integration',
      capabilities: [
        {
          name: 'general_ai_assistance',
          description: 'Provide general AI assistance using Gemini',
          category: 'analysis',
          requirements: ['gemini', 'python', 'google-generativeai']
        },
        {
          name: 'code_analysis',
          description: 'Analyze code structure and patterns with Gemini',
          category: 'analysis',
          requirements: ['gemini', 'code_understanding']
        },
        {
          name: 'text_processing',
          description: 'Process and analyze text content with Gemini',
          category: 'communication',
          requirements: ['gemini', 'natural_language_processing']
        },
        {
          name: 'problem_solving',
          description: 'Solve complex problems with Gemini AI',
          category: 'analysis',
          requirements: ['gemini', 'logical_reasoning']
        },
        {
          name: 'content_generation',
          description: 'Generate various types of content with Gemini',
          category: 'communication',
          requirements: ['gemini', 'content_creation']
        },
        {
          name: 'data_analysis',
          description: 'Analyze and interpret data with Gemini',
          category: 'analysis',
          requirements: ['gemini', 'data_processing']
        }
      ],
      tools: ['gemini', 'python'],
      maxConcurrentTasks: 4,
      priority: 3,
      timeout: 120000, // 2 minutes
      retryAttempts: 2,
      healthCheckInterval: 60000 // 1 minute
    };

    const mergedConfig = { ...defaultConfig, ...config };
    super(mergedConfig);
  }

  public async initialize(): Promise<void> {
    console.log(`Initializing Gemini Agent: ${this.config.id}`);
    
    try {
      // Check if Gemini dependencies are available
      await this.verifyGeminiInstallation();
      
      // Initialize Gemini CLI wrapper if needed
      await this.initializeGeminiWrapper();
      
      // Initialize session management
      this.initializeSessionManagement();
      
      // Start health monitoring
      await this.startHealthCheck();
      
      this.updateStatus({ state: 'idle' });
      console.log(`Gemini Agent ${this.config.id} initialized successfully`);
    } catch (error) {
      console.error(`Failed to initialize Gemini Agent:`, error);
      this.updateStatus({ state: 'error' });
      throw error;
    }
  }

  private async verifyGeminiInstallation(): Promise<void> {
    try {
      // Check if Python is available
      await this.checkPython();
      
      // Check if google-generativeai is installed
      await this.checkGoogleGenerativeAI();
      
      console.log('Gemini dependencies verified successfully');
    } catch (error) {
      throw new Error(`Gemini installation verification failed: ${error}`);
    }
  }

  private async checkPython(): Promise<void> {
    return new Promise((resolve, reject) => {
      const childProcess = spawn(this.pythonPath, ['--version'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let output = '';
      childProcess.stdout?.on('data', (data: any) => {
        output += data.toString();
      });

      childProcess.on('close', (code: any) => {
        if (code === 0) {
          console.log(`Python version: ${output.trim()}`);
          resolve();
        } else {
          reject(new Error('Python not available'));
        }
      });

      childProcess.on('error', (err: any) => {
        reject(new Error(`Failed to execute python: ${err.message}`));
      });
    });
  }

  private async checkGoogleGenerativeAI(): Promise<void> {
    return new Promise((resolve, reject) => {
      const childProcess = spawn(this.pythonPath, ['-c', 'import google.generativeai; print("Google GenerativeAI available")'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let _output = '';
      let error = '';

      childProcess.stdout?.on('data', (data: any) => {
        _output += data.toString();
      });

      childProcess.stderr?.on('data', (data: any) => {
        error += data.toString();
      });

      childProcess.on('close', (code: any) => {
        if (code === 0) {
          console.log('Google GenerativeAI library available');
          resolve();
        } else {
          reject(new Error(`Google GenerativeAI not available: ${error}`));
        }
      });

      childProcess.on('error', (err: any) => {
        reject(new Error(`Failed to check Google GenerativeAI: ${err.message}`));
      });
    });
  }

  private async initializeGeminiWrapper(): Promise<void> {
    // Create a Python wrapper script for Gemini if it doesn't exist
    const wrapperPath = path.join(__dirname, 'gemini_wrapper.py');
    
    try {
      await fs.access(wrapperPath);
      console.log('Gemini wrapper script already exists');
    } catch {
      console.log('Creating Gemini wrapper script...');
      await this.createGeminiWrapper(wrapperPath);
    }
    
    this.geminiPath = wrapperPath;
  }

  private async createGeminiWrapper(wrapperPath: string): Promise<void> {
    const wrapperScript = `#!/usr/bin/env python3
"""
Gemini CLI Wrapper for DuckBridge Agent System
"""

import sys
import json
import argparse
import os
from typing import Optional, Dict, Any

try:
    import google.generativeai as genai
except ImportError:
    print("Error: google-generativeai package not installed")
    print("Install with: pip install google-generativeai")
    sys.exit(1)

class GeminiCLI:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv('GOOGLE_AI_API_KEY')
        if not self.api_key:
            raise ValueError("GOOGLE_AI_API_KEY environment variable must be set")
        
        genai.configure(api_key=self.api_key)
        self.model = genai.GenerativeModel('gemini-pro')
    
    def generate_text(self, prompt: str, max_tokens: Optional[int] = None) -> Dict[str, Any]:
        """Generate text using Gemini Pro"""
        try:
            response = self.model.generate_content(prompt)
            return {
                'success': True,
                'text': response.text,
                'usage': {
                    'prompt_tokens': len(prompt.split()),
                    'completion_tokens': len(response.text.split()) if response.text else 0
                }
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
    
    def analyze_code(self, code: str, analysis_type: str = 'general') -> Dict[str, Any]:
        """Analyze code with specific focus"""
        prompt = f"""
Please analyze the following code with focus on {analysis_type}:

{code}

Provide:
1. Code structure analysis
2. Quality assessment
3. Potential improvements
4. Security considerations
5. Performance insights
"""
        return self.generate_text(prompt)
    
    def solve_problem(self, problem: str, context: str = '') -> Dict[str, Any]:
        """Solve a problem with optional context"""
        prompt = f"""
Problem: {problem}

Context: {context}

Please provide:
1. Problem analysis
2. Potential solutions
3. Step-by-step approach
4. Considerations and trade-offs
"""
        return self.generate_text(prompt)
    
    def process_data(self, data: str, task: str) -> Dict[str, Any]:
        """Process data according to specified task"""
        prompt = f"""
Task: {task}

Data:
{data}

Please analyze the data and provide insights based on the specified task.
"""
        return self.generate_text(prompt)

def main():
    parser = argparse.ArgumentParser(description='Gemini CLI Wrapper')
    parser.add_argument('command', choices=['generate', 'analyze', 'solve', 'process'])
    parser.add_argument('--prompt', required=True, help='Input prompt or text')
    parser.add_argument('--type', default='general', help='Analysis or processing type')
    parser.add_argument('--context', default='', help='Additional context')
    parser.add_argument('--max-tokens', type=int, help='Maximum tokens to generate')
    parser.add_argument('--output-format', choices=['json', 'text'], default='json')
    
    args = parser.parse_args()
    
    try:
        cli = GeminiCLI()
        
        if args.command == 'generate':
            result = cli.generate_text(args.prompt, args.max_tokens)
        elif args.command == 'analyze':
            result = cli.analyze_code(args.prompt, args.type)
        elif args.command == 'solve':
            result = cli.solve_problem(args.prompt, args.context)
        elif args.command == 'process':
            result = cli.process_data(args.prompt, args.type)
        
        if args.output_format == 'json':
            print(json.dumps(result, indent=2))
        else:
            if result.get('success'):
                print(result.get('text', ''))
            else:
                print(f"Error: {result.get('error', 'Unknown error')}")
                sys.exit(1)
                
    except Exception as e:
        error_result = {
            'success': False,
            'error': str(e)
        }
        if args.output_format == 'json':
            print(json.dumps(error_result, indent=2))
        else:
            print(f"Error: {e}")
            sys.exit(1)

if __name__ == '__main__':
    main()
`;

    await fs.writeFile(wrapperPath, wrapperScript);
    
    // Make it executable
    await fs.chmod(wrapperPath, '755');
    
    console.log('Gemini wrapper script created successfully');
  }

  private initializeSessionManagement(): void {
    // Set up session cleanup
    setInterval(() => {
      this.cleanupInactiveSessions();
    }, 300000); // Clean up every 5 minutes
  }

  public async processTask(task: AgentTask): Promise<TaskResult> {
    const startTime = Date.now();
    console.log(`Gemini Agent processing task: ${task.id} (${task.type})`);

    try {
      let result: any;

      switch (task.type) {
        case 'analysis':
          result = await this.handleAnalysis(task);
          break;
        case 'code_review':
          result = await this.handleCodeAnalysis(task);
          break;
        case 'documentation':
          result = await this.handleContentGeneration(task);
          break;
        case 'debugging':
          result = await this.handleProblemSolving(task);
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
          resourcesUsed: ['gemini'],
          outputSize: JSON.stringify(result).length,
          confidence: 0.90
        }
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`Gemini Agent failed to process task ${task.id}:`, error);

      return {
        taskId: task.id,
        agentId: this.config.id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration,
        metadata: {
          completedAt: new Date(),
          resourcesUsed: ['gemini'],
          outputSize: 0
        }
      };
    }
  }

  private async handleAnalysis(task: AgentTask): Promise<any> {
    console.log('Handling analysis task with Gemini');
    
    const prompt = this.buildAnalysisPrompt(task);
    const args = [
      'analyze',
      '--prompt', prompt,
      '--type', 'comprehensive',
      '--output-format', 'json'
    ];

    const result = await this.executeGemini(task.id, args);
    return this.processAnalysisResult(result, task);
  }

  private async handleCodeAnalysis(task: AgentTask): Promise<any> {
    console.log('Handling code analysis task with Gemini');
    
    const codeContent = this.extractCodeFromTask(task);
    const args = [
      'analyze',
      '--prompt', codeContent,
      '--type', 'code_quality',
      '--output-format', 'json'
    ];

    const result = await this.executeGemini(task.id, args);
    return this.processCodeAnalysisResult(result, task);
  }

  private async handleContentGeneration(task: AgentTask): Promise<any> {
    console.log('Handling content generation task with Gemini');
    
    const prompt = this.buildContentGenerationPrompt(task);
    const args = [
      'generate',
      '--prompt', prompt,
      '--output-format', 'json'
    ];

    const result = await this.executeGemini(task.id, args);
    return this.processContentGenerationResult(result, task);
  }

  private async handleProblemSolving(task: AgentTask): Promise<any> {
    console.log('Handling problem solving task with Gemini');
    
    const prompt = task.description;
    const context = this.buildProblemContext(task);
    const args = [
      'solve',
      '--prompt', prompt,
      '--context', context,
      '--output-format', 'json'
    ];

    const result = await this.executeGemini(task.id, args);
    return this.processProblemSolvingResult(result, task);
  }

  private async handleGenericTask(task: AgentTask): Promise<any> {
    console.log('Handling generic task with Gemini');
    
    const prompt = task.description || 'Complete the requested task';
    const args = [
      'generate',
      '--prompt', prompt,
      '--output-format', 'json'
    ];

    const result = await this.executeGemini(task.id, args);
    return this.processGenericResult(result, task);
  }

  private async executeGemini(taskId: string, args: string[]): Promise<any> {
    return new Promise((resolve, reject) => {
      console.log(`Executing Gemini with args: ${args.join(' ')}`);
      
      const childProcess = spawn(this.pythonPath, [this.geminiPath, ...args], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          GOOGLE_AI_API_KEY: process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY
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
          try {
            const result = JSON.parse(output);
            resolve(result);
          } catch (parseError) {
            // If JSON parsing fails, return raw output
            resolve({ success: true, text: output });
          }
        } else {
          reject(new Error(`Gemini process failed with code ${code}: ${error}`));
        }
      });

      childProcess.on('error', (err: any) => {
        this.activeProcesses.delete(taskId);
        reject(new Error(`Failed to execute Gemini: ${err.message}`));
      });

      // Set timeout
      setTimeout(() => {
        if (this.activeProcesses.has(taskId)) {
          childProcess.kill('SIGTERM');
          this.activeProcesses.delete(taskId);
          reject(new Error('Gemini execution timeout'));
        }
      }, this.config.timeout);
    });
  }

  // Prompt building methods
  private buildAnalysisPrompt(task: AgentTask): string {
    let prompt = `Provide a comprehensive analysis of the following:\n\n`;
    prompt += `Analysis Target: ${task.description}\n`;
    
    if (task.context.userInput) {
      prompt += `User Input: ${task.context.userInput}\n`;
    }
    
    if (task.context.files?.length) {
      prompt += `Relevant Files: ${task.context.files.join(', ')}\n`;
    }
    
    if (task.context.previousOutput) {
      prompt += `Previous Context: ${task.context.previousOutput}\n`;
    }
    
    prompt += `\nPlease provide detailed insights and analysis.`;
    
    return prompt;
  }

  private buildContentGenerationPrompt(task: AgentTask): string {
    let prompt = `Generate content based on the following requirements:\n\n`;
    prompt += `Content Type: ${task.description}\n`;
    
    if (task.context.userInput) {
      prompt += `Specific Requirements: ${task.context.userInput}\n`;
    }
    
    prompt += `\nPlease create high-quality, relevant content.`;
    
    return prompt;
  }

  private buildProblemContext(task: AgentTask): string {
    let context = '';
    
    if (task.context.workingDirectory) {
      context += `Working Directory: ${task.context.workingDirectory}\n`;
    }
    
    if (task.context.files?.length) {
      context += `Related Files: ${task.context.files.join(', ')}\n`;
    }
    
    if (task.context.previousOutput) {
      context += `Previous Output: ${task.context.previousOutput}\n`;
    }
    
    if (task.context.userInput) {
      context += `Additional Context: ${task.context.userInput}\n`;
    }
    
    return context;
  }

  private extractCodeFromTask(task: AgentTask): string {
    if (task.context.previousOutput) {
      return task.context.previousOutput;
    }
    
    return task.description || 'No code provided';
  }

  // Result processing methods
  private processAnalysisResult(output: any, task: AgentTask): any {
    return {
      type: 'analysis',
      taskId: task.id,
      analysis: output.success ? output.text : output.error,
      insights: this.extractInsights(output),
      recommendations: this.extractRecommendations(output),
      fullOutput: output,
      timestamp: new Date()
    };
  }

  private processCodeAnalysisResult(output: any, task: AgentTask): any {
    return {
      type: 'code_analysis',
      taskId: task.id,
      analysis: output.success ? output.text : output.error,
      qualityScore: this.extractQualityScore(output),
      issues: this.extractIssues(output),
      suggestions: this.extractSuggestions(output),
      fullOutput: output,
      timestamp: new Date()
    };
  }

  private processContentGenerationResult(output: any, task: AgentTask): any {
    return {
      type: 'content_generation',
      taskId: task.id,
      content: output.success ? output.text : output.error,
      fullOutput: output,
      timestamp: new Date()
    };
  }

  private processProblemSolvingResult(output: any, task: AgentTask): any {
    return {
      type: 'problem_solving',
      taskId: task.id,
      solution: output.success ? output.text : output.error,
      approach: this.extractApproach(output),
      considerations: this.extractConsiderations(output),
      fullOutput: output,
      timestamp: new Date()
    };
  }

  private processGenericResult(output: any, task: AgentTask): any {
    return {
      type: 'generic',
      taskId: task.id,
      result: output.success ? output.text : output.error,
      fullOutput: output,
      timestamp: new Date()
    };
  }

  // Utility methods for extracting structured information
  private extractInsights(output: any): string[] {
    if (!output.success || !output.text) return [];
    
    const insights = [];
    const lines = output.text.split('\n');
    
    for (const line of lines) {
      if (line.toLowerCase().includes('insight') || 
          line.toLowerCase().includes('finding') ||
          line.match(/^\d+\./)) {
        insights.push(line.trim());
      }
    }
    
    return insights;
  }

  private extractRecommendations(output: any): string[] {
    if (!output.success || !output.text) return [];
    
    const recommendations = [];
    const lines = output.text.split('\n');
    
    for (const line of lines) {
      if (line.toLowerCase().includes('recommend') || 
          line.toLowerCase().includes('suggest') ||
          line.startsWith('- ') ||
          line.startsWith('* ')) {
        recommendations.push(line.trim());
      }
    }
    
    return recommendations;
  }

  private extractQualityScore(output: any): number {
    if (!output.success || !output.text) return 0;
    
    const scoreMatch = output.text.match(/(\d+)\/10|(\d+)%|score[:\s]*(\d+)/i);
    if (scoreMatch) {
      const score = parseInt(scoreMatch[1] || scoreMatch[2] || scoreMatch[3]);
      return scoreMatch[2] ? score : score * 10; // Convert to percentage if needed
    }
    
    return 75; // Default score
  }

  private extractIssues(output: any): string[] {
    if (!output.success || !output.text) return [];
    
    const issues = [];
    const lines = output.text.split('\n');
    
    for (const line of lines) {
      if (line.toLowerCase().includes('issue') || 
          line.toLowerCase().includes('problem') ||
          line.toLowerCase().includes('error') ||
          line.toLowerCase().includes('bug')) {
        issues.push(line.trim());
      }
    }
    
    return issues;
  }

  private extractSuggestions(output: any): string[] {
    return this.extractRecommendations(output);
  }

  private extractApproach(output: any): string {
    if (!output.success || !output.text) return '';
    
    const approachMatch = output.text.match(/approach[:\s]*(.*?)(?:\n\n|\n[A-Z]|$)/is);
    return approachMatch ? approachMatch[1].trim() : '';
  }

  private extractConsiderations(output: any): string[] {
    if (!output.success || !output.text) return [];
    
    const considerations = [];
    const lines = output.text.split('\n');
    
    for (const line of lines) {
      if (line.toLowerCase().includes('consider') || 
          line.toLowerCase().includes('trade-off') ||
          line.toLowerCase().includes('limitation')) {
        considerations.push(line.trim());
      }
    }
    
    return considerations;
  }

  private cleanupInactiveSessions(): void {
    const now = Date.now();
    const maxAge = 3600000; // 1 hour
    
    for (const [sessionId, session] of this.sessionManager) {
      if (now - session.lastActivity > maxAge) {
        this.sessionManager.delete(sessionId);
        console.log(`Cleaned up inactive Gemini session: ${sessionId}`);
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
        console.log(`Gemini Agent received coordination message: ${message.data.action}`);
        break;
        
      default:
        console.log(`Gemini Agent received unhandled message type: ${message.type}`);
    }
  }

  public async shutdown(): Promise<void> {
    console.log(`Shutting down Gemini Agent: ${this.config.id}`);
    
    // Kill all active processes
    for (const [taskId, process] of this.activeProcesses) {
      console.log(`Terminating Gemini process for task: ${taskId}`);
      process.kill('SIGTERM');
    }
    
    this.activeProcesses.clear();
    this.sessionManager.clear();
    
    this.updateStatus({ state: 'offline' });
    console.log(`Gemini Agent ${this.config.id} shut down successfully`);
  }
}