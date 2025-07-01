export interface Project {
  id: string;
  name: string;
  path: string;
  gitRemote?: string;
  activeAdapter: string;
  settings: ProjectSettings;
  created: Date;
  lastAccessed: Date;
}

export interface ProjectSettings {
  defaultAdapter: string;
  dangerousMode: boolean;
  autoCommit: boolean;
  [key: string]: unknown;
}

export interface Session {
  id: string;
  projectId: string;
  adapter: string;
  startTime: Date;
  endTime?: Date;
  commands: Command[];
  state: SessionState;
}

export enum SessionState {
  PENDING = 'pending',
  STARTING = 'starting',
  RUNNING = 'running',
  PAUSED = 'paused',
  STOPPING = 'stopping',
  STOPPED = 'stopped',
  FAILED = 'failed',
}

export interface Command {
  id: string;
  sessionId: string;
  input: string;
  output: OutputChunk[];
  timestamp: Date;
  exitCode?: number;
}

export interface OutputChunk {
  type: 'stdout' | 'stderr' | 'system';
  data: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface ProcessHandle {
  id: string;
  pid: number;
  adapter: string;
  startTime: Date;
}

export interface User {
  id: string;
  username: string;
  email: string;
  roles: string[];
  settings: UserSettings;
  created: Date;
  lastLogin?: Date;
}

export interface UserSettings {
  theme: 'light' | 'dark';
  terminalSettings: TerminalSettings;
  [key: string]: unknown;
}

export interface TerminalSettings {
  fontSize: number;
  fontFamily: string;
  cursorStyle: 'block' | 'underline' | 'bar';
  scrollback: number;
}

export interface GitBranch {
  name: string;
  current: boolean;
  commit: string;
  remote?: string;
}

export interface GitWorktree {
  path: string;
  branch: string;
  commit: string;
  locked: boolean;
}

export interface GitStatus {
  current: string;
  tracking?: string;
  ahead: number;
  behind: number;
  staged: string[];
  modified: string[];
  not_added: string[];
  deleted: string[];
  renamed: string[];
  conflicted: string[];
  created: string[];
  isClean: boolean;
}

export interface GitCommit {
  hash: string;
  date: string;
  message: string;
  author: string;
  email: string;
  refs?: string;
}

export interface GitRemote {
  name: string;
  refs: {
    fetch: string;
    push: string;
  };
}

export interface GitRepository {
  path: string;
  isRepo: boolean;
  currentBranch?: string;
  remotes: GitRemote[];
  status?: GitStatus;
}

export interface GitOperationResult {
  success: boolean;
  data?: any;
  error?: string;
}

export enum Permission {
  PROJECT_CREATE = 'project:create',
  PROJECT_READ = 'project:read',
  PROJECT_WRITE = 'project:write',
  PROJECT_DELETE = 'project:delete',
  SESSION_CREATE = 'session:create',
  SESSION_EXECUTE = 'session:execute',
  SESSION_DANGEROUS = 'session:dangerous',
  ADAPTER_INSTALL = 'adapter:install',
  ADAPTER_CONFIGURE = 'adapter:configure',
  SYSTEM_ADMIN = 'system:admin',
}

export interface SecurityContext {
  userId: string;
  permissions: Permission[];
  dangerousMode: boolean;
  restrictions: SecurityRestrictions;
  auditEnabled: boolean;
}

export interface SecurityRestrictions {
  allowedPaths: string[];
  deniedPaths: string[];
  allowedCommands: string[];
  blockedCommands: string[];
  maxMemory: number;
  maxCPU: number;
  timeout: number;
}