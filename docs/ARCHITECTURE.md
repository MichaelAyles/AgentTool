# Vibe Code Web App Architecture

## Overview

A web application for managing AI coding assistants (claude-code, gemini-cli, etc.) with support for project management, git operations, CI/CD, and MCP servers.

## Core Architecture

### Technology Stack

- **Backend**: Node.js + TypeScript
  - Express.js for REST API
  - Socket.io for real-time bidirectional communication
  - Bull/BullMQ for job queue management
  - node-pty for terminal emulation
- **Frontend**: React + TypeScript
  - Vite for build tooling
  - Zustand for state management
  - xterm.js for terminal UI
  - React Query for data fetching
  - Tailwind CSS for styling

- **Database**: SQLite (embedded) or PostgreSQL
  - Projects metadata
  - CLI tool configurations
  - Session history
  - User preferences

### System Architecture

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

## CLI Adapter System

### Interface Definition

```typescript
interface CLIAdapter {
  name: string;
  version: string;
  capabilities: CLICapabilities;

  // Lifecycle
  initialize(config: AdapterConfig): Promise<void>;
  dispose(): Promise<void>;

  // Execution
  execute(command: string, options: ExecuteOptions): Promise<ProcessHandle>;
  streamOutput(handle: ProcessHandle): AsyncIterable<OutputChunk>;

  // Project operations
  createProject(path: string, template?: string): Promise<void>;
  openProject(path: string): Promise<void>;

  // MCP operations (if supported)
  listMCPServers?(): Promise<MCPServer[]>;
  connectMCPServer?(server: MCPServer): Promise<void>;
}

interface CLICapabilities {
  supportsStreaming: boolean;
  supportsMCP: boolean;
  supportsSubagents: boolean;
  supportsInteractiveMode: boolean;
  customCommands?: string[];
}
```

### Plugin Registration

```typescript
class CLIAdapterRegistry {
  private adapters = new Map<string, CLIAdapter>();

  register(adapter: CLIAdapter): void {
    this.adapters.set(adapter.name, adapter);
  }

  async loadFromDirectory(path: string): Promise<void> {
    // Dynamic loading of adapter modules
  }
}
```

## Process Management

### Process Lifecycle

```typescript
class ProcessManager {
  private processes = new Map<string, ChildProcess>();
  private pty = new Map<string, IPty>();

  async spawn(
    adapter: CLIAdapter,
    command: string,
    options: SpawnOptions
  ): Promise<ProcessHandle> {
    // Create PTY for interactive processes
    // Manage process lifecycle
    // Handle cleanup on exit
  }

  async kill(handle: ProcessHandle): Promise<void> {
    // Graceful shutdown with timeout
  }
}
```

### Communication Protocol

- **Input**: Commands sent via WebSocket
- **Output**: Streamed via WebSocket with chunking
- **Control**: Process management commands (pause, resume, kill)

## Git Integration

### Architecture

```typescript
interface GitService {
  // Repository operations
  clone(url: string, path: string): Promise<void>;
  init(path: string): Promise<void>;

  // Branch operations
  listBranches(): Promise<Branch[]>;
  createBranch(name: string): Promise<void>;
  checkout(ref: string): Promise<void>;

  // Worktree support
  listWorktrees(): Promise<Worktree[]>;
  addWorktree(path: string, branch: string): Promise<void>;

  // CI/CD
  runCI(config: CIConfig): Promise<CIResult>;
}
```

## MCP Server Integration

### Bridge Architecture

```typescript
class MCPBridge {
  private servers = new Map<string, MCPServerConnection>();

  async connect(config: MCPServerConfig): Promise<void> {
    // Establish connection to MCP server
    // Handle protocol negotiation
  }

  async forward(
    message: MCPMessage,
    target: MCPServerConnection
  ): Promise<MCPResponse> {
    // Message routing and transformation
  }
}
```

## Security Model

### Modes

1. **Safe Mode** (default)
   - Sandboxed execution
   - File system restrictions
   - Network limitations
   - Command whitelist

2. **Dangerous Mode**
   - Full system access
   - No command restrictions
   - Explicit user consent required
   - Audit logging enabled

### Implementation

```typescript
interface SecurityContext {
  mode: 'safe' | 'dangerous';
  restrictions: SecurityRestrictions;
  audit: AuditLogger;

  validateCommand(cmd: string): boolean;
  validateFileAccess(path: string, mode: string): boolean;
}
```

