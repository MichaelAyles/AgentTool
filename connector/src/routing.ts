import { ToolDetectionService, ToolInfo } from './tools';
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

export interface CommandInfo {
  command: string;
  args: string[];
  tool: string | null;
  toolInfo: ToolInfo | null;
  isAgentTool: boolean;
  category: 'ai' | 'development' | 'devops' | 'system' | 'database' | 'cloud' | 'unknown';
  timestamp: Date;
}

export interface CommandHistory {
  uuid: string;
  terminalId: string;
  tool: string;
  commands: Array<{
    command: string;
    args: string[];
    timestamp: Date;
    exitCode?: number;
    output?: string;
    error?: string;
    duration?: number;
  }>;
}

export interface RouteResult {
  success: boolean;
  handled: boolean;
  output?: string;
  error?: string;
  process?: ChildProcess;
  commandInfo: CommandInfo;
}

export interface AgentToolConfig {
  name: string;
  executable: string;
  args: string[];
  interceptMode: 'full' | 'commands' | 'none';
  responseFormat: 'streaming' | 'batch' | 'json';
  maxTokens?: number;
  timeout?: number;
}

export class CommandParser {
  private toolDetectionService: ToolDetectionService;
  private agentTools: Set<string> = new Set(['claude-code', 'gemini', 'cursor', 'codeium', 'copilot']);
  
  constructor(toolDetectionService: ToolDetectionService) {
    this.toolDetectionService = toolDetectionService;
  }

  /**
   * Parse a command string and identify the tool being used
   */
  public parseCommand(commandLine: string): CommandInfo {
    const trimmed = commandLine.trim();
    if (!trimmed) {
      return this.createCommandInfo('', [], null, null);
    }

    // Split command into parts, handling quoted arguments
    const parts = this.parseCommandLine(trimmed);
    const [command, ...args] = parts;

    // Get tool registry
    const registry = this.toolDetectionService.getRegistry();
    
    // Check direct tool match
    let tool = registry[command];
    if (tool) {
      return this.createCommandInfo(command, args, command, tool);
    }

    // Check for common aliases and patterns
    const aliasMatch = this.checkAliases(command);
    if (aliasMatch && registry[aliasMatch]) {
      tool = registry[aliasMatch];
      return this.createCommandInfo(command, args, aliasMatch, tool);
    }

    // Check for compound commands (e.g., "npm run build", "git status")
    const compoundMatch = this.checkCompoundCommands(command, args);
    if (compoundMatch && registry[compoundMatch]) {
      tool = registry[compoundMatch];
      return this.createCommandInfo(command, args, compoundMatch, tool);
    }

    // Check for system commands that might be tools
    const systemMatch = this.checkSystemCommands(command);
    if (systemMatch && registry[systemMatch]) {
      tool = registry[systemMatch];
      return this.createCommandInfo(command, args, systemMatch, tool);
    }

    return this.createCommandInfo(command, args, null, null);
  }

