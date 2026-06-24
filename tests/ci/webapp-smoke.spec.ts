import { test, expect } from '@playwright/test';

test.describe('Webapp smoke', () => {
  test('serves robots.txt', async ({ page }) => {
    const response = await page.goto('/robots.txt');
    expect(response?.ok()).toBeTruthy();
    await expect(page.locator('body')).toContainText('User-Agent');
  });
});
