import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { TerminalManager } from './terminal';
import { SessionDatabase } from './database';
import { CommandRoutingEngine } from './routing';
import { LayoutManager } from './layout';
import { CollaborationManager } from './collaboration';
import { EventEmitter } from 'events';

export interface WebSocketMessage {
  type: 'auth' | 'terminal_input' | 'terminal_resize' | 'terminal_create' | 'terminal_close' | 'terminal_list' | 'terminal_broadcast' | 'ping' | 'pong' | 'command_route' | 'command_history' | 'tool_history' | 'command_parse' | 'agent_output' | 'layout_get' | 'layout_set' | 'layout_create' | 'layout_update' | 'layout_delete' | 'layout_list' | 'layout_state' | 'layout_pane_assign' | 'layout_pane_remove' | 'layout_comparison' | 'layout_sync_scroll' | 'layout_export' | 'layout_import' | 'session_share' | 'session_join' | 'session_leave' | 'cursor_position' | 'comment_add' | 'comment_update' | 'comment_delete' | 'recording_start' | 'recording_stop' | 'recording_play';
  uuid?: string;
  terminalId?: string;
  targetTerminalId?: string;
  sourceTerminalId?: string;
  data?: any;
  timestamp?: number;
  command?: string;
  tool?: string;
  workingDirectory?: string;
  layoutId?: string;
  paneId?: string;
  sessionId?: string;
  userId?: string;
  cursorPosition?: { line: number; column: number };
  commentId?: string;
  recordingId?: string;
}

export interface ConnectedClient {
  ws: WebSocket;
  uuid: string;
  authenticated: boolean;
  lastPing: number;
}

export class WebSocketManager extends EventEmitter {
  protected wss: WebSocketServer;
  protected clients: Map<string, ConnectedClient> = new Map();
  protected terminalManager: TerminalManager;
  protected database: SessionDatabase;
  private commandRoutingEngine: CommandRoutingEngine | null = null;
  private layoutManager: LayoutManager | null = null;
  private collaborationManager: CollaborationManager | null = null;
  private pingInterval!: NodeJS.Timeout;