  /**
   * Parse command line string into array of arguments, handling quotes
   */
  private parseCommandLine(commandLine: string): string[] {
    const args: string[] = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';
    let escaped = false;

    for (let i = 0; i < commandLine.length; i++) {
      const char = commandLine[i];

      if (escaped) {
        current += char;
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (inQuotes) {
        if (char === quoteChar) {
          inQuotes = false;
          quoteChar = '';
        } else {
          current += char;
        }
      } else {
        if (char === '"' || char === "'") {
          inQuotes = true;
          quoteChar = char;
        } else if (char === ' ' || char === '\t') {
          if (current) {
            args.push(current);
            current = '';
          }
        } else {
          current += char;
        }
      }
    }

    if (current) {
      args.push(current);
    }

    return args;
  }

  /**
   * Check for command aliases
   */
  private checkAliases(command: string): string | null {
    const aliases: { [key: string]: string } = {
      // Git aliases
      'g': 'git',
      'gitk': 'git',
      
      // Node/npm aliases
      'npm': 'node',
      'npx': 'node',
      'yarn': 'node',
      'pnpm': 'node',
      
      // Python aliases
      'pip': 'python',
      'pip3': 'python',
      'python3': 'python',
      'py': 'python',
      
      // Docker aliases
      'docker-compose': 'docker',
      'docker-machine': 'docker',
      
      // Database aliases
      'mysql-client': 'mysql',
      'postgresql': 'psql',
      'pg': 'psql',
      'redis': 'redis-cli',
      
      // System aliases
      'curl': 'curl',
      'wget': 'wget',
      'jq': 'jq'
    };

    return aliases[command] || null;
  }

  /**
   * Check for compound commands where the tool is identified by the base command
   */
  private checkCompoundCommands(command: string, args: string[]): string | null {
    // These are commands where the first argument might indicate the tool
    if (args.length > 0) {
      const fullCommand = `${command} ${args[0]}`;
      
      // Docker compose commands
      if (command === 'docker' && args[0] === 'compose') {
        return 'docker';
      }
      
      // Git subcommands are already handled by direct match
      if (command === 'git') {
        return 'git';
      }
      
      // NPM/Node commands
      if (['npm', 'yarn', 'pnpm'].includes(command)) {
        return 'node';
      }
      
      // Python package managers
      if (['pip', 'pip3'].includes(command)) {
        return 'python';
      }
    }

    return null;
  }

  /**
   * Check for system commands that might be tools
   */
  private checkSystemCommands(command: string): string | null {
    const systemCommands: { [key: string]: string } = {
      'code': 'code',
      'vim': 'vim',
      'nvim': 'vim',
      'emacs': 'emacs',
      'nano': 'nano',
      'ssh': 'ssh',
      'scp': 'ssh',
      'rsync': 'rsync',
      'grep': 'grep',
      'sed': 'sed',
      'awk': 'awk',
      'find': 'find',
      'ls': 'ls',
      'cat': 'cat',
      'less': 'less',
      'more': 'less',
      'tail': 'tail',
      'head': 'head'
    };

    return systemCommands[command] || null;
  }

  /**
   * Create CommandInfo object
   */
  private createCommandInfo(
    command: string, 
    args: string[], 
    tool: string | null, 
    toolInfo: ToolInfo | null
  ): CommandInfo {
    return {
      command,
      args,
      tool,
      toolInfo,
      isAgentTool: tool ? this.agentTools.has(tool) : false,
      category: toolInfo?.category || 'unknown',
      timestamp: new Date()
    };
  }

  /**
   * Check if a command is an AI agent tool
   */
  public isAgentTool(command: string): boolean {
    return this.agentTools.has(command);
  }

  /**
   * Add custom agent tool
   */
  public addAgentTool(toolName: string): void {
    this.agentTools.add(toolName);
  }

  /**
   * Remove agent tool
   */
  public removeAgentTool(toolName: string): void {
    this.agentTools.delete(toolName);
  }

  /**
   * Get list of registered agent tools
   */
  public getAgentTools(): string[] {
    return Array.from(this.agentTools);
  }
}

export class CommandHistoryManager {
  private histories: Map<string, Map<string, CommandHistory>> = new Map(); // uuid -> terminalId -> history
  private maxHistorySize: number = 1000;
  private toolHistories: Map<string, Map<string, CommandHistory>> = new Map(); // uuid -> tool -> history

  /**
   * Add command to history
   */
  public addCommand(
    uuid: string, 
    terminalId: string, 
    commandInfo: CommandInfo,
    output?: string,
    error?: string,
    exitCode?: number,
    duration?: number
  ): void {
    // Add to terminal history
    this.addToTerminalHistory(uuid, terminalId, commandInfo, output, error, exitCode, duration);
    
    // Add to tool-specific history if tool is identified
    if (commandInfo.tool) {
      this.addToToolHistory(uuid, commandInfo.tool, commandInfo, output, error, exitCode, duration);
    }
  }

