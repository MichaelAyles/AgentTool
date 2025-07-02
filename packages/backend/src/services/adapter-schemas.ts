import { AdapterConfigSchema } from './adapter-config-manager.js';

/**
 * Default schemas for built-in adapters
 */

export const CLAUDE_CODE_SCHEMA: AdapterConfigSchema = {
  name: 'Claude Code Configuration',
  version: '1.0.0',
  description: 'Configuration schema for Claude Code adapter',
  properties: {
    executable: {
      type: 'string',
      description: 'Path to claude-code executable',
      default: 'claude-code',
      required: true,
      format: 'path',
      group: 'execution',
    },
    workingDirectory: {
      type: 'directory',
      description: 'Default working directory for claude-code sessions',
      default: process.cwd(),
      group: 'execution',
    },
    timeout: {
      type: 'number',
      description: 'Default timeout for commands (milliseconds)',
      default: 300000,
      min: 1000,
      max: 3600000,
      group: 'execution',
    },
    maxConcurrentSessions: {
      type: 'number',
      description: 'Maximum number of concurrent claude-code sessions',
      default: 5,
      min: 1,
      max: 20,
      group: 'limits',
    },
    memoryLimit: {
      type: 'number',
      description: 'Memory limit per session (MB)',
      default: 512,
      min: 128,
      max: 4096,
      group: 'limits',
    },
    enableProjectMode: {
      type: 'boolean',
      description: 'Enable project mode for better context awareness',
      default: true,
      group: 'features',
    },
    enableContinuousMode: {
      type: 'boolean',
      description: 'Enable continuous mode for long-running sessions',
      default: false,
      group: 'features',
    },
    apiKey: {
      type: 'string',
      description: 'Anthropic API key (if different from environment)',
      sensitive: true,
      group: 'authentication',
      condition: 'customApiKey === true',
    },
    customApiKey: {
      type: 'boolean',
      description: 'Use custom API key instead of environment variable',
      default: false,
      group: 'authentication',
    },
    model: {
      type: 'select',
      description: 'Claude model to use',
      default: 'claude-3-5-sonnet-20241022',
      options: [
        'claude-3-5-sonnet-20241022',
        'claude-3-5-haiku-20241022',
        'claude-3-opus-20240229',
        'claude-3-sonnet-20240229',
        'claude-3-haiku-20240307',
      ],
      group: 'model',
    },
    temperature: {
      type: 'number',
      description: 'Model temperature (0.0 to 1.0)',
      default: 0.1,
      min: 0.0,
      max: 1.0,
      group: 'model',
    },
    maxTokens: {
      type: 'number',
      description: 'Maximum tokens per response',
      default: 4096,
      min: 1,
      max: 8192,
      group: 'model',
    },
    systemPrompt: {
      type: 'string',
      description: 'Custom system prompt (optional)',
      group: 'model',
    },
    enableTools: {
      type: 'boolean',
      description: 'Enable tool usage (file operations, etc.)',
      default: true,
      group: 'features',
    },
    allowedTools: {
      type: 'array',
      description: 'List of allowed tools',
      condition: 'enableTools === true',
      group: 'features',
    },
    outputFormat: {
      type: 'select',
      description: 'Output format preference',
      default: 'markdown',
      options: ['markdown', 'plain', 'json'],
      group: 'output',
    },
    verboseLogging: {
      type: 'boolean',
      description: 'Enable verbose logging for debugging',
      default: false,
      group: 'debugging',
    },
    logLevel: {
      type: 'select',
      description: 'Log level',
      default: 'info',
      options: ['error', 'warn', 'info', 'debug', 'trace'],
      condition: 'verboseLogging === true',
      group: 'debugging',
    },
  },
  required: ['executable', 'model'],
  dependencies: {
    customApiKey: {
      condition: 'customApiKey === true',
      properties: ['apiKey'],
      message: 'API key is required when using custom API key',
    },
    enableTools: {
      condition: 'enableTools === true',
      properties: ['allowedTools'],
      message: 'Allowed tools must be specified when tools are enabled',
    },
  },
  validation: {
    rules: [
      {
        condition: 'timeout < 10000',
        message: 'Timeout should be at least 10 seconds for reliable operation',
        severity: 'warning',
      },
      {
        condition: 'maxConcurrentSessions > 10',
        message: 'High concurrent session limits may impact performance',
        severity: 'warning',
      },
      {
        condition: 'memoryLimit < 256',
        message: 'Memory limit below 256MB may cause issues',
        severity: 'warning',
      },
    ],
  },
  metadata: {
    category: 'ai-assistant',
    tags: ['claude', 'anthropic', 'code-generation'],
    documentation: 'https://docs.anthropic.com/claude/docs',
  },
};

