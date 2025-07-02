import { BaseAdapter } from '@vibecode/adapter-sdk';
import type {
  ExecuteOptions,
  CLICapabilities,
  JSONSchema,
} from '@vibecode/adapter-sdk';
import type { ProcessHandle } from '@vibecode/shared';
import { generateId } from '@vibecode/shared';

export class ClaudeCodeAdapter extends BaseAdapter {
  name = 'claude-code';
  version = '1.0.0';
  description = 'Claude Code CLI adapter for AI-assisted coding';

  capabilities: CLICapabilities = {
    supportsStreaming: true,
    supportsMCP: true,
    supportsSubagents: true,
    supportsInteractiveMode: true,
    customCommands: [
      '--extended-thinking',
      '--memory',
      '--resume',
      '--dangerous',
      '--model',
      '--temperature',
    ],
  };

  protected async verifyInstallation(): Promise<void> {
    try {
      const { spawn } = await import('child_process');
      const process = spawn('claude-code', ['--version'], { stdio: 'pipe' });

      await new Promise<void>((resolve, reject) => {
        process.on('close', code => {
          if (code === 0) {
            resolve();
          } else {
            reject(
              new Error(
                'Claude Code not found. Please install claude-code CLI.'
              )
            );
          }
        });

        process.on('error', () => {
          reject(
            new Error('Claude Code not found. Please install claude-code CLI.')
          );
        });
      });
    } catch (error) {
      throw new Error(
        'Claude Code CLI is not installed or not available in PATH'
      );
    }
  }

  async execute(
    command: string,
    options: ExecuteOptions
  ): Promise<ProcessHandle> {
    // Parse the command to extract Claude Code specific arguments
    const args = this.parseClaudeCommand(command);

    // Add working directory context
    if (options.workingDirectory) {
      args.unshift('--cwd', options.workingDirectory);
    }

    // Add dangerous mode if enabled
    if (options.securityContext?.dangerousMode) {
      args.unshift('--dangerous');
    }

    return await this.spawnProcess('claude-code', args, options);
  }

  private parseClaudeCommand(command: string): string[] {
    // Handle different Claude Code command formats
    const trimmed = command.trim();

    // If it starts with claude-code, remove it
    if (trimmed.startsWith('claude-code ')) {
      return this.parseCommand(trimmed.substring(11));
    }

    // If it's a direct message, wrap it appropriately
    if (!trimmed.includes('--')) {
      return [trimmed];
    }

    return this.parseCommand(trimmed);
  }

  async createProject(path: string, template?: string): Promise<void> {
    const args = ['--init', path];
    if (template) {
      args.push('--template', template);
    }

    const handle = await this.spawnProcess('claude-code', args, {
      workingDirectory: process.cwd(),
    });

    // Wait for project creation to complete
    const process = this.processes.get(handle.id);
    if (process) {
      await new Promise<void>((resolve, reject) => {
        process.on('close', code => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Project creation failed with code ${code}`));
          }
        });
      });
    }
  }

  getConfigSchema(): JSONSchema {
    return {
      type: 'object',
      properties: {
        name: { type: 'string' },
        enabled: { type: 'boolean' },
        settings: {
          type: 'object',
          properties: {
            model: {
              type: 'string',
              enum: ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'],
              default: 'claude-3-sonnet',
            },
            temperature: {
              type: 'number',
              minimum: 0,
              maximum: 1,
              default: 0.7,
            },
            extendedThinking: {
              type: 'boolean',
              default: false,
            },
            memoryEnabled: {
              type: 'boolean',
              default: true,
            },
            dangerousMode: {
              type: 'boolean',
              default: false,
            },
          },
        },
        security: {
          type: 'object',
          properties: {
            allowedPaths: {
              type: 'array',
              items: { type: 'string' },
              default: [],
            },
            blockedCommands: {
              type: 'array',
              items: { type: 'string' },
              default: ['rm -rf', 'sudo', 'chmod 777'],
            },
            timeout: {
              type: 'number',
              default: 300000, // 5 minutes
            },
            maxMemory: {
              type: 'number',
              default: 1024 * 1024 * 1024, // 1GB
            },
          },
        },
      },
      required: ['name', 'enabled'],
    };
  }
}

export default ClaudeCodeAdapter;
