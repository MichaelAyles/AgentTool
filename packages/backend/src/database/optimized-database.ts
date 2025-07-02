// import { Database as SQLiteDatabase } from 'better-sqlite3';
import { join } from 'path';
import type { Project, Session, Command, User } from '@vibecode/shared';
import type {
  User as AuthUser,
  Session as AuthSession,
  AuthProvider,
} from '../auth/types.js';
import { structuredLogger } from '../middleware/logging.js';

export interface QueryMetrics {
  queryCount: number;
  totalTime: number;
  averageTime: number;
  slowQueries: Array<{
    query: string;
    time: number;
    timestamp: Date;
  }>;
  cacheHits: number;
  cacheMisses: number;
  indexUsage: Map<string, number>;
}

export interface DatabaseConfig {
  path: string;
  enableWAL: boolean;
  enableForeignKeys: boolean;
  cacheSize: number;
  enableQueryMetrics: boolean;
  slowQueryThreshold: number;
  autoVacuum: boolean;
  journalMode: 'DELETE' | 'TRUNCATE' | 'PERSIST' | 'MEMORY' | 'WAL' | 'OFF';
  synchronous: 'OFF' | 'NORMAL' | 'FULL' | 'EXTRA';
}

export class OptimizedDatabaseManager {
  private db: any; // SQLiteDatabase placeholder
  private config: DatabaseConfig;
  private queryMetrics: QueryMetrics;
  private queryCache = new Map<
    string,
    { result: any; timestamp: number; ttl: number }
  >();
  private preparedStatements = new Map<string, any>();

  constructor(config: Partial<DatabaseConfig> = {}) {
    this.config = {
      path: config.path || join(process.cwd(), 'vibecode.db'),
      enableWAL: config.enableWAL ?? true,
      enableForeignKeys: config.enableForeignKeys ?? true,
      cacheSize: config.cacheSize ?? 10000,
      enableQueryMetrics: config.enableQueryMetrics ?? true,
      slowQueryThreshold: config.slowQueryThreshold ?? 100, // 100ms
      autoVacuum: config.autoVacuum ?? true,
      journalMode: config.journalMode ?? 'WAL',
      synchronous: config.synchronous ?? 'NORMAL',
    };

    this.queryMetrics = this.initializeMetrics();
    this.initializeDatabase();
  }

  private initializeDatabase(): void {
    try {
      // Mock database initialization
      this.db = {
        pragma: () => {},
        exec: () => {},
        prepare: (sql: string) => ({
          all: (...params: any[]) => [],
          run: (...params: any[]) => ({ changes: 1 }),
          get: (...params: any[]) => ({}),
        }),
        close: () => {},
      };

      // Mock configure SQLite for optimal performance
      this.configureSQLite();

      // Mock create tables and indexes
      this.createTables();
      this.createIndexes();

      // Mock prepare commonly used statements
      this.prepareStatements();

      structuredLogger.info('Mock optimized database initialized', {
        path: this.config.path,
        journalMode: this.config.journalMode,
        cacheSize: this.config.cacheSize,
      });
    } catch (error) {
      structuredLogger.error('Failed to initialize database', error as Error);
      throw error;
    }
  }

  private configureSQLite(): void {
    // Enable WAL mode for better concurrency
    if (this.config.enableWAL) {
      this.db.pragma(`journal_mode = ${this.config.journalMode}`);
    }

    // Enable foreign keys
    if (this.config.enableForeignKeys) {
      this.db.pragma('foreign_keys = ON');
    }

    // Set cache size
    this.db.pragma(`cache_size = ${this.config.cacheSize}`);

    // Set synchronous mode
    this.db.pragma(`synchronous = ${this.config.synchronous}`);

    // Enable auto vacuum
    if (this.config.autoVacuum) {
      this.db.pragma('auto_vacuum = INCREMENTAL');
    }

    // Optimize for faster reads/writes
    this.db.pragma('temp_store = memory');
    this.db.pragma('mmap_size = 268435456'); // 256MB
  }

