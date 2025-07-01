#!/usr/bin/env node

import { ClaudeCodeAdapter } from './index.js';
import { AdapterTester, createBasicTestSuite, createExecutionTestSuite } from '@vibecode/adapter-sdk';

async function runTests() {
  console.log('🧪 Running Claude Code Adapter Tests...\n');

  try {
    const adapter = new ClaudeCodeAdapter();
    const tester = new AdapterTester(adapter);

    // Run basic tests
    console.log('📋 Running basic test suite...');
    const basicSuite = createBasicTestSuite();
    await tester.runTestSuite(basicSuite);

    // Run execution tests
    console.log('⚡ Running execution test suite...');
    const executionSuite = createExecutionTestSuite();
    await tester.runTestSuite(executionSuite);

    // Run all built-in tests
    console.log('🔍 Running comprehensive tests...');
    await tester.runAllTests();

    // Generate and display report
    const report = tester.generateReport();
    console.log(report);

    // Check if all tests passed
    const results = tester.getTestResults();
    const failedTests = Array.from(results.entries()).filter(([_, result]) => !result.passed);
    
    if (failedTests.length === 0) {
      console.log('✅ All tests passed!');
      process.exit(0);
    } else {
      console.log(`❌ ${failedTests.length} test(s) failed:`);
      failedTests.forEach(([name, result]) => {
        console.log(`  - ${name}: ${result.message}`);
      });
      process.exit(1);
    }

  } catch (error) {
    console.error('💥 Test runner failed:', error);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests();
}