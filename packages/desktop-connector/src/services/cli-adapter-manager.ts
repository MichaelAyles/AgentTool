import path from 'path';
import { spawn } from 'child_process';
import { logger } from '../utils/logger.js';

export interface CLIAdapter {
  id: string;
  name: string;
  version: string;
  status: 'available' | 'installed' | 'error';
  executable: string;
  description: string;
}

export class CLIAdapterManager {
  private dataDir: string;
  private adapters: Map<string, CLIAdapter> = new Map();

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.initializeAdapters();
  }

  private initializeAdapters() {
    // Claude Code adapter
    this.adapters.set('claude-code', {
      id: 'claude-code',
      name: 'Claude Code',
      version: '1.0.0',
      status: 'available',
      executable: 'claude-code',
      description: 'Anthropic Claude Code CLI assistant',
    });

    // Gemini CLI adapter
    this.adapters.set('gemini-cli', {
      id: 'gemini-cli',
      name: 'Gemini CLI',
      version: '1.0.0',
      status: 'available',
      executable: 'gemini-cli',
      description: 'Google Gemini CLI assistant',
    });

    // Check which adapters are actually installed
    this.checkInstalledAdapters();
  }

  private async checkInstalledAdapters() {
    for (const [id, adapter] of this.adapters) {
      try {
        const result = await this.checkExecutable(adapter.executable);
        adapter.status = result ? 'installed' : 'available';
      } catch (error) {
        adapter.status = 'error';
        logger.warn(`Error checking adapter ${id}:`, error);
      }
    }
  }

  private checkExecutable(executable: string): Promise<boolean> {
    return new Promise(resolve => {
      const child = spawn(executable, ['--version'], { stdio: 'pipe' });
      child.on('close', code => {
        resolve(code === 0);
      });
      child.on('error', () => {
        resolve(false);
      });
    });
  }

  async getAvailableAdapters(): Promise<CLIAdapter[]> {
    await this.checkInstalledAdapters();
    return Array.from(this.adapters.values());
  }

  async installAdapter(adapterId: string): Promise<void> {
    const adapter = this.adapters.get(adapterId);
    if (!adapter) {
      throw new Error(`Unknown adapter: ${adapterId}`);
    }

    logger.info(`Installing adapter: ${adapterId}`);

    switch (adapterId) {
      case 'claude-code':
        await this.installClaudeCode();
        break;
      case 'gemini-cli':
        await this.installGeminiCLI();
        break;
      default:
        throw new Error(`Installation not supported for adapter: ${adapterId}`);
    }

    adapter.status = 'installed';
    logger.info(`Successfully installed adapter: ${adapterId}`);
  }

  private async installClaudeCode(): Promise<void> {
    // Check if already available globally
    if (await this.checkExecutable('claude-code')) {
      return;
    }

    // Install using npm or provide installation instructions
    throw new Error(
      'Claude Code installation not yet implemented. Please install manually.'
    );
  }

  private async installGeminiCLI(): Promise<void> {
    // Check if already available globally
    if (await this.checkExecutable('gemini-cli')) {
      return;
    }

    // Install using appropriate method
    throw new Error(
      'Gemini CLI installation not yet implemented. Please install manually.'
    );
  }

  async executeCommand(
    adapterId: string,
    command: string,
    args: string[] = []
  ): Promise<any> {
    const adapter = this.adapters.get(adapterId);
    if (!adapter) {
      throw new Error(`Unknown adapter: ${adapterId}`);
    }

    if (adapter.status !== 'installed') {
      throw new Error(`Adapter ${adapterId} is not installed`);
    }

    return new Promise((resolve, reject) => {
      const child = spawn(adapter.executable, [command, ...args], {
        stdio: 'pipe',
        cwd: this.dataDir,
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', data => {
        stdout += data.toString();
      });

      child.stderr.on('data', data => {
        stderr += data.toString();
      });

      child.on('close', code => {
        if (code === 0) {
          resolve({ stdout, stderr, code });
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr}`));
        }
      });

      child.on('error', error => {
        reject(error);
      });
    });
  }
}
