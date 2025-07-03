import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { TerminalManager } from './terminal';
import { WebSocketManager } from './websocket';
import { SessionDatabase } from './database';
import { ProjectManager } from './project';

export class DuckBridgeConnector {
  private app: express.Application;
  private terminalManager: TerminalManager;
  private websocketManager: WebSocketManager;
  private database: SessionDatabase;
  private projectManager: ProjectManager;
  private httpPort: number;
  private wsPort: number;
  private uuid: string;

  constructor(httpPort: number = 3001, wsPort: number = 3002) {
    this.httpPort = httpPort;
    this.wsPort = wsPort;
    this.uuid = uuidv4();

    // Initialize components
    this.database = new SessionDatabase();
    this.terminalManager = new TerminalManager();
    this.projectManager = new ProjectManager();
    this.websocketManager = new WebSocketManager(this.wsPort, this.terminalManager, this.database);

    // Setup Express app
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // CORS configuration
    this.app.use(cors({
      origin: [
        'http://localhost:3000',
        'http://localhost:8000',
        'https://frontend-three-delta-48.vercel.app',
        'https://vibe.theduck.chat',
        /\.vercel\.app$/
      ],
      credentials: true
    }));

    this.app.use(express.json());
    this.app.use(express.static('public'));

    // Request logging
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
      next();
    });
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      const resourceUsage = this.terminalManager.getResourceUsage();
      res.json({
        status: 'healthy',
        uuid: this.uuid,
        timestamp: new Date().toISOString(),
        sessions: {
          active: resourceUsage.activeTerminals,
          total: resourceUsage.totalTerminals
        },
        websocket: {
          port: this.wsPort,
          clients: this.websocketManager.getConnectedClients().length
        },
        resources: {
          memory: {
            used: Math.round(resourceUsage.memoryUsage.heapUsed / 1024 / 1024),
            total: Math.round(resourceUsage.memoryUsage.heapTotal / 1024 / 1024),
            external: Math.round(resourceUsage.memoryUsage.external / 1024 / 1024),
            unit: 'MB'
          },
          limits: resourceUsage.limits
        }
      });
    });

    // Get connector info
    this.app.get('/info', (req, res) => {
      res.json({
        name: 'DuckBridge Connector',
        version: '0.1.0',
        uuid: this.uuid,
        platform: process.platform,
        node_version: process.version,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        websocket_url: `ws://localhost:${this.wsPort}`,
        http_url: `http://localhost:${this.httpPort}`
      });
    });

    // Generate new UUID
    this.app.post('/generate-uuid', (req, res) => {
      const newUuid = uuidv4();
      res.json({ 
        uuid: newUuid,
        websocket_url: `ws://localhost:${this.wsPort}`,
        instructions: [
          `Use this UUID to connect from the web interface`,
          `WebSocket endpoint: ws://localhost:${this.wsPort}`,
          `Or connect directly at: https://frontend-three-delta-48.vercel.app`
        ]
      });
    });

    // List active sessions
    this.app.get('/sessions', (req, res) => {
      const dbSessions = this.database.getActiveSessions();
      const terminalSessions = this.terminalManager.getActiveSessions();
      
      res.json({
        database_sessions: dbSessions,
        terminal_sessions: terminalSessions.map(ts => ({
          id: ts.id,
          uuid: ts.uuid,
          isActive: ts.isActive,
          createdAt: ts.createdAt,
          lastActivity: ts.lastActivity
        })),
        websocket_clients: this.websocketManager.getConnectedClients().map(client => ({
          uuid: client.uuid,
          authenticated: client.authenticated,
          lastPing: new Date(client.lastPing)
        }))
      });
    });

    // Terminate session
    this.app.delete('/sessions/:uuid', (req, res) => {
      const { uuid } = req.params;
      
      // Terminate terminal session
      const terminated = this.terminalManager.terminateSession(uuid);
      
      // Update database
      this.database.updateSessionStatus(uuid, 'terminated');
      
      res.json({
        success: terminated,
        message: terminated ? 'Session terminated' : 'Session not found'
      });
    });

    // Project management endpoints
    this.app.get('/projects/:uuid', (req, res) => {
      const { uuid } = req.params;
      const projects = this.projectManager.getUserProjects(uuid);
      res.json({ projects });
    });

    this.app.post('/projects/:uuid', (req, res) => {
      const { uuid } = req.params;
      const { name, path, description, color, type, gitUrl, gitBranch, settings } = req.body;

      if (!name || !path) {
        return res.status(400).json({
          error: 'Missing required fields: name and path'
        });
      }

      // Validate Git requirements
      if (type === 'clone-git' && !gitUrl) {
        return res.status(400).json({
          error: 'Git URL is required for cloning repositories'
        });
      }

      try {
        const project = this.projectManager.createProject(uuid, name, path, {
          description,
          color,
          type,
          gitUrl,
          gitBranch,
          settings
        });

        res.json({
          success: true,
          project
        });
      } catch (error) {
        res.status(400).json({
          error: error instanceof Error ? error.message : 'Failed to create project'
        });
      }
    });

    this.app.get('/projects/:uuid/:projectId', (req, res) => {
      const { uuid, projectId } = req.params;
      const project = this.projectManager.getProject(uuid, projectId);
      
      if (!project) {
        return res.status(404).json({
          error: 'Project not found'
        });
      }

      res.json({ project });
    });

    this.app.put('/projects/:uuid/:projectId', (req, res) => {
      const { uuid, projectId } = req.params;
      const updates = req.body;

      const success = this.projectManager.updateProject(uuid, projectId, updates);
      
      if (!success) {
        return res.status(404).json({
          error: 'Project not found'
        });
      }

      const project = this.projectManager.getProject(uuid, projectId);
      res.json({
        success: true,
        project
      });
    });

    this.app.delete('/projects/:uuid/:projectId', (req, res) => {
      const { uuid, projectId } = req.params;
      const success = this.projectManager.deleteProject(uuid, projectId);
      
      res.json({
        success,
        message: success ? 'Project deleted' : 'Project not found'
      });
    });

    this.app.post('/projects/:uuid/:projectId/access', (req, res) => {
      const { uuid, projectId } = req.params;
      const project = this.projectManager.accessProject(uuid, projectId);
      
      if (!project) {
        return res.status(404).json({
          error: 'Project not found'
        });
      }

      res.json({
        success: true,
        project
      });
    });

    // Directory browsing endpoint
    this.app.get('/browse-directory', (req, res) => {
      const { path, type } = req.query;
      
      if (!path || typeof path !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Path parameter is required'
        });
      }

      try {
        const items = this.projectManager.browseDirectory(path as string, type as string);
        res.json({
          success: true,
          items,
          path
        });
      } catch (error) {
        res.status(400).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to browse directory'
        });
      }
    });

    // Scan directory for git repositories
    this.app.get('/scan-git-repos', (req, res) => {
      const { path, depth } = req.query;
      
      if (!path || typeof path !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Path parameter is required'
        });
      }

      try {
        const maxDepth = parseInt(depth as string) || 3;
        const repos = this.projectManager.scanForGitRepositories(path as string, maxDepth);
        res.json({
          success: true,
          repositories: repos,
          path
        });
      } catch (error) {
        res.status(400).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to scan for repositories'
        });
      }
    });

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Not found',
        available_endpoints: [
          'GET /health',
          'GET /info', 
          'POST /generate-uuid',
          'GET /sessions',
          'DELETE /sessions/:uuid',
          'GET /projects/:uuid',
          'POST /projects/:uuid',
          'GET /projects/:uuid/:projectId',
          'PUT /projects/:uuid/:projectId',
          'DELETE /projects/:uuid/:projectId',
          'POST /projects/:uuid/:projectId/access'
        ]
      });
    });

    // Error handler
    this.app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      console.error('API Error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Start HTTP server
        const server = this.app.listen(this.httpPort, () => {
          console.log('🦆 DuckBridge Connector Started');
          console.log('==============================');
          console.log(`📡 HTTP API: http://localhost:${this.httpPort}`);
          console.log(`🔌 WebSocket: ws://localhost:${this.wsPort}`);
          console.log(`🆔 Connector UUID: ${this.uuid}`);
          console.log('📱 Frontend: https://frontend-three-delta-48.vercel.app');
          console.log('================================');
          console.log('');
          console.log('💡 Quick Start:');
          console.log(`   1. Visit https://frontend-three-delta-48.vercel.app`);
          console.log(`   2. Enter UUID: ${this.uuid}`);
          console.log('   3. Start coding!');
          console.log('');
          
          resolve();
        });

        server.on('error', (error) => {
          console.error('Failed to start HTTP server:', error);
          reject(error);
        });

        // Graceful shutdown handlers
        process.on('SIGINT', () => this.shutdown('SIGINT'));
        process.on('SIGTERM', () => this.shutdown('SIGTERM'));
        process.on('uncaughtException', (error) => {
          console.error('Uncaught Exception:', error);
          this.shutdown('uncaughtException');
        });
        process.on('unhandledRejection', (reason, promise) => {
          console.error('Unhandled Rejection at:', promise, 'reason:', reason);
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  private shutdown(signal: string): void {
    console.log(`\n🛑 Shutting down DuckBridge Connector (${signal})...`);
    
    // Cleanup resources
    this.websocketManager.destroy();
    this.terminalManager.destroy();
    this.projectManager.destroy();
    this.database.close();
    
    console.log('✅ Cleanup completed');
    process.exit(0);
  }

  // Getters for testing/external access
  get connector_uuid(): string { return this.uuid; }
  get http_port(): number { return this.httpPort; }
  get websocket_port(): number { return this.wsPort; }
}

// Export for programmatic use
export default DuckBridgeConnector;

// CLI execution
if (require.main === module) {
  const connector = new DuckBridgeConnector();
  
  connector.start().catch((error) => {
    console.error('Failed to start DuckBridge Connector:', error);
    process.exit(1);
  });
}