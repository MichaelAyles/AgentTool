import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { setupRoutes } from './api/index.js';
import { setupWebSocket } from './websocket/index.js';
import { ProcessManager } from './processes/index.js';
import { AdapterRegistry } from '@vibecode/adapter-sdk';
import { db } from './database/index.js';
import { v4 as uuidv4 } from 'uuid';
import {
  requestLogger,
  errorLogger,
  errorHandler,
  notFoundHandler,
  cors,
  helmet,
  rateLimit,
  sanitizeInput,
  structuredLogger,
} from './middleware/index.js';
import {
  metricsMiddleware,
  metricsHandler,
  metrics,
} from './middleware/metrics.js';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || [
      'http://localhost:5173',
    ],
    credentials: true,
  },
});

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || [
      'http://localhost:5173',
    ],
    credentials: true,
  })
);

// Rate limiting
app.use(
  '/api/',
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.NODE_ENV === 'production' ? 100 : 1000, // Requests per window
    message: 'Too many requests from this IP',
  })
);

// Body parsing and sanitization
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(sanitizeInput());

// Logging middleware
app.use(requestLogger);
app.use(errorLogger);

// Metrics middleware
app.use(metricsMiddleware);

// Services
const adapterRegistry = new AdapterRegistry();
const processManager = new ProcessManager(adapterRegistry);

// Initialize adapters
async function initializeAdapters() {
  try {
    // Load Claude Code adapter
    const { ClaudeCodeAdapter } = await import(
      '../../../adapters/claude-code/src/index.js'
    );
    const claudeAdapter = new ClaudeCodeAdapter();
    await adapterRegistry.register(claudeAdapter);
    console.log('✅ Registered Claude Code adapter');
  } catch (error) {
    console.warn('⚠️ Could not load Claude Code adapter:', error.message);
  }

  try {
    // Load Gemini CLI adapter
    const { GeminiCLIAdapter } = await import(
      '../../../adapters/gemini-cli/src/index.js'
    );
    const geminiAdapter = new GeminiCLIAdapter();
    await adapterRegistry.register(geminiAdapter);
    console.log('✅ Registered Gemini CLI adapter');
  } catch (error) {
    console.warn('⚠️ Could not load Gemini CLI adapter:', error.message);
  }
}

// Initialize adapters on startup
initializeAdapters().catch(console.error);

// Ensure we have a temporary user for development
function ensureTempUser() {
  try {
    const tempUser = db.getUserById('dev-user');
    if (!tempUser) {
      db.createUser({
        id: 'dev-user',
        username: 'dev',
        email: 'dev@example.com',
        displayName: 'Development User',
        role: 'admin' as any,
        providers: [
          {
            provider: 'local' as any,
            providerId: 'dev-user',
            email: 'dev@example.com',
            connected: new Date(),
          },
        ],
        settings: {
          dangerousModeEnabled: true,
        },
        created: new Date(),
        active: true,
      });

      // Set a default password for development
      db.updateUserPassword(
        'dev-user',
        '$2a$10$dummy.hash.for.development.only'
      );

      console.log('✅ Created development user (dev@example.com)');
    }
  } catch (error) {
    console.warn('⚠️ Could not create development user:', error.message);
  }
}

// Only create dev user in development
if (process.env.NODE_ENV !== 'production') {
  ensureTempUser();
}

// Make database available to middleware
app.set('database', db);

// Initialize security context system
import { createSecuritySessionTracker } from './security/session-tracker.js';
const securityTracker = createSecuritySessionTracker(db);
app.set('securityTracker', securityTracker);

// Initialize dangerous mode integration
import { dangerousModeIntegration } from './dangerous/integration.js';
dangerousModeIntegration.initialize();
dangerousModeIntegration.registerDefaultRecipients();
console.log('✅ Dangerous mode integration initialized');

// Initialize process queue system
import { processQueueManager } from './queue/index.js';
processQueueManager.initialize().catch(error => {
  console.warn(
    '⚠️ Queue system initialization failed (Redis may not be available):',
    error.message
  );
  console.log('📝 Queue system will work with in-memory fallback');
});

// Initialize process lifecycle management
import { processLifecycleManager } from './processes/lifecycle-manager.js';
processLifecycleManager.initialize();
console.log('✅ Process lifecycle manager initialized');

// Initialize process cleanup handler
import { processCleanupHandler } from './processes/cleanup-handler.js';
processCleanupHandler.initialize();
console.log('✅ Process cleanup handler initialized');

// Initialize adapter lifecycle manager
import { createAdapterLifecycleManager } from './adapters/lifecycle-manager.js';
const adapterLifecycleManagerInstance =
  createAdapterLifecycleManager(adapterRegistry);
adapterLifecycleManagerInstance.initialize();
console.log('✅ Adapter lifecycle manager initialized');