  private addToTerminalHistory(
    uuid: string, 
    terminalId: string, 
    commandInfo: CommandInfo,
    output?: string,
    error?: string,
    exitCode?: number,
    duration?: number
  ): void {
    if (!this.histories.has(uuid)) {
      this.histories.set(uuid, new Map());
    }

    const userHistories = this.histories.get(uuid)!;
    if (!userHistories.has(terminalId)) {
      userHistories.set(terminalId, {
        uuid,
        terminalId,
        tool: 'terminal',
        commands: []
      });
    }

    const history = userHistories.get(terminalId)!;
    history.commands.push({
      command: commandInfo.command,
      args: commandInfo.args,
      timestamp: commandInfo.timestamp,
      exitCode,
      output,
      error,
      duration
    });

    // Trim history if it exceeds max size
    if (history.commands.length > this.maxHistorySize) {
      history.commands = history.commands.slice(-this.maxHistorySize);
    }
  }

  private addToToolHistory(
    uuid: string, 
    tool: string, 
    commandInfo: CommandInfo,
    output?: string,
    error?: string,
    exitCode?: number,
    duration?: number
  ): void {
    if (!this.toolHistories.has(uuid)) {
      this.toolHistories.set(uuid, new Map());
    }

    const userToolHistories = this.toolHistories.get(uuid)!;
    if (!userToolHistories.has(tool)) {
      userToolHistories.set(tool, {
        uuid,
        terminalId: 'all',
        tool,
        commands: []
      });
    }

    const history = userToolHistories.get(tool)!;
    history.commands.push({
      command: commandInfo.command,
      args: commandInfo.args,
      timestamp: commandInfo.timestamp,
      exitCode,
      output,
      error,
      duration
    });

    // Trim history if it exceeds max size
    if (history.commands.length > this.maxHistorySize) {
      history.commands = history.commands.slice(-this.maxHistorySize);
    }
  }

  /**
   * Get terminal history
   */
  public getTerminalHistory(uuid: string, terminalId: string): CommandHistory | null {
    return this.histories.get(uuid)?.get(terminalId) || null;
  }

  /**
   * Get tool-specific history
   */
  public getToolHistory(uuid: string, tool: string): CommandHistory | null {
    return this.toolHistories.get(uuid)?.get(tool) || null;
  }

  /**
   * Get all tool histories for a user
   */
  public getUserToolHistories(uuid: string): CommandHistory[] {
    const userToolHistories = this.toolHistories.get(uuid);
    return userToolHistories ? Array.from(userToolHistories.values()) : [];
  }

  /**
   * Get recent commands for a tool
   */
  public getRecentCommands(uuid: string, tool: string, limit: number = 10): Array<{
    command: string;
    args: string[];
    timestamp: Date;
    exitCode?: number;
  }> {
    const history = this.getToolHistory(uuid, tool);
    if (!history) return [];

    return history.commands
      .slice(-limit)
      .map(cmd => ({
        command: cmd.command,
        args: cmd.args,
        timestamp: cmd.timestamp,
        exitCode: cmd.exitCode
      }));
  }

  /**
   * Clear history for a user
   */
  public clearUserHistory(uuid: string): void {
    this.histories.delete(uuid);
    this.toolHistories.delete(uuid);
  }

  /**
   * Clear tool history for a user
   */
  public clearToolHistory(uuid: string, tool: string): void {
    this.toolHistories.get(uuid)?.delete(tool);
  }

