# Adapter Development Guide

This guide will walk you through creating custom adapters for the Vibe Code platform, enabling integration with new AI tools and CLI utilities.

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Adapter Architecture](#adapter-architecture)
4. [Creating Your First Adapter](#creating-your-first-adapter)
5. [Configuration Management](#configuration-management)
6. [Process Management](#process-management)
7. [Testing Your Adapter](#testing-your-adapter)
8. [Publishing and Distribution](#publishing-and-distribution)
9. [Advanced Features](#advanced-features)
10. [Best Practices](#best-practices)

## Overview

Adapters in Vibe Code serve as bridges between the platform and external AI tools or CLI utilities. They handle:

- Process lifecycle management
- Command translation and execution
- Output streaming and formatting
- Configuration management
- Error handling and recovery

### Supported Types

- **CLI Adapters**: Wrap command-line tools (e.g., Claude Code, Gemini CLI)
- **API Adapters**: Connect to web APIs and services
- **Script Adapters**: Execute custom scripts in various languages
- **Hybrid Adapters**: Combine multiple interaction methods

## Quick Start

### 1. Clone the Template

```bash
# Using the provided adapter template
cp -r adapters/template adapters/my-adapter
cd adapters/my-adapter
```

### 2. Update Package Configuration

```json
{
  "name": "@vibecode/adapter-my-adapter",
  "version": "1.0.0",
  "description": "My custom adapter for Vibe Code",
  "main": "./dist/index.js",
  "dependencies": {
    "@vibecode/adapter-sdk": "workspace:*",
    "@vibecode/shared": "workspace:*"
  }
}
```

### 3. Implement Basic Adapter

```typescript
import { BaseAdapter } from '@vibecode/adapter-sdk';
import { AdapterConfig, ProcessOptions } from '@vibecode/shared';

export class MyAdapter extends BaseAdapter {
  constructor(config: AdapterConfig) {
    super(config);
  }

  async initialize(): Promise<void> {
    // Initialization logic
    this.logger.info('MyAdapter initialized');
  }

  async execute(command: string, options: ProcessOptions): Promise<void> {
    // Command execution logic
    await this.startProcess('my-tool', [command], options);
  }

  async cleanup(): Promise<void> {
    // Cleanup logic
    await this.terminateProcess();
  }
}
```

### 4. Build and Test

```bash
bun run build
bun test
```

## Adapter Architecture

### Core Components

```typescript
interface BaseAdapter {
  // Lifecycle methods
  initialize(): Promise<void>;
  execute(command: string, options: ProcessOptions): Promise<void>;
  cleanup(): Promise<void>;

  // Process management
  startProcess(
    command: string,
    args: string[],
    options: ProcessOptions
  ): Promise<void>;
  terminateProcess(): Promise<void>;

  // Communication
  sendInput(data: string): Promise<void>;
  onOutput(callback: (data: string) => void): void;
  onError(callback: (error: Error) => void): void;

  // Configuration
  getConfig(): AdapterConfig;
  updateConfig(config: Partial<AdapterConfig>): Promise<void>;
}
```

### Event System

Adapters communicate through a comprehensive event system:

```typescript
// Output events
this.emit('output', { data: 'Hello World', type: 'stdout' });
this.emit('error', { error: new Error('Something went wrong') });

// State events
this.emit('ready', { adapter: this.name });
this.emit('busy', { command: 'executing...' });
this.emit('idle', {});

// Process events
this.emit('process-start', { pid: process.pid });
this.emit('process-exit', { code: 0 });
```

## Creating Your First Adapter

Let's create a simple adapter for a hypothetical "AI Helper" tool:

### 1. Define Configuration Schema

```typescript
// src/config.ts
import { z } from 'zod';

export const AIHelperConfigSchema = z.object({
  apiKey: z.string().optional(),
  model: z.enum(['gpt-4', 'claude-3']).default('gpt-4'),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().positive().default(1000),
});

export type AIHelperConfig = z.infer<typeof AIHelperConfigSchema>;
```

### 2. Implement the Adapter

```typescript
// src/index.ts
import { BaseAdapter } from '@vibecode/adapter-sdk';
import { AdapterConfig, ProcessOptions } from '@vibecode/shared';
import { AIHelperConfig, AIHelperConfigSchema } from './config';

export class AIHelperAdapter extends BaseAdapter {
  private apiKey: string;
  private config: AIHelperConfig;

  constructor(config: AdapterConfig) {
    super(config);

    // Validate and parse adapter-specific config
    this.config = AIHelperConfigSchema.parse(config.settings);
    this.apiKey = this.config.apiKey || process.env.AI_HELPER_API_KEY || '';
  }

  async initialize(): Promise<void> {
    if (!this.apiKey) {
      throw new Error('AI Helper API key is required');
    }

    // Test connection
    await this.testConnection();

    this.logger.info('AI Helper adapter initialized', {
      model: this.config.model,
      temperature: this.config.temperature,
    });

    this.emit('ready', { adapter: 'ai-helper' });
  }

  async execute(command: string, options: ProcessOptions): Promise<void> {
    try {
      this.emit('busy', { command });

      // Start the AI Helper process
      const args = [
        '--model',
        this.config.model,
        '--temperature',
        this.config.temperature.toString(),
        '--max-tokens',
        this.config.maxTokens.toString(),
        '--prompt',
        command,
      ];

      if (this.apiKey) {
        args.push('--api-key', this.apiKey);
      }

      await this.startProcess('ai-helper', args, {
        ...options,
        env: {
          ...process.env,
          AI_HELPER_API_KEY: this.apiKey,
        },
      });
    } catch (error) {
      this.logger.error('Failed to execute command', { error, command });
      this.emit('error', { error: error as Error });
    }
  }

  async cleanup(): Promise<void> {
    await this.terminateProcess();
    this.emit('idle', {});
    this.logger.info('AI Helper adapter cleaned up');
  }

  private async testConnection(): Promise<void> {
    // Implement connection test
    this.logger.debug('Testing AI Helper connection...');
    // Add actual connection test logic here
  }
}

// Export the adapter factory
export default function createAdapter(config: AdapterConfig): AIHelperAdapter {
  return new AIHelperAdapter(config);
}
```

### 3. Add Configuration Validation

```typescript
// src/validator.ts
import { AdapterConfig } from '@vibecode/shared';
import { AIHelperConfigSchema } from './config';

export function validateConfig(config: AdapterConfig): boolean {
  try {
    AIHelperConfigSchema.parse(config.settings);
    return true;
  } catch (error) {
    console.error('Invalid AI Helper configuration:', error);
    return false;
  }
}

export function getConfigSchema() {
  return AIHelperConfigSchema;
}
```

## Configuration Management

### Schema Definition

Use Zod for robust configuration validation:

```typescript
import { z } from 'zod';

const ConfigSchema = z.object({
  // Required fields
  executable: z.string(),
  workingDirectory: z.string().default(process.cwd()),

  // Optional fields with defaults
  timeout: z.number().positive().default(30000),
  maxBuffer: z
    .number()
    .positive()
    .default(1024 * 1024),

  // Environment configuration
  env: z.record(z.string()).optional(),

  // Tool-specific settings
  apiEndpoint: z.string().url().optional(),
  authentication: z
    .object({
      type: z.enum(['api-key', 'oauth', 'none']),
      credentials: z.record(z.string()).optional(),
    })
    .optional(),
});
```

### Dynamic Configuration Updates

```typescript
async updateConfig(newConfig: Partial<AdapterConfig>): Promise<void> {
  // Merge and validate new configuration
  const mergedConfig = {
    ...this.getConfig(),
    ...newConfig,
  };

  // Validate the merged configuration
  const validatedConfig = ConfigSchema.parse(mergedConfig.settings);

  // Apply configuration changes
  this.config = validatedConfig;

  // Restart process if necessary
  if (this.isProcessRunning()) {
    await this.restartProcess();
  }

  this.logger.info('Configuration updated', { config: validatedConfig });
}
```

## Process Management

### Advanced Process Handling

```typescript
class AdvancedAdapter extends BaseAdapter {
  private childProcess?: ChildProcess;
  private processMonitor?: NodeJS.Timer;

  async startProcess(
    command: string,
    args: string[],
    options: ProcessOptions
  ): Promise<void> {
    // Terminate existing process
    await this.terminateProcess();

    // Prepare process options
    const processOptions: SpawnOptions = {
      cwd: options.workingDirectory || this.config.workingDirectory,
      env: { ...process.env, ...options.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    };

    // Start the process
    this.childProcess = spawn(command, args, processOptions);

    // Set up process monitoring
    this.setupProcessMonitoring();

    // Handle process output
    this.setupOutputHandling();

    // Handle process events
    this.setupProcessEvents();
  }

  private setupProcessMonitoring(): void {
    if (!this.childProcess) return;

    // Monitor process health
    this.processMonitor = setInterval(() => {
      if (this.childProcess && !this.childProcess.killed) {
        // Check memory usage, CPU, etc.
        const memUsage = process.memoryUsage();
        if (memUsage.rss > this.config.maxMemory) {
          this.logger.warn('Process memory usage high', { memUsage });
        }
      }
    }, 5000);
  }

  private setupOutputHandling(): void {
    if (!this.childProcess) return;

    // Handle stdout
    this.childProcess.stdout?.on('data', (data: Buffer) => {
      const output = data.toString();
      this.emit('output', { data: output, type: 'stdout' });
    });

    // Handle stderr
    this.childProcess.stderr?.on('data', (data: Buffer) => {
      const error = data.toString();
      this.emit('output', { data: error, type: 'stderr' });
    });
  }

  private setupProcessEvents(): void {
    if (!this.childProcess) return;

    this.childProcess.on('spawn', () => {
      this.emit('process-start', { pid: this.childProcess!.pid });
    });

    this.childProcess.on('exit', (code, signal) => {
      this.emit('process-exit', { code, signal });
      this.cleanup();
    });

    this.childProcess.on('error', error => {
      this.logger.error('Process error', { error });
      this.emit('error', { error });
    });
  }
}
```

## Testing Your Adapter

### Unit Tests

```typescript
// tests/adapter.test.ts
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { AIHelperAdapter } from '../src';
import { AdapterConfig } from '@vibecode/shared';

describe('AIHelperAdapter', () => {
  let adapter: AIHelperAdapter;
  let config: AdapterConfig;

  beforeEach(() => {
    config = {
      id: 'test-ai-helper',
      name: 'AI Helper Test',
      type: 'cli',
      settings: {
        apiKey: 'test-key',
        model: 'gpt-4',
        temperature: 0.7,
      },
    };
    adapter = new AIHelperAdapter(config);
  });

  afterEach(async () => {
    await adapter.cleanup();
  });

  test('should initialize successfully', async () => {
    await expect(adapter.initialize()).resolves.not.toThrow();
  });

  test('should validate configuration', () => {
    const invalidConfig = { ...config, settings: { model: 'invalid-model' } };
    expect(() => new AIHelperAdapter(invalidConfig)).toThrow();
  });

  test('should handle command execution', async () => {
    await adapter.initialize();

    const outputPromise = new Promise<string>(resolve => {
      adapter.on('output', data => resolve(data.data));
    });

    await adapter.execute('test command', {});

    const output = await outputPromise;
    expect(output).toContain('expected response');
  });
});
```

### Integration Tests

```typescript
// tests/integration.test.ts
import { describe, test, expect } from 'bun:test';
import { AdapterRegistry } from '@vibecode/adapter-sdk';
import { AIHelperAdapter } from '../src';

describe('AI Helper Integration', () => {
  test('should register with adapter registry', async () => {
    const registry = new AdapterRegistry();

    await registry.register('ai-helper', {
      factory: config => new AIHelperAdapter(config),
      schema: AIHelperConfigSchema,
    });

    const adapter = await registry.create('ai-helper', config);
    expect(adapter).toBeInstanceOf(AIHelperAdapter);
  });

  test('should handle real command execution', async () => {
    // Skip if no API key available
    if (!process.env.AI_HELPER_API_KEY) {
      test.skip();
      return;
    }

    const adapter = new AIHelperAdapter(config);
    await adapter.initialize();

    // Test with real API call
    const result = await new Promise((resolve, reject) => {
      const outputs: string[] = [];

      adapter.on('output', data => outputs.push(data.data));
      adapter.on('error', reject);
      adapter.on('process-exit', () => resolve(outputs.join('')));

      adapter.execute('Hello, how are you?', {});
    });

    expect(result).toBeTruthy();
  });
});
```

## Publishing and Distribution

### Package Configuration

```json
{
  "name": "@vibecode/adapter-ai-helper",
  "version": "1.0.0",
  "description": "AI Helper adapter for Vibe Code",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist/", "README.md", "LICENSE"],
  "scripts": {
    "build": "bun --bun tsc",
    "test": "bun test",
    "clean": "rm -rf dist",
    "prepublishOnly": "bun run clean && bun run build"
  },
  "keywords": ["vibe-code", "adapter", "ai-helper", "cli"],
  "repository": {
    "type": "git",
    "url": "https://github.com/your-org/ai-helper-adapter"
  },
  "dependencies": {
    "@vibecode/adapter-sdk": "^1.0.0",
    "@vibecode/shared": "^1.0.0",
    "zod": "^3.22.0"
  },
  "peerDependencies": {
    "ai-helper-cli": "^2.0.0"
  }
}
```

### Registry Submission

```typescript
// adapter-registry.json
{
  "name": "ai-helper",
  "displayName": "AI Helper",
  "description": "Integrate AI Helper CLI tool with Vibe Code",
  "version": "1.0.0",
  "author": "Your Name",
  "homepage": "https://github.com/your-org/ai-helper-adapter",
  "category": "ai-tools",
  "tags": ["ai", "assistant", "cli"],
  "requirements": {
    "platform": ["linux", "darwin", "win32"],
    "node": ">=18.0.0",
    "dependencies": ["ai-helper-cli"]
  },
  "configuration": {
    "schema": "./dist/config-schema.json",
    "defaults": {
      "model": "gpt-4",
      "temperature": 0.7,
      "maxTokens": 1000
    }
  }
}
```

## Advanced Features

### Custom UI Components

```typescript
// ui/ConfigPanel.tsx
import React from 'react';
import { AdapterConfig } from '@vibecode/shared';

interface ConfigPanelProps {
  config: AdapterConfig;
  onUpdate: (config: Partial<AdapterConfig>) => void;
}

export function AIHelperConfigPanel({ config, onUpdate }: ConfigPanelProps) {
  return (
    <div className="config-panel">
      <h3>AI Helper Configuration</h3>

      <div className="form-group">
        <label>API Key</label>
        <input
          type="password"
          value={config.settings.apiKey || ''}
          onChange={(e) => onUpdate({
            settings: { ...config.settings, apiKey: e.target.value }
          })}
        />
      </div>

      <div className="form-group">
        <label>Model</label>
        <select
          value={config.settings.model}
          onChange={(e) => onUpdate({
            settings: { ...config.settings, model: e.target.value }
          })}
        >
          <option value="gpt-4">GPT-4</option>
          <option value="claude-3">Claude 3</option>
        </select>
      </div>
    </div>
  );
}
```

### Plugin System

```typescript
// plugins/index.ts
export interface AdapterPlugin {
  name: string;
  version: string;
  initialize(adapter: BaseAdapter): Promise<void>;
  cleanup(): Promise<void>;
}

export class LoggingPlugin implements AdapterPlugin {
  name = 'logging';
  version = '1.0.0';

  async initialize(adapter: BaseAdapter): Promise<void> {
    adapter.on('output', data => {
      console.log(`[${adapter.name}] Output:`, data.data);
    });

    adapter.on('error', error => {
      console.error(`[${adapter.name}] Error:`, error.error);
    });
  }

  async cleanup(): Promise<void> {
    // Cleanup plugin resources
  }
}
```

## Best Practices

### 1. Error Handling

```typescript
async execute(command: string, options: ProcessOptions): Promise<void> {
  try {
    await this.startProcess('tool', [command], options);
  } catch (error) {
    // Log the error with context
    this.logger.error('Command execution failed', {
      command,
      error: error.message,
      adapter: this.name,
    });

    // Emit error event for UI handling
    this.emit('error', {
      error: error as Error,
      recoverable: this.isRecoverableError(error),
    });

    // Attempt recovery if possible
    if (this.isRecoverableError(error)) {
      await this.attemptRecovery();
    }
  }
}
```

### 2. Resource Management

```typescript
async cleanup(): Promise<void> {
  // Clear timers
  if (this.processMonitor) {
    clearInterval(this.processMonitor);
  }

  // Close streams
  if (this.outputStream) {
    this.outputStream.end();
  }

  // Terminate processes
  await this.terminateProcess();

  // Clear event listeners
  this.removeAllListeners();

  this.logger.info('Adapter cleanup completed');
}
```

### 3. Configuration Validation

```typescript
private validateRuntimeConfig(): void {
  // Check required dependencies
  if (!this.checkDependency('required-tool')) {
    throw new Error('Required tool not found in PATH');
  }

  // Validate API connectivity
  if (this.config.apiEndpoint) {
    this.validateApiConnection();
  }

  // Check file permissions
  if (this.config.workingDirectory) {
    this.validateDirectoryAccess(this.config.workingDirectory);
  }
}
```

### 4. Performance Optimization

```typescript
// Implement output buffering for better performance
private outputBuffer: string[] = [];
private bufferTimeout?: NodeJS.Timeout;

private bufferOutput(data: string): void {
  this.outputBuffer.push(data);

  // Clear existing timeout
  if (this.bufferTimeout) {
    clearTimeout(this.bufferTimeout);
  }

  // Set new timeout to flush buffer
  this.bufferTimeout = setTimeout(() => {
    this.flushOutputBuffer();
  }, 100); // 100ms buffer window
}

private flushOutputBuffer(): void {
  if (this.outputBuffer.length > 0) {
    const output = this.outputBuffer.join('');
    this.outputBuffer = [];
    this.emit('output', { data: output, type: 'stdout' });
  }
}
```

## Example Adapters

Check out these example adapters for reference:

- **Claude Code Adapter**: `adapters/claude-code/` - Full-featured CLI adapter
- **Gemini CLI Adapter**: `adapters/gemini-cli/` - API-based adapter
- **Custom Script Adapter**: `adapters/custom-script/` - Multi-language script execution

## Support and Community

- **Documentation**: [https://docs.vibecode.dev/adapters](https://docs.vibecode.dev/adapters)
- **GitHub Discussions**: [Community Forum](https://github.com/vibecode/platform/discussions)
- **Discord**: [Developer Community](https://discord.gg/vibecode-dev)
- **Issues**: [Bug Reports](https://github.com/vibecode/platform/issues)

---

Happy coding! 🚀