// Initialize adapter configuration manager
import { adapterConfigManager } from './services/adapter-config-manager.js';
import { registerDefaultSchemas } from './services/adapter-schemas.js';
adapterConfigManager
  .initialize()
  .then(async () => {
    await registerDefaultSchemas(adapterConfigManager);
  })
  .catch(error => {
    console.warn(
      '⚠️ Adapter configuration manager initialization failed:',
      error.message
    );
  });
console.log('✅ Adapter configuration manager initialized');

// Initialize MCP bridge service
import { mcpBridge } from './services/mcp-bridge.js';
mcpBridge.initialize().catch(error => {
  console.warn('⚠️ MCP bridge service initialization failed:', error.message);
});
console.log('✅ MCP bridge service initialized');

// Initialize adapter marketplace
import { adapterMarketplace } from './services/adapter-marketplace.js';
adapterMarketplace.initialize().catch(error => {
  console.warn('⚠️ Adapter marketplace initialization failed:', error.message);
});
console.log('✅ Adapter marketplace initialized');

// Initialize CLI health monitor
import { cliHealthMonitor } from './services/cli-health-monitor.js';
cliHealthMonitor.initialize().catch(error => {
  console.warn('⚠️ CLI health monitor initialization failed:', error.message);
});
console.log('✅ CLI health monitor initialized');

// Initialize MCP connection manager
import { mcpConnectionManager } from './services/mcp-connection-manager.js';
// Connection manager is initialized on first use
console.log('✅ MCP connection manager ready');

// Initialize MCP discovery service
import { mcpDiscoveryService } from './services/mcp-discovery-service.js';
mcpDiscoveryService.initialize().catch(error => {
  console.warn(
    '⚠️ MCP discovery service initialization failed:',
    error.message
  );
});
console.log('✅ MCP discovery service initialized');

// Initialize MCP message handler
import { mcpMessageHandler } from './services/mcp-message-handler.js';
mcpMessageHandler.initialize().catch(error => {
  console.warn('⚠️ MCP message handler initialization failed:', error.message);
});
console.log('✅ MCP message handler initialized');

// Initialize MCP server registry
import { mcpServerRegistry } from './services/mcp-server-registry.js';
mcpServerRegistry.initialize().catch(error => {
  console.warn('⚠️ MCP server registry initialization failed:', error.message);
});
console.log('✅ MCP server registry initialized');

// Initialize validation storage
import { validationStorage } from './services/validation-storage.js';
validationStorage.initializeDatabase().catch(error => {
  console.warn('⚠️ Validation storage initialization failed:', error.message);
});
console.log('✅ Validation storage initialized');

// Serve install script
const projectRoot = path.resolve(__dirname, '../../../');
app.get('/install.sh', (req, res) => {
  const installScriptPath = path.join(projectRoot, 'install.sh');
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Disposition', 'inline; filename="install.sh"');
  res.sendFile(installScriptPath);
});

// Routes
setupRoutes(app, { adapterRegistry, processManager });

// Metrics endpoint
app.get('/metrics', metricsHandler);

// WebSocket
setupWebSocket(io, { adapterRegistry, processManager });

// Error handling middleware (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

// Graceful shutdown
process.on('SIGTERM', () => {
  structuredLogger.info('SIGTERM received, shutting down gracefully');
  mcpBridge.cleanup();
  cliHealthMonitor.cleanup();
  mcpConnectionManager.cleanup();
  server.close(() => {
    structuredLogger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  structuredLogger.info('SIGINT received, shutting down gracefully');
  mcpBridge.cleanup();
  cliHealthMonitor.cleanup();
  mcpConnectionManager.cleanup();
  server.close(() => {
    structuredLogger.info('Server closed');
    process.exit(0);
  });
});

// Unhandled rejection/exception handling
process.on('unhandledRejection', (reason, promise) => {
  structuredLogger.error('Unhandled rejection', reason as Error, { promise });
  process.exit(1);
});

process.on('uncaughtException', error => {
  structuredLogger.error('Uncaught exception', error);
  process.exit(1);
});

server.listen(PORT, () => {
  structuredLogger.info(`Vibe Code backend running on port ${PORT}`, {
    environment: process.env.NODE_ENV || 'development',
    port: PORT,
  });

  // Function to display the user-friendly output
  const displayStartupInfo = () => {
    console.log('\n🎉 Vibe Code is ready!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🌐 Web Application:  http://localhost:5173');
    console.log('🔗 Backend API:      http://localhost:' + PORT);
    console.log('⚡ WebSocket:        ws://localhost:' + PORT);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💡 Click the links above or copy them to your browser');
    console.log('🛑 Press Ctrl+C to stop the servers\n');
  };

  // Display immediately
  displayStartupInfo();

  // Display again after a delay to ensure it's visible after TypeScript output
  setTimeout(displayStartupInfo, 3000);

  // And once more after TypeScript has settled
  setTimeout(displayStartupInfo, 8000);
});

export { app, server, io };