  /**
   * Get history statistics
   */
  public getHistoryStats(uuid: string): {
    totalCommands: number;
    toolUsage: { [tool: string]: number };
    recentActivity: Array<{ tool: string; count: number; lastUsed: Date }>;
  } {
    const userToolHistories = this.toolHistories.get(uuid) || new Map();
    const stats = {
      totalCommands: 0,
      toolUsage: {} as { [tool: string]: number },
      recentActivity: [] as Array<{ tool: string; count: number; lastUsed: Date }>
    };

    for (const [tool, history] of userToolHistories) {
      const commandCount = history.commands.length;
      stats.totalCommands += commandCount;
      stats.toolUsage[tool] = commandCount;

      if (commandCount > 0) {
        const lastCommand = history.commands[history.commands.length - 1];
        stats.recentActivity.push({
          tool,
          count: commandCount,
          lastUsed: lastCommand.timestamp
        });
      }
    }

    // Sort recent activity by last used
    stats.recentActivity.sort((a, b) => b.lastUsed.getTime() - a.lastUsed.getTime());

    return stats;
  }
}

export class OutputFormatter {
  /**
   * Format command output based on tool type
   */
  public formatOutput(commandInfo: CommandInfo, output: string): {
    formatted: string;
    html: string;
    highlights: Array<{ start: number; end: number; type: string }>;
  } {
    const result = {
      formatted: output,
      html: this.escapeHtml(output),
      highlights: [] as Array<{ start: number; end: number; type: string }>
    };

    if (!commandInfo.tool || !output) {
      return result;
    }

    switch (commandInfo.category) {
      case 'development':
        return this.formatDevelopmentOutput(commandInfo, output, result);
      case 'ai':
        return this.formatAIOutput(commandInfo, output, result);
      case 'devops':
        return this.formatDevOpsOutput(commandInfo, output, result);
      case 'system':
        return this.formatSystemOutput(commandInfo, output, result);
      default:
        return this.formatGenericOutput(commandInfo, output, result);
    }
  }

  private formatDevelopmentOutput(commandInfo: CommandInfo, output: string, result: any) {
    switch (commandInfo.tool) {
      case 'git':
        return this.formatGitOutput(output, result);
      case 'node':
        return this.formatNodeOutput(commandInfo, output, result);
      case 'python':
        return this.formatPythonOutput(output, result);
      default:
        return result;
    }
  }

  private formatAIOutput(commandInfo: CommandInfo, output: string, result: any) {
    // Special formatting for AI tools
    result.html = this.formatMarkdown(output);
    return result;
  }

  private formatDevOpsOutput(commandInfo: CommandInfo, output: string, result: any) {
    switch (commandInfo.tool) {
      case 'docker':
        return this.formatDockerOutput(output, result);
      case 'kubectl':
        return this.formatKubernetesOutput(output, result);
      default:
        return result;
    }
  }

  private formatSystemOutput(commandInfo: CommandInfo, output: string, result: any) {
    // Add syntax highlighting for common patterns
    result.html = this.highlightSystemOutput(output);
    return result;
  }

  private formatGenericOutput(commandInfo: CommandInfo, output: string, result: any) {
    // Basic formatting with line numbers for long outputs
    if (output.split('\n').length > 10) {
      result.html = this.addLineNumbers(this.escapeHtml(output));
    }
    return result;
  }

  private formatGitOutput(output: string, result: any) {
    let html = this.escapeHtml(output);
    
    // Highlight git status patterns
    html = html.replace(/(modified:|new file:|deleted:)/g, '<span class="git-status-modified">$1</span>');
    html = html.replace(/(Untracked files:)/g, '<span class="git-status-untracked">$1</span>');
    html = html.replace(/(Changes to be committed:)/g, '<span class="git-status-staged">$1</span>');
    html = html.replace(/(\+\d+|-\d+)/g, '<span class="git-diff-stats">$1</span>');

    result.html = html;
    return result;
  }

  private formatNodeOutput(commandInfo: CommandInfo, output: string, result: any) {
    let html = this.escapeHtml(output);
    
    // Highlight npm/yarn patterns
    if (commandInfo.command.includes('npm') || commandInfo.command.includes('yarn')) {
      html = html.replace(/(WARN|WARNING)/g, '<span class="npm-warn">$1</span>');
      html = html.replace(/(ERROR|ERR!)/g, '<span class="npm-error">$1</span>');
      html = html.replace(/(✓|✔)/g, '<span class="npm-success">$1</span>');
    }

    result.html = html;
    return result;
  }

  private formatPythonOutput(output: string, result: any) {
    let html = this.escapeHtml(output);
    
    // Highlight Python error patterns
    html = html.replace(/(Traceback \(most recent call last\):)/g, '<span class="python-traceback">$1</span>');
    html = html.replace(/(\w+Error:)/g, '<span class="python-error">$1</span>');
    html = html.replace(/(File ".*", line \d+)/g, '<span class="python-file-ref">$1</span>');

    result.html = html;
    return result;
  }

