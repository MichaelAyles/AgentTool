# DuckBridge Connector Testing Guide

This document provides comprehensive information about testing the DuckBridge connector system.

## Table of Contents

- [Overview](#overview)
- [Test Structure](#test-structure)
- [Quick Start](#quick-start)
- [Test Categories](#test-categories)
- [Running Tests](#running-tests)
- [CI/CD Pipeline](#cicd-pipeline)
- [Writing Tests](#writing-tests)
- [Troubleshooting](#troubleshooting)

## Overview

The DuckBridge connector has a comprehensive testing suite that covers:

- **Unit Tests**: Individual component testing
- **Integration Tests**: Full system integration testing
- **End-to-End Tests**: Complete workflow testing
- **Stress Tests**: Performance and load testing
- **Security Tests**: Security vulnerability scanning

## Test Structure

```
tests/
├── setup.ts                 # Global test configuration
├── unit/                    # Unit tests
│   ├── terminal.test.ts
│   ├── websocket.test.ts
│   ├── agent-system.test.ts
│   └── ...
├── integration/             # Integration tests
│   ├── full-system.test.ts
│   └── ...
├── e2e/                     # End-to-end tests
│   └── ...
└── stress/                  # Stress tests
    ├── stress-test.js
    └── run-stress-tests.js
```

## Quick Start

### Prerequisites

1. **Node.js 18+**
2. **npm or yarn**
3. **Claude CLI** (for agent tests):
   ```bash
   npm install -g @anthropic-ai/claude-code
   ```
4. **Python 3.10+** (for Gemini agent tests):
   ```bash
   pip install google-generativeai
   ```

### Installation

```bash
# Install dependencies
npm install

# Build the project
npm run build
```

### Running All Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage
```

## Test Categories

### Unit Tests

Test individual components in isolation.

```bash
# Run unit tests only
npm run test:unit

# Run specific test file
npx jest tests/unit/terminal.test.ts
```

**Coverage includes:**
- TerminalManager: Session creation, resource limits, cleanup
- WebSocketManager: Connection handling, message routing, client management
- AgentSystem: Agent lifecycle, task management, communication
- Database operations: Session persistence, file operations
- Tool detection: Development tool discovery and validation

### Integration Tests

Test component interactions and full system behavior.

```bash
# Run integration tests
npm run test:integration
```

**Coverage includes:**
- HTTP API endpoints testing
- WebSocket real-time communication
- Multi-terminal management
- Agent coordination and task execution
- Project management workflows
- Error handling and recovery

### End-to-End Tests

Test complete user workflows from start to finish.

```bash
# Run E2E tests
npm run test:e2e
```

**Coverage includes:**
- Complete connector startup and initialization
- Frontend-connector communication
- Terminal session lifecycle
- Agent task execution workflows
- Collaboration features
- Layout management

### Stress Tests

Test system performance and stability under load.

```bash
# Run stress tests
npm run test:stress

# Run stress tests with custom parameters
node tests/stress/stress-test.js 3001 3002
```

**Test scenarios:**
- 50+ concurrent WebSocket connections
- 20+ simultaneous terminal sessions
- 100+ concurrent API requests
- Multiple agent instances with task load
- Memory usage monitoring
- Resource cleanup verification

## Running Tests

### Command Reference

```bash
# All tests
npm test                    # Run all tests
npm run test:watch         # Run tests in watch mode
npm run test:coverage      # Run with coverage report

# Category-specific
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests only
npm run test:e2e          # End-to-end tests only
npm run test:stress       # Stress tests only

# Development
npm run lint              # Run ESLint
npm run lint:fix          # Fix ESLint issues
```

### Environment Variables

```bash
# Optional: Set API keys for agent testing
export CLAUDE_API_KEY="your-claude-api-key"
export GEMINI_API_KEY="your-gemini-api-key"

# Test configuration
export NODE_ENV=test
export TEST_TIMEOUT=30000
```

### Test Configuration

Tests are configured in `jest.config.js`:

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testTimeout: 30000,
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  // ... other options
};
```

## CI/CD Pipeline

The GitHub Actions pipeline (`.github/workflows/connector-tests.yml`) runs:

### On Every Push/PR:
1. **Lint and Type Check**
2. **Unit Tests**
3. **Integration Tests** (Ubuntu, Windows, macOS)
4. **E2E Tests**
5. **Security Scan**
6. **Test Coverage Report**

### Scheduled/On-Demand:
1. **Stress Tests**
2. **Performance Benchmarks**
3. **Extended Security Scans**

### Pipeline Triggers:

```yaml
# Automatic triggers
on:
  push:
    branches: [main, develop]
    paths: ['connector/**']
  pull_request:
    branches: [main, develop]
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM UTC

# Manual triggers
# Add [stress-test] to commit message for stress tests
# Add [benchmark] to commit message for benchmarks
```

## Writing Tests

### Test Structure

```typescript
import { ComponentToTest } from '../../src/component';

describe('ComponentToTest', () => {
  let component: ComponentToTest;

  beforeEach(() => {
    component = new ComponentToTest();
  });

  afterEach(() => {
    // Cleanup
  });

  describe('Feature Group', () => {
    test('should do something specific', () => {
      // Arrange
      const input = 'test-input';
      
      // Act
      const result = component.doSomething(input);
      
      // Assert
      expect(result).toBe('expected-output');
    });
  });
});
```

### Best Practices

1. **Isolation**: Each test should be independent
2. **Cleanup**: Always clean up resources in `afterEach`
3. **Descriptive Names**: Use clear, descriptive test names
4. **Arrange-Act-Assert**: Structure tests clearly
5. **Mock External Dependencies**: Use mocks for external services
6. **Test Edge Cases**: Include error conditions and edge cases

### Mock Examples

```typescript
// Mock external dependencies
jest.mock('child_process');
jest.mock('ws');

// Mock implementation
const mockSpawn = jest.fn();
(require('child_process') as any).spawn = mockSpawn;
```

### Async Testing

```typescript
test('should handle async operations', async () => {
  const result = await component.asyncMethod();
  expect(result).toBeDefined();
});

test('should handle promises with timeout', async () => {
  await expect(component.slowMethod()).resolves.toBe('result');
}, 10000); // 10 second timeout
```

## Test Data and Fixtures

### Using Test Utilities

```typescript
// Available in all tests via setup.ts
const testUuid = global.testUtils.generateTestUuid();

// Wait for conditions
await global.testUtils.waitForCondition(
  () => component.isReady(),
  5000 // timeout
);
```

### Creating Test Data

```typescript
const createTestSession = () => ({
  id: global.testUtils.generateTestUuid(),
  uuid: global.testUtils.generateTestUuid(),
  createdAt: new Date(),
  isActive: true
});
```

## Troubleshooting

### Common Issues

**1. Port conflicts**
```bash
# Check for processes using test ports
lsof -i :9999
lsof -i :9001
lsof -i :9002

# Kill processes if needed
kill -9 <PID>
```

**2. Test timeouts**
```bash
# Increase timeout in jest.config.js or individual tests
jest.setTimeout(60000);
```

**3. Memory leaks**
```bash
# Run tests with memory debugging
node --expose-gc --inspect ./node_modules/.bin/jest
```

**4. WebSocket connection issues**
```bash
# Check if WebSocket server is running
netstat -an | grep :9002
```

### Debug Mode

```bash
# Run tests with debug output
DEBUG=* npm test

# Run specific test with debugging
node --inspect-brk ./node_modules/.bin/jest tests/unit/terminal.test.ts
```

### Test Coverage

```bash
# Generate coverage report
npm run test:coverage

# View coverage report
open coverage/lcov-report/index.html
```

## Performance Testing

### Stress Test Configuration

The stress tests can be customized:

```javascript
const stressTest = new StressTest(httpPort, wsPort);

// Configure test parameters
await stressTest.testConcurrentConnections(100);  // 100 connections
await stressTest.testMultipleTerminals(50);       // 50 terminals
await stressTest.testAPILoad(500);                // 500 requests
```

### Memory Monitoring

```bash
# Monitor memory during tests
node --expose-gc tests/stress/run-stress-tests.js
```

### Performance Metrics

The stress tests measure:
- **Connection times**: WebSocket connection establishment
- **Response times**: API request/response latency
- **Throughput**: Requests per second
- **Memory usage**: Heap and external memory consumption
- **Resource cleanup**: Proper resource deallocation

## Security Testing

### Automated Security Scans

```bash
# Run npm audit
npm audit

# Run with Snyk (if configured)
npx snyk test
```

### Manual Security Testing

1. **Input validation**: Test with malformed inputs
2. **Authentication**: Test with invalid UUIDs
3. **Authorization**: Test access to resources
4. **Injection attacks**: Test command injection prevention
5. **DOS resistance**: Test with excessive load

## Continuous Integration

### Local CI Simulation

```bash
# Run the same checks as CI
npm run lint
npm run build
npm run test:coverage
npm audit
```

### Artifacts

CI produces these artifacts:
- Test coverage reports
- Stress test results
- Performance benchmarks
- Security scan reports
- Built packages

### Monitoring

- **Test results**: GitHub Actions dashboard
- **Coverage**: Codecov integration
- **Performance**: Benchmark trend analysis
- **Security**: Snyk vulnerability monitoring

## Contributing

When adding new tests:

1. **Follow naming conventions**: `component.test.ts`
2. **Add to appropriate category**: unit/integration/e2e
3. **Update documentation**: Include test descriptions
4. **Verify CI passes**: All checks must pass
5. **Include edge cases**: Test error conditions
6. **Mock external services**: Don't rely on external APIs

## Resources

- [Jest Documentation](https://jestjs.io/docs)
- [TypeScript Testing](https://kulshekhar.github.io/ts-jest/)
- [GitHub Actions](https://docs.github.com/en/actions)
- [WebSocket Testing](https://github.com/websockets/ws#websocket-testing)
- [Node.js Testing Best Practices](https://github.com/goldbergyoni/nodebestpractices#-6-testing-and-overall-quality-practices)