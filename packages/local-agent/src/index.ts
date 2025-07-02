#!/usr/bin/env node

import express from 'express';
import { spawn } from 'child_process';
import { WebSocketServer } from 'ws';
// Import node-pty conditionally since it's an optional dependency
let pty: any = null;
try {
  pty = require('node-pty');
} catch (error) {
  console.warn(
    'node-pty not available - terminal functionality will be limited'
  );
}
import axios from 'axios';
import ngrok from 'ngrok';
import { v4 as uuidv4 } from 'uuid';
import chalk from 'chalk';
import ora from 'ora';
import { EventEmitter } from 'events';

export interface LocalAgentConfig {
  sessionId: string;
  serverUrl: string;
  port?: number;
  ngrokToken?: string;
  platform?: string;
  version?: string;
}

export interface TerminalSession {
  id: string;
  pty: any; // pty.IPty when available
  lastActivity: number;
  cwd: string;
}

export class LocalAgent extends EventEmitter {
  private app: express.Application;
  private server: any;
  private wss: WebSocketServer | null = null;
  private tunnelUrl: string | null = null;
  private config: LocalAgentConfig;
  private terminals = new Map<string, TerminalSession>();
  private isRunning = false;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(config: LocalAgentConfig) {
    super();
    this.config = {
      port: 3001,
      platform: process.platform,
      version: '1.0.0',
      ...config,
    };

    this.app = express();
    this.setupExpress();
  }

