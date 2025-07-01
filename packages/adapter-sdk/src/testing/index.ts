import type { BaseAdapter } from '../base/index.js';
import type { AdapterCapability } from '../types/index.js';
import { validateAdapter } from '../validation/index.js';

export interface TestResult {
  passed: boolean;
  message: string;
  duration?: number;
  error?: string;
}

export interface AdapterTestSuite {
  name: string;
  tests: AdapterTest[];
  setup?: () => Promise<void>;
  teardown?: () => Promise<void>;
}

export interface AdapterTest {
  name: string;
  description?: string;
  timeout?: number;
  skip?: boolean;
  run: (adapter: BaseAdapter) => Promise<TestResult>;
}

export class AdapterTester {
  private adapter: BaseAdapter;
  private testResults: Map<string, TestResult> = new Map();

  constructor(adapter: BaseAdapter) {
    this.adapter = adapter;
  }

  async runAllTests(): Promise<Map<string, TestResult>> {
    this.testResults.clear();

    // Basic validation tests
    await this.runBasicTests();

    // Capability-specific tests
    const capabilities = this.adapter.getCapabilities();
    for (const capability of capabilities) {
      await this.runCapabilityTests(capability);
    }

    // Integration tests
    await this.runIntegrationTests();

    return this.testResults;
  }

  async runTestSuite(suite: AdapterTestSuite): Promise<Map<string, TestResult>> {
    console.log(`Running test suite: ${suite.name}`);
    
    try {
      // Run setup if provided
      if (suite.setup) {
        await suite.setup();
      }

      // Run individual tests
      for (const test of suite.tests) {
        if (test.skip) {
          this.testResults.set(test.name, {
            passed: true,
            message: 'Skipped',
          });
          continue;
        }

        const result = await this.runSingleTest(test);
        this.testResults.set(test.name, result);
      }

      // Run teardown if provided
      if (suite.teardown) {
        await suite.teardown();
      }
    } catch (error) {
      console.error(`Test suite ${suite.name} failed:`, error);
    }

    return this.testResults;
  }

  private async runSingleTest(test: AdapterTest): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      const timeout = test.timeout || 10000; // 10 second default timeout
      
      const timeoutPromise = new Promise<TestResult>((_, reject) => {
        setTimeout(() => reject(new Error(`Test timed out after ${timeout}ms`)), timeout);
      });

      const testPromise = test.run(this.adapter);
      
      const result = await Promise.race([testPromise, timeoutPromise]);
      const duration = Date.now() - startTime;