  private formatDockerOutput(output: string, result: any) {
    let html = this.escapeHtml(output);
    
    // Highlight Docker patterns
    html = html.replace(/(CONTAINER ID|IMAGE|COMMAND|CREATED|STATUS|PORTS|NAMES)/g, '<span class="docker-header">$1</span>');
    html = html.replace(/(Up \d+.*|Exited \(\d+\).*)/g, '<span class="docker-status">$1</span>');

    result.html = html;
    return result;
  }

  private formatKubernetesOutput(output: string, result: any) {
    let html = this.escapeHtml(output);
    
    // Highlight Kubernetes patterns
    html = html.replace(/(NAME|READY|STATUS|RESTARTS|AGE|NAMESPACE)/g, '<span class="k8s-header">$1</span>');
    html = html.replace(/(Running|Pending|Failed|Succeeded)/g, '<span class="k8s-status">$1</span>');

    result.html = html;
    return result;
  }

  private formatMarkdown(text: string): string {
    let html = this.escapeHtml(text);
    
    // Basic markdown formatting
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    html = html.replace(/`(.*?)`/g, '<code>$1</code>');
    html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gm, '<h1>$1</h1>');

    return html;
  }

  private highlightSystemOutput(output: string): string {
    let html = this.escapeHtml(output);
    
    // Highlight common patterns
    html = html.replace(/(error|ERROR)/g, '<span class="system-error">$1</span>');
    html = html.replace(/(warning|WARNING|warn|WARN)/g, '<span class="system-warning">$1</span>');
    html = html.replace(/(success|SUCCESS|ok|OK|✓|✔)/g, '<span class="system-success">$1</span>');
    html = html.replace(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/g, '<span class="system-timestamp">$1</span>');

    return html;
  }

  private addLineNumbers(html: string): string {
    const lines = html.split('\n');
    return lines.map((line, index) => 
      `<span class="line-number">${index + 1}</span> ${line}`
    ).join('\n');
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}

export class CommandRoutingEngine extends EventEmitter {
  private parser: CommandParser;
  private historyManager: CommandHistoryManager;
  private outputFormatter: OutputFormatter;
  private agentConfigs: Map<string, AgentToolConfig> = new Map();
  private activeProcesses: Map<string, ChildProcess> = new Map(); // terminalId -> process

  constructor(toolDetectionService: ToolDetectionService) {
    super();
    this.parser = new CommandParser(toolDetectionService);
    this.historyManager = new CommandHistoryManager();
    this.outputFormatter = new OutputFormatter();
    this.initializeAgentConfigs();
  }

  private initializeAgentConfigs(): void {
    // Default agent tool configurations
    this.agentConfigs.set('claude-code', {
      name: 'Claude Code',
      executable: 'claude-code',
      args: [],
      interceptMode: 'full',
      responseFormat: 'streaming',
      timeout: 300000 // 5 minutes
    });

    this.agentConfigs.set('gemini', {
      name: 'Gemini CLI',
      executable: 'gemini',
      args: [],
      interceptMode: 'commands',
      responseFormat: 'batch',
      timeout: 180000 // 3 minutes
    });
  }

  /**
   * Route a command through the appropriate handler
   */
  public async routeCommand(
    uuid: string,
    terminalId: string,
    commandLine: string,
    workingDirectory?: string
  ): Promise<RouteResult> {
    const startTime = Date.now();
    const commandInfo = this.parser.parseCommand(commandLine);

    try {
      let result: RouteResult;

      if (commandInfo.isAgentTool && commandInfo.tool) {
        // Route to agent tool handler
        result = await this.routeToAgentTool(uuid, terminalId, commandInfo, workingDirectory);
      } else if (commandInfo.tool && commandInfo.toolInfo?.isInstalled) {
        // Route to standard tool handler
        result = await this.routeToStandardTool(uuid, terminalId, commandInfo, workingDirectory);
      } else {
        // Route to system shell
        result = await this.routeToSystemShell(uuid, terminalId, commandInfo, workingDirectory);
      }

      // Add to command history
      const duration = Date.now() - startTime;
      this.historyManager.addCommand(
        uuid,
        terminalId,
        commandInfo,
        result.output,
        result.error,
        undefined, // exitCode will be set later
        duration
      );

      // Emit routing event
      this.emit('commandRouted', {
        uuid,
        terminalId,
        commandInfo,
        result,
        duration
      });

      return result;

    } catch (error) {
      const errorResult: RouteResult = {
        success: false,
        handled: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        commandInfo
      };

      const duration = Date.now() - startTime;
      this.historyManager.addCommand(
        uuid,
        terminalId,
        commandInfo,
        undefined,
        errorResult.error,
        1,
        duration
      );

      return errorResult;
    }
  }

