import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { TerminalManager } from './terminal';
import { WebSocketManager } from './websocket';
import { SessionDatabase } from './database';
import { ProjectManager } from './project';
import { ToolDetectionService } from './tools';
import { CommandRoutingEngine } from './routing';
import { AgentSystem } from './agents/agent-system';
import { AgentMessageBus } from './agents/message-bus';
import { AgentTask } from './agents/types';

export class DuckBridgeConnector {
  private app: express.Application;
  private terminalManager: TerminalManager;
  private websocketManager: WebSocketManager;
  private database: SessionDatabase;
  private projectManager: ProjectManager;
  private toolDetectionService: ToolDetectionService;
  private commandRoutingEngine: CommandRoutingEngine;
  private agentSystem: AgentSystem;
  private messageBus: AgentMessageBus;
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
    this.toolDetectionService = new ToolDetectionService();
    this.commandRoutingEngine = new CommandRoutingEngine(this.toolDetectionService);
    this.websocketManager = new WebSocketManager(this.wsPort, this.terminalManager, this.database);
    
    // Initialize agent system components
    this.messageBus = new AgentMessageBus();
    this.agentSystem = new AgentSystem({
      autoSpawnDefault: true,
      maxAgents: 10,
      enableLogging: true,
      enableMetrics: true,
      healthCheckInterval: 30000
    });
    
    // Set the routing engine on the WebSocket manager
    this.websocketManager.setCommandRoutingEngine(this.commandRoutingEngine);

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

