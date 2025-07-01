# CLI Adapter Specification

## Overview

The CLI Adapter system provides a plugin architecture for integrating various AI coding assistants into the Vibe Code platform.

## Adapter Structure

### Directory Layout

```
adapters/
├── claude-code/
│   ├── package.json
│   ├── index.ts
│   ├── adapter.ts
│   ├── config.schema.json
│   └── README.md
├── gemini-cli/
│   └── ...
└── custom-adapter-template/
    └── ...
```

### Adapter Implementation

```typescript
// adapters/claude-code/adapter.ts
import {
  CLIAdapter,
  AdapterConfig,
  ProcessHandle,
} from '@vibecode/adapter-sdk';

export class ClaudeCodeAdapter implements CLIAdapter {
  name = 'claude-code';
  version = '1.0.0';

  capabilities = {
    supportsStreaming: true,
    supportsMCP: true,
    supportsSubagents: true,
    supportsInteractiveMode: true,
    customCommands: ['--extended-thinking', '--memory'],
  };

  private config: AdapterConfig;
  private process?: ChildProcess;

  async initialize(config: AdapterConfig): Promise<void> {
    this.config = config;
    // Verify claude-code is installed
    await this.verifyInstallation();
  }

  async execute(
    command: string,
    options: ExecuteOptions
  ): Promise<ProcessHandle> {
    const args = this.parseCommand(command);
    const env = this.buildEnvironment(options);

    this.process = spawn('claude-code', args, {
      cwd: options.workingDirectory,
      env,
      shell: false,
    });

    return {
      pid: this.process.pid!,
      adapter: this.name,
      startTime: new Date(),
    };
  }

  async *streamOutput(handle: ProcessHandle): AsyncIterable<OutputChunk> {
    if (!this.process) throw new Error('No active process');

    for await (const chunk of this.process.stdout) {
      yield {
        type: 'stdout',
        data: chunk.toString(),
        timestamp: new Date(),
      };
    }
  }
}
```

## Adapter SDK

### Core Types

```typescript
// @vibecode/adapter-sdk/types.ts

export interface CLIAdapter {
  // Metadata
  name: string;
  version: string;
  description?: string;
  author?: string;
  capabilities: CLICapabilities;

  // Lifecycle hooks
  initialize(config: AdapterConfig): Promise<void>;
  dispose(): Promise<void>;
  healthCheck(): Promise<HealthStatus>;

  // Command execution
  execute(command: string, options: ExecuteOptions): Promise<ProcessHandle>;
  streamOutput(handle: ProcessHandle): AsyncIterable<OutputChunk>;
  interrupt(handle: ProcessHandle): Promise<void>;

  // Project operations
  createProject?(path: string, template?: string): Promise<void>;
  openProject?(path: string): Promise<void>;
  listProjects?(): Promise<ProjectInfo[]>;

  // Advanced features
  listMCPServers?(): Promise<MCPServer[]>;
  connectMCPServer?(server: MCPServer): Promise<void>;
  createSubagent?(config: SubagentConfig): Promise<ProcessHandle>;

  // Configuration
  getConfigSchema(): JSONSchema;
  validateConfig(config: unknown): config is AdapterConfig;
}

export interface ExecuteOptions {
  workingDirectory: string;
  environment?: Record<string, string>;
  timeout?: number;
  interactive?: boolean;
  dangerousMode?: boolean;
}

export interface OutputChunk {
  type: 'stdout' | 'stderr' | 'system';
  data: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}
```

### Helper Utilities

```typescript
// @vibecode/adapter-sdk/utils.ts

export class BaseAdapter implements Partial<CLIAdapter> {
  protected logger: Logger;

  constructor(protected options: BaseAdapterOptions) {
    this.logger = createLogger(this.name);
  }

  async verifyInstallation(): Promise<void> {
    // Check if CLI tool is available
  }

  parseCommand(command: string): string[] {
    // Sophisticated command parsing
  }

  buildEnvironment(options: ExecuteOptions): NodeJS.ProcessEnv {
    // Merge environments safely
  }
}

export function createAdapter(definition: AdapterDefinition): CLIAdapter {
  // Factory function for simple adapters
}
```

## Adapter Registry

### Registration

```typescript
// backend/src/adapters/registry.ts

export class AdapterRegistry {
  private adapters = new Map<string, CLIAdapter>();
  private loaders = new Map<string, AdapterLoader>();

  async register(adapter: CLIAdapter): Promise<void> {
    await adapter.initialize(this.getAdapterConfig(adapter.name));
    this.adapters.set(adapter.name, adapter);
    this.emit('adapter:registered', adapter);
  }

  async loadFromPath(path: string): Promise<void> {
    const loader = new AdapterLoader(path);
    const adapter = await loader.load();
    await this.register(adapter);
  }

  async autoDiscover(searchPaths: string[]): Promise<void> {
    for (const path of searchPaths) {
      const adapterDirs = await this.findAdapterDirectories(path);
      for (const dir of adapterDirs) {
        try {
          await this.loadFromPath(dir);
        } catch (error) {
          this.logger.error(`Failed to load adapter from ${dir}:`, error);
        }
      }
    }
  }
}
```