  private setupExpress(): void {
    this.app.use(express.json());

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        sessionId: this.config.sessionId,
        platform: this.config.platform,
        version: this.config.version,
        tunnelUrl: this.tunnelUrl,
        activeTerminals: this.terminals.size,
      });
    });

    // Terminal creation endpoint
    this.app.post('/terminal', (req, res) => {
      try {
        if (!pty) {
          return res.status(503).json({
            success: false,
            error: 'Terminal functionality not available',
            details: 'node-pty dependency not installed',
          });
        }

        const { cwd = process.cwd(), shell, cols = 80, rows = 24 } = req.body;

        const terminalId = uuidv4();
        const defaultShell = process.platform === 'win32' ? 'cmd.exe' : 'bash';

        const ptyProcess = pty.spawn(shell || defaultShell, [], {
          name: 'xterm-color',
          cols,
          rows,
          cwd,
          env: {
            ...process.env,
            TERM: 'xterm-256color',
          },
        });

        const session: TerminalSession = {
          id: terminalId,
          pty: ptyProcess,
          lastActivity: Date.now(),
          cwd,
        };

        this.terminals.set(terminalId, session);

        // Clean up on process exit
        ptyProcess.onExit(() => {
          this.terminals.delete(terminalId);
        });

        res.json({
          success: true,
          terminalId,
          message: 'Terminal created successfully',
        });
      } catch (error) {
        console.error('Error creating terminal:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to create terminal',
          details: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Terminal command execution
    this.app.post('/terminal/:terminalId/command', (req, res) => {
      try {
        const { terminalId } = req.params;
        const { command } = req.body;

        if (!command) {
          return res.status(400).json({
            success: false,
            error: 'Command is required',
          });
        }

        const session = this.terminals.get(terminalId);
        if (!session) {
          return res.status(404).json({
            success: false,
            error: 'Terminal not found',
          });
        }

        session.pty.write(command);
        session.lastActivity = Date.now();

        res.json({
          success: true,
          message: 'Command sent to terminal',
        });
      } catch (error) {
        console.error('Error executing command:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to execute command',
          details: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Terminal resize
    this.app.post('/terminal/:terminalId/resize', (req, res) => {
      try {
        const { terminalId } = req.params;
        const { cols, rows } = req.body;

        const session = this.terminals.get(terminalId);
        if (!session) {
          return res.status(404).json({
            success: false,
            error: 'Terminal not found',
          });
        }

        session.pty.resize(cols || 80, rows || 24);
        session.lastActivity = Date.now();

        res.json({
          success: true,
          message: 'Terminal resized',
        });
      } catch (error) {
        console.error('Error resizing terminal:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to resize terminal',
          details: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // List active terminals
    this.app.get('/terminals', (req, res) => {
      const terminalList = Array.from(this.terminals.values()).map(session => ({
        id: session.id,
        cwd: session.cwd,
        lastActivity: session.lastActivity,
        isActive: Date.now() - session.lastActivity < 5 * 60 * 1000, // 5 minutes
      }));

      res.json({
        success: true,
        terminals: terminalList,
        count: terminalList.length,
      });
    });

    // Delete terminal
    this.app.delete('/terminal/:terminalId', (req, res) => {
      try {
        const { terminalId } = req.params;
        const session = this.terminals.get(terminalId);

        if (!session) {
          return res.status(404).json({
            success: false,
            error: 'Terminal not found',
          });
        }

        session.pty.kill();
        this.terminals.delete(terminalId);

        res.json({
          success: true,
          message: 'Terminal deleted',
        });
      } catch (error) {
        console.error('Error deleting terminal:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to delete terminal',
          details: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });
  }

  private setupWebSocket(): void {
    if (!this.server) {
      throw new Error('HTTP server not started');
    }

    this.wss = new WebSocketServer({ server: this.server });

    this.wss.on('connection', (ws, req) => {
      console.log(chalk.blue('WebSocket connection established'));

      ws.on('message', data => {
        try {
          const message = JSON.parse(data.toString());
          this.handleWebSocketMessage(ws, message);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
          ws.send(
            JSON.stringify({
              type: 'error',
              error: 'Invalid message format',
            })
          );
        }
      });

      ws.on('close', () => {
        console.log(chalk.yellow('WebSocket connection closed'));
      });

      ws.on('error', error => {
        console.error('WebSocket error:', error);
      });

      // Send welcome message
      ws.send(
        JSON.stringify({
          type: 'welcome',
          sessionId: this.config.sessionId,
          message: 'Connected to Vibe Code local agent',
        })
      );
    });
  }

  private handleWebSocketMessage(ws: any, message: any): void {
    const { type, terminalId, data } = message;

    switch (type) {
      case 'terminal_attach':
        this.attachToTerminal(ws, terminalId);
        break;

      case 'terminal_input':
        this.sendToTerminal(terminalId, data);
        break;

      case 'terminal_resize':
        this.resizeTerminal(terminalId, data.cols, data.rows);
        break;

      default:
        ws.send(
          JSON.stringify({
            type: 'error',
            error: `Unknown message type: ${type}`,
          })
        );
    }
  }

  private attachToTerminal(ws: any, terminalId: string): void {
    const session = this.terminals.get(terminalId);
    if (!session) {
      ws.send(
        JSON.stringify({
          type: 'error',
          error: 'Terminal not found',
          terminalId,
        })
      );
      return;
    }

    // Forward terminal output to WebSocket
    session.pty.onData(data => {
      ws.send(
        JSON.stringify({
          type: 'terminal_output',
          terminalId,
          data,
        })
      );
    });

    ws.send(
      JSON.stringify({
        type: 'terminal_attached',
        terminalId,
        message: 'Attached to terminal',
      })
    );
  }

  private sendToTerminal(terminalId: string, data: string): void {
    const session = this.terminals.get(terminalId);
    if (session) {
      session.pty.write(data);
      session.lastActivity = Date.now();
    }
  }

  private resizeTerminal(terminalId: string, cols: number, rows: number): void {
    const session = this.terminals.get(terminalId);
    if (session) {
      session.pty.resize(cols, rows);
      session.lastActivity = Date.now();
    }
  }

  private async establishTunnel(): Promise<string> {
    const spinner = ora('Establishing secure tunnel...').start();

    try {
      // Connect to ngrok
      const url = await ngrok.connect({
        port: this.config.port!,
        proto: 'http',
        authtoken: this.config.ngrokToken,
      });

      spinner.succeed(`Tunnel established: ${chalk.green(url)}`);
      this.tunnelUrl = url;
      return url;
    } catch (error) {
      spinner.fail('Failed to establish tunnel');
      throw error;
    }
  }

  private async registerWithServer(): Promise<void> {
    if (!this.tunnelUrl) {
      throw new Error('Tunnel not established');
    }

    const spinner = ora('Registering with Vibe Code server...').start();

    try {
      const response = await axios.post(
        `${this.config.serverUrl}/api/v1/connection/register`,
        {
          sessionId: this.config.sessionId,
          tunnelUrl: this.tunnelUrl,
          clientInfo: {
            platform: this.config.platform,
            version: this.config.version,
            nodeVersion: process.version,
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Client-Platform': this.config.platform,
            'X-Client-Version': this.config.version,
          },
          timeout: 10000,
        }
      );

      if (response.status === 200) {
        spinner.succeed('Successfully registered with Vibe Code server');
        this.emit('registered', { tunnelUrl: this.tunnelUrl });
      } else {
        throw new Error(`Registration failed with status ${response.status}`);
      }
    } catch (error) {
      spinner.fail('Failed to register with server');
      throw error;
    }
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(async () => {
      try {
        if (this.tunnelUrl) {
          await axios.get(`${this.config.serverUrl}/api/v1/connection/status`, {
            params: { sessionId: this.config.sessionId },
            timeout: 5000,
          });
        }
      } catch (error) {
        console.warn(
          chalk.yellow('Heartbeat failed:'),
          error instanceof Error ? error.message : 'Unknown error'
        );
      }
    }, 30000); // Every 30 seconds
  }

  private cleanupInactiveTerminals(): void {
    const now = Date.now();
    const timeout = 30 * 60 * 1000; // 30 minutes

    for (const [terminalId, session] of this.terminals) {
      if (now - session.lastActivity > timeout) {
        console.log(
          chalk.yellow(`Cleaning up inactive terminal: ${terminalId}`)
        );
        session.pty.kill();
        this.terminals.delete(terminalId);
      }
    }
  }

  public async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Agent is already running');
    }

    console.log(chalk.blue('🚀 Starting Vibe Code Local Agent'));
    console.log(chalk.gray(`Session ID: ${this.config.sessionId}`));
    console.log(chalk.gray(`Server URL: ${this.config.serverUrl}`));
    console.log('');

    // Start HTTP server
    const spinner = ora('Starting local server...').start();
    this.server = this.app.listen(this.config.port, () => {
      spinner.succeed(
        `Local server running on port ${chalk.green(this.config.port)}`
      );
    });

    // Setup WebSocket
    this.setupWebSocket();

    // Establish tunnel
    await this.establishTunnel();

    // Register with main server
    await this.registerWithServer();

    // Start maintenance tasks
    this.startHeartbeat();
    setInterval(() => this.cleanupInactiveTerminals(), 5 * 60 * 1000); // Every 5 minutes

    this.isRunning = true;

    console.log('');
    console.log(chalk.green('✅ Local agent is running!'));
    console.log(
      chalk.cyan(
        'You can now use the Vibe Code web interface to interact with your local terminal.'
      )
    );
    console.log('');
    console.log(chalk.yellow('Press Ctrl+C to stop the agent'));
    console.log('');

    this.emit('started');
  }

  public async stop(): Promise<void> {
    console.log(chalk.yellow('\n🛑 Stopping Vibe Code Local Agent...'));

    this.isRunning = false;

    // Clear intervals
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Close all terminals
    for (const [terminalId, session] of this.terminals) {
      console.log(chalk.gray(`Closing terminal: ${terminalId}`));
      session.pty.kill();
    }
    this.terminals.clear();

    // Close WebSocket server
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    // Close HTTP server
    if (this.server) {
      this.server.close();
      this.server = null;
    }

    // Disconnect tunnel
    if (this.tunnelUrl) {
      try {
        await ngrok.disconnect();
        console.log(chalk.gray('Tunnel disconnected'));
      } catch (error) {
        console.warn(chalk.yellow('Warning: Failed to disconnect tunnel'));
      }
      this.tunnelUrl = null;
    }

    console.log(chalk.green('✅ Local agent stopped'));
    this.emit('stopped');
  }

  public getStatus(): object {
    return {
      running: this.isRunning,
      sessionId: this.config.sessionId,
      tunnelUrl: this.tunnelUrl,
      activeTerminals: this.terminals.size,
      serverUrl: this.config.serverUrl,
      platform: this.config.platform,
      version: this.config.version,
    };
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nReceived SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nReceived SIGTERM, shutting down gracefully...');
  process.exit(0);
});

export { LocalAgentConfig, TerminalSession };