## Data Models

### Core Entities

```typescript
// Project
interface Project {
  id: string;
  name: string;
  path: string;
  gitRemote?: string;
  activeAdapter: string;
  settings: ProjectSettings;
  created: Date;
  lastAccessed: Date;
}

// Session
interface Session {
  id: string;
  projectId: string;
  adapter: string;
  startTime: Date;
  endTime?: Date;
  commands: Command[];
  state: SessionState;
}

// Command History
interface Command {
  id: string;
  sessionId: string;
  input: string;
  output: string[];
  timestamp: Date;
  exitCode?: number;
}
```

## API Specification

### REST Endpoints

```
# Projects
GET    /api/projects
POST   /api/projects
GET    /api/projects/:id
PUT    /api/projects/:id
DELETE /api/projects/:id

# Sessions
POST   /api/sessions
GET    /api/sessions/:id
POST   /api/sessions/:id/commands
DELETE /api/sessions/:id

# Adapters
GET    /api/adapters
POST   /api/adapters/install
GET    /api/adapters/:name/capabilities

# Git
GET    /api/projects/:id/git/status
POST   /api/projects/:id/git/clone
GET    /api/projects/:id/git/branches
POST   /api/projects/:id/git/branches
```

### WebSocket Events

```typescript
// Client → Server
interface ClientEvents {
  'session:create': { projectId: string; adapter: string };
  'command:execute': { sessionId: string; command: string };
  'command:interrupt': { sessionId: string };
  'terminal:resize': { sessionId: string; cols: number; rows: number };
}

// Server → Client
interface ServerEvents {
  'output:data': { sessionId: string; data: string };
  'output:error': { sessionId: string; error: string };
  'session:state': { sessionId: string; state: SessionState };
  'command:complete': { sessionId: string; exitCode: number };
}
```

## Frontend Architecture

### Component Structure

```
src/
├── components/
│   ├── ProjectManager/
│   │   ├── ProjectList.tsx
│   │   ├── ProjectCreate.tsx
│   │   └── ProjectSettings.tsx
│   ├── Terminal/
│   │   ├── TerminalContainer.tsx
│   │   ├── TerminalTabs.tsx
│   │   └── TerminalOutput.tsx
│   ├── GitUI/
│   │   ├── BranchSelector.tsx
│   │   ├── CommitHistory.tsx
│   │   └── WorktreeManager.tsx
│   └── Settings/
│       ├── AdapterManager.tsx
│       ├── SecuritySettings.tsx
│       └── Preferences.tsx
├── services/
│   ├── api.ts
│   ├── websocket.ts
│   └── terminal.ts
└── stores/
    ├── projectStore.ts
    ├── sessionStore.ts
    └── settingsStore.ts
```

### State Management

```typescript
// Zustand store example
interface AppState {
  projects: Project[];
  activeProject: Project | null;
  sessions: Map<string, Session>;
  activeSession: Session | null;

  // Actions
  createProject: (data: CreateProjectData) => Promise<void>;
  selectProject: (id: string) => void;
  executeCommand: (command: string) => Promise<void>;
}
```

## Deployment Architecture

### Container Strategy

```yaml
# docker-compose.yml
services:
  backend:
    build: ./backend
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://...
    volumes:
      - ./projects:/app/projects
      - ./adapters:/app/adapters

  frontend:
    build: ./frontend
    depends_on:
      - backend

  postgres:
    image: postgres:15
    volumes:
      - postgres_data:/var/lib/postgresql/data
```

## Extension Points

1. **CLI Adapters**: Plugin system for new AI tools
2. **Git Providers**: Support for GitHub, GitLab, etc.
3. **CI/CD Runners**: Pluggable CI systems
4. **UI Themes**: Customizable interface
5. **Authentication**: OAuth, SAML, etc.
6. **Export/Import**: Project templates and configurations

## Performance Considerations

1. **Streaming**: Use chunked transfer for large outputs
2. **Caching**: Redis for session state and command history
3. **Connection Pooling**: Reuse CLI process instances
4. **Lazy Loading**: Load adapters on demand
5. **Virtual Scrolling**: For large terminal outputs

## Next Steps

1. Set up monorepo structure
2. Implement core backend services
3. Create adapter interface and examples
4. Build minimal frontend
5. Add git integration
6. Implement security layers
7. Add MCP support
8. Create plugin marketplace
