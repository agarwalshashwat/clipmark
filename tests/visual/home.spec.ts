import { test, expect } from '@playwright/test';

test.describe('Home Page Visual Regression', () => {
    test('should match the golden snapshot', async ({ page }) => {
        // Go to the home page
        await page.goto('/');

        // Wait for hero to be visible
        await expect(page.locator('h1')).toContainText('YouTube Second Brain');

        // Snapshot comparison
        await expect(page).toHaveScreenshot('home-page.png', {
            fullPage: true,
            maxDiffPixelRatio: 0.01,
        });
    });
});
