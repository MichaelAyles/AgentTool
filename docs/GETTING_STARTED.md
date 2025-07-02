# Getting Started with Vibe Code

Welcome to Vibe Code - the universal web platform for managing AI coding assistants! This guide will help you get up and running quickly.

## What is Vibe Code?

Vibe Code is a comprehensive web application that provides a unified interface for managing multiple AI coding assistants like Claude Code, Gemini CLI, and custom tools. It features:

- **Multi-AI Support**: Extensible adapter system for various AI tools
- **Real-time Terminal**: WebSocket-based streaming with PTY support
- **Git Integration**: Branch management, worktrees, and CI/CD pipeline support
- **Security Model**: Safe/dangerous modes with sandboxing and audit logging
- **Validation Pipeline**: Automated testing and validation of AI-generated code
- **Project Management**: Create, clone, and manage coding projects

## Quick Start

### One-Line Setup (Recommended)

The fastest way to get started is with our universal setup script:

```bash
curl -fsSL https://raw.githubusercontent.com/your-org/vibe-code/main/setup.sh | bash
```

This script will:
- Install all dependencies (Bun, Docker, etc.)
- Clone the repository
- Set up the development environment
- Start all services

### Manual Setup

If you prefer to set up manually:

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-org/vibe-code.git
   cd vibe-code
   ```

2. **Install dependencies**
   ```bash
   # Install Bun (package manager)
   curl -fsSL https://bun.sh/install | bash
   
   # Install project dependencies
   bun install
   ```

3. **Start development environment**
   ```bash
   bun dev
   ```

4. **Access the application**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:3000
   - Monitoring: http://localhost:3001 (Grafana)

## System Requirements

### Minimum Requirements

- **OS**: Linux, macOS, or Windows (with WSL2)
- **RAM**: 4GB minimum, 8GB recommended
- **CPU**: 2 cores minimum, 4 cores recommended
- **Storage**: 10GB free space
- **Node.js**: Version 18 or higher
- **Docker**: Version 20.10 or higher

### Recommended Requirements

- **OS**: Ubuntu 20.04+, macOS 12+, or Windows 11 with WSL2
- **RAM**: 16GB or more
- **CPU**: 8 cores or more
- **Storage**: 50GB SSD storage
- **Network**: Stable internet connection for AI API calls

## Configuration

### Environment Variables

Copy the example environment file and customize:

```bash
cp .env.example .env
```

Key configuration options:

```bash
# AI API Keys (required)
ANTHROPIC_API_KEY=your_anthropic_api_key_here
GOOGLE_AI_API_KEY=your_google_ai_api_key_here

# Database (optional - uses SQLite by default)
DATABASE_URL=postgresql://user:pass@localhost:5432/vibecode

# Security
JWT_SECRET=your_jwt_secret_here
SESSION_SECRET=your_session_secret_here

# Features
DANGEROUS_MODE_ENABLED=false  # Enable with caution
```

### AI API Keys

To use Vibe Code, you'll need API keys for the AI services:

1. **Anthropic (Claude)**
   - Sign up at https://console.anthropic.com
   - Generate an API key
   - Add to your `.env` file

2. **Google AI (Gemini)**
   - Visit https://makersuite.google.com/app/apikey
   - Create an API key
   - Add to your `.env` file

## First Steps

### 1. Create Your First Project

1. Open Vibe Code in your browser
2. Click "New Project"
3. Choose to create, clone, or initialize a project
4. Select your preferred AI adapter (Claude Code, Gemini CLI, etc.)

### 2. Configure AI Adapters

1. Go to Settings → Adapters
2. Configure your AI adapters with API keys
3. Test the connection
4. Set your default adapter

### 3. Start Coding

1. Open a project
2. Use the integrated terminal
3. Interact with your AI assistant
4. View real-time validation results

## Key Features

### Project Management

- **Create**: Start new projects from templates
- **Clone**: Import existing repositories
- **Initialize**: Set up new Git repositories
- **Switch**: Easily navigate between projects

### AI Adapter System

- **Multiple AIs**: Use Claude, Gemini, or custom tools
- **Adapter SDK**: Build your own AI integrations
- **Configuration**: Customize AI behavior per project
- **Marketplace**: Discover community adapters

### Validation Pipeline

- **Automated Testing**: Run tests on AI-generated code
- **Static Analysis**: Lint and type-check automatically
- **Success Criteria**: Define quality requirements
- **Self-Correction**: AI fixes its own mistakes

### Security Features

- **Safe Mode**: Sandboxed execution by default
- **Dangerous Mode**: Full system access with audit logs
- **Command Filtering**: Block risky operations
- **Audit Logging**: Track all security events

## Development Workflow

### Typical Development Session

1. **Start Session**
   ```bash
   bun dev  # Start development environment
   ```

2. **Open Project**
   - Navigate to http://localhost:5173
   - Select or create a project
   - Choose your AI adapter

3. **Code with AI**
   - Use the terminal interface
   - Ask your AI assistant for help
   - Review and validate suggestions

4. **Validate Changes**
   - Automatic validation runs
   - Review validation reports
   - Fix any issues found

5. **Commit Changes**
   - Use git integration
   - Create commits with AI help
   - Push to remote repository

### Best Practices

- **Start Small**: Begin with simple tasks to learn the interface
- **Use Validation**: Always review AI-generated code
- **Security First**: Understand safe vs dangerous mode
- **Version Control**: Commit frequently and use meaningful messages
- **Documentation**: Keep your project documentation up to date

## Troubleshooting

### Common Issues

**Q: Vibe Code won't start**
- Check that all dependencies are installed
- Verify Docker is running
- Check the logs: `docker-compose logs`

**Q: AI adapters not working**
- Verify API keys are correct
- Check network connectivity
- Review adapter configuration

**Q: Validation pipeline failing**
- Check project configuration
- Verify test commands work manually
- Review validation criteria

**Q: Permission denied errors**
- Check file permissions
- Verify Docker permissions
- Try running with appropriate privileges

### Getting Help

- **Documentation**: Check the full documentation at `/docs`
- **Issues**: Report bugs on GitHub
- **Community**: Join our Discord/Slack community
- **Support**: Contact support team

## Next Steps

### Learn More

- [Architecture Overview](ARCHITECTURE.md)
- [Adapter Development Guide](guides/adapter-development.md)
- [Security Guide](SECURITY_SPEC.md)
- [API Reference](API_REFERENCE.md)

### Contribute

- [Contributing Guide](CONTRIBUTING.md)
- [Development Setup](docs/development.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)

### Deploy

- [Production Deployment](DEPLOYMENT.md)
- [Docker Configuration](docker/README.md)
- [Monitoring Setup](docs/monitoring.md)

---

Ready to start coding with AI? [Create your first project →](http://localhost:5173)