  private async routeToAgentTool(
    uuid: string,
    terminalId: string,
    commandInfo: CommandInfo,
    workingDirectory?: string
  ): Promise<RouteResult> {
    const config = this.agentConfigs.get(commandInfo.tool!);
    if (!config) {
      return {
        success: false,
        handled: false,
        error: `No configuration found for agent tool: ${commandInfo.tool}`,
        commandInfo
      };
    }

    // Spawn agent process with special handling
    const fullCommand = [commandInfo.command, ...commandInfo.args];
    const childProcess = spawn(config.executable, commandInfo.args, {
      cwd: workingDirectory,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLUMNS: '80',
        LINES: '24'
      }
    });

    this.activeProcesses.set(terminalId, childProcess);

    return new Promise<RouteResult>((resolve) => {
      let output = '';
      let error = '';

      // Handle streaming output for AI tools
      childProcess.stdout?.on('data', (data: any) => {
        const chunk = data.toString();
        output += chunk;
        
        // Emit real-time output for streaming
        this.emit('agentOutput', {
          uuid,
          terminalId,
          tool: commandInfo.tool,
          chunk,
          type: 'stdout'
        });
      });

      childProcess.stderr?.on('data', (data: any) => {
        const chunk = data.toString();
        error += chunk;
        
        this.emit('agentOutput', {
          uuid,
          terminalId,
          tool: commandInfo.tool,
          chunk,
          type: 'stderr'
        });
      });

      childProcess.on('close', (exitCode: any) => {
        this.activeProcesses.delete(terminalId);
        
        // Format the output for AI tools
        const formatted = this.outputFormatter.formatOutput(commandInfo, output);
        
        resolve({
          success: exitCode === 0,
          handled: true,
          output: formatted.html,
          error: error || undefined,
          commandInfo
        });
      });

      childProcess.on('error', (err: any) => {
        this.activeProcesses.delete(terminalId);
        resolve({
          success: false,
          handled: true,
          error: `Failed to execute agent tool: ${err.message}`,
          commandInfo
        });
      });

      // Set timeout for agent tools
      setTimeout(() => {
        if (this.activeProcesses.has(terminalId)) {
          childProcess.kill('SIGTERM');
          this.activeProcesses.delete(terminalId);
          resolve({
            success: false,
            handled: true,
            error: `Agent tool timeout after ${config.timeout}ms`,
            commandInfo
          });
        }
      }, config.timeout || 300000);
    });
  }

  private async routeToStandardTool(
    uuid: string,
    terminalId: string,
    commandInfo: CommandInfo,
    workingDirectory?: string
  ): Promise<RouteResult> {
    // Execute standard tool command
    const childProcess = spawn(commandInfo.command, commandInfo.args, {
      cwd: workingDirectory,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env
    });

    this.activeProcesses.set(terminalId, childProcess);

    return new Promise<RouteResult>((resolve) => {
      let output = '';
      let error = '';

      childProcess.stdout?.on('data', (data: any) => {
        output += data.toString();
      });

      childProcess.stderr?.on('data', (data: any) => {
        error += data.toString();
      });

      childProcess.on('close', (exitCode: any) => {
        this.activeProcesses.delete(terminalId);
        
        // Format the output based on tool type
        const formatted = this.outputFormatter.formatOutput(commandInfo, output);
        
        resolve({
          success: exitCode === 0,
          handled: true,
          output: formatted.html,
          error: error || undefined,
          commandInfo
        });
      });

      childProcess.on('error', (err: any) => {
        this.activeProcesses.delete(terminalId);
        resolve({
          success: false,
          handled: true,
          error: `Failed to execute tool: ${err.message}`,
          commandInfo
        });
      });
    });
  }

