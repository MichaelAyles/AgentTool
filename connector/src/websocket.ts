import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { TerminalManager } from './terminal';
import { SessionDatabase } from './database';

export interface WebSocketMessage {
  type: 'auth' | 'terminal_input' | 'terminal_resize' | 'terminal_create' | 'terminal_close' | 'terminal_list' | 'ping' | 'pong';
  uuid?: string;
  terminalId?: string;
  data?: any;
  timestamp?: number;
}

export interface ConnectedClient {
  ws: WebSocket;
  uuid: string;
  authenticated: boolean;
  lastPing: number;
}

export class WebSocketManager {
  private wss: WebSocketServer;
  private clients: Map<string, ConnectedClient> = new Map();
  private terminalManager: TerminalManager;
  private database: SessionDatabase;
  private pingInterval!: NodeJS.Timeout;

  constructor(port: number, terminalManager: TerminalManager, database: SessionDatabase) {
    this.terminalManager = terminalManager;
    this.database = database;

    // Create WebSocket server
    this.wss = new WebSocketServer({ 
      port,
      verifyClient: this.verifyClient.bind(this)
    });

    console.log(`🔌 WebSocket server listening on port ${port}`);

    // Handle new connections
    this.wss.on('connection', this.handleConnection.bind(this));

    // Setup terminal manager listeners
    this.setupTerminalListeners();

    // Start ping/pong mechanism
    this.startPingPong();

    // Cleanup interval
    setInterval(() => {
      this.cleanupConnections();
      this.terminalManager.cleanupInactiveSessions();
      this.database.cleanupOldSessions();
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  private verifyClient(info: { origin: string; secure: boolean; req: IncomingMessage }): boolean {
    // For development, allow localhost and Vercel domains
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:8000',
      'https://frontend-three-delta-48.vercel.app',
      'https://vibe.theduck.chat',
      'https://agent-tool-frontend.vercel.app'
    ];

    const origin = info.origin;
    
    // Allow requests without origin (like direct WebSocket connections)
    if (!origin) return true;
    
    // Check if origin is in allowed list or is a Vercel deployment
    return allowedOrigins.includes(origin) || 
           origin.includes('.vercel.app') ||
           origin.includes('localhost');
  }

  private handleConnection(ws: WebSocket, request: IncomingMessage): void {
    const clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`📱 New WebSocket connection: ${clientId}`);

    const client: ConnectedClient = {
      ws,
      uuid: '',
      authenticated: false,
      lastPing: Date.now()
    };

    // Handle messages
    ws.on('message', (data: Buffer) => {
      try {
        const message: WebSocketMessage = JSON.parse(data.toString());
        this.handleMessage(clientId, client, message);
      } catch (error) {
        console.error('Invalid WebSocket message:', error);
        this.sendMessage(ws, {
          type: 'error' as any,
          data: 'Invalid message format'
        });
      }
    });

    // Handle disconnect
    ws.on('close', () => {
      console.log(`📱 WebSocket disconnected: ${clientId}`);
      if (client.uuid) {
        this.clients.delete(client.uuid);
        this.database.updateSessionStatus(client.uuid, 'inactive');
      }
    });

    // Handle errors
    ws.on('error', (error) => {
      console.error(`WebSocket error for ${clientId}:`, error);
    });

    // Send initial ping
    this.sendMessage(ws, {
      type: 'ping',
      timestamp: Date.now()
    });
  }

  private handleMessage(clientId: string, client: ConnectedClient, message: WebSocketMessage): void {
    switch (message.type) {
      case 'auth':
        this.handleAuth(clientId, client, message);
        break;

      case 'terminal_input':
        this.handleTerminalInput(client, message);
        break;

      case 'terminal_resize':
        this.handleTerminalResize(client, message);
        break;

      case 'terminal_create':
        this.handleTerminalCreate(client, message);
        break;

      case 'terminal_close':
        this.handleTerminalClose(client, message);
        break;

      case 'terminal_list':
        this.handleTerminalList(client, message);
        break;

      case 'pong':
        client.lastPing = Date.now();
        break;

      case 'ping':
        this.sendMessage(client.ws, {
          type: 'pong',
          timestamp: Date.now()
        });
        break;

      default:
        console.warn('Unknown message type:', message.type);
    }
  }

  private handleAuth(clientId: string, client: ConnectedClient, message: WebSocketMessage): void {
    const { uuid } = message;
    
    if (!uuid || typeof uuid !== 'string') {
      this.sendMessage(client.ws, {
        type: 'auth_error' as any,
        data: 'Invalid UUID'
      });
      return;
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(uuid)) {
      this.sendMessage(client.ws, {
        type: 'auth_error' as any,
        data: 'Invalid UUID format'
      });
      return;
    }

    // Check if UUID is already connected
    if (this.clients.has(uuid)) {
      this.sendMessage(client.ws, {
        type: 'auth_error' as any,
        data: 'UUID already in use'
      });
      return;
    }

    // Authenticate client
    client.uuid = uuid;
    client.authenticated = true;
    this.clients.set(uuid, client);

    // Create or update session in database
    let session = this.database.getSessionByUuid(uuid);
    if (!session) {
      session = this.database.createSession(uuid);
    } else {
      this.database.updateSessionStatus(uuid, 'active');
    }

    // Check if user already has terminals, if not create an initial one
    const existingTerminals = this.terminalManager.getSessionsByUuid(uuid);
    if (existingTerminals.length === 0) {
      this.terminalManager.createSession(uuid, undefined, 'Terminal 1', 'blue');
    }

    console.log(`✅ Client authenticated with UUID: ${uuid}`);

    // Send success response
    this.sendMessage(client.ws, {
      type: 'auth_success' as any,
      data: {
        uuid,
        sessionId: session.id,
        timestamp: Date.now()
      }
    });

    // Send current terminal list
    setTimeout(() => {
      this.handleTerminalList(client, { type: 'terminal_list' });
    }, 100);
  }

  private handleTerminalInput(client: ConnectedClient, message: WebSocketMessage): void {
    if (!client.authenticated || !client.uuid) {
      return;
    }

    const { terminalId, data } = message;
    if (!terminalId) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: 'Terminal ID required for input'
      });
      return;
    }

    if (typeof data === 'string') {
      const success = this.terminalManager.writeToSession(client.uuid, terminalId, data);
      if (success) {
        this.database.updateSessionActivity(client.uuid);
      }
    }
  }

  private handleTerminalResize(client: ConnectedClient, message: WebSocketMessage): void {
    if (!client.authenticated || !client.uuid) {
      return;
    }

    const { terminalId, data } = message;
    if (!terminalId) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: 'Terminal ID required for resize'
      });
      return;
    }

    if (data && typeof data.cols === 'number' && typeof data.rows === 'number') {
      this.terminalManager.resizeSession(client.uuid, terminalId, data.cols, data.rows);
    }
  }

  private handleTerminalCreate(client: ConnectedClient, message: WebSocketMessage): void {
    if (!client.authenticated || !client.uuid) {
      return;
    }

    try {
      const { terminalId, data } = message;
      const name = data?.name || undefined;
      const color = data?.color || undefined;
      
      const session = this.terminalManager.createSession(client.uuid, terminalId, name, color);
      
      this.sendMessage(client.ws, {
        type: 'terminal_created' as any,
        terminalId: session.terminalId,
        data: {
          id: session.id,
          terminalId: session.terminalId,
          name: session.name,
          color: session.color,
          createdAt: session.createdAt
        }
      });
    } catch (error) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: `Failed to create terminal: ${error}`
      });
    }
  }

  private handleTerminalClose(client: ConnectedClient, message: WebSocketMessage): void {
    if (!client.authenticated || !client.uuid) {
      return;
    }

    const { terminalId } = message;
    if (!terminalId) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: 'Terminal ID required for close'
      });
      return;
    }

    const success = this.terminalManager.terminateSession(client.uuid, terminalId);
    
    this.sendMessage(client.ws, {
      type: 'terminal_closed' as any,
      terminalId,
      data: {
        success,
        terminalId
      }
    });
  }

  private handleTerminalList(client: ConnectedClient, message: WebSocketMessage): void {
    if (!client.authenticated || !client.uuid) {
      return;
    }

    const sessions = this.terminalManager.getSessionsByUuid(client.uuid);
    
    this.sendMessage(client.ws, {
      type: 'terminal_list' as any,
      data: {
        terminals: sessions.map(session => ({
          id: session.id,
          terminalId: session.terminalId,
          name: session.name,
          color: session.color,
          isActive: session.isActive,
          createdAt: session.createdAt,
          lastActivity: session.lastActivity
        }))
      }
    });
  }

  private setupTerminalListeners(): void {
    // Forward terminal output to WebSocket clients
    this.terminalManager.on('data', (uuid: string, terminalId: string, data: string) => {
      const client = this.clients.get(uuid);
      if (client) {
        this.sendMessage(client.ws, {
          type: 'terminal_output' as any,
          terminalId,
          data
        });
      }
    });

    // Handle terminal exit
    this.terminalManager.on('exit', (uuid: string, terminalId: string, exitCode: number) => {
      const client = this.clients.get(uuid);
      if (client) {
        this.sendMessage(client.ws, {
          type: 'terminal_exit' as any,
          terminalId,
          data: { exitCode, terminalId }
        });
        this.database.updateSessionStatus(uuid, 'terminated');
      }
    });
  }

  private sendMessage(ws: WebSocket, message: WebSocketMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private startPingPong(): void {
    this.pingInterval = setInterval(() => {
      const now = Date.now();
      
      for (const [uuid, client] of this.clients.entries()) {
        // Check if client is still responsive
        if (now - client.lastPing > 30000) { // 30 seconds timeout
          console.log(`🔌 Disconnecting unresponsive client: ${uuid}`);
          client.ws.terminate();
          this.clients.delete(uuid);
          this.database.updateSessionStatus(uuid, 'inactive');
          continue;
        }

        // Send ping
        this.sendMessage(client.ws, {
          type: 'ping',
          timestamp: now
        });
      }
    }, 15000); // Every 15 seconds
  }

  private cleanupConnections(): void {
    for (const [uuid, client] of this.clients.entries()) {
      if (client.ws.readyState !== WebSocket.OPEN) {
        console.log(`🧹 Cleaning up closed connection: ${uuid}`);
        this.clients.delete(uuid);
        this.terminalManager.terminateSession(uuid);
        this.database.updateSessionStatus(uuid, 'inactive');
      }
    }
  }

  getConnectedClients(): ConnectedClient[] {
    return Array.from(this.clients.values());
  }

  getClientByUuid(uuid: string): ConnectedClient | undefined {
    return this.clients.get(uuid);
  }

  destroy(): void {
    // Close all connections
    for (const client of this.clients.values()) {
      client.ws.terminate();
    }
    
    // Clear intervals
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }

    // Close WebSocket server
    this.wss.close();
    
    console.log('🔌 WebSocket server closed');
  }
}