export const GEMINI_CLI_SCHEMA: AdapterConfigSchema = {
  name: 'Gemini CLI Configuration',
  version: '1.0.0',
  description: 'Configuration schema for Gemini CLI adapter',
  properties: {
    executable: {
      type: 'string',
      description: 'Path to gemini-cli executable',
      default: 'gemini-cli',
      required: true,
      format: 'path',
      group: 'execution',
    },
    workingDirectory: {
      type: 'directory',
      description: 'Default working directory for gemini-cli sessions',
      default: process.cwd(),
      group: 'execution',
    },
    timeout: {
      type: 'number',
      description: 'Default timeout for commands (milliseconds)',
      default: 300000,
      min: 1000,
      max: 3600000,
      group: 'execution',
    },
    maxConcurrentSessions: {
      type: 'number',
      description: 'Maximum number of concurrent gemini-cli sessions',
      default: 3,
      min: 1,
      max: 10,
      group: 'limits',
    },
    apiKey: {
      type: 'string',
      description: 'Google AI Studio API key',
      required: true,
      sensitive: true,
      group: 'authentication',
    },
    model: {
      type: 'select',
      description: 'Gemini model to use',
      default: 'gemini-1.5-pro',
      options: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.0-pro'],
      group: 'model',
    },
    temperature: {
      type: 'number',
      description: 'Model temperature (0.0 to 2.0)',
      default: 0.1,
      min: 0.0,
      max: 2.0,
      group: 'model',
    },
    maxOutputTokens: {
      type: 'number',
      description: 'Maximum tokens per response',
      default: 2048,
      min: 1,
      max: 8192,
      group: 'model',
    },
    topP: {
      type: 'number',
      description: 'Top-p sampling parameter',
      default: 0.95,
      min: 0.0,
      max: 1.0,
      group: 'model',
    },
    topK: {
      type: 'number',
      description: 'Top-k sampling parameter',
      default: 40,
      min: 1,
      max: 100,
      group: 'model',
    },
    enableSafetySettings: {
      type: 'boolean',
      description: "Enable Google's safety filters",
      default: true,
      group: 'safety',
    },
    harmCategory: {
      type: 'select',
      description: 'Harm category threshold',
      default: 'BLOCK_MEDIUM_AND_ABOVE',
      options: [
        'BLOCK_NONE',
        'BLOCK_ONLY_HIGH',
        'BLOCK_MEDIUM_AND_ABOVE',
        'BLOCK_LOW_AND_ABOVE',
      ],
      condition: 'enableSafetySettings === true',
      group: 'safety',
    },
    outputFormat: {
      type: 'select',
      description: 'Output format preference',
      default: 'markdown',
      options: ['markdown', 'plain', 'json'],
      group: 'output',
    },
  },
  required: ['executable', 'apiKey', 'model'],
  validation: {
    rules: [
      {
        condition: 'temperature > 1.5',
        message: 'High temperature values may produce unpredictable results',
        severity: 'warning',
      },
      {
        condition: 'maxConcurrentSessions > 5',
        message:
          'Gemini API has rate limits, consider reducing concurrent sessions',
        severity: 'warning',
      },
    ],
  },
  metadata: {
    category: 'ai-assistant',
    tags: ['gemini', 'google', 'code-generation'],
    documentation: 'https://ai.google.dev/docs',
  },
};

