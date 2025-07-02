import { logger } from '../utils/logger';

export interface PairingSession {
  sessionId: string;
  tunnelUrl: string;
  timestamp: number;
  clientInfo?: {
    platform: string;
    version: string;
    userAgent?: string;
  };
}

export interface PairingRegistration {
  sessionId: string;
  tunnelUrl: string;
  clientInfo?: PairingSession['clientInfo'];
}

export interface PairingStatus {
  status: 'pending' | 'connected' | 'expired';
  tunnelUrl?: string;
  timestamp?: number;
  clientInfo?: PairingSession['clientInfo'];
}

/**
 * Service for managing local agent pairing sessions
 * Uses in-memory cache with TTL for temporary session storage
 */
export class ConnectionPairingService {
  private sessions = new Map<string, PairingSession>();
  private readonly SESSION_TTL = 5 * 60 * 1000; // 5 minutes
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Clean up expired sessions every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 60 * 1000);

    logger.info('ConnectionPairingService initialized');
  }

  /**
   * Register a local agent connection
   */
  async registerConnection(registration: PairingRegistration): Promise<void> {
    const { sessionId, tunnelUrl, clientInfo } = registration;

    if (!sessionId || !tunnelUrl) {
      throw new Error('sessionId and tunnelUrl are required');
    }

    // Validate tunnel URL format
    if (!this.isValidTunnelUrl(tunnelUrl)) {
      throw new Error('Invalid tunnel URL format');
    }

    const session: PairingSession = {
      sessionId,
      tunnelUrl,
      timestamp: Date.now(),
      clientInfo,
    };

    this.sessions.set(sessionId, session);

    logger.info('Local agent registered', {
      sessionId,
      tunnelUrl,
      clientInfo,
    });
  }

  /**
   * Get the status of a pairing session
   */
  async getConnectionStatus(sessionId: string): Promise<PairingStatus> {
    if (!sessionId) {
      return { status: 'pending' };
    }

    const session = this.sessions.get(sessionId);

    if (!session) {
      return { status: 'pending' };
    }

    // Check if session has expired
    const now = Date.now();
    const isExpired = now - session.timestamp > this.SESSION_TTL;

    if (isExpired) {
      this.sessions.delete(sessionId);
      logger.info('Session expired and removed', { sessionId });
      return { status: 'expired' };
    }

    return {
      status: 'connected',
      tunnelUrl: session.tunnelUrl,
      timestamp: session.timestamp,
      clientInfo: session.clientInfo,
    };
  }

  /**
   * Get all active sessions (for debugging/monitoring)
   */
  async getActiveSessions(): Promise<PairingSession[]> {
    const now = Date.now();
    const activeSessions: PairingSession[] = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      const isExpired = now - session.timestamp > this.SESSION_TTL;

      if (isExpired) {
        this.sessions.delete(sessionId);
      } else {
        activeSessions.push(session);
      }
    }

    return activeSessions;
  }

  /**
   * Manually remove a session
   */
  async removeSession(sessionId: string): Promise<boolean> {
    const existed = this.sessions.has(sessionId);
    this.sessions.delete(sessionId);

    if (existed) {
      logger.info('Session manually removed', { sessionId });
    }

    return existed;
  }

  /**
   * Get session statistics
   */
  async getSessionStats(): Promise<{
    totalSessions: number;
    activeSessions: number;
    averageAge: number;
  }> {
    const sessions = await this.getActiveSessions();
    const now = Date.now();

    const totalAge = sessions.reduce((sum, session) => {
      return sum + (now - session.timestamp);
    }, 0);

    return {
      totalSessions: sessions.length,
      activeSessions: sessions.length,
      averageAge: sessions.length > 0 ? totalAge / sessions.length : 0,
    };
  }

  /**
   * Cleanup expired sessions
   */
  private cleanupExpiredSessions(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      const isExpired = now - session.timestamp > this.SESSION_TTL;

      if (isExpired) {
        this.sessions.delete(sessionId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.debug('Cleaned up expired sessions', { count: cleanedCount });
    }
  }

  /**
   * Validate tunnel URL format
   */
  private isValidTunnelUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url);

      // Must be HTTPS for security
      if (parsedUrl.protocol !== 'https:') {
        return false;
      }

      // Check for common tunnel services
      const validHosts = [
        'ngrok.io',
        'ngrok-free.app',
        'tunnel.dev',
        'localhost.run',
        'serveo.net',
        'localtunnel.me',
      ];

      const isValidHost = validHosts.some(host =>
        parsedUrl.hostname.endsWith(host)
      );

      return isValidHost || parsedUrl.hostname === 'localhost';
    } catch {
      return false;
    }
  }

  /**
   * Cleanup on service shutdown
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.sessions.clear();
    logger.info('ConnectionPairingService destroyed');
  }
}

// Singleton instance
export const connectionPairingService = new ConnectionPairingService();