      return {
        ...result,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        passed: false,
        message: `Test failed: ${test.name}`,
        duration,
        error: error.message,
      };
    }
  }

  private async runBasicTests(): Promise<void> {
    // Validation test
    const validationResult = validateAdapter(this.adapter);
    this.testResults.set('validation', {
      passed: validationResult.isValid,
      message: validationResult.isValid 
        ? 'Adapter validation passed' 
        : `Validation failed: ${validationResult.errors.join(', ')}`,
    });

    // Metadata tests
    const metadataTests: AdapterTest[] = [
      {
        name: 'getName',
        run: async (adapter) => {
          const name = adapter.getName();
          return {
            passed: typeof name === 'string' && name.length > 0,
            message: typeof name === 'string' && name.length > 0 
              ? `Name: ${name}` 
              : 'Invalid name',
          };
        },
      },
      {
        name: 'getVersion',
        run: async (adapter) => {
          const version = adapter.getVersion();
          const semverRegex = /^\d+\.\d+\.\d+/;
          return {
            passed: typeof version === 'string' && semverRegex.test(version),
            message: typeof version === 'string' && semverRegex.test(version)
              ? `Version: ${version}`
              : 'Invalid version format',
          };
        },
      },
      {
        name: 'getDescription',
        run: async (adapter) => {
          const description = adapter.getDescription();
          return {
            passed: typeof description === 'string' && description.length > 0,
            message: typeof description === 'string' && description.length > 0
              ? `Description: ${description.substring(0, 50)}...`
              : 'Invalid description',
          };
        },
      },
      {
        name: 'getCapabilities',
        run: async (adapter) => {
          const capabilities = adapter.getCapabilities();
          const isValid = Array.isArray(capabilities) && capabilities.length > 0;
          return {
            passed: isValid,
            message: isValid
              ? `Capabilities: ${capabilities.join(', ')}`
              : 'Invalid capabilities',
          };
        },
      },
    ];

    for (const test of metadataTests) {
      const result = await this.runSingleTest(test);
      this.testResults.set(test.name, result);
    }
  }

  private async runCapabilityTests(capability: AdapterCapability): Promise<void> {
    switch (capability) {
      case 'execute':
        await this.testExecuteCapability();
        break;
      case 'interactive':
        await this.testInteractiveCapability();
        break;
      case 'file-operations':
        await this.testFileOperationsCapability();
        break;
      case 'git-integration':
        await this.testGitIntegrationCapability();
        break;
      case 'network-access':
        await this.testNetworkAccessCapability();
        break;
      case 'system-commands':
        await this.testSystemCommandsCapability();
        break;
    }
  }

  private async testExecuteCapability(): Promise<void> {
    const test: AdapterTest = {
      name: 'execute-capability',
      run: async (adapter) => {
        try {
          // Test basic execution
          const result = await adapter.execute('echo "test"', {});
          return {
            passed: result.success === true,
            message: result.success ? 'Execute capability working' : 'Execute failed',
          };
        } catch (error) {
          return {
            passed: false,
            message: `Execute capability error: ${error.message}`,
          };
        }
      },
    };

    const result = await this.runSingleTest(test);
    this.testResults.set(test.name, result);
  }

  private async testInteractiveCapability(): Promise<void> {
    const test: AdapterTest = {
      name: 'interactive-capability',
      run: async (adapter) => {
        try {
          // Test if adapter supports interactive mode
          const hasInteractiveMethod = typeof (adapter as any).startInteractiveSession === 'function';
          return {
            passed: hasInteractiveMethod,
            message: hasInteractiveMethod 
              ? 'Interactive capability available' 
              : 'Interactive methods not implemented',
          };
        } catch (error) {
          return {
            passed: false,
            message: `Interactive capability error: ${error.message}`,
          };
        }
      },
    };

    const result = await this.runSingleTest(test);
    this.testResults.set(test.name, result);
  }

  private async testFileOperationsCapability(): Promise<void> {
    const test: AdapterTest = {
      name: 'file-operations-capability',
      run: async (adapter) => {
        try {
          // Test basic file operations
          const result = await adapter.execute('ls', {});
          return {
            passed: result.success === true,
            message: result.success ? 'File operations working' : 'File operations failed',
          };
        } catch (error) {
          return {
            passed: false,
            message: `File operations capability error: ${error.message}`,
          };
        }
      },
    };

    const result = await this.runSingleTest(test);
    this.testResults.set(test.name, result);
  }

  private async testGitIntegrationCapability(): Promise<void> {
    const test: AdapterTest = {
      name: 'git-integration-capability',
      run: async (adapter) => {
        try {
          // Test git command
          const result = await adapter.execute('git --version', {});
          return {
            passed: result.success === true,
            message: result.success ? 'Git integration working' : 'Git integration failed',
          };
        } catch (error) {
          return {
            passed: false,
            message: `Git integration capability error: ${error.message}`,
          };
        }
      },
    };

    const result = await this.runSingleTest(test);
    this.testResults.set(test.name, result);
  }

  private async testNetworkAccessCapability(): Promise<void> {
    const test: AdapterTest = {
      name: 'network-access-capability',
      run: async (adapter) => {
        try {
          // Test network access (ping or curl)
          const result = await adapter.execute('curl --version', {});
          return {
            passed: result.success === true,
            message: result.success ? 'Network access working' : 'Network access failed',
          };
        } catch (error) {
          return {
            passed: false,
            message: `Network access capability error: ${error.message}`,
          };
        }
      },
    };

    const result = await this.runSingleTest(test);
    this.testResults.set(test.name, result);
  }

  private async testSystemCommandsCapability(): Promise<void> {
    const test: AdapterTest = {
      name: 'system-commands-capability',
      run: async (adapter) => {
        try {
          // Test system commands
          const result = await adapter.execute('whoami', {});
          return {
            passed: result.success === true,
            message: result.success ? 'System commands working' : 'System commands failed',
          };
        } catch (error) {
          return {
            passed: false,
            message: `System commands capability error: ${error.message}`,
          };
        }
      },
    };

    const result = await this.runSingleTest(test);
    this.testResults.set(test.name, result);
  }

  private async runIntegrationTests(): Promise<void> {
    const integrationTests: AdapterTest[] = [
      {
        name: 'initialization',
        run: async (adapter) => {
          try {
            await adapter.initialize();
            return {
              passed: true,
              message: 'Adapter initialized successfully',
            };
          } catch (error) {
            return {
              passed: false,
              message: `Initialization failed: ${error.message}`,
            };
          }
        },
      },
      {
        name: 'cleanup',
        run: async (adapter) => {
          try {
            await adapter.cleanup();
            return {
              passed: true,
              message: 'Adapter cleanup successful',
            };
          } catch (error) {
            return {
              passed: false,
              message: `Cleanup failed: ${error.message}`,
            };
          }
        },
      },
    ];

    for (const test of integrationTests) {
      const result = await this.runSingleTest(test);
      this.testResults.set(test.name, result);
    }
  }

  getTestResults(): Map<string, TestResult> {
    return this.testResults;
  }

  generateReport(): string {
    const results = Array.from(this.testResults.entries());
    const passed = results.filter(([_, result]) => result.passed).length;
    const total = results.length;

    let report = `\n=== Adapter Test Report ===\n`;
    report += `Adapter: ${this.adapter.getName()} v${this.adapter.getVersion()}\n`;
    report += `Tests Passed: ${passed}/${total}\n\n`;

    for (const [name, result] of results) {
      const status = result.passed ? '✅ PASS' : '❌ FAIL';
      const duration = result.duration ? ` (${result.duration}ms)` : '';
      report += `${status} ${name}${duration}\n`;
      report += `  ${result.message}\n`;
      if (result.error) {
        report += `  Error: ${result.error}\n`;
      }
      report += '\n';
    }

    return report;
  }
}

