# Simple Adapter Example

This is a basic example of how to create a custom adapter for the Vibe Code platform. It demonstrates the core concepts and patterns used in adapter development.

## Features

- **Simple Echo Functionality**: Responds to commands with a configurable greeting
- **Configurable Behavior**: Supports custom greeting messages, delays, and text transformation
- **Event Emission**: Demonstrates proper event handling and output streaming
- **Configuration Validation**: Uses Zod for robust configuration validation

## Configuration

The simple adapter accepts the following configuration options:

```json
{
  "greeting": "Hello",
  "delay": 1000,
  "uppercase": false
}
```

### Options

- `greeting` (string): The greeting message to use in responses (default: "Hello")
- `delay` (number): Delay in milliseconds before responding (0-5000, default: 1000)
- `uppercase` (boolean): Whether to convert the response to uppercase (default: false)

## Usage

### Building the Adapter

```bash
cd examples/simple-adapter
bun run build
```

### Testing the Adapter

```bash
bun test
```

### Using in Vibe Code

1. Copy the built adapter to your adapters directory
2. Register it in the adapter registry
3. Configure it in your project settings

```typescript
import { SimpleAdapter } from './examples/simple-adapter';

const config = {
  id: 'my-simple-adapter',
  name: 'My Simple Adapter',
  type: 'cli',
  settings: {
    greeting: 'Hi there',
    delay: 500,
    uppercase: true,
  },
};

const adapter = new SimpleAdapter(config);
await adapter.initialize();
await adapter.execute('test command', {});
```

## Code Structure

```
simple-adapter/
├── src/
│   └── index.ts          # Main adapter implementation
├── package.json          # Package configuration
├── tsconfig.json         # TypeScript configuration
└── README.md            # This file
```

## Key Concepts Demonstrated

### 1. Configuration Validation

```typescript
const SimpleAdapterConfigSchema = z.object({
  greeting: z.string().default('Hello'),
  delay: z.number().min(0).max(5000).default(1000),
  uppercase: z.boolean().default(false),
});
```

### 2. Event Emission

```typescript
// Notify about adapter state
this.emit('ready', { adapter: 'simple' });
this.emit('busy', { command });
this.emit('idle', {});

// Send output to the UI
this.emit('output', {
  data: response + '\n',
  type: 'stdout',
});
```

### 3. Lifecycle Management

```typescript
async initialize(): Promise<void> {
  // Setup and validation logic
}

async execute(command: string, options: ProcessOptions): Promise<void> {
  // Command processing logic
}

async cleanup(): Promise<void> {
  // Resource cleanup
}
```

### 4. Error Handling

```typescript
try {
  // Command execution
} catch (error) {
  this.logger.error('Command execution failed', { error, command });
  this.emit('error', { error: error as Error });
}
```

## Extending the Example

You can extend this simple adapter by:

1. **Adding Real Process Execution**: Use `this.startProcess()` to run actual commands
2. **Implementing Input Handling**: Process user input in the `sendInput()` method
3. **Adding More Configuration Options**: Extend the configuration schema
4. **Improving Error Handling**: Add more sophisticated error recovery
5. **Adding UI Components**: Create custom configuration panels

## Related Examples

- **Advanced CLI Adapter**: See `adapters/claude-code/` for a full-featured implementation
- **API Adapter**: See `adapters/gemini-cli/` for API-based communication
- **Script Adapter**: See `adapters/custom-script/` for multi-language support

## Learn More

- [Adapter Development Guide](../../docs/guides/adapter-development.md)
- [Platform Documentation](https://docs.vibecode.dev)
- [API Reference](https://api.vibecode.dev)
