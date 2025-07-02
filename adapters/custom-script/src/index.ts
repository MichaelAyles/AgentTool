import { BaseAdapter, AdapterCapabilities } from '@vibecode/adapter-sdk';
import { spawn, ChildProcess } from 'child_process';
import { join, dirname, resolve, extname } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';

// Custom script configuration
export interface ScriptConfig {
  interpreter: string;
  interpreterArgs?: string[];
  fileExtension: string;
  environmentVariables?: Record<string, string>;
  workingDirectory?: string;
  timeout?: number;
  allowFileWrite?: boolean;
  maxOutputSize?: number;
  sanitizeOutput?: boolean;
}

// Predefined script configurations
export const SCRIPT_CONFIGS: Record<string, ScriptConfig> = {
  // Shell scripts
  bash: {
    interpreter: 'bash',
    interpreterArgs: ['-c'],
    fileExtension: '.sh',
    environmentVariables: { SHELL: '/bin/bash' },
    timeout: 30000,
    allowFileWrite: true,
    maxOutputSize: 1024 * 1024, // 1MB
    sanitizeOutput: true,
  },
  zsh: {
    interpreter: 'zsh',
    interpreterArgs: ['-c'],
    fileExtension: '.zsh',
    environmentVariables: { SHELL: '/bin/zsh' },
    timeout: 30000,
    allowFileWrite: true,
    maxOutputSize: 1024 * 1024,
    sanitizeOutput: true,
  },
  sh: {
    interpreter: 'sh',
    interpreterArgs: ['-c'],
    fileExtension: '.sh',
    timeout: 30000,
    allowFileWrite: true,
    maxOutputSize: 1024 * 1024,
    sanitizeOutput: true,
  },

  // Programming languages
  python: {
    interpreter: 'python3',
    interpreterArgs: ['-u'], // Unbuffered output
    fileExtension: '.py',
    environmentVariables: { PYTHONUNBUFFERED: '1' },
    timeout: 60000,
    allowFileWrite: true,
    maxOutputSize: 2 * 1024 * 1024, // 2MB
    sanitizeOutput: true,
  },
  python2: {
    interpreter: 'python2',
    interpreterArgs: ['-u'],
    fileExtension: '.py',
    environmentVariables: { PYTHONUNBUFFERED: '1' },
    timeout: 60000,
    allowFileWrite: true,
    maxOutputSize: 2 * 1024 * 1024,
    sanitizeOutput: true,
  },
  node: {
    interpreter: 'node',
    interpreterArgs: [],
    fileExtension: '.js',
    environmentVariables: { NODE_ENV: 'development' },
    timeout: 60000,
    allowFileWrite: true,
    maxOutputSize: 2 * 1024 * 1024,
    sanitizeOutput: true,
  },
  deno: {
    interpreter: 'deno',
    interpreterArgs: ['run', '--allow-all'],
    fileExtension: '.ts',
    timeout: 60000,
    allowFileWrite: true,
    maxOutputSize: 2 * 1024 * 1024,
    sanitizeOutput: true,
  },
  bun: {
    interpreter: 'bun',
    interpreterArgs: ['run'],
    fileExtension: '.ts',
    timeout: 60000,
    allowFileWrite: true,
    maxOutputSize: 2 * 1024 * 1024,
    sanitizeOutput: true,
  },
  ruby: {
    interpreter: 'ruby',
    interpreterArgs: [],
    fileExtension: '.rb',
    timeout: 60000,
    allowFileWrite: true,
    maxOutputSize: 2 * 1024 * 1024,
    sanitizeOutput: true,
  },
  php: {
    interpreter: 'php',
    interpreterArgs: [],
    fileExtension: '.php',
    timeout: 60000,
    allowFileWrite: true,
    maxOutputSize: 2 * 1024 * 1024,
    sanitizeOutput: true,
  },
  go: {
    interpreter: 'go',
    interpreterArgs: ['run'],
    fileExtension: '.go',
    timeout: 120000, // Go compilation can take time
    allowFileWrite: true,
    maxOutputSize: 2 * 1024 * 1024,
    sanitizeOutput: true,
  },
  rust: {
    interpreter: 'rustc',
    interpreterArgs: ['--edition', '2021', '-o'],
    fileExtension: '.rs',
    timeout: 120000, // Rust compilation can take time
    allowFileWrite: true,
    maxOutputSize: 2 * 1024 * 1024,
    sanitizeOutput: true,
  },

  // Data processing
  jq: {
    interpreter: 'jq',
    interpreterArgs: ['-r'],
    fileExtension: '.jq',
    timeout: 30000,
    allowFileWrite: false,
    maxOutputSize: 1024 * 1024,
    sanitizeOutput: true,
  },
  awk: {
    interpreter: 'awk',
    interpreterArgs: ['-f'],
    fileExtension: '.awk',
    timeout: 30000,
    allowFileWrite: false,
    maxOutputSize: 1024 * 1024,
    sanitizeOutput: true,
  },
  sed: {
    interpreter: 'sed',
    interpreterArgs: ['-f'],
    fileExtension: '.sed',
    timeout: 30000,
    allowFileWrite: false,
    maxOutputSize: 1024 * 1024,
    sanitizeOutput: true,
  },

  // Custom interpreters
  custom: {
    interpreter: '', // Must be specified
    interpreterArgs: [],
    fileExtension: '.txt',
    timeout: 60000,
    allowFileWrite: true,
    maxOutputSize: 2 * 1024 * 1024,
    sanitizeOutput: true,
  },
};

