#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const StressTest = require('./stress-test');

async function startConnector() {
  console.log('Starting DuckBridge connector for stress testing...');
  
  const connectorProcess = spawn('node', ['dist/index.js'], {
    cwd: path.join(__dirname, '../../'),
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      NODE_ENV: 'test'
    }
  });
  
  // Wait for connector to start
  await new Promise((resolve, reject) => {
    let output = '';
    
    connectorProcess.stdout.on('data', (data) => {
      output += data.toString();
      process.stdout.write(data);
      
      if (output.includes('DuckBridge Connector Started')) {
        resolve();
      }
    });
    
    connectorProcess.stderr.on('data', (data) => {
      process.stderr.write(data);
    });
    
    connectorProcess.on('error', reject);
    
    setTimeout(() => {
      reject(new Error('Connector startup timeout'));
    }, 30000);
  });
  
  return connectorProcess;
}

async function main() {
  let connectorProcess;
  
  try {
    // Start connector
    connectorProcess = await startConnector();
    
    // Wait a bit more for full initialization
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Run stress tests
    const stressTest = new StressTest(3001, 3002);
    const report = await stressTest.runAllTests();
    
    // Save report
    const fs = require('fs');
    const reportPath = path.join(__dirname, `stress-report-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\\nStress test report saved to: ${reportPath}`);
    
    // Check if tests passed
    if (report.summary.failedTests > 0 || report.summary.totalErrors > 0) {
      console.error('\\nStress tests FAILED');
      process.exit(1);
    } else {
      console.log('\\nAll stress tests PASSED');
      process.exit(0);
    }
    
  } catch (error) {
    console.error('Stress test execution failed:', error);
    process.exit(1);
  } finally {
    // Cleanup
    if (connectorProcess) {
      console.log('\\nShutting down connector...');
      connectorProcess.kill('SIGTERM');
      
      // Force kill after 5 seconds
      setTimeout(() => {
        if (!connectorProcess.killed) {
          connectorProcess.kill('SIGKILL');
        }
      }, 5000);
    }
  }
}

if (require.main === module) {
  main();
}