# API Adapter Example

This example demonstrates how to create an adapter that communicates with web APIs instead of CLI tools. It's particularly useful for integrating with cloud-based AI services and REST APIs.

## Features

- **HTTP API Integration**: Makes authenticated requests to external APIs
- **Retry Logic**: Implements exponential backoff for failed requests
- **Request Cancellation**: Supports aborting ongoing requests
- **Connection Testing**: Validates API connectivity on initialization
- **Error Handling**: Comprehensive error handling with logging

## Configuration

```json
{
  "apiEndpoint": "https://api.openai.com/v1/chat/completions",
  "apiKey": "your-api-key-here",
  "timeout": 10000,
  "retries": 3,
  "model": "gpt-3.5-turbo",
  "temperature": 0.7
}
```

### Options

- `apiEndpoint` (string, required): The API endpoint URL
- `apiKey` (string, optional): Authentication key for the API
- `timeout` (number): Request timeout in milliseconds (1000-60000, default: 10000)
- `retries` (number): Number of retry attempts (0-5, default: 3)
- `model` (string): Model identifier (default: "gpt-3.5-turbo")
- `temperature` (number): Response randomness (0-2, default: 0.7)

## Usage

### Building the Adapter

```bash
cd examples/api-adapter
bun run build
```

### Using with OpenAI API

```typescript
const config = {
  id: 'openai-api',
  name: 'OpenAI API Adapter',
  type: 'api',
  settings: {
    apiEndpoint: 'https://api.openai.com/v1/chat/completions',
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4',
    temperature: 0.7,
    timeout: 15000,
    retries: 3,
  },
};

const adapter = new APIAdapter(config);
await adapter.initialize();
await adapter.execute('Explain quantum computing', {});
```

### Using with Custom API

```typescript
const config = {
  id: 'custom-api',
  name: 'Custom API Adapter',
  type: 'api',
  settings: {
    apiEndpoint: 'https://your-api.com/v1/generate',
    apiKey: 'your-custom-api-key',
    model: 'custom-model',
    timeout: 20000,
  },
};
```

## Key Features Demonstrated

### 1. HTTP Request Management

```typescript
private async makeAPIRequest(request: APIRequest): Promise<APIResponse> {
  const response = await fetch(this.config.apiEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`,
    },
    body: JSON.stringify(request),
    signal: this.abortController?.signal,
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  return await response.json();
}
```

### 2. Retry Logic with Exponential Backoff

```typescript
for (let attempt = 0; attempt <= maxRetries; attempt++) {
  try {
    return await this.makeAPIRequest(request);
  } catch (error) {
    if (attempt < maxRetries) {
      const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

### 3. Request Cancellation

```typescript
async execute(command: string, options: ProcessOptions): Promise<void> {
  this.abortController = new AbortController();

  try {
    await this.makeAPIRequest(request);
  } finally {
    this.abortController = undefined;
  }
}

async cleanup(): Promise<void> {
  if (this.abortController) {
    this.abortController.abort();
  }
}
```

### 4. Connection Testing

```typescript
private async testConnection(): Promise<void> {
  const testRequest = {
    model: this.config.model,
    messages: [{ role: 'user', content: 'Test connection' }],
    temperature: 0,
  };

  await this.makeAPIRequest(testRequest, false);
}
```

## Error Handling

The adapter includes comprehensive error handling for common API issues:

- **Network Errors**: Connection timeouts and network failures
- **Authentication Errors**: Invalid API keys or expired tokens
- **Rate Limiting**: HTTP 429 responses with automatic retries
- **Server Errors**: 5xx responses with exponential backoff
- **Request Validation**: Invalid request parameters

## Extending the Example

### Adding Streaming Support

```typescript
async executeStream(command: string): Promise<void> {
  const request = {
    ...baseRequest,
    stream: true,
  };

  const response = await fetch(this.config.apiEndpoint, {
    method: 'POST',
    headers: this.getHeaders(),
    body: JSON.stringify(request),
  });

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = new TextDecoder().decode(value);
    this.emit('output', { data: chunk, type: 'stdout' });
  }
}
```

### Adding Authentication Refresh

```typescript
private async refreshToken(): Promise<string> {
  const response = await fetch('/auth/refresh', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${this.refreshToken}` },
  });

  const data = await response.json();
  return data.access_token;
}
```

### Adding Response Caching

```typescript
private responseCache = new Map<string, { response: APIResponse; timestamp: number }>();

private getCachedResponse(request: string): APIResponse | null {
  const cached = this.responseCache.get(request);
  if (cached && Date.now() - cached.timestamp < 300000) { // 5 min cache
    return cached.response;
  }
  return null;
}
```

## Environment Variables

Set up environment variables for API credentials:

```bash
# .env
OPENAI_API_KEY=sk-your-openai-key
ANTHROPIC_API_KEY=your-anthropic-key
CUSTOM_API_KEY=your-custom-key
```

## Security Considerations

- **Never commit API keys**: Use environment variables or secure configuration
- **Validate inputs**: Sanitize user inputs before sending to APIs
- **Rate limiting**: Respect API rate limits and implement backoff
- **Error messages**: Don't expose sensitive information in error messages

## Related Examples

- **Simple Adapter**: Basic adapter patterns and lifecycle management
- **Claude Code Adapter**: CLI-based adapter with process management
- **Custom Script Adapter**: Multi-language script execution

## Learn More

- [Adapter Development Guide](../../docs/guides/adapter-development.md)
- [API Integration Patterns](https://docs.vibecode.dev/patterns/api)
- [Security Best Practices](https://docs.vibecode.dev/security)
