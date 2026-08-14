import { test, expect } from '@playwright/test';

test.describe('Webapp smoke', () => {
  test('serves robots.txt', async ({ page }) => {
    const response = await page.goto('/robots.txt');
    expect(response?.ok()).toBeTruthy();
    await expect(page.locator('body')).toContainText('User-Agent');
  });

  // Browsers request /favicon.ico whether or not a page links one, and it 404'd
  // until the icon set was added. Only an HTTP-level check can see this: the unit
  // tests can assert the file exists on disk, not that the route serves it.
  test('serves the favicon set and the web manifest', async ({ request }) => {
    for (const path of [
      '/favicon.ico',
      '/apple-touch-icon.png',
      '/icon-192.png',
      '/icon-512.png',
      '/manifest.webmanifest',
    ]) {
      const response = await request.get(path);
      expect(response.status(), `${path} should be served`).toBe(200);
    }

    const manifest = await (await request.get('/manifest.webmanifest')).json();
    expect(manifest.icons?.length ?? 0).toBeGreaterThan(0);
  });

  test('an unmatched URL returns a real 404 on our own page', async ({ page }) => {
    const response = await page.goto('/this-route-does-not-exist');

    // A soft 404 — our page with a 200 — is worse than the default, because
    // Google indexes it and reports it as a site-wide quality problem.
    expect(response?.status()).toBe(404);

    await expect(page.locator('h1')).toContainText("This page isn't here");
    await expect(page.locator('a[href="/"]').first()).toBeVisible();
  });
});
