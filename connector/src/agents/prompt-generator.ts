import { AgentTask } from './types';

export interface PromptTemplate {
  id: string;
  name: string;
  taskType: string;
  targetAgent: string;
  template: string;
  variables: string[];
  examples?: Array<{
    input: any;
    output: string;
  }>;
}

export interface PromptContext {
  taskType: string;
  context: any;
  previousResults?: any[];
  targetAgent: string;
  action: string;
  userInput?: string;
  projectInfo?: any;
  fileContext?: any;
}

export class PromptGenerator {
  private templates: Map<string, PromptTemplate> = new Map();
  private initialized = false;

  public async initialize(): Promise<void> {
    if (this.initialized) return;
    
    console.log('Initializing Prompt Generator...');
    await this.loadDefaultTemplates();
    this.initialized = true;
    console.log('Prompt Generator initialized successfully');
  }

  private async loadDefaultTemplates(): Promise<void> {
    const defaultTemplates: PromptTemplate[] = [
      // Claude Code Templates
      {
        id: 'claude-code-generation',
        name: 'Claude Code Generation',
        taskType: 'code_generation',
        targetAgent: 'claude-code-agent',
        template: `
You are an expert software developer working on a project. Your task is to generate high-quality code based on the following requirements.

**Task Context:**
- Task Type: {{taskType}}
- Project: {{projectName}}
- Working Directory: {{workingDirectory}}
- Programming Language: {{language}}

**Requirements:**
{{requirements}}

**Context Information:**
{{contextInfo}}

{{#if previousResults}}
**Previous Results:**
{{#each previousResults}}
- Step {{@index}}: {{this.summary}}
{{/each}}
{{/if}}

**Instructions:**
1. Analyze the requirements carefully
2. Consider the project context and existing codebase
3. Generate clean, well-documented code
4. Follow best practices for the target language
5. Include appropriate error handling
6. Add comments explaining complex logic

**Output Format:**
Please provide your response in the following format:

\`\`\`{{language}}
// Your generated code here
\`\`\`

**Explanation:**
[Provide a brief explanation of your approach and any important decisions made]

Generate the code now:`,
        variables: ['taskType', 'projectName', 'workingDirectory', 'language', 'requirements', 'contextInfo', 'previousResults']
      },
      
      {
        id: 'claude-code-review',
        name: 'Claude Code Review',
        taskType: 'code_review',
        targetAgent: 'claude-code-agent',
        template: `
You are an experienced code reviewer. Please review the following code and provide detailed feedback.

**Review Context:**
- Project: {{projectName}}
- File(s): {{filePaths}}
- Language: {{language}}
- Review Focus: {{reviewFocus}}

**Code to Review:**
\`\`\`{{language}}
{{codeToReview}}
\`\`\`

**Previous Context:**
{{#if previousResults}}
{{#each previousResults}}
- {{this.summary}}
{{/each}}
{{/if}}

**Review Guidelines:**
1. Code quality and readability
2. Performance considerations
3. Security vulnerabilities
4. Best practices adherence
5. Potential bugs or edge cases
6. Documentation and comments
7. Test coverage suggestions

**Output Format:**
## Code Review Summary
[Overall assessment of the code]

## Specific Issues
### Critical Issues
- [List any critical problems]

### Suggestions for Improvement
- [List improvements and optimizations]

### Best Practices
- [Note any best practice violations]

## Recommendations
[Provide actionable recommendations]

Provide your review now:`,
        variables: ['projectName', 'filePaths', 'language', 'reviewFocus', 'codeToReview', 'previousResults']
      },

      {
        id: 'claude-debugging',
        name: 'Claude Debugging Assistant',
        taskType: 'debugging',
        targetAgent: 'claude-code-agent',
        template: `
You are a debugging expert. Help analyze and solve the following issue.

**Problem Description:**
{{problemDescription}}

**Error Information:**
{{#if errorMessage}}
**Error Message:**
\`\`\`
{{errorMessage}}
\`\`\`
{{/if}}

{{#if stackTrace}}
**Stack Trace:**
\`\`\`
{{stackTrace}}
\`\`\`
{{/if}}

**Context:**
- Project: {{projectName}}
- Language: {{language}}
- Environment: {{environment}}
- Working Directory: {{workingDirectory}}

**Relevant Code:**
{{#if relevantCode}}
\`\`\`{{language}}
{{relevantCode}}
\`\`\`
{{/if}}

**Previous Investigation:**
{{#if previousResults}}
{{#each previousResults}}
- {{this.summary}}
{{/each}}
{{/if}}

**Debugging Approach:**
1. Analyze the error message and stack trace
2. Identify the root cause
3. Examine the relevant code sections
4. Consider environmental factors
5. Propose specific solutions
6. Suggest prevention strategies

**Output Format:**
## Problem Analysis
[Detailed analysis of the issue]

## Root Cause
[Identified root cause of the problem]

## Solution Steps
1. [Step-by-step solution]
2. [Include specific code changes if needed]

## Prevention
[Suggestions to prevent similar issues]

Provide your debugging analysis now:`,
        variables: ['problemDescription', 'errorMessage', 'stackTrace', 'projectName', 'language', 'environment', 'workingDirectory', 'relevantCode', 'previousResults']
      },

      // Gemini Templates
      {
        id: 'gemini-analysis',
        name: 'Gemini Code Analysis',
        taskType: 'analysis',
        targetAgent: 'gemini-agent',
        template: `
Analyze the following code or project structure and provide insights.

**Analysis Target:**
{{analysisTarget}}

**Context:**
- Project: {{projectName}}
- Type: {{analysisType}}
- Focus Areas: {{focusAreas}}

**Code/Content:**
{{content}}

**Previous Analysis:**
{{#if previousResults}}
{{#each previousResults}}
- {{this.summary}}
{{/each}}
{{/if}}

**Analysis Requirements:**
1. Structural analysis
2. Pattern identification
3. Complexity assessment
4. Improvement opportunities
5. Technical recommendations

Please provide a comprehensive analysis with actionable insights.`,
        variables: ['analysisTarget', 'projectName', 'analysisType', 'focusAreas', 'content', 'previousResults']
      },

      {
        id: 'gemini-documentation',
        name: 'Gemini Documentation Generator',
        taskType: 'documentation',
        targetAgent: 'gemini-agent',
        template: `
Generate comprehensive documentation for the following code or project.

**Documentation Request:**
- Type: {{documentationType}}
- Target Audience: {{targetAudience}}
- Format: {{format}}

**Code/Project Information:**
{{codeContent}}

**Context:**
- Project: {{projectName}}
- Language: {{language}}
- Purpose: {{projectPurpose}}

**Previous Documentation:**
{{#if previousResults}}
{{#each previousResults}}
- {{this.summary}}
{{/each}}
{{/if}}

**Documentation Requirements:**
1. Clear and concise explanations
2. Code examples where appropriate
3. Usage instructions
4. API reference (if applicable)
5. Best practices
6. Troubleshooting guide

Generate comprehensive documentation now:`,
        variables: ['documentationType', 'targetAudience', 'format', 'codeContent', 'projectName', 'language', 'projectPurpose', 'previousResults']
      },

      // Generic Templates
      {
        id: 'generic-task',
        name: 'Generic Task Execution',
        taskType: 'generic',
        targetAgent: 'any',
        template: `
You are an AI assistant helping with a {{taskType}} task.

**Task Description:**
{{taskDescription}}

**Context:**
{{context}}

**Requirements:**
{{requirements}}

**Previous Work:**
{{#if previousResults}}
{{#each previousResults}}
- {{this.summary}}
{{/each}}
{{/if}}

Please complete this task according to the requirements and provide a clear, detailed response.`,
        variables: ['taskType', 'taskDescription', 'context', 'requirements', 'previousResults']
      }
    ];

    // Load templates into the map
    defaultTemplates.forEach(template => {
      this.templates.set(this.getTemplateKey(template.taskType, template.targetAgent), template);
    });

    console.log(`Loaded ${defaultTemplates.length} default prompt templates`);
  }

