import { test, expect, TEST_VIDEO_URL } from '../fixtures';

test.describe('Extension smoke', () => {
  test('injects bookmark button on a YouTube watch page', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(TEST_VIDEO_URL, { waitUntil: 'domcontentloaded' });
    await page.locator('video').hover({ force: true });
    await expect(page.locator('.yt-bookmark-player-btn')).toBeAttached({ timeout: 20_000 });
  });
});
