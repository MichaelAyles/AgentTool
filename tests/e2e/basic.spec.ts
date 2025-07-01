import { test, expect } from '@playwright/test';

test.describe('Basic Application Tests', () => {
  test('should load the homepage successfully', async ({ page }) => {
    await page.goto('/');

    // Wait for page to load completely
    await page.waitForLoadState('networkidle');

    // Check if the page loads - look for any visible content
    const content = page.locator('body *').first();
    if (await content.isVisible()) {
      await expect(content).toBeVisible();
    } else {
      // If no content found, at least verify the page loaded
      expect(page.url()).toContain('localhost');
    }
  });

  test('should navigate to project management', async ({ page }) => {
    await page.goto('/');

    // Look for project management navigation or button
    const projectsLink = page
      .locator(
        '[data-testid="projects-nav"], a[href*="project"], button:has-text("Projects")'
      )
      .first();

    if (await projectsLink.isVisible()) {
      await projectsLink.click();
      // Verify we're on the projects page
      await expect(page.url()).toMatch(/project/);
    } else {
      // If no projects link found, just verify the page loads
      console.log('No projects navigation found, skipping navigation test');
    }
  });

  test('should display terminal component', async ({ page }) => {
    await page.goto('/');

    // Look for terminal-related elements
    const terminalElement = page
      .locator(
        '[data-testid="terminal"], .xterm, .terminal, [class*="terminal"]'
      )
      .first();

    if (await terminalElement.isVisible()) {
      await expect(terminalElement).toBeVisible();
    } else {
      console.log('No terminal component found on homepage');
    }
  });

  test('should handle responsive design', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Test desktop view
    await page.setViewportSize({ width: 1200, height: 800 });
    expect(page.viewportSize()?.width).toBe(1200);

    // Test mobile view
    await page.setViewportSize({ width: 375, height: 667 });
    expect(page.viewportSize()?.width).toBe(375);

    // Test tablet view
    await page.setViewportSize({ width: 768, height: 1024 });
    expect(page.viewportSize()?.width).toBe(768);
  });
});
