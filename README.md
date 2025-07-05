# AgentTool

> **Hierarchical Multi-Agent System for AI-Powered Development**

AgentTool is a next-generation desktop application that orchestrates multiple AI coding assistants through an intelligent hierarchical architecture. Inspired by the best features of Crystal and Claudia, AgentTool provides a unified interface for managing Claude Code, Gemini CLI, and other AI tools through a sophisticated "Middle Manager" system.

## 🎯 Core Concept

**The Problem**: Managing multiple AI coding tools is fragmented, insecure, and lacks coordination.

**The Solution**: A hierarchical multi-agent system where:
- **You** interact with a single, intuitive interface
- **Middle Manager Agent** breaks down complex tasks and coordinates subagents
- **Subagents** (Claude Code, Gemini CLI) execute specialized work in isolated environments
- **Git worktrees** prevent conflicts between concurrent sessions
- **Real-time coordination** keeps everything synchronized

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Desktop UI Layer                        │
│              React + TypeScript + Vite + Tailwind              │
│                     shadcn/ui Components                       │
└─────────────────────────────────────────────────────────────────┘
                                │
                        Tauri IPC Bridge
                                │
┌─────────────────────────────────────────────────────────────────┐
│                      Rust Backend Layer                        │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                Middle Manager Agent                         │ │
│  │  • OpenRouter/Claude/Gemini Model Router                   │ │
│  │  • Task Decomposition Engine                               │ │
│  │  • Agent Coordination & Delegation                         │ │
│  │  • Session Management                                      │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                │                                │
│           Agent Registry & Process Manager                      │
│                                │                                │
│  ┌─────────────────────┐              ┌─────────────────────┐    │
│  │   Claude Code       │              │   Gemini CLI        │    │
│  │   Subagent          │              │   Subagent          │    │
│  │   • Process Isolation │              │   • Process Isolation │    │
│  │   • Permission Control │              │   • Permission Control │    │
│  │   • Git Worktree    │              │   • Git Worktree    │    │
│  └─────────────────────┘              └─────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                                │
                        SQLite Database
                   (Sessions, Agents, Metrics)
```

## ✨ Key Features

### 🤖 Intelligent Agent Coordination
- **Middle Manager**: Orchestrates all AI interactions and task delegation
- **Task Decomposition**: Breaks complex requests into manageable subtasks
- **Model Switching**: Dynamically choose between Claude, Gemini, or OpenRouter models
- **Agent Collaboration**: Coordinated multi-agent workflows

### 🔒 Security & Isolation
- **Process Isolation**: Each subagent runs in a secure, isolated process
- **Granular Permissions**: Fine-grained control over file and network access
- **Git Worktree Isolation**: Each session gets its own branch/worktree
- **Audit Logging**: Complete tracking of all agent activities

### 💡 Developer Experience
- **Session Management**: Persistent conversations across all agents
- **Real-time Monitoring**: Live agent status and performance tracking
- **Diff Viewer**: Review changes across agent sessions
- **Instant Testing**: Test code changes without leaving the application
- **Desktop Notifications**: Stay informed of agent status updates

### 🛠️ Technical Excellence
- **Cross-Platform**: Works on Windows, macOS, and Linux
- **Modern Stack**: React + TypeScript + Rust + Tauri
- **Performance**: Optimized for speed and resource efficiency
- **Extensible**: Plugin architecture for custom agents

## 🚀 Getting Started

> **Note**: AgentTool is currently in development. The following instructions will be available once the foundation is complete.

### Prerequisites
- [Rust](https://rustup.rs/) (latest stable)
- [Node.js](https://nodejs.org/) (v18 or higher)
- [Claude Code](https://github.com/anthropics/claude-code) installed and configured
- [Gemini CLI](https://github.com/google/generative-ai-python) installed and configured

### Installation
```bash
# Clone the repository
git clone https://github.com/yourusername/AgentTool.git
cd AgentTool

# Install dependencies
npm install

# Build and run
npm run tauri dev
```

### Configuration
1. Launch AgentTool
2. Configure your AI providers (Claude, Gemini, OpenRouter)
3. Set up your project directories
4. Create your first agent session

## 🎨 Screenshots

> **Coming Soon**: Screenshots will be added as the UI is developed.

## 🔧 Development Status

**Current Phase**: Architecture & Planning Complete  
**Progress**: 3/24 tasks completed (12.5%)

See [todo.md](./todo.md) for detailed development roadmap.

### Completed
- ✅ Research analysis of existing solutions
- ✅ Comprehensive architecture design
- ✅ Technical foundation planning

### Next Steps
- 🚧 Tauri + React development environment setup
- 🚧 Inter-agent communication protocol
- 🚧 Middle Manager agent implementation

## 🏆 Inspiration & Acknowledgments

AgentTool builds upon the excellent work of:

- **[Crystal](https://github.com/stravu/crystal)** (MIT License) - For git worktree isolation and session management patterns
- **[Claudia](https://github.com/getAsterisk/claudia)** (AGPL License) - For secure agent management and process isolation techniques

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/AgentTool/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/AgentTool/discussions)
- **Documentation**: [Project Wiki](https://github.com/yourusername/AgentTool/wiki)

## 🗺️ Roadmap

### Phase 1: Foundation (Weeks 1-2)
- Core architecture implementation
- Basic agent communication
- Middle Manager foundation

### Phase 2: Agent Implementation (Weeks 3-4)
- Claude Code integration
- Gemini CLI integration
- Task decomposition engine

### Phase 3: User Interface (Weeks 5-6)
- Desktop application UI
- Session management
- Git worktree integration

### Phase 4: Advanced Features (Weeks 7-8)
- Security & permissions
- Testing integration
- Agent coordination

### Phase 5: Polish & Production (Weeks 9-10)
- Performance optimization
- Monitoring & analytics
- Documentation & release

---

**Built with ❤️ for the AI development community**