// Utility functions for creating common test suites
export function createBasicTestSuite(): AdapterTestSuite {
  return {
    name: 'Basic Adapter Tests',
    tests: [
      {
        name: 'adapter-validation',
        description: 'Validates adapter structure and metadata',
        run: async (adapter) => {
          const validation = validateAdapter(adapter);
          return {
            passed: validation.isValid,
            message: validation.isValid ? 'Validation passed' : validation.errors.join(', '),
          };
        },
      },
      {
        name: 'initialization-test',
        description: 'Tests adapter initialization',
        run: async (adapter) => {
          try {
            await adapter.initialize();
            return {
              passed: true,
              message: 'Initialization successful',
            };
          } catch (error) {
            return {
              passed: false,
              message: `Initialization failed: ${error.message}`,
            };
          }
        },
      },
    ],
  };
}

export function createExecutionTestSuite(): AdapterTestSuite {
  return {
    name: 'Execution Tests',
    tests: [
      {
        name: 'simple-command',
        description: 'Tests simple command execution',
        run: async (adapter) => {
          try {
            const result = await adapter.execute('echo "Hello World"', {});
            return {
              passed: result.success && result.output?.includes('Hello World'),
              message: result.success ? 'Simple command executed' : 'Command failed',
            };
          } catch (error) {
            return {
              passed: false,
              message: `Execution error: ${error.message}`,
            };
          }
        },
      },
      {
        name: 'error-handling',
        description: 'Tests error handling for invalid commands',
        run: async (adapter) => {
          try {
            const result = await adapter.execute('invalid-command-xyz', {});
            return {
              passed: !result.success,
              message: result.success ? 'Should have failed' : 'Error handling working',
            };
          } catch (error) {
            return {
              passed: true,
              message: 'Error properly caught and handled',
            };
          }
        },
      },
    ],
  };
}