  public async generatePrompt(context: PromptContext): Promise<string> {
    const templateKey = this.getTemplateKey(context.taskType, context.targetAgent);
    let template = this.templates.get(templateKey);

    // Fallback to generic template if specific not found
    if (!template) {
      template = this.templates.get(this.getTemplateKey('generic', 'any'));
    }

    if (!template) {
      throw new Error(`No template found for task type: ${context.taskType}, agent: ${context.targetAgent}`);
    }

    console.log(`Generating prompt using template: ${template.id}`);

    // Prepare template variables
    const variables = this.prepareTemplateVariables(context, template);

    // Render template with variables
    const prompt = this.renderTemplate(template.template, variables);

    console.log(`Generated prompt (${prompt.length} characters) for ${context.taskType}`);
    return prompt;
  }

  private getTemplateKey(taskType: string, targetAgent: string): string {
    return `${taskType}-${targetAgent}`;
  }

  private prepareTemplateVariables(context: PromptContext, template: PromptTemplate): { [key: string]: any } {
    const variables: { [key: string]: any } = {};

    // Basic context variables
    variables.taskType = context.taskType;
    variables.targetAgent = context.targetAgent;
    variables.action = context.action;

    // Project information
    if (context.projectInfo) {
      variables.projectName = context.projectInfo.name || 'Unknown Project';
      variables.projectPurpose = context.projectInfo.description || '';
      variables.language = context.projectInfo.language || this.detectLanguageFromContext(context);
    } else {
      variables.projectName = 'Current Project';
      variables.language = this.detectLanguageFromContext(context);
    }

    // Context-specific variables
    if (context.context) {
      variables.workingDirectory = context.context.workingDirectory || process.cwd();
      variables.contextInfo = this.formatContextInfo(context.context);
    }

    // Task-specific variables based on task type
    switch (context.taskType) {
      case 'code_generation':
        variables.requirements = context.userInput || context.action;
        break;
        
      case 'code_review':
        variables.reviewFocus = context.userInput || 'general code quality';
        variables.codeToReview = this.extractCodeFromContext(context);
        variables.filePaths = this.extractFilePathsFromContext(context);
        break;
        
      case 'debugging':
        variables.problemDescription = context.userInput || context.action;
        variables.errorMessage = this.extractErrorFromContext(context);
        variables.stackTrace = this.extractStackTraceFromContext(context);
        variables.relevantCode = this.extractCodeFromContext(context);
        variables.environment = process.platform;
        break;
        
      case 'documentation':
        variables.documentationType = this.inferDocumentationType(context);
        variables.targetAudience = 'developers';
        variables.format = 'markdown';
        variables.codeContent = this.extractCodeFromContext(context);
        break;
        
      case 'analysis':
        variables.analysisTarget = context.userInput || 'code structure';
        variables.analysisType = 'comprehensive';
        variables.focusAreas = 'structure, patterns, improvements';
        variables.content = this.extractCodeFromContext(context);
        break;
        
      default:
        variables.taskDescription = context.action;
        variables.requirements = context.userInput || 'Complete the requested task';
    }

    // Previous results
    variables.previousResults = context.previousResults || [];

    // Generic context
    variables.context = JSON.stringify(context.context, null, 2);

    return variables;
  }

