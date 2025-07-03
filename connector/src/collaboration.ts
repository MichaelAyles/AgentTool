import { EventEmitter } from 'events';
import { FileDatabase } from './file-database';

export interface SharedSession {
  id: string;
  terminalId: string;
  hostUuid: string;
  participants: Set<string>;
  name: string;
  description?: string;
  permissions: {
    canWrite: boolean;
    canRead: boolean;
    canComment: boolean;
  };
  createdAt: Date;
  lastActivity: Date;
  isActive: boolean;
}

export interface SessionComment {
  id: string;
  sessionId: string;
  userId: string;
  content: string;
  position?: {
    line: number;
    column: number;
  };
  timestamp: Date;
  isResolved: boolean;
  replies: SessionComment[];
}

export interface CursorPosition {
  userId: string;
  sessionId: string;
  line: number;
  column: number;
  timestamp: Date;
  color: string;
}

export interface SessionRecording {
  id: string;
  sessionId: string;
  name: string;
  duration: number;
  events: RecordingEvent[];
  createdAt: Date;
  fileSize: number;
}

export interface RecordingEvent {
  timestamp: number;
  type: 'input' | 'output' | 'resize' | 'cursor' | 'comment';
  data: any;
}

export class CollaborationManager extends EventEmitter {
  private database: FileDatabase;
  private sharedSessions: Map<string, SharedSession> = new Map();
  private sessionComments: Map<string, Map<string, SessionComment>> = new Map(); // sessionId -> commentId -> comment
  private cursorPositions: Map<string, Map<string, CursorPosition>> = new Map(); // sessionId -> userId -> position
  private sessionRecordings: Map<string, SessionRecording> = new Map();
  private activeRecordings: Map<string, {
    recording: SessionRecording;
    events: RecordingEvent[];
    startTime: number;
  }> = new Map();

  constructor(database: FileDatabase) {
    super();
    this.database = database;
    this.loadCollaborationData();
    this.setupCleanupInterval();
  }

  // Shared Session Management
  public createSharedSession(
    terminalId: string,
    hostUuid: string,
    name: string,
    description?: string,
    permissions = { canWrite: true, canRead: true, canComment: true }
  ): SharedSession {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    
    const session: SharedSession = {
      id: sessionId,
      terminalId,
      hostUuid,
      participants: new Set([hostUuid]),
      name,
      description,
      permissions,
      createdAt: new Date(),
      lastActivity: new Date(),
      isActive: true
    };

    this.sharedSessions.set(sessionId, session);
    this.sessionComments.set(sessionId, new Map());
    this.cursorPositions.set(sessionId, new Map());
    
    this.saveCollaborationData();
    this.emit('sessionCreated', session);
    
    console.log(`Created shared session: ${name} (${sessionId})`);
    return session;
  }

  public joinSharedSession(sessionId: string, userId: string): boolean {
    const session = this.sharedSessions.get(sessionId);
    if (!session || !session.isActive) {
      return false;
    }

    session.participants.add(userId);
    session.lastActivity = new Date();
    
    this.saveCollaborationData();
    this.emit('userJoined', { sessionId, userId, session });
    
    console.log(`User ${userId} joined session ${sessionId}`);
    return true;
  }

  public leaveSharedSession(sessionId: string, userId: string): boolean {
    const session = this.sharedSessions.get(sessionId);
    if (!session) {
      return false;
    }

    session.participants.delete(userId);
    session.lastActivity = new Date();

    // Remove user's cursor position
    const cursors = this.cursorPositions.get(sessionId);
    if (cursors) {
      cursors.delete(userId);
    }

    // If host leaves, transfer ownership or close session
    if (session.hostUuid === userId) {
      if (session.participants.size > 0) {
        // Transfer to first remaining participant
        session.hostUuid = Array.from(session.participants)[0];
        console.log(`Transferred session ${sessionId} ownership to ${session.hostUuid}`);
      } else {
        // Close session if no participants remain
        session.isActive = false;
        console.log(`Closed session ${sessionId} - no participants remaining`);
      }
    }

    this.saveCollaborationData();
    this.emit('userLeft', { sessionId, userId, session });
    
    console.log(`User ${userId} left session ${sessionId}`);
    return true;
  }

