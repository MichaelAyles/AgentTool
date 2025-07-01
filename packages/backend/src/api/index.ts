import { Express } from 'express';
import { AdapterRegistry } from '@vibecode/adapter-sdk';
import type { ProcessManager } from '../processes/index.js';
import { db } from '../database/index.js';
import { v4 as uuidv4 } from 'uuid';
import { cliInstaller } from '../services/cli-installer.js';
import { projectManager } from '../services/project-manager.js';
import { asyncHandler } from '../middleware/error-handler.js';
import { authenticate, optionalAuth, requireAuthInProduction } from '../auth/middleware.js';
import { requirePermission, requireAdmin, requireRole } from '../auth/permissions.js';
import gitRouter from './git.js';
import authRouter from './auth.js';
import rolesRouter from './roles.js';
import securityRouter from './security.js';
import dangerousTimeoutRouter from './dangerous-timeout.js';
import notificationsRouter from './notifications.js';
import queueRouter from './queue.js';
import processLifecycleRouter from './process-lifecycle.js';
import processCleanupRouter from './process-cleanup.js';
import adapterLifecycleRouter from './adapter-lifecycle.js';
import websocketPoolRouter from './websocket-pool.js';
import customScriptsRouter from './custom-scripts.js';
import adapterConfigRouter from './adapter-config.js';
import mcpRouter from './mcp.js';
import marketplaceRouter from './marketplace.js';
import cliHealthRouter from './cli-health.js';
import mcpConnectionsRouter from './mcp-connections.js';
import mcpDiscoveryRouter from './mcp-discovery.js';
import mcpMessagesRouter from './mcp-messages.js';
import mcpRegistryRouter from './mcp-registry.js';
import streamingOptimizationRouter from './streaming-optimization.js';

interface Services {
  adapterRegistry: AdapterRegistry;
  processManager: ProcessManager;
}

