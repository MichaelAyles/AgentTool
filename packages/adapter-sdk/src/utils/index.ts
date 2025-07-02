import type { CLIAdapter, ValidationResult } from '../types/index.js';

export function createLogger(name: string) {
  return {
    info: (message: string, ...args: any[]) =>
      console.log(`[${name}] ${message}`, ...args),
    error: (message: string, ...args: any[]) =>
      console.error(`[${name}] ${message}`, ...args),
    warn: (message: string, ...args: any[]) =>
      console.warn(`[${name}] ${message}`, ...args),
    debug: (message: string, ...args: any[]) =>
      console.debug(`[${name}] ${message}`, ...args),
  };
}

export class AdapterRegistry {
  private adapters = new Map<string, CLIAdapter>();

  async register(adapter: CLIAdapter): Promise<void> {
    const validation = await this.validateAdapter(adapter);
    if (!validation.valid) {
      throw new Error(`Invalid adapter: ${validation.errors?.join(', ')}`);
    }

    this.adapters.set(adapter.name, adapter);
  }

  get(name: string): CLIAdapter | undefined {
    return this.adapters.get(name);
  }

  list(): CLIAdapter[] {
    return Array.from(this.adapters.values());
  }

  private async validateAdapter(
    adapter: CLIAdapter
  ): Promise<ValidationResult> {
    const errors: string[] = [];

    if (!adapter.name) errors.push('Adapter name is required');
    if (!adapter.version) errors.push('Adapter version is required');
    if (!adapter.capabilities) errors.push('Adapter capabilities are required');

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}
