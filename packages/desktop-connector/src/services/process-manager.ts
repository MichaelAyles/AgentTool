import { spawn, ChildProcess } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';

export interface ProcessInfo {
  id: string;
  command: string;
  args: string[];
  status: 'running' | 'completed' | 'failed' | 'killed';
  pid?: number;
  startTime: Date;
  endTime?: Date;
  exitCode?: number;
  output: string[];
}

export interface StartProcessOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
}

export class ProcessManager {
  private processes: Map<string, ProcessInfo> = new Map();
  private activeProcesses: Map<string, ChildProcess> = new Map();

  constructor() {
    // Cleanup on exit
    process.on('exit', () => {
      this.killAllProcesses();
    });

    process.on('SIGINT', () => {
      this.killAllProcesses();
      process.exit(0);
    });
  }

  async startProcess(options: StartProcessOptions): Promise<ProcessInfo> {
    const processId = uuidv4();

    const processInfo: ProcessInfo = {
      id: processId,
      command: options.command,
      args: options.args || [],
      status: 'running',
      startTime: new Date(),
      output: [],
    };

    this.processes.set(processId, processInfo);

    try {
      const child = spawn(options.command, options.args || [], {
        cwd: options.cwd || process.cwd(),
        env: { ...process.env, ...options.env },
        stdio: 'pipe',
      });

      processInfo.pid = child.pid;
      this.activeProcesses.set(processId, child);

      // Set timeout if specified
      let timeoutId: NodeJS.Timeout | undefined;
      if (options.timeout) {
        timeoutId = setTimeout(() => {
          this.killProcess(processId);
        }, options.timeout);
      }

      // Handle output
      child.stdout?.on('data', data => {
        const output = data.toString();
        processInfo.output.push(output);
        logger.debug(`Process ${processId} stdout:`, output);
      });

      child.stderr?.on('data', data => {
        const output = data.toString();
        processInfo.output.push(output);
        logger.debug(`Process ${processId} stderr:`, output);
      });

      // Handle process completion
      child.on('close', (code, signal) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        processInfo.endTime = new Date();
        processInfo.exitCode = code || undefined;

        if (signal) {
          processInfo.status = 'killed';
        } else if (code === 0) {
          processInfo.status = 'completed';
        } else {
          processInfo.status = 'failed';
        }

        this.activeProcesses.delete(processId);
        logger.info(`Process ${processId} finished`, {
          command: options.command,
          exitCode: code,
          signal,
          duration:
            processInfo.endTime.getTime() - processInfo.startTime.getTime(),
        });
      });

      child.on('error', error => {
        processInfo.status = 'failed';
        processInfo.endTime = new Date();
        processInfo.output.push(`Error: ${error.message}`);
        this.activeProcesses.delete(processId);
        logger.error(`Process ${processId} error:`, error);
      });

      logger.info(`Started process ${processId}`, {
        command: options.command,
        args: options.args,
        pid: child.pid,
      });

      return processInfo;
    } catch (error) {
      processInfo.status = 'failed';
      processInfo.endTime = new Date();
      processInfo.output.push(
        `Failed to start: ${error instanceof Error ? error.message : 'Unknown error'}`
      );

      logger.error(`Failed to start process ${processId}:`, error);
      throw error;
    }
  }

  getProcess(processId: string): ProcessInfo | undefined {
    return this.processes.get(processId);
  }

  getProcesses(): ProcessInfo[] {
    return Array.from(this.processes.values());
  }

  killProcess(processId: string): boolean {
    const child = this.activeProcesses.get(processId);
    const processInfo = this.processes.get(processId);

    if (child && processInfo) {
      try {
        child.kill('SIGTERM');

        // Force kill after 5 seconds if not terminated
        setTimeout(() => {
          if (this.activeProcesses.has(processId)) {
            child.kill('SIGKILL');
          }
        }, 5000);

        logger.info(`Killed process ${processId}`);
        return true;
      } catch (error) {
        logger.error(`Failed to kill process ${processId}:`, error);
        return false;
      }
    }

    return false;
  }

  killAllProcesses(): void {
    const activeIds = Array.from(this.activeProcesses.keys());

    for (const processId of activeIds) {
      this.killProcess(processId);
    }

    logger.info(`Killed ${activeIds.length} active processes`);
  }

  getActiveProcessCount(): number {
    return this.activeProcesses.size;
  }

  cleanup(): void {
    // Remove completed processes older than 1 hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    for (const [id, processInfo] of this.processes) {
      if (
        processInfo.status !== 'running' &&
        processInfo.endTime &&
        processInfo.endTime < oneHourAgo
      ) {
        this.processes.delete(id);
      }
    }
  }
}
