import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from './utils/logger.js';
import { CLIAdapterManager } from './services/cli-adapter-manager.js';
import { ProcessManager } from './services/process-manager.js';
import { ProjectManager } from './services/project-manager.js';
import { TerminalManager } from './services/terminal-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface DesktopConnectorOptions {
  port: number;
  host: string;
  dataDir: string;
  openBrowser: boolean;
  sessionId?: string;
}

export class DesktopConnector {
  private app: express.Application;
  private server: any;
  private io: Server;
  private cliAdapterManager: CLIAdapterManager;
  private processManager: ProcessManager;
  private projectManager: ProjectManager;
  private terminalManager: TerminalManager;
  private options: DesktopConnectorOptions;

  constructor(options: DesktopConnectorOptions) {
    this.options = options;
    this.app = express();
    this.server = createServer(this.app);
    this.io = new Server(this.server, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    });

    this.setupMiddleware();
    this.initializeServices();
    this.setupRoutes();
    this.setupWebSocket();
  }

  private setupMiddleware() {
    // Security middleware
    this.app.use(
      helmet({
        contentSecurityPolicy: false, // Disable for local development
        crossOriginEmbedderPolicy: false,
      })
    );

    // CORS
    this.app.use(
      cors({
        origin: true,
        credentials: true,
      })
    );

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Logging
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });
      next();
    });
  }

  private initializeServices() {
    this.cliAdapterManager = new CLIAdapterManager(this.options.dataDir);
    this.processManager = new ProcessManager();
    this.projectManager = new ProjectManager(this.options.dataDir);
    this.terminalManager = new TerminalManager(this.io);
  }

  private setupRoutes() {
    // Health check
    this.app.get('/api/v1/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '1.0.0',
      });
    });

    // System information
    this.app.get('/api/v1/system/info', (req, res) => {
      res.json({
        success: true,
        data: {
          rootDirectory: process.cwd(),
          version: '1.0.0',
          platform: process.platform,
          nodeVersion: process.version,
          timestamp: new Date().toISOString(),
          type: 'desktop-connector',
          sessionId: this.options.sessionId,
        },
      });
    });

    // Session management
    this.app.get('/api/v1/sessions/:sessionId/status', (req, res) => {
      const { sessionId } = req.params;
      // For now, we'll assume all sessions are valid if we have the connector running
      // In a real implementation, you'd check if the session actually exists
      res.json({
        success: true,
        data: {
          sessionId,
          status: 'active',
          connectedAt: new Date().toISOString(),
          connector: 'desktop-connector',
        },
      });
    });

    this.app.post('/api/v1/sessions', (req, res) => {
      const { sessionId } = req.body;
      // Create or activate a session
      res.json({
        success: true,
        data: {
          sessionId: sessionId || require('uuid').v4(),
          status: 'created',
          createdAt: new Date().toISOString(),
        },
      });
    });

    // Graceful shutdown
    this.app.post('/api/v1/shutdown', (req, res) => {
      res.json({ success: true, message: 'Shutting down...' });
      setTimeout(() => process.exit(0), 1000);
    });

    // CLI Adapters
    this.app.get('/api/v1/cli/adapters', async (req, res) => {
      try {
        const adapters = await this.cliAdapterManager.getAvailableAdapters();
        res.json({ success: true, data: adapters });
      } catch (error) {
        logger.error('Error getting CLI adapters:', error);
        res
          .status(500)
          .json({ success: false, error: 'Failed to get CLI adapters' });
      }
    });

    this.app.post('/api/v1/cli/adapters/:name/install', async (req, res) => {
      try {
        const { name } = req.params;
        await this.cliAdapterManager.installAdapter(name);
        res.json({ success: true, message: `Adapter ${name} installed` });
      } catch (error) {
        logger.error(`Error installing adapter ${req.params.name}:`, error);
        res
          .status(500)
          .json({ success: false, error: 'Failed to install adapter' });
      }
    });

    // Projects
    this.app.get('/api/v1/projects', async (req, res) => {
      try {
        const projects = await this.projectManager.getProjects();
        res.json({ success: true, data: projects });
      } catch (error) {
        logger.error('Error getting projects:', error);
        res
          .status(500)
          .json({ success: false, error: 'Failed to get projects' });
      }
    });

    this.app.post('/api/v1/projects', async (req, res) => {
      try {
        const project = await this.projectManager.createProject(req.body);
        res.json({ success: true, data: project });
      } catch (error) {
        logger.error('Error creating project:', error);
        res
          .status(500)
          .json({ success: false, error: 'Failed to create project' });
      }
    });

    // Processes
    this.app.get('/api/v1/processes', async (req, res) => {
      try {
        const processes = await this.processManager.getProcesses();
        res.json({ success: true, data: processes });
      } catch (error) {
        logger.error('Error getting processes:', error);
        res
          .status(500)
          .json({ success: false, error: 'Failed to get processes' });
      }
    });

    this.app.post('/api/v1/processes', async (req, res) => {
      try {
        const process = await this.processManager.startProcess(req.body);
        res.json({ success: true, data: process });
      } catch (error) {
        logger.error('Error starting process:', error);
        res
          .status(500)
          .json({ success: false, error: 'Failed to start process' });
      }
    });

    // Serve static files (for embedded frontend)
    const frontendPath = path.join(__dirname, '../../frontend/dist');
    this.app.use(express.static(frontendPath));

    // SPA fallback
    this.app.get('*', (req, res) => {
      res.sendFile(path.join(frontendPath, 'index.html'));
    });
  }

  private setupWebSocket() {
    this.io.on('connection', socket => {
      logger.info('Client connected', { socketId: socket.id });

      socket.on('disconnect', () => {
        logger.info('Client disconnected', { socketId: socket.id });
        this.terminalManager.cleanup(socket.id);
      });

      // Terminal events
      socket.on('terminal:create', async data => {
        try {
          await this.terminalManager.createTerminal(socket, data);
        } catch (error) {
          socket.emit('terminal:created', {
            success: false,
            error:
              error instanceof Error
                ? error.message
                : 'Failed to create terminal',
          });
        }
      });

      socket.on('terminal:input', data => {
        this.terminalManager.handleInput(socket.id, data);
      });

      socket.on('terminal:resize', data => {
        this.terminalManager.resize(socket.id, data);
      });

      // Process events
      socket.on('process:start', async data => {
        try {
          const process = await this.processManager.startProcess(data);
          socket.emit('process:started', { success: true, data: process });
        } catch (error) {
          socket.emit('process:started', {
            success: false,
            error: error.message,
          });
        }
      });
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.listen(
        this.options.port,
        this.options.host,
        (error?: Error) => {
          if (error) {
            reject(error);
          } else {
            logger.info('Desktop connector started', {
              host: this.options.host,
              port: this.options.port,
              dataDir: this.options.dataDir,
            });
            resolve();
          }
        }
      );
    });
  }

  async stop(): Promise<void> {
    return new Promise(resolve => {
      this.server.close(() => {
        logger.info('Desktop connector stopped');
        resolve();
      });
    });
  }
}
