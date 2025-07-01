// Mock database implementation - replace with real sqlite3 later
import { join } from 'path';
import type { Project, Session, Command, User } from '@vibecode/shared';

export class DatabaseManager {
  private projects: Map<string, Project> = new Map();
  private sessions: Map<string, Session> = new Map();
  private users: Map<string, User> = new Map();

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
    return Array.from(this.projects.values()).filter(p => (p as any).userId === userId);
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
    return Array.from(this.sessions.values()).filter(s => s.projectId === projectId);
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

  close(): void {
    // Mock close
    console.log('Mock database closed');
  }
}

// Create and export database instance
export const db = new DatabaseManager();