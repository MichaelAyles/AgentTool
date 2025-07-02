import { join } from 'path';
import { homedir } from 'os';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';

export interface Session {
  id: string;
  uuid: string;
  created_at: string;
  last_active: string;
  status: 'active' | 'inactive' | 'terminated';
  metadata?: string;
}

export class SessionDatabase {
  private dbPath: string;
  private dbFile: string;
  private sessions: Map<string, Session> = new Map();

  constructor() {
    // Store database in user's home directory
    const dbDir = join(homedir(), '.vibe-coding');
    mkdirSync(dbDir, { recursive: true });
    this.dbPath = dbDir;
    this.dbFile = join(dbDir, 'sessions.json');
    
    this.loadSessions();
  }

  private loadSessions(): void {
    try {
      if (existsSync(this.dbFile)) {
        const data = readFileSync(this.dbFile, 'utf8');
        const sessionsArray = JSON.parse(data) as Session[];
        
        for (const session of sessionsArray) {
          this.sessions.set(session.uuid, session);
        }
        
        console.log(`📚 Loaded ${this.sessions.size} sessions from database`);
      }
    } catch (error) {
      console.error('Failed to load sessions:', error);
      // Continue with empty sessions
    }
  }

  private saveSessions(): void {
    try {
      const sessionsArray = Array.from(this.sessions.values());
      writeFileSync(this.dbFile, JSON.stringify(sessionsArray, null, 2), 'utf8');
    } catch (error) {
      console.error('Failed to save sessions:', error);
    }
  }

  createSession(uuid: string, metadata?: any): Session {
    const session: Session = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      uuid,
      created_at: new Date().toISOString(),
      last_active: new Date().toISOString(),
      status: 'active',
      metadata: metadata ? JSON.stringify(metadata) : undefined
    };
    
    this.sessions.set(uuid, session);
    this.saveSessions();
    
    return session;
  }

  getSessionByUuid(uuid: string): Session | null {
    return this.sessions.get(uuid) || null;
  }

  updateSessionActivity(uuid: string): void {
    const session = this.sessions.get(uuid);
    if (session) {
      session.last_active = new Date().toISOString();
      this.saveSessions();
    }
  }

  updateSessionStatus(uuid: string, status: Session['status']): void {
    const session = this.sessions.get(uuid);
    if (session) {
      session.status = status;
      session.last_active = new Date().toISOString();
      this.saveSessions();
    }
  }

  getActiveSessions(): Session[] {
    return Array.from(this.sessions.values())
      .filter(session => session.status === 'active')
      .sort((a, b) => new Date(b.last_active).getTime() - new Date(a.last_active).getTime());
  }

  cleanupOldSessions(olderThanHours: number = 24): void {
    const cutoffTime = new Date(Date.now() - (olderThanHours * 60 * 60 * 1000));
    let cleanedCount = 0;
    
    for (const session of this.sessions.values()) {
      if (session.status === 'active' && new Date(session.last_active) < cutoffTime) {
        session.status = 'terminated';
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} old sessions`);
      this.saveSessions();
    }
  }

  close(): void {
    this.saveSessions();
    console.log('📚 Database closed');
  }
}