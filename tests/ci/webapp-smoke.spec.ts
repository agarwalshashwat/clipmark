import { test, expect } from '@playwright/test';

test.describe('Webapp smoke', () => {
  test('serves robots.txt', async ({ page }) => {
    const response = await page.goto('/robots.txt');
    expect(response?.ok()).toBeTruthy();
    await expect(page.locator('body')).toContainText('User-Agent');
  });

  test('an unknown URL renders the branded 404, with a 404 status', async ({ page }) => {
    // The status matters as much as the markup: a 200 here would let Google
    // index every typo'd URL as a real page ("soft 404").
    const response = await page.goto('/this-page-does-not-exist');
    expect(response?.status()).toBe(404);

    await expect(page.getByRole('heading', { level: 1 })).toContainText("couldn't find");
    // The point of the page is a way out, so assert one exists and points home.
    await expect(page.locator('main a[href="/"]').first()).toBeVisible();
    // Not Next's unstyled default, which ships no nav.
    await expect(page.locator('nav, header').first()).toBeVisible();
  });
});
