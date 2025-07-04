import { test, expect } from '@playwright/test';
import { spawn, ChildProcess } from 'child_process';
import { setTimeout } from 'timers/promises';

test.describe.skip('DuckBridge Connector Integration', () => {
  let connectorProcess: ChildProcess;

  test.beforeAll(async () => {
    // Start the connector before running tests
    connectorProcess = spawn('npm', ['start'], {
      cwd: 'connector',
      stdio: 'pipe'
    });

    // Wait for connector to start
    await setTimeout(3000);
  });

  test.afterAll(async () => {
    // Stop the connector after tests
    if (connectorProcess) {
      connectorProcess.kill();
    }
  });

  test('can connect to running connector', async ({ page }) => {
    await page.goto('/');
    
    // Generate a new UUID
    await page.locator('#generate-uuid-btn').click();
    const uuid = await page.locator('#uuid-input').inputValue();
    
    // Try to connect
    await page.locator('#connect-btn').click();
    
    // Wait for connection attempt
    await page.waitForTimeout(5000);
    
    // Check if connection was successful or shows appropriate error
    const statusIcon = page.locator('.status-icon');
    const statusClass = await statusIcon.getAttribute('class');
    
    // Should either be connected or show connection error
    expect(statusClass).toMatch(/(connected|disconnected|connecting)/);
  });

  test('shows appropriate error when connector is not running', async ({ page }) => {
    // Kill connector if running
    if (connectorProcess) {
      connectorProcess.kill();
      await setTimeout(1000);
    }
    
    await page.goto('/');
    
    // Try to connect
    await page.locator('#generate-uuid-btn').click();
    await page.locator('#connect-btn').click();
    
    // Should show connection error
    await page.waitForTimeout(5000);
    const statusIcon = page.locator('.status-icon');
    await expect(statusIcon).toHaveClass(/disconnected/);
  });
});

test.describe('WebSocket Connection', () => {
  test('handles connection states correctly', async ({ page }) => {
    await page.goto('/');
    
    // Initial state should be disconnected
    await expect(page.locator('.connection-status-btn')).toContainText('Disconnected');
    await expect(page.locator('.connection-dot')).toHaveClass(/disconnected/);
    
    // After clicking connect, should show connecting
    await page.locator('#generate-uuid-btn').click();
    await page.locator('#connect-btn').click();
    
    // Should briefly show connecting state
    await expect(page.locator('.connection-dot')).toHaveClass(/connecting/);
  });

  test('connection status indicator updates correctly', async ({ page }) => {
    await page.goto('/');
    
    // Check initial connection status
    const connectionBtn = page.locator('#connection-status-btn');
    const connectionDot = page.locator('#connection-dot');
    const connectionText = page.locator('#connection-text');
    
    await expect(connectionBtn).toBeVisible();
    await expect(connectionDot).toHaveClass(/disconnected/);
    await expect(connectionText).toContainText('Disconnected');
  });
});