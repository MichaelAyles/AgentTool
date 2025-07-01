import { BaseAdapter } from '@vibecode/adapter-sdk';
import { AdapterConfig, ProcessOptions } from '@vibecode/shared';
import { z } from 'zod';

// Configuration schema for the simple adapter
const SimpleAdapterConfigSchema = z.object({
  greeting: z.string().default('Hello'),
  delay: z.number().min(0).max(5000).default(1000),
  uppercase: z.boolean().default(false),
});

type SimpleAdapterConfig = z.infer<typeof SimpleAdapterConfigSchema>;

export class SimpleAdapter extends BaseAdapter {
  private config: SimpleAdapterConfig;

  constructor(adapterConfig: AdapterConfig) {
    super(adapterConfig);

    // Parse and validate adapter-specific configuration
    this.config = SimpleAdapterConfigSchema.parse(adapterConfig.settings || {});
  }

  async initialize(): Promise<void> {
    this.logger.info('Simple adapter initializing...', {
      greeting: this.config.greeting,
      delay: this.config.delay,
    });

    // Simulate initialization delay
    await new Promise(resolve => setTimeout(resolve, 500));

    this.logger.info('Simple adapter initialized successfully');
    this.emit('ready', { adapter: 'simple' });
  }

  async execute(command: string, options: ProcessOptions): Promise<void> {
    try {
      this.emit('busy', { command });

      this.logger.info('Executing command', { command, options });

      // Simulate processing with configurable delay
      await new Promise(resolve => setTimeout(resolve, this.config.delay));

      // Create response based on configuration
      let response = `${this.config.greeting}, you said: "${command}"`;

      if (this.config.uppercase) {
        response = response.toUpperCase();
      }

      // Emit the response as output
      this.emit('output', {
        data: response + '\n',
        type: 'stdout',
      });

      // Simulate completion
      this.emit('process-exit', { code: 0 });
      this.emit('idle', {});
    } catch (error) {
      this.logger.error('Command execution failed', { error, command });
      this.emit('error', { error: error as Error });
    }
  }

  async sendInput(data: string): Promise<void> {
    // For this simple adapter, we'll just echo the input
    this.logger.debug('Received input', { data });

    this.emit('output', {
      data: `Echo: ${data}`,
      type: 'stdout',
    });
  }

  async cleanup(): Promise<void> {
    this.logger.info('Simple adapter cleaning up...');

    // Clean up any resources
    this.removeAllListeners();

    this.logger.info('Simple adapter cleanup completed');
  }

  // Override to provide custom configuration validation
  async updateConfig(newConfig: Partial<AdapterConfig>): Promise<void> {
    const mergedSettings = {
      ...this.getConfig().settings,
      ...newConfig.settings,
    };

    // Validate the new configuration
    const validatedConfig = SimpleAdapterConfigSchema.parse(mergedSettings);

    // Update internal configuration
    this.config = validatedConfig;

    // Update base configuration
    await super.updateConfig({
      ...newConfig,
      settings: validatedConfig,
    });

    this.logger.info('Configuration updated', { config: validatedConfig });
  }
}

// Factory function for creating adapter instances
export default function createAdapter(config: AdapterConfig): SimpleAdapter {
  return new SimpleAdapter(config);
}

// Export configuration schema for validation
export { SimpleAdapterConfigSchema };
