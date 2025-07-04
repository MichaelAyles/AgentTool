import { test, expect } from '@playwright/test';

test.describe('Visual Regression Tests', () => {
  test('landing page visual comparison', async ({ page }) => {
    await page.goto('/');
    
    // Wait for page to fully load
    await page.waitForLoadState('networkidle');
    
    // Take screenshot of full page
    await expect(page).toHaveScreenshot('landing-page.png', {
      fullPage: true,
      threshold: 0.2,
      animations: 'disabled'
    });
  });

  test('dark theme visual comparison', async ({ page }) => {
    await page.goto('/');
    
    // Switch to dark theme
    await page.locator('#theme-toggle').click();
    await page.waitForTimeout(500); // Wait for theme transition
    
    // Take screenshot
    await expect(page).toHaveScreenshot('dark-theme.png', {
      fullPage: true,
      threshold: 0.2,
      animations: 'disabled'
    });
  });

  test('QR modal visual comparison', async ({ page }) => {
    await page.goto('/');
    
    // Open QR modal
    await page.locator('#qr-btn').click();
    await page.waitForTimeout(500);
    
    // Screenshot the modal
    await expect(page.locator('#qr-modal')).toHaveScreenshot('qr-modal.png', {
      threshold: 0.2
    });
  });

  test('agent dashboard visual comparison', async ({ page }) => {
    await page.goto('/');
    
    // Open agent dashboard
    await page.locator('#agent-dashboard-btn').click();
    await page.waitForTimeout(500);
    
    // Screenshot the dashboard
    await expect(page.locator('#agent-dashboard')).toHaveScreenshot('agent-dashboard.png', {
      threshold: 0.2
    });
  });

  test('mobile layout visual comparison', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Take mobile screenshot
    await expect(page).toHaveScreenshot('mobile-layout.png', {
      fullPage: true,
      threshold: 0.2,
      animations: 'disabled'
    });
  });

  test('connection states visual comparison', async ({ page }) => {
    await page.goto('/');
    
    // Screenshot disconnected state
    await expect(page.locator('.connection-status-indicator')).toHaveScreenshot('connection-disconnected.png');
    
    // Try to connect to trigger connecting state
    await page.locator('#generate-uuid-btn').click();
    await page.locator('#connect-btn').click();
    
    // Screenshot connecting state (might be brief)
    await page.waitForTimeout(100);
    await expect(page.locator('.connection-status-indicator')).toHaveScreenshot('connection-connecting.png');
  });

  test('form elements visual comparison', async ({ page }) => {
    await page.goto('/');
    
    // Screenshot form section
    await expect(page.locator('.uuid-section')).toHaveScreenshot('uuid-form.png', {
      threshold: 0.2
    });
    
    // Fill form and screenshot
    await page.locator('#uuid-input').fill('f47ac10b-58cc-4372-a567-0e02b2c3d479');
    await expect(page.locator('.uuid-section')).toHaveScreenshot('uuid-form-filled.png', {
      threshold: 0.2
    });
  });

  test('error states visual comparison', async ({ page }) => {
    await page.goto('/');
    
    // Trigger UUID validation error
    await page.locator('#uuid-input').fill('invalid-uuid');
    await page.locator('#connect-btn').click();
    await page.waitForTimeout(500);
    
    // Screenshot error state
    await expect(page.locator('.uuid-section')).toHaveScreenshot('uuid-error-state.png', {
      threshold: 0.2
    });
  });

  test('responsive breakpoints visual comparison', async ({ page }) => {
    const breakpoints = [
      { width: 320, height: 568, name: 'mobile-small' },
      { width: 375, height: 667, name: 'mobile-medium' },
      { width: 768, height: 1024, name: 'tablet' },
      { width: 1024, height: 768, name: 'desktop-small' },
      { width: 1440, height: 900, name: 'desktop-large' }
    ];

    for (const breakpoint of breakpoints) {
      await page.setViewportSize({ width: breakpoint.width, height: breakpoint.height });
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      
      await expect(page).toHaveScreenshot(`breakpoint-${breakpoint.name}.png`, {
        fullPage: true,
        threshold: 0.2,
        animations: 'disabled'
      });
    }
  });
});