// Execution options
export interface ExecutionOptions {
  workingDirectory?: string;
  environment?: Record<string, string>;
  timeout?: number;
  stdin?: string;
  scriptType?: string;
  customConfig?: Partial<ScriptConfig>;
  saveScript?: boolean;
  scriptName?: string;
  args?: string[];
}

// Execution result
export interface ExecutionResult {
  success: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  executionTime: number;
  scriptPath?: string;
  error?: string;
  killed?: boolean;
  timedOut?: boolean;
}

export class CustomScriptAdapter extends BaseAdapter {
  public readonly name = 'custom-script';
  public readonly version = '1.0.0';
  public readonly description =
    'Flexible adapter for executing custom scripts and commands';
  public readonly capabilities: AdapterCapabilities = {
    execute: true,
    stream: true,
    interactive: false,
    fileAccess: true,
    networkAccess: true,
  };

  private processes: Map<string, ChildProcess> = new Map();
  private tempDir: string;

  constructor() {
    super();
    this.tempDir = join(process.cwd(), '.tmp', 'custom-script');
    this.ensureTempDir();
  }

  /**
   * Execute a script or command
   */
  async execute(
    command: string,
    options: ExecutionOptions = {}
  ): Promise<string> {
    const sessionId = uuidv4();
    const result = await this.executeScript(command, { ...options, sessionId });

    if (!result.success) {
      throw new Error(
        result.error ||
          `Script execution failed with exit code ${result.exitCode}`
      );
    }

    return result.stdout;
  }

