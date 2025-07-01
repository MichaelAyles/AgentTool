# Vibe Code

A comprehensive web application for managing AI coding assistants with extensible CLI tool integration, real-time terminal interfaces, and advanced project management capabilities.

## 🚀 Features

### Multi-AI Platform Support
- **Claude Code Integration**: Full support for Anthropic's Claude Code CLI
- **Gemini CLI Integration**: Google's Gemini CLI for AI-powered coding assistance
- **Extensible Adapter System**: Plugin architecture for adding new AI tools
- **Universal Interface**: Single platform for multiple AI coding assistants

### Real-time Terminal Interface
- **Interactive Sessions**: PTY-based terminal emulation with xterm.js
- **Streaming Output**: Real-time command execution with live output streaming
- **WebSocket Communication**: Low-latency bidirectional communication
- **Session Management**: Persistent sessions with state management

### Advanced Process Management
- **Resource Monitoring**: CPU, memory, and runtime tracking for all processes
- **Automatic Limits**: Configurable resource limits with violation handling
- **Health Monitoring**: Real-time system health with automatic cleanup
- **Process Queue**: Background job processing with Bull/BullMQ integration

### Project Management
- **Project Creation**: Create and manage coding projects with adapter selection
- **Database Integration**: SQLite-based project and session persistence
- **State Management**: Comprehensive application state with Zustand
- **Notification System**: Real-time user notifications and status updates

### Developer Experience
- **TypeScript First**: Full type safety across the entire stack
- **Modern Tech Stack**: React, Node.js, Express, Socket.io, Tailwind CSS
- **Hot Reload**: Development environment with instant reload
- **Comprehensive Testing**: Unit, integration, and E2E test coverage

## 📋 Current Status

**Progress: 20/70 tasks completed (28.5%)**

### ✅ Completed Features
- **Foundation**: Monorepo setup, TypeScript configuration, project structure
- **Backend Core**: Express API server, WebSocket communication, SQLite database
- **Frontend Core**: React with Vite, component structure, terminal interface
- **Adapter System**: SDK, registry, base classes, Claude Code and Gemini CLI adapters
- **Process Management**: PTY support, resource monitoring, session lifecycle
- **Real-time Features**: Streaming output, WebSocket protocols, session management
- **State Management**: Zustand store with persistence and notifications
- **Project Management**: Full CRUD operations with database integration

### 🚧 In Progress
- **Git Integration**: API endpoints for git operations and project management

### 📋 Upcoming Features
- **Security Framework**: Authentication, authorization, dangerous mode
- **Git Visualization**: Branch management, diff views, commit history
- **MCP Integration**: Model Context Protocol support
- **Advanced UI**: Settings, monitoring dashboard, adapter management
- **Testing & Deployment**: CI/CD, Docker containers, production setup

## 🛠 Technology Stack

### Backend
- **Runtime**: Node.js + TypeScript
- **Framework**: Express.js
- **Real-time**: Socket.io with WebSocket transport
- **Database**: SQLite with better-sqlite3
- **Process Management**: node-pty, Bull/BullMQ
- **Authentication**: JWT with bcrypt

### Frontend
- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite
- **State Management**: Zustand with persistence
- **UI Library**: Tailwind CSS + Headless UI
- **Terminal**: xterm.js with addons
- **HTTP Client**: React Query (TanStack Query)

### Development
- **Package Manager**: Bun with workspaces
- **Runtime**: Bun for faster execution
- **Testing**: Bun test for unit/integration tests
- **Linting**: ESLint + Prettier
- **Type Checking**: TypeScript strict mode
- **Git Hooks**: Husky for pre-commit validation

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and Bun 1.0+
- Claude Code CLI (auto-installed if needed)
- Gemini CLI (auto-installed if needed)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/vibe-code.git
cd vibe-code

# Install Bun if not already installed
curl -fsSL https://bun.sh/install | bash

# Install dependencies
bun install

# Copy environment configuration
cp .env.example .env

# Start development servers
./scripts/dev.sh
```

The application will be available at:
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3000
- **WebSocket**: ws://localhost:3000

### Development Scripts

```bash
# Start all services in development mode
bun dev

# Build all packages
bun run build

# Run tests
bun test

# Lint code
bun run lint

# Type checking
bun run typecheck

