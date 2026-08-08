import { test, expect } from '@playwright/test';

test.describe('Affiliate Page Visual Regression', () => {
    test('should match the golden snapshot', async ({ page }) => {
        // Go to the affiliate page
        await page.goto('/affiliate');

        // Wait for hero to be visible
        await expect(page.locator('h1')).toContainText('Share ClipMark');

        // Snapshot comparison
        await expect(page).toHaveScreenshot('affiliate-page.png', {
            fullPage: true,
            maxDiffPixelRatio: 0.01,
        });
    });
});