export function setupRoutes(app: Express, services: Services): void {
  // Health check (no auth required)
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Authentication routes
  app.use('/api/auth', authRouter);

  // Apply authentication to all API routes below this point
  app.use('/api', requireAuthInProduction);

  // Git operations
  app.use('/api/git', gitRouter);

  // Role management
  app.use('/api', rolesRouter);

  // Security management
  app.use('/api/security', securityRouter);

  // Dangerous mode timeout and auto-disable
  app.use('/api/dangerous/timeout', dangerousTimeoutRouter);

  // Security notifications
  app.use('/api/notifications', notificationsRouter);

  // Queue management
  app.use('/api/queue', queueRouter);

  // Process lifecycle management
  app.use('/api/process-lifecycle', processLifecycleRouter);

  // Process cleanup management
  app.use('/api/process-cleanup', processCleanupRouter);

  // Adapter lifecycle management
  app.use('/api/adapter-lifecycle', adapterLifecycleRouter);

  // WebSocket connection pool management
  app.use('/api/websocket-pool', websocketPoolRouter);

  // Custom script execution and management
  app.use('/api/custom-scripts', customScriptsRouter);

  // Adapter configuration management
  app.use('/api/adapter-config', adapterConfigRouter);

  // MCP bridge service
  app.use('/api/mcp', mcpRouter);

  // Adapter marketplace
  app.use('/api/marketplace', marketplaceRouter);

  // CLI health monitoring
  app.use('/api/cli-health', cliHealthRouter);

  // MCP server connections
  app.use('/api/mcp-connections', mcpConnectionsRouter);

  // MCP tool and resource discovery
  app.use('/api/mcp-discovery', mcpDiscoveryRouter);

  // MCP message handling
  app.use('/api/mcp-messages', mcpMessagesRouter);

  // MCP server registry
  app.use('/api/mcp-registry', mcpRegistryRouter);

  // Streaming optimization
  app.use('/api/streaming', streamingOptimizationRouter);

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
  app.get('/api/projects', requirePermission('project', 'read'), asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const projects = db.getProjectsByUserId(userId);
    res.json(projects);
  }));

  app.post('/api/projects', requirePermission('project', 'create'), asyncHandler(async (req, res) => {
    const { name, path, activeAdapter, gitRemote, description } = req.body;
    
    if (!name || !path || !activeAdapter) {
      return res.status(400).json({ error: 'Name, path, and activeAdapter are required' });
    }

    const userId = req.user!.id;
    const project = await projectManager.createProject({
      name,
      path,
      activeAdapter,
      gitRemote,
      description,
    }, userId);
    
    res.status(201).json(project);
  }));

  app.post('/api/projects/clone', requirePermission('project', 'create'), asyncHandler(async (req, res) => {
    const { repoUrl, localPath, branch, activeAdapter, name, depth } = req.body;
    
    if (!repoUrl || !localPath || !activeAdapter) {
      return res.status(400).json({ error: 'repoUrl, localPath, and activeAdapter are required' });
    }

    const userId = req.user!.id;
    const project = await projectManager.cloneProject({
      repoUrl,
      localPath,
      branch,
      activeAdapter,
      name,
      depth,
    }, userId);
    
    res.status(201).json(project);
  }));

  app.post('/api/projects/init', requirePermission('project', 'create'), asyncHandler(async (req, res) => {
    const { path, name, activeAdapter, gitInit, template, description } = req.body;
    
    if (!path || !name || !activeAdapter) {
      return res.status(400).json({ error: 'path, name, and activeAdapter are required' });
    }

    const userId = req.user!.id;
    const project = await projectManager.initializeProject({
      path,
      name,
      activeAdapter,
      gitInit,
      template,
      description,
    }, userId);
    
    res.status(201).json(project);
  }));

  app.get('/api/projects/:projectPath(*)/info', requirePermission('project', 'read'), asyncHandler(async (req, res) => {
    const projectPath = decodeURIComponent(req.params.projectPath);
    const info = await projectManager.getProjectInfo(projectPath);
    res.json({ success: true, info });
  }));

  app.post('/api/projects/validate-path', asyncHandler(async (req, res) => {
    const { path } = req.body;
    
    if (!path) {
      return res.status(400).json({ error: 'path is required' });
    }

    const validation = await projectManager.validateProjectPath(path);
    res.json({ success: true, validation });
  }));

  // Sessions
  app.post('/api/sessions', requirePermission('session', 'create'), (req, res) => {
    // TODO: Implement session creation
    res.status(201).json({ id: 'temp-session-id' });
  });

  // Process monitoring endpoints
  app.get('/api/processes/metrics', requirePermission('system', 'read'), (req, res) => {
    try {
      const metrics = services.processManager.getAllMetrics();
      res.json(metrics);
    } catch (error) {
      console.error('Error fetching process metrics:', error);
      res.status(500).json({ error: 'Failed to fetch process metrics' });
    }
  });

  app.get('/api/processes/metrics/:sessionId', requirePermission('session', 'read'), (req, res) => {
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

  app.put('/api/processes/limits', requireAdmin(), (req, res) => {
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

  app.delete('/api/processes/:sessionId', requirePermission('session', 'terminate'), (req, res) => {
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
  app.get('/api/cli/status', requirePermission('cli', 'read'), async (req, res) => {
    try {
      const status = await cliInstaller.getAllCLIStatus();
      
      // Enhance with health monitoring data
      const { cliHealthMonitor } = await import('../services/cli-health-monitor.js');
      const healthStatuses = cliHealthMonitor.getAllHealthStatuses();
      
      const enhancedStatus = status.map(cliStatus => {
        const healthStatus = healthStatuses.find(h => h.name === cliStatus.name);
        return {
          ...cliStatus,
          health: healthStatus ? {
            status: healthStatus.status,
            availability: healthStatus.availability,
            lastChecked: healthStatus.lastChecked,
            responseTime: healthStatus.responseTime,
            errorCount: healthStatus.errors.length,
            warningCount: healthStatus.warnings.length,
          } : null,
        };
      });
      
      res.json(enhancedStatus);
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

  app.post('/api/cli/:cliName/install', requirePermission('cli', 'install'), async (req, res) => {
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

  app.get('/api/cli/:cliName/fallbacks', async (req, res) => {
    try {
      const { cliName } = req.params;
      const fallbacks = await cliInstaller.getFallbackMethods(cliName);
      res.json({ success: true, fallbacks });
    } catch (error) {
      console.error('Error getting fallback methods:', error);
      res.status(500).json({ error: 'Failed to get fallback methods' });
    }
  });

  app.post('/api/cli/:cliName/install-fallback', async (req, res) => {
    try {
      const { cliName } = req.params;
      const { method } = req.body;
      
      const result = await cliInstaller.installWithFallback(cliName, method);
      res.json(result);
    } catch (error) {
      console.error('Error installing with fallback:', error);
      res.status(500).json({ error: 'Failed to install with fallback' });
    }
  });

  app.get('/api/cli/:cliName/diagnose', async (req, res) => {
    try {
      const { cliName } = req.params;
      const diagnosis = await cliInstaller.diagnoseInstallationIssues(cliName);
      res.json({ success: true, diagnosis });
    } catch (error) {
      console.error('Error diagnosing installation issues:', error);
      res.status(500).json({ error: 'Failed to diagnose installation issues' });
    }
  });

  // Error handling
  app.use((err: Error, req: any, res: any, next: any) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal server error' });
  });
}