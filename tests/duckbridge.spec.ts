import { test, expect } from '@playwright/test';
import { DuckBridgeTestHelpers } from './utils/test-helpers';

test.describe('DuckBridge Application', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('has correct title', async ({ page }) => {
    await expect(page).toHaveTitle(/DuckBridge/);
  });

  test('displays main landing page elements', async ({ page }) => {
    // Check header elements
    await expect(page.locator('h1:has-text("🦆 DuckBridge")')).toBeVisible();
    await expect(page.locator('.tagline')).toBeVisible(); // Just check it exists, text changes
    
    // Check theme toggle button
    await expect(page.locator('#theme-toggle')).toBeVisible();
    
    // Check welcome screen content
    await expect(page.locator('.welcome-content h2')).toContainText('Welcome to DuckBridge');
    await expect(page.locator('.welcome-content p')).toContainText('Connect to your local development environment');
  });

  test('shows UUID input and connection interface after opening login modal', async ({ page }) => {
    // Click Get Started to open login modal
    await page.locator('#show-login-btn').click();
    
    // Login modal should be visible
    await expect(page.locator('#login-modal')).toBeVisible();
    
    // UUID input should be visible in modal
    await expect(page.locator('#uuid-input')).toBeVisible();
    
    // Connect button should be visible
    await expect(page.locator('#connect-btn')).toBeVisible();
    await expect(page.locator('#connect-btn')).toContainText('Connect');
  });

  test('generates new UUID when clicking generate button', async ({ page }) => {
    const helpers = new DuckBridgeTestHelpers(page);
    
    // Open login modal first
    await page.locator('#show-login-btn').click();
    await expect(page.locator('#login-modal')).toBeVisible();
    
    // Get initial UUID value
    const initialUuid = await page.locator('#uuid-input').inputValue();
    
    // Generate new UUID using helper (but use the correct button ID)
    await page.locator('#regenerate-uuid').click();
    const newUuid = await page.locator('#uuid-input').inputValue();
    
    // Check that UUID changed
    expect(newUuid).not.toBe(initialUuid);
    
    // Verify UUID format using helper
    expect(helpers.isValidUUID(newUuid)).toBeTruthy();
  });

  test('shows QR code modal when clicking QR button', async ({ page }) => {
    // Open login modal first
    await page.locator('#show-login-btn').click();
    await expect(page.locator('#login-modal')).toBeVisible();
    
    // Click QR code button (correct ID)
    await page.locator('#qr-code-btn').click();
    
    // Check modal is visible
    await expect(page.locator('#qr-modal')).toBeVisible();
    await expect(page.locator('#qr-modal h3')).toContainText('QR Code for Mobile Access');
    
    // Check QR code is rendered (either canvas or fallback)
    const qrContainer = page.locator('#qr-code-container');
    await expect(qrContainer).toBeVisible();
    
    // Close modal
    await page.locator('#qr-close').click();
    await expect(page.locator('#qr-modal')).not.toBeVisible();
  });

  test('theme toggle switches between light and dark mode', async ({ page }) => {
    // Check initial theme
    const initialTheme = await page.locator('html').getAttribute('data-theme');
    
    // Click theme toggle
    await page.locator('#theme-toggle').click();
    
    // Check theme changed
    const newTheme = await page.locator('html').getAttribute('data-theme');
    expect(newTheme).not.toBe(initialTheme);
    
    // Click again to toggle back
    await page.locator('#theme-toggle').click();
    const finalTheme = await page.locator('html').getAttribute('data-theme');
    expect(finalTheme).toBe(initialTheme);
  });

  test('copy buttons work correctly', async ({ page, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    
    // Open login modal first
    await page.locator('#show-login-btn').click();
    await expect(page.locator('#login-modal')).toBeVisible();
    
    // Copy UUID (correct ID)
    await page.locator('#copy-uuid').click();
    
    // Check success message appears (uses connection-error element with success styling)
    await expect(page.locator('#connection-error')).toBeVisible();
    await expect(page.locator('#connection-error')).toContainText('UUID copied to clipboard!');
  });

  test('validates UUID format', async ({ page }) => {
    // Open login modal first
    await page.locator('#show-login-btn').click();
    await expect(page.locator('#login-modal')).toBeVisible();
    
    // Enter invalid UUID
    await page.locator('#uuid-input').fill('invalid-uuid');
    
    // Try to connect
    await page.locator('#connect-btn').click();
    
    // Check error message (using correct ID selector)
    await expect(page.locator('#uuid-error')).toBeVisible();
    await expect(page.locator('#uuid-error')).toContainText('Invalid UUID format');
  });

  test('mobile responsive design', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    // Check elements are still visible and properly styled
    await expect(page.locator('h1:has-text("🦆 DuckBridge")')).toBeVisible();
    await expect(page.locator('#show-login-btn')).toBeVisible();
    
    // Check that layout is mobile-friendly
    const welcomeSection = page.locator('.welcome-content');
    await expect(welcomeSection).toBeVisible();
  });

  test('connection attempt shows connecting state', async ({ page }) => {
    // Open login modal first
    await page.locator('#show-login-btn').click();
    await expect(page.locator('#login-modal')).toBeVisible();
    
    // Enter valid UUID
    const validUuid = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    await page.locator('#uuid-input').fill(validUuid);
    
    // Click connect
    await page.locator('#connect-btn').click();
    
    // Check connecting state
    await expect(page.locator('#connect-btn')).toHaveClass(/connecting/);
    await expect(page.locator('.connection-dot')).toHaveClass(/connecting/);
    
    // Since no backend is running, it should eventually show disconnected
    await page.waitForTimeout(2000);
    await expect(page.locator('.connection-dot')).toHaveClass(/disconnected/);
  });
});

test.describe('Authenticated Interface', () => {
  test('main interface is hidden by default', async ({ page }) => {
    await page.goto('/');
    
    // Main interface should be hidden
    await expect(page.locator('#main-interface')).not.toBeVisible();
    
    // Welcome screen should be visible
    await expect(page.locator('#welcome-screen')).toBeVisible();
  });

  test('agent dashboard can be opened', async ({ page }) => {
    await page.goto('/');
    
    // Click agent dashboard button
    await page.locator('#agent-dashboard-btn').click();
    
    // Check dashboard is visible (use first modal)
    await expect(page.locator('#agent-dashboard-modal').first()).toBeVisible();
    await expect(page.locator('#agent-dashboard-modal h3').first()).toContainText('AI Agent Dashboard');
    
    // Close dashboard (use first close button)
    await page.locator('#agent-dashboard-close').first().click();
    await expect(page.locator('#agent-dashboard-modal').first()).not.toBeVisible();
  });
});