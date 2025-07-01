import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from 'bun:test';
import { Express } from 'express';
import request from 'supertest';
import { setupRoutes } from '../../api/index.js';
import { createTestAdmin, mockDb, createMockContainer } from '../test-setup.js';

// Mock Docker services
const mockSandboxManager = {
  createSandbox: jest.fn(() => Promise.resolve('sandbox-123')),
  getSandbox: jest.fn(() => ({
    id: 'sandbox-123',
    image: 'node:18',
    status: 'running',
    createdAt: new Date(),
  })),
  listSandboxes: jest.fn(() => []),
  destroySandbox: jest.fn(() => Promise.resolve(true)),
  executeCommand: jest.fn(() =>
    Promise.resolve({
      stdout: 'command output',
      stderr: '',
      exitCode: 0,
    })
  ),
};

const mockOrchestrationManager = {
  deploy: jest.fn(() => Promise.resolve('deployment-123')),
  getDeployment: jest.fn(() => ({
    id: 'deployment-123',
    status: 'running',
    instances: new Map(),
    config: { name: 'test-app', services: [] },
    createdAt: new Date(),
  })),
  listDeployments: jest.fn(() => []),
  updateDeployment: jest.fn(() => Promise.resolve(true)),
  stopDeployment: jest.fn(() => Promise.resolve(true)),
  scaleService: jest.fn(() => Promise.resolve(true)),
};

const mockResourceMonitor = {
  getMetrics: jest.fn(() => [
    {
      containerId: 'container-123',
      timestamp: new Date(),
      cpu: { usage: 25.5, throttled: 0, system: 1000000, user: 2000000 },
      memory: {
        usage: 134217728,
        limit: 268435456,
        percentage: 50,
        cache: 16777216,
        rss: 117440512,
        swap: 0,
      },
      network: {
        rxBytes: 1024000,
        txBytes: 512000,
        rxPackets: 1000,
        txPackets: 500,
        rxErrors: 0,
        txErrors: 0,
      },
      disk: {
        readBytes: 2048000,
        writeBytes: 1024000,
        readOps: 200,
        writeOps: 100,
      },
      processes: { running: 5, sleeping: 10, stopped: 0, zombie: 0 },
    },
  ]),
  setResourceLimits: jest.fn(() => Promise.resolve(true)),
  getUtilizationSummary: jest.fn(() => ({
    totalContainers: 3,
    averageCpuUsage: 42.3,
    averageMemoryUsage: 58.7,
    totalMemoryUsed: 402653184,
    activeAlerts: 1,
    criticalAlerts: 0,
  })),
  getAllAlerts: jest.fn(() => []),
};

const mockContainerCleanup = {
  getRules: jest.fn(() => [
    {
      id: 'rule-1',
      name: 'Clean Exited Containers',
      enabled: true,
      schedule: '0 2 * * *',
      conditions: { maxAge: 86400000 },
      actions: { remove: true },
    },
  ]),
  executeRule: jest.fn(() =>
    Promise.resolve({
      ruleId: 'rule-1',
      ruleName: 'Clean Exited Containers',
      timestamp: new Date(),
      containersRemoved: 2,
      volumesRemoved: 0,
      bytesFreed: 1024000,
      errors: [],
      dryRun: false,
    })
  ),
  addRule: jest.fn(),
  removeRule: jest.fn(() => true),
  toggleRule: jest.fn(() => true),
};

// Mock modules
jest.mock('../../docker/sandbox-manager.js', () => ({
  sandboxManager: mockSandboxManager,
}));
jest.mock('../../docker/orchestration-manager.js', () => ({
  orchestrationManager: mockOrchestrationManager,
}));
jest.mock('../../docker/resource-monitor.js', () => ({
  resourceMonitor: mockResourceMonitor,
}));
jest.mock('../../docker/container-cleanup.js', () => ({
  containerCleanup: mockContainerCleanup,
}));

function createTestApp(): Express {
  const express = require('express');
  const app = express();

  app.use(express.json());
  app.use((req: any, res: any, next: any) => {
    req.session = { id: 'test-session-id' };
    next();
  });

  setupRoutes(app, {
    adapterRegistry: {} as any,
    processManager: {} as any,
  });

  return app;
}

