import { WebSocketServer, WebSocket } from 'ws';
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { WebSocketManager } from './websocket';
import { TerminalManager } from './terminal';
import { SessionDatabase } from './database';

export class SSLWebSocketManager extends WebSocketManager {
  private httpsServer?: https.Server;
  private httpServer?: http.Server;

  constructor(port: number, terminalManager: TerminalManager, database: SessionDatabase) {
    super(port, terminalManager, database);
  }

  protected createWebSocketServer(port: number): WebSocketServer {
    // Try to create SSL server first
    try {
      const sslDir = path.join(process.env.HOME || '', '.vibe-coding', 'ssl');
      const keyPath = path.join(sslDir, 'key.pem');
      const certPath = path.join(sslDir, 'cert.pem');

      // Create SSL directory if it doesn't exist
      if (!fs.existsSync(sslDir)) {
        fs.mkdirSync(sslDir, { recursive: true });
      }

      // Generate self-signed certificate if it doesn't exist
      if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
        console.log('🔐 Generating self-signed SSL certificate...');
        this.generateSelfSignedCert(sslDir, keyPath, certPath);
      }

      // Create HTTPS server
      this.httpsServer = https.createServer({
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath)
      });

      // Create WebSocket server with HTTPS server
      const wss = new WebSocketServer({ 
        server: this.httpsServer,
        verifyClient: this.verifyClient.bind(this)
      });

      // Start HTTPS server
      this.httpsServer.listen(port, () => {
        console.log(`🔒 Secure WebSocket (WSS) server listening on port ${port}`);
      });

      // Also create HTTP->WS fallback on different port
      this.createHttpFallback(port + 1);

      return wss;
    } catch (error) {
      console.error('❌ Failed to create SSL WebSocket server:', error);
      console.log('⚠️  Falling back to non-SSL WebSocket...');
      
      // Fallback to regular WebSocket
      return new WebSocketServer({ 
        port,
        verifyClient: this.verifyClient.bind(this)
      });
    }
  }

  private generateSelfSignedCert(sslDir: string, keyPath: string, certPath: string): void {
    try {
      // Generate self-signed certificate using openssl
      const opensslCmd = `openssl req -x509 -newkey rsa:4096 -keyout "${keyPath}" -out "${certPath}" -days 365 -nodes -subj "/C=US/ST=State/L=City/O=VibeCoding/CN=localhost"`;
      execSync(opensslCmd, { stdio: 'ignore' });
      console.log('✅ Self-signed certificate generated');
    } catch (error) {
      throw new Error('Failed to generate self-signed certificate. Make sure OpenSSL is installed.');
    }
  }

  private createHttpFallback(port: number): void {
    // Create HTTP server for non-SSL fallback
    this.httpServer = http.createServer();
    
    const wsServer = new WebSocketServer({ 
      server: this.httpServer,
      verifyClient: this.verifyClient.bind(this)
    });

    // Forward all WebSocket events to main handler
    wsServer.on('connection', this.handleConnection.bind(this));

    this.httpServer.listen(port, () => {
      console.log(`🔌 Non-SSL WebSocket (WS) fallback listening on port ${port}`);
    });
  }

  public close(): void {
    super.close();
    
    if (this.httpsServer) {
      this.httpsServer.close();
    }
    
    if (this.httpServer) {
      this.httpServer.close();
    }
  }
}