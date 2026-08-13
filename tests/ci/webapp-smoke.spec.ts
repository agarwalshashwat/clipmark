import { test, expect } from '@playwright/test';

test.describe('Webapp smoke', () => {
  test('serves robots.txt', async ({ page }) => {
    const response = await page.goto('/robots.txt');
    expect(response?.ok()).toBeTruthy();
    await expect(page.locator('body')).toContainText('User-Agent');
  });

  // /favicon.ico used to 404 on every page view: the root layout pointed its
  // `icons` metadata at /clipmark-logo.png and no favicon file existed, but
  // browsers request /favicon.ico regardless of what the document declares.
  // Nothing in the suite noticed, because a missing favicon breaks no assertion
  // on any page — hence a request-level check rather than a rendered one.
  test('serves the icon set browsers ask for unprompted', async ({ request }) => {
    for (const [path, mime] of [
      ['/favicon.ico', /image\/(x-icon|vnd\.microsoft\.icon)/],
      ['/apple-icon.png', /image\/png/],
      ['/icon-192.png', /image\/png/],
      ['/icon-512.png', /image\/png/],
    ] as const) {
      const res = await request.get(path);
      expect(res.status(), `${path} should not 404`).toBe(200);
      expect(res.headers()['content-type'], `${path} content-type`).toMatch(mime);
    }
  });

  test('serves a web manifest naming the app and its icons', async ({ request }) => {
    const res = await request.get('/manifest.webmanifest');
    expect(res.status()).toBe(200);

    const manifest = await res.json();
    expect(manifest.name).toContain('ClipMark');
    expect(manifest.icons.map((i: { sizes: string }) => i.sizes).sort()).toEqual([
      '192x192',
      '512x512',
    ]);
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

  test('a marketing route advertises a real 1200x630 social card', async ({ page }) => {
    await page.goto('/upgrade');

    const ogImage = page.locator('meta[property="og:image"]');
    await expect(ogImage).toHaveAttribute('content', /\/api\/og\?/);
    await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute(
      'content',
      '1200',
    );
    await expect(page.locator('meta[property="og:image:height"]')).toHaveAttribute(
      'content',
      '630',
    );

    // The square app icon was the old card; it must not come back as one.
    const content = await ogImage.getAttribute('content');
    expect(content).not.toContain('clipmark-logo.png');

    // And the card the URL promises must actually render. Requested by
    // path+query against baseURL, NOT by the absolute href: og:image is built
    // from NEXT_PUBLIC_APP_URL, which is the production domain here, and a test
    // must never reach out to the live site to pass.
    const { pathname, search } = new URL(content!);
    const card = await page.request.get(`${pathname}${search}`);
    expect(card.status()).toBe(200);
    expect(card.headers()['content-type']).toMatch(/image\/png/);
  });
});