  private async routeToSystemShell(
    uuid: string,
    terminalId: string,
    commandInfo: CommandInfo,
    workingDirectory?: string
  ): Promise<RouteResult> {
    // Execute through system shell (fallback)
    const fullCommand = `${commandInfo.command} ${commandInfo.args.join(' ')}`;
    const childProcess = spawn('sh', ['-c', fullCommand], {
      cwd: workingDirectory,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env
    });

    this.activeProcesses.set(terminalId, childProcess);

    return new Promise<RouteResult>((resolve) => {
      let output = '';
      let error = '';

      childProcess.stdout?.on('data', (data: any) => {
        output += data.toString();
      });

      childProcess.stderr?.on('data', (data: any) => {
        error += data.toString();
      });

      childProcess.on('close', (exitCode: any) => {
        this.activeProcesses.delete(terminalId);
        
        resolve({
          success: exitCode === 0,
          handled: false, // Not specifically handled, just executed
          output,
          error: error || undefined,
          commandInfo
        });
      });

      childProcess.on('error', (err: any) => {
        this.activeProcesses.delete(terminalId);
        resolve({
          success: false,
          handled: false,
          error: `Failed to execute command: ${err.message}`,
          commandInfo
        });
      });
    });
  }

  /**
   * Kill active process for a terminal
   */
  public killProcess(terminalId: string): boolean {
    const process = this.activeProcesses.get(terminalId);
    if (process) {
      process.kill('SIGTERM');
      this.activeProcesses.delete(terminalId);
      return true;
    }
    return false;
  }

  /**
   * Get command history for a terminal
   */
  public getTerminalHistory(uuid: string, terminalId: string): CommandHistory | null {
    return this.historyManager.getTerminalHistory(uuid, terminalId);
  }

  /**
   * Get tool-specific history
   */
  public getToolHistory(uuid: string, tool: string): CommandHistory | null {
    return this.historyManager.getToolHistory(uuid, tool);
  }

  /**
   * Get all tool histories for a user
   */
  public getUserToolHistories(uuid: string): CommandHistory[] {
    return this.historyManager.getUserToolHistories(uuid);
  }

  /**
   * Get recent commands for a tool
   */
  public getRecentCommands(uuid: string, tool: string, limit?: number) {
    return this.historyManager.getRecentCommands(uuid, tool, limit);
  }

  /**
   * Get history statistics
   */
  public getHistoryStats(uuid: string) {
    return this.historyManager.getHistoryStats(uuid);
  }

  /**
   * Clear user history
   */
  public clearUserHistory(uuid: string): void {
    this.historyManager.clearUserHistory(uuid);
  }

  /**
   * Add custom agent tool configuration
   */
  public addAgentTool(name: string, config: AgentToolConfig): void {
    this.agentConfigs.set(name, config);
    this.parser.addAgentTool(name);
  }

  /**
   * Remove agent tool
   */
  public removeAgentTool(name: string): void {
    this.agentConfigs.delete(name);
    this.parser.removeAgentTool(name);
  }

  /**
   * Get active processes
   */
  public getActiveProcesses(): string[] {
    return Array.from(this.activeProcesses.keys());
  }

  /**
   * Cleanup all processes and history for a user
   */
  public cleanup(uuid: string): void {
    // Kill any active processes for this user's terminals
    // (Note: In a real implementation, you'd need to track which terminals belong to which users)
    
    // Clear history
    this.historyManager.clearUserHistory(uuid);
  }

  /**
   * Get parser instance for external use
   */
  public getParser(): CommandParser {
    return this.parser;
  }

  /**
   * Get history manager instance for external use
   */
  public getHistoryManager(): CommandHistoryManager {
    return this.historyManager;
  }

  /**
   * Get output formatter instance for external use
   */
  public getOutputFormatter(): OutputFormatter {
    return this.outputFormatter;
  }
}