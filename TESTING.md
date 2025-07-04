# Testing with Playwright

This project uses [Playwright](https://playwright.dev/) for end-to-end testing across multiple browsers and devices.

## Setup

Playwright is already configured and ready to use. The browsers are automatically installed when you run tests.

## Running Tests

### All Tests
```bash
npm test
```

### Specific Test Categories
```bash
# Run only mobile tests
npm run test:mobile

# Run only visual regression tests
npm run test:visual

# Run only connector integration tests
npm run test:connector
```

### Interactive Mode
```bash
# Run tests with UI mode (interactive debugging)
npm run test:ui

# Run tests in headed mode (see browser)
npm run test:headed

# Debug specific tests
npm run test:debug
```

### View Reports
```bash
# View the last test report
npm run test:report
```

## Test Structure

### Test Files

- `tests/duckbridge.spec.ts` - Main application functionality tests
- `tests/mobile.spec.ts` - Mobile responsive design tests
- `tests/visual-regression.spec.ts` - Visual screenshot comparison tests
- `tests/connector.spec.ts` - Backend connector integration tests

### Test Helpers

- `tests/utils/test-helpers.ts` - Shared utility functions for tests

## Browser Coverage

Tests run automatically across:
- **Desktop**: Chrome, Firefox, Safari
- **Mobile**: Chrome (Pixel 5), Safari (iPhone 12)

## What's Tested

### Core Functionality
- Landing page and UI components
- Theme switching (light/dark mode)
- UUID generation and validation
- QR code modal functionality
- Login modal flow
- Connection status indicators

### Mobile Experience
- Responsive layout across different screen sizes
- Touch interactions
- Mobile-specific UI elements
- Cross-device QR code functionality

### Visual Regression
- Screenshot comparison across different states
- Theme variations
- Modal appearances
- Error/success states
- Responsive breakpoints

### Integration
- Frontend-backend communication
- WebSocket connection handling
- Error state management

## Configuration

The Playwright configuration is in `playwright.config.ts`:

- **Base URL**: `http://localhost:3001`
- **Test Directory**: `./tests`
- **Reporters**: HTML report with screenshots and videos on failure
- **Web Server**: Automatically starts frontend server before tests

## CI/CD

Tests automatically run on:
- Push to `main` or `working` branches
- Pull requests

Results are uploaded as artifacts:
- Test reports
- Screenshots
- Videos of failures

## Writing New Tests

### Basic Test Structure
```typescript
import { test, expect } from '@playwright/test';
import { DuckBridgeTestHelpers } from './utils/test-helpers';

test('my test', async ({ page }) => {
  const helpers = new DuckBridgeTestHelpers(page);
  
  await helpers.navigateToApp();
  await helpers.openLoginModal();
  
  // Your test logic here
  await expect(page.locator('#some-element')).toBeVisible();
});
```

### Using Test Helpers
The `DuckBridgeTestHelpers` class provides reusable methods:

```typescript
// Navigation
await helpers.navigateToApp();
await helpers.openLoginModal();

// UUID operations
const uuid = await helpers.generateNewUUID();
await helpers.fillUUID('test-uuid');

// Modal operations
await helpers.openQRModal();
await helpers.closeQRModal();

// Theme operations
const newTheme = await helpers.toggleTheme();

// Validation
const isValid = helpers.isValidUUID(uuid);
```

### Best Practices

1. **Always wait for elements**: Use `expect().toBeVisible()` rather than timeouts
2. **Use semantic selectors**: Prefer `data-testid` or meaningful IDs over CSS classes
3. **Test user flows**: Test complete workflows, not just individual components
4. **Handle async operations**: Always await async operations
5. **Clean up**: Reset state between tests when needed

## Debugging

### Debug Failed Tests
1. Check the HTML report: `npm run test:report`
2. View screenshots in `test-results/` directory
3. Watch failure videos in `test-results/`
4. Use debug mode: `npm run test:debug`

### Common Issues
- **Element not visible**: Make sure to open required modals/panels first
- **Timing issues**: Use proper waits instead of fixed timeouts
- **Mobile tests failing**: Check viewport size and touch interactions

## Coverage

Current test coverage includes:
- ✅ Landing page functionality
- ✅ Login modal flow
- ✅ UUID generation and validation
- ✅ QR code functionality
- ✅ Theme switching
- ✅ Mobile responsive design
- ✅ Connection status handling
- ✅ Error state validation

## Future Test Areas

Potential areas for additional test coverage:
- [ ] Authenticated session management
- [ ] Terminal interface functionality
- [ ] Project management features
- [ ] Real backend integration tests
- [ ] Performance testing
- [ ] Accessibility testing