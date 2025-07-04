import { Page, expect } from '@playwright/test';

export class DuckBridgeTestHelpers {
  constructor(private page: Page) {}

  /**
   * Generate a valid UUID for testing
   */
  generateValidUUID(): string {
    return 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
  }

  /**
   * Generate an invalid UUID for testing
   */
  generateInvalidUUID(): string {
    return 'invalid-uuid-format';
  }

  /**
   * Navigate to the app and wait for it to load
   */
  async navigateToApp(): Promise<void> {
    await this.page.goto('/');
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Open the login modal
   */
  async openLoginModal(): Promise<void> {
    await this.page.locator('#show-login-btn').click();
    await expect(this.page.locator('#login-modal')).toBeVisible();
  }

  /**
   * Fill UUID input with a specific value
   */
  async fillUUID(uuid: string): Promise<void> {
    await this.page.locator('#uuid-input').fill(uuid);
  }

  /**
   * Click the generate UUID button and return the new UUID
   */
  async generateNewUUID(): Promise<string> {
    await this.page.locator('#regenerate-uuid').click();
    return await this.page.locator('#uuid-input').inputValue();
  }

  /**
   * Attempt to connect with the current UUID
   */
  async attemptConnection(): Promise<void> {
    await this.page.locator('#connect-btn').click();
  }

  /**
   * Open the QR code modal
   */
  async openQRModal(): Promise<void> {
    await this.page.locator('#qr-code-btn').click();
    await expect(this.page.locator('#qr-modal')).toBeVisible();
  }

  /**
   * Close the QR code modal
   */
  async closeQRModal(): Promise<void> {
    await this.page.locator('#qr-close').click();
    await expect(this.page.locator('#qr-modal')).not.toBeVisible();
  }

  /**
   * Toggle the theme and return the new theme
   */
  async toggleTheme(): Promise<string | null> {
    await this.page.locator('#theme-toggle').click();
    await this.page.waitForTimeout(300); // Wait for theme transition
    return await this.page.locator('html').getAttribute('data-theme');
  }

  /**
   * Open the agent dashboard
   */
  async openAgentDashboard(): Promise<void> {
    await this.page.locator('#agent-dashboard-btn').click();
    await expect(this.page.locator('#agent-dashboard-modal')).toBeVisible();
  }

  /**
   * Close the agent dashboard
   */
  async closeAgentDashboard(): Promise<void> {
    await this.page.locator('#agent-dashboard-close').click();
    await expect(this.page.locator('#agent-dashboard-modal')).not.toBeVisible();
  }

  /**
   * Wait for connection state to change
   */
  async waitForConnectionState(expectedState: 'connected' | 'connecting' | 'disconnected', timeout: number = 5000): Promise<void> {
    await this.page.waitForFunction(
      (state) => {
        const statusIcon = document.querySelector('.connection-dot');
        return statusIcon?.className.includes(state);
      },
      expectedState,
      { timeout }
    );
  }

  /**
   * Check if an element has a specific CSS class
   */
  async hasClass(selector: string, className: string): Promise<boolean> {
    const element = this.page.locator(selector);
    const classAttribute = await element.getAttribute('class');
    return classAttribute?.includes(className) || false;
  }

  /**
   * Wait for an element to appear with specific text
   */
  async waitForTextContent(selector: string, text: string, timeout: number = 5000): Promise<void> {
    await this.page.waitForFunction(
      (args) => {
        const element = document.querySelector(args.selector);
        return element?.textContent?.includes(args.text);
      },
      { selector, text },
      { timeout }
    );
  }

  /**
   * Take a screenshot with a specific name
   */
  async takeScreenshot(name: string): Promise<void> {
    await this.page.screenshot({ 
      path: `test-results/${name}.png`,
      fullPage: true 
    });
  }

  /**
   * Check if the app is in mobile layout
   */
  async isMobileLayout(): Promise<boolean> {
    const viewport = this.page.viewportSize();
    return viewport ? viewport.width < 768 : false;
  }

  /**
   * Grant clipboard permissions for copy functionality tests
   */
  async grantClipboardPermissions(): Promise<void> {
    await this.page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  }

  /**
   * Validate UUID format
   */
  isValidUUID(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  /**
   * Get current connection status
   */
  async getConnectionStatus(): Promise<string> {
    return await this.page.locator('#connection-text').textContent() || '';
  }

  /**
   * Check if main interface is visible (authenticated state)
   */
  async isMainInterfaceVisible(): Promise<boolean> {
    return await this.page.locator('#main-interface').isVisible();
  }

  /**
   * Check if landing page is visible (unauthenticated state)
   */
  async isLandingPageVisible(): Promise<boolean> {
    return await this.page.locator('#landing-page').isVisible();
  }

  /**
   * Simulate typing with realistic delays
   */
  async typeText(selector: string, text: string, delay: number = 100): Promise<void> {
    const element = this.page.locator(selector);
    await element.click();
    await element.fill(''); // Clear first
    for (const char of text) {
      await element.type(char, { delay });
    }
  }

  /**
   * Wait for specific number of elements to be visible
   */
  async waitForElementCount(selector: string, count: number, timeout: number = 5000): Promise<void> {
    await this.page.waitForFunction(
      (args) => {
        const elements = document.querySelectorAll(args.selector);
        return elements.length === args.count;
      },
      { selector, count },
      { timeout }
    );
  }

  /**
   * Check if error message is displayed
   */
  async hasErrorMessage(expectedText?: string): Promise<boolean> {
    const errorElement = this.page.locator('.error-message, .uuid-error');
    const isVisible = await errorElement.isVisible();
    
    if (!isVisible) return false;
    
    if (expectedText) {
      const text = await errorElement.textContent();
      return text?.includes(expectedText) || false;
    }
    
    return true;
  }

  /**
   * Check if success message is displayed
   */
  async hasSuccessMessage(expectedText?: string): Promise<boolean> {
    const successElement = this.page.locator('.success-message');
    const isVisible = await successElement.isVisible();
    
    if (!isVisible) return false;
    
    if (expectedText) {
      const text = await successElement.textContent();
      return text?.includes(expectedText) || false;
    }
    
    return true;
  }
}