  public getSharedSession(sessionId: string): SharedSession | undefined {
    return this.sharedSessions.get(sessionId);
  }

  public getUserSessions(userId: string): SharedSession[] {
    return Array.from(this.sharedSessions.values())
      .filter(session => session.participants.has(userId) && session.isActive);
  }

  public getSessionsByTerminal(terminalId: string): SharedSession[] {
    return Array.from(this.sharedSessions.values())
      .filter(session => session.terminalId === terminalId && session.isActive);
  }

  // Cursor Position Tracking
  public updateCursorPosition(sessionId: string, userId: string, line: number, column: number): void {
    const session = this.sharedSessions.get(sessionId);
    if (!session || !session.participants.has(userId)) {
      return;
    }

    let cursors = this.cursorPositions.get(sessionId);
    if (!cursors) {
      cursors = new Map();
      this.cursorPositions.set(sessionId, cursors);
    }

    const userColor = this.getUserColor(userId);
    const position: CursorPosition = {
      userId,
      sessionId,
      line,
      column,
      timestamp: new Date(),
      color: userColor
    };

    cursors.set(userId, position);
    this.emit('cursorMoved', position);
  }

  public getCursorPositions(sessionId: string): CursorPosition[] {
    const cursors = this.cursorPositions.get(sessionId);
    return cursors ? Array.from(cursors.values()) : [];
  }

  private getUserColor(userId: string): string {
    // Generate consistent colors for users
    const colors = [
      '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', 
      '#ef4444', '#ec4899', '#6366f1', '#14b8a6'
    ];
    const hash = userId.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
    return colors[hash % colors.length];
  }

  // Comment System
  public addComment(
    sessionId: string,
    userId: string,
    content: string,
    position?: { line: number; column: number }
  ): SessionComment {
    const session = this.sharedSessions.get(sessionId);
    if (!session || !session.participants.has(userId) || !session.permissions.canComment) {
      throw new Error('Cannot add comment to this session');
    }

    const commentId = `comment_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    const comment: SessionComment = {
      id: commentId,
      sessionId,
      userId,
      content,
      position,
      timestamp: new Date(),
      isResolved: false,
      replies: []
    };

    let comments = this.sessionComments.get(sessionId);
    if (!comments) {
      comments = new Map();
      this.sessionComments.set(sessionId, comments);
    }

    comments.set(commentId, comment);
    session.lastActivity = new Date();
    
    this.saveCollaborationData();
    this.emit('commentAdded', comment);
    
    console.log(`Added comment ${commentId} to session ${sessionId}`);
    return comment;
  }

  public updateComment(commentId: string, userId: string, updates: Partial<SessionComment>): boolean {
    for (const [sessionId, comments] of this.sessionComments) {
      const comment = comments.get(commentId);
      if (comment && comment.userId === userId) {
        Object.assign(comment, updates, { timestamp: new Date() });
        
        const session = this.sharedSessions.get(sessionId);
        if (session) {
          session.lastActivity = new Date();
        }
        
        this.saveCollaborationData();
        this.emit('commentUpdated', comment);
        return true;
      }
    }
    return false;
  }

  public deleteComment(commentId: string, userId: string): boolean {
    for (const [sessionId, comments] of this.sessionComments) {
      const comment = comments.get(commentId);
      if (comment && (comment.userId === userId || this.isSessionHost(sessionId, userId))) {
        comments.delete(commentId);
        
        const session = this.sharedSessions.get(sessionId);
        if (session) {
          session.lastActivity = new Date();
        }
        
        this.saveCollaborationData();
        this.emit('commentDeleted', { commentId, sessionId });
        return true;
      }
    }
    return false;
  }

  public getSessionComments(sessionId: string): SessionComment[] {
    const comments = this.sessionComments.get(sessionId);
    return comments ? Array.from(comments.values()).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()) : [];
  }

  private isSessionHost(sessionId: string, userId: string): boolean {
    const session = this.sharedSessions.get(sessionId);
    return session?.hostUuid === userId;
  }

  // Session Recording
  public startRecording(sessionId: string, userId: string, name: string): SessionRecording {
    const session = this.sharedSessions.get(sessionId);
    if (!session || !this.isSessionHost(sessionId, userId)) {
      throw new Error('Cannot start recording for this session');
    }

    const recordingId = `recording_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    const recording: SessionRecording = {
      id: recordingId,
      sessionId,
      name,
      duration: 0,
      events: [],
      createdAt: new Date(),
      fileSize: 0
    };

    this.sessionRecordings.set(recordingId, recording);
    this.activeRecordings.set(sessionId, {
      recording,
      events: [],
      startTime: Date.now()
    });

    session.lastActivity = new Date();
    this.saveCollaborationData();
    this.emit('recordingStarted', recording);
    
    console.log(`Started recording ${name} for session ${sessionId}`);
    return recording;
  }