# Clean build artifacts
bun run clean
```

## 📁 Project Structure

```
vibe-code/
├── packages/
│   ├── backend/                 # Node.js API server
│   │   ├── src/
│   │   │   ├── api/            # REST API endpoints
│   │   │   ├── database/       # SQLite database management
│   │   │   ├── processes/      # Process and session management
│   │   │   └── websocket/      # WebSocket handlers
│   │   └── package.json
│   ├── frontend/               # React web application
│   │   ├── src/
│   │   │   ├── components/     # React components
│   │   │   ├── hooks/          # Custom React hooks
│   │   │   ├── services/       # API and WebSocket services
│   │   │   ├── store/          # Zustand state management
│   │   │   └── styles/         # Tailwind CSS styles
│   │   └── package.json
│   ├── adapter-sdk/            # CLI adapter development kit
│   │   ├── src/
│   │   │   ├── base/           # Base adapter classes
│   │   │   ├── registry/       # Adapter registry system
│   │   │   └── types/          # TypeScript interfaces
│   │   └── package.json
│   └── shared/                 # Common types and utilities
│       ├── src/
│       │   ├── types/          # Shared TypeScript types
│       │   └── utils/          # Utility functions
│       └── package.json
├── adapters/
│   ├── claude-code/            # Claude Code CLI adapter
│   │   ├── src/index.ts        # Adapter implementation
│   │   ├── README.md           # Setup instructions
│   │   └── package.json
│   ├── gemini-cli/             # Gemini CLI adapter
│   │   ├── src/index.ts        # Adapter implementation
│   │   ├── README.md           # Setup instructions
│   │   └── package.json
│   └── template/               # Adapter development template
├── docs/                       # Documentation
│   ├── ARCHITECTURE.md         # System architecture
│   ├── CLI_ADAPTER_SPEC.md     # Adapter development guide
│   └── ...                     # Additional documentation
├── scripts/                    # Build and development scripts
│   ├── dev.sh                  # Development startup script
│   └── build.sh                # Build script
├── docker/                     # Container configurations
├── .env.example               # Environment template
├── pnpm-workspace.yaml        # Workspace configuration
├── tsconfig.base.json         # Base TypeScript config
└── TODO.md                    # Development progress tracking
```

## 🔌 CLI Adapters

### Available Adapters

#### Claude Code Adapter
- **Status**: ✅ Complete
- **Features**: Full Claude Code CLI integration, streaming output, interactive mode
- **Setup**: Automatically installed via npx when first used
- **Documentation**: [adapters/claude-code/README.md](./adapters/claude-code/README.md)

#### Gemini CLI Adapter
- **Status**: ✅ Complete
- **Features**: Google Gemini integration, file operations, project context
- **Setup**: Automatically installed via pip when first used (requires Google Cloud credentials)
- **Documentation**: [adapters/gemini-cli/README.md](./adapters/gemini-cli/README.md)

### Creating Custom Adapters

```typescript
import { BaseAdapter } from '@vibecode/adapter-sdk';

export class MyCustomAdapter extends BaseAdapter {
  name = 'my-custom-cli';
  version = '1.0.0';
  description = 'My custom CLI tool adapter';

  capabilities = {
    supportsStreaming: true,
    supportsInteractiveMode: true,
    // ... other capabilities
  };

  async execute(command: string, options: ExecuteOptions) {
    // Implementation
  }
}
```

See the [CLI Adapter Development Guide](./docs/CLI_ADAPTER_SPEC.md) for complete documentation.

## 🖥 User Interface

### Main Features
- **Project Dashboard**: Create, manage, and access coding projects
- **Interactive Terminal**: Real-time terminal with AI assistant integration
- **Process Monitor**: View resource usage, active sessions, and system health
- **Settings Panel**: Configure adapters, themes, and system preferences

### Screenshots
*(Screenshots would be added here once the UI is more mature)*

## 🔧 Configuration

### Environment Variables

```bash
# Server Configuration
PORT=3000
NODE_ENV=development

# CORS Configuration
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000

# Database Configuration
DATABASE_PATH=./vibecode.db

# Security Configuration
JWT_SECRET=your-secret-key-here

# Claude Code Configuration (optional)
CLAUDE_API_KEY=your-claude-api-key

# Gemini CLI Configuration (optional)
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
GOOGLE_CLOUD_PROJECT=your-project-id

