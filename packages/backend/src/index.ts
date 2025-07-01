import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import { setupRoutes } from './api/index.js';
import { setupWebSocket } from './websocket/index.js';
import { ProcessManager } from './processes/index.js';
import { AdapterRegistry } from '@vibecode/adapter-sdk';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173'],
    credentials: true,
  },
});

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173'],
  credentials: true,
}));
app.use(express.json());

// Services
const adapterRegistry = new AdapterRegistry();
const processManager = new ProcessManager(adapterRegistry);

// Routes
setupRoutes(app, { adapterRegistry, processManager });

// WebSocket
setupWebSocket(io, { adapterRegistry, processManager });

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Vibe Code backend running on port ${PORT}`);
});

export { app, server, io };