export const CUSTOM_SCRIPT_SCHEMA: AdapterConfigSchema = {
  name: 'Custom Script Configuration',
  version: '1.0.0',
  description: 'Configuration schema for Custom Script adapter',
  properties: {
    defaultInterpreter: {
      type: 'select',
      description: 'Default script interpreter',
      default: 'bash',
      options: [
        'bash',
        'zsh',
        'sh',
        'python',
        'node',
        'deno',
        'bun',
        'ruby',
        'php',
        'go',
        'rust',
        'jq',
        'awk',
        'sed',
        'custom',
      ],
      group: 'execution',
    },
    workingDirectory: {
      type: 'directory',
      description: 'Default working directory for script execution',
      default: process.cwd(),
      group: 'execution',
    },
    timeout: {
      type: 'number',
      description: 'Default timeout for script execution (milliseconds)',
      default: 60000,
      min: 1000,
      max: 600000,
      group: 'execution',
    },
    maxOutputSize: {
      type: 'number',
      description: 'Maximum output size (bytes)',
      default: 1048576, // 1MB
      min: 1024,
      max: 10485760, // 10MB
      group: 'limits',
    },
    maxConcurrentExecutions: {
      type: 'number',
      description: 'Maximum number of concurrent script executions',
      default: 5,
      min: 1,
      max: 20,
      group: 'limits',
    },
    allowFileWrite: {
      type: 'boolean',
      description: 'Allow scripts to write files',
      default: true,
      group: 'security',
    },
    allowNetworkAccess: {
      type: 'boolean',
      description: 'Allow scripts to access network',
      default: true,
      group: 'security',
    },
    sanitizeOutput: {
      type: 'boolean',
      description: 'Remove ANSI escape codes from output',
      default: true,
      group: 'output',
    },
    preserveEnvironment: {
      type: 'boolean',
      description: 'Preserve current environment variables',
      default: true,
      group: 'environment',
    },
    customEnvironment: {
      type: 'object',
      description: 'Custom environment variables',
      group: 'environment',
    },
    scriptStorageEnabled: {
      type: 'boolean',
      description: 'Enable script storage and sharing',
      default: true,
      group: 'features',
    },
    publicScriptSharing: {
      type: 'boolean',
      description: 'Allow public script sharing',
      default: false,
      condition: 'scriptStorageEnabled === true',
      group: 'features',
    },
    interpreterPaths: {
      type: 'object',
      description: 'Custom paths to interpreters',
      group: 'advanced',
    },
  },
  required: ['defaultInterpreter'],
  validation: {
    rules: [
      {
        condition: 'timeout < 5000',
        message: 'Very short timeouts may cause script execution failures',
        severity: 'warning',
      },
      {
        condition: 'maxOutputSize > 5242880', // 5MB
        message: 'Large output sizes may impact performance',
        severity: 'warning',
      },
      {
        condition: 'allowFileWrite === true && allowNetworkAccess === true',
        message:
          'Allowing both file write and network access increases security risk',
        severity: 'info',
      },
    ],
  },
  metadata: {
    category: 'script-execution',
    tags: ['scripts', 'automation', 'flexible'],
    documentation: 'https://docs.vibecode.dev/adapters/custom-script',
  },
};

/**
 * Get all default schemas
 */
export function getDefaultSchemas(): Record<string, AdapterConfigSchema> {
  return {
    'claude-code': CLAUDE_CODE_SCHEMA,
    'gemini-cli': GEMINI_CLI_SCHEMA,
    'custom-script': CUSTOM_SCRIPT_SCHEMA,
  };
}

/**
 * Register default schemas with the configuration manager
 */
export async function registerDefaultSchemas(
  configManager: any
): Promise<void> {
  const schemas = getDefaultSchemas();

  for (const [adapterId, schema] of Object.entries(schemas)) {
    try {
      await configManager.registerSchema(adapterId, schema);
      console.log(`✅ Registered schema for ${adapterId}`);
    } catch (error) {
      console.warn(
        `⚠️ Failed to register schema for ${adapterId}:`,
        (error as Error).message
      );
    }
  }
}
