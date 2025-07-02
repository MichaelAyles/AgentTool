// Mock database implementation - replace with real sqlite3 later
import { join } from 'path';
import type { Project, Session, Command, User } from '@vibecode/shared';
import type {
  User as AuthUser,
  Session as AuthSession,
  AuthProvider,
} from '../auth/types.js';

export class DatabaseManager {
  private projects: Map<string, Project> = new Map();
  private sessions: Map<string, Session> = new Map();
  private users: Map<string, User> = new Map();

  // Auth-specific storage
  private authUsers: Map<string, AuthUser> = new Map();
  private authSessions: Map<string, AuthSession> = new Map();
  private userPasswords: Map<string, string> = new Map();
  private providerMappings: Map<string, string> = new Map(); // providerId -> userId

  constructor(dbPath?: string) {
    // Mock implementation - no actual file operations
    console.log(`Mock database initialized at ${dbPath || 'memory'}`);
    this.init();
  }

  private init(): void {
    // Mock initialization
    console.log('Mock database tables initialized');
  }

  // Project operations
  createProject(project: Project, userId: string): void {
    this.projects.set(project.id, { ...project, userId });
  }

  getProject(id: string): Project | undefined {
    return this.projects.get(id);
  }

  getProjectsByUserId(userId: string): Project[] {
    return Array.from(this.projects.values()).filter(
      p => (p as any).userId === userId
    );
  }

  updateProject(id: string, updates: Partial<Project>): boolean {
    const project = this.projects.get(id);
    if (project) {
      this.projects.set(id, { ...project, ...updates });
      return true;
    }
    return false;
  }

  deleteProject(id: string): boolean {
    return this.projects.delete(id);
  }

  // Session operations
  createSession(session: Session): void {
    this.sessions.set(session.id, session);
  }

  getSession(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  getSessionsByProjectId(projectId: string): Session[] {
    return Array.from(this.sessions.values()).filter(
      s => s.projectId === projectId
    );
  }

  updateSession(id: string, updates: Partial<Session>): boolean {
    const session = this.sessions.get(id);
    if (session) {
      this.sessions.set(id, { ...session, ...updates });
      return true;
    }
    return false;
  }

  deleteSession(id: string): boolean {
    return this.sessions.delete(id);
  }

  // User operations (mock)
  createUser(user: User): void {
    this.users.set(user.id, user);
  }

  getUser(id: string): User | undefined {
    return this.users.get(id);
  }

  getUserByEmail(email: string): User | undefined {
    return Array.from(this.users.values()).find(u => u.email === email);
  }

  // Authentication user operations
  createUser(user: AuthUser): void {
    this.authUsers.set(user.id, user);
  }

  getUserById(id: string): AuthUser | undefined {
    return this.authUsers.get(id);
  }

  getUserByEmail(email: string): AuthUser | undefined {
    return Array.from(this.authUsers.values()).find(u => u.email === email);
  }

  getUserByUsername(username: string): AuthUser | undefined {
    return Array.from(this.authUsers.values()).find(
      u => u.username === username
    );
  }

  getUserByProviderId(
    provider: string,
    providerId: string
  ): AuthUser | undefined {
    const key = `${provider}:${providerId}`;
    const userId = this.providerMappings.get(key);
    return userId ? this.authUsers.get(userId) : undefined;
  }

  updateUserLastLogin(userId: string): void {
    const user = this.authUsers.get(userId);
    if (user) {
      this.authUsers.set(userId, { ...user, lastLogin: new Date() });
    }
  }

  linkAuthProvider(userId: string, provider: AuthProvider): void {
    const user = this.authUsers.get(userId);
    if (user) {
      const updatedProviders = [...user.providers, provider];
      this.authUsers.set(userId, { ...user, providers: updatedProviders });

      // Add to provider mapping
      const key = `${provider.provider}:${provider.providerId}`;
      this.providerMappings.set(key, userId);
    }
  }

  // Password operations
  getUserPasswordHash(userId: string): string | undefined {
    return this.userPasswords.get(userId);
  }

  updateUserPassword(userId: string, passwordHash: string): void {
    this.userPasswords.set(userId, passwordHash);
  }

  getAllUsers(): AuthUser[] {
    return Array.from(this.authUsers.values());
  }

  updateUserRole(userId: string, role: string): void {
    const user = this.authUsers.get(userId);
    if (user) {
      this.authUsers.set(userId, { ...user, role: role as any });
    }
  }

  updateUserSettings(userId: string, settings: any): void {
    const user = this.authUsers.get(userId);
    if (user) {
      this.authUsers.set(userId, {
        ...user,
        settings: { ...user.settings, ...settings },
      });
    }
  }

  // Session operations for authentication
  createSession(session: AuthSession): void {
    this.authSessions.set(session.id, session);
  }

  getSession(sessionId: string): AuthSession | undefined {
    return this.authSessions.get(sessionId);
  }

  updateSessionActivity(sessionId: string): void {
    const session = this.authSessions.get(sessionId);
    if (session) {
      this.authSessions.set(sessionId, {
        ...session,
        lastActivity: new Date(),
      });
    }
  }

  revokeSession(sessionId: string): void {
    this.authSessions.delete(sessionId);
  }

  revokeAllUserSessions(userId: string): void {
    const sessionsToDelete: string[] = [];

    for (const [sessionId, session] of this.authSessions.entries()) {
      if (session.userId === userId) {
        sessionsToDelete.push(sessionId);
      }
    }

    sessionsToDelete.forEach(sessionId => this.authSessions.delete(sessionId));
  }

  close(): void {
    // Mock close
    console.log('Mock database closed');
  }
}

// Create and export database instance
export const db = new DatabaseManager();

// Type alias for easier import
export type Database = DatabaseManager;
