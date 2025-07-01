import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
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

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173'],
    credentials: true,
  },
});

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173'],
  credentials: true,
}));

// Rate limiting
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 100 : 1000, // Requests per window
  message: 'Too many requests from this IP',
}));

// Body parsing and sanitization
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(sanitizeInput());

// Logging middleware
app.use(requestLogger);
app.use(errorLogger);

// Services
const adapterRegistry = new AdapterRegistry();
const processManager = new ProcessManager(adapterRegistry);

// Initialize adapters
async function initializeAdapters() {
  try {
    // Load Claude Code adapter
    const { ClaudeCodeAdapter } = await import('../../../adapters/claude-code/src/index.js');
    const claudeAdapter = new ClaudeCodeAdapter();
    await adapterRegistry.register(claudeAdapter);
    console.log('✅ Registered Claude Code adapter');
  } catch (error) {
    console.warn('⚠️ Could not load Claude Code adapter:', error.message);
  }

  try {
    // Load Gemini CLI adapter
    const { GeminiCLIAdapter } = await import('../../../adapters/gemini-cli/src/index.js');
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
    const tempUser = db.getUserById('temp-user');
    if (!tempUser) {
      db.createUser({
        id: 'temp-user',
        username: 'temp',
        email: 'temp@example.com',
        passwordHash: 'temp',
        roles: ['user'],
        settings: {},
      });
      console.log('✅ Created temporary user for development');
    }
  } catch (error) {
    console.warn('⚠️ Could not create temporary user:', error.message);
  }
}

ensureTempUser();

// Routes
setupRoutes(app, { adapterRegistry, processManager });

// WebSocket
setupWebSocket(io, { adapterRegistry, processManager });

// Error handling middleware (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

// Graceful shutdown
process.on('SIGTERM', () => {
  structuredLogger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    structuredLogger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  structuredLogger.info('SIGINT received, shutting down gracefully');
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

process.on('uncaughtException', (error) => {
  structuredLogger.error('Uncaught exception', error);
  process.exit(1);
});

server.listen(PORT, () => {
  structuredLogger.info(`Vibe Code backend running on port ${PORT}`, {
    environment: process.env.NODE_ENV || 'development',
    port: PORT,
  });
});

export { app, server, io };