  private createTables(): void {
    const tables = [
      // Users table
      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT,
        role TEXT NOT NULL DEFAULT 'user',
        is_active BOOLEAN DEFAULT 1,
        email_verified BOOLEAN DEFAULT 0,
        settings TEXT DEFAULT '{}',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_login INTEGER
      )`,

      // Auth providers table
      `CREATE TABLE IF NOT EXISTS auth_providers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        provider_data TEXT DEFAULT '{}',
        created_at INTEGER NOT NULL,
        UNIQUE(provider, provider_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`,

      // Sessions table
      `CREATE TABLE IF NOT EXISTS auth_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        created_at INTEGER NOT NULL,
        last_activity INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        is_active BOOLEAN DEFAULT 1,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`,

      // Projects table
      `CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        path TEXT NOT NULL,
        active_adapter TEXT NOT NULL,
        git_remote TEXT,
        description TEXT,
        settings TEXT DEFAULT '{}',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_accessed INTEGER,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`,

      // Process sessions table
      `CREATE TABLE IF NOT EXISTS process_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        project_id TEXT,
        adapter_name TEXT NOT NULL,
        command TEXT,
        working_directory TEXT,
        status TEXT NOT NULL DEFAULT 'created',
        start_time INTEGER NOT NULL,
        end_time INTEGER,
        exit_code INTEGER,
        resource_usage TEXT DEFAULT '{}',
        dangerous_mode BOOLEAN DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
      )`,

      // Commands table for session history
      `CREATE TABLE IF NOT EXISTS commands (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        command TEXT NOT NULL,
        output TEXT,
        error_output TEXT,
        exit_code INTEGER,
        duration INTEGER,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES process_sessions(id) ON DELETE CASCADE
      )`,

      // Audit logs table
      `CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        session_id TEXT,
        action TEXT NOT NULL,
        resource_type TEXT,
        resource_id TEXT,
        ip_address TEXT,
        user_agent TEXT,
        outcome TEXT NOT NULL,
        severity TEXT NOT NULL,
        details TEXT DEFAULT '{}',
        timestamp INTEGER NOT NULL,
        INDEX(user_id, timestamp),
        INDEX(action, timestamp),
        INDEX(resource_type, resource_id)
      )`,

      // Performance metrics table
      `CREATE TABLE IF NOT EXISTS performance_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        metric_type TEXT NOT NULL,
        metric_name TEXT NOT NULL,
        value REAL NOT NULL,
        tags TEXT DEFAULT '{}',
        timestamp INTEGER NOT NULL,
        INDEX(metric_type, metric_name, timestamp),
        INDEX(timestamp)
      )`,

      // Configuration settings table
      `CREATE TABLE IF NOT EXISTS system_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        data_type TEXT NOT NULL DEFAULT 'string',
        updated_at INTEGER NOT NULL,
        updated_by TEXT
      )`,
    ];

    for (const table of tables) {
      this.db.exec(table);
    }
  }

  private createIndexes(): void {
    const indexes = [
      // User indexes
      'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)',
      'CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)',
      'CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)',
      'CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at)',
      'CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login)',

      // Auth provider indexes
      'CREATE INDEX IF NOT EXISTS idx_auth_providers_user_id ON auth_providers(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_auth_providers_provider ON auth_providers(provider, provider_id)',

      // Session indexes
      'CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions(expires_at)',
      'CREATE INDEX IF NOT EXISTS idx_auth_sessions_last_activity ON auth_sessions(last_activity)',
      'CREATE INDEX IF NOT EXISTS idx_auth_sessions_active ON auth_sessions(is_active, expires_at)',

      // Project indexes
      'CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_projects_name ON projects(user_id, name)',
      'CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects(updated_at)',
      'CREATE INDEX IF NOT EXISTS idx_projects_last_accessed ON projects(last_accessed)',
      'CREATE INDEX IF NOT EXISTS idx_projects_adapter ON projects(active_adapter)',

      // Process session indexes
      'CREATE INDEX IF NOT EXISTS idx_process_sessions_user_id ON process_sessions(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_process_sessions_project_id ON process_sessions(project_id)',
      'CREATE INDEX IF NOT EXISTS idx_process_sessions_status ON process_sessions(status)',
      'CREATE INDEX IF NOT EXISTS idx_process_sessions_start_time ON process_sessions(start_time)',
      'CREATE INDEX IF NOT EXISTS idx_process_sessions_adapter ON process_sessions(adapter_name)',
      'CREATE INDEX IF NOT EXISTS idx_process_sessions_dangerous ON process_sessions(dangerous_mode)',

      // Command indexes
      'CREATE INDEX IF NOT EXISTS idx_commands_session_id ON commands(session_id)',
      'CREATE INDEX IF NOT EXISTS idx_commands_timestamp ON commands(timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_commands_session_timestamp ON commands(session_id, timestamp)',

      // Audit log indexes
      'CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id_timestamp ON audit_logs(user_id, timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_audit_logs_action_timestamp ON audit_logs(action, timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id)',
      'CREATE INDEX IF NOT EXISTS idx_audit_logs_severity_timestamp ON audit_logs(severity, timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_audit_logs_outcome ON audit_logs(outcome)',

      // Performance metrics indexes
      'CREATE INDEX IF NOT EXISTS idx_performance_metrics_type_name ON performance_metrics(metric_type, metric_name)',
      'CREATE INDEX IF NOT EXISTS idx_performance_metrics_timestamp ON performance_metrics(timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_performance_metrics_type_timestamp ON performance_metrics(metric_type, timestamp)',
    ];

    for (const index of indexes) {
      this.db.exec(index);
    }
  }

  private prepareStatements(): void {
    // User operations
    this.preparedStatements.set(
      'getUserById',
      this.db.prepare('SELECT * FROM users WHERE id = ?')
    );
    this.preparedStatements.set(
      'getUserByEmail',
      this.db.prepare('SELECT * FROM users WHERE email = ?')
    );
    this.preparedStatements.set(
      'getUserByUsername',
      this.db.prepare('SELECT * FROM users WHERE username = ?')
    );
    this.preparedStatements.set(
      'createUser',
      this.db
        .prepare(`INSERT INTO users (id, username, email, password_hash, role, created_at, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?)`)
    );
    this.preparedStatements.set(
      'updateUserLastLogin',
      this.db.prepare('UPDATE users SET last_login = ? WHERE id = ?')
    );

    // Session operations
    this.preparedStatements.set(
      'createSession',
      this.db
        .prepare(`INSERT INTO auth_sessions (id, user_id, ip_address, user_agent, created_at, last_activity, expires_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?)`)
    );
    this.preparedStatements.set(
      'getSession',
      this.db.prepare(
        'SELECT * FROM auth_sessions WHERE id = ? AND is_active = 1 AND expires_at > ?'
      )
    );
    this.preparedStatements.set(
      'updateSessionActivity',
      this.db.prepare('UPDATE auth_sessions SET last_activity = ? WHERE id = ?')
    );
    this.preparedStatements.set(
      'revokeSession',
      this.db.prepare('UPDATE auth_sessions SET is_active = 0 WHERE id = ?')
    );

    // Project operations
    this.preparedStatements.set(
      'createProject',
      this.db
        .prepare(`INSERT INTO projects (id, user_id, name, path, active_adapter, git_remote, description, created_at, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    );
    this.preparedStatements.set(
      'getProjectsByUserId',
      this.db.prepare(
        'SELECT * FROM projects WHERE user_id = ? ORDER BY last_accessed DESC NULLS LAST, updated_at DESC'
      )
    );
    this.preparedStatements.set(
      'getProject',
      this.db.prepare('SELECT * FROM projects WHERE id = ?')
    );
    this.preparedStatements.set(
      'updateProjectAccess',
      this.db.prepare('UPDATE projects SET last_accessed = ? WHERE id = ?')
    );

    // Process session operations
    this.preparedStatements.set(
      'createProcessSession',
      this.db
        .prepare(`INSERT INTO process_sessions (id, user_id, project_id, adapter_name, command, working_directory, status, start_time, created_at, updated_at, dangerous_mode)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    );
    this.preparedStatements.set(
      'getProcessSession',
      this.db.prepare('SELECT * FROM process_sessions WHERE id = ?')
    );
    this.preparedStatements.set(
      'updateProcessSessionStatus',
      this.db.prepare(
        'UPDATE process_sessions SET status = ?, updated_at = ? WHERE id = ?'
      )
    );
    this.preparedStatements.set(
      'getActiveProcessSessions',
      this.db.prepare(
        "SELECT * FROM process_sessions WHERE status IN ('running', 'paused') ORDER BY start_time DESC"
      )
    );

    // Command operations
    this.preparedStatements.set(
      'insertCommand',
      this.db
        .prepare(`INSERT INTO commands (session_id, command, output, error_output, exit_code, duration, timestamp)
                       VALUES (?, ?, ?, ?, ?, ?, ?)`)
    );
    this.preparedStatements.set(
      'getSessionCommands',
      this.db.prepare(
        'SELECT * FROM commands WHERE session_id = ? ORDER BY timestamp DESC LIMIT ?'
      )
    );

    // Audit log operations
    this.preparedStatements.set(
      'insertAuditLog',
      this.db
        .prepare(`INSERT INTO audit_logs (id, user_id, session_id, action, resource_type, resource_id, ip_address, user_agent, outcome, severity, details, timestamp)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    );
    this.preparedStatements.set(
      'getAuditLogs',
      this.db.prepare(
        'SELECT * FROM audit_logs WHERE timestamp >= ? ORDER BY timestamp DESC LIMIT ?'
      )
    );
  }

  private executeQuery<T>(
    queryName: string,
    params: any[] = [],
    useCache = false,
    cacheTTL = 60000
  ): T {
    const startTime = Date.now();
    const cacheKey = useCache ? `${queryName}:${JSON.stringify(params)}` : null;

    // Check cache first
    if (cacheKey && this.queryCache.has(cacheKey)) {
      const cached = this.queryCache.get(cacheKey)!;
      if (Date.now() - cached.timestamp < cached.ttl) {
        this.queryMetrics.cacheHits++;
        return cached.result;
      } else {
        this.queryCache.delete(cacheKey);
      }
    }

    try {
      const stmt = this.preparedStatements.get(queryName);
      if (!stmt) {
        throw new Error(`Prepared statement not found: ${queryName}`);
      }

      const result = stmt.all ? stmt.all(...params) : stmt.run(...params);
      const executionTime = Date.now() - startTime;

      // Update metrics
      if (this.config.enableQueryMetrics) {
        this.updateQueryMetrics(queryName, executionTime);
      }

      // Cache result if requested
      if (cacheKey && useCache) {
        this.queryCache.set(cacheKey, {
          result,
          timestamp: Date.now(),
          ttl: cacheTTL,
        });
        this.queryMetrics.cacheMisses++;
      }

      return result;
    } catch (error) {
      structuredLogger.error('Query execution failed', error as Error, {
        queryName,
        params,
        executionTime: Date.now() - startTime,
      });
      throw error;
    }
  }

  private updateQueryMetrics(queryName: string, executionTime: number): void {
    this.queryMetrics.queryCount++;
    this.queryMetrics.totalTime += executionTime;
    this.queryMetrics.averageTime =
      this.queryMetrics.totalTime / this.queryMetrics.queryCount;

    // Track index usage
    const currentUsage = this.queryMetrics.indexUsage.get(queryName) || 0;
    this.queryMetrics.indexUsage.set(queryName, currentUsage + 1);

    // Track slow queries
    if (executionTime > this.config.slowQueryThreshold) {
      this.queryMetrics.slowQueries.push({
        query: queryName,
        time: executionTime,
        timestamp: new Date(),
      });

      // Keep only recent slow queries
      if (this.queryMetrics.slowQueries.length > 100) {
        this.queryMetrics.slowQueries.shift();
      }

      structuredLogger.warn('Slow query detected', {
        queryName,
        executionTime,
        threshold: this.config.slowQueryThreshold,
      });
    }
  }

  // Public API methods

  // User operations
  createUser(user: AuthUser): void {
    const now = Date.now();
    this.executeQuery('createUser', [
      user.id,
      user.username,
      user.email,
      null, // password_hash will be set separately
      user.role,
      now,
      now,
    ]);
  }

  getUserById(id: string): AuthUser | undefined {
    const result = this.executeQuery<any[]>('getUserById', [id], true);
    return result.length > 0 ? this.mapUserFromDB(result[0]) : undefined;
  }

  getUserByEmail(email: string): AuthUser | undefined {
    const result = this.executeQuery<any[]>('getUserByEmail', [email], true);
    return result.length > 0 ? this.mapUserFromDB(result[0]) : undefined;
  }

  getUserByUsername(username: string): AuthUser | undefined {
    const result = this.executeQuery<any[]>(
      'getUserByUsername',
      [username],
      true
    );
    return result.length > 0 ? this.mapUserFromDB(result[0]) : undefined;
  }

  updateUserLastLogin(userId: string): void {
    this.executeQuery('updateUserLastLogin', [Date.now(), userId]);
  }

  // Session operations
  createSession(session: AuthSession): void {
    this.executeQuery('createSession', [
      session.id,
      session.userId,
      session.ipAddress,
      session.userAgent,
      session.createdAt.getTime(),
      session.lastActivity.getTime(),
      session.expiresAt.getTime(),
    ]);
  }

  getSession(sessionId: string): AuthSession | undefined {
    const result = this.executeQuery<any[]>(
      'getSession',
      [sessionId, Date.now()],
      true
    );
    return result.length > 0 ? this.mapSessionFromDB(result[0]) : undefined;
  }

  updateSessionActivity(sessionId: string): void {
    this.executeQuery('updateSessionActivity', [Date.now(), sessionId]);
  }

  revokeSession(sessionId: string): void {
    this.executeQuery('revokeSession', [sessionId]);
  }

  // Project operations
  createProject(project: Project, userId: string): void {
    const now = Date.now();
    this.executeQuery('createProject', [
      project.id,
      userId,
      project.name,
      project.path,
      project.activeAdapter,
      project.gitRemote || null,
      project.description || null,
      now,
      now,
    ]);
  }

  getProjectsByUserId(userId: string): Project[] {
    const result = this.executeQuery<any[]>(
      'getProjectsByUserId',
      [userId],
      true,
      30000
    );
    return result.map(row => this.mapProjectFromDB(row));
  }

  getProject(id: string): Project | undefined {
    const result = this.executeQuery<any[]>('getProject', [id], true);
    if (result.length > 0) {
      // Update last accessed time
      this.executeQuery('updateProjectAccess', [Date.now(), id]);
      return this.mapProjectFromDB(result[0]);
    }
    return undefined;
  }

  // Analytics and performance methods
  getQueryMetrics(): QueryMetrics {
    return { ...this.queryMetrics };
  }

  clearQueryCache(): void {
    this.queryCache.clear();
    structuredLogger.info('Query cache cleared');
  }

  optimizeDatabase(): void {
    const startTime = Date.now();

    // Run ANALYZE to update statistics
    this.db.exec('ANALYZE');

    // Incremental vacuum
    this.db.exec('PRAGMA incremental_vacuum');

    // Optimize
    this.db.exec('PRAGMA optimize');

    const duration = Date.now() - startTime;
    structuredLogger.info('Database optimization completed', { duration });
  }

  getTableSizes(): Record<string, number> {
    const tables = [
      'users',
      'auth_providers',
      'auth_sessions',
      'projects',
      'process_sessions',
      'commands',
      'audit_logs',
      'performance_metrics',
    ];

    const sizes: Record<string, number> = {};

    for (const table of tables) {
      const result = this.db
        .prepare(`SELECT COUNT(*) as count FROM ${table}`)
        .get() as any;
      sizes[table] = result.count;
    }

    return sizes;
  }

  getDatabaseInfo(): any {
    return {
      path: this.config.path,
      pageSize: this.db.pragma('page_size', { simple: true }),
      pageCount: this.db.pragma('page_count', { simple: true }),
      cacheSize: this.db.pragma('cache_size', { simple: true }),
      journalMode: this.db.pragma('journal_mode', { simple: true }),
      synchronous: this.db.pragma('synchronous', { simple: true }),
      foreignKeys: this.db.pragma('foreign_keys', { simple: true }),
      metrics: this.queryMetrics,
      tableSizes: this.getTableSizes(),
    };
  }

  // Private mapping methods
  private mapUserFromDB(row: any): AuthUser {
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      role: row.role,
      isActive: Boolean(row.is_active),
      emailVerified: Boolean(row.email_verified),
      settings: JSON.parse(row.settings || '{}'),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      lastLogin: row.last_login ? new Date(row.last_login) : undefined,
      providers: [], // Would need separate query for providers
    };
  }

  private mapSessionFromDB(row: any): AuthSession {
    return {
      id: row.id,
      userId: row.user_id,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      createdAt: new Date(row.created_at),
      lastActivity: new Date(row.last_activity),
      expiresAt: new Date(row.expires_at),
    };
  }

  private mapProjectFromDB(row: any): Project {
    return {
      id: row.id,
      name: row.name,
      path: row.path,
      activeAdapter: row.active_adapter,
      gitRemote: row.git_remote,
      description: row.description,
      settings: JSON.parse(row.settings || '{}'),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private initializeMetrics(): QueryMetrics {
    return {
      queryCount: 0,
      totalTime: 0,
      averageTime: 0,
      slowQueries: [],
      cacheHits: 0,
      cacheMisses: 0,
      indexUsage: new Map(),
    };
  }

  close(): void {
    this.db.close();
    structuredLogger.info('Database connection closed');
  }
}

// Factory function for easy initialization
export function createOptimizedDatabase(
  config?: Partial<DatabaseConfig>
): OptimizedDatabaseManager {
  return new OptimizedDatabaseManager(config);
}

// Export default instance for backward compatibility
export const optimizedDb = createOptimizedDatabase();
