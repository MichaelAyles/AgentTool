import { io as ioClient, Socket } from 'socket.io-client';
import { logger } from './utils/logger.js';
import { CLIAdapterManager } from './services/cli-adapter-manager.js';
import { ProcessManager } from './services/process-manager.js';
import { ProjectManager } from './services/project-manager.js';
import { TerminalManager } from './services/terminal-manager.js';

export interface DesktopConnectorOptions {
  sessionId: string;
  centralUrl?: string;
  dataDir: string;
  autoReconnect?: boolean;
}

export class DesktopConnector {
  private socket: Socket;
  private cliAdapterManager: CLIAdapterManager;
  private processManager: ProcessManager;
  private projectManager: ProjectManager;
  private terminalManager: TerminalManager;
  private options: DesktopConnectorOptions;
  private reconnectInterval?: NodeJS.Timeout;

  constructor(options: DesktopConnectorOptions) {
    this.options = {
      centralUrl: 'https://vibe.theduck.chat',
      autoReconnect: true,
      ...options,
    };

    this.initializeServices();
    this.initializeConnection();
  }

  private initializeServices() {
    this.cliAdapterManager = new CLIAdapterManager(this.options.dataDir);
    this.processManager = new ProcessManager();
    this.projectManager = new ProjectManager(this.options.dataDir);
    this.terminalManager = new TerminalManager();
  }

  private initializeConnection() {
    const socketUrl = `${this.options.centralUrl}/desktop-connector`;

    logger.info('Connecting to central service', {
      url: socketUrl,
      sessionId: this.options.sessionId,
    });

    this.socket = ioClient(socketUrl, {
      auth: {
        sessionId: this.options.sessionId,
        type: 'desktop-connector',
        version: '1.0.0',
      },
      autoConnect: true,
      reconnection: this.options.autoReconnect,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    this.setupSocketHandlers();
  }

  private setupSocketHandlers() {
    // Connection events
    this.socket.on('connect', () => {
      logger.info('Connected to central service', {
        sessionId: this.options.sessionId,
        socketId: this.socket.id,
      });

      // Register this connector with the session
      this.socket.emit('connector:register', {
        sessionId: this.options.sessionId,
        metadata: {
          version: '1.0.0',
          platform: process.platform,
          nodeVersion: process.version,
          rootDirectory: process.cwd(),
          timestamp: new Date().toISOString(),
        },
      });
    });

    this.socket.on('disconnect', reason => {
      logger.warn('Disconnected from central service', {
        reason,
        sessionId: this.options.sessionId,
      });

      if (this.options.autoReconnect && reason === 'io server disconnect') {
        // Server-initiated disconnect, try to reconnect
        setTimeout(() => this.socket.connect(), 1000);
      }
    });

    this.socket.on('connect_error', error => {
      logger.error('Connection error', { error: error.message });
    });

    // Command execution requests from frontend
    this.socket.on('command:execute', async data => {
      try {
        logger.info('Executing command', {
          command: data.command,
          sessionId: data.sessionId,
        });

        const result = await this.executeCommand(
          data.command,
          data.options || {}
        );

        this.socket.emit('command:result', {
          sessionId: data.sessionId,
          commandId: data.commandId,
          success: true,
          result,
        });
      } catch (error) {
        logger.error('Command execution failed', { error: error.message });

        this.socket.emit('command:result', {
          sessionId: data.sessionId,
          commandId: data.commandId,
          success: false,
          error: error.message,
        });
      }
    });

    // Terminal events
    this.socket.on('terminal:create', async data => {
      try {
        const terminal = await this.terminalManager.createTerminal(data);

        this.socket.emit('terminal:created', {
          sessionId: data.sessionId,
          terminalId: data.terminalId,
          success: true,
          terminal,
        });
      } catch (error) {
        this.socket.emit('terminal:created', {
          sessionId: data.sessionId,
          terminalId: data.terminalId,
          success: false,
          error: error.message,
        });
      }
    });

    this.socket.on('terminal:input', data => {
      this.terminalManager.handleInput(data.terminalId, data.input);
    });

    this.socket.on('terminal:resize', data => {
      this.terminalManager.resize(data.terminalId, data.size);
    });

    // Process management
    this.socket.on('process:start', async data => {
      try {
        const process = await this.processManager.startProcess(data);

        this.socket.emit('process:started', {
          sessionId: data.sessionId,
          processId: data.processId,
          success: true,
          process,
        });
      } catch (error) {
        this.socket.emit('process:started', {
          sessionId: data.sessionId,
          processId: data.processId,
          success: false,
          error: error.message,
        });
      }
    });

    // Project management
    this.socket.on('project:list', async data => {
      try {
        const projects = await this.projectManager.getProjects();

        this.socket.emit('project:list:result', {
          sessionId: data.sessionId,
          success: true,
          projects,
        });
      } catch (error) {
        this.socket.emit('project:list:result', {
          sessionId: data.sessionId,
          success: false,
          error: error.message,
        });
      }
    });

    this.socket.on('project:create', async data => {
      try {
        const project = await this.projectManager.createProject(data.project);

        this.socket.emit('project:created', {
          sessionId: data.sessionId,
          success: true,
          project,
        });
      } catch (error) {
        this.socket.emit('project:created', {
          sessionId: data.sessionId,
          success: false,
          error: error.message,
        });
      }
    });
  }

  private async executeCommand(
    command: string,
    options: any = {}
  ): Promise<any> {
    // This will be implemented based on the CLI adapter system
    logger.info('Executing command', { command, options });

    // For now, just return a mock result
    return {
      command,
      output: `Mock output for: ${command}`,
      exitCode: 0,
      timestamp: new Date().toISOString(),
    };
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Connect to central service
      this.socket.connect();

      // Wait for successful connection
      this.socket.once('connect', () => {
        logger.info('Desktop connector started', {
          sessionId: this.options.sessionId,
          centralUrl: this.options.centralUrl,
          dataDir: this.options.dataDir,
        });
        resolve();
      });

      this.socket.once('connect_error', error => {
        logger.error('Failed to connect to central service', { error });
        reject(error);
      });

      // Set a timeout for connection
      setTimeout(() => {
        if (!this.socket.connected) {
          reject(
            new Error(
              'Connection timeout - could not connect to central service'
            )
          );
        }
      }, 10000);
    });
  }

  async stop(): Promise<void> {
    return new Promise(resolve => {
      if (this.reconnectInterval) {
        clearInterval(this.reconnectInterval);
      }

      this.socket.disconnect();

      logger.info('Desktop connector stopped', {
        sessionId: this.options.sessionId,
      });

      resolve();
    });
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  getSessionId(): string {
    return this.options.sessionId;
  }

  getCentralUrl(): string {
    return this.options.centralUrl!;
  }
}