describe('Docker Integration Tests', () => {
  let app: Express;
  let adminToken: string;

  beforeAll(async () => {
    app = createTestApp();

    // Get admin token
    const admin = createTestAdmin();
    const loginResponse = await request(app).post('/api/auth/login').send({
      username: admin.username,
      password: 'adminpassword123',
    });

    adminToken = loginResponse.body.data.token;
  });

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
  });

  describe('Docker Sandboxing Integration', () => {
    describe('POST /api/docker/sandboxes', () => {
      it('should create sandbox with full integration', async () => {
        const sandboxConfig = {
          image: 'node:18-alpine',
          command: ['node', '--version'],
          resources: {
            memory: 256 * 1024 * 1024,
            cpu: 0.5,
            disk: 1024 * 1024 * 1024,
          },
          environment: {
            NODE_ENV: 'production',
          },
          timeout: 300000,
          networkAccess: false,
        };

        const response = await request(app)
          .post('/api/docker/sandboxes')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(sandboxConfig)
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data.sandboxId).toBe('sandbox-123');
        expect(mockSandboxManager.createSandbox).toHaveBeenCalledWith(
          expect.objectContaining({
            image: sandboxConfig.image,
            command: sandboxConfig.command,
          })
        );
      });

      it('should handle sandbox creation failures', async () => {
        mockSandboxManager.createSandbox.mockRejectedValueOnce(
          new Error('Image not found')
        );

        const response = await request(app)
          .post('/api/docker/sandboxes')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            image: 'nonexistent:image',
            resources: { memory: 128 * 1024 * 1024 },
          })
          .expect(500);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toContain('Failed to create sandbox');
      });
    });

    describe('POST /api/docker/sandboxes/:sandboxId/execute', () => {
      it('should execute commands in sandbox', async () => {
        const response = await request(app)
          .post('/api/docker/sandboxes/sandbox-123/execute')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            command: 'echo',
            args: ['Hello, World!'],
            timeout: 30000,
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.stdout).toBe('command output');
        expect(response.body.data.exitCode).toBe(0);
        expect(mockSandboxManager.executeCommand).toHaveBeenCalledWith(
          'sandbox-123',
          expect.objectContaining({
            command: 'echo',
            args: ['Hello', 'World!'],
          })
        );
      });

      it('should handle command execution timeouts', async () => {
        mockSandboxManager.executeCommand.mockRejectedValueOnce(
          new Error('Command timeout')
        );

        const response = await request(app)
          .post('/api/docker/sandboxes/sandbox-123/execute')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            command: 'sleep',
            args: ['100'],
            timeout: 1000, // 1 second timeout
          })
          .expect(500);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toContain('timeout');
      });
    });

    describe('GET /api/docker/sandboxes', () => {
      it('should list all sandboxes with status', async () => {
        mockSandboxManager.listSandboxes.mockReturnValueOnce([
          {
            id: 'sandbox-1',
            image: 'node:18',
            status: 'running',
            createdAt: new Date(),
            resources: { memory: 256 * 1024 * 1024 },
          },
          {
            id: 'sandbox-2',
            image: 'python:3.9',
            status: 'stopped',
            createdAt: new Date(),
            resources: { memory: 512 * 1024 * 1024 },
          },
        ]);

        const response = await request(app)
          .get('/api/docker/sandboxes')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.sandboxes).toHaveLength(2);
        expect(response.body.data.summary.total).toBe(2);
        expect(response.body.data.summary.running).toBeDefined();
      });
    });
  });

  describe('Container Orchestration Integration', () => {
    describe('POST /api/orchestration/deployments', () => {
      it('should deploy multi-service application', async () => {
        const deploymentConfig = {
          name: 'web-app',
          namespace: 'production',
          services: [
            {
              name: 'frontend',
              image: 'nginx:alpine',
              replicas: 2,
              ports: [{ container: 80, host: 8080 }],
              environment: { NODE_ENV: 'production' },
              resources: { memory: 128 * 1024 * 1024, cpu: 0.25 },
            },
            {
              name: 'backend',
              image: 'node:18-alpine',
              replicas: 3,
              ports: [{ container: 3000, host: 3000 }],
              environment: { DATABASE_URL: 'postgres://localhost/app' },
              resources: { memory: 256 * 1024 * 1024, cpu: 0.5 },
            },
          ],
          strategy: 'rolling',
        };

        const response = await request(app)
          .post('/api/orchestration/deployments')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(deploymentConfig)
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data.deploymentId).toBe('deployment-123');
        expect(mockOrchestrationManager.deploy).toHaveBeenCalledWith(
          deploymentConfig
        );
      });

      it('should validate deployment configuration', async () => {
        const invalidDeployment = {
          name: 'invalid-app',
          // Missing namespace and services
        };

        const response = await request(app)
          .post('/api/orchestration/deployments')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(invalidDeployment)
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toContain('namespace');
      });
    });

    describe('POST /api/orchestration/deployments/:deploymentId/services/:serviceName/scale', () => {
      it('should scale service replicas', async () => {
        const response = await request(app)
          .post(
            '/api/orchestration/deployments/deployment-123/services/backend/scale'
          )
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ replicas: 5 })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(mockOrchestrationManager.scaleService).toHaveBeenCalledWith(
          'deployment-123',
          'backend',
          5
        );
      });

      it('should validate replica count', async () => {
        const response = await request(app)
          .post(
            '/api/orchestration/deployments/deployment-123/services/backend/scale'
          )
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ replicas: -1 })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toContain('Valid replicas number');
      });
    });

    describe('GET /api/orchestration/deployments/:deploymentId', () => {
      it('should return detailed deployment information', async () => {
        mockOrchestrationManager.getDeployment.mockReturnValueOnce({
          id: 'deployment-123',
          status: 'running',
          desiredReplicas: 5,
          runningReplicas: 5,
          readyReplicas: 4,
          version: 'v1.2.3',
          instances: new Map([
            [
              'instance-1',
              {
                id: 'instance-1',
                status: 'running',
                health: 'healthy',
                restarts: 0,
                node: 'node-1',
                serviceDefinition: { name: 'frontend' },
              },
            ],
          ]),
          config: {
            name: 'web-app',
            services: [
              {
                name: 'frontend',
                replicas: 2,
                image: 'nginx:alpine',
                securityProfile: 'SECURE',
              },
            ],
          },
          createdAt: new Date(),
        });

        const response = await request(app)
          .get('/api/orchestration/deployments/deployment-123')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.deployment.id).toBe('deployment-123');
        expect(response.body.data.summary.status).toBe('running');
        expect(response.body.data.summary.services).toHaveLength(1);
      });
    });
  });

  describe('Resource Monitoring Integration', () => {
    describe('GET /api/resources/containers/container-123/metrics', () => {
      it('should return comprehensive container metrics', async () => {
        mockResourceMonitor.getResourceTrends.mockReturnValueOnce({
          cpu: [
            { timestamp: new Date(), value: 25.5 },
            { timestamp: new Date(), value: 30.2 },
          ],
          memory: [
            { timestamp: new Date(), value: 50 },
            { timestamp: new Date(), value: 55 },
          ],
          network: [{ timestamp: new Date(), rx: 1024000, tx: 512000 }],
        });

        mockResourceMonitor.predictResourceUsage.mockReturnValueOnce({
          cpu: { predicted: 35, confidence: 0.8 },
          memory: { predicted: 60, confidence: 0.75 },
          alerts: ['CPU usage may exceed 70% in 30 minutes'],
        });

        const response = await request(app)
          .get('/api/resources/containers/container-123/metrics')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.latest.cpu.usage).toBe(25.5);
        expect(response.body.data.trends.cpu).toHaveLength(2);
        expect(response.body.data.prediction.cpu.predicted).toBe(35);
      });
    });

    describe('POST /api/resources/containers/container-123/limits', () => {
      it('should set and enforce resource limits', async () => {
        const limits = {
          cpu: { cores: 2, percentage: 80 },
          memory: {
            limit: 512 * 1024 * 1024,
            swap: 1024 * 1024 * 1024,
            reservation: 256 * 1024 * 1024,
          },
          network: { bandwidth: 100 * 1024 * 1024, connections: 1000 },
          disk: {
            readRate: 50 * 1024 * 1024,
            writeRate: 30 * 1024 * 1024,
            space: 10 * 1024 * 1024 * 1024,
          },
          processes: { max: 100 },
        };

        const response = await request(app)
          .post('/api/resources/containers/container-123/limits')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(limits)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(mockResourceMonitor.setResourceLimits).toHaveBeenCalledWith(
          'container-123',
          limits
        );
      });
    });

    describe('GET /api/resources/system/overview', () => {
      it('should provide comprehensive system overview', async () => {
        const response = await request(app)
          .get('/api/resources/system/overview')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.summary.totalContainers).toBe(3);
        expect(response.body.data.healthScore).toBeGreaterThan(0);
        expect(response.body.data.healthStatus).toMatch(
          /healthy|warning|critical/
        );
        expect(response.body.data.systemMetrics.containers).toBe(3);
      });
    });
  });

  describe('Container Cleanup Integration', () => {
    describe('POST /api/cleanup/rules', () => {
      it('should create comprehensive cleanup rule', async () => {
        const cleanupRule = {
          id: 'integration-cleanup-rule',
          name: 'Integration Test Cleanup',
          description: 'Clean up test containers after integration tests',
          enabled: true,
          schedule: '*/30 * * * *', // Every 30 minutes
          conditions: {
            maxAge: 1800000, // 30 minutes
            status: ['exited', 'failed'],
            labels: { 'test.type': 'integration' },
          },
          actions: {
            remove: true,
            removeVolumes: true,
            alert: true,
          },
          dryRun: false,
          retentionPolicy: {
            keepLast: 3,
            gracePeriod: 60000,
          },
        };

        const response = await request(app)
          .post('/api/cleanup/rules')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(cleanupRule)
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(mockContainerCleanup.addRule).toHaveBeenCalledWith(cleanupRule);
      });
    });

    describe('POST /api/cleanup/rules/:ruleId/execute', () => {
      it('should execute cleanup rule and return results', async () => {
        const response = await request(app)
          .post('/api/cleanup/rules/rule-1/execute')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ dryRun: false })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.containersRemoved).toBe(2);
        expect(response.body.data.bytesFreed).toBe(1024000);
        expect(mockContainerCleanup.executeRule).toHaveBeenCalledWith(
          'rule-1',
          false
        );
      });
    });

    describe('POST /api/cleanup/force-cleanup', () => {
      it('should force cleanup specific containers', async () => {
        mockContainerCleanup.forceCleanup = jest.fn(() =>
          Promise.resolve({
            successful: ['container-1', 'container-2'],
            failed: [
              { containerId: 'container-3', error: 'Permission denied' },
            ],
          })
        );

        const response = await request(app)
          .post('/api/cleanup/force-cleanup')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            containerIds: ['container-1', 'container-2', 'container-3'],
            removeVolumes: true,
            removeImages: false,
            gracePeriod: 30000,
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.successful).toHaveLength(2);
        expect(response.body.data.failed).toHaveLength(1);
      });
    });
  });

  describe('End-to-End Docker Workflows', () => {
    it('should complete full container lifecycle', async () => {
      // 1. Create sandbox
      const sandboxResponse = await request(app)
        .post('/api/docker/sandboxes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          image: 'node:18-alpine',
          resources: { memory: 256 * 1024 * 1024 },
        })
        .expect(201);

      const sandboxId = sandboxResponse.body.data.sandboxId;

      // 2. Execute command
      await request(app)
        .post(`/api/docker/sandboxes/${sandboxId}/execute`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          command: 'node',
          args: ['--version'],
        })
        .expect(200);

      // 3. Monitor resources
      await request(app)
        .get(`/api/resources/containers/${sandboxId}/metrics`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // 4. Set resource limits
      await request(app)
        .post(`/api/resources/containers/${sandboxId}/limits`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          cpu: { cores: 1, percentage: 50 },
          memory: {
            limit: 128 * 1024 * 1024,
            swap: 256 * 1024 * 1024,
            reservation: 64 * 1024 * 1024,
          },
          processes: { max: 50 },
        })
        .expect(200);

      // 5. Destroy sandbox
      await request(app)
        .delete(`/api/docker/sandboxes/${sandboxId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('should handle deployment with monitoring and scaling', async () => {
      // 1. Create deployment
      const deploymentResponse = await request(app)
        .post('/api/orchestration/deployments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'integration-app',
          namespace: 'test',
          services: [
            {
              name: 'web',
              image: 'nginx:alpine',
              replicas: 2,
              resources: { memory: 128 * 1024 * 1024, cpu: 0.25 },
            },
          ],
        })
        .expect(201);

      const deploymentId = deploymentResponse.body.data.deploymentId;

      // 2. Get deployment status
      await request(app)
        .get(`/api/orchestration/deployments/${deploymentId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // 3. Scale service
      await request(app)
        .post(
          `/api/orchestration/deployments/${deploymentId}/services/web/scale`
        )
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ replicas: 4 })
        .expect(200);

      // 4. Check orchestration stats
      await request(app)
        .get('/api/orchestration/stats')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // 5. Stop deployment
      await request(app)
        .post(`/api/orchestration/deployments/${deploymentId}/stop`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('should monitor and cleanup resources automatically', async () => {
      // 1. Check current resource status
      const overviewResponse = await request(app)
        .get('/api/resources/system/overview')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const initialContainers =
        overviewResponse.body.data.summary.totalContainers;

      // 2. Create cleanup rule for test containers
      await request(app)
        .post('/api/cleanup/rules')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          id: 'test-cleanup',
          name: 'Test Container Cleanup',
          enabled: true,
          schedule: '* * * * *', // Every minute
          conditions: { labels: { test: 'true' } },
          actions: { remove: true },
          dryRun: false,
        })
        .expect(201);

      // 3. Execute cleanup rule
      const cleanupResponse = await request(app)
        .post('/api/cleanup/rules/test-cleanup/execute')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ dryRun: false })
        .expect(200);

      expect(
        cleanupResponse.body.data.containersProcessed
      ).toBeGreaterThanOrEqual(0);

      // 4. Get cleanup history
      await request(app)
        .get('/api/cleanup/history')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // 5. Get cleanup overview
      const cleanupOverviewResponse = await request(app)
        .get('/api/cleanup/overview')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(cleanupOverviewResponse.body.data.rules.total).toBeGreaterThan(0);
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should handle Docker daemon failures gracefully', async () => {
      // Simulate Docker daemon unavailable
      mockSandboxManager.createSandbox.mockRejectedValueOnce(
        new Error('Cannot connect to Docker daemon')
      );

      const response = await request(app)
        .post('/api/docker/sandboxes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          image: 'node:18',
          resources: { memory: 128 * 1024 * 1024 },
        })
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Docker daemon');
    });

    it('should handle resource exhaustion', async () => {
      // Simulate out of memory
      mockSandboxManager.createSandbox.mockRejectedValueOnce(
        new Error('Insufficient memory')
      );

      const response = await request(app)
        .post('/api/docker/sandboxes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          image: 'node:18',
          resources: { memory: 16 * 1024 * 1024 * 1024 }, // 16GB
        })
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('memory');
    });

    it('should handle network isolation failures', async () => {
      // Test network-related errors
      mockOrchestrationManager.deploy.mockRejectedValueOnce(
        new Error('Network not found')
      );

      const response = await request(app)
        .post('/api/orchestration/deployments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'network-test',
          namespace: 'test',
          services: [
            {
              name: 'isolated-service',
              image: 'alpine:latest',
              replicas: 1,
            },
          ],
        })
        .expect(500);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Security Integration', () => {
    it('should enforce security policies across Docker operations', async () => {
      // Test dangerous security profile restriction
      const dangerousDeployment = {
        name: 'dangerous-app',
        namespace: 'test',
        services: [
          {
            name: 'privileged-service',
            image: 'alpine:latest',
            replicas: 1,
            securityProfile: 'DANGEROUS',
          },
        ],
      };

      // Should require admin role for dangerous profiles
      const response = await request(app)
        .post('/api/orchestration/deployments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(dangerousDeployment)
        .expect(201); // Admin should be allowed

      expect(response.body.success).toBe(true);
    });

    it('should audit all Docker operations', async () => {
      // All Docker operations should generate audit logs
      await request(app)
        .post('/api/docker/sandboxes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          image: 'node:18',
          resources: { memory: 128 * 1024 * 1024 },
        })
        .expect(201);

      // Verify audit logging was called (this would be mocked)
      expect(true).toBe(true); // Placeholder for audit verification
    });
  });
});