  /**
   * Execute script with detailed result
   */
  async executeScript(
    script: string,
    options: ExecutionOptions & { sessionId?: string } = {}
  ): Promise<ExecutionResult> {
    const sessionId = options.sessionId || uuidv4();
    const startTime = Date.now();

    try {
      // Determine script configuration
      const scriptType = options.scriptType || 'bash';
      const baseConfig = SCRIPT_CONFIGS[scriptType] || SCRIPT_CONFIGS.bash;
      const config: ScriptConfig = { ...baseConfig, ...options.customConfig };

      // Validate interpreter
      if (!config.interpreter) {
        throw new Error(
          `No interpreter specified for script type: ${scriptType}`
        );
      }

      // Prepare script execution
      const { scriptPath, shouldCleanup } = await this.prepareScript(
        script,
        config,
        options
      );

      // Set up execution environment
      const workingDir =
        options.workingDirectory || config.workingDirectory || process.cwd();
      const environment = {
        ...process.env,
        ...config.environmentVariables,
        ...options.environment,
      };

      // Execute script
      const result = await this.runScript(
        config,
        scriptPath,
        {
          workingDirectory: workingDir,
          environment,
          timeout: options.timeout || config.timeout || 60000,
          stdin: options.stdin,
          args: options.args || [],
        },
        sessionId
      );

      // Cleanup temporary files if needed
      if (shouldCleanup && !options.saveScript) {
        try {
          if (existsSync(scriptPath)) {
            require('fs').unlinkSync(scriptPath);
          }
        } catch (error) {
          // Ignore cleanup errors
        }
      }

      return {
        ...result,
        executionTime: Date.now() - startTime,
        scriptPath: options.saveScript ? scriptPath : undefined,
      };
    } catch (error) {
      return {
        success: false,
        exitCode: null,
        stdout: '',
        stderr: '',
        executionTime: Date.now() - startTime,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Stream output from script execution
   */
  async *streamOutput(handle: string): AsyncGenerator<string, void, unknown> {
    const process = this.processes.get(handle);
    if (!process) {
      throw new Error(`No process found for handle: ${handle}`);
    }

    // Stream stdout
    if (process.stdout) {
      for await (const chunk of process.stdout) {
        yield chunk.toString();
      }
    }

    // Stream stderr
    if (process.stderr) {
      for await (const chunk of process.stderr) {
        yield chunk.toString();
      }
    }
  }

  /**
   * Get available script types
   */
  getAvailableScriptTypes(): Array<{
    type: string;
    interpreter: string;
    extension: string;
    description: string;
  }> {
    return Object.entries(SCRIPT_CONFIGS).map(([type, config]) => ({
      type,
      interpreter: config.interpreter,
      extension: config.fileExtension,
      description: this.getScriptTypeDescription(type),
    }));
  }

  /**
   * Check if an interpreter is available
   */
  async checkInterpreter(interpreter: string): Promise<boolean> {
    return new Promise(resolve => {
      const process = spawn('which', [interpreter], { stdio: 'ignore' });
      process.on('close', code => {
        resolve(code === 0);
      });
      process.on('error', () => {
        resolve(false);
      });
    });
  }

  /**
   * Get interpreter version
   */
  async getInterpreterVersion(interpreter: string): Promise<string | null> {
    try {
      const versionArgs = this.getVersionArgs(interpreter);
      const result = await this.executeSimpleCommand(
        interpreter,
        versionArgs,
        5000
      );
      return result.stdout.trim().split('\n')[0];
    } catch (error) {
      return null;
    }
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    // Kill all running processes
    for (const [sessionId, process] of this.processes) {
      try {
        if (!process.killed) {
          process.kill('SIGTERM');
          // Force kill after 5 seconds
          setTimeout(() => {
            if (!process.killed) {
              process.kill('SIGKILL');
            }
          }, 5000);
        }
      } catch (error) {
        // Ignore errors during cleanup
      }
    }
    this.processes.clear();
  }

  // Private methods

  private ensureTempDir(): void {
    if (!existsSync(this.tempDir)) {
      mkdirSync(this.tempDir, { recursive: true });
    }
  }

  private async prepareScript(
    script: string,
    config: ScriptConfig,
    options: ExecutionOptions
  ): Promise<{ scriptPath: string; shouldCleanup: boolean }> {
    // If it's a direct command (not a script file), write to temp file
    if (
      !script.includes('\n') &&
      !script.includes(';') &&
      options.scriptType !== 'custom'
    ) {
      // Treat as direct command
      return { scriptPath: script, shouldCleanup: false };
    }

    // Generate script file path
    const scriptName =
      options.scriptName ||
      `script_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const scriptPath = join(this.tempDir, scriptName + config.fileExtension);

    // Ensure directory exists
    const scriptDir = dirname(scriptPath);
    if (!existsSync(scriptDir)) {
      mkdirSync(scriptDir, { recursive: true });
    }

    // Write script to file
    let scriptContent = script;

    // Add shebang for shell scripts
    if (config.fileExtension === '.sh' && !script.startsWith('#!')) {
      scriptContent = `#!/bin/bash\n${script}`;
    } else if (config.fileExtension === '.zsh' && !script.startsWith('#!')) {
      scriptContent = `#!/bin/zsh\n${script}`;
    }

    writeFileSync(scriptPath, scriptContent, 'utf8');

    // Make script executable for shell scripts
    if (['.sh', '.zsh'].includes(config.fileExtension)) {
      try {
        require('fs').chmodSync(scriptPath, 0o755);
      } catch (error) {
        // Ignore chmod errors
      }
    }

    return { scriptPath, shouldCleanup: true };
  }

  private async runScript(
    config: ScriptConfig,
    scriptPath: string,
    execOptions: {
      workingDirectory: string;
      environment: Record<string, string>;
      timeout: number;
      stdin?: string;
      args: string[];
    },
    sessionId: string
  ): Promise<Omit<ExecutionResult, 'executionTime'>> {
    return new Promise(resolve => {
      let stdout = '';
      let stderr = '';
      let killed = false;
      let timedOut = false;

      // Prepare command arguments
      let args: string[];
      if (scriptPath === script && config.interpreterArgs.includes('-c')) {
        // Direct command execution
        args = [...config.interpreterArgs, scriptPath];
      } else if (config.interpreter === 'rustc') {
        // Special handling for Rust
        const outputPath = scriptPath.replace('.rs', '');
        args = [...config.interpreterArgs, outputPath, scriptPath];
      } else {
        // File-based execution
        args = [...config.interpreterArgs, scriptPath, ...execOptions.args];
      }

      // Spawn process
      const childProcess = spawn(config.interpreter, args, {
        cwd: execOptions.workingDirectory,
        env: execOptions.environment,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Store process for potential cleanup
      this.processes.set(sessionId, childProcess);

      // Set up timeout
      const timeout = setTimeout(() => {
        timedOut = true;
        killed = true;
        childProcess.kill('SIGTERM');

        // Force kill after 5 seconds
        setTimeout(() => {
          if (!childProcess.killed) {
            childProcess.kill('SIGKILL');
          }
        }, 5000);
      }, execOptions.timeout);

      // Handle stdout
      if (childProcess.stdout) {
        childProcess.stdout.on('data', data => {
          const chunk = data.toString();
          stdout += chunk;

          // Check output size limit
          if (config.maxOutputSize && stdout.length > config.maxOutputSize) {
            killed = true;
            childProcess.kill('SIGTERM');
          }
        });
      }

      // Handle stderr
      if (childProcess.stderr) {
        childProcess.stderr.on('data', data => {
          const chunk = data.toString();
          stderr += chunk;

          // Check output size limit
          if (config.maxOutputSize && stderr.length > config.maxOutputSize) {
            killed = true;
            childProcess.kill('SIGTERM');
          }
        });
      }

      // Handle process completion
      childProcess.on('close', exitCode => {
        clearTimeout(timeout);
        this.processes.delete(sessionId);

        // Sanitize output if requested
        if (config.sanitizeOutput) {
          stdout = this.sanitizeOutput(stdout);
          stderr = this.sanitizeOutput(stderr);
        }

        resolve({
          success: exitCode === 0 && !killed,
          exitCode,
          stdout,
          stderr,
          killed,
          timedOut,
        });
      });

      // Handle process errors
      childProcess.on('error', error => {
        clearTimeout(timeout);
        this.processes.delete(sessionId);

        resolve({
          success: false,
          exitCode: null,
          stdout,
          stderr,
          error: error.message,
          killed,
          timedOut,
        });
      });

      // Send stdin if provided
      if (execOptions.stdin && childProcess.stdin) {
        childProcess.stdin.write(execOptions.stdin);
        childProcess.stdin.end();
      }
    });
  }

  private async executeSimpleCommand(
    command: string,
    args: string[],
    timeout: number
  ): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
    return new Promise(resolve => {
      let stdout = '';
      let stderr = '';

      const process = spawn(command, args, { stdio: 'pipe' });

      const timeoutHandle = setTimeout(() => {
        process.kill('SIGTERM');
      }, timeout);

      if (process.stdout) {
        process.stdout.on('data', data => {
          stdout += data.toString();
        });
      }

      if (process.stderr) {
        process.stderr.on('data', data => {
          stderr += data.toString();
        });
      }

      process.on('close', exitCode => {
        clearTimeout(timeoutHandle);
        resolve({ stdout, stderr, exitCode });
      });

      process.on('error', error => {
        clearTimeout(timeoutHandle);
        resolve({ stdout, stderr: error.message, exitCode: null });
      });
    });
  }

  private sanitizeOutput(output: string): string {
    // Remove ANSI escape codes
    return output.replace(/\x1b\[[0-9;]*m/g, '');
  }

  private getVersionArgs(interpreter: string): string[] {
    const versionArgs: Record<string, string[]> = {
      python: ['--version'],
      python3: ['--version'],
      python2: ['--version'],
      node: ['--version'],
      deno: ['--version'],
      bun: ['--version'],
      ruby: ['--version'],
      php: ['--version'],
      go: ['version'],
      rustc: ['--version'],
      bash: ['--version'],
      zsh: ['--version'],
      sh: ['--version'],
      jq: ['--version'],
      awk: ['--version'],
      sed: ['--version'],
    };

    return versionArgs[interpreter] || ['--version'];
  }

  private getScriptTypeDescription(type: string): string {
    const descriptions: Record<string, string> = {
      bash: 'Bash shell scripts',
      zsh: 'Z shell scripts',
      sh: 'POSIX shell scripts',
      python: 'Python 3 scripts',
      python2: 'Python 2 scripts',
      node: 'Node.js JavaScript',
      deno: 'Deno TypeScript/JavaScript',
      bun: 'Bun TypeScript/JavaScript',
      ruby: 'Ruby scripts',
      php: 'PHP scripts',
      go: 'Go programs',
      rust: 'Rust programs',
      jq: 'JSON query processor',
      awk: 'AWK text processing',
      sed: 'Stream editor',
      custom: 'Custom interpreter',
    };

    return descriptions[type] || 'Custom script type';
  }
}

export default CustomScriptAdapter;
