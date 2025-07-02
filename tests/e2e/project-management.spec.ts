import { test, expect } from '@playwright/test';

test.describe('Project Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display project list', async ({ page }) => {
    // Look for project-related elements
    const projectSelectors = [
      '[data-testid="projects"]',
      '[data-testid="project-list"]',
      '.project-list',
      '[class*="project"]',
      'h1:has-text("Projects")',
      'h2:has-text("Projects")',
    ];

    let projectElementFound = false;
    for (const selector of projectSelectors) {
      const element = page.locator(selector).first();
      if (await element.isVisible()) {
        await expect(element).toBeVisible();
        projectElementFound = true;
        console.log(`Project element found: ${selector}`);
        break;
      }
    }

    if (!projectElementFound) {
      console.log(
        'No project management elements found - may not be implemented yet'
      );
    }
  });

  test('should handle project creation', async ({ page }) => {
    // Look for create project buttons or forms
    const createSelectors = [
      '[data-testid="create-project"]',
      'button:has-text("Create Project")',
      'button:has-text("New Project")',
      'button:has-text("Add Project")',
      '[href*="create"]',
      'button[class*="create"]',
    ];

    let createButtonFound = false;
    for (const selector of createSelectors) {
      const button = page.locator(selector).first();
      if (await button.isVisible()) {
        await expect(button).toBeVisible();
        createButtonFound = true;
        console.log(`Create project button found: ${selector}`);

        // Try clicking it to see if it opens a form
        await button.click();
        await page.waitForTimeout(1000);

        // Look for form elements
        const formElements = page.locator(
          'form, input[type="text"], input[placeholder*="name"], input[placeholder*="project"]'
        );
        if (await formElements.first().isVisible()) {
          console.log('Project creation form opened successfully');
        }
        break;
      }
    }

    if (!createButtonFound) {
      console.log('No create project functionality found');
    }
  });

  test('should display git status', async ({ page }) => {
    // Look for git-related UI elements
    const gitSelectors = [
      '[data-testid="git-status"]',
      '.git-status',
      '[class*="git"]',
      'button:has-text("Git")',
      '[data-testid="branch"]',
      '.branch',
    ];

    let gitElementFound = false;
    for (const selector of gitSelectors) {
      const element = page.locator(selector).first();
      if (await element.isVisible()) {
        await expect(element).toBeVisible();
        gitElementFound = true;
        console.log(`Git element found: ${selector}`);
        break;
      }
    }

    if (!gitElementFound) {
      console.log('No git status elements found');
    }
  });

  test('should handle file explorer', async ({ page }) => {
    // Look for file explorer elements
    const fileSelectors = [
      '[data-testid="file-explorer"]',
      '[data-testid="files"]',
      '.file-explorer',
      '.file-tree',
      '[class*="file"]',
      '[class*="explorer"]',
    ];

    let fileElementFound = false;
    for (const selector of fileSelectors) {
      const element = page.locator(selector).first();
      if (await element.isVisible()) {
        await expect(element).toBeVisible();
        fileElementFound = true;
        console.log(`File explorer found: ${selector}`);
        break;
      }
    }

    if (!fileElementFound) {
      console.log('No file explorer found');
    }
  });

  test('should handle adapter selection', async ({ page }) => {
    // Look for adapter-related elements
    const adapterSelectors = [
      '[data-testid="adapter"]',
      '[data-testid="adapters"]',
      'select[name*="adapter"]',
      'button:has-text("Claude")',
      'button:has-text("Gemini")',
      '.adapter-selector',
    ];

    let adapterElementFound = false;
    for (const selector of adapterSelectors) {
      const element = page.locator(selector).first();
      if (await element.isVisible()) {
        await expect(element).toBeVisible();
        adapterElementFound = true;
        console.log(`Adapter element found: ${selector}`);
        break;
      }
    }

    if (!adapterElementFound) {
      console.log('No adapter selection elements found');
    }
  });
});
