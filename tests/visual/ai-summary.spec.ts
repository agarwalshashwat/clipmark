import { test, expect } from '@playwright/test';

test.describe('AI Summary Visual Test', () => {
    test('should display the AI summary mockup on the home page', async ({ page }) => {
        // Go to the home page
        await page.goto('/');

        // Find the AI summary label (Gemini Nano Insight card)
        const aiLabel = page.getByTestId('ai-summary-label');
        await expect(aiLabel).toBeVisible();
        await expect(aiLabel).toContainText('Gemini Nano Insight');

        // Snapshot of the hero mockup area that includes the AI cards
        await expect(page).toHaveScreenshot('ai-summary-mockup.png', {
            maxDiffPixelRatio: 0.1,
        });
    });

    test('should display the local AI availability benefits in the FAQ', async ({ page }) => {
        await page.goto('/');
        
        // Scroll to FAQ
        const faqSection = page.locator('#faq');
        await faqSection.scrollIntoViewIfNeeded();

        // Check for Local AI FAQ item (using data-testid for robustness)
        const localAiFaq = page.locator('div:has-text("Gemini Nano")');
        await expect(localAiFaq.first()).toBeVisible();
        
        await expect(page).toHaveScreenshot('faq-ai-section.png', {
            maxDiffPixelRatio: 0.2,
        });
    });
});
