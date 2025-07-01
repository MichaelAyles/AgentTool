import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test';
import { Express } from 'express';
import request from 'supertest';
import { AdapterRegistry } from '@vibecode/adapter-sdk';
import { setupRoutes } from '../../api/index.js';
import { ProcessManager } from '../../processes/process-manager.js';
import { createTestUser, createTestAdmin, mockDb, seedTestData, clearTestData } from '../test-setup.js';

// Create test app
function createTestApp(): Express {
  const express = require('express');
  const app = express();
  
  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  
  // Mock session middleware
  app.use((req: any, res: any, next: any) => {
    req.session = { id: 'test-session-id' };
    next();
  });
  
  // Mock services
  const mockAdapterRegistry = new AdapterRegistry();
  const mockProcessManager = new ProcessManager();
  
  setupRoutes(app, {
    adapterRegistry: mockAdapterRegistry,
    processManager: mockProcessManager,
  });
  
  return app;
}

describe('API Integration Tests', () => {
  let app: Express;
  let testUser: any;
  let testAdmin: any;

  beforeAll(async () => {
    app = createTestApp();
    testUser = createTestUser();
    testAdmin = createTestAdmin();
    await seedTestData();
  });

  afterAll(async () => {
    await clearTestData();
  });

  beforeEach(async () => {
    // Reset state before each test
  });

  afterEach(async () => {
    // Clean up after each test
  });

  describe('Health Check', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('ok');
      expect(response.body.timestamp).toBeDefined();
    });
  });

  describe('Authentication Endpoints', () => {
    describe('POST /api/auth/login', () => {
      it('should login with valid credentials', async () => {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            username: testUser.username,
            password: 'testpassword123',
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.token).toBeDefined();
        expect(response.body.data.user.username).toBe(testUser.username);
      });

      it('should reject invalid credentials', async () => {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            username: testUser.username,
            password: 'wrongpassword',
          })
          .expect(401);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toContain('Invalid credentials');
      });

      it('should validate required fields', async () => {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            username: testUser.username,
            // Missing password
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toContain('required');
      });
    });

    describe('POST /api/auth/register', () => {
      it('should register new user with valid data', async () => {
        const newUser = {
          username: 'newuser',
          email: 'newuser@example.com',
          password: 'newpassword123',
          confirmPassword: 'newpassword123',
        };

        const response = await request(app)
          .post('/api/auth/register')
          .send(newUser)
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data.user.username).toBe(newUser.username);
        expect(response.body.data.user.email).toBe(newUser.email);
      });

      it('should reject weak passwords', async () => {
        const weakPasswordUser = {
          username: 'weakuser',
          email: 'weak@example.com',
          password: '123',
          confirmPassword: '123',
        };

        const response = await request(app)
          .post('/api/auth/register')
          .send(weakPasswordUser)
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toContain('password');
      });

      it('should reject mismatched passwords', async () => {
        const mismatchUser = {
          username: 'mismatchuser',
          email: 'mismatch@example.com',
          password: 'password123',
          confirmPassword: 'differentpassword',
        };

        const response = await request(app)
          .post('/api/auth/register')
          .send(mismatchUser)
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toContain('match');
      });
    });
  });

  describe('Project Management', () => {
    let authToken: string;

    beforeEach(async () => {
      // Get auth token for authenticated requests
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: testUser.username,
          password: 'testpassword123',
        });
      
      authToken = loginResponse.body.data.token;
    });

    describe('GET /api/projects', () => {
      it('should list user projects', async () => {
        const response = await request(app)
          .get('/api/projects')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(Array.isArray(response.body)).toBe(true);
      });

      it('should require authentication', async () => {
        await request(app)
          .get('/api/projects')
          .expect(401);
      });
    });

    describe('POST /api/projects', () => {
      it('should create new project', async () => {
        const projectData = {
          name: 'Integration Test Project',
          path: '/tmp/integration-test-project',
          activeAdapter: 'claude-code',
          description: 'A project for integration testing',
        };

        const response = await request(app)
          .post('/api/projects')
          .set('Authorization', `Bearer ${authToken}`)
          .send(projectData)
          .expect(201);

        expect(response.body.name).toBe(projectData.name);
        expect(response.body.path).toBe(projectData.path);
        expect(response.body.activeAdapter).toBe(projectData.activeAdapter);
      });

      it('should validate required fields', async () => {
        const invalidProject = {
          name: 'Test Project',
          // Missing path and activeAdapter
        };

        const response = await request(app)
          .post('/api/projects')
          .set('Authorization', `Bearer ${authToken}`)
          .send(invalidProject)
          .expect(400);

        expect(response.body.error).toContain('required');
      });
    });

    describe('POST /api/projects/clone', () => {
      it('should clone git repository', async () => {
        const cloneData = {
          repoUrl: 'https://github.com/octocat/Hello-World.git',
          localPath: '/tmp/cloned-hello-world',
          activeAdapter: 'claude-code',
          name: 'Cloned Hello World',
          branch: 'main',
        };

        const response = await request(app)
          .post('/api/projects/clone')
          .set('Authorization', `Bearer ${authToken}`)
          .send(cloneData)
          .expect(201);

        expect(response.body.name).toBe(cloneData.name);
        expect(response.body.gitRemote).toBe(cloneData.repoUrl);
      });

      it('should handle invalid repository URLs', async () => {
        const invalidClone = {
          repoUrl: 'not-a-valid-url',
          localPath: '/tmp/invalid-clone',
          activeAdapter: 'claude-code',
        };

        const response = await request(app)
          .post('/api/projects/clone')
          .set('Authorization', `Bearer ${authToken}`)
          .send(invalidClone)
          .expect(400);

        expect(response.body.error).toContain('URL');
      });
    });

    describe('POST /api/projects/validate-path', () => {
      it('should validate accessible path', async () => {
        const response = await request(app)
          .post('/api/projects/validate-path')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ path: '/tmp' })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.validation.valid).toBe(true);
        expect(response.body.validation.accessible).toBe(true);
      });

      it('should detect invalid paths', async () => {
        const response = await request(app)
          .post('/api/projects/validate-path')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ path: '' })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.validation.valid).toBe(false);
      });
    });
  });

  describe('Process Management', () => {
    let authToken: string;

    beforeEach(async () => {
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: testUser.username,
          password: 'testpassword123',
        });
      
      authToken = loginResponse.body.data.token;
    });

    describe('GET /api/processes/health', () => {
      it('should return process health status', async () => {
        const response = await request(app)
          .get('/api/processes/health')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.totalSessions).toBeDefined();
        expect(response.body.runningSessions).toBeDefined();
        expect(response.body.systemLoad).toBeDefined();
      });
    });

    describe('GET /api/processes/metrics', () => {
      it('should return all process metrics', async () => {
        const response = await request(app)
          .get('/api/processes/metrics')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(Array.isArray(response.body)).toBe(true);
      });

      it('should require system read permission', async () => {
        // Login as user with limited permissions
        const limitedUser = { ...testUser, permissions: ['project:read'] };
        const limitedLoginResponse = await request(app)
          .post('/api/auth/login')
          .send({
            username: limitedUser.username,
            password: 'testpassword123',
          });

        await request(app)
          .get('/api/processes/metrics')
          .set('Authorization', `Bearer ${limitedLoginResponse.body.data.token}`)
          .expect(403);
      });
    });

    describe('PUT /api/processes/limits', () => {
      it('should update resource limits', async () => {
        // Login as admin
        const adminLoginResponse = await request(app)
          .post('/api/auth/login')
          .send({
            username: testAdmin.username,
            password: 'adminpassword123',
          });

        const newLimits = {
          maxSessions: 20,
          maxMemoryPerSession: 512 * 1024 * 1024,
          maxCpuPerSession: 80,
        };

        const response = await request(app)
          .put('/api/processes/limits')
          .set('Authorization', `Bearer ${adminLoginResponse.body.data.token}`)
          .send(newLimits)
          .expect(200);

        expect(response.body.maxSessions).toBe(newLimits.maxSessions);
      });

      it('should require admin role', async () => {
        const newLimits = {
          maxSessions: 5,
        };

        await request(app)
          .put('/api/processes/limits')
          .set('Authorization', `Bearer ${authToken}`)
          .send(newLimits)
          .expect(403);
      });
    });
  });

  describe('Docker Management', () => {
    let adminToken: string;

    beforeEach(async () => {
      const adminLoginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: testAdmin.username,
          password: 'adminpassword123',
        });
      
      adminToken = adminLoginResponse.body.data.token;
    });

    describe('POST /api/docker/sandboxes', () => {
      it('should create new sandbox', async () => {
        const sandboxConfig = {
          image: 'node:18',
          resources: {
            memory: 256 * 1024 * 1024,
            cpu: 0.5,
          },
          timeout: 300000,
        };

        const response = await request(app)
          .post('/api/docker/sandboxes')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(sandboxConfig)
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data.sandboxId).toBeDefined();
      });

      it('should validate sandbox configuration', async () => {
        const invalidConfig = {
          // Missing required image
          resources: {
            memory: 256 * 1024 * 1024,
          },
        };

        await request(app)
          .post('/api/docker/sandboxes')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(invalidConfig)
          .expect(400);
      });
    });

    describe('GET /api/orchestration/stats', () => {
      it('should return orchestration statistics', async () => {
        const response = await request(app)
          .get('/api/orchestration/stats')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.orchestration).toBeDefined();
        expect(response.body.data.serviceMesh).toBeDefined();
      });
    });

    describe('GET /api/resources/system/overview', () => {
      it('should return system resource overview', async () => {
        const response = await request(app)
          .get('/api/resources/system/overview')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.summary).toBeDefined();
        expect(response.body.data.healthScore).toBeDefined();
        expect(response.body.data.systemMetrics).toBeDefined();
      });
    });
  });

  describe('Security and Permissions', () => {
    let userToken: string;
    let adminToken: string;

    beforeEach(async () => {
      const userLogin = await request(app)
        .post('/api/auth/login')
        .send({
          username: testUser.username,
          password: 'testpassword123',
        });
      userToken = userLogin.body.data.token;

      const adminLogin = await request(app)
        .post('/api/auth/login')
        .send({
          username: testAdmin.username,
          password: 'adminpassword123',
        });
      adminToken = adminLogin.body.data.token;
    });

    describe('Role-based Access Control', () => {
      it('should allow admin access to all endpoints', async () => {
        await request(app)
          .get('/api/processes/metrics')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        await request(app)
          .put('/api/processes/limits')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ maxSessions: 10 })
          .expect(200);
      });

      it('should restrict user access to appropriate endpoints', async () => {
        // User can access their projects
        await request(app)
          .get('/api/projects')
          .set('Authorization', `Bearer ${userToken}`)
          .expect(200);

        // User cannot update system limits
        await request(app)
          .put('/api/processes/limits')
          .set('Authorization', `Bearer ${userToken}`)
          .send({ maxSessions: 10 })
          .expect(403);
      });
    });

    describe('Authentication Requirements', () => {
      it('should require authentication for protected endpoints', async () => {
        await request(app)
          .get('/api/projects')
          .expect(401);

        await request(app)
          .post('/api/projects')
          .send({ name: 'Test', path: '/tmp', activeAdapter: 'claude-code' })
          .expect(401);

        await request(app)
          .get('/api/processes/metrics')
          .expect(401);
      });

      it('should allow access to public endpoints', async () => {
        await request(app)
          .get('/health')
          .expect(200);
      });
    });

    describe('Input Validation', () => {
      it('should sanitize and validate all inputs', async () => {
        // XSS attempt in project name
        const maliciousProject = {
          name: '<script>alert("xss")</script>',
          path: '/tmp/xss-test',
          activeAdapter: 'claude-code',
        };

        const response = await request(app)
          .post('/api/projects')
          .set('Authorization', `Bearer ${userToken}`)
          .send(maliciousProject)
          .expect(400);

        expect(response.body.error).toContain('Invalid');
      });

      it('should validate file paths', async () => {
        const pathTraversalProject = {
          name: 'Path Traversal Test',
          path: '../../etc/passwd',
          activeAdapter: 'claude-code',
        };

        await request(app)
          .post('/api/projects')
          .set('Authorization', `Bearer ${userToken}`)
          .send(pathTraversalProject)
          .expect(400);
      });
    });
  });

  describe('Error Handling', () => {
    let authToken: string;

    beforeEach(async () => {
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: testUser.username,
          password: 'testpassword123',
        });
      
      authToken = loginResponse.body.data.token;
    });

    it('should handle 404 for non-existent endpoints', async () => {
      const response = await request(app)
        .get('/api/nonexistent')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.error).toContain('Not found');
    });

    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}')
        .expect(400);

      expect(response.body.error).toContain('JSON');
    });

    it('should handle large payloads', async () => {
      const largePayload = {
        name: 'A'.repeat(10000), // Very long name
        path: '/tmp/large-test',
        activeAdapter: 'claude-code',
      };

      await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${authToken}`)
        .send(largePayload)
        .expect(400);
    });

    it('should provide meaningful error messages', async () => {
      const response = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(400);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.length).toBeGreaterThan(0);
    });
  });

  describe('Performance', () => {
    let authToken: string;

    beforeEach(async () => {
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: testUser.username,
          password: 'testpassword123',
        });
      
      authToken = loginResponse.body.data.token;
    });

    it('should respond quickly to simple requests', async () => {
      const startTime = Date.now();
      
      await request(app)
        .get('/health')
        .expect(200);
        
      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(100); // Less than 100ms
    });

    it('should handle concurrent requests', async () => {
      const requests = Array.from({ length: 10 }, () =>
        request(app)
          .get('/api/projects')
          .set('Authorization', `Bearer ${authToken}`)
      );

      const responses = await Promise.all(requests);
      
      expect(responses.every(r => r.status === 200)).toBe(true);
    });

    it('should paginate large result sets', async () => {
      const response = await request(app)
        .get('/api/projects?limit=5&offset=0')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeLessThanOrEqual(5);
    });
  });

  describe('Content Type Handling', () => {
    let authToken: string;

    beforeEach(async () => {
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: testUser.username,
          password: 'testpassword123',
        });
      
      authToken = loginResponse.body.data.token;
    });

    it('should handle JSON requests', async () => {
      await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({
          name: 'JSON Test',
          path: '/tmp/json-test',
          activeAdapter: 'claude-code',
        }))
        .expect(201);
    });

    it('should handle URL-encoded requests', async () => {
      await request(app)
        .post('/api/auth/login')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send('username=testuser&password=testpassword123')
        .expect(200);
    });

    it('should return appropriate content types', async () => {
      const response = await request(app)
        .get('/api/projects')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toContain('application/json');
    });
  });
});