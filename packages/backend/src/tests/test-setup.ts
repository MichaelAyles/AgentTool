import { beforeAll, afterAll, beforeEach, afterEach } from 'bun:test';
import type { Database } from 'better-sqlite3';

// Mock implementations for testing
export const mockDb = {
  prepare: (sql: string) => ({
    run: () => ({ changes: 1, lastInsertRowid: 1 }),
    get: () => null,
    all: () => [],
  }),
  exec: () => {},
  close: () => {},
  pragma: () => {},
  function: () => {},
  aggregate: () => {},
  loadExtension: () => {},
};

// Test environment setup
beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = ':memory:';
  process.env.REDIS_URL = 'redis://localhost:6379/15'; // Use test database
  process.env.JWT_SECRET = 'test-secret';
  process.env.SESSION_SECRET = 'test-session-secret';
});

afterAll(() => {
  // Cleanup after all tests
});

beforeEach(() => {
  // Setup before each test
});

afterEach(() => {
  // Cleanup after each test
});

// Test utilities
export const createTestUser = () => ({
  id: 'test-user-1',
  username: 'testuser',
  email: 'test@example.com',
  role: 'user' as const,
  permissions: ['project:read', 'project:create', 'session:create'],
  createdAt: new Date(),
  updatedAt: new Date(),
});

export const createTestAdmin = () => ({
  id: 'test-admin-1',
  username: 'testadmin',
  email: 'admin@example.com',
  role: 'admin' as const,
  permissions: ['*'],
  createdAt: new Date(),
  updatedAt: new Date(),
});

export const createTestProject = () => ({
  id: 'test-project-1',
  name: 'Test Project',
  path: '/tmp/test-project',
  activeAdapter: 'claude-code',
  userId: 'test-user-1',
  gitRemote: null,
  description: 'A test project',
  createdAt: new Date(),
  updatedAt: new Date(),
});

export const createTestSession = () => ({
  id: 'test-session-1',
  userId: 'test-user-1',
  projectId: 'test-project-1',
  adapterName: 'claude-code',
  status: 'active' as const,
  createdAt: new Date(),
  updatedAt: new Date(),
});

// Mock Express request/response
export const createMockReq = (overrides: any = {}) => ({
  user: createTestUser(),
  session: { id: 'test-session-1' },
  ip: '127.0.0.1',
  get: (header: string) => header === 'User-Agent' ? 'test-agent' : undefined,
  params: {},
  query: {},
  body: {},
  ...overrides,
});

export const createMockRes = () => {
  const res: any = {
    status: function(code: number) { this.statusCode = code; return this; },
    json: function(data: any) { this.data = data; return this; },
    send: function(data: any) { this.data = data; return this; },
    setHeader: function(name: string, value: string) { 
      this.headers = this.headers || {}; 
      this.headers[name] = value; 
      return this; 
    },
    statusCode: 200,
    data: null,
    headers: {},
  };
  return res;
};

// Mock Docker container
export const createMockContainer = () => ({
  id: 'test-container-1',
  status: 'running',
  image: 'node:18',
  names: ['/test-container'],
  created: Math.floor(Date.now() / 1000),
  state: 'running',
  labels: {
    'vibe.project': 'test-project-1',
    'vibe.session': 'test-session-1',
  },
});

// Mock Docker stats
export const createMockStats = () => ({
  read: new Date().toISOString(),
  preread: new Date(Date.now() - 5000).toISOString(),
  pids_stats: { current: 5 },
  blkio_stats: {
    io_service_bytes_recursive: [
      { major: 8, minor: 0, op: 'Read', value: 1024000 },
      { major: 8, minor: 0, op: 'Write', value: 512000 },
    ],
    io_serviced_recursive: [
      { major: 8, minor: 0, op: 'Read', value: 100 },
      { major: 8, minor: 0, op: 'Write', value: 50 },
    ],
  },
  cpu_stats: {
    cpu_usage: {
      total_usage: 100000000,
      usage_in_kernelmode: 30000000,
      usage_in_usermode: 70000000,
    },
    system_cpu_usage: 1000000000,
    online_cpus: 4,
    throttling_data: {
      throttled_time: 0,
    },
  },
  precpu_stats: {
    cpu_usage: {
      total_usage: 95000000,
      usage_in_kernelmode: 28000000,
      usage_in_usermode: 67000000,
    },
    system_cpu_usage: 950000000,
    online_cpus: 4,
    throttling_data: {
      throttled_time: 0,
    },
  },
  memory_stats: {
    usage: 134217728, // 128MB
    limit: 268435456, // 256MB
    stats: {
      cache: 16777216, // 16MB
      rss: 117440512, // 112MB
      swap: 0,
    },
  },
  networks: {
    eth0: {
      rx_bytes: 1024000,
      rx_packets: 1000,
      rx_errors: 0,
      rx_dropped: 0,
      tx_bytes: 512000,
      tx_packets: 500,
      tx_errors: 0,
      tx_dropped: 0,
    },
  },
});

