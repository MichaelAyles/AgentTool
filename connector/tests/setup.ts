import { v4 as uuidv4 } from 'uuid';

// Global test configuration
interface TestUtils {
  generateTestUuid: () => string;
  cleanupResources: () => Promise<void>;
  waitForCondition: (condition: () => boolean, timeout?: number) => Promise<boolean>;
}

declare global {
  var testUtils: TestUtils;
}

// Test utilities
(global as any).testUtils = {
  generateTestUuid: () => uuidv4(),
  
  cleanupResources: async () => {
    // Cleanup any global resources after tests
    // This will be expanded as needed
  },
  
  waitForCondition: async (condition: () => boolean, timeout: number = 5000): Promise<boolean> => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (condition()) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return false;
  }
};

// Setup and teardown
beforeEach(() => {
  // Clear any mocks or reset state before each test
  jest.clearAllMocks();
});

afterEach(async () => {
  // Cleanup after each test
  await (global as any).testUtils.cleanupResources();
});

// Increase timeout for integration tests
jest.setTimeout(30000);