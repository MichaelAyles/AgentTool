import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import request from 'supertest';
import { Express } from 'express';
import { setupRoutes } from '../../api/index.js';
import {
  createMockReq,
  createMockRes,
  createTestUser,
  createTestAdmin,
  expectSuccessResponse,
  expectErrorResponse,
  expectForbidden,
  expectNotFound,
} from '../test-setup.js';

// Mock resource monitor
const mockResourceMonitor = {
  getMetrics: mock(() => [
    {
      containerId: 'test-container-1',
      timestamp: new Date(),
      cpu: { usage: 45.5, throttled: 0, system: 1000000, user: 2000000 },
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
  getResourceTrends: mock(() => ({
    cpu: [{ timestamp: new Date(), value: 45.5 }],
    memory: [{ timestamp: new Date(), value: 50 }],
    network: [{ timestamp: new Date(), rx: 1024000, tx: 512000 }],
  })),
  predictResourceUsage: mock(() => ({
    cpu: { predicted: 55, confidence: 0.8 },
    memory: { predicted: 60, confidence: 0.75 },
    alerts: ['CPU usage may exceed 70% in 30 minutes'],
  })),
  getUtilizationSummary: mock(() => ({
    totalContainers: 3,
    averageCpuUsage: 42.3,
    averageMemoryUsage: 58.7,
    totalMemoryUsed: 402653184,
    activeAlerts: 2,
    criticalAlerts: 0,
  })),
  setResourceLimits: mock(() => Promise.resolve(true)),
  getLimits: mock(() => ({
    containerId: 'test-container-1',
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
  })),
  getAlerts: mock(() => [
    {
      id: 'alert-1',
      containerId: 'test-container-1',
      type: 'cpu',
      severity: 'warning',
      threshold: 70,
      currentValue: 85,
      message: 'High CPU usage: 85%',
      timestamp: new Date(),
      acknowledged: false,
    },
  ]),
  getAllAlerts: mock(() => [
    {
      id: 'alert-1',
      containerId: 'test-container-1',
      type: 'cpu',
      severity: 'warning',
      threshold: 70,
      currentValue: 85,
      message: 'High CPU usage: 85%',
      timestamp: new Date(),
      acknowledged: false,
    },
    {
      id: 'alert-2',
      containerId: 'test-container-2',
      type: 'memory',
      severity: 'critical',
      threshold: 95,
      currentValue: 97,
      message: 'Critical memory usage: 97%',
      timestamp: new Date(),
      acknowledged: false,
    },
  ]),
  acknowledgeAlert: mock(() => true),
};

// Mock the resource monitor module
mock.module('../../docker/resource-monitor.js', () => ({
  resourceMonitor: mockResourceMonitor,
}));

// Mock audit logger
const mockAuditLogger = {
  logAuditEvent: mock(() => Promise.resolve()),
};

mock.module('../../security/audit-logger.js', () => ({
  comprehensiveAuditLogger: mockAuditLogger,
  AuditCategory: {
    SYSTEM_CHANGES: 'system_changes',
    DATA_ACCESS: 'data_access',
  },
}));

describe('Docker Resource Monitoring API', () => {
  let req: any;
  let res: any;

  beforeEach(() => {
    // Reset mocks
    Object.values(mockResourceMonitor).forEach(mockFn => mockFn.mockClear());
    mockAuditLogger.logAuditEvent.mockClear();
  });

  describe('GET /api/resources/containers/:containerId/metrics', () => {
    beforeEach(() => {
      req = createMockReq({
        user: createTestUser(),
        params: { containerId: 'test-container-1' },
        query: { timeRange: '3600000' },
      });
      res = createMockRes();
    });

    it('should return container metrics successfully', async () => {
      // Import and call the route handler
      const { default: router } = await import(
        '../../api/docker-resource-monitoring.js'
      );

      // Simulate the route call
      await new Promise<void>(resolve => {
        router.stack
          .find(
            (layer: any) =>
              layer.route?.path === '/containers/:containerId/metrics' &&
              layer.route?.methods?.get
          )
          ?.route.stack[2].handle(req, res, resolve); // Skip auth middlewares
      });

      expectSuccessResponse(res);
      expect(res.data.data.latest).toBeDefined();
      expect(res.data.data.trends).toBeDefined();
      expect(res.data.data.prediction).toBeDefined();
      expect(mockResourceMonitor.getMetrics).toHaveBeenCalledWith(
        'test-container-1'
      );
    });

    it('should return 404 for container with no metrics', async () => {
      mockResourceMonitor.getMetrics.mockReturnValueOnce([]);

      const { default: router } = await import(
        '../../api/docker-resource-monitoring.js'
      );

      await new Promise<void>(resolve => {
        router.stack
          .find(
            (layer: any) =>
              layer.route?.path === '/containers/:containerId/metrics' &&
              layer.route?.methods?.get
          )
          ?.route.stack[2].handle(req, res, resolve);
      });

      expectErrorResponse(res, 404, 'No metrics found');
    });

    it('should require container read permission', async () => {
      req.user = { ...createTestUser(), permissions: [] };

      const { default: router } = await import(
        '../../api/docker-resource-monitoring.js'
      );

      await new Promise<void>(resolve => {
        router.stack
          .find(
            (layer: any) =>
              layer.route?.path === '/containers/:containerId/metrics' &&
              layer.route?.methods?.get
          )
          ?.route.stack[1].handle(req, res, resolve); // Permission middleware
      });

      expectForbidden(res);
    });
  });

  describe('GET /api/resources/containers/metrics', () => {
    beforeEach(() => {
      req = createMockReq({ user: createTestUser() });
      res = createMockRes();
    });

    it('should return metrics summary', async () => {
      const { default: router } = await import(
        '../../api/docker-resource-monitoring.js'
      );

      await new Promise<void>(resolve => {
        router.stack
          .find(
            (layer: any) =>
              layer.route?.path === '/containers/metrics' &&
              layer.route?.methods?.get
          )
          ?.route.stack[2].handle(req, res, resolve);
      });

      expectSuccessResponse(res);
      expect(res.data.data.summary).toBeDefined();
      expect(res.data.data.recentAlerts).toBeDefined();
      expect(mockResourceMonitor.getUtilizationSummary).toHaveBeenCalled();
      expect(mockResourceMonitor.getAllAlerts).toHaveBeenCalled();
    });
  });

  describe('POST /api/resources/containers/:containerId/limits', () => {
    beforeEach(() => {
      req = createMockReq({
        user: createTestUser(),
        params: { containerId: 'test-container-1' },
        body: {
          cpu: { cores: 2, percentage: 80 },
          memory: {
            limit: 512 * 1024 * 1024,
            swap: 1024 * 1024 * 1024,
            reservation: 256 * 1024 * 1024,
          },
          processes: { max: 100 },
        },
      });
      res = createMockRes();
    });

    it('should set resource limits successfully', async () => {
      const { default: router } = await import(
        '../../api/docker-resource-monitoring.js'
      );

      await new Promise<void>(resolve => {
        router.stack
          .find(
            (layer: any) =>
              layer.route?.path === '/containers/:containerId/limits' &&
              layer.route?.methods?.post
          )
          ?.route.stack[2].handle(req, res, resolve);
      });

      expectSuccessResponse(res);
      expect(mockResourceMonitor.setResourceLimits).toHaveBeenCalledWith(
        'test-container-1',
        req.body
      );
      expect(mockAuditLogger.logAuditEvent).toHaveBeenCalled();
    });

    it('should validate required fields', async () => {
      req.body = { cpu: { cores: 2 } }; // Missing memory and processes

      const { default: router } = await import(
        '../../api/docker-resource-monitoring.js'
      );

      await new Promise<void>(resolve => {
        router.stack
          .find(
            (layer: any) =>
              layer.route?.path === '/containers/:containerId/limits' &&
              layer.route?.methods?.post
          )
          ?.route.stack[2].handle(req, res, resolve);
      });

      expectErrorResponse(
        res,
        400,
        'CPU, memory, and process limits are required'
      );
    });

    it('should handle failed limit updates', async () => {
      mockResourceMonitor.setResourceLimits.mockResolvedValueOnce(false);

      const { default: router } = await import(
        '../../api/docker-resource-monitoring.js'
      );

      await new Promise<void>(resolve => {
        router.stack
          .find(
            (layer: any) =>
              layer.route?.path === '/containers/:containerId/limits' &&
              layer.route?.methods?.post
          )
          ?.route.stack[2].handle(req, res, resolve);
      });

      expectErrorResponse(res, 500, 'Failed to update resource limits');
    });
  });

  describe('GET /api/resources/containers/:containerId/limits', () => {
    beforeEach(() => {
      req = createMockReq({
        user: createTestUser(),
        params: { containerId: 'test-container-1' },
      });
      res = createMockRes();
    });

    it('should return resource limits', async () => {
      const { default: router } = await import(
        '../../api/docker-resource-monitoring.js'
      );

      await new Promise<void>(resolve => {
        router.stack
          .find(
            (layer: any) =>
              layer.route?.path === '/containers/:containerId/limits' &&
              layer.route?.methods?.get
          )
          ?.route.stack[2].handle(req, res, resolve);
      });

      expectSuccessResponse(res);
      expect(res.data.data.containerId).toBe('test-container-1');
      expect(mockResourceMonitor.getLimits).toHaveBeenCalledWith(
        'test-container-1'
      );
    });

    it('should return 404 for container with no limits', async () => {
      mockResourceMonitor.getLimits.mockReturnValueOnce(undefined);

      const { default: router } = await import(
        '../../api/docker-resource-monitoring.js'
      );

      await new Promise<void>(resolve => {
        router.stack
          .find(
            (layer: any) =>
              layer.route?.path === '/containers/:containerId/limits' &&
              layer.route?.methods?.get
          )
          ?.route.stack[2].handle(req, res, resolve);
      });

      expectErrorResponse(res, 404, 'No resource limits found');
    });
  });

  describe('GET /api/resources/containers/:containerId/alerts', () => {
    beforeEach(() => {
      req = createMockReq({
        user: createTestUser(),
        params: { containerId: 'test-container-1' },
      });
      res = createMockRes();
    });

    it('should return container alerts', async () => {
      const { default: router } = await import(
        '../../api/docker-resource-monitoring.js'
      );

      await new Promise<void>(resolve => {
        router.stack
          .find(
            (layer: any) =>
              layer.route?.path === '/containers/:containerId/alerts' &&
              layer.route?.methods?.get
          )
          ?.route.stack[2].handle(req, res, resolve);
      });

      expectSuccessResponse(res);
      expect(res.data.data.alerts).toBeDefined();
      expect(res.data.data.activeAlerts).toBeDefined();
      expect(res.data.data.total).toBe(1);
      expect(res.data.data.active).toBe(1);
      expect(mockResourceMonitor.getAlerts).toHaveBeenCalledWith(
        'test-container-1'
      );
    });
  });

  describe('GET /api/resources/alerts', () => {
    beforeEach(() => {
      req = createMockReq({
        user: createTestUser(),
        query: { severity: 'critical', limit: '10' },
      });
      res = createMockRes();
    });

    it('should return all alerts with filtering', async () => {
      const { default: router } = await import(
        '../../api/docker-resource-monitoring.js'
      );

      await new Promise<void>(resolve => {
        router.stack
          .find(
            (layer: any) =>
              layer.route?.path === '/alerts' && layer.route?.methods?.get
          )
          ?.route.stack[2].handle(req, res, resolve);
      });

      expectSuccessResponse(res);
      expect(res.data.data.summary).toBeDefined();
      expect(res.data.data.alerts).toBeDefined();
      expect(res.data.data.summary.total).toBe(2);
      expect(res.data.data.summary.bySeverity.critical).toBe(1);
      expect(res.data.data.summary.bySeverity.warning).toBe(1);
      expect(mockResourceMonitor.getAllAlerts).toHaveBeenCalled();
    });
  });

  describe('POST /api/resources/alerts/:alertId/acknowledge', () => {
    beforeEach(() => {
      req = createMockReq({
        user: createTestUser(),
        params: { alertId: 'alert-1' },
      });
      res = createMockRes();
    });

    it('should acknowledge alert successfully', async () => {
      const { default: router } = await import(
        '../../api/docker-resource-monitoring.js'
      );

      await new Promise<void>(resolve => {
        router.stack
          .find(
            (layer: any) =>
              layer.route?.path === '/alerts/:alertId/acknowledge' &&
              layer.route?.methods?.post
          )
          ?.route.stack[2].handle(req, res, resolve);
      });

      expectSuccessResponse(res);
      expect(mockResourceMonitor.acknowledgeAlert).toHaveBeenCalledWith(
        'alert-1'
      );
      expect(mockAuditLogger.logAuditEvent).toHaveBeenCalled();
    });

    it('should return 404 for non-existent alert', async () => {
      mockResourceMonitor.acknowledgeAlert.mockReturnValueOnce(false);

      const { default: router } = await import(
        '../../api/docker-resource-monitoring.js'
      );

      await new Promise<void>(resolve => {
        router.stack
          .find(
            (layer: any) =>
              layer.route?.path === '/alerts/:alertId/acknowledge' &&
              layer.route?.methods?.post
          )
          ?.route.stack[2].handle(req, res, resolve);
      });

      expectErrorResponse(res, 404, 'Alert not found');
    });
  });

  describe('GET /api/resources/containers/:containerId/predictions', () => {
    beforeEach(() => {
      req = createMockReq({
        user: createTestUser(),
        params: { containerId: 'test-container-1' },
        query: { forecastMinutes: '60' },
      });
      res = createMockRes();
    });

    it('should return resource predictions', async () => {
      const { default: router } = await import(
        '../../api/docker-resource-monitoring.js'
      );

      await new Promise<void>(resolve => {
        router.stack
          .find(
            (layer: any) =>
              layer.route?.path === '/containers/:containerId/predictions' &&
              layer.route?.methods?.get
          )
          ?.route.stack[2].handle(req, res, resolve);
      });

      expectSuccessResponse(res);
      expect(res.data.data.prediction).toBeDefined();
      expect(res.data.data.forecastMinutes).toBe(60);
      expect(mockResourceMonitor.predictResourceUsage).toHaveBeenCalledWith(
        'test-container-1',
        60
      );
    });
  });

  describe('GET /api/resources/system/overview', () => {
    beforeEach(() => {
      req = createMockReq({ user: createTestUser() });
      res = createMockRes();
    });

    it('should return system overview', async () => {
      const { default: router } = await import(
        '../../api/docker-resource-monitoring.js'
      );

      await new Promise<void>(resolve => {
        router.stack
          .find(
            (layer: any) =>
              layer.route?.path === '/system/overview' &&
              layer.route?.methods?.get
          )
          ?.route.stack[2].handle(req, res, resolve);
      });

      expectSuccessResponse(res);
      expect(res.data.data.summary).toBeDefined();
      expect(res.data.data.healthScore).toBeDefined();
      expect(res.data.data.healthStatus).toBeDefined();
      expect(res.data.data.systemMetrics).toBeDefined();

      expect(typeof res.data.data.healthScore).toBe('number');
      expect(res.data.data.healthScore).toBeGreaterThanOrEqual(0);
      expect(res.data.data.healthScore).toBeLessThanOrEqual(100);
      expect(['healthy', 'warning', 'critical']).toContain(
        res.data.data.healthStatus
      );
    });
  });

  describe('GET /api/resources/containers/:containerId/export', () => {
    beforeEach(() => {
      req = createMockReq({
        user: createTestUser(),
        params: { containerId: 'test-container-1' },
        query: { format: 'json', timeRange: '86400000' },
      });
      res = createMockRes();
    });

    it('should export metrics in JSON format', async () => {
      const { default: router } = await import(
        '../../api/docker-resource-monitoring.js'
      );

      await new Promise<void>(resolve => {
        router.stack
          .find(
            (layer: any) =>
              layer.route?.path === '/containers/:containerId/export' &&
              layer.route?.methods?.get
          )
          ?.route.stack[2].handle(req, res, resolve);
      });

      expectSuccessResponse(res);
      expect(res.data.data.containerId).toBe('test-container-1');
      expect(res.data.data.metrics).toBeDefined();
      expect(mockAuditLogger.logAuditEvent).toHaveBeenCalled();
    });

    it('should export metrics in CSV format', async () => {
      req.query.format = 'csv';

      const { default: router } = await import(
        '../../api/docker-resource-monitoring.js'
      );

      await new Promise<void>(resolve => {
        router.stack
          .find(
            (layer: any) =>
              layer.route?.path === '/containers/:containerId/export' &&
              layer.route?.methods?.get
          )
          ?.route.stack[2].handle(req, res, resolve);
      });

      expect(res.headers['Content-Type']).toBe('text/csv');
      expect(res.headers['Content-Disposition']).toContain('attachment');
      expect(typeof res.data).toBe('string');
      expect(res.data).toContain('timestamp,cpu_usage,memory_usage');
    });

    it('should return 404 for no metrics in time range', async () => {
      mockResourceMonitor.getMetrics.mockReturnValueOnce([]);

      const { default: router } = await import(
        '../../api/docker-resource-monitoring.js'
      );

      await new Promise<void>(resolve => {
        router.stack
          .find(
            (layer: any) =>
              layer.route?.path === '/containers/:containerId/export' &&
              layer.route?.methods?.get
          )
          ?.route.stack[2].handle(req, res, resolve);
      });

      expectErrorResponse(
        res,
        404,
        'No metrics found for the specified time range'
      );
    });
  });

  describe('Permission Requirements', () => {
    it('should require container permissions for container endpoints', async () => {
      const userWithoutPermission = { ...createTestUser(), permissions: [] };
      req = createMockReq({
        user: userWithoutPermission,
        params: { containerId: 'test-container-1' },
      });
      res = createMockRes();

      const { default: router } = await import(
        '../../api/docker-resource-monitoring.js'
      );

      await new Promise<void>(resolve => {
        router.stack
          .find(
            (layer: any) =>
              layer.route?.path === '/containers/:containerId/metrics' &&
              layer.route?.methods?.get
          )
          ?.route.stack[1].handle(req, res, resolve);
      });

      expectForbidden(res);
    });

    it('should require system permissions for system endpoints', async () => {
      const userWithoutPermission = {
        ...createTestUser(),
        permissions: ['container:read'],
      };
      req = createMockReq({ user: userWithoutPermission });
      res = createMockRes();

      const { default: router } = await import(
        '../../api/docker-resource-monitoring.js'
      );

      await new Promise<void>(resolve => {
        router.stack
          .find(
            (layer: any) =>
              layer.route?.path === '/system/overview' &&
              layer.route?.methods?.get
          )
          ?.route.stack[1].handle(req, res, resolve);
      });

      expectForbidden(res);
    });

    it('should allow admin access to all endpoints', async () => {
      const admin = createTestAdmin();
      req = createMockReq({
        user: admin,
        params: { containerId: 'test-container-1' },
      });
      res = createMockRes();

      const { default: router } = await import(
        '../../api/docker-resource-monitoring.js'
      );

      await new Promise<void>(resolve => {
        router.stack
          .find(
            (layer: any) =>
              layer.route?.path === '/containers/:containerId/limits' &&
              layer.route?.methods?.post
          )
          ?.route.stack[1].handle(req, res, resolve);
      });

      // Should pass permission check (next called)
      expect(res.statusCode).toBe(200); // Default status, means next() was called
    });
  });
});