# Development Options
DEBUG=vibecode:*
```

### Adapter Configuration

Configure adapters in the frontend settings or via environment variables:

```json
{
  "adapters": {
    "claude-code": {
      "enabled": true,
      "defaultModel": "claude-3-sonnet",
      "streaming": true
    },
    "gemini-cli": {
      "enabled": true,
      "model": "gemini-pro",
      "temperature": 0.7
    }
  }
}
```

## 🔒 Security

### Safe Mode (Default)
- Sandboxed execution environment
- Restricted file system access
- Command validation and filtering
- Automatic session timeouts

### Dangerous Mode
- Full system access (when enabled)
- Explicit user consent required
- Comprehensive audit logging
- Enhanced monitoring and alerts

### Authentication & Authorization
- JWT-based authentication
- Role-based access control (RBAC)
- Multi-provider support (planned)
- Session management

## 📊 Monitoring

### Process Monitoring
- Real-time CPU and memory usage tracking
- Configurable resource limits
- Automatic violation handling
- Health status reporting

### Performance Metrics
- API response times
- WebSocket latency
- Session lifecycle tracking
- Resource utilization

### Logs and Audit Trail
- Comprehensive audit logging
- Security event tracking
- Performance monitoring
- Error reporting and alerting

## 🚢 Deployment

### Development
```bash
# Start development environment
./scripts/dev.sh

# Or manually
pnpm --filter @vibecode/backend dev &
pnpm --filter @vibecode/frontend dev &
```

### Production (Docker)
```bash
# Build containers
docker compose build

# Start production environment
docker compose up -d

# View logs
docker compose logs -f
```

### Manual Production Setup
```bash
# Build all packages
pnpm build

# Start backend
cd packages/backend && npm start

# Serve frontend (use nginx, apache, or similar)
# Static files are in packages/frontend/dist
```

## 🧪 Testing

### Running Tests
```bash
# Run all tests
pnpm test

# Run tests for specific package
pnpm --filter @vibecode/backend test
pnpm --filter @vibecode/frontend test

# Run tests in watch mode
pnpm --filter @vibecode/backend test --watch
```

### Test Coverage
- **Unit Tests**: Core business logic and utilities
- **Integration Tests**: API endpoints and database operations
- **Component Tests**: React components and hooks
- **E2E Tests**: Complete user workflows (planned)

## 🤝 Contributing

### Development Workflow
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes with proper testing
4. Commit using conventional commits (`git commit -m 'feat: add amazing feature'`)
5. Push to your branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

### Code Standards
- TypeScript for all code
- ESLint + Prettier for formatting
- Conventional commits for messages
- Comprehensive test coverage
- JSDoc for public APIs

### Project Guidelines
- Security-first approach
- Performance considerations
- Accessibility compliance
- Mobile-responsive design
- Comprehensive documentation

## 📚 Documentation

- **[Architecture Overview](./docs/ARCHITECTURE.md)**: System design and component relationships
- **[CLI Adapter Guide](./docs/CLI_ADAPTER_SPEC.md)**: Creating custom adapters
- **[API Reference](./docs/API.md)**: Backend API documentation
- **[Development Guide](./docs/DEVELOPMENT.md)**: Setting up the development environment
- **[Security Model](./docs/SECURITY_SPEC.md)**: Security framework and best practices

## 🗓 Roadmap

### Phase 1: Foundation ✅ (Complete)
- [x] Monorepo setup and TypeScript configuration
- [x] Backend API server with WebSocket support
- [x] CLI adapter SDK and registry system
- [x] React frontend with terminal component
- [x] Claude Code and Gemini CLI adapters

### Phase 2: Core Features 🚧 (In Progress)
- [x] Process management and resource monitoring
- [x] Real-time communication and session management
- [x] Project management with database integration
- [ ] Git operations and version control
- [ ] Security framework and authentication

### Phase 3: Advanced Features 📋 (Planned)
- [ ] Advanced UI with settings and monitoring
- [ ] MCP (Model Context Protocol) integration
- [ ] Docker-based sandboxing
- [ ] Performance optimizations
- [ ] Comprehensive testing suite

### Phase 4: Production Ready 📋 (Planned)
- [ ] CI/CD pipeline with automated testing
- [ ] Production deployment configurations
- [ ] Performance monitoring and alerting
- [ ] Documentation and user guides
- [ ] Public release preparation

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Claude Code**: Anthropic's excellent CLI tool for AI-powered coding
- **Gemini**: Google's powerful AI models and CLI tools
- **xterm.js**: Excellent terminal emulation in the browser
- **Socket.io**: Real-time bidirectional communication
- **React**: Modern UI development framework
- **TypeScript**: Type safety and developer experience

## 📞 Support

- **GitHub Issues**: [Report bugs and request features](https://github.com/your-org/vibe-code/issues)
- **Discussions**: [Community discussions and questions](https://github.com/your-org/vibe-code/discussions)
- **Documentation**: [Comprehensive guides and API docs](./docs/)

---

**Built with ❤️ for the developer community**