  constructor(port: number, terminalManager: TerminalManager, database: SessionDatabase) {
    super();
    this.terminalManager = terminalManager;
    this.database = database;

    // Create WebSocket server (can be overridden by subclasses)
    this.wss = this.createWebSocketServer(port);

    console.log(`🔌 WebSocket server starting on port ${port}`);

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

  protected createWebSocketServer(port: number): WebSocketServer {
    return new WebSocketServer({ 
      port,
      verifyClient: this.verifyClient.bind(this)
    });
  }

  public setCommandRoutingEngine(engine: CommandRoutingEngine): void {
    this.commandRoutingEngine = engine;
    
    // Setup routing engine listeners for real-time agent output
    if (this.commandRoutingEngine) {
      this.commandRoutingEngine.on('agentOutput', (data) => {
        const client = this.clients.get(data.uuid);
        if (client) {
          this.sendMessage(client.ws, {
            type: 'agent_output',
            terminalId: data.terminalId,
            data: {
              tool: data.tool,
              chunk: data.chunk,
              type: data.type
            }
          });
        }
      });

      this.commandRoutingEngine.on('commandRouted', (data) => {
        const client = this.clients.get(data.uuid);
        if (client) {
          this.sendMessage(client.ws, {
            type: 'command_routed' as any,
            terminalId: data.terminalId,
            data: {
              commandInfo: data.commandInfo,
              result: data.result,
              duration: data.duration
            }
          });
        }
      });
    }
  }

  public setCollaborationManager(manager: CollaborationManager): void {
    this.collaborationManager = manager;
    
    // Setup collaboration manager listeners
    if (this.collaborationManager) {
      this.collaborationManager.on('sessionCreated', (session) => {
        this.broadcastToParticipants(session.id, {
          type: 'session_share',
          sessionId: session.id,
          data: session
        });
      });

      this.collaborationManager.on('userJoined', ({ sessionId, userId, session }) => {
        this.broadcastToParticipants(sessionId, {
          type: 'session_join',
          sessionId,
          userId,
          data: { userId, session }
        });
      });

      this.collaborationManager.on('userLeft', ({ sessionId, userId, session }) => {
        this.broadcastToParticipants(sessionId, {
          type: 'session_leave',
          sessionId,
          userId,
          data: { userId, session }
        });
      });

      this.collaborationManager.on('cursorMoved', (position) => {
        this.broadcastToParticipants(position.sessionId, {
          type: 'cursor_position',
          sessionId: position.sessionId,
          userId: position.userId,
          cursorPosition: { line: position.line, column: position.column },
          data: position
        });
      });

      this.collaborationManager.on('commentAdded', (comment) => {
        this.broadcastToParticipants(comment.sessionId, {
          type: 'comment_add',
          sessionId: comment.sessionId,
          commentId: comment.id,
          data: comment
        });
      });

      this.collaborationManager.on('commentUpdated', (comment) => {
        this.broadcastToParticipants(comment.sessionId, {
          type: 'comment_update',
          sessionId: comment.sessionId,
          commentId: comment.id,
          data: comment
        });
      });

      this.collaborationManager.on('commentDeleted', ({ commentId, sessionId }) => {
        this.broadcastToParticipants(sessionId, {
          type: 'comment_delete',
          sessionId,
          commentId,
          data: { commentId }
        });
      });

      this.collaborationManager.on('recordingStarted', (recording) => {
        this.broadcastToParticipants(recording.sessionId, {
          type: 'recording_start',
          sessionId: recording.sessionId,
          recordingId: recording.id,
          data: recording
        });
      });

      this.collaborationManager.on('recordingStopped', (recording) => {
        this.broadcastToParticipants(recording.sessionId, {
          type: 'recording_stop',
          sessionId: recording.sessionId,
          recordingId: recording.id,
          data: recording
        });
      });
    }
  }

  private broadcastToParticipants(sessionId: string, message: Partial<WebSocketMessage>): void {
    if (!this.collaborationManager) return;
    
    const session = this.collaborationManager.getSharedSession(sessionId);
    if (!session) return;

    // Ensure message has required type field
    if (!message.type) return;

    for (const participantUuid of session.participants) {
      const client = this.clients.get(participantUuid);
      if (client) {
        this.sendMessage(client.ws, message as WebSocketMessage);
      }
    }
  }

  public setLayoutManager(manager: LayoutManager): void {
    this.layoutManager = manager;
    
    // Setup layout manager listeners
    if (this.layoutManager) {
      this.layoutManager.on('layoutChanged', (uuid, layout, state) => {
        const client = this.clients.get(uuid);
        if (client) {
          this.sendMessage(client.ws, {
            type: 'layout_changed' as any,
            data: { layout, state }
          });
        }
      });

      this.layoutManager.on('layoutStateUpdated', (uuid, state) => {
        const client = this.clients.get(uuid);
        if (client) {
          this.sendMessage(client.ws, {
            type: 'layout_state_updated' as any,
            data: { state }
          });
        }
      });

      this.layoutManager.on('paneSizeUpdated', (uuid, paneId, width, height) => {
        const client = this.clients.get(uuid);
        if (client) {
          this.sendMessage(client.ws, {
            type: 'layout_pane_resized' as any,
            paneId,
            data: { width, height }
          });
        }
      });

      this.layoutManager.on('comparisonModeChanged', (uuid, enabled, panes) => {
        const client = this.clients.get(uuid);
        if (client) {
          this.sendMessage(client.ws, {
            type: 'layout_comparison_changed' as any,
            data: { enabled, panes }
          });
        }
      });
    }
  }

  private verifyClient(info: { origin: string; secure: boolean; req: IncomingMessage }): boolean {
    // For development, allow localhost and Vercel domains
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:8000',
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

      case 'terminal_broadcast':
        this.handleTerminalBroadcast(client, message);
        break;

      case 'command_route':
        this.handleCommandRoute(client, message);
        break;

      case 'command_parse':
        this.handleCommandParse(client, message);
        break;

      case 'command_history':
        this.handleCommandHistory(client, message);
        break;

      case 'tool_history':
        this.handleToolHistory(client, message);
        break;

      case 'layout_get':
        this.handleLayoutGet(client, message);
        break;

      case 'layout_set':
        this.handleLayoutSet(client, message);
        break;

      case 'layout_create':
        this.handleLayoutCreate(client, message);
        break;

      case 'layout_update':
        this.handleLayoutUpdate(client, message);
        break;

      case 'layout_delete':
        this.handleLayoutDelete(client, message);
        break;

      case 'layout_list':
        this.handleLayoutList(client, message);
        break;

      case 'layout_state':
        this.handleLayoutState(client, message);
        break;

      case 'layout_pane_assign':
        this.handleLayoutPaneAssign(client, message);
        break;

      case 'layout_pane_remove':
        this.handleLayoutPaneRemove(client, message);
        break;

      case 'layout_comparison':
        this.handleLayoutComparison(client, message);
        break;

      case 'layout_sync_scroll':
        this.handleLayoutSyncScroll(client, message);
        break;

      case 'layout_export':
        this.handleLayoutExport(client, message);
        break;

      case 'layout_import':
        this.handleLayoutImport(client, message);
        break;

      case 'session_share':
        this.handleSessionShare(client, message);
        break;

      case 'session_join':
        this.handleSessionJoin(client, message);
        break;

      case 'session_leave':
        this.handleSessionLeave(client, message);
        break;

      case 'cursor_position':
        this.handleCursorPosition(client, message);
        break;

      case 'comment_add':
        this.handleCommentAdd(client, message);
        break;

      case 'comment_update':
        this.handleCommentUpdate(client, message);
        break;

      case 'comment_delete':
        this.handleCommentDelete(client, message);
        break;

      case 'recording_start':
        this.handleRecordingStart(client, message);
        break;

      case 'recording_stop':
        this.handleRecordingStop(client, message);
        break;

      case 'recording_play':
        this.handleRecordingPlay(client, message);
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
      const projectSettings = data?.projectSettings || undefined;
      
      const session = this.terminalManager.createSession(client.uuid, terminalId, name, color, projectSettings);
      
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
      console.error('Terminal creation failed:', error);
      this.sendMessage(client.ws, {
        type: 'terminal_create_error' as any,
        data: {
          message: error instanceof Error ? error.message : 'Failed to create terminal',
          type: 'resource_limit'
        }
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

  private handleTerminalBroadcast(client: ConnectedClient, message: WebSocketMessage): void {
    if (!client.authenticated || !client.uuid) {
      return;
    }

    const { terminalId, targetTerminalId, data } = message;
    
    if (!terminalId) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: 'Source terminal ID required for broadcast'
      });
      return;
    }

    // Verify source terminal exists and belongs to the user
    const sourceTerminal = this.terminalManager.getSession(client.uuid, terminalId);
    if (!sourceTerminal) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: 'Source terminal not found'
      });
      return;
    }

    if (targetTerminalId) {
      // Send to specific terminal
      const targetTerminal = this.terminalManager.getSession(client.uuid, targetTerminalId);
      if (!targetTerminal) {
        this.sendMessage(client.ws, {
          type: 'error' as any,
          data: 'Target terminal not found'
        });
        return;
      }

      this.sendMessage(client.ws, {
        type: 'terminal_message' as any,
        terminalId: targetTerminalId,
        sourceTerminalId: terminalId,
        data: data
      });
    } else {
      // Broadcast to all other terminals for this user
      const userTerminals = this.terminalManager.getSessionsByUuid(client.uuid);
      userTerminals.forEach(terminal => {
        if (terminal.terminalId !== terminalId) {
          this.sendMessage(client.ws, {
            type: 'terminal_message' as any,
            terminalId: terminal.terminalId,
            sourceTerminalId: terminalId,
            data: data
          });
        }
      });
    }
  }

  private async handleCommandRoute(client: ConnectedClient, message: WebSocketMessage): Promise<void> {
    if (!client.authenticated || !client.uuid) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: 'Authentication required for command routing'
      });
      return;
    }

    if (!this.commandRoutingEngine) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: 'Command routing engine not available'
      });
      return;
    }

    const { terminalId, command, workingDirectory } = message;
    
    if (!terminalId || !command) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: 'Terminal ID and command are required for routing'
      });
      return;
    }

    try {
      const result = await this.commandRoutingEngine.routeCommand(
        client.uuid,
        terminalId,
        command,
        workingDirectory
      );

      this.sendMessage(client.ws, {
        type: 'command_result' as any,
        terminalId,
        data: {
          success: result.success,
          handled: result.handled,
          output: result.output,
          error: result.error,
          commandInfo: result.commandInfo
        }
      });
    } catch (error) {
      this.sendMessage(client.ws, {
        type: 'command_error' as any,
        terminalId,
        data: {
          error: error instanceof Error ? error.message : 'Unknown error during command routing'
        }
      });
    }
  }

  private handleCommandParse(client: ConnectedClient, message: WebSocketMessage): void {
    if (!client.authenticated || !client.uuid) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: 'Authentication required for command parsing'
      });
      return;
    }

    if (!this.commandRoutingEngine) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: 'Command routing engine not available'
      });
      return;
    }

    const { command } = message;
    
    if (!command) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: 'Command is required for parsing'
      });
      return;
    }

    try {
      const commandInfo = this.commandRoutingEngine.getParser().parseCommand(command);
      
      this.sendMessage(client.ws, {
        type: 'command_parsed' as any,
        data: {
          commandInfo
        }
      });
    } catch (error) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: {
          error: error instanceof Error ? error.message : 'Failed to parse command'
        }
      });
    }
  }

  private handleCommandHistory(client: ConnectedClient, message: WebSocketMessage): void {
    if (!client.authenticated || !client.uuid) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: 'Authentication required for command history'
      });
      return;
    }

    if (!this.commandRoutingEngine) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: 'Command routing engine not available'
      });
      return;
    }

    const { terminalId } = message;
    
    if (!terminalId) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: 'Terminal ID is required for command history'
      });
      return;
    }

    try {
      const history = this.commandRoutingEngine.getTerminalHistory(client.uuid, terminalId);
      
      this.sendMessage(client.ws, {
        type: 'command_history_result' as any,
        terminalId,
        data: {
          history
        }
      });
    } catch (error) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: {
          error: error instanceof Error ? error.message : 'Failed to get command history'
        }
      });
    }
  }

  private handleToolHistory(client: ConnectedClient, message: WebSocketMessage): void {
    if (!client.authenticated || !client.uuid) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: 'Authentication required for tool history'
      });
      return;
    }

    if (!this.commandRoutingEngine) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: 'Command routing engine not available'
      });
      return;
    }

    const { tool } = message;
    
    if (!tool) {
      // Return all tool histories if no specific tool requested
      try {
        const histories = this.commandRoutingEngine.getUserToolHistories(client.uuid);
        
        this.sendMessage(client.ws, {
          type: 'tool_histories_result' as any,
          data: {
            histories
          }
        });
      } catch (error) {
        this.sendMessage(client.ws, {
          type: 'error' as any,
          data: {
            error: error instanceof Error ? error.message : 'Failed to get tool histories'
          }
        });
      }
      return;
    }

    try {
      const history = this.commandRoutingEngine.getToolHistory(client.uuid, tool);
      
      this.sendMessage(client.ws, {
        type: 'tool_history_result' as any,
        data: {
          tool,
          history
        }
      });
    } catch (error) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: {
          error: error instanceof Error ? error.message : 'Failed to get tool history'
        }
      });
    }
  }

  private handleLayoutGet(client: ConnectedClient, message: WebSocketMessage): void {
    if (!client.authenticated || !client.uuid) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: 'Authentication required for layout operations'
      });
      return;
    }

    if (!this.layoutManager) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: 'Layout manager not available'
      });
      return;
    }

    const { layoutId } = message;
    if (layoutId) {
      const layout = this.layoutManager.getLayout(client.uuid, layoutId);
      this.sendMessage(client.ws, {
        type: 'layout_get_result' as any,
        layoutId,
        data: { layout }
      });
    } else {
      const currentLayout = this.layoutManager.getCurrentLayout(client.uuid);
      this.sendMessage(client.ws, {
        type: 'layout_get_result' as any,
        data: { layout: currentLayout }
      });
    }
  }

  private handleLayoutSet(client: ConnectedClient, message: WebSocketMessage): void {
    if (!client.authenticated || !client.uuid) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: 'Authentication required for layout operations'
      });
      return;
    }

    if (!this.layoutManager) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: 'Layout manager not available'
      });
      return;
    }

    const { layoutId } = message;
    if (!layoutId) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: 'Layout ID required'
      });
      return;
    }

    const success = this.layoutManager.setCurrentLayout(client.uuid, layoutId);
    this.sendMessage(client.ws, {
      type: 'layout_set_result' as any,
      layoutId,
      data: { success }
    });
  }

  private handleLayoutCreate(client: ConnectedClient, message: WebSocketMessage): void {
    if (!client.authenticated || !client.uuid) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: 'Authentication required for layout operations'
      });
      return;
    }

    if (!this.layoutManager) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: 'Layout manager not available'
      });
      return;
    }

    const { data } = message;
    if (!data || !data.name) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: 'Layout name required'
      });
      return;
    }

    try {
      const layout = this.layoutManager.createLayout(client.uuid, data.name, data);
      this.sendMessage(client.ws, {
        type: 'layout_create_result' as any,
        data: { layout }
      });
    } catch (error) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: {
          error: error instanceof Error ? error.message : 'Failed to create layout'
        }
      });
    }
  }

  private handleLayoutUpdate(client: ConnectedClient, message: WebSocketMessage): void {
    if (!client.authenticated || !client.uuid) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: 'Authentication required for layout operations'
      });
      return;
    }

    if (!this.layoutManager) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: 'Layout manager not available'
      });
      return;
    }

    const { layoutId, data } = message;
    if (!layoutId) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: 'Layout ID required'
      });
      return;
    }

    const success = this.layoutManager.updateLayout(client.uuid, layoutId, data);
    this.sendMessage(client.ws, {
      type: 'layout_update_result' as any,
      layoutId,
      data: { success }
    });
  }

  private handleLayoutDelete(client: ConnectedClient, message: WebSocketMessage): void {
    if (!client.authenticated || !client.uuid) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: 'Authentication required for layout operations'
      });
      return;
    }

    if (!this.layoutManager) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: 'Layout manager not available'
      });
      return;
    }

    const { layoutId } = message;
    if (!layoutId) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: 'Layout ID required'
      });
      return;
    }

    const success = this.layoutManager.deleteLayout(client.uuid, layoutId);
    this.sendMessage(client.ws, {
      type: 'layout_delete_result' as any,
      layoutId,
      data: { success }
    });
  }

  private handleLayoutList(client: ConnectedClient, message: WebSocketMessage): void {
    if (!client.authenticated || !client.uuid) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: 'Authentication required for layout operations'
      });
      return;
    }

    if (!this.layoutManager) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: 'Layout manager not available'
      });
      return;
    }

    const layouts = this.layoutManager.getAllLayouts(client.uuid);
    this.sendMessage(client.ws, {
      type: 'layout_list_result' as any,
      data: { layouts }
    });
  }

  private handleLayoutState(client: ConnectedClient, message: WebSocketMessage): void {
    if (!client.authenticated || !client.uuid) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: 'Authentication required for layout operations'
      });
      return;
    }

    if (!this.layoutManager) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: 'Layout manager not available'
      });
      return;
    }

    const { data } = message;
    if (data) {
      // Update state
      const success = this.layoutManager.updateLayoutState(client.uuid, data);
      this.sendMessage(client.ws, {
        type: 'layout_state_result' as any,
        data: { success }
      });
    } else {
      // Get current state
      const state = this.layoutManager.getLayoutState(client.uuid);
      this.sendMessage(client.ws, {
        type: 'layout_state_result' as any,
        data: { state }
      });
    }
  }

  private handleLayoutPaneAssign(client: ConnectedClient, message: WebSocketMessage): void {
    if (!client.authenticated || !client.uuid) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: 'Authentication required for layout operations'
      });
      return;
    }

    if (!this.layoutManager) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: 'Layout manager not available'
      });
      return;
    }

    const { paneId, terminalId } = message;
    if (!paneId || !terminalId) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: 'Pane ID and terminal ID required'
      });
      return;
    }

    const success = this.layoutManager.assignTerminalToPane(client.uuid, paneId, terminalId);
    this.sendMessage(client.ws, {
      type: 'layout_pane_assign_result' as any,
      paneId,
      terminalId,
      data: { success }
    });
  }

  private handleLayoutPaneRemove(client: ConnectedClient, message: WebSocketMessage): void {
    if (!client.authenticated || !client.uuid) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: 'Authentication required for layout operations'
      });
      return;
    }

    if (!this.layoutManager) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: 'Layout manager not available'
      });
      return;
    }

    const { paneId } = message;
    if (!paneId) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: 'Pane ID required'
      });
      return;
    }

    const success = this.layoutManager.removeTerminalFromPane(client.uuid, paneId);
    this.sendMessage(client.ws, {
      type: 'layout_pane_remove_result' as any,
      paneId,
      data: { success }
    });
  }

  private handleLayoutComparison(client: ConnectedClient, message: WebSocketMessage): void {
    if (!client.authenticated || !client.uuid) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: 'Authentication required for layout operations'
      });
      return;
    }

    if (!this.layoutManager) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: 'Layout manager not available'
      });
      return;
    }

    const { data } = message;
    if (!data) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: 'Comparison mode data required'
      });
      return;
    }

    const success = this.layoutManager.setComparisonMode(client.uuid, data.enabled, data.panes || []);
    this.sendMessage(client.ws, {
      type: 'layout_comparison_result' as any,
      data: { success }
    });
  }

  private handleLayoutSyncScroll(client: ConnectedClient, message: WebSocketMessage): void {
    if (!client.authenticated || !client.uuid) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: 'Authentication required for layout operations'
      });
      return;
    }

    if (!this.layoutManager) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: 'Layout manager not available'
      });
      return;
    }

    const { data } = message;
    if (typeof data?.enabled !== 'boolean') {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: 'Sync scroll enabled flag required'
      });
      return;
    }

    const success = this.layoutManager.setSyncScrolling(client.uuid, data.enabled);
    this.sendMessage(client.ws, {
      type: 'layout_sync_scroll_result' as any,
      data: { success }
    });
  }

  private handleLayoutExport(client: ConnectedClient, message: WebSocketMessage): void {
    if (!client.authenticated || !client.uuid) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: 'Authentication required for layout operations'
      });
      return;
    }

    if (!this.layoutManager) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: 'Layout manager not available'
      });
      return;
    }

    const { layoutId } = message;
    if (!layoutId) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: 'Layout ID required'
      });
      return;
    }

    const exportData = this.layoutManager.exportLayout(client.uuid, layoutId);
    this.sendMessage(client.ws, {
      type: 'layout_export_result' as any,
      layoutId,
      data: { exportData }
    });
  }

  private handleLayoutImport(client: ConnectedClient, message: WebSocketMessage): void {
    if (!client.authenticated || !client.uuid) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: 'Authentication required for layout operations'
      });
      return;
    }

    if (!this.layoutManager) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: 'Layout manager not available'
      });
      return;
    }

    const { data } = message;
    if (!data || !data.layoutData) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: 'Layout data required'
      });
      return;
    }

    const layout = this.layoutManager.importLayout(client.uuid, data.layoutData);
    this.sendMessage(client.ws, {
      type: 'layout_import_result' as any,
      data: { layout, success: !!layout }
    });
  }

  // Collaboration Message Handlers
  private handleSessionShare(client: ConnectedClient, message: WebSocketMessage): void {
    if (!client.authenticated || !client.uuid) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: 'Authentication required for collaboration'
      });
      return;
    }

    if (!this.collaborationManager) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: 'Collaboration manager not available'
      });
      return;
    }

    const { terminalId, name, description, permissions } = message.data || {};
    if (!terminalId || !name) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: 'Terminal ID and session name required'
      });
      return;
    }

    try {
      const session = this.collaborationManager.createSharedSession(
        terminalId,
        client.uuid,
        name,
        description,
        permissions
      );

      this.sendMessage(client.ws, {
        type: 'session_share_result' as any,
        data: { session, success: true }
      });
    } catch (error) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: `Failed to create shared session: ${error}`
      });
    }
  }

  private handleSessionJoin(client: ConnectedClient, message: WebSocketMessage): void {
    if (!client.authenticated || !client.uuid) return;
    if (!this.collaborationManager) return;

    const { sessionId } = message;
    if (!sessionId) return;

    const success = this.collaborationManager.joinSharedSession(sessionId, client.uuid);
    this.sendMessage(client.ws, {
      type: 'session_join_result' as any,
      data: { sessionId, success }
    });
  }

  private handleSessionLeave(client: ConnectedClient, message: WebSocketMessage): void {
    if (!client.authenticated || !client.uuid) return;
    if (!this.collaborationManager) return;

    const { sessionId } = message;
    if (!sessionId) return;

    const success = this.collaborationManager.leaveSharedSession(sessionId, client.uuid);
    this.sendMessage(client.ws, {
      type: 'session_leave_result' as any,
      data: { sessionId, success }
    });
  }

  private handleCursorPosition(client: ConnectedClient, message: WebSocketMessage): void {
    if (!client.authenticated || !client.uuid) return;
    if (!this.collaborationManager) return;

    const { sessionId, cursorPosition } = message;
    if (!sessionId || !cursorPosition) return;

    this.collaborationManager.updateCursorPosition(
      sessionId,
      client.uuid,
      cursorPosition.line,
      cursorPosition.column
    );
  }

  private handleCommentAdd(client: ConnectedClient, message: WebSocketMessage): void {
    if (!client.authenticated || !client.uuid) return;
    if (!this.collaborationManager) return;

    const { sessionId, data } = message;
    if (!sessionId || !data?.content) return;

    try {
      const comment = this.collaborationManager.addComment(
        sessionId,
        client.uuid,
        data.content,
        data.position
      );

      this.sendMessage(client.ws, {
        type: 'comment_add_result' as any,
        data: { comment, success: true }
      });
    } catch (error) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: `Failed to add comment: ${error}`
      });
    }
  }

  private handleCommentUpdate(client: ConnectedClient, message: WebSocketMessage): void {
    if (!client.authenticated || !client.uuid) return;
    if (!this.collaborationManager) return;

    const { commentId, data } = message;
    if (!commentId || !data) return;

    const success = this.collaborationManager.updateComment(commentId, client.uuid, data);
    this.sendMessage(client.ws, {
      type: 'comment_update_result' as any,
      data: { commentId, success }
    });
  }

  private handleCommentDelete(client: ConnectedClient, message: WebSocketMessage): void {
    if (!client.authenticated || !client.uuid) return;
    if (!this.collaborationManager) return;

    const { commentId } = message;
    if (!commentId) return;

    const success = this.collaborationManager.deleteComment(commentId, client.uuid);
    this.sendMessage(client.ws, {
      type: 'comment_delete_result' as any,
      data: { commentId, success }
    });
  }

  private handleRecordingStart(client: ConnectedClient, message: WebSocketMessage): void {
    if (!client.authenticated || !client.uuid) return;
    if (!this.collaborationManager) return;

    const { sessionId, data } = message;
    if (!sessionId || !data?.name) return;

    try {
      const recording = this.collaborationManager.startRecording(sessionId, client.uuid, data.name);
      this.sendMessage(client.ws, {
        type: 'recording_start_result' as any,
        data: { recording, success: true }
      });
    } catch (error) {
      this.sendMessage(client.ws, {
        type: 'error' as any,
        data: `Failed to start recording: ${error}`
      });
    }
  }

  private handleRecordingStop(client: ConnectedClient, message: WebSocketMessage): void {
    if (!client.authenticated || !client.uuid) return;
    if (!this.collaborationManager) return;

    const { sessionId } = message;
    if (!sessionId) return;

    const recording = this.collaborationManager.stopRecording(sessionId, client.uuid);
    this.sendMessage(client.ws, {
      type: 'recording_stop_result' as any,
      data: { recording, success: !!recording }
    });
  }

  private handleRecordingPlay(client: ConnectedClient, message: WebSocketMessage): void {
    if (!client.authenticated || !client.uuid) return;
    if (!this.collaborationManager) return;

    const { recordingId } = message;
    if (!recordingId) return;

    const recording = this.collaborationManager.getRecording(recordingId);
    this.sendMessage(client.ws, {
      type: 'recording_play_result' as any,
      data: { recording, success: !!recording }
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

  close(): void {
    this.destroy();
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