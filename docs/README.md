# Vibe Code Documentation

## Overview
This directory contains comprehensive documentation for the Vibe Code project - a universal web platform for managing AI coding assistants.

## Documentation Index

### 📐 Architecture & Design
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Complete system architecture, technology stack, and component design
- **[PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md)** - Monorepo layout, build system, and development workflow

### 🔌 Integration Specifications  
- **[CLI_ADAPTER_SPEC.md](./CLI_ADAPTER_SPEC.md)** - Plugin system for integrating AI tools (Claude Code, Gemini CLI, etc.)
- **[PROCESS_MANAGEMENT_SPEC.md](./PROCESS_MANAGEMENT_SPEC.md)** - Real-time process handling and WebSocket communication
- **[MCP_INTEGRATION_SPEC.md](./MCP_INTEGRATION_SPEC.md)** - Model Context Protocol integration architecture

### 🔒 Security & Operations
- **[SECURITY_SPEC.md](./SECURITY_SPEC.md)** - Comprehensive security model with safe/dangerous modes, auth, and sandboxing

### 📋 Planning & Analysis
- **[IMPLEMENTATION_ROADMAP.md](./IMPLEMENTATION_ROADMAP.md)** - 16-week phased development plan with milestones
- **[CRYSTAL_COMPARISON.md](./CRYSTAL_COMPARISON.md)** - Competitive analysis vs Crystal desktop app

## Quick Reference

### Key Features
- **Multi-AI Support**: Claude Code, Gemini CLI, custom tools via plugin system
- **Real-time Terminal**: WebSocket streaming with PTY support  
- **Git Integration**: Branches, worktrees, CI/CD pipeline support
- **Security Model**: Safe/dangerous modes with comprehensive auditing
- **Web-based**: Universal access without desktop installation
- **Enterprise Ready**: Authentication, RBAC, multi-tenant support

### Technology Stack
- **Backend**: Node.js + TypeScript, Express.js, Socket.io, Bull/BullMQ
- **Frontend**: React + TypeScript, Vite, Zustand, xterm.js, Tailwind CSS
- **Database**: SQLite/PostgreSQL
- **Deployment**: Docker, pnpm monorepo

### Development Phases
1. **Foundation** (Weeks 1-4): Core setup and basic functionality
2. **Core Features** (Weeks 5-8): Process management, adapters, real-time communication  
3. **Advanced Features** (Weeks 9-12): Security, MCP, advanced UI
4. **Production** (Weeks 13-16): Performance, testing, deployment

### Getting Started
```bash
# Project setup
pnpm install
cp .env.example .env

# Development  
pnpm dev                 # Start all services
pnpm build              # Build all packages
pnpm test               # Run tests

# Docker
docker compose up -d    # Production environment
```

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (React)                      │
├─────────────────────────────────────────────────────────────┤
│  Project Manager │ Terminal UI │ Git UI │ Settings │ Plugins│
└────────────────────┬───────────────────────────────────────┘
                     │ WebSocket + REST API
┌────────────────────▼───────────────────────────────────────┐
│                    API Gateway (Express)                    │
├─────────────────────────────────────────────────────────────┤
│   Auth │ Rate Limiting │ Request Validation │ Routing      │
└────────────────────┬───────────────────────────────────────┘
                     │
┌────────────────────▼───────────────────────────────────────┐
│                    Core Services Layer                      │
├─────────────────────────────────────────────────────────────┤
│ Process Manager │ Git Service │ Project Service │ MCP Bridge│
└─────────────────────────────────────────────────────────────┘
                     │
┌────────────────────▼───────────────────────────────────────┐
│                  CLI Adapter Layer                          │
├─────────────────────────────────────────────────────────────┤
│ Claude Adapter │ Gemini Adapter │ Custom Adapters │ ...    │
└─────────────────────────────────────────────────────────────┘
```

## Contributing

### Development Workflow
1. Read relevant specification documents
2. Follow TypeScript-first development
3. Implement comprehensive tests
4. Update documentation as needed
5. Follow security-first design principles

### Code Quality
- Type safety with TypeScript
- Comprehensive test coverage
- Security vulnerability scanning  
- Performance benchmarking
- Regular dependency updates

For detailed implementation guidance, refer to the specific documentation files above.