import { Express } from 'express';
import { AdapterRegistry } from '@vibecode/adapter-sdk';
import type { ProcessManager } from '../processes/index.js';

interface Services {
  adapterRegistry: AdapterRegistry;
  processManager: ProcessManager;
}

export function setupRoutes(app: Express, services: Services): void {
  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Adapters
  app.get('/api/adapters', (req, res) => {
    const adapters = services.adapterRegistry.list();
    res.json(adapters.map(a => ({
      name: a.name,
      version: a.version,
      description: a.description,
      capabilities: a.capabilities,
    })));
  });

  // Projects
  app.get('/api/projects', (req, res) => {
    // TODO: Implement project listing
    res.json([]);
  });

  app.post('/api/projects', (req, res) => {
    // TODO: Implement project creation
    res.status(201).json({ id: 'temp-id', name: req.body.name });
  });

  // Sessions
  app.post('/api/sessions', (req, res) => {
    // TODO: Implement session creation
    res.status(201).json({ id: 'temp-session-id' });
  });

  // Error handling
  app.use((err: Error, req: any, res: any, next: any) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal server error' });
  });
}