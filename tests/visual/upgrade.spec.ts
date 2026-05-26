import { test, expect } from '@playwright/test';

test.describe('Upgrade Page Visual Regression', () => {
    test('should match the golden snapshot', async ({ page }) => {
        // Go to the upgrade page (baseURL is set in playwright.config.ts)
        await page.goto('/upgrade');

        // Wait for critical elements to be visible to ensure page is loaded
        await expect(page.locator('h1')).toContainText('Future-proof your learning');

        // Perform the snapshot comparison
        // We use fullPage: true to ensure the navigation and footer are included in alignment check
        await expect(page).toHaveScreenshot('upgrade-page.png', {
            fullPage: true,
            maxDiffPixelRatio: 0.01,
        });
    });
});