    this.app.post('/projects/:uuid/:projectId/refresh-git', (req, res) => {
      const { uuid, projectId } = req.params;
      
      try {
        const gitInfo = this.projectManager.refreshGitInfo(uuid, projectId);
        
        if (!gitInfo) {
          return res.status(404).json({
            error: 'Project not found or not a git repository'
          });
        }

        res.json({
          success: true,
          gitInfo
        });
      } catch (error) {
        res.status(400).json({
          error: error instanceof Error ? error.message : 'Failed to refresh git info'
        });
      }
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

    // Tool Detection API endpoints
    this.app.get('/tools', async (req, res) => {
      try {
        const tools = await this.toolDetectionService.detectAllTools();
        res.json({
          success: true,
          tools,
          statistics: this.toolDetectionService.getToolStatistics()
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to detect tools'
        });
      }
    });

    this.app.get('/tools/:toolName', async (req, res) => {
      try {
        const { toolName } = req.params;
        const tool = await this.toolDetectionService.detectTool(toolName);
        res.json({
          success: true,
          tool
        });
      } catch (error) {
        res.status(404).json({
          success: false,
          error: error instanceof Error ? error.message : 'Tool not found'
        });
      }
    });

    this.app.post('/tools/:toolName/refresh', async (req, res) => {
      try {
        const { toolName } = req.params;
        const tool = await this.toolDetectionService.refreshToolStatus(toolName);
        res.json({
          success: true,
          tool
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to refresh tool status'
        });
      }
    });

    this.app.post('/tools/refresh', async (req, res) => {
      try {
        const tools = await this.toolDetectionService.refreshAllTools();
        res.json({
          success: true,
          tools,
          statistics: this.toolDetectionService.getToolStatistics()
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to refresh all tools'
        });
      }
    });

    this.app.get('/tools/category/:category', async (req, res) => {
      try {
        const { category } = req.params;
        const tools = this.toolDetectionService.getToolsByCategory(category);
        res.json({
          success: true,
          tools,
          category
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get tools by category'
        });
      }
    });

    this.app.get('/tools/:toolName/install-guide', (req, res) => {
      try {
        const { toolName } = req.params;
        const guides = this.toolDetectionService.getInstallationGuides(toolName);
        res.json({
          success: true,
          guides,
          toolName
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get installation guides'
        });
      }
    });

    this.app.get('/tools/statistics', (req, res) => {
      try {
        const statistics = this.toolDetectionService.getToolStatistics();
        res.json({
          success: true,
          statistics
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get tool statistics'
        });
      }
    });

    this.app.get('/tools/installed', (req, res) => {
      try {
        const installedTools = this.toolDetectionService.getInstalledTools();
        res.json({
          success: true,
          tools: installedTools,
          count: installedTools.length
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get installed tools'
        });
      }
    });

    this.app.get('/tools/missing', (req, res) => {
      try {
        const missingTools = this.toolDetectionService.getMissingTools();
        res.json({
          success: true,
          tools: missingTools,
          count: missingTools.length
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get missing tools'
        });
      }
    });

    // Command Routing API endpoints
    this.app.post('/routing/parse', (req, res) => {
      try {
        const { command } = req.body;
        
        if (!command || typeof command !== 'string') {
          return res.status(400).json({
            success: false,
            error: 'Command parameter is required'
          });
        }

        const commandInfo = this.commandRoutingEngine.getParser().parseCommand(command);
        res.json({
          success: true,
          commandInfo
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to parse command'
        });
      }
    });

    this.app.post('/routing/execute', async (req, res) => {
      try {
        const { uuid, terminalId, command, workingDirectory } = req.body;
        
        if (!uuid || !terminalId || !command) {
          return res.status(400).json({
            success: false,
            error: 'Missing required parameters: uuid, terminalId, command'
          });
        }

        const result = await this.commandRoutingEngine.routeCommand(
          uuid,
          terminalId,
          command,
          workingDirectory
        );

        res.json({
          success: true,
          result
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to execute command'
        });
      }
    });

    this.app.get('/routing/history/:uuid/:terminalId', (req, res) => {
      try {
        const { uuid, terminalId } = req.params;
        const history = this.commandRoutingEngine.getTerminalHistory(uuid, terminalId);
        
        res.json({
          success: true,
          history
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get terminal history'
        });
      }
    });

    this.app.get('/routing/tool-history/:uuid/:tool', (req, res) => {
      try {
        const { uuid, tool } = req.params;
        const history = this.commandRoutingEngine.getToolHistory(uuid, tool);
        
        res.json({
          success: true,
          history
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get tool history'
        });
      }
    });

    this.app.get('/routing/tool-histories/:uuid', (req, res) => {
      try {
        const { uuid } = req.params;
        const histories = this.commandRoutingEngine.getUserToolHistories(uuid);
        
        res.json({
          success: true,
          histories
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get tool histories'
        });
      }
    });

    this.app.get('/routing/recent-commands/:uuid/:tool', (req, res) => {
      try {
        const { uuid, tool } = req.params;
        const { limit } = req.query;
        
        const commands = this.commandRoutingEngine.getRecentCommands(
          uuid, 
          tool, 
          limit ? parseInt(limit as string) : 10
        );
        
        res.json({
          success: true,
          commands
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get recent commands'
        });
      }
    });

    this.app.get('/routing/stats/:uuid', (req, res) => {
      try {
        const { uuid } = req.params;
        const stats = this.commandRoutingEngine.getHistoryStats(uuid);
        
        res.json({
          success: true,
          stats
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get history stats'
        });
      }
    });

    this.app.delete('/routing/history/:uuid', (req, res) => {
      try {
        const { uuid } = req.params;
        this.commandRoutingEngine.clearUserHistory(uuid);
        
        res.json({
          success: true,
          message: 'User history cleared'
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to clear history'
        });
      }
    });

    this.app.delete('/routing/process/:terminalId', (req, res) => {
      try {
        const { terminalId } = req.params;
        const killed = this.commandRoutingEngine.killProcess(terminalId);
        
        res.json({
          success: true,
          killed
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to kill process'
        });
      }
    });

    this.app.get('/routing/active-processes', (req, res) => {
      try {
        const processes = this.commandRoutingEngine.getActiveProcesses();
        
        res.json({
          success: true,
          processes
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get active processes'
        });
      }
    });

    this.app.post('/routing/agent-tool', (req, res) => {
      try {
        const { name, config } = req.body;
        
        if (!name || !config) {
          return res.status(400).json({
            success: false,
            error: 'Missing required parameters: name, config'
          });
        }

        this.commandRoutingEngine.addAgentTool(name, config);
        
        res.json({
          success: true,
          message: 'Agent tool added successfully'
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to add agent tool'
        });
      }
    });

    this.app.delete('/routing/agent-tool/:name', (req, res) => {
      try {
        const { name } = req.params;
        this.commandRoutingEngine.removeAgentTool(name);
        
        res.json({
          success: true,
          message: 'Agent tool removed successfully'
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to remove agent tool'
        });
      }
    });

    // AI Agent System API endpoints
    this.app.get('/agents', (req, res) => {
      try {
        const systemStatus = this.agentSystem.getSystemStatus();
        const agentStatuses = this.agentSystem.getAgentStatuses();
        
        res.json({
          success: true,
          system: systemStatus,
          agents: agentStatuses
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get agent status'
        });
      }
    });

    this.app.post('/agents/tasks', async (req, res) => {
      try {
        const { type, description, context, requirements, metadata } = req.body;
        
        if (!type || !description) {
          return res.status(400).json({
            success: false,
            error: 'Task type and description are required'
          });
        }

        const task: AgentTask = {
          id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type,
          priority: 'medium',
          description,
          context: context || {},
          requirements: requirements || { tools: [], capabilities: [] },
          metadata: {
            createdAt: new Date(),
            ...metadata
          }
        };

        const taskId = await this.agentSystem.submitTask(task);
        
        res.json({
          success: true,
          taskId,
          message: 'Task submitted successfully'
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to submit task'
        });
      }
    });

    this.app.get('/agents/tasks/:taskId', async (req, res) => {
      try {
        const { taskId } = req.params;
        const task = await this.agentSystem.getTaskStatus(taskId);
        
        if (!task) {
          return res.status(404).json({
            success: false,
            error: 'Task not found'
          });
        }

        res.json({
          success: true,
          task
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get task status'
        });
      }
    });

    this.app.get('/agents/tasks/:taskId/result', async (req, res) => {
      try {
        const { taskId } = req.params;
        const result = await this.agentSystem.getTaskResult(taskId);
        
        if (!result) {
          return res.status(404).json({
            success: false,
            error: 'Task result not found'
          });
        }

        res.json({
          success: true,
          result
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get task result'
        });
      }
    });

    this.app.post('/agents/create', async (req, res) => {
      try {
        const { agentType, config } = req.body;
        
        if (!agentType) {
          return res.status(400).json({
            success: false,
            error: 'Agent type is required'
          });
        }

        const agentId = await this.agentSystem.createAgent(agentType, config);
        
        res.json({
          success: true,
          agentId,
          message: 'Agent created successfully'
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to create agent'
        });
      }
    });

    this.app.delete('/agents/:agentId', async (req, res) => {
      try {
        const { agentId } = req.params;
        await this.agentSystem.destroyAgent(agentId);
        
        res.json({
          success: true,
          message: 'Agent destroyed successfully'
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to destroy agent'
        });
      }
    });

    this.app.post('/agents/:agentId/restart', async (req, res) => {
      try {
        const { agentId } = req.params;
        await this.agentSystem.restartAgent(agentId);
        
        res.json({
          success: true,
          message: 'Agent restarted successfully'
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to restart agent'
        });
      }
    });

    this.app.get('/agents/metrics', (req, res) => {
      try {
        const metrics = this.agentSystem.getAgentMetrics();
        
        res.json({
          success: true,
          metrics
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get agent metrics'
        });
      }
    });

    this.app.get('/agents/messages', (req, res) => {
      try {
        const { limit } = req.query;
        const messages = this.agentSystem.getMessageHistory(
          limit ? parseInt(limit as string) : undefined
        );
        
        res.json({
          success: true,
          messages
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get message history'
        });
      }
    });

    this.app.post('/agents/:agentId/message', async (req, res) => {
      try {
        const { agentId } = req.params;
        const { type, data, priority } = req.body;
        
        if (!type) {
          return res.status(400).json({
            success: false,
            error: 'Message type is required'
          });
        }

        await this.agentSystem.sendMessageToAgent(agentId, {
          type,
          toAgent: agentId,
          data,
          priority: priority || 'medium'
        });
        
        res.json({
          success: true,
          message: 'Message sent successfully'
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to send message'
        });
      }
    });

    this.app.post('/agents/broadcast', async (req, res) => {
      try {
        const { type, data, priority } = req.body;
        
        if (!type) {
          return res.status(400).json({
            success: false,
            error: 'Message type is required'
          });
        }

        await this.agentSystem.broadcastMessage({
          type,
          data,
          priority: priority || 'medium'
        });
        
        res.json({
          success: true,
          message: 'Broadcast sent successfully'
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to send broadcast'
        });
      }
    });

    this.app.get('/agents/aggregations', (req, res) => {
      try {
        const aggregations = this.agentSystem.getAggregationHistory();
        
        res.json({
          success: true,
          aggregations
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get aggregation history'
        });
      }
    });

    this.app.delete('/agents/history', async (req, res) => {
      try {
        const { agentId } = req.query;
        await this.agentSystem.clearTaskHistory(agentId as string);
        
        res.json({
          success: true,
          message: 'History cleared successfully'
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to clear history'
        });
      }
    });

    this.app.get('/agents/export', (req, res) => {
      try {
        const systemState = this.agentSystem.exportSystemState();
        
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename="agent-system-state.json"');
        res.send(systemState);
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to export system state'
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
          'POST /projects/:uuid/:projectId/access',
          'POST /projects/:uuid/:projectId/refresh-git',
          'GET /tools',
          'GET /tools/:toolName',
          'POST /tools/:toolName/refresh',
          'POST /tools/refresh',
          'GET /tools/category/:category',
          'GET /tools/:toolName/install-guide',
          'GET /tools/statistics',
          'GET /tools/installed',
          'GET /tools/missing',
          'POST /routing/parse',
          'POST /routing/execute',
          'GET /routing/history/:uuid/:terminalId',
          'GET /routing/tool-history/:uuid/:tool',
          'GET /routing/tool-histories/:uuid',
          'GET /routing/recent-commands/:uuid/:tool',
          'GET /routing/stats/:uuid',
          'DELETE /routing/history/:uuid',
          'DELETE /routing/process/:terminalId',
          'GET /routing/active-processes',
          'POST /routing/agent-tool',
          'DELETE /routing/agent-tool/:name'
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
    try {
      // Initialize agent system first
      console.log('🤖 Initializing AI Agent System...');
      await this.messageBus.initialize();
      await this.agentSystem.initialize();
      console.log('✅ AI Agent System initialized');
      
      return new Promise((resolve, reject) => {
        try {
          // Start HTTP server
          const server = this.app.listen(this.httpPort, () => {
            console.log('🦆 DuckBridge Connector Started');
            console.log('==============================');
            console.log(`📡 HTTP API: http://localhost:${this.httpPort}`);
            console.log(`🔌 WebSocket: ws://localhost:${this.wsPort}`);
            console.log(`🆔 Connector UUID: ${this.uuid}`);
            console.log('🤖 AI Agent System: Active');
            console.log('📱 Frontend: https://frontend-three-delta-48.vercel.app');
            console.log('================================');
            console.log('');
            console.log('💡 Quick Start:');
            console.log(`   1. Visit https://frontend-three-delta-48.vercel.app`);
            console.log(`   2. Enter UUID: ${this.uuid}`);
            console.log('   3. Start coding with AI agents!');
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
    } catch (error) {
      console.error('Failed to initialize Agent System:', error);
      throw error;
    }
  }

  private async shutdown(signal: string): Promise<void> {
    console.log(`\n🛑 Shutting down DuckBridge Connector (${signal})...`);
    
    try {
      // Shutdown agent system first
      console.log('🤖 Shutting down AI Agent System...');
      await this.agentSystem.shutdown();
      await this.messageBus.shutdown();
      console.log('✅ AI Agent System shut down');
      
      // Cleanup other resources
      this.websocketManager.destroy();
      this.terminalManager.destroy();
      this.projectManager.destroy();
      this.database.close();
      
      // Cleanup all routing engine processes and history
      const activeProcesses = this.commandRoutingEngine.getActiveProcesses();
      activeProcesses.forEach(terminalId => {
        this.commandRoutingEngine.killProcess(terminalId);
      });
      
      console.log('✅ Cleanup completed');
    } catch (error) {
      console.error('Error during shutdown:', error);
    } finally {
      process.exit(0);
    }
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