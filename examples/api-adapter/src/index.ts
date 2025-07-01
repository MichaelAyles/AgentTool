import { BaseAdapter } from '@vibecode/adapter-sdk';
import { AdapterConfig, ProcessOptions } from '@vibecode/shared';
import { z } from 'zod';

// Configuration schema for the API adapter
const APIAdapterConfigSchema = z.object({
  apiEndpoint: z.string().url(),
  apiKey: z.string().optional(),
  timeout: z.number().min(1000).max(60000).default(10000),
  retries: z.number().min(0).max(5).default(3),
  model: z.string().default('gpt-3.5-turbo'),
  temperature: z.number().min(0).max(2).default(0.7),
});

type APIAdapterConfig = z.infer<typeof APIAdapterConfigSchema>;

interface APIRequest {
  model: string;
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
  temperature: number;
  stream?: boolean;
}

interface APIResponse {
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class APIAdapter extends BaseAdapter {
  private config: APIAdapterConfig;
  private abortController?: AbortController;

  constructor(adapterConfig: AdapterConfig) {
    super(adapterConfig);

    // Parse and validate adapter-specific configuration
    this.config = APIAdapterConfigSchema.parse(adapterConfig.settings || {});
  }

  async initialize(): Promise<void> {
    this.logger.info('API adapter initializing...', {
      endpoint: this.config.apiEndpoint,
      model: this.config.model,
    });

    // Test API connection
    await this.testConnection();

    this.logger.info('API adapter initialized successfully');
    this.emit('ready', { adapter: 'api' });
  }

  async execute(command: string, options: ProcessOptions): Promise<void> {
    try {
      this.emit('busy', { command });

      this.logger.info('Executing API request', { command });

      // Create abort controller for cancellation
      this.abortController = new AbortController();

      // Prepare API request
      const request: APIRequest = {
        model: this.config.model,
        messages: [
          {
            role: 'user',
            content: command,
          },
        ],
        temperature: this.config.temperature,
      };

      // Make API request with retries
      const response = await this.makeAPIRequest(request);

      // Process and emit response
      if (response.choices && response.choices.length > 0) {
        const content = response.choices[0].message.content;

        this.emit('output', {
          data: content + '\n',
          type: 'stdout',
        });

        // Emit usage information if available
        if (response.usage) {
          this.logger.debug('Token usage', response.usage);
        }
      }

      this.emit('process-exit', { code: 0 });
      this.emit('idle', {});
    } catch (error) {
      this.logger.error('API request failed', { error, command });
      this.emit('error', { error: error as Error });
    } finally {
      this.abortController = undefined;
    }
  }

  async sendInput(data: string): Promise<void> {
    // For streaming APIs, we could send incremental data
    this.logger.debug('Received input', { data });

    // In a real implementation, this might update an ongoing conversation
    this.emit('output', {
      data: `Processing input: ${data}\n`,
      type: 'stdout',
    });
  }

  async cleanup(): Promise<void> {
    this.logger.info('API adapter cleaning up...');

    // Cancel any ongoing requests
    if (this.abortController) {
      this.abortController.abort();
    }

    // Clean up resources
    this.removeAllListeners();

    this.logger.info('API adapter cleanup completed');
  }

  private async testConnection(): Promise<void> {
    try {
      const testRequest: APIRequest = {
        model: this.config.model,
        messages: [{ role: 'user', content: 'Test connection' }],
        temperature: 0,
      };

      // Make a minimal request to test connectivity
      await this.makeAPIRequest(testRequest, false);

      this.logger.debug('API connection test successful');
    } catch (error) {
      this.logger.error('API connection test failed', { error });
      throw new Error(`Failed to connect to API: ${error.message}`);
    }
  }

  private async makeAPIRequest(
    request: APIRequest,
    withRetries: boolean = true
  ): Promise<APIResponse> {
    const maxRetries = withRetries ? this.config.retries : 0;
    let lastError: Error;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(this.config.apiEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.config.apiKey && {
              Authorization: `Bearer ${this.config.apiKey}`,
            }),
          },
          body: JSON.stringify(request),
          signal: this.abortController?.signal,
        });

        if (!response.ok) {
          throw new Error(
            `API request failed: ${response.status} ${response.statusText}`
          );
        }

        const data: APIResponse = await response.json();

        this.logger.debug('API request successful', {
          attempt: attempt + 1,
          status: response.status,
        });

        return data;
      } catch (error) {
        lastError = error as Error;

        // Don't retry on abort
        if (error.name === 'AbortError') {
          throw error;
        }

        // Log retry attempts
        if (attempt < maxRetries) {
          this.logger.warn('API request failed, retrying...', {
            attempt: attempt + 1,
            maxRetries,
            error: error.message,
          });

          // Exponential backoff
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError!;
  }

  // Override to provide custom configuration validation
  async updateConfig(newConfig: Partial<AdapterConfig>): Promise<void> {
    const mergedSettings = {
      ...this.getConfig().settings,
      ...newConfig.settings,
    };

    // Validate the new configuration
    const validatedConfig = APIAdapterConfigSchema.parse(mergedSettings);

    // Update internal configuration
    this.config = validatedConfig;

    // Update base configuration
    await super.updateConfig({
      ...newConfig,
      settings: validatedConfig,
    });

    this.logger.info('Configuration updated', { config: validatedConfig });

    // Test new configuration
    await this.testConnection();
  }
}

// Factory function for creating adapter instances
export default function createAdapter(config: AdapterConfig): APIAdapter {
  return new APIAdapter(config);
}

// Export configuration schema for validation
export { APIAdapterConfigSchema };
