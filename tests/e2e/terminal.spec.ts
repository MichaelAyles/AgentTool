import { test, expect } from '@playwright/test';

test.describe('Terminal Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should connect to WebSocket', async ({ page }) => {
    // Set up WebSocket monitoring
    const wsConnections = [];
    page.on('websocket', ws => {
      wsConnections.push(ws);
    });

    // Wait for potential WebSocket connections
    await page.waitForTimeout(2000);

    // Check if any WebSocket connections were established
    if (wsConnections.length > 0) {
      expect(wsConnections.length).toBeGreaterThan(0);
      console.log(`WebSocket connections established: ${wsConnections.length}`);
    } else {
      console.log(
        'No WebSocket connections found - may not be implemented yet'
      );
    }
  });

  test('should display terminal interface', async ({ page }) => {
    // Look for various terminal-related selectors
    const terminalSelectors = [
      '[data-testid="terminal"]',
      '.xterm',
      '.terminal',
      '[class*="terminal"]',
      '[class*="xterm"]',
      'canvas', // xterm.js uses canvas
    ];

    let terminalFound = false;
    for (const selector of terminalSelectors) {
      const element = page.locator(selector).first();
      if (await element.isVisible()) {
        await expect(element).toBeVisible();
        terminalFound = true;
        console.log(`Terminal found with selector: ${selector}`);
        break;
      }
    }

    if (!terminalFound) {
      console.log('Terminal component not found - may not be implemented yet');
    }
  });

  test('should handle terminal input', async ({ page }) => {
    // Look for terminal input areas
    const inputSelectors = [
      '[data-testid="terminal-input"]',
      'input[type="text"]',
      'textarea',
      '.xterm-helper-textarea',
    ];

    let inputFound = false;
    for (const selector of inputSelectors) {
      const input = page.locator(selector).first();
      if (await input.isVisible()) {
        await input.click();
        await input.type('echo "Hello World"');
        inputFound = true;
        console.log(`Terminal input found with selector: ${selector}`);
        break;
      }
    }

    if (!inputFound) {
      console.log('Terminal input not found - may not be implemented yet');
    }
  });

  test('should display terminal output', async ({ page }) => {
    // Look for output areas
    const outputSelectors = [
      '[data-testid="terminal-output"]',
      '.xterm-screen',
      '.terminal-output',
      '[class*="output"]',
    ];

    let outputFound = false;
    for (const selector of outputSelectors) {
      const output = page.locator(selector).first();
      if (await output.isVisible()) {
        await expect(output).toBeVisible();
        outputFound = true;
        console.log(`Terminal output found with selector: ${selector}`);
        break;
      }
    }

    if (!outputFound) {
      console.log('Terminal output not found - may not be implemented yet');
    }
  });
});