## Example Adapters

### Gemini CLI Adapter

```typescript
export class GeminiCLIAdapter extends BaseAdapter {
  name = 'gemini-cli';

  capabilities = {
    supportsStreaming: true,
    supportsMCP: false,
    supportsSubagents: false,
    supportsInteractiveMode: true,
    customCommands: ['--model', '--temperature'],
  };

  async execute(
    command: string,
    options: ExecuteOptions
  ): Promise<ProcessHandle> {
    // Gemini-specific implementation
    const args = ['chat', ...this.parseCommand(command)];
    return this.spawnProcess('gemini', args, options);
  }
}
```

### Custom Script Adapter

```typescript
export class CustomScriptAdapter extends BaseAdapter {
  name = 'custom-script';

  capabilities = {
    supportsStreaming: true,
    supportsMCP: false,
    supportsSubagents: true,
    supportsInteractiveMode: false,
    customCommands: [],
  };

  async execute(
    command: string,
    options: ExecuteOptions
  ): Promise<ProcessHandle> {
    // Execute any shell script/command
    return this.spawnProcess(command, [], {
      ...options,
      shell: true,
    });
  }
}
```

## Adapter Lifecycle

### Loading Sequence

1. Discovery: Find adapter directories
2. Validation: Check package.json and entry point
3. Loading: Dynamic import of adapter module
4. Initialization: Call adapter.initialize()
5. Registration: Add to registry
6. Health check: Verify adapter is functional

### Configuration Management

```typescript
interface AdapterConfigManager {
  // Load from multiple sources
  async loadConfig(adapterName: string): Promise<AdapterConfig> {
    const sources = [
      await this.loadFromEnv(adapterName),
      await this.loadFromFile(adapterName),
      await this.loadFromDatabase(adapterName),
      this.getDefaults(adapterName),
    ];

    return deepMerge(...sources);
  }

  // Validate against schema
  async validateConfig(
    adapterName: string,
    config: unknown
  ): Promise<ValidationResult> {
    const adapter = this.registry.get(adapterName);
    const schema = adapter.getConfigSchema();
    return validateAgainstSchema(config, schema);
  }
}
```

## Security Considerations

### Sandboxing

```typescript
interface AdapterSandbox {
  // Restrict file system access
  allowedPaths: string[];

  // Restrict network access
  allowedHosts: string[];

  // Restrict system calls
  blockedCommands: string[];

  // Resource limits
  maxMemory: number;
  maxCPU: number;
  timeout: number;
}
```

### Permission Model

```typescript
enum AdapterPermission {
  FILE_READ = 'file:read',
  FILE_WRITE = 'file:write',
  NETWORK = 'network',
  PROCESS_SPAWN = 'process:spawn',
  SYSTEM_INFO = 'system:info',
}

interface AdapterManifest {
  name: string;
  version: string;
  permissions: AdapterPermission[];
  dangerousModeRequired?: boolean;
}
```

## Testing Adapters

### Test Framework

```typescript
// @vibecode/adapter-test-utils

export class AdapterTestHarness {
  constructor(private adapter: CLIAdapter) {}

  async testCapabilities(): Promise<TestResult> {
    const results = [];

    // Test basic execution
    results.push(await this.testExecute());

    // Test streaming
    if (this.adapter.capabilities.supportsStreaming) {
      results.push(await this.testStreaming());
    }

    // Test MCP if supported
    if (this.adapter.capabilities.supportsMCP) {
      results.push(await this.testMCPIntegration());
    }

    return this.aggregateResults(results);
  }
}
```

### Example Test

```typescript
describe('ClaudeCodeAdapter', () => {
  let adapter: ClaudeCodeAdapter;
  let harness: AdapterTestHarness;

  beforeEach(async () => {
    adapter = new ClaudeCodeAdapter();
    await adapter.initialize(testConfig);
    harness = new AdapterTestHarness(adapter);
  });

  it('should execute commands', async () => {
    const handle = await adapter.execute('hello', {
      workingDirectory: '/tmp',
    });

    const output = [];
    for await (const chunk of adapter.streamOutput(handle)) {
      output.push(chunk);
    }

    expect(output).toHaveLength(greaterThan(0));
    expect(output[0].type).toBe('stdout');
  });
});
```

## Distribution

### NPM Package Structure

```json
{
  "name": "@vibecode/adapter-claude-code",
  "version": "1.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "vibecode": {
    "adapter": true,
    "adapterClass": "ClaudeCodeAdapter"
  },
  "peerDependencies": {
    "@vibecode/adapter-sdk": "^1.0.0"
  }
}
```

### Marketplace Integration

```typescript
interface AdapterMarketplace {
  async search(query: string): Promise<AdapterListing[]>;
  async install(adapterName: string): Promise<void>;
  async update(adapterName: string): Promise<void>;
  async uninstall(adapterName: string): Promise<void>;
  async getDetails(adapterName: string): Promise<AdapterDetails>;
}
```