// Mock process metrics
export const createMockProcessMetrics = () => ({
  pid: 12345,
  cpu: 25.5,
  memory: {
    rss: 134217728,
    vms: 268435456,
    percent: 12.5,
  },
  uptime: 3600,
  status: 'running',
  threads: 8,
});

// Test data generators
export const generateTestData = {
  users: (count: number) => Array.from({ length: count }, (_, i) => ({
    ...createTestUser(),
    id: `test-user-${i + 1}`,
    username: `testuser${i + 1}`,
    email: `test${i + 1}@example.com`,
  })),
  
  projects: (count: number, userId?: string) => Array.from({ length: count }, (_, i) => ({
    ...createTestProject(),
    id: `test-project-${i + 1}`,
    name: `Test Project ${i + 1}`,
    path: `/tmp/test-project-${i + 1}`,
    userId: userId || `test-user-${i + 1}`,
  })),
  
  containers: (count: number) => Array.from({ length: count }, (_, i) => ({
    ...createMockContainer(),
    id: `test-container-${i + 1}`,
    names: [`/test-container-${i + 1}`],
  })),
};

// Assertion helpers
export const expectSuccessResponse = (res: any, expectedData?: any) => {
  expect(res.statusCode).toBe(200);
  expect(res.data.success).toBe(true);
  if (expectedData) {
    expect(res.data.data).toEqual(expectedData);
  }
};

export const expectErrorResponse = (res: any, expectedStatus: number, expectedMessage?: string) => {
  expect(res.statusCode).toBe(expectedStatus);
  expect(res.data.success).toBe(false);
  if (expectedMessage) {
    expect(res.data.message).toContain(expectedMessage);
  }
};

export const expectValidationError = (res: any, field?: string) => {
  expectErrorResponse(res, 400);
  if (field) {
    expect(res.data.message).toContain(field);
  }
};

export const expectUnauthorized = (res: any) => {
  expectErrorResponse(res, 401, 'unauthorized');
};

export const expectForbidden = (res: any) => {
  expectErrorResponse(res, 403, 'forbidden');
};

export const expectNotFound = (res: any, resource?: string) => {
  expectErrorResponse(res, 404, 'not found');
  if (resource) {
    expect(res.data.message).toContain(resource);
  }
};

// Time utilities for testing
export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const waitFor = async (condition: () => boolean, timeout: number = 5000, interval: number = 100) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (condition()) return true;
    await sleep(interval);
  }
  throw new Error(`Condition not met within ${timeout}ms`);
};

// Test database helpers
export const clearTestData = async () => {
  // Clear test data from database
  // This would be implemented based on your actual database structure
};

export const seedTestData = async () => {
  // Seed test data
  // This would be implemented based on your actual database structure
};

// Mock implementations for external services
export const mockServices = {
  docker: {
    listContainers: () => Promise.resolve(generateTestData.containers(3)),
    getContainer: (id: string) => ({
      inspect: () => Promise.resolve({
        Id: id,
        State: { Status: 'running' },
        Config: { Image: 'node:18' },
        Created: new Date().toISOString(),
      }),
      stats: () => Promise.resolve(createMockStats()),
      stop: () => Promise.resolve(),
      remove: () => Promise.resolve(),
      start: () => Promise.resolve(),
    }),
    createContainer: () => Promise.resolve({
      id: 'new-container-id',
      start: () => Promise.resolve(),
    }),
  },
  
  redis: {
    get: () => Promise.resolve(null),
    set: () => Promise.resolve('OK'),
    del: () => Promise.resolve(1),
    exists: () => Promise.resolve(0),
    expire: () => Promise.resolve(1),
    keys: () => Promise.resolve([]),
    flushdb: () => Promise.resolve('OK'),
  },
  
  process: {
    spawn: () => ({
      pid: 12345,
      on: () => {},
      kill: () => true,
      stdout: { on: () => {} },
      stderr: { on: () => {} },
    }),
    exec: (command: string, callback: Function) => {
      callback(null, 'command output', '');
    },
  },
};

// Environment helpers
export const withTestEnv = (env: Record<string, string>, fn: () => void | Promise<void>) => {
  const originalEnv = { ...process.env };
  
  return async () => {
    try {
      Object.assign(process.env, env);
      await fn();
    } finally {
      process.env = originalEnv;
    }
  };
};

// File system helpers for testing
export const createTempDir = () => {
  const tmpDir = `/tmp/vibe-test-${Date.now()}`;
  return tmpDir;
};

export const cleanupTempDir = (dir: string) => {
  // Implementation would use fs to clean up temp directories
};

export default {
  mockDb,
  createTestUser,
  createTestAdmin,
  createTestProject,
  createTestSession,
  createMockReq,
  createMockRes,
  createMockContainer,
  createMockStats,
  createMockProcessMetrics,
  generateTestData,
  expectSuccessResponse,
  expectErrorResponse,
  expectValidationError,
  expectUnauthorized,
  expectForbidden,
  expectNotFound,
  sleep,
  waitFor,
  clearTestData,
  seedTestData,
  mockServices,
  withTestEnv,
  createTempDir,
  cleanupTempDir,
};