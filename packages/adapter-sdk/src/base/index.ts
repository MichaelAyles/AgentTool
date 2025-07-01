import { spawn, ChildProcess } from 'child_process';
import type { CLIAdapter, ExecuteOptions, AdapterConfig, JSONSchema } from '../types/index.js';
import type { ProcessHandle, OutputChunk } from '@vibecode/shared';
import { generateId } from '@vibecode/shared';

export abstract class BaseAdapter implements Partial<CLIAdapter> {
  abstract name: string;
  abstract version: string;
  
  protected config?: AdapterConfig;
  protected processes = new Map<string, ChildProcess>();

  async initialize(config: AdapterConfig): Promise<void> {
    this.config = config;
    await this.verifyInstallation();
  }

  async dispose(): Promise<void> {
    for (const [id, process] of this.processes) {
      process.kill('SIGTERM');
      this.processes.delete(id);
    }
  }

  protected async verifyInstallation(): Promise<void> {
    // Override in subclasses
  }

  protected parseCommand(command: string): string[] {
    return command.split(' ').filter(Boolean);
  }

  protected buildEnvironment(options: ExecuteOptions): NodeJS.ProcessEnv {
    return {
      ...process.env,
      ...options.environment,
    };
  }

  protected async spawnProcess(
    command: string,
    args: string[],
    options: ExecuteOptions
  ): Promise<ProcessHandle> {
    const process = spawn(command, args, {
      cwd: options.workingDirectory,
      env: this.buildEnvironment(options),
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const handle: ProcessHandle = {
      id: generateId(),
      pid: process.pid!,
      adapter: this.name,
      startTime: new Date(),
    };

    this.processes.set(handle.id, process);

    return handle;
  }

  async *streamOutput(handle: ProcessHandle): AsyncIterable<OutputChunk> {
    const process = this.processes.get(handle.id);
    if (!process) throw new Error('Process not found');

    for await (const chunk of process.stdout!) {
      yield {
        type: 'stdout',
        data: chunk.toString(),
        timestamp: new Date(),
      };
    }
  }

  async interrupt(handle: ProcessHandle): Promise<void> {
    const process = this.processes.get(handle.id);
    if (process) {
      process.kill('SIGTERM');
      this.processes.delete(handle.id);
    }
  }

  getConfigSchema(): JSONSchema {
    return {
      type: 'object',
      properties: {
        name: { type: 'string' },
        enabled: { type: 'boolean' },
        settings: { type: 'object' },
      },
      required: ['name', 'enabled'],
    };
  }

  validateConfig(config: unknown): config is AdapterConfig {
    return typeof config === 'object' && config !== null;
  }
}