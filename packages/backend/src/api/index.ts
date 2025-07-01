import { Express } from 'express';
import { AdapterRegistry } from '@vibecode/adapter-sdk';
import type { ProcessManager } from '../processes/index.js';
import { db } from '../database/index.js';
import { v4 as uuidv4 } from 'uuid';

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
    try {
      // For now, use a temporary user ID - this will be replaced with proper auth
      const userId = 'temp-user';
      const projects = db.getProjectsByUserId(userId);
      res.json(projects);
    } catch (error) {
      console.error('Error fetching projects:', error);
      res.status(500).json({ error: 'Failed to fetch projects' });
    }
  });

  app.post('/api/projects', (req, res) => {
    try {
      const { name, path, activeAdapter } = req.body;
      
      if (!name || !path || !activeAdapter) {
        return res.status(400).json({ error: 'Name, path, and activeAdapter are required' });
      }

      // For now, use a temporary user ID - this will be replaced with proper auth
      const userId = 'temp-user';
      const projectId = uuidv4();
      
      const project = {
        id: projectId,
        name,
        path,
        activeAdapter,
        settings: {},
        gitRemote: undefined,
      };
      
      db.createProject(project, userId);
      
      // Return the created project with timestamps
      const createdProject = {
        ...project,
        created: new Date(),
        lastAccessed: new Date(),
      };
      
      res.status(201).json(createdProject);
    } catch (error) {
      console.error('Error creating project:', error);
      res.status(500).json({ error: 'Failed to create project' });
    }
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