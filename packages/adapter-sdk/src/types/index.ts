import type {
  OutputChunk,
  ProcessHandle,
  SecurityContext,
} from '@vibecode/shared';

export interface CLIAdapter {
  name: string;
  version: string;
  description?: string;
  capabilities: CLICapabilities;

  initialize(config: AdapterConfig): Promise<void>;
  dispose(): Promise<void>;
  execute(command: string, options: ExecuteOptions): Promise<ProcessHandle>;
  streamOutput(handle: ProcessHandle): AsyncIterable<OutputChunk>;
  interrupt(handle: ProcessHandle): Promise<void>;

  createProject?(path: string, template?: string): Promise<void>;
  openProject?(path: string): Promise<void>;

  getConfigSchema(): JSONSchema;
  validateConfig(config: unknown): config is AdapterConfig;
}

export interface CLICapabilities {
  supportsStreaming: boolean;
  supportsMCP: boolean;
  supportsSubagents: boolean;
  supportsInteractiveMode: boolean;
  customCommands?: string[];
}

export interface ExecuteOptions {
  workingDirectory: string;
  environment?: Record<string, string>;
  timeout?: number;
  interactive?: boolean;
  securityContext?: SecurityContext;
}

export interface AdapterConfig {
  name: string;
  enabled: boolean;
  settings: Record<string, unknown>;
  security: AdapterSecurityConfig;
}

export interface AdapterSecurityConfig {
  allowedPaths: string[];
  blockedCommands: string[];
  timeout: number;
  maxMemory: number;
}

export interface JSONSchema {
  type: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  [key: string]: unknown;
}

export interface HealthStatus {
  healthy: boolean;
  message?: string;
  details?: Record<string, unknown>;
}

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

export interface AdapterLoader {
  load(path: string): Promise<CLIAdapter>;
  validate(adapter: CLIAdapter): Promise<ValidationResult>;
}
