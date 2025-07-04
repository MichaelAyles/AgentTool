import { test, expect, devices } from '@playwright/test';

test.describe('Mobile Responsive Tests', () => {

  test('mobile layout renders correctly', async ({ page }) => {
    // Set mobile viewport manually
    await page.setViewportSize({ width: 390, height: 844 }); // iPhone 12 size
    await page.goto('/');

    // Check that main elements are visible on mobile
    await expect(page.locator('h1:has-text("🦆 DuckBridge")')).toBeVisible();
    await expect(page.locator('.tagline')).toBeVisible();
    
    // Header should be responsive
    const header = page.locator('.header');
    await expect(header).toBeVisible();
    
    // Check mobile-specific layout
    const headerContent = page.locator('.header-content');
    await expect(headerContent).toBeVisible();
  });

  test('mobile touch interactions work', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    
    // Test touch on Get Started button
    await page.locator('#show-login-btn').tap();
    
    // Check that login modal opened
    await expect(page.locator('#login-modal')).toBeVisible();
  });

  test('QR code modal is mobile-friendly', async ({ page }) => {
    await page.goto('/');
    
    // Open QR modal
    await page.locator('#qr-btn').tap();
    
    // Check modal is visible and properly sized on mobile
    const modal = page.locator('#qr-modal');
    await expect(modal).toBeVisible();
    
    // Modal should fit within viewport
    const modalBounds = await modal.boundingBox();
    const viewport = page.viewportSize();
    
    if (modalBounds && viewport) {
      expect(modalBounds.width).toBeLessThanOrEqual(viewport.width);
      expect(modalBounds.height).toBeLessThanOrEqual(viewport.height);
    }
    
    // Close modal
    await page.locator('#qr-close').tap();
    await expect(modal).not.toBeVisible();
  });

  test('mobile navigation and controls work', async ({ page }) => {
    await page.goto('/');
    
    // Test theme toggle on mobile
    await page.locator('#theme-toggle').tap();
    
    // Theme should change
    const theme = await page.locator('html').getAttribute('data-theme');
    expect(theme).toBeTruthy();
    
    // Test agent dashboard button
    await page.locator('#agent-dashboard-btn').tap();
    await expect(page.locator('#agent-dashboard')).toBeVisible();
    
    // Close dashboard
    await page.locator('#close-agent-dashboard').tap();
    await expect(page.locator('#agent-dashboard')).not.toBeVisible();
  });

  test('mobile form inputs work correctly', async ({ page }) => {
    await page.goto('/');
    
    // Test UUID input on mobile
    const uuidInput = page.locator('#uuid-input');
    await uuidInput.tap();
    await uuidInput.fill('test-uuid');
    
    const value = await uuidInput.inputValue();
    expect(value).toBe('test-uuid');
    
    // Test that virtual keyboard doesn't break layout
    await expect(page.locator('.landing-hero')).toBeVisible();
  });
});

test.describe('Tablet Responsive Tests', () => {

  test('tablet layout is properly responsive', async ({ page }) => {
    // Set tablet viewport manually
    await page.setViewportSize({ width: 1024, height: 1366 }); // iPad Pro size
    await page.goto('/');
    
    // Check layout on tablet
    await expect(page.locator('.welcome-content')).toBeVisible();
    
    // Header should adapt to tablet size
    const headerControls = page.locator('.header-controls');
    await expect(headerControls).toBeVisible();
    
    // All buttons should be accessible
    await expect(page.locator('#theme-toggle')).toBeVisible();
    await expect(page.locator('#agent-dashboard-btn')).toBeVisible();
  });

  test('tablet touch and gestures work', async ({ page }) => {
    await page.goto('/');
    
    // Test pinch-to-zoom doesn't break interface
    // (This is more of a CSS check via viewport meta tag)
    const viewportMeta = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(viewportMeta).toContain('user-scalable=no');
  });
});

test.describe('Cross-Device Functionality', () => {
  test('QR code contains correct mobile URL', async ({ page }) => {
    await page.goto('/');
    
    // Generate UUID
    await page.locator('#generate-uuid-btn').click();
    const uuid = await page.locator('#uuid-input').inputValue();
    
    // Open QR modal
    await page.locator('#qr-btn').click();
    
    // Check fallback URL contains UUID
    const fallbackText = page.locator('#qr-fallback-text');
    if (await fallbackText.isVisible()) {
      const text = await fallbackText.textContent();
      expect(text).toContain(uuid);
      expect(text).toContain('vibe.theduck.chat');
    }
  });

  test('mobile URL parameter handling', async ({ page }) => {
    // Test accessing with UUID parameter (simulating QR code scan)
    const testUuid = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    await page.goto(`/?uuid=${testUuid}`);
    
    // UUID should be pre-filled
    const uuidValue = await page.locator('#uuid-input').inputValue();
    expect(uuidValue).toBe(testUuid);
  });
});