import { Express } from 'express';
import { AdapterRegistry } from '@vibecode/adapter-sdk';
import type { ProcessManager } from '../processes/index.js';
import { db } from '../database/index.js';
import { v4 as uuidv4 } from 'uuid';
import { cliInstaller } from '../services/cli-installer.js';
import gitRouter from './git.js';

interface Services {
  adapterRegistry: AdapterRegistry;
  processManager: ProcessManager;
}

export function setupRoutes(app: Express, services: Services): void {
  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Git operations
  app.use('/api/git', gitRouter);

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

  // Process monitoring endpoints
  app.get('/api/processes/metrics', (req, res) => {
    try {
      const metrics = services.processManager.getAllMetrics();
      res.json(metrics);
    } catch (error) {
      console.error('Error fetching process metrics:', error);
      res.status(500).json({ error: 'Failed to fetch process metrics' });
    }
  });

  app.get('/api/processes/metrics/:sessionId', (req, res) => {
    try {
      const { sessionId } = req.params;
      const metrics = services.processManager.getSessionMetrics(sessionId);
      
      if (!metrics) {
        return res.status(404).json({ error: 'Session not found' });
      }
      
      res.json(metrics);
    } catch (error) {
      console.error('Error fetching session metrics:', error);
      res.status(500).json({ error: 'Failed to fetch session metrics' });
    }
  });

  app.get('/api/processes/health', (req, res) => {
    try {
      const health = services.processManager.getHealthStatus();
      res.json(health);
    } catch (error) {
      console.error('Error fetching health status:', error);
      res.status(500).json({ error: 'Failed to fetch health status' });
    }
  });

  app.get('/api/processes/limits', (req, res) => {
    try {
      const limits = services.processManager.getResourceLimits();
      res.json(limits);
    } catch (error) {
      console.error('Error fetching resource limits:', error);
      res.status(500).json({ error: 'Failed to fetch resource limits' });
    }
  });

  app.put('/api/processes/limits', (req, res) => {
    try {
      const updates = req.body;
      services.processManager.updateResourceLimits(updates);
      const newLimits = services.processManager.getResourceLimits();
      res.json(newLimits);
    } catch (error) {
      console.error('Error updating resource limits:', error);
      res.status(500).json({ error: 'Failed to update resource limits' });
    }
  });

  app.delete('/api/processes/:sessionId', (req, res) => {
    try {
      const { sessionId } = req.params;
      services.processManager.terminateSession(sessionId);
      res.status(204).send();
    } catch (error) {
      console.error('Error terminating session:', error);
      res.status(500).json({ error: 'Failed to terminate session' });
    }
  });

  // CLI Management endpoints
  app.get('/api/cli/status', async (req, res) => {
    try {
      const status = await cliInstaller.getAllCLIStatus();
      res.json(status);
    } catch (error) {
      console.error('Error getting CLI status:', error);
      res.status(500).json({ error: 'Failed to get CLI status' });
    }
  });

  app.get('/api/cli/supported', (req, res) => {
    try {
      const supported = cliInstaller.getSupportedCLIs();
      const cliInfo = supported.map(name => ({
        name,
        info: cliInstaller.getCLIInfo(name),
      }));
      res.json(cliInfo);
    } catch (error) {
      console.error('Error getting supported CLIs:', error);
      res.status(500).json({ error: 'Failed to get supported CLIs' });
    }
  });

  app.post('/api/cli/:cliName/install', async (req, res) => {
    try {
      const { cliName } = req.params;
      const result = await cliInstaller.installCLI(cliName);
      
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error('Error installing CLI:', error);
      res.status(500).json({ error: 'Failed to install CLI' });
    }
  });

  app.get('/api/cli/:cliName/check', async (req, res) => {
    try {
      const { cliName } = req.params;
      const status = await cliInstaller.checkCLIAvailability(cliName);
      res.json(status);
    } catch (error) {
      console.error('Error checking CLI:', error);
      res.status(500).json({ error: 'Failed to check CLI' });
    }
  });

  app.post('/api/cli/:cliName/ensure', async (req, res) => {
    try {
      const { cliName } = req.params;
      const { autoInstall = false } = req.body;
      
      const result = await cliInstaller.ensureCLIAvailable(cliName, autoInstall);
      res.json(result);
    } catch (error) {
      console.error('Error ensuring CLI availability:', error);
      res.status(500).json({ error: 'Failed to ensure CLI availability' });
    }
  });

  // Error handling
  app.use((err: Error, req: any, res: any, next: any) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal server error' });
  });
}