  public stopRecording(sessionId: string, userId: string): SessionRecording | null {
    const session = this.sharedSessions.get(sessionId);
    const activeRecording = this.activeRecordings.get(sessionId);
    
    if (!session || !activeRecording || !this.isSessionHost(sessionId, userId)) {
      return null;
    }

    const { recording, events, startTime } = activeRecording;
    recording.duration = Date.now() - startTime;
    recording.events = events;
    recording.fileSize = JSON.stringify(events).length;

    this.activeRecordings.delete(sessionId);
    session.lastActivity = new Date();
    
    this.saveCollaborationData();
    this.emit('recordingStopped', recording);
    
    console.log(`Stopped recording ${recording.name} (${recording.duration}ms, ${events.length} events)`);
    return recording;
  }

  public recordEvent(sessionId: string, type: RecordingEvent['type'], data: any): void {
    const activeRecording = this.activeRecordings.get(sessionId);
    if (!activeRecording) {
      return;
    }

    const event: RecordingEvent = {
      timestamp: Date.now() - activeRecording.startTime,
      type,
      data
    };

    activeRecording.events.push(event);
  }

  public getSessionRecordings(sessionId: string): SessionRecording[] {
    return Array.from(this.sessionRecordings.values())
      .filter(recording => recording.sessionId === sessionId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  public getRecording(recordingId: string): SessionRecording | undefined {
    return this.sessionRecordings.get(recordingId);
  }

  // Data Persistence
  private loadCollaborationData(): void {
    try {
      const dbData = this.database.getData();
      
      if (dbData.sharedSessions) {
        for (const [sessionId, sessionData] of Object.entries(dbData.sharedSessions)) {
          const session = {
            ...(sessionData as any),
            participants: new Set((sessionData as any).participants || []),
            createdAt: new Date((sessionData as any).createdAt),
            lastActivity: new Date((sessionData as any).lastActivity)
          } as SharedSession;
          this.sharedSessions.set(sessionId, session);
        }
      }

      if (dbData.sessionComments) {
        for (const [sessionId, comments] of Object.entries(dbData.sessionComments)) {
          const commentMap = new Map();
          for (const [commentId, commentData] of Object.entries(comments as any)) {
            const comment = {
              ...(commentData as any),
              timestamp: new Date((commentData as any).timestamp)
            } as SessionComment;
            commentMap.set(commentId, comment);
          }
          this.sessionComments.set(sessionId, commentMap);
        }
      }

      if (dbData.sessionRecordings) {
        for (const [recordingId, recordingData] of Object.entries(dbData.sessionRecordings)) {
          const recording = {
            ...(recordingData as any),
            createdAt: new Date((recordingData as any).createdAt)
          } as SessionRecording;
          this.sessionRecordings.set(recordingId, recording);
        }
      }

      console.log(`Loaded ${this.sharedSessions.size} shared sessions, ${this.sessionRecordings.size} recordings`);
    } catch (error) {
      console.error('Error loading collaboration data:', error);
    }
  }

  private saveCollaborationData(): void {
    try {
      const dbData = this.database.getData();
      
      // Convert shared sessions for storage
      const sessionsData: any = {};
      for (const [sessionId, session] of this.sharedSessions) {
        sessionsData[sessionId] = {
          ...session,
          participants: Array.from(session.participants)
        };
      }

      // Convert comments for storage
      const commentsData: any = {};
      for (const [sessionId, comments] of this.sessionComments) {
        const sessionComments: any = {};
        for (const [commentId, comment] of comments) {
          sessionComments[commentId] = comment;
        }
        commentsData[sessionId] = sessionComments;
      }

      // Convert recordings for storage
      const recordingsData: any = {};
      for (const [recordingId, recording] of this.sessionRecordings) {
        recordingsData[recordingId] = recording;
      }

      this.database.setData({
        ...dbData,
        sharedSessions: sessionsData,
        sessionComments: commentsData,
        sessionRecordings: recordingsData
      });
    } catch (error) {
      console.error('Error saving collaboration data:', error);
    }
  }

  private setupCleanupInterval(): void {
    // Clean up inactive sessions and old data every hour
    setInterval(() => {
      this.cleanupInactiveSessions();
      this.cleanupOldRecordings();
    }, 3600000); // 1 hour
  }

  private cleanupInactiveSessions(): void {
    const now = Date.now();
    const inactivityThreshold = 24 * 60 * 60 * 1000; // 24 hours

    for (const [sessionId, session] of this.sharedSessions) {
      if (now - session.lastActivity.getTime() > inactivityThreshold) {
        console.log(`Cleaning up inactive session: ${sessionId}`);
        this.sharedSessions.delete(sessionId);
        this.sessionComments.delete(sessionId);
        this.cursorPositions.delete(sessionId);
      }
    }

    this.saveCollaborationData();
  }

  private cleanupOldRecordings(): void {
    const now = Date.now();
    const ageThreshold = 30 * 24 * 60 * 60 * 1000; // 30 days

    for (const [recordingId, recording] of this.sessionRecordings) {
      if (now - recording.createdAt.getTime() > ageThreshold) {
        console.log(`Cleaning up old recording: ${recordingId}`);
        this.sessionRecordings.delete(recordingId);
      }
    }

    this.saveCollaborationData();
  }

  // Statistics and Analytics
  public getCollaborationStats(): {
    activeSessions: number;
    totalParticipants: number;
    totalComments: number;
    totalRecordings: number;
    totalRecordingDuration: number;
  } {
    const activeSessions = Array.from(this.sharedSessions.values()).filter(s => s.isActive).length;
    const totalParticipants = Array.from(this.sharedSessions.values())
      .reduce((sum, session) => sum + session.participants.size, 0);
    
    let totalComments = 0;
    for (const comments of this.sessionComments.values()) {
      totalComments += comments.size;
    }

    const recordings = Array.from(this.sessionRecordings.values());
    const totalRecordingDuration = recordings.reduce((sum, recording) => sum + recording.duration, 0);

    return {
      activeSessions,
      totalParticipants,
      totalComments,
      totalRecordings: recordings.length,
      totalRecordingDuration
    };
  }

  public destroy(): void {
    this.saveCollaborationData();
    this.sharedSessions.clear();
    this.sessionComments.clear();
    this.cursorPositions.clear();
    this.sessionRecordings.clear();
    this.activeRecordings.clear();
    this.removeAllListeners();
  }
}