  private renderTemplate(template: string, variables: { [key: string]: any }): string {
    let rendered = template;

    // Simple template rendering (could be replaced with a proper template engine)
    Object.entries(variables).forEach(([key, value]) => {
      const placeholder = new RegExp(`{{${key}}}`, 'g');
      rendered = rendered.replace(placeholder, String(value || ''));
    });

    // Handle conditional blocks (basic implementation)
    rendered = this.processConditionalBlocks(rendered, variables);

    // Handle loops (basic implementation)
    rendered = this.processLoops(rendered, variables);

    return rendered.trim();
  }

  private processConditionalBlocks(template: string, variables: { [key: string]: any }): string {
    // Handle {{#if variable}} blocks
    const ifRegex = /{{#if (\w+)}}([\s\S]*?){{\/if}}/g;
    
    return template.replace(ifRegex, (match, variable, content) => {
      const value = variables[variable];
      if (value && (Array.isArray(value) ? value.length > 0 : true)) {
        return content;
      }
      return '';
    });
  }

  private processLoops(template: string, variables: { [key: string]: any }): string {
    // Handle {{#each array}} blocks
    const eachRegex = /{{#each (\w+)}}([\s\S]*?){{\/each}}/g;
    
    return template.replace(eachRegex, (match, variable, content) => {
      const array = variables[variable];
      if (!Array.isArray(array)) return '';
      
      return array.map((item, index) => {
        let itemContent = content;
        // Replace {{this.property}} with item properties
        if (typeof item === 'object') {
          Object.entries(item).forEach(([key, value]) => {
            const placeholder = new RegExp(`{{this\\.${key}}}`, 'g');
            itemContent = itemContent.replace(placeholder, String(value));
          });
        } else {
          itemContent = itemContent.replace(/{{this}}/g, String(item));
        }
        // Replace {{@index}} with current index
        itemContent = itemContent.replace(/{{@index}}/g, String(index + 1));
        return itemContent;
      }).join('\n');
    });
  }

  private detectLanguageFromContext(context: PromptContext): string {
    // Try to detect language from file extensions in context
    if (context.context?.files) {
      const files = Array.isArray(context.context.files) ? context.context.files : [context.context.files];
      const extensions = files.map((file: any) => {
        const match = file.match(/\.([^.]+)$/);
        return match ? match[1] : null;
      }).filter(Boolean);

      const languageMap: { [ext: string]: string } = {
        'js': 'javascript',
        'ts': 'typescript',
        'py': 'python',
        'java': 'java',
        'cpp': 'cpp',
        'c': 'c',
        'cs': 'csharp',
        'go': 'go',
        'rs': 'rust',
        'php': 'php',
        'rb': 'ruby',
        'swift': 'swift',
        'kt': 'kotlin'
      };

      for (const ext of extensions) {
        if (languageMap[ext]) {
          return languageMap[ext];
        }
      }
    }

    return 'javascript'; // Default fallback
  }

  private formatContextInfo(context: any): string {
    const info = [];
    
    if (context.terminalId) {
      info.push(`Terminal: ${context.terminalId}`);
    }
    
    if (context.files?.length) {
      info.push(`Files: ${context.files.slice(0, 3).join(', ')}${context.files.length > 3 ? '...' : ''}`);
    }
    
    if (context.userInput) {
      info.push(`User Input: ${context.userInput.substring(0, 100)}${context.userInput.length > 100 ? '...' : ''}`);
    }

    return info.join('\n');
  }

  private extractCodeFromContext(context: PromptContext): string {
    if (context.context?.previousOutput) {
      return context.context.previousOutput;
    }
    
    if (context.previousResults?.length) {
      const codeResults = context.previousResults
        .filter(result => result.output && typeof result.output === 'string')
        .map(result => result.output);
      return codeResults.join('\n\n');
    }
    
    return '';
  }

  private extractFilePathsFromContext(context: PromptContext): string {
    if (context.context?.files) {
      return Array.isArray(context.context.files) 
        ? context.context.files.join(', ')
        : context.context.files;
    }
    return 'Current file';
  }

  private extractErrorFromContext(context: PromptContext): string {
    if (context.context?.error) {
      return context.context.error;
    }
    
    if (context.userInput?.includes('error') || context.userInput?.includes('Error')) {
      return context.userInput;
    }
    
    return '';
  }

  private extractStackTraceFromContext(context: PromptContext): string {
    if (context.context?.stackTrace) {
      return context.context.stackTrace;
    }
    
    if (context.context?.previousOutput?.includes('at ')) {
      return context.context.previousOutput;
    }
    
    return '';
  }

  private inferDocumentationType(context: PromptContext): string {
    const action = context.action.toLowerCase();
    
    if (action.includes('api')) return 'API documentation';
    if (action.includes('readme')) return 'README';
    if (action.includes('tutorial')) return 'tutorial';
    if (action.includes('guide')) return 'user guide';
    
    return 'code documentation';
  }

  public addCustomTemplate(template: PromptTemplate): void {
    const key = this.getTemplateKey(template.taskType, template.targetAgent);
    this.templates.set(key, template);
    console.log(`Added custom template: ${template.id}`);
  }

  public getAvailableTemplates(): PromptTemplate[] {
    return Array.from(this.templates.values());
  }

  public getTemplateById(id: string): PromptTemplate | undefined {
    return Array.from(this.templates.values()).find(template => template.id === id);
  }
}