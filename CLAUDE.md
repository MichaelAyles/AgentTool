# Vibe Code Project Context

## USER INSTRUCTIONS FOR CLAUDE
After every feature checked off the todo list, check for errors or run CI if implemented, then commit to working branch and push working branch to remote.
Maintain a user visible todo.md, update after every feature implementation with the commit reference
Update Readme.md and claude.md if the state of the project is different from whats currently written.
After current todo list cleared, check for errors or run CI if implemented, then summarise branch and consult user whether to run a PR

## Project Overview
Vibe Code is a comprehensive web application for managing AI coding assistants (claude-code, gemini-cli, etc.) with support for project management, git operations, CI/CD, MCP servers, and extensible CLI tool integration.

## Technology Stack
- **Backend**: Node.js + TypeScript, Express.js, Socket.io, Bull/BullMQ, mock PTY (node-pty replacement)
- **Frontend**: React + TypeScript, Vite, Zustand, xterm.js, React Query, Tailwind CSS
- **Database**: SQLite3 (development), PostgreSQL (production)
- **Deployment**: Docker, Docker Compose
- **Package Manager**: Bun (monorepo with workspaces)
- **Runtime**: Bun for development, Node.js for production

## Key Features
- **Multi-AI Support**: Extensible adapter system for Claude Code, Gemini CLI, and custom tools
- **Real-time Terminal**: WebSocket-based streaming with PTY support
- **Git Integration**: Branch management, worktrees, CI/CD pipeline support
- **Security Model**: Safe/dangerous modes with sandboxing and audit logging
- **MCP Integration**: Full Model Context Protocol support for extensible AI tooling
- **Project Management**: Create, clone, manage coding projects with session persistence
- **Multi-user Support**: Authentication, authorization, role-based access control

## Architecture Highlights
- Plugin-based CLI adapter system for extensibility
- Process management with resource monitoring and cleanup
- Real-time bidirectional communication via WebSocket
- Comprehensive security framework with command validation
- Event-driven architecture with loose coupling
- Containerized deployment with horizontal scaling

## Development Guidelines
- TypeScript-first for type safety
- Comprehensive test coverage (unit, integration, E2E)
- Security-first design with audit logging
- Performance optimization (streaming, batching, caching)
- Modular, replaceable components
- Extensive documentation and examples

## Project Structure
```
vibecode/
├── packages/
│   ├── backend/          # Node.js API server
│   ├── frontend/         # React web application
│   ├── adapter-sdk/      # CLI adapter development kit
│   └── shared/           # Common types and utilities
├── adapters/
│   ├── claude-code/      # Claude Code adapter
│   ├── gemini-cli/       # Gemini CLI adapter
│   └── template/         # Adapter template
├── docker/               # Container configurations
├── scripts/              # Build and deployment scripts
└── docs/                 # Documentation
```

## Implementation Phases
1. **Foundation** (Weeks 1-4): Project setup, core backend, CLI adapter framework, basic frontend
2. **Core Features** (Weeks 5-8): Process management, first adapters, real-time communication, git integration
3. **Advanced Features** (Weeks 9-12): Security framework, dangerous mode, MCP integration, advanced UI
4. **Polish & Production** (Weeks 13-16): Performance optimization, sandboxing, testing, deployment

## Competitive Analysis
- **Crystal**: Existing Electron app focused on Claude Code with excellent git worktree integration
- **Vibe Code Differentiation**: Multi-AI platform, web-based, enterprise features, extensible architecture
- **Market Position**: Universal AI coding platform vs. Crystal's focused Claude Code solution

## Security Considerations
- **Safe Mode**: Default sandboxed execution with restricted file system, network, and command access
- **Dangerous Mode**: Full system access with explicit user consent, audit logging, and timeout controls
- **Authentication**: Multi-provider support (local, OAuth, SAML)
- **Authorization**: Role-based access control with granular permissions
- **Audit Trail**: Comprehensive logging of all security-relevant actions

## Performance Requirements
- Response time < 100ms for API calls
- Terminal latency < 50ms for interactive sessions
- 99.9% uptime for production deployment
- < 2GB memory usage per active session
- Support for 100+ concurrent users

## Development Commands
```bash
# One-line setup (recommended)
curl -fsSL https://raw.githubusercontent.com/your-org/vibe-code/main/setup.sh | bash

# Manual setup
git clone https://github.com/your-org/vibe-code.git
cd vibe-code
./setup.sh

# Development
bun dev                  # Start all services
bun build               # Build all packages
bun test                # Run all tests
bun run lint            # Lint all code
bun run typecheck       # Type checking

# Docker
docker compose up -d     # Start production environment
docker compose build    # Build containers
```

## Key Files to Reference
- `ARCHITECTURE.md` - Complete system architecture and design
- `CLI_ADAPTER_SPEC.md` - Plugin system for AI tool integration
- `PROCESS_MANAGEMENT_SPEC.md` - Real-time process handling
- `SECURITY_SPEC.md` - Comprehensive security model
- `MCP_INTEGRATION_SPEC.md` - Model Context Protocol integration
- `PROJECT_STRUCTURE.md` - Monorepo layout and development workflow
- `IMPLEMENTATION_ROADMAP.md` - 16-week development plan
- `CRYSTAL_COMPARISON.md` - Competitive analysis and differentiation

## Current Status
**Phase 1: Foundation - 75% Complete**

✅ **Completed:**
- Monorepo structure with Bun workspaces
- Backend API server with Express.js and WebSocket support
- CLI adapter SDK and registry system
- React frontend with terminal component
- Claude Code and Gemini CLI adapters
- Process management and resource monitoring
- Project management with database integration
- Universal cross-platform setup script

🚧 **In Progress:**
- Workspace dependency resolution fixes
- Real node-pty integration (currently using mock)

📋 **Next Priority:**
- Fix remaining TypeScript compilation issues
- Complete git operations integration
- Implement security framework

**Progress: 23/86 tasks completed (26.7%)**

## How to Run
```bash
# Quick start
git clone <repository>
cd vibe-code
bun dev

# Access the application
# Frontend: http://localhost:5173
# Backend API: http://localhost:3000
```