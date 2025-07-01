# Gemini CLI Adapter

A Vibe Code adapter for integrating with Google's Gemini CLI tool, providing AI-powered coding assistance through Google's Gemini models.

## Features

- **Interactive AI Assistance**: Direct communication with Gemini models for code analysis, generation, and debugging
- **File-based Operations**: Analyze specific files or entire project contexts
- **Streaming Output**: Real-time responses from Gemini with progressive display
- **Project Context**: Provide full project context for more accurate suggestions
- **Multiple Input Modes**: Support for direct prompts, file uploads, and project analysis

## Prerequisites

### 1. Gemini CLI Installation

Install the Gemini CLI tool:

```bash
# Using npm (if available)
npm install -g @google-cloud/gemini-cli

# Or using pip
pip install google-generativeai

# Or using the official installer (check Google's documentation)
```

### 2. Google Cloud Setup

1. Create a Google Cloud Project
2. Enable the Vertex AI API
3. Set up authentication:

```bash
# Option 1: Service Account Key
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account-key.json"

# Option 2: Application Default Credentials
gcloud auth application-default login

# Set your project ID
export GOOGLE_CLOUD_PROJECT="your-project-id"
```

### 3. Gemini API Access

Ensure you have access to Gemini models through:
- Vertex AI API (for production use)
- Or Gemini API (for development)

## Configuration

### Environment Variables

- `GOOGLE_APPLICATION_CREDENTIALS`: Path to service account key file
- `GOOGLE_CLOUD_PROJECT`: Your Google Cloud project ID
- `GEMINI_MODEL`: Model to use (default: gemini-pro)
- `GEMINI_STREAMING`: Enable streaming (default: true)
- `GEMINI_FORMAT`: Output format (default: markdown)

### Model Options

The adapter supports various Gemini models:
- `gemini-pro`: General-purpose model for text and code
- `gemini-pro-vision`: Model with image understanding capabilities
- `gemini-ultra`: Most capable model (when available)

## Usage Examples

### Basic Code Analysis

```bash
# Analyze a specific function
gemini "Explain what this function does and suggest improvements"

# Review code for bugs
gemini "Review this code for potential bugs and security issues"
```

### File-based Operations

```bash
# Analyze specific files
gemini --files src/main.js src/utils.js --prompt "Review these files for consistency"

# Generate documentation
gemini --files src/api.js --prompt "Generate comprehensive JSDoc comments"
```

### Project-wide Analysis

```bash
# Project overview
gemini --project . --prompt "Analyze the overall architecture of this project"

# Generate tests
gemini --project . --prompt "Generate unit tests for the main components"
```

### Interactive Sessions

```bash
# Start an interactive session
gemini --interactive

# In interactive mode:
> Explain the MVC pattern
> How can I optimize this database query?
> Generate a REST API for user management
```

## Adapter Configuration

The Gemini CLI adapter can be configured through the Vibe Code settings:

```json
{
  "adapters": {
    "gemini-cli": {
      "model": "gemini-pro",
      "temperature": 0.7,
      "maxTokens": 2048,
      "streaming": true,
      "safetySettings": {
        "harassment": "BLOCK_MEDIUM_AND_ABOVE",
        "hateSpeech": "BLOCK_MEDIUM_AND_ABOVE",
        "sexuallyExplicit": "BLOCK_MEDIUM_AND_ABOVE",
        "dangerousContent": "BLOCK_MEDIUM_AND_ABOVE"
      }
    }
  }
}
```

## Advanced Features

### Custom Prompts

Create custom prompt templates for common tasks:

```javascript
// In your project configuration
{
  "geminiPrompts": {
    "codeReview": "Review this code for bugs, performance issues, and best practices: {code}",
    "documentation": "Generate comprehensive documentation for: {code}",
    "testing": "Generate unit tests for the following code: {code}"
  }
}
```

### Integration with IDE

The adapter integrates seamlessly with popular IDEs:

- **VS Code**: Use the Vibe Code extension
- **Terminal**: Direct CLI access
- **Web Interface**: Built-in web dashboard

## Troubleshooting

### Common Issues

1. **Authentication Errors**
   ```bash
   # Verify credentials
   gcloud auth list
   gcloud config get-value project
   ```

2. **API Quota Exceeded**
   - Check your Google Cloud Console for quota limits
   - Consider upgrading your plan or requesting quota increases

3. **Model Not Available**
   ```bash
   # List available models
   gemini models list
   ```

4. **Network Issues**
   - Check firewall settings
   - Verify internet connectivity
   - Try different regions if available

### Debug Mode

Enable debug mode for detailed logging:

```bash
export GEMINI_DEBUG=true
export VIBE_CODE_LOG_LEVEL=debug
```

## Performance Optimization

### Caching

Enable response caching for better performance:

```json
{
  "gemini": {
    "caching": {
      "enabled": true,
      "ttl": 3600,
      "maxSize": "100MB"
    }
  }
}
```

### Rate Limiting

Configure rate limiting to avoid API quota issues:

```json
{
  "gemini": {
    "rateLimit": {
      "requestsPerMinute": 60,
      "tokensPerMinute": 100000
    }
  }
}
```

## Security Considerations

- **Code Privacy**: Be aware that code is sent to Google's servers
- **API Keys**: Store credentials securely and rotate regularly
- **Content Filtering**: Use safety settings to filter inappropriate content
- **Access Control**: Implement proper IAM controls in Google Cloud

## API Reference

### Adapter Methods

- `execute(command, options)`: Execute a Gemini command
- `streamOutput(handle)`: Stream real-time output
- `interrupt(handle)`: Cancel running operations
- `validateConfiguration()`: Check setup and credentials

### Event Handlers

- `data`: Receive streaming output
- `exit`: Process completion
- `error`: Handle errors

## Contributing

To contribute to the Gemini CLI adapter:

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Submit a pull request

## License

This adapter is part of the Vibe Code project and follows the same licensing terms.

## Support

For support and questions:
- GitHub Issues: [Vibe Code Repository](https://github.com/your-org/vibe-code)
- Documentation: [Vibe Code Docs](https://docs.vibecode.dev)
- Community: [Discord Server](https://discord.gg/vibecode)