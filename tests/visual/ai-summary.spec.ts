import { test, expect } from '@playwright/test';

test.describe('AI Summary Visual Test', () => {
    test('should display the AI summary mockup on the home page', async ({ page }) => {
        // Go to the home page
        await page.goto('/');

        // Find the AI summary label
        const aiLabel = page.getByTestId('ai-summary-label');
        await expect(aiLabel).toBeVisible();
        await expect(aiLabel).toContainText('AI auto-magically summarizes architecture');

        // Snapshot of just the hero mockup area to ensure visual integrity of AI features
        // We use a clip to focus on the mockup
        await expect(page).toHaveScreenshot('ai-summary-mockup.png', {
            clip: { x: 140, y: 500, width: 1000, height: 600 },
            maxDiffPixelRatio: 0.1, // Higher tolerance for animations
        });
    });
});
