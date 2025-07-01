import Database from 'better-sqlite3';
import { join } from 'path';
import type { Project, Session, Command, User } from '@vibecode/shared';

export class DatabaseManager {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const path = dbPath || join(process.cwd(), 'vibecode.db');
    this.db = new Database(path);
    this.init();
  }

  private init(): void {
    // Enable foreign keys
    this.db.pragma('foreign_keys = ON');
    
    // Create tables
    this.createTables();
    
    // Create indexes
    this.createIndexes();
  }

  private createTables(): void {
    // Users table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        roles TEXT NOT NULL DEFAULT '[]',
        settings TEXT NOT NULL DEFAULT '{}',
        created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_login TEXT
      )
    `);

    // Projects table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT NOT NULL,
        git_remote TEXT,
        active_adapter TEXT NOT NULL,
        settings TEXT NOT NULL DEFAULT '{}',
        user_id TEXT NOT NULL,
        created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_accessed TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )
    `);

    // Sessions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        adapter TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'pending',
        start_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        end_time TEXT,
        user_id TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects (id),
        FOREIGN KEY (user_id) REFERENCES users (id)
      )
    `);

    // Commands table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS commands (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        input TEXT NOT NULL,
        output TEXT NOT NULL DEFAULT '[]',
        timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        exit_code INTEGER,
        FOREIGN KEY (session_id) REFERENCES sessions (id)
      )
    `);

    // Adapters table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS adapters (
        name TEXT PRIMARY KEY,
        version TEXT NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT true,
        config TEXT NOT NULL DEFAULT '{}',
        installed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Audit log table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        action TEXT NOT NULL,
        resource TEXT NOT NULL,
        details TEXT NOT NULL DEFAULT '{}',
        timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ip_address TEXT,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )
    `);
  }

  private createIndexes(): void {
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects (user_id)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_project_id ON sessions (project_id)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_commands_session_id ON commands (session_id)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log (user_id)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log (timestamp)');
  }

  // User operations
  createUser(user: Omit<User, 'created' | 'lastLogin'>): void {
    const stmt = this.db.prepare(`
      INSERT INTO users (id, username, email, password_hash, roles, settings)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      user.id,
      user.username,
      user.email,
      user.passwordHash,
      JSON.stringify(user.roles),
      JSON.stringify(user.settings)
    );
  }

  getUserById(id: string): User | null {
    const stmt = this.db.prepare('SELECT * FROM users WHERE id = ?');
    const row = stmt.get(id) as any;
    
    if (!row) return null;
    
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      passwordHash: row.password_hash,
      roles: JSON.parse(row.roles),
      settings: JSON.parse(row.settings),
      created: new Date(row.created),
      lastLogin: row.last_login ? new Date(row.last_login) : undefined,
    };
  }

  getUserByUsername(username: string): User | null {
    const stmt = this.db.prepare('SELECT * FROM users WHERE username = ?');
    const row = stmt.get(username) as any;
    
    if (!row) return null;
    
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      passwordHash: row.password_hash,
      roles: JSON.parse(row.roles),
      settings: JSON.parse(row.settings),
      created: new Date(row.created),
      lastLogin: row.last_login ? new Date(row.last_login) : undefined,
    };
  }

  // Project operations
  createProject(project: Omit<Project, 'created' | 'lastAccessed'>, userId: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO projects (id, name, path, git_remote, active_adapter, settings, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      project.id,
      project.name,
      project.path,
      project.gitRemote || null,
      project.activeAdapter,
      JSON.stringify(project.settings),
      userId
    );
  }

  getProjectsByUserId(userId: string): Project[] {
    const stmt = this.db.prepare('SELECT * FROM projects WHERE user_id = ? ORDER BY last_accessed DESC');
    const rows = stmt.all(userId) as any[];
    
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      path: row.path,
      gitRemote: row.git_remote,
      activeAdapter: row.active_adapter,
      settings: JSON.parse(row.settings),
      created: new Date(row.created),
      lastAccessed: new Date(row.last_accessed),
    }));
  }

  updateProjectAccess(projectId: string): void {
    const stmt = this.db.prepare('UPDATE projects SET last_accessed = CURRENT_TIMESTAMP WHERE id = ?');
    stmt.run(projectId);
  }

  // Session operations
  createSession(session: Omit<Session, 'startTime' | 'commands'>, userId: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO sessions (id, project_id, adapter, state, user_id)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    stmt.run(session.id, session.projectId, session.adapter, session.state, userId);
  }

  getSessionById(id: string): Session | null {
    const stmt = this.db.prepare('SELECT * FROM sessions WHERE id = ?');
    const row = stmt.get(id) as any;
    
    if (!row) return null;
    
    // Get commands for this session
    const commandsStmt = this.db.prepare('SELECT * FROM commands WHERE session_id = ? ORDER BY timestamp');
    const commandRows = commandsStmt.all(id) as any[];
    
    const commands = commandRows.map(cmd => ({
      id: cmd.id,
      sessionId: cmd.session_id,
      input: cmd.input,
      output: JSON.parse(cmd.output),
      timestamp: new Date(cmd.timestamp),
      exitCode: cmd.exit_code,
    }));
    
    return {
      id: row.id,
      projectId: row.project_id,
      adapter: row.adapter,
      state: row.state,
      startTime: new Date(row.start_time),
      endTime: row.end_time ? new Date(row.end_time) : undefined,
      commands,
    };
  }

  updateSessionState(id: string, state: string): void {
    const stmt = this.db.prepare('UPDATE sessions SET state = ? WHERE id = ?');
    stmt.run(state, id);
  }

  // Command operations
  createCommand(command: Omit<Command, 'timestamp'>): void {
    const stmt = this.db.prepare(`
      INSERT INTO commands (id, session_id, input, output, exit_code)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      command.id,
      command.sessionId,
      command.input,
      JSON.stringify(command.output),
      command.exitCode || null
    );
  }

  // Audit operations
  createAuditEntry(entry: {
    id: string;
    userId: string;
    action: string;
    resource: string;
    details: Record<string, unknown>;
    ipAddress?: string;
  }): void {
    const stmt = this.db.prepare(`
      INSERT INTO audit_log (id, user_id, action, resource, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      entry.id,
      entry.userId,
      entry.action,
      entry.resource,
      JSON.stringify(entry.details),
      entry.ipAddress || null
    );
  }

  close(): void {
    this.db.close();
  }
}

// Export singleton instance
export const db = new DatabaseManager();